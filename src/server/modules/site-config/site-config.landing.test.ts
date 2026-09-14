import { SiteConfigService } from './site-config.service';
import type { LandingPlan, LandingContact } from '../../../shared/types/landing.types';

/**
 * Landing-page content is read by a PUBLIC, unauthenticated page that must render correctly with
 * no network and no saved config. So the guarantees under test are about what comes *out*: three
 * well-formed tiers whatever is stored, one highlight at most, and no half-entries that would
 * render as an empty row on a marketing page.
 */

function build() {
  const rows = new Map<string, string>();
  const prisma = {
    siteConfig: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        rows.has(where.key) ? { key: where.key, value: rows.get(where.key)! } : null,
      ),
      upsert: jest.fn(async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
        rows.set(where.key, update.value);
        return { key: where.key, value: update.value };
      }),
    },
  };
  return { service: new SiteConfigService(prisma as any), rows };
}

const plan = (over: Partial<LandingPlan>): LandingPlan => ({
  id: 'starter',
  nameRu: 'Старт',
  nameUz: 'Boshlangich',
  taglineRu: '',
  taglineUz: '',
  featuresRu: [],
  featuresUz: [],
  highlighted: false,
  order: 0,
  ctaUrl: '',
  ...over,
});

describe('landing plans', () => {
  it('returns all three tiers before anything has been saved', async () => {
    const { service } = build();
    const plans = await service.getLandingPlans();
    expect(plans.map((p) => p.id)).toEqual(['starter', 'pro', 'vip']);
  });

  it('still returns all three when only one has been filled in', async () => {
    const { service } = build();
    await service.setLandingPlans([plan({ id: 'pro', nameUz: 'Pro' })]);
    const plans = await service.getLandingPlans();
    expect(plans.map((p) => p.id)).toEqual(['starter', 'pro', 'vip']);
    expect(plans.find((p) => p.id === 'pro')!.nameUz).toBe('Pro');
  });

  it('keeps only the first highlight — two "most popular" badges is invisible in the form', async () => {
    const { service } = build();
    await service.setLandingPlans([
      plan({ id: 'pro', highlighted: true, order: 0 }),
      plan({ id: 'vip', highlighted: true, order: 1 }),
    ]);
    const plans = await service.getLandingPlans();
    expect(plans.filter((p) => p.highlighted).map((p) => p.id)).toEqual(['pro']);
  });

  it('orders by `order`, not by insertion', async () => {
    const { service } = build();
    await service.setLandingPlans([
      plan({ id: 'vip', order: 0 }),
      plan({ id: 'starter', order: 2 }),
      plan({ id: 'pro', order: 1 }),
    ]);
    expect((await service.getLandingPlans()).map((p) => p.id)).toEqual(['vip', 'pro', 'starter']);
  });

  it('drops blank feature bullets rather than rendering empty list rows', async () => {
    const { service } = build();
    await service.setLandingPlans([plan({ featuresUz: ['Ombor', '   ', '', 'Hisobot'] })]);
    const starter = (await service.getLandingPlans()).find((p) => p.id === 'starter')!;
    expect(starter.featuresUz).toEqual(['Ombor', 'Hisobot']);
  });

  it('ignores an unknown tier id instead of inventing a fourth card', async () => {
    const { service, rows } = build();
    rows.set('landing_plans', JSON.stringify([{ id: 'enterprise', nameUz: 'Korxona' }]));
    expect((await service.getLandingPlans()).map((p) => p.id)).toEqual(['starter', 'pro', 'vip']);
  });

  it('falls back to three empty tiers when the stored row is not JSON', async () => {
    const { service, rows } = build();
    rows.set('landing_plans', 'not json at all');
    const plans = await service.getLandingPlans();
    expect(plans.map((p) => p.id)).toEqual(['starter', 'pro', 'vip']);
    expect(plans.every((p) => p.nameUz === '')).toBe(true);
  });

  it('holds no price — those come from subscription_plan_prices', async () => {
    const { service, rows } = build();
    await service.setLandingPlans([plan({})]);
    expect(rows.get('landing_plans')).not.toMatch(/price/i);
  });
});

const contact = (over: Partial<LandingContact>): LandingContact => ({
  phones: [],
  socials: [],
  email: '',
  addressRu: '',
  addressUz: '',
  workingHoursRu: '',
  workingHoursUz: '',
  ...over,
});

describe('landing contact', () => {
  it('is empty but well-formed before anything is saved', async () => {
    const { service } = build();
    const c = await service.getLandingContact();
    expect(c.phones).toEqual([]);
    expect(c.socials).toEqual([]);
  });

  it('drops a phone with no number — a label alone is nothing to call', async () => {
    const { service } = build();
    await service.setLandingContact(
      contact({ phones: [{ label: 'Sotuv', number: '+998901662714' }, { label: 'Fax', number: '' }] }),
    );
    expect((await service.getLandingContact()).phones).toEqual([
      { label: 'Sotuv', number: '+998901662714' },
    ]);
  });

  it('keeps a bare number with no label — it still dials', async () => {
    const { service } = build();
    await service.setLandingContact(contact({ phones: [{ label: '', number: '+998901662714' }] }));
    expect((await service.getLandingContact()).phones).toHaveLength(1);
  });

  it('accepts any platform, so a new network needs no release', async () => {
    const { service } = build();
    await service.setLandingContact(
      contact({ socials: [{ platform: 'threads', url: 'https://threads.net/@posgro', order: 0 }] }),
    );
    expect((await service.getLandingContact()).socials[0].platform).toBe('threads');
  });

  it('lowercases the platform so icon lookup is not case-sensitive', async () => {
    const { service } = build();
    await service.setLandingContact(
      contact({ socials: [{ platform: 'Telegram', url: 'https://t.me/x', order: 0 }] }),
    );
    expect((await service.getLandingContact()).socials[0].platform).toBe('telegram');
  });

  it('drops a social with no url and sorts the rest by order', async () => {
    const { service } = build();
    await service.setLandingContact(
      contact({
        socials: [
          { platform: 'instagram', url: 'https://instagram.com/posgro', order: 2 },
          { platform: 'youtube', url: '', order: 1 },
          { platform: 'telegram', url: 'https://t.me/posgro', order: 0 },
        ],
      }),
    );
    expect((await service.getLandingContact()).socials.map((s) => s.platform)).toEqual([
      'telegram',
      'instagram',
    ]);
  });

  it('survives an unreadable stored row', async () => {
    const { service, rows } = build();
    rows.set('landing_contact', '{{{');
    expect(await service.getLandingContact()).toEqual(contact({}));
  });
});
