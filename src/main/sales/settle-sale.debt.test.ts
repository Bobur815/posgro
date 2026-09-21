/**
 * A credit sale is not fiscalized until it has been paid for.
 *
 * This is the rule with money and law behind it, and it is enforced in two places that have to
 * agree: `settleSale` must park the receipt in a status no retry sweep selects, and
 * `fiscalizeSettledSale` must be the only thing that releases it. A sale left PENDING would be
 * picked up by `processPending` — at the next sync, or at shift close — and filed with the tax
 * office as though the customer had paid, which is the failure this test exists to prevent.
 */

jest.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => false } }));

const prismaMock = {
  sale: {
    findUnique: jest.fn<Promise<unknown>, unknown[]>(),
    update: jest.fn(async () => undefined),
  },
};
jest.mock('../database/sqlite-client', () => ({ getPrismaClient: () => prismaMock }));

const vcrMock = {
  isEnabled: jest.fn(async () => true),
  fiscalizeSale: jest.fn(async () => undefined),
};
jest.mock('../fiscal/regos-vcr-service', () => ({ regosVcrService: vcrMock }));
jest.mock('../ipc/marking-codes-handlers', () => ({ savePendingMarkingCodes: jest.fn() }));
jest.mock('./commit-sale', () => ({ markSettled: jest.fn() }));

import { fiscalizeSettledSale, settleSale } from './settle-sale';

/** The fiscal fields the sale row was updated with. */
const updatedWith = () =>
  (prismaMock.sale.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;

beforeEach(() => {
  jest.clearAllMocks();
  vcrMock.isEnabled.mockResolvedValue(true);
});

describe('settling a credit sale', () => {
  it('parks it in a status no retry sweep selects, and fiscalizes nothing', async () => {
    prismaMock.sale.findUnique.mockResolvedValue({ debtAmount: 70_000 });

    const { fiscalizing } = await settleSale('sale-1', { fiscalize: true }, 'T1');

    expect(updatedWith().fiscalStatus).toBe('DEFERRED_DEBT');
    // processPending sweeps PENDING and FAILED; DEFERRED_DEBT is neither, deliberately.
    expect(updatedWith().fiscalStatus).not.toBe('PENDING');
    expect(vcrMock.fiscalizeSale).not.toHaveBeenCalled();
    expect(fiscalizing).toBeNull();
  });

  it('still defers when the cashier ticked fiscalize', async () => {
    // The checkbox asks for "now rather than later"; it cannot ask for "before it is paid for".
    prismaMock.sale.findUnique.mockResolvedValue({ debtAmount: 1 });

    await settleSale('sale-2', { fiscalize: true }, 'T1');

    expect(vcrMock.fiscalizeSale).not.toHaveBeenCalled();
  });

  it('fiscalizes an ordinary sale exactly as before', async () => {
    prismaMock.sale.findUnique.mockResolvedValue({ debtAmount: 0 });

    const { fiscalizing } = await settleSale('sale-3', { fiscalize: true }, 'T1');
    await fiscalizing;

    expect(updatedWith().fiscalStatus).toBe('PENDING');
    expect(vcrMock.fiscalizeSale).toHaveBeenCalledWith('sale-3');
  });
});

describe('fiscalizing once it has been paid for', () => {
  it('promotes the receipt and books it against the tender that settled it', async () => {
    prismaMock.sale.findUnique.mockResolvedValue({ fiscalStatus: 'DEFERRED_DEBT' });

    await fiscalizeSettledSale('sale-1', 'card');

    // buildPayments() reads paymentMethod off the row, so it has to say how the money arrived.
    expect(updatedWith()).toMatchObject({ fiscalStatus: 'PENDING', paymentMethod: 'card' });
    expect(vcrMock.fiscalizeSale).toHaveBeenCalledWith('sale-1');
  });

  it('leaves a receipt that was never deferred alone', async () => {
    // A cash sale that failed and is waiting for its retry must not be rewritten by a payment
    // against some other debt.
    prismaMock.sale.findUnique.mockResolvedValue({ fiscalStatus: 'FAILED' });

    await fiscalizeSettledSale('sale-9', 'cash');

    expect(prismaMock.sale.update).not.toHaveBeenCalled();
    expect(vcrMock.fiscalizeSale).not.toHaveBeenCalled();
  });

  it('does not fiscalize the same receipt twice', async () => {
    prismaMock.sale.findUnique.mockResolvedValue({ fiscalStatus: 'FISCALIZED' });

    await fiscalizeSettledSale('sale-8', 'cash');

    expect(vcrMock.fiscalizeSale).not.toHaveBeenCalled();
  });

  it('stays quiet when fiscalization is switched off entirely', async () => {
    vcrMock.isEnabled.mockResolvedValue(false);

    await fiscalizeSettledSale('sale-7', 'cash');

    expect(prismaMock.sale.update).not.toHaveBeenCalled();
  });
});
