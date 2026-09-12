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
  type SubscriptionFacts,
  type SubscriptionRules,
} from '../../../shared/utils/subscription';

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
  ): string | null {
    if (!this.key) return null;
    const status = subscriptionStatus(facts, rules, now);
    return signLicense(licensePayload(storeId, status, now, rules.offlineCheckinDays), this.key.priv);
  }

  /** A fresh license for `storeId` as it stands now, or null for no key or no such store. */
  async issue(storeId: string): Promise<string | null> {
    if (!this.key) return null;
    const [store, rules] = await Promise.all([
      this.prisma.store.findUnique({
        where: { id: storeId },
        select: {
          subscriptionPlan: true,
          subscriptionExpiresAt: true,
          subscriptionGraceFrom: true,
          subscriptionRequired: true,
        },
      }),
      this.siteConfig.getSubscriptionRules(),
    ]);
    return store ? this.sign(storeId, storeSubscriptionFacts(store), rules) : null;
  }

  /**
   * A fresh license in exchange for one this server signed, however old. The signature is the
   * credential: it proves which store is asking. That is what lets a till whose sign-in token has
   * long expired — an offline-only store's, typically — renew at all, and "Check payment" work.
   * What comes back is that store's own plan and dates, nothing another store could use.
   */
  async renew(presented: string): Promise<string> {
    if (!this.key) throw new ServiceUnavailableException('Licenses are not configured');
    const old = readLicense(presented, this.key.pub);
    if (!old) throw new UnauthorizedException('Invalid license');
    const fresh = await this.issue(old.storeId);
    if (!fresh) throw new NotFoundException('Store not found');
    return fresh;
  }
}
