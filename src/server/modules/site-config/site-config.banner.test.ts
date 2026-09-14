import { SiteConfigService, type LoginBanner } from './site-config.service';

/**
 * The POS terminals and the web dashboard have a login banner each. The POS one keeps the key every
 * till in the field already reads; the dashboard's is new, and falls back to the POS one until it
 * is saved — so the dashboard does not lose its image the day the two were split.
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

const POS: LoginBanner = { imageUrl: '/uploads/till.jpg', title: 'Till', subtitle: 'For cashiers' };
const WEB: LoginBanner = { imageUrl: '/uploads/laptop.jpg', title: 'Dashboard', subtitle: 'For owners' };

describe('login banners', () => {
  it('keeps the POS banner under the key the terminals already read', async () => {
    const { service, rows } = build();
    await service.setLoginBanner(POS);
    expect(JSON.parse(rows.get('login_banner')!)).toEqual(POS);
  });

  it('shows the POS banner on the web login until a web one is saved', async () => {
    const { service } = build();
    await service.setLoginBanner(POS);
    expect(await service.getWebLoginBanner()).toEqual(POS);
  });

  it('keeps the two apart once the web banner is saved', async () => {
    const { service } = build();
    await service.setLoginBanner(POS);
    await service.setWebLoginBanner(WEB);

    expect(await service.getWebLoginBanner()).toEqual(WEB);
    expect(await service.getLoginBanner()).toEqual(POS);

    await service.setLoginBanner({ ...POS, title: 'Changed' });
    expect(await service.getWebLoginBanner()).toEqual(WEB);
  });

  it('keeps an emptied web banner empty, rather than falling back to the POS one', async () => {
    const { service } = build();
    await service.setLoginBanner(POS);
    const empty = { imageUrl: '', title: '', subtitle: '' };
    await service.setWebLoginBanner(empty);
    expect(await service.getWebLoginBanner()).toEqual(empty);
  });

  it('answers empty when nothing was ever saved', async () => {
    const { service } = build();
    expect(await service.getLoginBanner()).toEqual({ imageUrl: '', title: '', subtitle: '' });
    expect(await service.getWebLoginBanner()).toEqual({ imageUrl: '', title: '', subtitle: '' });
  });
});
