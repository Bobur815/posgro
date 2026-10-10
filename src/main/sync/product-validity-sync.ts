import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { getServerToken } from './queue-manager';
import { endpointKnownMissing, noteEndpointStatus } from './missing-endpoints';

/**
 * Tell the server what REGOS:VCR said about products on this till: a rejected receipt line
 * (Product.isValid = false) or a fiscalised receipt (true again).
 *
 * The fiscal service marks the product here at once and queues a row in `product_invalid_reports`
 * (product-validity.ts); this sends the queue. The server keeps the newest report per product and
 * every till pulls it with the products.
 *
 * A server from before POST /products/validity (404) still takes the rejections through the
 * older POST /products/invalid; the "valid" rows wait until it has the new endpoint.
 */

const BATCH = 200;

interface ReportRow {
  id: string;
  barcode: string;
  invalidated_at: string | Date;
  error_code: number | null;
  valid: number | bigint | boolean;
}

const isValidRow = (r: ReportRow): boolean => Number(r.valid) === 1 || r.valid === true;

async function post(path: string, token: string, items: unknown[]): Promise<Response> {
  return fetch(`${getAppConfig().vpsApiUrl}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items }),
  });
}

/** Sends `rows` to `path`; returns false on a 404 so the caller can fall back. */
async function send(
  path: 'products/validity' | 'products/invalid',
  token: string,
  rows: ReportRow[],
): Promise<boolean> {
  const items = rows.map((r) => ({
    barcode: r.barcode,
    at: new Date(r.invalidated_at).toISOString(),
    ...(path === 'products/validity' ? { valid: isValidRow(r) } : {}),
    ...(r.error_code != null ? { code: Number(r.error_code) } : {}),
  }));
  const res = await post(path, token, items);
  noteEndpointStatus(path, res.status);
  if (res.status === 404) return false;
  if (!res.ok) {
    console.error(`[product-validity] upload to ${path} failed (HTTP ${res.status})`);
    return true;
  }

  const { done = [] } = (await res.json().catch(() => ({}))) as { done?: string[] };
  const sentAt = new Date().toISOString();
  // What the server did not take (a write that failed there) stays queued for the next cycle.
  const prisma = getPrismaClient();
  for (const r of rows.filter((row) => done.includes(row.barcode))) {
    await prisma.$executeRaw`UPDATE product_invalid_reports SET sent_at = ${sentAt} WHERE id = ${r.id}`;
  }
  return true;
}

export async function syncInvalidProducts(): Promise<void> {
  const prisma = getPrismaClient();
  const token = getServerToken();
  if (!token) return;

  const rows = (await prisma.$queryRaw`
    SELECT id, barcode, invalidated_at, error_code, valid FROM product_invalid_reports
    WHERE sent_at IS NULL ORDER BY invalidated_at ASC LIMIT ${BATCH}
  `) as ReportRow[];
  if (rows.length === 0) return;

  if (!endpointKnownMissing('products/validity')) {
    if (await send('products/validity', token, rows)) return;
  }

  // An older server: rejections only, read on their own so queued valid rows cannot crowd them
  // out of the batch. Valid rows stay queued for the new endpoint.
  if (endpointKnownMissing('products/invalid')) return;
  const rejections = (await prisma.$queryRaw`
    SELECT id, barcode, invalidated_at, error_code, valid FROM product_invalid_reports
    WHERE sent_at IS NULL AND valid = 0 ORDER BY invalidated_at ASC LIMIT ${BATCH}
  `) as ReportRow[];
  if (rejections.length > 0) await send('products/invalid', token, rejections);
}
