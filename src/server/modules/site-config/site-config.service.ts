import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  normalizePlanTerminals,
  normalizeSubscriptionRules,
  type PlanTerminals,
  type SubscriptionRules,
} from '../../../shared/utils/subscription';
import {
  normalizeLandingPlans,
  normalizeLandingContact,
  type LandingPlan,
  type LandingContact,
} from '../../../shared/types/landing.types';

export interface LoginBanner {
  imageUrl: string;
  title: string;
  subtitle: string;
}

export interface SubscriptionPlanPrices {
  starter: number;
  pro: number;
  vip: number;
  /** A month of one terminal beyond the plan's own (`Store.extraTerminals`). */
  extraTerminal: number;
}

/**
 * How a store pays for its subscription, as shown on the POS login screen.
 *
 * `qrPayload` is the raw bank-transfer string; the terminal renders it into a QR itself so the
 * dialog still works with no network. `paymentUrl` is the self-service Click/Payme/Paynet link
 * and may contain a `{storeId}` placeholder, substituted per store when it is served.
 */
export interface SubscriptionPayment {
  qrPayload: string;
  paymentUrl: string;
  supportPhone: string;
}

/** The POS terminal login screen's banner — the key every till in the field already reads. */
const BANNER_KEY = 'login_banner';
/** The web dashboard login page's banner, kept apart from the terminals'. */
const WEB_BANNER_KEY = 'web_login_banner';
const PAYMENT_KEY = 'subscription_payment';
const RULES_KEY = 'subscription_rules';
/** How many terminals each plan includes (shared/utils/subscription.ts#terminalAllowance). */
const PLAN_TERMINALS_KEY = 'subscription_terminals';
/**
 * Landing-page content edited from the dashboard (tasks/DOMAIN_MIGRATION_POSGRO.md §9.1).
 * `landing_plans` holds presentation ONLY — the prices stay in `subscription_price_*`, which the
 * subscription system already charges from, so the page can never quote a number the system
 * does not honour.
 */
const LANDING_PLANS_KEY = 'landing_plans';
const LANDING_CONTACT_KEY = 'landing_contact';
/**
 * The rules are read on every authenticated request (whether the store is blocked), so they are
 * kept in memory for this long. A change made here takes effect at once; one made by another
 * server process within a minute.
 */
const RULES_CACHE_MS = 60_000;
const DEFAULT: LoginBanner = { imageUrl: '', title: '', subtitle: '' };
const DEFAULT_PRICES: SubscriptionPlanPrices = { starter: 0, pro: 0, vip: 0, extraTerminal: 0 };
const PRICE_KEYS: Record<keyof SubscriptionPlanPrices, string> = {
  starter: 'subscription_price_starter',
  pro: 'subscription_price_pro',
  vip: 'subscription_price_vip',
  extraTerminal: 'subscription_price_extra_terminal',
};
const DEFAULT_PAYMENT: SubscriptionPayment = { qrPayload: '', paymentUrl: '', supportPhone: '' };

function parseBanner(value: string): LoginBanner {
  try {
    return { ...DEFAULT, ...(JSON.parse(value) as Partial<LoginBanner>) };
  } catch {
    return DEFAULT;
  }
}

@Injectable()
export class SiteConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** The POS terminal login screen's banner. */
  async getLoginBanner(): Promise<LoginBanner> {
    const row = await this.prisma.siteConfig.findUnique({ where: { key: BANNER_KEY } });
    return row ? parseBanner(row.value) : DEFAULT;
  }

  setLoginBanner(banner: LoginBanner): Promise<LoginBanner> {
    return this.writeBanner(BANNER_KEY, banner);
  }

  /**
   * The web dashboard login page's banner — separate from the terminals', so a photo framed for a
   * till's screen and one for a laptop's can differ. Until one has been saved it is the POS
   * banner, so the dashboard does not lose its image the day the two were split.
   */
  async getWebLoginBanner(): Promise<LoginBanner> {
    const row = await this.prisma.siteConfig.findUnique({ where: { key: WEB_BANNER_KEY } });
    return row ? parseBanner(row.value) : this.getLoginBanner();
  }

  setWebLoginBanner(banner: LoginBanner): Promise<LoginBanner> {
    return this.writeBanner(WEB_BANNER_KEY, banner);
  }

  private async writeBanner(key: string, banner: LoginBanner): Promise<LoginBanner> {
    const value = JSON.stringify(banner);
    await this.prisma.siteConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    return banner;
  }

  async getSubscriptionPlans(): Promise<SubscriptionPlanPrices> {
    const rows = await this.prisma.siteConfig.findMany({
      where: { key: { in: Object.values(PRICE_KEYS) } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
    const price = (k: keyof SubscriptionPlanPrices) =>
      Number.isFinite(map[PRICE_KEYS[k]]) ? map[PRICE_KEYS[k]] : DEFAULT_PRICES[k];
    return {
      starter: price('starter'),
      pro: price('pro'),
      vip: price('vip'),
      extraTerminal: price('extraTerminal'),
    };
  }

  /**
   * Save the prices sent. A client from before extra terminals sends no `extraTerminal`; that
   * price is then left as it is rather than reset.
   */
  async setSubscriptionPlans(
    prices: Omit<SubscriptionPlanPrices, 'extraTerminal'> & { extraTerminal?: number },
  ): Promise<SubscriptionPlanPrices> {
    const entries = (Object.keys(PRICE_KEYS) as Array<keyof SubscriptionPlanPrices>)
      .filter((k) => typeof prices[k] === 'number')
      .map((k) => ({ key: PRICE_KEYS[k], value: String(Math.round(prices[k] as number)) }));
    await Promise.all(
      entries.map((e) =>
        this.prisma.siteConfig.upsert({
          where: { key: e.key },
          update: { value: e.value },
          create: { key: e.key, value: e.value },
        }),
      ),
    );
    return this.getSubscriptionPlans();
  }

  private planTerminalsCache: { terminals: PlanTerminals; at: number } | null = null;

  /**
   * How many terminals each plan includes, defaults until saved. Cached like the rules: every
   * license a till renews reads it.
   */
  async getPlanTerminals(): Promise<PlanTerminals> {
    if (this.planTerminalsCache && Date.now() - this.planTerminalsCache.at < RULES_CACHE_MS) {
      return this.planTerminalsCache.terminals;
    }
    const row = await this.prisma.siteConfig.findUnique({ where: { key: PLAN_TERMINALS_KEY } });
    const saved = row ? safeParse(row.value) : null;
    const terminals = normalizePlanTerminals(
      saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : null,
    );
    this.planTerminalsCache = { terminals, at: Date.now() };
    return terminals;
  }

  async setPlanTerminals(input: Partial<Record<keyof PlanTerminals, unknown>>): Promise<PlanTerminals> {
    const terminals = normalizePlanTerminals(input);
    const value = JSON.stringify(terminals);
    await this.prisma.siteConfig.upsert({
      where: { key: PLAN_TERMINALS_KEY },
      update: { value },
      create: { key: PLAN_TERMINALS_KEY, value },
    });
    this.planTerminalsCache = { terminals, at: Date.now() };
    return terminals;
  }

  async getSubscriptionPayment(): Promise<SubscriptionPayment> {
    const row = await this.prisma.siteConfig.findUnique({ where: { key: PAYMENT_KEY } });
    if (!row) return DEFAULT_PAYMENT;
    try {
      return { ...DEFAULT_PAYMENT, ...(JSON.parse(row.value) as Partial<SubscriptionPayment>) };
    } catch {
      return DEFAULT_PAYMENT;
    }
  }

  async setSubscriptionPayment(payment: SubscriptionPayment): Promise<SubscriptionPayment> {
    const value = JSON.stringify(payment);
    await this.prisma.siteConfig.upsert({
      where: { key: PAYMENT_KEY },
      update: { value },
      create: { key: PAYMENT_KEY, value },
    });
    return payment;
  }

  private rulesCache: { rules: SubscriptionRules; at: number } | null = null;

  /** Trial, warning, grace and check-in days (shared/utils/subscription.ts), defaults until saved. */
  async getSubscriptionRules(): Promise<SubscriptionRules> {
    if (this.rulesCache && Date.now() - this.rulesCache.at < RULES_CACHE_MS) {
      return this.rulesCache.rules;
    }
    const row = await this.prisma.siteConfig.findUnique({ where: { key: RULES_KEY } });
    let saved: Record<string, unknown> = {};
    if (row) {
      try {
        saved = JSON.parse(row.value) as Record<string, unknown>;
      } catch {
        /* unreadable: the defaults */
      }
    }
    const rules = normalizeSubscriptionRules(saved);
    this.rulesCache = { rules, at: Date.now() };
    return rules;
  }

  async setSubscriptionRules(input: SubscriptionRules): Promise<SubscriptionRules> {
    const rules = normalizeSubscriptionRules(input);
    const value = JSON.stringify(rules);
    await this.prisma.siteConfig.upsert({
      where: { key: RULES_KEY },
      update: { value },
      create: { key: RULES_KEY, value },
    });
    this.rulesCache = { rules, at: Date.now() };
    return rules;
  }

  /**
   * How the three tiers are presented on the landing page — names, taglines, feature bullets.
   *
   * Always three well-formed plans, even before anything is saved: the pricing table renders a
   * card per tier, and a half-written config must not make a tier disappear from it.
   */
  async getLandingPlans(): Promise<LandingPlan[]> {
    const row = await this.prisma.siteConfig.findUnique({ where: { key: LANDING_PLANS_KEY } });
    return normalizeLandingPlans(row ? safeParse(row.value) : null);
  }

  async setLandingPlans(input: LandingPlan[]): Promise<LandingPlan[]> {
    const plans = normalizeLandingPlans(input);
    const value = JSON.stringify(plans);
    await this.prisma.siteConfig.upsert({
      where: { key: LANDING_PLANS_KEY },
      update: { value },
      create: { key: LANDING_PLANS_KEY, value },
    });
    return plans;
  }

  /** Phone numbers and social links shown on the landing page. */
  async getLandingContact(): Promise<LandingContact> {
    const row = await this.prisma.siteConfig.findUnique({ where: { key: LANDING_CONTACT_KEY } });
    return normalizeLandingContact(row ? safeParse(row.value) : null);
  }

  async setLandingContact(input: LandingContact): Promise<LandingContact> {
    const contact = normalizeLandingContact(input);
    const value = JSON.stringify(contact);
    await this.prisma.siteConfig.upsert({
      where: { key: LANDING_CONTACT_KEY },
      update: { value },
      create: { key: LANDING_CONTACT_KEY, value },
    });
    return contact;
  }
}

/** Unreadable JSON falls through to the normalizer's defaults rather than throwing a 500. */
function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
