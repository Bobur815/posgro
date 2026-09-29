/**
 * Content on the posgro.uz landing page that is edited from the super-admin dashboard rather
 * than in the page's source.
 *
 * The landing page is a static build: it renders baked-in fallbacks immediately, then fetches
 * these and swaps the values in. With the API unreachable the page is still complete — which is
 * exactly the moment someone is on it looking for a support number.
 *
 * Shared so the server, the dashboard and the landing page all describe this one shape. See
 * tasks/DOMAIN_MIGRATION_POSGRO.md §9.1.
 */

/** The three tiers the subscription system bills for. Presentation is keyed by these. */
export type LandingPlanId = 'starter' | 'pro' | 'vip';

export const LANDING_PLAN_IDS: readonly LandingPlanId[] = ['starter', 'pro', 'vip'] as const;

/**
 * How one tier is *presented*. Deliberately holds no price.
 *
 * The number comes from `subscription_plan_prices`, which already exists, is already public, and
 * is what the subscription system actually charges. A second copy here would drift from it, and
 * the person who noticed would be a customer.
 */
export interface LandingPlan {
  id: LandingPlanId;
  nameRu: string;
  nameUz: string;
  taglineRu: string;
  taglineUz: string;
  featuresRu: string[];
  featuresUz: string[];
  /** The "most popular" card. At most one; the server keeps only the first. */
  highlighted: boolean;
  order: number;
  /** Where the card's button goes. Empty falls back to the first Telegram social. */
  ctaUrl?: string;
}

export interface LandingPhone {
  /** Short label shown beside the number, e.g. "Sotuv", "Qo'llab-quvvatlash". */
  label: string;
  number: string;
}

/**
 * `platform` is a free string, not a union, so a network can be added from the dashboard without
 * a release. The landing renders a known icon for the values below and a generic link icon for
 * anything else.
 */
export const KNOWN_SOCIAL_PLATFORMS = [
  'telegram',
  'instagram',
  'youtube',
  'facebook',
  'tiktok',
  'whatsapp',
  'linkedin',
  'x',
] as const;

export interface LandingSocial {
  platform: string;
  url: string;
  order: number;
}

export interface LandingContact {
  phones: LandingPhone[];
  socials: LandingSocial[];
  email: string;
  addressRu: string;
  addressUz: string;
  workingHoursRu: string;
  workingHoursUz: string;
}

export const DEFAULT_LANDING_CONTACT: LandingContact = {
  phones: [],
  socials: [],
  email: '',
  addressRu: '',
  addressUz: '',
  workingHoursRu: '',
  workingHoursUz: '',
};

/** Empty presentation for a tier, so an unsaved config still yields three well-formed cards. */
export function emptyLandingPlan(id: LandingPlanId, order: number): LandingPlan {
  return {
    id,
    nameRu: '',
    nameUz: '',
    taglineRu: '',
    taglineUz: '',
    featuresRu: [],
    featuresUz: [],
    highlighted: false,
    order,
    ctaUrl: '',
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).filter(Boolean);
}

/**
 * Coerce whatever is stored into exactly three well-formed plans, in `order`.
 *
 * Always returns all three ids: the landing page renders a card per tier, and a half-saved config
 * must not make a tier vanish from the pricing table. At most one is highlighted — two "most
 * popular" badges is a bug the operator cannot see from the form.
 */
export function normalizeLandingPlans(input: unknown): LandingPlan[] {
  const raw = Array.isArray(input) ? input : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const id = str((item as Record<string, unknown>).id);
      if (id) byId.set(id, item as Record<string, unknown>);
    }
  }

  let highlightTaken = false;
  const plans = LANDING_PLAN_IDS.map((id, i) => {
    const saved = byId.get(id);
    if (!saved) return emptyLandingPlan(id, i);

    const wantsHighlight = saved.highlighted === true;
    const highlighted = wantsHighlight && !highlightTaken;
    if (highlighted) highlightTaken = true;

    const order = Number(saved.order);
    return {
      id,
      nameRu: str(saved.nameRu),
      nameUz: str(saved.nameUz),
      taglineRu: str(saved.taglineRu),
      taglineUz: str(saved.taglineUz),
      featuresRu: strList(saved.featuresRu),
      featuresUz: strList(saved.featuresUz),
      highlighted,
      order: Number.isFinite(order) ? order : i,
      ctaUrl: str(saved.ctaUrl),
    };
  });

  return plans.sort((a, b) => a.order - b.order || LANDING_PLAN_IDS.indexOf(a.id) - LANDING_PLAN_IDS.indexOf(b.id));
}

/**
 * The hero's background video. Encoded locally by scripts/encode-hero.sh and uploaded from the
 * super-admin dashboard as five finished files; the server only stores them.
 *
 * Values are bare file names inside `uploads/landing/`, which nginx serves on posgro.uz under
 * `/media/`. Each upload gets new names (`hero-<version>-…`), so the files can be cached forever.
 * The posters are also copied to the fixed names in HERO_POSTER_ALIAS, which the landing's
 * index.html preloads before any script has run.
 */
export interface LandingHeroVideo {
  /** Upload timestamp (ms), also the file-name prefix. */
  version: number;
  webm: string;
  mp4: string;
  mobileMp4: string;
  posterJpg: string;
  posterWebp: string;
}

export const LANDING_HERO_VIDEO_FILES = ['webm', 'mp4', 'mobileMp4', 'posterJpg', 'posterWebp'] as const;
export type LandingHeroVideoFile = (typeof LANDING_HERO_VIDEO_FILES)[number];

export const HERO_POSTER_ALIAS = { webp: 'hero-poster.webp', jpg: 'hero-poster.jpg' } as const;

/** A plain file name — no path, no traversal — as the server writes them. */
const SAFE_FILE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/** Stored value → a complete video, or null. A half-configured video renders as no video. */
export function normalizeLandingHeroVideo(input: unknown): LandingHeroVideo | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const version = Number(raw.version);
  if (!Number.isFinite(version) || version <= 0) return null;

  const files = {} as Record<LandingHeroVideoFile, string>;
  for (const key of LANDING_HERO_VIDEO_FILES) {
    const name = str(raw[key]);
    if (!SAFE_FILE_NAME.test(name)) return null;
    files[key] = name;
  }
  return { version, ...files };
}

/** Coerce stored contact details, dropping entries too incomplete to render. */
export function normalizeLandingContact(input: unknown): LandingContact {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

  const phones = (Array.isArray(raw.phones) ? raw.phones : [])
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return { label: str(o.label), number: str(o.number) };
    })
    // A label with no number is nothing to call; a bare number still dials.
    .filter((p) => p.number);

  const socials = (Array.isArray(raw.socials) ? raw.socials : [])
    .map((s, i) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const order = Number(o.order);
      return {
        platform: str(o.platform).toLowerCase(),
        url: str(o.url),
        order: Number.isFinite(order) ? order : i,
      };
    })
    .filter((s) => s.platform && s.url)
    .sort((a, b) => a.order - b.order);

  return {
    phones,
    socials,
    email: str(raw.email),
    addressRu: str(raw.addressRu),
    addressUz: str(raw.addressUz),
    workingHoursRu: str(raw.workingHoursRu),
    workingHoursUz: str(raw.workingHoursUz),
  };
}
