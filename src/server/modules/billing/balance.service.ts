import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type BalanceTransactionType = 'TOPUP' | 'SUBSCRIPTION' | 'AI_SCAN' | 'ADJUSTMENT';

export interface BalanceMovement {
  type: BalanceTransactionType;
  /** Signed, in UZS: positive in, negative out. */
  amount: number;
  /** SUBSCRIPTION only: the start of the period paid for — what makes each charged once. */
  periodStart?: Date | null;
  note?: string | null;
  createdById?: string | null;
}

/** The ledger row that would have repeated a period already charged. */
export function isDuplicateCharge(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/**
 * The one way `Store.balance` changes. Each movement is written with its ledger row in a single
 * transaction, so the balance and its history cannot disagree — and a subscription period that
 * was already charged throws (P2002, `isDuplicateCharge`) with the balance untouched.
 */
@Injectable()
export class BalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Apply `movement` inside a transaction the caller already holds. Returns the new balance. */
  async applyIn(
    tx: Prisma.TransactionClient,
    storeId: string,
    movement: BalanceMovement,
  ): Promise<number> {
    const { balance } = await tx.store.update({
      where: { id: storeId },
      data: { balance: { increment: movement.amount } },
      select: { balance: true },
    });
    await tx.balanceTransaction.create({
      data: {
        storeId,
        type: movement.type,
        amount: movement.amount,
        balanceAfter: balance,
        periodStart: movement.periodStart ?? null,
        note: movement.note ?? null,
        createdById: movement.createdById ?? null,
      },
    });
    return Number(balance);
  }

  apply(storeId: string, movement: BalanceMovement): Promise<number> {
    return this.prisma.$transaction((tx) => this.applyIn(tx, storeId, movement));
  }

  /** A store's ledger, latest first. */
  async history(storeId: string, take = 100) {
    const rows = await this.prisma.balanceTransaction.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, take), 500),
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: Number(r.amount),
      balanceAfter: Number(r.balanceAfter),
      periodStart: r.periodStart?.toISOString() ?? null,
      note: r.note,
      createdById: r.createdById,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
