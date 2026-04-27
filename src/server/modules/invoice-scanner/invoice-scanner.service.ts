import { Injectable, Logger } from '@nestjs/common';

const INVOICE_PROMPT = `You are analyzing a supplier invoice (Счёт-фактура / Hisob-faktura) from Uzbekistan. The document may be in Russian, Uzbek, or both. This is often a standard SoliqServis e-invoice format.

**MXIK code:**
Each product row contains a 17-digit MXIK code (Миллий каталог идентификация коди) on a separate line, formatted as:
  "XXXXXXXXXXXXXXXXXXX - Category description"
Example: "02202002001010007 - Безалкогольные напитки (газированные и негазированные) COCA-COLA"
Extract the digits only (no dashes or spaces).

**Invoice column order (left to right after the product name/MXIK block):**
  [unit_type] [unit_volume] [invoice_quantity] [price_per_invoice_unit] [total_without_VAT] [VAT_%] [VAT_amount] [total_WITH_VAT] [transaction_type]

The unit_type can be:
- "упаковка=N шт" — 1 invoice unit is a package of N individual items → actual_quantity = invoice_quantity × N
- "штука" / "шт" / "кг" / "литр" etc. — individual units → actual_quantity = invoice_quantity

**Calculation rules:**
1. actual_quantity = invoice_quantity × pack_size (pack_size = N from "упаковка=N шт", else 1)
2. totalCost = the LAST price column — total WITH VAT (ignore spaces in numbers, e.g. "562 464.00" → 562464)
3. unitCost = round(totalCost / actual_quantity, 2)

**Example:**
  Product: Coca Cola PET 0.5L
  MXIK: 02202002001010007
  Row: упаковка=12 шт  0.50 литр  8  775.00  502 200.00  12%  60 264.00  562 464.00  Олди-сотди
  → pack_size=12, invoice_quantity=8, actual_quantity=96, totalCost=562464, unitCost=5859

Also extract:
- supplierName: supplier/vendor name if visible, else null
- receiptDate: date on the receipt in YYYY-MM-DD format if visible, else null

Return ONLY valid JSON, no markdown, no explanations:
{
  "supplierName": "string or null",
  "receiptDate": "string or null",
  "items": [
    {
      "scannedName": "product name as written",
      "mxik": "17-digit code or null",
      "quantity": 96,
      "unitCost": 5859,
      "totalCost": 562464
    }
  ]
}

If you cannot determine a numeric value, use 0. Always return the items array even if empty.`;

export interface ScannedItem {
  scannedName: string;
  mxik: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

// Claude Sonnet pricing (per token)
const ANTHROPIC_RATES = {
  input:          3.00  / 1_000_000,
  output:         15.00 / 1_000_000,
  cache_creation: 3.75  / 1_000_000,
  cache_read:     0.30  / 1_000_000,
};

export interface ScanResult {
  tier: 'free' | 'paid';
  supplierName: string | null;
  receiptDate: string | null;
  items: ScannedItem[];
  /** Actual Anthropic cost in USD for this scan */
  cost_usd?: number;
}

@Injectable()
export class InvoiceScannerService {
  private readonly logger = new Logger(InvoiceScannerService.name);
  private readonly pythonOcrUrl = process.env.PYTHON_OCR_URL || 'http://ocr-python:8001';
  private readonly anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';

  async scanFree(imageBase64: string, mimeType: string): Promise<ScanResult> {
    try {
      const response = await fetch(`${this.pythonOcrUrl}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        throw new Error(`Python OCR service returned ${response.status}`);
      }

      const data = (await response.json()) as Omit<ScanResult, 'tier'>;
      if (!data.items || data.items.length === 0) {
        throw new Error('PaddleOCR returned no items');
      }
      return { ...data, tier: 'free' };
    } catch (err) {
      this.logger.warn(`PaddleOCR failed for free-plan store: ${(err as Error).message}`);
      throw new Error('OCR service unavailable. Please try again later or upgrade to a paid plan.');
    }
  }

  async scanPaid(imageBase64: string, mimeType: string): Promise<ScanResult> {
    const isPDF = mimeType === 'application/pdf';

    const fileContent = isPDF
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } };

    const betaHeaders = ['prompt-caching-2024-07-31'];
    if (isPDF) betaHeaders.push('pdfs-2024-09-25');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': betaHeaders.join(','),
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: INVOICE_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: [fileContent] }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Anthropic API error: ${response.status} ${body}`);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const result = (await response.json()) as {
      content: { type: string; text: string }[];
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };

    const usage = result.usage;

    const cost_usd =
      (usage.input_tokens          || 0) * ANTHROPIC_RATES.input +
      (usage.output_tokens         || 0) * ANTHROPIC_RATES.output +
      (usage.cache_creation_input_tokens || 0) * ANTHROPIC_RATES.cache_creation +
      (usage.cache_read_input_tokens     || 0) * ANTHROPIC_RATES.cache_read;

    this.logger.log(
      `Claude usage — input: ${usage.input_tokens}, output: ${usage.output_tokens}, ` +
        `cache_creation: ${usage.cache_creation_input_tokens ?? 0}, cache_read: ${usage.cache_read_input_tokens ?? 0}, ` +
        `cost_usd: $${cost_usd.toFixed(5)}`,
    );

    const textContent = result.content?.find((c) => c.type === 'text');
    if (!textContent) throw new Error('No text response from Anthropic API');

    let jsonText = textContent.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonText) as Omit<ScanResult, 'tier' | 'cost_usd'>;
    return { ...parsed, tier: 'paid', cost_usd };
  }
}
