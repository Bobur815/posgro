// asl-belgisi marking-code circulation status classification.
// Mirrors the status buckets used by scripts/aslbelgisi-test.ts. The verify endpoint
// returns a `status` string per marking code; we collapse it into three buckets so
// callers can decide whether a code is still sellable / should be queued for later
// fiscalization.

export type CirculationVerdict = 'IN' | 'OUT' | 'UNKNOWN';

// In circulation — applied/introduced/being moved. Sellable, worth queuing for VCR.
const IN_CIRCULATION = new Set([
  'APPLIED',
  'INTRODUCED',
  'IN_CIRCULATION',
]);

// Out of circulation — recalled/retired/sold/written-off. Already done; do not queue.
const OUT_OF_CIRCULATION = new Set([
  'EMITTED', // issued but not applied — not (yet) in circulation; treat as out for queuing
  'WITHDRAWN',
  'RETIRED',
  'WRITTEN_OFF',
  'SOLD',
  'DISAGGREGATED',
  'RETURNED',
]);

/**
 * Classify an asl-belgisi `status` value.
 * Unknown/missing statuses return 'UNKNOWN' — callers following the offline-first rule
 * should treat 'UNKNOWN' the same as 'IN' (save it anyway rather than lose the code).
 */
export function classifyCirculation(status?: string | null): CirculationVerdict {
  if (!status) return 'UNKNOWN';
  const s = status.toUpperCase();
  if (IN_CIRCULATION.has(s)) return 'IN';
  if (OUT_OF_CIRCULATION.has(s)) return 'OUT';
  return 'UNKNOWN';
}
