import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PaynetReceiptDto {
  id: string;
  receiptNumber: string;
  fiscalMark: string;
  ofdUrl: string;
  amount: number | null;
  issuedAt: string;
}

@Injectable()
export class PaynetService {
  private readonly logger = new Logger(PaynetService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Parse OFD URL params and optionally fetch amount from the page */
  async saveFromTelegram(storeId: string, ofdUrl: string): Promise<{ receiptNumber: string; amount: number | null }> {
    const url = new URL(ofdUrl);
    const t = url.searchParams.get('t') ?? '';
    const r = url.searchParams.get('r') ?? '';
    const c = url.searchParams.get('c') ?? '';
    const s = url.searchParams.get('s') ?? '';

    if (!r || !s) throw new Error('Invalid OFD URL: missing r or s params');

    // Parse datetime from `c` param: YYYYMMDDHHmmss
    const issuedAt = c.length >= 14
      ? new Date(`${c.slice(0,4)}-${c.slice(4,6)}-${c.slice(6,8)}T${c.slice(8,10)}:${c.slice(10,12)}:${c.slice(12,14)}`)
      : new Date();

    const amount = await this.fetchOfdAmount(ofdUrl);

    await this.prisma.paynetReceipt.upsert({
      where: { storeId_receiptNumber: { storeId, receiptNumber: r } },
      create: { storeId, ofdUrl, receiptNumber: r, terminalCode: t, fiscalMark: s, issuedAt, amount },
      update: { ofdUrl, fiscalMark: s, issuedAt, amount },
    });

    this.logger.log(`Saved Paynet receipt #${r} (amount: ${amount}) for store ${storeId}`);
    return { receiptNumber: r, amount };
  }

  /** Fetch amount from OFD HTML page */
  private async fetchOfdAmount(ofdUrl: string): Promise<number | null> {
    try {
      const res = await fetch(ofdUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
        signal: AbortSignal.timeout(5000),
      });
      const html = await res.text();

      // Try JSON data embedded in page: "totalSum":50000 or "amount":50000
      const jsonMatch = html.match(/"(?:totalSum|amount|total)"\s*:\s*([\d.]+)/i);
      if (jsonMatch) return parseFloat(jsonMatch[1]);

      // Try numeric value near Jami/ИТОГО/Total keywords
      const keywordMatch = html.match(/(?:Jami|JAMI|ИТОГО|Total)[^0-9]*?([\d\s]+(?:[,.][\d]+)?)/i);
      if (keywordMatch) {
        const raw = keywordMatch[1].replace(/\s/g, '').replace(',', '.');
        const val = parseFloat(raw);
        if (!isNaN(val) && val > 0) return val;
      }

      // Try any standalone large integer that looks like a UZS amount (>= 1000)
      const amounts = [...html.matchAll(/\b([\d]{4,12}(?:[.,]\d{1,2})?)\b/g)]
        .map(m => parseFloat(m[1].replace(',', '.')))
        .filter(n => n >= 1000 && n < 100_000_000);
      if (amounts.length > 0) return amounts[amounts.length - 1]; // last large number is usually total
    } catch (err) {
      this.logger.warn(`Failed to fetch OFD amount from ${ofdUrl}: ${err}`);
    }
    return null;
  }

  /** Get unintegrated receipts for a store, optionally filtered by exact amount */
  async getUnintegrated(storeId: string, amount?: number): Promise<PaynetReceiptDto[]> {
    const rows = await this.prisma.paynetReceipt.findMany({
      where: {
        storeId,
        integrated: false,
        ...(amount != null ? { amount: { gte: amount - 1, lte: amount + 1 } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return rows.map(r => ({
      id: r.id,
      receiptNumber: r.receiptNumber,
      fiscalMark: r.fiscalMark,
      ofdUrl: r.ofdUrl,
      amount: r.amount ? Number(r.amount) : null,
      issuedAt: r.issuedAt.toISOString(),
    }));
  }

  /** Mark receipt as integrated, linking it to a POS sale receipt number */
  async integrate(id: string, storeId: string, saleReceiptNumber: string): Promise<void> {
    const receipt = await this.prisma.paynetReceipt.findFirst({ where: { id, storeId } });
    if (!receipt) throw new NotFoundException('Paynet receipt not found');

    await this.prisma.paynetReceipt.update({
      where: { id },
      data: { integrated: true, saleReceiptNumber, integratedAt: new Date() },
    });
  }
}
