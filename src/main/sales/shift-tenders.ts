import { getPrismaClient } from '../database/sqlite-client';

/** One tender's share of a shift: receipts, money taken (paid_amount, net of change), discounts. */
export interface ShiftTenderRow {
  payment_method: string;
  cnt: number;
  total: number;
  discounts: number;
}

/**
 * A shift's money by tender, with split-payment receipts broken into their lines.
 *
 * Ordinary sales group by `payment_method` exactly as before. A 'mixed' sale contributes its
 * sale_payments rows instead — its cash line to cash, its card line to card — so the drawer sees
 * only the cash part. Its discount still counts once, on a 'mixed' row with no money. A split
 * receipt is counted once in each tender it used.
 *
 * Shared by computeSmenaStats (the X/Z screen and printout) and smena-sync (what the server
 * gets), which must never disagree about the drawer.
 */
export async function shiftTenderRows(smenaId: string): Promise<ShiftTenderRow[]> {
  const rows = (await getPrismaClient().$queryRawUnsafe(
    // SUM(paid_amount), not final_amount: a nasiya sale hands the goods over now and collects the
    // money later, so only the part paid at the counter belongs in a drawer figure.
    `SELECT payment_method,
            COUNT(*) as cnt,
            COALESCE(SUM(paid_amount), 0) as total,
            COALESCE(SUM(discount_amount), 0) as discounts
     FROM sales
     WHERE smena_id = ? AND payment_method <> 'mixed'
     GROUP BY payment_method
     UNION ALL
     SELECT sp.method as payment_method,
            COUNT(DISTINCT s.id) as cnt,
            COALESCE(SUM(sp.amount), 0) as total,
            0 as discounts
     FROM sale_payments sp
     JOIN sales s ON s.id = sp.sale_id
     WHERE s.smena_id = ? AND s.payment_method = 'mixed'
     GROUP BY sp.method
     UNION ALL
     SELECT 'mixed' as payment_method,
            0 as cnt,
            0 as total,
            COALESCE(SUM(discount_amount), 0) as discounts
     FROM sales
     WHERE smena_id = ? AND payment_method = 'mixed'`,
    smenaId,
    smenaId,
    smenaId,
  )) as ShiftTenderRow[];
  return rows.map((r) => ({
    payment_method: r.payment_method,
    cnt: Number(r.cnt),
    total: Number(r.total),
    discounts: Number(r.discounts),
  }));
}
