import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MovementSource,
  StockMovementService,
  type MovementInput,
} from '../stock-movement/stock-movement.service';
import { CreateWriteOffDto, WriteOffReason } from './dto/create-write-off.dto';
import { planWriteOff, refusalMessage } from './write-off.plan';

/** Subset of the authenticated user this module needs. `request.user` has no `name` — only nameRu/nameUz. */
type AuthUser = { id: string; nameRu: string };

export interface ListWriteOffFilters {
  search?: string;
  reason?: WriteOffReason;
  page?: number;
  limit?: number;
}

/**
 * The ledger types reserved for these. "Other" has no type of its own; it is a manual adjustment
 * with the reason recorded, so reconciliation still counts it (it sums every type).
 */
const MOVEMENT_TYPE: Record<WriteOffReason, StockMovementType> = {
  EXPIRY: 'WRITE_OFF_EXPIRY',
  DAMAGE: 'WRITE_OFF_DAMAGE',
  OTHER: 'MANUAL_ADJUSTMENT',
};

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Thrown inside the transaction when stock moved under us; turned into a 400 outside it. */
class StockChangedError extends Error {
  constructor(readonly product: string) {
    super(`Stock of "${product}" changed while writing off — check the quantity and try again`);
  }
}

@Injectable()
export class WriteOffsService {
  constructor(
    private prisma: PrismaService,
    private stockMovements: StockMovementService,
  ) {}

  /**
   * Post a write-off: the document, its lines and the stock decrement in one transaction.
   *
   * Idempotent on the client's id — a double click or a retried request returns the document
   * already written instead of taking the goods out twice.
   */
  async create(storeId: string, dto: CreateWriteOffDto, user: AuthUser) {
    if (dto.id) {
      const existing = await this.prisma.writeOff.findUnique({
        where: { id: dto.id },
        select: { storeId: true },
      });
      if (existing) {
        if (existing.storeId !== storeId) throw new ConflictException('Write-off id already used');
        return this.findOne(storeId, dto.id);
      }
    }

    const products = await this.prisma.product.findMany({
      where: { storeId, id: { in: dto.items.map((i) => i.productId) } },
      select: {
        id: true,
        nameRu: true,
        nameUz: true,
        barcode: true,
        unit: true,
        stock: true,
        cost: true,
      },
    });
    const plan = planWriteOff(dto, products);
    if (!plan.ok) {
      throw new BadRequestException({ message: refusalMessage(plan.error), ...plan.error });
    }

    // The number is max + 1, and the (store, number) unique index is what settles a race between
    // two admins posting at once: the loser retries with the next number.
    for (let attempt = 0; ; attempt++) {
      try {
        const id = await this.write(storeId, dto, user, plan);
        return this.findOne(storeId, id);
      } catch (e) {
        if (e instanceof StockChangedError) throw new BadRequestException(e.message);
        // A unique violation on the id itself is a concurrent retry of the same request.
        if (isUniqueViolation(e) && dto.id) {
          const existing = await this.prisma.writeOff.findUnique({ where: { id: dto.id } });
          if (existing?.storeId === storeId) return this.findOne(storeId, dto.id);
        }
        if (isUniqueViolation(e) && attempt < 3) continue;
        throw e;
      }
    }
  }

  private async write(
    storeId: string,
    dto: CreateWriteOffDto,
    user: AuthUser,
    plan: Extract<ReturnType<typeof planWriteOff>, { ok: true }>,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const agg = await tx.writeOff.aggregate({ where: { storeId }, _max: { number: true } });
      const occurredAt = new Date();

      const doc = await tx.writeOff.create({
        data: {
          ...(dto.id ? { id: dto.id } : {}),
          storeId,
          number: (agg._max.number ?? 0) + 1,
          reason: dto.reason,
          note: plan.note,
          createdById: user.id,
          createdByName: user.nameRu,
          totalItems: plan.lines.length,
          totalValue: plan.totalValue,
          createdAt: occurredAt,
          items: {
            create: plan.lines.map((l) => ({
              productId: l.productId,
              productName: l.productName,
              productNameUz: l.productNameUz,
              barcode: l.barcode,
              unit: l.unit,
              quantity: l.quantity,
              cost: l.cost,
            })),
          },
        },
        select: { id: true },
      });

      // Conditional decrement: the plan checked stock before the transaction, and a sale may have
      // landed since. Refusing here keeps the rule "never below zero" true at commit time.
      for (const l of plan.lines) {
        const moved = await tx.product.updateMany({
          where: { id: l.productId, storeId, stock: { gte: l.quantity } },
          data: { stock: { decrement: l.quantity } },
        });
        if (moved.count === 0) throw new StockChangedError(l.productName);
      }

      if (this.stockMovements.enabled) {
        const priceById = new Map(
          (
            await tx.product.findMany({
              where: { id: { in: plan.lines.map((l) => l.productId) } },
              select: { id: true, price: true },
            })
          ).map((p) => [p.id, p.price]),
        );
        await this.stockMovements.emit(
          tx,
          plan.lines.map<MovementInput>((l) => ({
            storeId,
            productId: l.productId,
            type: MOVEMENT_TYPE[dto.reason],
            quantity: l.quantity.negated(),
            unitCost: l.cost,
            unitPrice: priceById.get(l.productId) ?? null,
            sourceType: MovementSource.WRITE_OFF,
            sourceId: doc.id,
            reasonCode: dto.reason,
            note: plan.note,
            actorId: user.id,
            actorName: user.nameRu,
            occurredAt,
          })),
        );
      }

      return doc.id;
    });
  }

  async findAll(storeId: string, filters: ListWriteOffFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));

    const where: Prisma.WriteOffWhereInput = { storeId };
    if (filters.reason) where.reason = filters.reason;
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      const asNumber = Number(search);
      where.OR = [
        { note: { contains: search, mode: 'insensitive' } },
        { createdByName: { contains: search, mode: 'insensitive' } },
        ...(Number.isInteger(asNumber) ? [{ number: asNumber }] : []),
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.writeOff.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          number: true,
          reason: true,
          note: true,
          createdByName: true,
          createdAt: true,
          totalItems: true,
          totalValue: true,
        },
      }),
      this.prisma.writeOff.count({ where }),
    ]);

    return { rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async findOne(storeId: string, id: string) {
    const doc = await this.prisma.writeOff.findUnique({
      where: { id },
      include: { items: { orderBy: { productName: 'asc' } } },
    });
    if (!doc || doc.storeId !== storeId) throw new NotFoundException('Write-off not found');
    return doc;
  }
}
