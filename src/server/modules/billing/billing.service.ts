import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteConfigService } from '../site-config/site-config.service';
import { BalanceService, isDuplicateCharge } from './balance.service';
import {
  BILLED_PLANS,
  monthlyFee,
  renewedExpiry,
  storeSubscriptionFacts,
  subscriptionStatus,
} from '../../../shared/utils/subscription';

/** What `bill()` did to a store. */
export type BillOutcome =
  /** Not billed, or its period has not ended yet. */
  | 'not-due'
  /** The job does not bill a store already cut off — its next top-up does. */
  | 'skipped-blocked'
  | 'charged-renewed'
  /** Charged, and the balance went negative: grace runs, then the block. */
  | 'charged-in-debt'
  /** Charged earlier, and now covered by a top-up. */
  | 'renewed'
  /** Charged earlier, still not covered. */
  | 'in-debt';

const BILLING_FIELDS = {
  subscriptionPlan: true,
  subscriptionExpiresAt: true,
  subscriptionGraceFrom: true,
  subscriptionRequired: true,
  extraTerminals: true,
  balance: true,
} as const;

/**
 * Subscriptions paid from the store balance. At a STARTER or PRO store's expiry date its monthly
 * fee (`monthlyFee`) is taken from the balance, even into the negative:
 *
 * - still ≥ 0 after it → the plan renews for a month at once;
 * - negative → the expiry date stays, so the usual grace days run and then the block. A top-up
 *   that brings the balance back to ≥ 0 renews the month (`renewedExpiry`) and lifts it.
 *
 * Each period is charged once: its ledger row is keyed on (store, SUBSCRIPTION, period start), so
 * an overlapping run or a second server cannot charge it twice. A store in debt is not charged for
 * later months either — its expiry does not move until it pays.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly siteConfig: SiteConfigService,
    private readonly balance: BalanceService,
  ) {}

  @Cron('*/15 * * * *', { name: 'subscription-billing' })
  async run(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.store.findMany({
        where: {
          subscriptionPlan: { in: [...BILLED_PLANS] },
          subscriptionExpiresAt: { lte: now },
          scheduledDeleteAt: null,
        },
        select: { id: true },
      });
      for (const { id } of due) {
        try {
          const outcome = await this.bill(id, 'job', now);
          if (outcome.startsWith('charged') || outcome === 'renewed') {
            this.logger.log(`store ${id}: ${outcome}`);
          }
        } catch (e) {
          this.logger.error(`billing store ${id} failed: ${(e as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Bill one store as it stands at `now`: charge its ended period if that is not done yet, and
   * renew it if the balance covers it. A `topup` also bills a store the job left alone because it
   * was already blocked.
   */
  async bill(
    storeId: string,
    trigger: 'job' | 'topup',
    now: Date = new Date(),
  ): Promise<BillOutcome> {
    const [store, rules, prices] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId }, select: BILLING_FIELDS }),
      this.siteConfig.getSubscriptionRules(),
      this.siteConfig.getSubscriptionPlans(),
    ]);
    if (!store?.subscriptionExpiresAt) return 'not-due';
    const fee = monthlyFee(store.subscriptionPlan, store.extraTerminals, prices);
    const periodStart = store.subscriptionExpiresAt;
    if (fee === null || periodStart.getTime() > now.getTime()) return 'not-due';

    const { state } = subscriptionStatus(storeSubscriptionFacts(store), rules, now);
    const charged = await this.isCharged(storeId, periodStart);

    let balance = Number(store.balance);
    let chargedNow = false;
    if (!charged) {
      // A store the job finds already blocked is not billed for a month it cannot use; paying is
      // what brings it back, and the top-up bills it then.
      if (state === 'blocked' && trigger === 'job') return 'skipped-blocked';
      try {
        balance = await this.balance.apply(storeId, {
          type: 'SUBSCRIPTION',
          amount: -fee,
          periodStart,
          note: store.extraTerminals
            ? `${store.subscriptionPlan} + ${store.extraTerminals} extra terminal(s)`
            : store.subscriptionPlan,
        });
        chargedNow = true;
      } catch (e) {
        if (!isDuplicateCharge(e)) throw e;
        // Charged meanwhile by another run: go on with the balance it left.
        const fresh = await this.prisma.store.findUnique({
          where: { id: storeId },
          select: { balance: true },
        });
        balance = Number(fresh?.balance ?? 0);
      }
    }

    if (balance < 0) return chargedNow ? 'charged-in-debt' : 'in-debt';

    // Covered: the next period. Conditional on the expiry still being the one just paid for, so
    // two runs that both got here renew it once.
    const { count } = await this.prisma.store.updateMany({
      where: { id: storeId, subscriptionExpiresAt: periodStart },
      data: {
        subscriptionExpiresAt: renewedExpiry(periodStart, state, now),
        subscriptionGraceFrom: null,
      },
    });
    if (count === 0) return 'not-due';
    return chargedNow ? 'charged-renewed' : 'renewed';
  }

  /** The next charge for a store — when, how much, and what it owes — or null if not billed. */
  async nextCharge(storeId: string, now: Date = new Date()) {
    const [store, prices] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId }, select: BILLING_FIELDS }),
      this.siteConfig.getSubscriptionPlans(),
    ]);
    if (!store?.subscriptionExpiresAt) return null;
    const fee = monthlyFee(store.subscriptionPlan, store.extraTerminals, prices);
    if (fee === null) return null;
    const periodStart = store.subscriptionExpiresAt;
    const balance = Number(store.balance);
    const charged =
      periodStart.getTime() <= now.getTime() && (await this.isCharged(storeId, periodStart));
    return {
      at: periodStart.toISOString(),
      amountUzs: fee,
      // Charged and not covered: what the store has to pay before the month renews.
      owedUzs: charged && balance < 0 ? -balance : 0,
      balanceUzs: balance,
    };
  }

  private async isCharged(storeId: string, periodStart: Date): Promise<boolean> {
    const row = await this.prisma.balanceTransaction.findUnique({
      where: { storeId_type_periodStart: { storeId, type: 'SUBSCRIPTION', periodStart } },
      select: { id: true },
    });
    return !!row;
  }
}
