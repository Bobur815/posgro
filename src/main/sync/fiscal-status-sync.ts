import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { getServerToken } from './queue-manager';
import { endpointKnownMissing, noteEndpointStatus } from './missing-endpoints';

/**
 * Tell the server which of its sales have been fiscalized, and with what tender.
 *
 * A sale is uploaded as soon as it is rung up, which is before the fiscal device has answered —
 * and a credit sale is fiscalized only once it is paid off, maybe days later and in another tender
 * (settle-sale.ts rewrites paymentMethod then). So the state goes up on its own, from the rows the
 * fiscal service flagged (`fiscalSynced: false`). The dashboard's bank turnover counts fiscalised
 * cash from it.
 *
 * Only sales the server already has (`synced`): the server matches on (store, receiptNumber).
 */

const BATCH = 200;

export async function syncFiscalStatus(): Promise<void> {
  const prisma = getPrismaClient();
  const token = getServerToken();
  if (!token) return;
  if (endpointKnownMissing('sales/fiscal-sync')) return;

  const rows = (await prisma.sale.findMany({
    where: { fiscalSynced: false, synced: true },
    select: {
      id: true,
      receiptNumber: true,
      fiscalStatus: true,
      regosFiscalAt: true,
      paymentMethod: true,
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
  })) as {
    id: string;
    receiptNumber: string;
    fiscalStatus: string | null;
    regosFiscalAt: Date | null;
    paymentMethod: string;
  }[];
  const sendable = rows.filter((r) => r.fiscalStatus);
  if (sendable.length === 0) return;

  const res = await fetch(`${getAppConfig().vpsApiUrl}/sales/fiscal-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      sales: sendable.map((r) => ({
        receiptNumber: r.receiptNumber,
        fiscalStatus: r.fiscalStatus,
        fiscalizedAt: r.regosFiscalAt ? new Date(r.regosFiscalAt).toISOString() : undefined,
        fiscalTender: r.paymentMethod,
      })),
    }),
  });
  // A server from before bank turnover: keep the flags, send again once it has the endpoint.
  noteEndpointStatus('sales/fiscal-sync', res.status);
  if (res.status === 404) return;
  if (!res.ok) {
    console.error(`[fiscal-sync] upload failed (HTTP ${res.status})`);
    return;
  }

  const { synced = [] } = (await res.json().catch(() => ({}))) as {
    synced?: string[];
  };
  const missing = sendable.filter((r) => !synced.includes(r.receiptNumber));
  if (missing.length > 0) {
    // The server had these sales once (they are marked synced here) and no longer does — a
    // return deleted there. Retrying forever would hold up every newer receipt behind them.
    console.warn(
      `[fiscal-sync] server has no sale for ${missing.length} receipt(s): ${missing
        .map((r) => r.receiptNumber)
        .join(', ')}`,
    );
  }

  // Matched on the status that was sent: one that changed while the request was in flight goes
  // again next cycle.
  for (const r of sendable) {
    await prisma.sale.updateMany({
      where: { id: r.id, fiscalStatus: r.fiscalStatus },
      data: { fiscalSynced: true },
    });
  }
}
