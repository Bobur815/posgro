import { StoresService } from './stores.service';
import { DAY_MS } from '../../../shared/utils/subscription';

/**
 * The paid fiscal backlog service: a super admin opens it for N days, or closes it with 0. The
 * date is what the store's license carries to its tills.
 */
function build() {
  const prisma = {
    store: {
      findUnique: jest.fn(async () => ({
        id: '1000',
        name: 'Shop',
        superAdminPassword: null,
        _count: {},
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: '1000',
        ...data,
      })),
    },
  };
  const service = new StoresService(prisma as never, {} as never, {} as never, {} as never);
  return { service, prisma };
}

describe('StoresService.update — fiscal backlog service', () => {
  it('opens it for the number of days given, from now', async () => {
    const { service, prisma } = build();
    const before = Date.now();

    await service.update('1000', { fiscalBacklogDays: 7 });

    const until = prisma.store.update.mock.calls[0][0].data.fiscalBacklogUntil as Date;
    expect(until.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY_MS);
    expect(until.getTime()).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS);
  });

  it('closes it with 0', async () => {
    const { service, prisma } = build();
    await service.update('1000', { fiscalBacklogDays: 0 });
    expect(prisma.store.update.mock.calls[0][0].data).toEqual({ fiscalBacklogUntil: null });
  });

  it('leaves it alone when the field is not sent', async () => {
    const { service, prisma } = build();
    await service.update('1000', { name: 'New name' });
    expect(prisma.store.update.mock.calls[0][0].data).not.toHaveProperty('fiscalBacklogUntil');
  });
});
