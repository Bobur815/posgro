import { randomBytes, randomInt } from 'crypto';

/**
 * Pairing a satellite to this main terminal.
 *
 * The operator asks the main for a code — gated on the super-admin password (§11.2) — reads it off
 * the main's screen, and types it into the satellite, which redeems it for a device secret.
 *
 * **Why a code rather than typing the super-admin password into the satellite.** That password
 * would then cross the shop LAN in clear text, on exactly the wire §6.10 already worries about for
 * PINs, and it is the credential that can hand the whole shop to another machine. A pairing code is
 * short-lived, single-use, and worthless the moment it is redeemed.
 *
 * **In memory on purpose.** A restart of the main invalidating an unredeemed code is the right
 * behaviour rather than a limitation — the operator is standing in front of the thing — and it
 * keeps a live credential out of the database entirely.
 */

/** Long enough to be safe with the throttle in front of it, short enough to read off a screen. */
const CODE_DIGITS = 6;
const CODE_TTL_MS = 10 * 60 * 1000;

export interface PairingCode {
  code: string;
  expiresAt: number;
}

let active: PairingCode | null = null;

/** Injectable so the expiry rules can be tested without waiting ten minutes. */
let clock: () => number = Date.now;

/** Test seam. Production never calls this. */
export function __setPairingClock(fn: () => number): void {
  clock = fn;
}

function expired(entry: PairingCode): boolean {
  return entry.expiresAt <= clock();
}

export function issuePairingCode(): PairingCode {
  // randomInt is the CSPRNG, not Math.random: this code is briefly the only thing standing between
  // the shop's data and anyone on its wifi.
  const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
  active = { code, expiresAt: clock() + CODE_TTL_MS };
  return active;
}

/** The outstanding code, so the main can keep showing it. Null once it expires or is redeemed. */
export function getPairingCode(): PairingCode | null {
  if (active && expired(active)) active = null;
  return active;
}

export function cancelPairingCode(): void {
  active = null;
}

/**
 * Whether this terminal is currently accepting a pairing.
 *
 * Also the answer to a chicken-and-egg problem: the LAN server only runs once a satellite is
 * paired, but a satellite has to reach that server in order to pair. Issuing a code opens the door
 * for as long as the code lives; a successful pairing then leaves a `paired_terminals` row, which
 * is what keeps it open afterwards.
 */
export function isPairingOpen(): boolean {
  return getPairingCode() !== null;
}

/**
 * Check and consume. Single-use: a redeemed code cannot pair a second machine, so a code read off
 * a screen by someone walking past is worth nothing once the intended till has used it.
 */
export function redeemPairingCode(candidate: string): boolean {
  const entry = getPairingCode();
  if (!entry) return false;
  if (candidate.trim() !== entry.code) return false;
  active = null;
  return true;
}

/** The satellite's device credential. Returned once, stored only as a bcrypt hash. */
export function generateDeviceSecret(): string {
  return randomBytes(32).toString('hex');
}
