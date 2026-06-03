// REGOS:VCR JSON-RPC client (main process). Talks to the locally-installed
// REGOS:VCR app over HTTP. Promoted from scripts/regos-vcr-test.ts (proven against
// vcr-test.regos.uz). VCR is single-threaded — callers must await each call.

export interface VcrPosition {
  name: string;
  barcode: string;
  icps: string; // MXIK code (= product.mxik)
  amount: number; // total position price in tiyin (sum × 100)
  quantity: number; // qty × 1000
  vat_value: number; // VAT amount in tiyin
  discount: number; // tiyin
  package_code?: string;
  label?: string; // mandatory-marking DataMatrix code (marked goods)
  code?: string;
  unit_name?: string;
  group_name?: string;
  owner_type?: 'BuyingAndSelling' | 'Commission';
}

export interface VcrPayment {
  type: 1 | 2; // 1 = cash, 2 = card/terminal
  value: number; // tiyin
  payment_id?: string;
  card_type?: 1 | 2 | 3;
  rrn?: string;
}

export interface VcrReceiptResult {
  Id: string;
  Amount: number;
  QRCodeURL: string;
  TerminalID: string;
  ReceiptNo: string;
  DateTime: string;
  FiscalSign: string;
}

export interface VcrSysInfo {
  TerminalID: string;
  CurrentReceiptSeq: string;
  CurrentTime: string;
  ReceiptCount: number;
  ReceiptMaxCount: number;
  ZReportCount: number;
  ZReportMaxCount: number;
  AppletVersion: string;
}

export interface VcrZReportInfo {
  TerminalID: string;
  Number: number;
  Count: number;
  OpenTime: string;
  CloseTime: string;
}

export class VcrError extends Error {
  constructor(
    public readonly code: number,
    public readonly description: string,
    public readonly method: string,
  ) {
    super(`VCR [${code}] ${method}: ${description}`);
    this.name = 'VcrError';
  }
}

interface VcrResponse<T> {
  id: number;
  ok: boolean;
  result: T | { error: number; description: string };
  jsonrpc: '2.0';
}

export class RegosVcrClient {
  private requestId = 1;
  private readonly authToken: string;

  constructor(
    private readonly baseUrl: string,
    login: string,
    password: string,
    private readonly timeoutMs = 30_000,
  ) {
    this.authToken = Buffer.from(`${login}:${password}`).toString('base64');
  }

  private async call<T>(method: string, params: unknown = null): Promise<T> {
    const id = this.requestId++;
    let res: Response;
    try {
      res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify({ id, jsonrpc: '2.0', method, params, auth: this.authToken }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      // Network/timeout — VCR app not reachable. Surface as a VcrError with code 0.
      throw new VcrError(0, e instanceof Error ? e.message : 'VCR unreachable', method);
    }

    const text = await res.text();
    let data: VcrResponse<T>;
    try {
      data = JSON.parse(text) as VcrResponse<T>;
    } catch {
      throw new VcrError(res.status, `Non-JSON response: ${text.slice(0, 200)}`, method);
    }

    if (!data.ok) {
      const err = data.result as { error: number; description: string };
      throw new VcrError(err?.error ?? 0, err?.description ?? 'Unknown VCR error', method);
    }
    return data.result as T;
  }

  // ── System (non-printing) ──────────────────────────────────────────────────
  initialize() { return this.call<VcrSysInfo>('Sys.Initialize'); }
  getInfo() { return this.call<VcrSysInfo>('Sys.GetInfo'); }
  getOverflowInfo() {
    return this.call<{ AvaialableZReportCount: number; AvaialableUnsendReceiptCount: number }>(
      'Sys.GetOverflowInfo',
    );
  }

  // ── Z-report (shift) ────────────────────────────────────────────────────────
  zOpen() { return this.call<{ id: number; open_time: string; close_time: null }>('ZReport.Open'); }
  zClose() { return this.call<{ id: number; open_time: string; close_time: string }>('ZReport.Close'); }
  zGetInfo(print = false) { return this.call<VcrZReportInfo>('ZReport.GetInfo', { PrintReceipt: print }); }

  // ── Receipts ──────────────────────────────────────────────────────────────
  validateSale(positions: VcrPosition[], payments: VcrPayment[], ignorePayments = false) {
    return this.call<{ validate: boolean } | null>('Receipt.ValidateSale', {
      receipt: { positions, payments },
      ignore_payments: ignorePayments,
    });
  }

  sale(params: {
    positions: VcrPosition[];
    payments: VcrPayment[];
    code?: string;
    cashier_name?: string;
    session_code?: string;
    pos_id?: string;
    phone?: string;
  }) {
    return this.call<VcrReceiptResult>('Receipt.Sale', params);
  }

  checkQrCodeUrl(qrCodeUrl: string) {
    return this.call<boolean>('Receipt.CheckQRcodeUrl', { QRCodeURL: qrCodeUrl });
  }

  /** Print a duplicate of an existing receipt by its VCR uuid. */
  duplicate(id: string) {
    return this.call<null>('Receipt.Duplicate', { id });
  }

  fullRefund(qrCodeUrl: string) {
    return this.call<VcrReceiptResult>('Receipt.FullRefund', { QRCodeURL: qrCodeUrl });
  }

  getReceiptInfo(params: { Id?: string; QRCodeURL?: string; ReceiptNo?: string; Code?: string }) {
    return this.call<(VcrReceiptResult & { Code: string }) | null>('Receipt.GetInfo', params);
  }
}

/** Human-readable hints for the common VCR error codes (RU surfaced to staff). */
export const VCR_ERROR_HINTS: Record<number, string> = {
  0: 'Виртуальная касса недоступна — проверьте, запущено ли приложение REGOS:VCR',
  701003: 'Некорректные данные чека (проверьте МХИК, НДС, суммы)',
  703000: 'Неверный формат запроса',
  704006: 'Фискальный модуль заблокирован — обратитесь в ЦТО (ТХКМ)',
  704010: 'Z-отчёт не открыт — откройте смену',
  704011: 'Z-отчёт уже открыт',
  704017: 'Фискальный модуль не найден — проверьте USB',
  704019: 'Нет связи с сервером времени 24ч — проверьте интернет',
  704025: 'Нет связи с сервером лицензий 24ч — проверьте интернет',
  704029: 'Имеется задолженность — обратитесь в ЦТО (ТХКМ)',
  705000: 'Неверный логин или пароль кассира',
  705002: 'Принтер не настроен в REGOS:VCR',
  705511: 'Ошибка проверки МХИК (ИКПУ) товара',
};
