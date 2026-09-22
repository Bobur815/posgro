import { HttpException } from '@nestjs/common';
import { BALANCE_NEGATIVE, InvoiceScannerController } from './invoice-scanner.controller';

/** One balance pays for the subscription and paid scans: a spent one stops paid scans. */
function build(store: { aiPlan: string; balance: number } | null) {
  const scanner = {
    scanPaid: jest.fn(async () => ({ items: [], cost_usd: 0.004 })),
    scanFree: jest.fn(async () => ({ items: [] })),
  };
  const prisma = { store: { findUnique: jest.fn(async () => store) } };
  const balance = { apply: jest.fn(async () => 12_345) };
  const controller = new InvoiceScannerController(scanner as never, prisma as never, balance as never);
  return { controller, scanner, balance };
}
const body = { imageBase64: 'x', mimeType: 'image/png' };

describe('a paid scan and the store balance', () => {
  it.each([0, -50_000])('is refused, uncharged, at a balance of %d', async (value) => {
    const { controller, scanner, balance } = build({ aiPlan: 'paid', balance: value });
    const refusal = await controller.scan(body as never, '1000').catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(HttpException);
    expect((refusal as HttpException).getStatus()).toBe(402);
    expect((refusal as HttpException).message).toBe(BALANCE_NEGATIVE);
    expect(scanner.scanPaid).not.toHaveBeenCalled();
    expect(balance.apply).not.toHaveBeenCalled();
  });

  it('is charged to the ledger when there is money', async () => {
    const { controller, balance } = build({ aiPlan: 'paid', balance: 10_000 });
    const result = await controller.scan(body as never, '1000');
    expect(balance.apply).toHaveBeenCalledWith('1000', expect.objectContaining({ type: 'AI_SCAN', amount: -66 }));
    expect(result).toMatchObject({ charged_uzs: 66, balance_uzs: 12_345 });
  });

  it('leaves the free tier alone whatever the balance', async () => {
    const { controller, scanner } = build({ aiPlan: 'free', balance: -1 });
    await controller.scan(body as never, '1000');
    expect(scanner.scanFree).toHaveBeenCalled();
  });
});
