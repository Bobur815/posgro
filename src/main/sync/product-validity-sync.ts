import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { getServerToken } from './queue-manager';
import { endpointKnownMissing, noteEndpointStatus } from './missing-endpoints';

/**
 * Tell the server which products REGOS:VCR rejected on this till (Product.isValid = false).
 *
 * The fiscal service marks the product here at once and queues a row in `product_invalid_reports`
 * (product-validity.ts); this sends the queue. The server keeps the store-wide answer — it ignores
 * a report older than the product's latest arrival — and every till pulls it with the products.
 */

const BATCH = 200;

interface ReportRow {
  id: string;
  barcode: string;
  invalidated_at: string | Date;
  error_code: number | null;
}

export async function syncInvalidProducts(): Promise<void> {
  const prisma = getPrismaClient();
  const token = getServerToken();
  if (!token) return;
  if (endpointKnownMissing('products/invalid')) return;

  const rows = (await prisma.$queryRaw`
    SELECT id, barcode, invalidated_at, error_code FROM product_invalid_reports
    WHERE sent_at IS NULL ORDER BY invalidated_at ASC LIMIT ${BATCH}
  `) as ReportRow[];
  if (rows.length === 0) return;

  const res = await fetch(`${getAppConfig().vpsApiUrl}/products/invalid`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items: rows.map((r) => ({
        barcode: r.barcode,
        at: new Date(r.invalidated_at).toISOString(),
        ...(r.error_code != null ? { code: Number(r.error_code) } : {}),
      })),
    }),
  });
  // A server from before isValid: keep the rows, send them once it has the endpoint.
  noteEndpointStatus('products/invalid', res.status);
  if (res.status === 404) return;
  if (!res.ok) {
    console.error(`[product-validity] upload failed (HTTP ${res.status})`);
    return;
  }

  const { done = [] } = (await res.json().catch(() => ({}))) as { done?: string[] };
  const sentAt = new Date().toISOString();
  // What the server did not take (a write that failed there) stays queued for the next cycle.
  for (const r of rows.filter((row) => done.includes(row.barcode))) {
    await prisma.$executeRaw`UPDATE product_invalid_reports SET sent_at = ${sentAt} WHERE id = ${r.id}`;
  }
}
