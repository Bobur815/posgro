import { LeadsService } from './leads.service';
import type { CreateLeadDto } from './dto/create-lead.dto';

/**
 * The landing form is public and the button gets double-clicked: the rules worth pinning are that
 * a bot never reaches the table, and one person re-sending never becomes two leads or two pings.
 */

const dto = (over: Partial<CreateLeadDto> = {}): CreateLeadDto => ({
  fullName: 'Aliyev Vali',
  phone: '+998901234567',
  storeName: 'Baraka market',
  storeType: 'GROCERY',
  lang: 'ru',
  ...over,
});

function build(recent: { id: string } | null) {
  const prisma = {
    leadRequest: {
      findFirst: jest.fn(async () => recent),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'lead-1',
        createdAt: new Date('2026-09-30T05:00:00.000Z'),
        ...data,
      })),
      update: jest.fn(),
    },
  };
  const telegram = {
    notifySuperAdmins: jest.fn(async (render: (lang: 'uz' | 'ru') => string) => {
      render('uz');
      render('ru');
    }),
  };
  // Only the members the service touches are mocked.
  const service = new LeadsService(prisma as never, telegram as never);
  return { service, prisma, telegram };
}

describe('LeadsService.create', () => {
  it('saves a new lead and notifies super admins', async () => {
    const { service, prisma, telegram } = build(null);
    await expect(service.create(dto())).resolves.toEqual({ ok: true });
    expect(prisma.leadRequest.create).toHaveBeenCalledWith({
      data: {
        fullName: 'Aliyev Vali',
        phone: '+998901234567',
        storeName: 'Baraka market',
        storeType: 'GROCERY',
        lang: 'ru',
      },
    });
    expect(telegram.notifySuperAdmins).toHaveBeenCalledTimes(1);
  });

  it('defaults the language to uz', async () => {
    const { service, prisma } = build(null);
    await service.create(dto({ lang: undefined }));
    expect(prisma.leadRequest.create.mock.calls[0][0].data.lang).toBe('uz');
  });

  it('drops a filled honeypot without saving or notifying', async () => {
    const { service, prisma, telegram } = build(null);
    await expect(service.create(dto({ website: 'http://spam' }))).resolves.toEqual({ ok: true });
    expect(prisma.leadRequest.findFirst).not.toHaveBeenCalled();
    expect(prisma.leadRequest.create).not.toHaveBeenCalled();
    expect(telegram.notifySuperAdmins).not.toHaveBeenCalled();
  });

  it('updates a recent NEW lead from the same phone instead of creating a second', async () => {
    const { service, prisma, telegram } = build({ id: 'lead-0' });
    await service.create(dto({ storeName: 'Baraka market 2' }));
    expect(prisma.leadRequest.create).not.toHaveBeenCalled();
    expect(prisma.leadRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lead-0' } }),
    );
    expect(telegram.notifySuperAdmins).not.toHaveBeenCalled();
  });
});
