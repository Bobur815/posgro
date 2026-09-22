import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteConfigService } from '../site-config/site-config.service';
import {
  storeSubscriptionFacts,
  subscriptionStatus,
  terminalAllowance,
} from '../../../shared/utils/subscription';
import { LicensesService, terminalClaim } from '../licenses/licenses.service';
import { BillingService } from '../billing/billing.service';
import { AllowWhenBlocked } from '../../common/decorators/allow-when-blocked.decorator';

const SUBSCRIPTION_FIELDS = {
  subscriptionPlan: true,
  subscriptionExpiresAt: true,
  subscriptionGraceFrom: true,
  subscriptionRequired: true,
  extraTerminals: true,
} as const;

const AI_TOKEN_LIMIT_FREE = 5;
const AI_TOKEN_LIMIT_PAID = 100;

@ApiTags('store-config')
@Controller('store-config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
// A blocked till still reads these: they carry the license that says it is blocked, and the one
// that says it has been paid for.
@AllowWhenBlocked()
export class StoreConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteConfig: SiteConfigService,
    private readonly licenses: LicensesService,
    private readonly billing: BillingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get server-controlled config for the current store' })
  async getConfig(
    @CurrentStore() storeId: string,
    // The till asking, and a main's satellites (comma-separated): registered for a terminal slot,
    // so the license says whether they hold one. A till from before terminal limits sends neither.
    @Query('terminal_id') terminalId?: string,
    @Query('satellites') satellites?: string,
  ) {
    const [store, license] = await Promise.all([
      storeId
        ? this.prisma.store.findUnique({
            where: { id: storeId },
            select: {
              aiPlan: true,
              mode: true,
              posAdminLocked: true,
              superAdminPassword: true,
              ...SUBSCRIPTION_FIELDS,
            },
          })
        : null,
      storeId ? this.licenses.issue(storeId, terminalClaim(terminalId, satellites)) : null,
    ]);

    return {
      // The store's signed license (shared/utils/license.ts), refreshed on every sync. Null when
      // the server has no signing key, or for a caller with no store.
      license: store ? license : null,
      ai_token_limit_daily: store?.aiPlan === 'paid' ? AI_TOKEN_LIMIT_PAID : AI_TOKEN_LIMIT_FREE,
      // Terminal operating mode. A terminal that can't resolve its store must keep behaving as it
      // does today, so an unknown store yields ONLINE + unlocked rather than a restricted terminal.
      mode: store?.mode ?? 'ONLINE',
      pos_admin_locked: store?.posAdminLocked ?? false,
      // The manager-override password, bcrypt hashed. This is the ONE endpoint that returns it,
      // and it is scoped by the caller's own JWT — `/stores/:id` deliberately does not, because a
      // store's own ADMIN can read that one and could crack their own override offline.
      // The terminal caches it and compares locally, which is what makes the gate work offline.
      // null = no override configured, and the terminal gates nothing.
      super_admin_password_hash: store?.superAdminPassword ?? null,
    };
  }

  /**
   * Subscription status for the terminal's own store, plus how to pay for it.
   *
   * The POS shows this on its (unauthenticated) login screen using the VPS token it keeps from
   * the last password login, so this deliberately exposes nothing beyond the store's own billing
   * state. The payment block is operator-wide config, not per-store — only the `{storeId}`
   * placeholder in the pay link is filled in here, so the payment provider knows who is paying.
   */
  @Get('subscription')
  @ApiOperation({ summary: 'Get subscription status and payment details for the current store' })
  async getSubscription(
    @CurrentStore() storeId: string,
    @Query('terminal_id') terminalId?: string,
    @Query('satellites') satellites?: string,
  ) {
    const [store, payment, rules, planTerminals, prices] = await Promise.all([
      storeId
        ? this.prisma.store.findUnique({
            where: { id: storeId },
            select: {
              name: true,
              aiPlan: true,
              balance: true,
              ...SUBSCRIPTION_FIELDS,
            },
          })
        : null,
      this.siteConfig.getSubscriptionPayment(),
      this.siteConfig.getSubscriptionRules(),
      this.siteConfig.getPlanTerminals(),
      this.siteConfig.getSubscriptionPlans(),
    ]);
    const status = store ? subscriptionStatus(storeSubscriptionFacts(store), rules) : null;
    // Issued before counting, so the till asking is among the terminals counted.
    const license = store ? await this.licenses.issue(storeId, terminalClaim(terminalId, satellites)) : null;
    const used = store ? await this.prisma.storeTerminal.count({ where: { storeId } }) : 0;
    const nextCharge = store ? await this.billing.nextCharge(storeId) : null;

    return {
      store_id: storeId ?? null,
      store_name: store?.name ?? null,
      subscription_plan: store?.subscriptionPlan ?? null,
      subscription_expires_at: store?.subscriptionExpiresAt?.toISOString() ?? null,
      // Where it stands, judged by this server's clock (shared/utils/subscription.ts). A caller
      // with no store — a super admin — has nothing to pay for.
      subscription_state: status?.state ?? 'unlimited',
      warn_from: status?.warnFrom ?? null,
      block_at: status?.blockAt ?? null,
      days_left: status?.daysLeft ?? null,
      // The same license GET /store-config carries — "Check payment" on the till reads it here.
      license,
      // Terminals: how many the store may run (null: no limit) and how many have registered. Used
      // above allowed means the newest are refused until a slot is freed or bought.
      terminals: {
        allowed: store
          ? terminalAllowance(store.subscriptionPlan, store.extraTerminals, planTerminals)
          : null,
        used,
        included: store?.subscriptionPlan
          ? terminalAllowance(store.subscriptionPlan, 0, planTerminals)
          : null,
        extra: store?.extraTerminals ?? 0,
        extra_price_uzs: prices.extraTerminal,
      },
      // The subscription is paid from the balance: when the next month is charged, how much, and
      // what is owed if the last charge left it negative. Null for a plan that is not billed.
      next_charge: nextCharge
        ? { at: nextCharge.at, amount_uzs: nextCharge.amountUzs, owed_uzs: nextCharge.owedUzs }
        : null,
      ai_plan: store?.aiPlan ?? 'free',
      balance_uzs: store ? Number(store.balance) : null,
      payment: {
        qr_payload: payment.qrPayload,
        payment_url: payment.paymentUrl.replace('{storeId}', storeId ?? ''),
        support_phone: payment.supportPhone,
      },
    };
  }
}
