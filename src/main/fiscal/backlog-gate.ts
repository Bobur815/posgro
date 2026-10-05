// The fiscal backlog stepper is a paid service. A step runs only while the store's signed license
// says the service is open (fiscalBacklogOpen, judged by the trusted clock), and every step that
// runs leaves a row in the till's audit log: who ran it, when, and what it changed.
//
// Enforced here, in the main process, not only by hiding the card: a renderer that calls the IPC
// directly is refused the same way.
import { randomUUID } from 'crypto';
import { getPrismaClient } from '../database/sqlite-client';
import { fiscalBacklogOpen } from '../license/license';
import type { FiscalBacklogStep } from '../../shared/types/fiscal.types';

export const NOT_ENTITLED = 'NOT_ENTITLED';

export interface BacklogActor {
  id: string;
  phone: string;
}

/**
 * Run one backlog step if the service is open, else hand back `empty` marked NOT_ENTITLED.
 * `empty` is the step's own result shape with nothing in it, so the screen never gets a partial
 * object. The audit row is best effort: a failed insert must not turn a done step into an error.
 */
export async function runEntitled<R extends { ok: boolean; error?: string }>(
  step: FiscalBacklogStep,
  fromDate: string,
  actor: BacklogActor | null,
  empty: R,
  run: () => Promise<R>,
): Promise<R> {
  if (!(await fiscalBacklogOpen())) return { ...empty, ok: false, error: NOT_ENTITLED };
  const result = await run();
  await getPrismaClient()
    .$executeRawUnsafe(
      `INSERT INTO audit_logs (id, user_id, phone, action, entity, entity_id, details)
       VALUES (?, ?, ?, ?, 'fiscal_backlog', ?, ?)`,
      randomUUID(),
      actor?.id ?? 'unknown',
      actor?.phone ?? '',
      `FISCAL_BACKLOG_${step.toUpperCase()}`,
      fromDate,
      JSON.stringify(summarise(result)),
    )
    .catch((e: unknown) =>
      console.error('[fiscal] backlog audit row failed:', e instanceof Error ? e.message : e),
    );
  return result;
}

/** Counts, not lists: an audit row says what a step did, not every receipt it touched. */
function summarise(result: { ok: boolean; error?: string }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(result)) out[k] = Array.isArray(v) ? v.length : v;
  return out;
}
