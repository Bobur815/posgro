import type { Prisma, PrismaClient } from '../../generated/prisma-sqlite';
import { getPrismaClient } from '../database/sqlite-client';
import {
  planWriteOff,
  refusalMessage,
  WRITE_OFF_REASONS,
  type WriteOffReason,
  type WriteOffRefusal,
} from './write-off-plan';

/**
 * Write-offs on the till — the OFFLINE_ONLY store's copy of `WriteOffsService` on the server.
 *
 * One module, two callers: the POS page (IPC, `ipc/write-offs-handlers.ts`) and the dashboard the
 * terminal serves on the shop LAN (`local-server/routes/write-offs.ts`). Both get the same rules and
 * the same numbering, so a write-off made on either shows up on the other.
 *
 * Only an OFFLINE_ONLY main terminal writes off here. An ONLINE store writes off on the server —
 * a write-off made on its till would be overwritten by the next product pull and never reach the
 * server — and a satellite's stock lives on its main.
 */

const db = (): PrismaClient => getPrismaClient() as PrismaClient;

export interface WriteOffInput {
  /** Client-generated; a retry with the same id returns the document already written. */
  id?: string;
  reason: WriteOffReason;
  note?: string | null;
  items: { productId: number; quantity: number }[];
}

export interface WriteOffActor {
  id: string;
}

/** Refusals carry an HTTP-like status so the route can answer with it; IPC passes them through. */
export type WriteOffResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 403 | 404; message: string; refusal?: WriteOffRefusal };

/** A write-off with its lines, as the detail page and the create call return it. */
export type WriteOffDoc = Prisma.WriteOffGetPayload<{ include: { items: true } }>;

const SUMMARY = {
  id: true,
  number: true,
  reason: true,
  note: true,
  createdByName: true,
  createdAt: true,
  totalItems: true,
  totalValue: true,
} as const;

/** Thrown inside the transaction when a sale took stock below a line after the plan was made. */
class StockChangedError extends Error {}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';

/** Why this terminal may not write off, or null when it may. */
async function refuseHere(): Promise<string | null> {
  const config = (await db().localConfig.findUnique({ where: { id: 'config' } })) as {
    mode?: string | null;
    isMain?: boolean | null;
  } | null;
  if (config?.isMain === false) return 'Write-offs are made on the main terminal';
  if (config?.mode !== 'OFFLINE_ONLY') return 'This store writes off on the web dashboard';
  return null;
}

/** Shape a request body (dashboard JSON or IPC argument) into a typed input, or say what is wrong. */
export function parseWriteOffInput(body: unknown): WriteOffInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!WRITE_OFF_REASONS.includes(b.reason as WriteOffReason)) return 'Invalid reason';
  if (b.note != null && (typeof b.note !== 'string' || b.note.length > 500)) return 'Invalid note';
  if (b.id != null && (typeof b.id !== 'string' || b.id.length === 0 || b.id.length > 40))
    return 'Invalid id';
  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 500)
    return 'items must list 1–500 lines';
  const items: WriteOffInput['items'] = [];
  for (const raw of b.items as Record<string, unknown>[]) {
    const productId = Number(raw?.productId);
    const quantity = Number(raw?.quantity);
    if (!Number.isInteger(productId) || !Number.isFinite(quantity)) return 'Invalid line';
    items.push({ productId, quantity });
  }
  return {
    id: (b.id as string | undefined) ?? undefined,
    reason: b.reason as WriteOffReason,
    note: (b.note as string | null | undefined) ?? null,
    items,
  };
}

export async function createWriteOff(
  input: WriteOffInput,
  actor: WriteOffActor,
): Promise<WriteOffResult<WriteOffDoc>> {
  const refused = await refuseHere();
  if (refused) return { ok: false, status: 403, message: refused };

  if (input.id && (await db().writeOff.findUnique({ where: { id: input.id } }))) {
    return getWriteOff(input.id);
  }

  const products = await db().product.findMany({
    where: { id: { in: input.items.map((i) => i.productId) } },
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
  const plan = planWriteOff(input, products);
  if (!plan.ok) {
    return {
      ok: false,
      status: 400,
      message: refusalMessage(plan.error),
      refusal: plan.error,
    };
  }

  const author = await db().user.findUnique({ where: { id: actor.id } });
  const createdByName = author?.nameRu || author?.nameUz || author?.phone || 'Unknown';

  for (let attempt = 0; ; attempt++) {
    try {
      const id = await db().$transaction(async (tx) => {
        const last = await tx.writeOff.findFirst({
          orderBy: { number: 'desc' },
          select: { number: true },
        });
        const doc = await tx.writeOff.create({
          data: {
            ...(input.id ? { id: input.id } : {}),
            number: (last?.number ?? 0) + 1,
            reason: input.reason,
            note: plan.note,
            createdById: actor.id,
            createdByName,
            totalItems: plan.lines.length,
            totalValue: plan.totalValue.toString(),
            items: {
              create: plan.lines.map((l) => ({
                productId: l.productId,
                productName: l.productName,
                productNameUz: l.productNameUz,
                barcode: l.barcode,
                unit: l.unit,
                quantity: l.quantity.toString(),
                cost: l.cost?.toString() ?? null,
              })),
            },
          },
          select: { id: true },
        });
        // Conditional, like the server: a sale since the plan may have left less than the line.
        for (const l of plan.lines) {
          const moved = await tx.product.updateMany({
            where: { id: l.productId, stock: { gte: l.quantity.toString() } },
            data: { stock: { decrement: l.quantity.toString() } },
          });
          if (moved.count === 0) throw new StockChangedError(l.productName);
        }
        return doc.id;
      });
      return getWriteOff(id);
    } catch (e) {
      if (e instanceof StockChangedError) {
        return {
          ok: false,
          status: 400,
          message: `Stock of "${e.message}" changed while writing off — check the quantity and try again`,
        };
      }
      if (
        isUniqueViolation(e) &&
        input.id &&
        (await db().writeOff.findUnique({ where: { id: input.id } }))
      ) {
        return getWriteOff(input.id);
      }
      if (isUniqueViolation(e) && attempt < 3) continue; // two writers took the same number
      throw e;
    }
  }
}

export async function listWriteOffs(filters: {
  search?: string;
  reason?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const search = filters.search?.trim();
  const asNumber = search ? Number(search) : NaN;
  const where = {
    ...(WRITE_OFF_REASONS.includes(filters.reason as WriteOffReason)
      ? { reason: filters.reason }
      : {}),
    ...(search
      ? {
          OR: [
            { note: { contains: search } },
            { createdByName: { contains: search } },
            ...(Number.isInteger(asNumber) ? [{ number: asNumber }] : []),
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db().writeOff.findMany({
      where,
      select: SUMMARY,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db().writeOff.count({ where }),
  ]);
  return { rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getWriteOff(id: string): Promise<WriteOffResult<WriteOffDoc>> {
  const doc = await db().writeOff.findUnique({
    where: { id },
    include: { items: { orderBy: { productName: 'asc' } } },
  });
  if (!doc) return { ok: false, status: 404, message: 'Write-off not found' };
  return { ok: true, value: doc };
}
