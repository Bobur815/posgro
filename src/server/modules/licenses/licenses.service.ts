import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createPublicKey, type KeyObject } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteConfigService } from '../site-config/site-config.service';
import {
  licensePayload,
  privateKeyFrom,
  readLicense,
  signLicense,
} from '../../../shared/utils/license';
import {
  storeSubscriptionFacts,
  subscriptionStatus,
  terminalAllowance,
  type SubscriptionFacts,
  type SubscriptionRules,
} from '../../../shared/utils/subscription';

/** The terminals a till names when it asks for a license: itself, and a main's satellites. */
export interface TerminalClaim {
  terminalId: string;
  satellites?: string[];
}

export type Seating = { terminals: number; seats: string[] };

/** More than any shop runs; a bound on what one unauthenticated renewal can write. */
export const MAX_CLAIMED_TERMINALS = 32;

/** The claim in a request (a body, or a query string with comma-separated satellites). */
export function terminalClaim(
  terminalId: unknown,
  satellites: unknown,
): TerminalClaim | null {
  if (typeof terminalId !== 'string' || !terminalId.trim()) return null;
  const list = Array.isArray(satellites)
    ? satellites
    : typeof satellites === 'string' && satellites
      ? satellites.split(',')
      : [];
  return {
    terminalId: terminalId.trim().slice(0, 64),
    satellites: list
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim().slice(0, 64))
      .filter(Boolean)
      .slice(0, MAX_CLAIMED_TERMINALS),
  };
}

/**
 * The signing key from `LICENSE_SIGNING_KEY`, or null — logged, not thrown: a missing or broken key
 * must not take the whole API down with it. It only means no licenses until it is fixed.
 */
function loadSigningKey(logger: Logger): { priv: KeyObject; pub: KeyObject } | null {
  const raw = process.env.LICENSE_SIGNING_KEY?.trim();
  if (!raw) {
    logger.warn('LICENSE_SIGNING_KEY is not set: no store licenses will be issued');
    return null;
  }
  try {
    const priv = privateKeyFrom(raw);
    return { priv, pub: createPublicKey(priv) };
  } catch (e) {
    logger.error(`LICENSE_SIGNING_KEY is not a usable Ed25519 key: ${(e as Error).message}`);
    return null;
  }
}

/** Signs store licenses (shared/utils/license.ts) and renews them for tills that present one. */
@Injectable()
export class LicensesService {
  private readonly logger = new Logger(LicensesService.name);
  private readonly key = loadSigningKey(this.logger);

  constructor(
    private readonly prisma: PrismaService,
    private readonly siteConfig: SiteConfigService,
  ) {}

  /** A license for a store with these facts, judged now; null when no signing key is configured. */
  sign(
    storeId: string,
    facts: SubscriptionFacts,
    rules: SubscriptionRules,
    now: number = Date.now(),
    seating: Seating | null = null,
  ): string | null {
    if (!this.key) return null;
    const status = subscriptionStatus(facts, rules, now);
    return signLicense(
      licensePayload(storeId, status, now, rules.offlineCheckinDays, seating),
      this.key.priv,
    );
  }

  /**
   * A fresh license for `storeId` as it stands now, or null for no key or no such store. With a
   * claim, the terminals it names are registered first, so the license says whether they hold a
   * slot.
   */
  async issue(storeId: string, claim?: TerminalClaim | null): Promise<string | null> {
    if (!this.key) return null;
    if (claim) await this.register(storeId, claim);
    const [store, rules] = await Promise.all([
      this.prisma.store.findUnique({
        where: { id: storeId },
        select: {
          subscriptionPlan: true,
          subscriptionExpiresAt: true,
          subscriptionGraceFrom: true,
          subscriptionRequired: true,
          extraTerminals: true,
        },
      }),
      this.siteConfig.getSubscriptionRules(),
    ]);
    if (!store) return null;
    const seating = await this.seating(storeId, store.subscriptionPlan, store.extraTerminals);
    return this.sign(storeId, storeSubscriptionFacts(store), rules, Date.now(), seating);
  }

  /**
   * A fresh license in exchange for one this server signed, however old. The signature is the
   * credential: it proves which store is asking. That is what lets a till whose sign-in token has
   * long expired — an offline-only store's, typically — renew at all, and "Check payment" work.
   * What comes back is that store's own plan and dates, nothing another store could use.
   */
  async renew(presented: string, claim?: TerminalClaim | null): Promise<string> {
    if (!this.key) throw new ServiceUnavailableException('Licenses are not configured');
    const old = readLicense(presented, this.key.pub);
    if (!old) throw new UnauthorizedException('Invalid license');
    const fresh = await this.issue(old.storeId, claim);
    if (!fresh) throw new NotFoundException('Store not found');
    return fresh;
  }

  /**
   * How many terminals the store may run and which hold a slot — the earliest `allowance` to have
   * registered, so after a downgrade it is the newest that lose theirs. Null for no limit.
   */
  async seating(
    storeId: string,
    plan: string | null,
    extraTerminals: number,
  ): Promise<Seating | null> {
    const allowance = terminalAllowance(plan, extraTerminals, await this.siteConfig.getPlanTerminals());
    if (allowance === null) return null;
    const rows = await this.prisma.storeTerminal.findMany({
      where: { storeId },
      orderBy: [{ firstSeenAt: 'asc' }, { terminalId: 'asc' }],
      take: allowance,
      select: { terminalId: true },
    });
    return { terminals: allowance, seats: rows.map((r) => r.terminalId) };
  }

  /**
   * Record the terminals a till names: itself, and — for a main — the satellites paired with it,
   * which never reach this server themselves. Every one is recorded, slot or not: a till refused
   * today takes the next slot that frees up, in the order they asked. The main is stamped first
   * so it outranks satellites it names in the same breath.
   */
  private async register(storeId: string, claim: TerminalClaim): Promise<void> {
    const ids = [...new Set([claim.terminalId, ...(claim.satellites ?? [])].map((id) => id.trim()))]
      .filter(Boolean)
      .slice(0, MAX_CLAIMED_TERMINALS);
    if (ids.length === 0) return;
    const now = Date.now();
    try {
      await this.prisma.storeTerminal.createMany({
        data: ids.map((terminalId, i) => ({
          storeId,
          terminalId,
          firstSeenAt: new Date(now + i),
          lastSeenAt: new Date(now),
        })),
        skipDuplicates: true,
      });
      await this.prisma.storeTerminal.updateMany({
        where: { storeId, terminalId: { in: ids } },
        data: { lastSeenAt: new Date(now) },
      });
    } catch (e) {
      // A registry hiccup must not cost a till its license: it is signed with the seats as they
      // stand, which is where this till was before it asked.
      this.logger.warn(`Could not register terminals for store ${storeId}: ${(e as Error).message}`);
    }
  }
}
