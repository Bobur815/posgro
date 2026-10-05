/**
 * Fiscal backlog stepper: rule #1 classification, marking verification with substitution, and a
 * fiscalisation tally that reports what actually reached FISCALIZED — never "no exception".
 */

jest.mock('electron', () => ({
  safeStorage: { isEncryptionAvailable: () => false },
}));
jest.mock('../logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../config/app-config', () => ({ getAppConfig: () => ({ terminalId: 'T1' }) }));

const getVcrPassword = jest.fn(async () => 'pw');
jest.mock('./secret-store', () => ({
  getVcrPassword: () => getVcrPassword(),
  hasVcrPassword: async () => true,
  setVcrPassword: async () => undefined,
}));

const isWriteFrozen = jest.fn(() => false);
jest.mock('../sales/write-freeze', () => ({ isWriteFrozen: () => isWriteFrozen() }));

type Lookup = {
  reachable: boolean;
  error?: string;
  details?: { isValid: boolean; status?: string };
};
const verifyMarkingCodeDetails = jest.fn<Promise<Lookup>, [string]>();
jest.mock('../marking/circulation-check', () => ({
  verifyMarkingCodeDetails: (code: string) => verifyMarkingCodeDetails(code),
}));

// ── A small in-memory SQLite stand-in: just the queries the backlog makes ─────────────────────
interface Item {
  productId: number;
  productName: string;
  barcode: string;
  quantity: number;
  piecesPerUnit: number;
  subtotal: number;
  product: {
    id: number;
    nameRu: string;
    nameUz: string;
    barcode: string;
    mxik: string | null;
    isMarked: boolean | null;
    packageCode: string | null;
  };
}
interface Row {
  id: string;
  receiptNumber: string;
  createdAt: Date;
  finalAmount: number;
  paymentMethod: string;
  debtAmount: number;
  fiscalStatus: string | null;
  fiscalError: string | null;
  fiscalAttempts: number;
  regosLabels: string | null;
  fiscalSubstitutions: string | null;
  smenaId: string | null;
  cashierName: string;
  discountAmount: number;
  regosPaymentId: string | null;
  payments: Array<{ method: string }>;
  items: Item[];
}

let sales: Row[] = [];
let settings: Record<string, string> = {};

const PLAIN = {
  id: 1,
  nameRu: 'Хлеб',
  nameUz: 'Non',
  barcode: '111',
  mxik: '01234567890123456',
  isMarked: false,
  packageCode: null,
};
const MARKED = {
  id: 2,
  nameRu: 'Сигареты',
  nameUz: 'Sigaret',
  barcode: '222',
  mxik: '02202001001001001',
  isMarked: true,
  packageCode: '1500',
};
const SUBST = {
  id: 103,
  nameRu: 'Deya Bis',
  nameUz: 'Deya Bis',
  barcode: '4780068852396',
  mxik: '06302001007001012',
  isMarked: false,
  packageCode: '9001',
  vatRate: 12,
  unit: 'кг',
  category: { nameRu: 'Весовой' },
};

function item(product: typeof PLAIN | typeof MARKED, subtotal = 1000): Item {
  return {
    productId: product.id,
    productName: product.nameRu,
    barcode: product.barcode,
    quantity: 1,
    piecesPerUnit: 1,
    subtotal,
    product,
  };
}

function sale(id: string, over: Partial<Row>): Row {
  return {
    id,
    receiptNumber: id.toUpperCase(),
    createdAt: new Date(2026, 9, 2, 12),
    finalAmount: 1000,
    paymentMethod: 'cash',
    debtAmount: 0,
    fiscalStatus: 'PENDING',
    fiscalError: null,
    fiscalAttempts: 0,
    regosLabels: null,
    fiscalSubstitutions: null,
    smenaId: 'smena-1',
    cashierName: 'Cashier',
    discountAmount: 0,
    regosPaymentId: null,
    payments: [],
    items: [item(PLAIN)],
    ...over,
  };
}

type Where = {
  id?: string | { in: string[] };
  createdAt?: { gte: Date };
  OR?: Array<{ fiscalStatus: null | { notIn: string[] } }>;
};
function matches(r: Row, where: Where): boolean {
  if (typeof where.id === 'string' && r.id !== where.id) return false;
  if (where.id && typeof where.id === 'object' && !where.id.in.includes(r.id)) return false;
  if (where.createdAt && r.createdAt < where.createdAt.gte) return false;
  if (where.OR) {
    const ok = where.OR.some((c) =>
      c.fiscalStatus === null
        ? r.fiscalStatus === null
        : r.fiscalStatus !== null && !c.fiscalStatus.notIn.includes(r.fiscalStatus),
    );
    if (!ok) return false;
  }
  return true;
}

const prismaMock = {
  systemSetting: {
    findMany: jest.fn(async () => Object.entries(settings).map(([key, value]) => ({ key, value }))),
    findUnique: jest.fn(async () => null),
    upsert: jest.fn(async () => undefined),
  },
  sale: {
    findMany: jest.fn(async ({ where }: { where: Where }) =>
      sales.filter((r) => matches(r, where)),
    ),
    findUnique: jest.fn(
      async ({ where }: { where: { id: string } }) => sales.find((r) => r.id === where.id) ?? null,
    ),
    update: jest.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = sales.find((s) => s.id === where.id);
        if (r) {
          for (const [k, v] of Object.entries(data)) {
            (r as unknown as Record<string, unknown>)[k] =
              v && typeof v === 'object' && 'increment' in (v as object)
                ? (r[k as 'fiscalAttempts'] ?? 0) + 1
                : v;
          }
        }
        return r;
      },
    ),
    updateMany: jest.fn(
      async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const hit = sales.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      },
    ),
  },
  product: {
    findMany: jest.fn(async ({ where }: { where: { id: { in: number[] } } }) =>
      [PLAIN, MARKED]
        .filter((p) => where.id.in.includes(p.id))
        .map((p) => ({ ...p, vatRate: 12, unit: 'шт', category: { nameRu: 'Прочее' } })),
    ),
    findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
      where.id === SUBST.id ? SUBST : null,
    ),
    update: jest.fn(async () => undefined),
  },
  smena: {
    update: jest.fn(async () => undefined),
    findFirst: jest.fn(async () => ({ id: 'smena-1' })),
  },
};
jest.mock('../database/sqlite-client', () => ({ getPrismaClient: () => prismaMock }));

const client = {
  zGetInfo: jest.fn(async () => ({ OpenTime: '2026-10-04 08:00:00', CloseTime: '' })),
  zOpen: jest.fn(async () => ({ id: 7 })),
  validateSale: jest.fn(async () => ({ validate: true })),
  sale: jest.fn<Promise<unknown>, [{ positions: Array<Record<string, unknown>> }]>(),
  getReceiptInfo: jest.fn(async () => null),
};
jest.mock('./regos-vcr-client', () => {
  const actual = jest.requireActual('./regos-vcr-client');
  return { ...actual, RegosVcrClient: jest.fn(() => client) };
});

import { VcrError } from './regos-vcr-client';
import { regosVcrService } from './regos-vcr-service';
import { SKIP_TAG } from '../../shared/utils/fiscal-backlog';

const FROM = '2026-10-01';
const RU_LABEL =
  '010869954300836321ФК1600001402291ГЯА092Й2Ьцв50птЯФшоОЯвнсНСимдаьф9шНлПМ3ДВ6я71ЗЬТН=';
const EN_LABEL =
  '010869954300836321AR1600001402291UZF092Q2Mwd50gnZAijJZdycYCbvlfma9iYkGV3LD6z71PMNY=';

beforeEach(() => {
  jest.clearAllMocks();
  getVcrPassword.mockImplementation(async () => 'pw');
  isWriteFrozen.mockImplementation(() => false);
  settings = {
    regos_vcr_enabled: 'true',
    regos_vcr_vat: '12',
    regos_vcr_pos_id: 'POS1',
    regos_vcr_substitute_product_id: String(SUBST.id),
  };
  client.sale.mockResolvedValue({
    Id: 'v',
    FiscalSign: 'S',
    QRCodeURL: 'q',
    TerminalID: 'T',
    ReceiptNo: '1',
  });
  (regosVcrService as unknown as { zReportOpen: boolean }).zReportOpen = true;
});

describe('step 1 — classify (rule #1)', () => {
  it('disables only cash/Click-only receipts without marked goods, and tags them', async () => {
    sales = [
      sale('cash-plain', {}),
      sale('click-plain', { paymentMethod: 'click' }),
      sale('mixed-cash-click', {
        paymentMethod: 'mixed',
        payments: [{ method: 'cash' }, { method: 'click' }],
      }),
      sale('card-plain', { paymentMethod: 'card' }),
      sale('mixed-cash-card', {
        paymentMethod: 'mixed',
        payments: [{ method: 'cash' }, { method: 'card' }],
      }),
      sale('cash-marked', { items: [item(MARKED)] }),
      sale('old-disabled-card', { paymentMethod: 'card', fiscalStatus: 'DISABLED' }),
      sale('debt', { fiscalStatus: 'DEFERRED_DEBT' }),
      sale('done', { fiscalStatus: 'FISCALIZED' }),
      sale('before-from', { createdAt: new Date(2026, 8, 30) }),
    ];

    const r = await regosVcrService.backlogClassify(FROM);

    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(3);
    expect(r.kept.map((k) => k.saleId).sort()).toEqual([
      'card-plain',
      'cash-marked',
      'mixed-cash-card',
      'old-disabled-card',
    ]);
    const byId = Object.fromEntries(sales.map((s) => [s.id, s]));
    expect(byId['cash-plain'].fiscalStatus).toBe('DISABLED');
    expect(byId['cash-plain'].fiscalError).toBe(SKIP_TAG);
    expect(byId['card-plain'].fiscalStatus).toBe('PENDING');
    expect(byId['debt'].fiscalStatus).toBe('DEFERRED_DEBT');
    expect(byId['before-from'].fiscalStatus).toBe('PENDING');
  });

  it('never takes a receipt skipped by an earlier run again', async () => {
    sales = [sale('skipped', { fiscalStatus: 'DISABLED', fiscalError: SKIP_TAG })];
    const r = await regosVcrService.backlogClassify(FROM);
    expect(r).toEqual({ ok: true, skipped: 0, kept: [] });
  });
});

describe('step 2 — repair', () => {
  it('restores a marking code captured under a Russian layout and lists products REGOS will reject', async () => {
    const noMxik = { ...PLAIN, id: 9, mxik: null, barcode: '999' };
    sales = [
      sale('marked', {
        paymentMethod: 'card',
        items: [item(MARKED), { ...item(PLAIN), product: noMxik, productId: 9, barcode: '999' }],
        regosLabels: JSON.stringify([{ barcode: '222', label: RU_LABEL }]),
      }),
    ];

    const r = await regosVcrService.backlogRepair(FROM);

    expect(r.labelsRepaired).toBe(1);
    expect(JSON.parse(sales[0].regosLabels!)).toEqual([{ barcode: '222', label: EN_LABEL }]);
    expect(r.productIssues).toEqual([
      { productId: 9, name: 'Хлеб', barcode: '999', problem: 'NO_MXIK' },
    ]);
  });
});

describe('step 3 — verify marking codes', () => {
  const markedSale = (labels: Array<{ barcode: string; label: string }> | null) =>
    sale('m', {
      paymentMethod: 'card',
      items: [item(MARKED, 5000)],
      regosLabels: labels ? JSON.stringify(labels) : null,
    });

  it('substitutes a line whose code is out of circulation', async () => {
    sales = [markedSale([{ barcode: '222', label: EN_LABEL }])];
    verifyMarkingCodeDetails.mockResolvedValue({
      reachable: true,
      details: { isValid: true, status: 'WITHDRAWN' },
    });

    const r = await regosVcrService.backlogVerify(FROM);

    expect(r.ok).toBe(true);
    expect(r.substituted).toHaveLength(1);
    expect(JSON.parse(sales[0].fiscalSubstitutions!)).toEqual([
      { barcode: '222', reason: 'WITHDRAWN' },
    ]);
  });

  it('substitutes a marked line that was never scanned', async () => {
    sales = [markedSale(null)];
    const r = await regosVcrService.backlogVerify(FROM);
    expect(verifyMarkingCodeDetails).not.toHaveBeenCalled();
    expect(JSON.parse(sales[0].fiscalSubstitutions!)).toEqual([
      { barcode: '222', reason: 'NO_LABEL' },
    ]);
    expect(r.ok).toBe(true);
  });

  it('clears an older substitution once the code checks out', async () => {
    sales = [
      {
        ...markedSale([{ barcode: '222', label: EN_LABEL }]),
        fiscalSubstitutions: '[{"barcode":"222","reason":"NO_LABEL"}]',
      },
    ];
    verifyMarkingCodeDetails.mockResolvedValue({
      reachable: true,
      details: { isValid: true, status: 'INTRODUCED' },
    });
    const r = await regosVcrService.backlogVerify(FROM);
    expect(r.ok).toBe(true);
    expect(sales[0].fiscalSubstitutions).toBeNull();
  });

  it('stops when the registry cannot be reached', async () => {
    sales = [markedSale([{ barcode: '222', label: EN_LABEL }])];
    verifyMarkingCodeDetails.mockResolvedValue({
      reachable: false,
      error: 'REGISTRY_KEY_REJECTED',
    });
    const r = await regosVcrService.backlogVerify(FROM);
    expect(r).toMatchObject({
      ok: false,
      error: 'REGISTRY_KEY_REJECTED',
      stoppedAt: { receipt: 'M' },
    });
    expect(sales[0].fiscalSubstitutions).toBeNull();
  });

  it('stops on a status it cannot classify', async () => {
    sales = [markedSale([{ barcode: '222', label: EN_LABEL }])];
    verifyMarkingCodeDetails.mockResolvedValue({
      reachable: true,
      details: { isValid: true, status: 'SOMETHING_NEW' },
    });
    const r = await regosVcrService.backlogVerify(FROM);
    expect(r).toMatchObject({ ok: false, error: 'UNKNOWN_STATUS:SOMETHING_NEW' });
  });

  it('stops when a substitute is needed but none is chosen', async () => {
    delete settings.regos_vcr_substitute_product_id;
    sales = [markedSale(null)];
    const r = await regosVcrService.backlogVerify(FROM);
    expect(r).toMatchObject({ ok: false, error: 'NO_SUBSTITUTE' });
  });
});

describe('step 4 — fiscalize', () => {
  it('sends a substituted line as 1 kg of the substitute at the same amount, without the dead code', async () => {
    sales = [
      sale('m', {
        paymentMethod: 'card',
        items: [item(MARKED, 5000), item(PLAIN, 1000)],
        regosLabels: JSON.stringify([{ barcode: '222', label: EN_LABEL }]),
        fiscalSubstitutions: JSON.stringify([{ barcode: '222', reason: 'WITHDRAWN' }]),
      }),
    ];

    const r = await regosVcrService.backlogFiscalize(FROM);

    expect(r).toMatchObject({ ok: true, fiscalized: 1, failed: [] });
    const [sub, plain] = client.sale.mock.calls[0][0].positions;
    expect(sub).toMatchObject({
      barcode: SUBST.barcode,
      icps: SUBST.mxik,
      package_code: SUBST.packageCode,
      amount: 500000,
      quantity: 1000,
    });
    expect(sub.label).toBeUndefined();
    expect(plain).toMatchObject({ barcode: '111', quantity: 1000, amount: 100000 });
    // The sale itself is untouched: same lines, same totals.
    expect(sales[0].items.map((i) => i.barcode)).toEqual(['222', '111']);
  });

  it('does not count a receipt the service quietly skipped (write freeze) as fiscalised', async () => {
    isWriteFrozen.mockImplementation(() => true);
    sales = [sale('c', { paymentMethod: 'card' })];
    const r = await regosVcrService.backlogFiscalize(FROM);
    expect(r.fiscalized).toBe(0);
    expect(r.failed).toEqual([{ receipt: 'C', error: 'NOT_FISCALIZED' }]);
  });

  it('refuses to start without a cashier password', async () => {
    getVcrPassword.mockImplementation(async () => '');
    sales = [sale('c', { paymentMethod: 'card' })];
    const r = await regosVcrService.backlogFiscalize(FROM);
    expect(r).toMatchObject({ ok: false, error: 'NO_PASSWORD', fiscalized: 0 });
    expect(client.sale).not.toHaveBeenCalled();
  });

  it('stops when the device stops answering and leaves the rest alone', async () => {
    sales = [sale('a', { paymentMethod: 'card' }), sale('b', { paymentMethod: 'card' })];
    client.sale.mockRejectedValueOnce(new VcrError(0, 'fetch failed', 'Receipt.Sale'));
    const r = await regosVcrService.backlogFiscalize(FROM);
    expect(r).toMatchObject({
      ok: false,
      error: 'VCR_UNREACHABLE',
      unreachable: true,
      fiscalized: 0,
    });
    expect(client.sale).toHaveBeenCalledTimes(1);
    expect(sales[1].fiscalStatus).toBe('PENDING');
  });

  it('does not run twice at once', async () => {
    sales = [sale('a', { paymentMethod: 'card' })];
    const first = regosVcrService.backlogFiscalize(FROM);
    const second = await regosVcrService.backlogFiscalize(FROM);
    expect(second).toMatchObject({ ok: false, error: 'BUSY' });
    await first;
  });
});
