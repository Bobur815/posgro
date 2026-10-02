import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ZERO = new Prisma.Decimal(0);

/** Off unless BANK_TURNOVER_ENABLED=true: every bank endpoint answers 404 until then. */
export const bankTurnoverEnabled = (): boolean => process.env.BANK_TURNOVER_ENABLED === 'true';

const insensitive = (value: string) => ({
  equals: value,
  mode: 'insensitive' as const,
});

export interface BankTurnover {
  enabled: true;
  periodStart: Date;
  periodEnd: Date;
  /** Paid by card — at the counter, and on nasiya debts later. */
  card: Prisma.Decimal;
  /** Paid by UzQR at the counter (and on debts, if a till ever records one). */
  uzqr: Prisma.Decimal;
  /** Receipts fiscalised with cash in the period, by fiscalisation time. */
  fiscalCash: Prisma.Decimal;
  /**
   * Click receipts fiscalised in the period. REGOS has them as cash (that is how Click is
   * fiscalised), so they count like fiscalCash — turnover and to-deposit — but are kept apart for
   * analytics. Click receipts never fiscalised count nowhere.
   */
  fiscalClick: Prisma.Decimal;
  /** card + uzqr + fiscalCash + fiscalClick: what the tax office sees as bank-side turnover. */
  bankTurnover: Prisma.Decimal;
  /** Fiscalised cash taken to the bank in the period (non-voided deposits). */
  deposited: Prisma.Decimal;
  /**
   * Cash sales in the period whose fiscal state no till has reported: a till on an older build,
   * or one that has not synced yet. Their cash is NOT in fiscalCash — said out loud rather than
   * silently under-reporting.
   */
  unreported: { count: number; amount: Prisma.Decimal };
  /** From the store's start date to now. Null until a start date is set. */
  running: {
    startDate: Date;
    fiscalCash: Prisma.Decimal;
    fiscalClick: Prisma.Decimal;
    deposited: Prisma.Decimal;
    /** fiscalCash + fiscalClick − deposited. */
    toDeposit: Prisma.Decimal;
  } | null;
  deposits: {
    id: string;
    amount: Prisma.Decimal;
    depositedAt: Date;
    note: string | null;
    createdById: string;
    voidedAt: Date | null;
  }[];
}

/**
 * What GET /reconciliation/bank answers while BANK_TURNOVER_ENABLED is off: 200, not 404. A 404
 * reads as a scanner to fail2ban's nginx-404 jail, and a dashboard left open on the page got its
 * owner's IP banned that way.
 */
export interface BankTurnoverDisabled {
  enabled: false;
}

/**
 * Bank turnover: card + UzQR + fiscalised cash, and the fiscalised cash still to be taken to the
 * bank.
 *
 * Fiscalised cash is money the tax office has on record as received, so the owner is expected to
 * deposit it. Each deposit is recorded here and subtracted; a mistaken one is voided, never
 * deleted. A credit sale counts as fiscalised cash only once it is paid off and fiscalised with
 * cash — that is when the receipt is issued — and by the time of fiscalisation, not of the sale.
 */
@Injectable()
export class BankTurnoverService {
  private readonly logger = new Logger(BankTurnoverService.name);

  constructor(private prisma: PrismaService) {}

  private assertEnabled() {
    if (!bankTurnoverEnabled()) throw new NotFoundException();
  }

  /** Σ finalAmount of receipts fiscalised with `tender` (cash or click) between the two instants. */
  private async fiscalCash(
    storeId: string,
    from: Date,
    to: Date,
    tender: 'cash' | 'click' = 'cash',
  ): Promise<Prisma.Decimal> {
    const res = await this.prisma.sale.aggregate({
      where: {
        storeId,
        fiscalStatus: 'FISCALIZED',
        AND: [
          {
            OR: [
              { fiscalTender: insensitive(tender) },
              { fiscalTender: null, paymentMethod: insensitive(tender) },
            ],
          },
          {
            OR: [
              { fiscalizedAt: { gte: from, lte: to } },
              { fiscalizedAt: null, createdAt: { gte: from, lte: to } },
            ],
          },
        ],
      },
      _sum: { finalAmount: true },
    });
    return res._sum.finalAmount ?? ZERO;
  }

  private async deposited(storeId: string, from: Date, to: Date): Promise<Prisma.Decimal> {
    const res = await this.prisma.cashBankDeposit.aggregate({
      where: { storeId, voidedAt: null, depositedAt: { gte: from, lte: to } },
      _sum: { amount: true },
    });
    return res._sum.amount ?? ZERO;
  }

  /** Counter money in one tender, plus nasiya payments taken in it. */
  private async tender(storeId: string, tender: string, from: Date, to: Date) {
    const [counter, debts] = await Promise.all([
      this.prisma.sale.aggregate({
        where: {
          storeId,
          paymentMethod: insensitive(tender),
          createdAt: { gte: from, lte: to },
        },
        // paidAmount, not finalAmount: the part of a credit sale left on the tab never reached
        // the bank at the counter. It arrives later as a debt payment, counted below.
        _sum: { paidAmount: true },
      }),
      this.prisma.debtTransaction.aggregate({
        where: {
          storeId,
          type: 'PAYMENT',
          voidedAt: null,
          paymentMethod: insensitive(tender),
          createdAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
    ]);
    // Payments are stored negative (they reduce a debt).
    return (counter._sum.paidAmount ?? ZERO).plus((debts._sum.amount ?? ZERO).negated());
  }

  async summary(
    storeId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<BankTurnover | BankTurnoverDisabled> {
    if (!bankTurnoverEnabled()) return { enabled: false };

    const [card, uzqr, fiscalCash, fiscalClick, deposited, unreported, store, deposits] = await Promise.all([
      this.tender(storeId, 'card', periodStart, periodEnd),
      this.tender(storeId, 'uzqr', periodStart, periodEnd),
      this.fiscalCash(storeId, periodStart, periodEnd),
      this.fiscalCash(storeId, periodStart, periodEnd, 'click'),
      this.deposited(storeId, periodStart, periodEnd),
      this.prisma.sale.aggregate({
        where: {
          storeId,
          fiscalStatus: null,
          paymentMethod: insensitive('cash'),
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        _count: { _all: true },
        _sum: { finalAmount: true },
      }),
      this.prisma.store.findUnique({
        where: { id: storeId },
        select: { bankCashStartDate: true },
      }),
      this.prisma.cashBankDeposit.findMany({
        where: { storeId, depositedAt: { gte: periodStart, lte: periodEnd } },
        orderBy: { depositedAt: 'desc' },
        select: {
          id: true,
          amount: true,
          depositedAt: true,
          note: true,
          createdById: true,
          voidedAt: true,
        },
      }),
    ]);

    let running: BankTurnover['running'] = null;
    if (store?.bankCashStartDate) {
      const now = new Date();
      const [cash, click, dep] = await Promise.all([
        this.fiscalCash(storeId, store.bankCashStartDate, now),
        this.fiscalCash(storeId, store.bankCashStartDate, now, 'click'),
        this.deposited(storeId, store.bankCashStartDate, now),
      ]);
      running = {
        startDate: store.bankCashStartDate,
        fiscalCash: cash,
        fiscalClick: click,
        deposited: dep,
        toDeposit: cash.plus(click).minus(dep),
      };
    }

    return {
      enabled: true,
      periodStart,
      periodEnd,
      card,
      uzqr,
      fiscalCash,
      fiscalClick,
      bankTurnover: card.plus(uzqr).plus(fiscalCash).plus(fiscalClick),
      deposited,
      unreported: {
        count: unreported._count._all,
        amount: unreported._sum.finalAmount ?? ZERO,
      },
      running,
      deposits,
    };
  }

  async createDeposit(
    storeId: string,
    userId: string,
    data: { amount: string; depositedAt?: string; note?: string },
  ) {
    this.assertEnabled();

    const amount = new Prisma.Decimal(data.amount);
    if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) {
      throw new BadRequestException('amount must be a positive sum');
    }
    const depositedAt = data.depositedAt ? new Date(data.depositedAt) : new Date();

    const deposit = await this.prisma.cashBankDeposit.create({
      data: {
        storeId,
        amount,
        depositedAt,
        note: data.note?.trim() || null,
        createdById: userId,
      },
    });
    // No AuditLog model on this server yet; the application log is the trail until one exists.
    this.logger.log(`[bank] deposit ${deposit.id} store=${storeId} amount=${amount} by=${userId}`);
    return deposit;
  }

  async voidDeposit(storeId: string, userId: string, id: string) {
    this.assertEnabled();

    const { count } = await this.prisma.cashBankDeposit.updateMany({
      where: { id, storeId, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: userId },
    });
    if (count === 0) throw new NotFoundException('Deposit not found');
    this.logger.log(`[bank] deposit ${id} voided store=${storeId} by=${userId}`);
    return { voided: true };
  }

  async setStartDate(storeId: string, userId: string, startDate: string | null) {
    this.assertEnabled();

    const date = startDate ? new Date(startDate) : null;
    if (date && Number.isNaN(date.getTime())) throw new BadRequestException('startDate');
    await this.prisma.store.update({
      where: { id: storeId },
      data: { bankCashStartDate: date },
    });
    this.logger.log(
      `[bank] start date ${date?.toISOString() ?? 'cleared'} store=${storeId} by=${userId}`,
    );
    return { startDate: date };
  }
}
