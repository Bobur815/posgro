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

type TasnifResult =
  | { ok: true; match: { code: string; name: string; nameRu: string } | null }
  | { ok: false };
const lookupMxikByBarcode = jest.fn<Promise<TasnifResult>, [string]>();
const getMxikPackages = jest.fn<Promise<Array<{ code: string; name: string }>>, [string]>();
jest.mock('./tasnif', () => ({
  lookupMxikByBarcode: (barcode: string) => lookupMxikByBarcode(barcode),
  getMxikPackages: (mxik: string) => getMxikPackages(mxik),
}));

// ── A small in-memory SQLite stand-in: just the queries the backlog makes ─────────────────────
interface Item {
  id: string;
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
  regosFiscalAt?: Date | null;
  regosReceiptNo?: string | null;
  smenaId: string | null;
  cashierName: string;
  discountAmount: number;
  regosPaymentId: string | null;
  payments: Array<{ method: string }>;
  items: Item[];
}

let sales: Row[] = [];
let settings: Record<string, string> = {};
/** Products findMany can see (the payload builder reads them). */
let catalog: Array<Item['product']> = [];

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

let itemSeq = 0;
function item(product: Item['product'], subtotal = 1000): Item {
  return {
    id: `it-${++itemSeq}`,
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
  fiscalStatus?: string;
  regosFiscalAt?: { lt: Date };
};
function matches(r: Row, where: Where): boolean {
  if (typeof where.id === 'string' && r.id !== where.id) return false;
  if (where.id && typeof where.id === 'object' && !where.id.in.includes(r.id)) return false;
  if (where.createdAt && r.createdAt < where.createdAt.gte) return false;
  if (typeof where.fiscalStatus === 'string' && r.fiscalStatus !== where.fiscalStatus) return false;
  if (where.regosFiscalAt && !(r.regosFiscalAt && r.regosFiscalAt < where.regosFiscalAt.lt))
    return false;
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
    findUnique: jest.fn<Promise<{ key: string; value: string } | null>, unknown[]>(
      async () => null,
    ),
    create: jest.fn(async () => undefined),
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
    findMany: jest.fn(
      async ({ where }: { where: { id?: { in: number[] }; mxik?: { not: null } } }) =>
        where.id
          ? catalog
              .filter((p) => where.id!.in.includes(p.id))
              .map((p) => ({ ...p, vatRate: 12, unit: 'шт', category: { nameRu: 'Прочее' } }))
          : catalog.filter((p) => p.mxik != null).map((p) => ({ id: p.id, mxik: p.mxik })),
    ),
    findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
      where.id === SUBST.id ? SUBST : null,
    ),
    // Writes through to the catalog and the sale lines, like the real row both read from.
    update: jest.fn(
      async ({ where, data }: { where: { id: number }; data: Partial<Item['product']> }) => {
        const hits = [
          ...catalog.filter((p) => p.id === where.id),
          ...sales.flatMap((s) => s.items.map((it) => it.product)).filter((p) => p.id === where.id),
        ];
        for (const p of new Set(hits)) Object.assign(p, data);
      },
    ),
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
import { SKIP_TAG, SKIP_TAG_MARKING } from '../../shared/utils/fiscal-backlog';

const FROM = '2026-10-01';
const RU_LABEL =
  '010869954300836321ФК1600001402291ГЯА092Й2Ьцв50птЯФшоОЯвнсНСимдаьф9шНлПМ3ДВ6я71ЗЬТН=';
const EN_LABEL =
  '010869954300836321AR1600001402291UZF092Q2Mwd50gnZAijJZdycYCbvlfma9iYkGV3LD6z71PMNY=';

beforeEach(() => {
  jest.clearAllMocks();
  getVcrPassword.mockImplementation(async () => 'pw');
  isWriteFrozen.mockImplementation(() => false);
  lookupMxikByBarcode.mockResolvedValue({ ok: true, match: null });
  getMxikPackages.mockResolvedValue([]);
  catalog = [PLAIN, MARKED];
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

/** asl-belgisi answers per code: valid ones IN, the rest WITHDRAWN. */
function registry(valid: string[]) {
  verifyMarkingCodeDetails.mockImplementation(async (code) => ({
    reachable: true,
    details: { isValid: true, status: valid.includes(code) ? 'INTRODUCED' : 'WITHDRAWN' },
  }));
}

const plan = (s: Row) => JSON.parse(s.fiscalSubstitutions ?? 'null');

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
    sales = [
      sale('skipped', { fiscalStatus: 'DISABLED', fiscalError: SKIP_TAG }),
      sale('skipped-marking', {
        fiscalStatus: 'DISABLED',
        fiscalError: SKIP_TAG_MARKING,
        items: [item(MARKED)],
      }),
    ];
    const r = await regosVcrService.backlogClassify(FROM);
    expect(r).toEqual({ ok: true, skipped: 0, kept: [] });
  });
});

describe('step 2 — repair', () => {
  it('restores a marking code captured under a Russian layout', async () => {
    sales = [
      sale('marked', {
        paymentMethod: 'card',
        items: [item(MARKED)],
        regosLabels: JSON.stringify([{ barcode: '222', label: RU_LABEL }]),
      }),
    ];

    const r = await regosVcrService.backlogRepair(FROM);

    expect(r.labelsRepaired).toBe(1);
    expect(JSON.parse(sales[0].regosLabels!)).toEqual([{ barcode: '222', label: EN_LABEL }]);
    expect(r.productIssues).toEqual([]);
  });

  it('fills a missing MXIK from tasnif and saves it, with the package code for a marked product', async () => {
    const noMxikMarked = {
      ...MARKED,
      id: 7,
      barcode: '777',
      mxik: null,
      isMarked: null,
      packageCode: null,
    };
    sales = [sale('c', { paymentMethod: 'card', items: [item(noMxikMarked)] })];
    lookupMxikByBarcode.mockResolvedValue({
      ok: true,
      match: { code: '02202001001001009', name: 'x', nameRu: 'x' },
    });
    getMxikPackages.mockResolvedValue([
      { code: '1001', name: 'блок=10 шт' },
      { code: '1500', name: 'шт (пачка)' },
    ]);

    const r = await regosVcrService.backlogRepair(FROM);

    expect(lookupMxikByBarcode).toHaveBeenCalledWith('777');
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { mxik: '02202001001001009', packageCode: '1500' },
    });
    expect(r.mxikFilled).toEqual([
      { productId: 7, name: 'Сигареты', barcode: '777', mxik: '02202001001001009' },
    ]);
    expect(r.productIssues).toEqual([]);
  });

  it('strips whitespace from a stored MXIK instead of asking tasnif and reporting NO_MXIK', async () => {
    // A till stored "01905007001000000 " (length 18) on 51 products; tasnif has no match for a
    // store-made barcode, so each one came out as NO_MXIK.
    const spaced = { ...PLAIN, id: 1410, barcode: '4001020402108', mxik: '01905007001000000 ' };
    const elsewhere = { ...PLAIN, id: 1411, barcode: '4001095110687', mxik: '\u00A000401001001000000' };
    catalog = [PLAIN, spaced, elsewhere];
    sales = [sale('c', { paymentMethod: 'card', items: [item(spaced)] })];

    const r = await regosVcrService.backlogRepair(FROM);

    expect(lookupMxikByBarcode).not.toHaveBeenCalled();
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 1410 },
      data: { mxik: '01905007001000000' },
    });
    // Not in any backlog receipt, cleaned all the same.
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 1411 },
      data: { mxik: '00401001001000000' },
    });
    expect(prismaMock.product.update).toHaveBeenCalledTimes(2);
    expect(r.mxikCleaned).toBe(2);
    expect(r.mxikFilled).toEqual([]);
    expect(r.productIssues).toEqual([]);
  });

  it('warns, without stopping, when tasnif cannot be asked or has no exact match', async () => {
    const a = { ...PLAIN, id: 8, barcode: '888', mxik: null };
    const b = { ...PLAIN, id: 9, barcode: '999', mxik: null };
    sales = [sale('c', { paymentMethod: 'card', items: [item(a), item(b)] })];
    lookupMxikByBarcode.mockImplementation(async (bc) =>
      bc === '888' ? { ok: false } : { ok: true, match: null },
    );

    const r = await regosVcrService.backlogRepair(FROM);

    expect(r.ok).toBe(true);
    expect(r.tasnifUnreachable).toBe(1);
    expect(r.productIssues.map((p) => [p.productId, p.problem])).toEqual([
      [8, 'NO_MXIK'],
      [9, 'NO_MXIK'],
    ]);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });
});

describe('step 3 — verify, card receipts (sent in full)', () => {
  const cardSale = (labels: Array<{ barcode: string; label: string }> | null) =>
    sale('m', {
      paymentMethod: 'card',
      items: [item(MARKED, 5000)],
      regosLabels: labels ? JSON.stringify(labels) : null,
    });

  it('substitutes a line whose code is out of circulation', async () => {
    sales = [cardSale([{ barcode: '222', label: 'CODE-A' }])];
    registry([]);

    const r = await regosVcrService.backlogVerify(FROM);

    expect(r.ok).toBe(true);
    expect(r.changes).toEqual([
      { receipt: 'M', productName: 'Сигареты', reason: 'WITHDRAWN', action: 'substitute' },
    ]);
    expect(plan(sales[0])).toEqual([
      { itemId: sales[0].items[0].id, action: 'substitute', reason: 'WITHDRAWN' },
    ]);
  });

  it('substitutes a marked line that was never scanned', async () => {
    sales = [cardSale(null)];
    const r = await regosVcrService.backlogVerify(FROM);
    expect(verifyMarkingCodeDetails).not.toHaveBeenCalled();
    expect(plan(sales[0])).toEqual([
      { itemId: sales[0].items[0].id, action: 'substitute', reason: 'NO_LABEL' },
    ]);
    expect(r.ok).toBe(true);
  });

  it('judges two packs of one drink by their own codes', async () => {
    sales = [
      sale('m', {
        paymentMethod: 'card',
        items: [item(MARKED, 5000), item(MARKED, 5000)],
        regosLabels: JSON.stringify([
          { barcode: '222', label: 'CODE-A' },
          { barcode: '222', label: 'CODE-B' },
        ]),
      }),
    ];
    registry(['CODE-A']);

    await regosVcrService.backlogVerify(FROM);

    expect(plan(sales[0])).toEqual([
      { itemId: sales[0].items[1].id, action: 'substitute', reason: 'WITHDRAWN' },
    ]);
  });

  it('clears an older plan once the code checks out', async () => {
    sales = [{ ...cardSale([{ barcode: '222', label: 'CODE-A' }]), fiscalSubstitutions: '[]' }];
    sales[0].fiscalSubstitutions = JSON.stringify([
      { itemId: sales[0].items[0].id, action: 'substitute', reason: 'NO_LABEL' },
    ]);
    registry(['CODE-A']);
    const r = await regosVcrService.backlogVerify(FROM);
    expect(r.ok).toBe(true);
    expect(sales[0].fiscalSubstitutions).toBeNull();
  });

  it('stops when the registry cannot be reached', async () => {
    sales = [cardSale([{ barcode: '222', label: 'CODE-A' }])];
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

  // REGOS decides on a status we do not classify (user, 2026-10-09); the step does not stop.
  it('sends a code with a status it cannot classify as it is', async () => {
    sales = [cardSale([{ barcode: '222', label: 'CODE-A' }])];
    verifyMarkingCodeDetails.mockResolvedValue({
      reachable: true,
      details: { isValid: true, status: 'SOMETHING_NEW' },
    });
    const r = await regosVcrService.backlogVerify(FROM);
    expect(r).toMatchObject({ ok: true, checked: 1, disabled: 0, changes: [] });
    expect(r.unknownStatus).toEqual([{ receipt: expect.any(String), productName: expect.any(String), status: 'SOMETHING_NEW' }]);
    expect(sales[0].fiscalSubstitutions).toBeNull();
  });

  it('keeps a cash receipt whose only marked line has an unknown status', async () => {
    sales = [
      sale('c', {
        items: [item(MARKED, 5000), item(PLAIN, 1000)],
        regosLabels: JSON.stringify([{ barcode: '222', label: 'CODE-A' }]),
      }),
    ];
    verifyMarkingCodeDetails.mockResolvedValue({
      reachable: true,
      details: { isValid: true, status: 'SOMETHING_NEW' },
    });

    const r = await regosVcrService.backlogVerify(FROM);

    const [, plain] = sales[0].items;
    expect(r).toMatchObject({ ok: true, disabled: 0 });
    expect(plan(sales[0])).toEqual([{ itemId: plain.id, action: 'omit', reason: 'UNMARKED' }]);
    expect(sales[0].fiscalStatus).not.toBe('DISABLED');
  });

  it('stops when a substitute is needed but none is chosen', async () => {
    delete settings.regos_vcr_substitute_product_id;
    sales = [cardSale(null)];
    const r = await regosVcrService.backlogVerify(FROM);
    expect(r).toMatchObject({ ok: false, error: 'NO_SUBSTITUTE' });
  });
});

describe('step 3 — verify, cash/Click receipts (only valid marked lines)', () => {
  it('keeps only the marked lines with a valid code and leaves everything else off', async () => {
    sales = [
      sale('c', {
        paymentMethod: 'click',
        items: [item(MARKED, 5000), item(PLAIN, 1000), item(MARKED, 5000)],
        regosLabels: JSON.stringify([
          { barcode: '222', label: 'CODE-A' },
          { barcode: '222', label: 'CODE-B' },
        ]),
      }),
    ];
    registry(['CODE-A']);

    const r = await regosVcrService.backlogVerify(FROM);

    const [valid, plain, dead] = sales[0].items;
    expect(r).toMatchObject({ ok: true, disabled: 0 });
    expect(plan(sales[0])).toEqual([
      { itemId: plain.id, action: 'omit', reason: 'UNMARKED' },
      { itemId: dead.id, action: 'omit', reason: 'WITHDRAWN' },
    ]);
    expect(plan(sales[0]).some((p: { itemId: string }) => p.itemId === valid.id)).toBe(false);
    expect(sales[0].fiscalStatus).toBe('PENDING');
    // No substitute is needed for a cash receipt, so none has to be chosen.
    expect(prismaMock.product.findUnique).not.toHaveBeenCalled();
  });

  it('disables a cash receipt none of whose marking codes is valid, for good', async () => {
    sales = [
      sale('c', {
        items: [item(MARKED, 5000), item(PLAIN, 1000)],
        regosLabels: JSON.stringify([{ barcode: '222', label: 'CODE-A' }]),
      }),
    ];
    registry([]);

    const r = await regosVcrService.backlogVerify(FROM);

    expect(r).toMatchObject({ ok: true, disabled: 1 });
    expect(r.changes).toEqual([
      { receipt: 'C', productName: '', reason: 'WITHDRAWN', action: 'disable' },
    ]);
    expect(sales[0]).toMatchObject({
      fiscalStatus: 'DISABLED',
      fiscalError: SKIP_TAG_MARKING,
      fiscalSubstitutions: null,
    });
    // ...and the next run does not take it again.
    expect((await regosVcrService.backlogClassify(FROM)).kept).toEqual([]);
  });

  it('treats a marked line that was never scanned as invalid', async () => {
    sales = [sale('c', { items: [item(MARKED, 5000)] })];
    const r = await regosVcrService.backlogVerify(FROM);
    expect(r.disabled).toBe(1);
    expect(sales[0].fiscalError).toBe(SKIP_TAG_MARKING);
  });
});

describe('step 4 — fiscalize', () => {
  it('sends a substituted line as 1 kg of the substitute at the same amount, without the dead code', async () => {
    const lines = [item(MARKED, 5000), item(PLAIN, 1000)];
    sales = [
      sale('m', {
        paymentMethod: 'card',
        finalAmount: 6000,
        items: lines,
        regosLabels: JSON.stringify([{ barcode: '222', label: EN_LABEL }]),
        fiscalSubstitutions: JSON.stringify([
          { itemId: lines[0].id, action: 'substitute', reason: 'WITHDRAWN' },
        ]),
      }),
    ];

    const r = await regosVcrService.backlogFiscalize(FROM);

    expect(r).toMatchObject({ ok: true, fiscalized: 1, failed: [] });
    const { positions, payments } = client.sale.mock.calls[0][0] as unknown as {
      positions: Array<Record<string, unknown>>;
      payments: unknown;
    };
    const [sub, plain] = positions;
    expect(sub).toMatchObject({
      barcode: SUBST.barcode,
      icps: SUBST.mxik,
      package_code: SUBST.packageCode,
      amount: 500000,
      quantity: 1000,
    });
    expect(sub.label).toBeUndefined();
    expect(plain).toMatchObject({ barcode: '111', quantity: 1000, amount: 100000 });
    expect(payments).toEqual([{ type: 2, value: 600000, card_type: 2 }]);
    // The sale itself is untouched: same lines, same totals.
    expect(sales[0].items.map((i) => i.barcode)).toEqual(['222', '111']);
    expect(sales[0].finalAmount).toBe(6000);
  });

  it('sends only the valid marked line of a cash receipt, paid as cash for exactly that amount', async () => {
    const lines = [item(MARKED, 5000), item(PLAIN, 1000), item(MARKED, 5000)];
    sales = [
      sale('c', {
        finalAmount: 11000,
        items: lines,
        regosLabels: JSON.stringify([
          { barcode: '222', label: 'CODE-A' },
          { barcode: '222', label: 'CODE-B' },
        ]),
        fiscalSubstitutions: JSON.stringify([
          { itemId: lines[1].id, action: 'omit', reason: 'UNMARKED' },
          { itemId: lines[2].id, action: 'omit', reason: 'WITHDRAWN' },
        ]),
      }),
    ];

    const r = await regosVcrService.backlogFiscalize(FROM);

    expect(r).toMatchObject({ ok: true, fiscalized: 1 });
    const { positions, payments } = client.sale.mock.calls[0][0] as unknown as {
      positions: Array<Record<string, unknown>>;
      payments: unknown;
    };
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ barcode: '222', label: 'CODE-A', amount: 500000 });
    expect(payments).toEqual([{ type: 1, value: 500000 }]);
    expect(sales[0].items).toHaveLength(3);
    expect(sales[0].finalAmount).toBe(11000);
  });

  // The order-discount settle (every line's share adds up to the whole discount) is for receipts
  // sent in full. A partial one pays only its sent lines, so each keeps just its own share.
  it('gives a sent line of a discounted cash receipt only its own share of the discount', async () => {
    const lines = [item(MARKED, 5000), item(PLAIN, 1000), item(MARKED, 5000)];
    sales = [
      sale('c', {
        discountAmount: 1100,
        finalAmount: 9900,
        items: lines,
        regosLabels: JSON.stringify([
          { barcode: '222', label: 'CODE-A' },
          { barcode: '222', label: 'CODE-B' },
        ]),
        fiscalSubstitutions: JSON.stringify([
          { itemId: lines[1].id, action: 'omit', reason: 'UNMARKED' },
          { itemId: lines[2].id, action: 'omit', reason: 'WITHDRAWN' },
        ]),
      }),
    ];

    await regosVcrService.backlogFiscalize(FROM);

    const { positions, payments } = client.sale.mock.calls[0][0] as unknown as {
      positions: Array<{ amount: number; discount: number }>;
      payments: unknown;
    };
    // 5 000 of 11 000 → 500 of the 1 100 discount, not all of it.
    expect(positions).toEqual([expect.objectContaining({ amount: 500000, discount: 50000 })]);
    expect(payments).toEqual([{ type: 1, value: 450000 }]);
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

describe('receipts sent with one code for several packs (read-only)', () => {
  it('lists those fiscalised before per-line codes, with the codes REGOS never got', async () => {
    const since = new Date(2026, 9, 5, 9);
    prismaMock.systemSetting.findUnique.mockResolvedValueOnce({
      key: 'labels_per_line_since',
      value: since.toISOString(),
    });
    const twoPacks = JSON.stringify([
      { barcode: '222', label: 'CODE-A' },
      { barcode: '222', label: 'CODE-B' },
    ]);
    sales = [
      sale('old', {
        fiscalStatus: 'FISCALIZED',
        regosFiscalAt: new Date(2026, 9, 4),
        regosReceiptNo: '77',
        items: [item(MARKED), item(MARKED)],
        regosLabels: twoPacks,
      }),
      sale('new', {
        fiscalStatus: 'FISCALIZED',
        regosFiscalAt: new Date(2026, 9, 5, 10),
        items: [item(MARKED), item(MARKED)],
        regosLabels: twoPacks,
      }),
      sale('one-pack', {
        fiscalStatus: 'FISCALIZED',
        regosFiscalAt: new Date(2026, 9, 4),
        items: [item(MARKED)],
        regosLabels: JSON.stringify([{ barcode: '222', label: 'CODE-C' }]),
      }),
    ];

    const rows = await regosVcrService.duplicateCodeReceipts();

    expect(rows.map((r) => r.saleId)).toEqual(['old']);
    expect(rows[0]).toMatchObject({
      regosReceiptNo: '77',
      lines: [{ barcode: '222', packs: 2, sentCode: 'CODE-B', unsentCodes: ['CODE-A'] }],
    });
    // Read-only.
    expect(prismaMock.sale.update).not.toHaveBeenCalled();
    expect(prismaMock.sale.updateMany).not.toHaveBeenCalled();
  });
});
