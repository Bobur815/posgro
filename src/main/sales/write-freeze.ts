/**
 * The write freeze a main terminal holds while it hands its role to another till
 * (tasks/LAN_MAIN_TERMINAL_PLAN.md §11.4).
 *
 * The new main takes over a copy of this database. Anything written here after that copy was taken
 * would be written to a database that is about to stop mattering — a sale whose stock never left
 * the new main's shelf, a shift that never closed there. So from the moment the handoff begins until
 * it completes (or is abandoned and the freeze lapses) every write path refuses, with a code the
 * cashier's screen can name, and the cart stays where it is.
 *
 * Deliberately a leaf module with no imports: the sale queue, the shift writes, the fiscal service,
 * the write guard and the LAN server all ask it, and none of them should drag the others in.
 */

export const HANDING_OFF = 'MAIN_HANDING_OFF';

let frozenUntil = 0;

export function isWriteFrozen(): boolean {
  return Date.now() < frozenUntil;
}

/** Freeze for `ms`, after which the freeze lapses by itself — a handoff that never completes. */
export function freezeWrites(ms: number): void {
  frozenUntil = Date.now() + ms;
}

export function thawWrites(): void {
  frozenUntil = 0;
}

/** The same JSON shape as a sale refusal, so the renderer's existing error parsing names it. */
export function assertWritable(): void {
  if (isWriteFrozen()) throw new Error(JSON.stringify({ code: HANDING_OFF }));
}
