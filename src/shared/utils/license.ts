/**
 * A store's license: its subscription as the server last judged it, signed so a till can trust it
 * offline — and cannot edit it.
 *
 * Signed with Ed25519. Only the server holds the private key (`LICENSE_SIGNING_KEY`); a till carries
 * the public one, so it can check a license but never make one. Deliberately not a JWT signed with
 * JWT_SECRET: that secret ships inside every POS build, so anything signed with it can be forged.
 *
 * Node-only (crypto): imported by the server and the POS main process, never by the web dashboard.
 */
import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'crypto';
import { DAY_MS, type SubscriptionState, type SubscriptionStatus } from './subscription';

export const LICENSE_VERSION = 1;

export interface LicensePayload {
  v: typeof LICENSE_VERSION;
  storeId: string;
  plan: string | null;
  /** All three null when nothing counts down: VIP, a plan with no date, an old store with no plan. */
  expiresAt: string | null;
  warnFrom: string | null;
  blockAt: string | null;
  /** The server's clock when it signed — a till can take it as a floor for its own. */
  issuedAt: string;
  /** The till must reach the server again by then, even in a store that never syncs. */
  checkinBy: string;
}

/** Where a till stands by its license: the subscription states, plus overdue for a check-in. */
export type LicenseState = SubscriptionState | 'checkin-required';

/** A key as configured: base64 of its DER (PKCS8 private, SPKI public) — one line, fits an env var. */
export function privateKeyFrom(base64Der: string): KeyObject {
  return createPrivateKey({ key: Buffer.from(base64Der, 'base64'), format: 'der', type: 'pkcs8' });
}

export function publicKeyFrom(base64Der: string): KeyObject {
  return createPublicKey({ key: Buffer.from(base64Der, 'base64'), format: 'der', type: 'spki' });
}

/** `<payload>.<signature>`, both base64url. */
export function signLicense(payload: LicensePayload, privateKey: KeyObject): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return `${body.toString('base64url')}.${sign(null, body, privateKey).toString('base64url')}`;
}

/** The payload, when `token` was signed with the key `publicKey` belongs to and reads as one. */
export function readLicense(token: unknown, publicKey: KeyObject): LicensePayload | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const body = Buffer.from(parts[0], 'base64url');
    if (!verify(null, body, publicKey, Buffer.from(parts[1], 'base64url'))) return null;
    const payload: unknown = JSON.parse(body.toString('utf8'));
    return isLicensePayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

function isLicensePayload(p: unknown): p is LicensePayload {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  const isDate = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
  const isDateOrNull = (v: unknown) => v === null || isDate(v);
  return (
    o.v === LICENSE_VERSION &&
    typeof o.storeId === 'string' &&
    o.storeId !== '' &&
    (o.plan === null || typeof o.plan === 'string') &&
    isDateOrNull(o.expiresAt) &&
    isDateOrNull(o.warnFrom) &&
    isDateOrNull(o.blockAt) &&
    isDate(o.issuedAt) &&
    isDate(o.checkinBy)
  );
}

/** The license for a store whose subscription stands at `status`, signed at `issuedAt`. */
export function licensePayload(
  storeId: string,
  status: SubscriptionStatus,
  issuedAt: number,
  checkinDays: number,
): LicensePayload {
  const at = new Date(issuedAt).toISOString();
  // Blocked with no dates — a new store with no plan — is blocked from the moment of signing.
  const dates =
    status.state === 'blocked' && !status.blockAt
      ? { expiresAt: at, warnFrom: at, blockAt: at }
      : { expiresAt: status.expiresAt, warnFrom: status.warnFrom, blockAt: status.blockAt };
  return {
    v: LICENSE_VERSION,
    storeId,
    plan: status.plan,
    ...dates,
    issuedAt: at,
    checkinBy: new Date(issuedAt + checkinDays * DAY_MS).toISOString(),
  };
}

/**
 * Where a till stands at `now` — its trusted clock, not the system one. The same cut-offs as
 * `subscriptionStatus`, read from the dates the server signed. Blocked outranks an overdue check-in:
 * paying is the thing to do, and a check-in alone would not help.
 */
export function licenseState(
  license: LicensePayload,
  now: number,
): { state: LicenseState; daysLeft: number | null } {
  const at = (iso: string) => Date.parse(iso);
  const daysUntil = (ms: number) => Math.max(0, Math.ceil((ms - now) / DAY_MS));
  const { expiresAt, warnFrom, blockAt } = license;

  if (blockAt && now >= at(blockAt)) return { state: 'blocked', daysLeft: 0 };
  if (now >= at(license.checkinBy)) return { state: 'checkin-required', daysLeft: 0 };
  if (!blockAt || !expiresAt || !warnFrom) return { state: 'unlimited', daysLeft: null };
  if (now < at(warnFrom)) return { state: 'active', daysLeft: daysUntil(at(expiresAt)) };
  if (now < at(expiresAt)) return { state: 'warning', daysLeft: daysUntil(at(expiresAt)) };
  return { state: 'grace', daysLeft: daysUntil(at(blockAt)) };
}
