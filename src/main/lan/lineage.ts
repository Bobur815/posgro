import { randomUUID } from 'node:crypto';

/**
 * The split-brain guard (tasks/LAN_MAIN_TERMINAL_PLAN.md §11.3).
 *
 * A **lineage** is one chain of mains serving one shop: it starts when a main pairs its first till
 * and passes to whichever terminal is promoted next. The **generation** counts promotions along it.
 * A satellite remembers the lineage it belongs to and the highest generation it has seen, and
 * refuses a main presenting a lower one — which is exactly a main that was replaced and has come
 * back, still believing it is in charge.
 *
 * Without it that old main simply starts serving again, and any satellite still pointed at its
 * address resumes writing to a stale source of truth: a second, divergent shop, found at stocktake.
 *
 * Pure, like `sync-policy.ts` and `serve-policy.ts`: the rule is worth testing on its own.
 */

export interface LineagePosition {
  lineage: string | null;
  generation: number;
}

/**
 * What a satellite should make of a main's claim.
 *
 *  - `accept`: the main it knows, at the generation it knows.
 *  - `record`: the same lineage, further along — a promotion happened; remember the new generation.
 *  - `superseded`: an older main of this lineage, or a main of a different lineage altogether.
 *    Either way not the one this till is paired with; talking to it would split the shop.
 */
export type LineageVerdict = 'accept' | 'record' | 'superseded';

export function judgeMain(mine: LineagePosition, theirs: LineagePosition): LineageVerdict {
  // A till that has never learned a lineage (paired before this guard existed) has nothing to
  // compare; it adopts what it is shown. Likewise a main too old to say — refusing it would strand
  // a shop halfway through an upgrade, with the satellites updated before the main.
  if (!mine.lineage) return theirs.lineage ? 'record' : 'accept';
  if (!theirs.lineage) return 'accept';

  if (theirs.lineage !== mine.lineage) return 'superseded';
  if (theirs.generation < mine.generation) return 'superseded';
  if (theirs.generation > mine.generation) return 'record';
  return 'accept';
}

/** A fresh lineage, for a main pairing its first till. */
export function newLineage(): string {
  return randomUUID();
}
