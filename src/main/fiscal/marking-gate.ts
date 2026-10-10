// The marking-circulation gate: with `regos_vcr_circulation_check` on, a receipt carrying a marking
// code asl-belgisi says is out of circulation is not sent to REGOS. The sale itself stands (it was
// committed long before this runs); only its fiscal receipt waits, as FAILED with
// `sales.marking_block` set, until the sale is edited (settleSale clears the block) or a manual
// retry finds the code back in circulation.
//
// Offline-first: an unreachable registry or a status we do not classify (UNKNOWN) never blocks a
// new receipt — REGOS stays the authoritative check. A code that is already blocked is only
// released by a positive answer, so a retry while asl-belgisi is down keeps it blocked.
import type { CirculationAnswer } from '../marking/circulation-cache';

export interface MarkingBlockEntry {
  barcode: string;
  label: string;
  /** asl-belgisi status (NOT_FOUND when the registry has no such code); absent when it was not reachable. */
  status?: string;
}

/** Thrown by fiscalizeSaleImpl for a blocked receipt, after the block has been written. */
export class MarkingBlockedError extends Error {
  constructor(readonly entries: MarkingBlockEntry[]) {
    super(describeMarkingBlock(entries));
    this.name = 'MarkingBlockedError';
  }
}

/** fiscalError text for a blocked receipt; Russian, like every other fiscalError. */
export function describeMarkingBlock(entries: MarkingBlockEntry[]): string {
  const codes = entries
    .map((e) => `${e.barcode} (${e.status ?? 'asl-belgisi недоступен'})`)
    .join(', ');
  return `Код маркировки вне оборота: ${codes}. Отредактируйте чек`;
}

export function parseMarkingBlock(json: string | null | undefined): MarkingBlockEntry[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is MarkingBlockEntry =>
        typeof e === 'object' && e !== null && typeof (e as MarkingBlockEntry).label === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * Which of the receipt's marked lines keep it from REGOS. `sent` are the lines that will carry a
 * code, `answers[i]` the registry's word on `sent[i]`, `prior` the receipt's current block.
 */
export function decideMarkingBlock(
  sent: Array<{ barcode: string; label: string }>,
  answers: CirculationAnswer[],
  prior: MarkingBlockEntry[],
): MarkingBlockEntry[] {
  const wasBlocked = new Set(prior.map((p) => p.label));
  const blocked: MarkingBlockEntry[] = [];
  sent.forEach((line, i) => {
    const a = answers[i];
    if (a?.verdict === 'OUT') {
      blocked.push({ ...line, status: a.status ?? 'OUT' });
    } else if (wasBlocked.has(line.label) && !a?.reachable) {
      const before = prior.find((p) => p.label === line.label);
      blocked.push({ ...line, ...(before?.status ? { status: before.status } : {}) });
    }
  });
  return blocked;
}
