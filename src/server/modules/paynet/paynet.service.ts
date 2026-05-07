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

    await this.prisma.paynetReceipt.upsert({
      where: { storeId_receiptNumber: { storeId, receiptNumber: r } },
      create: { storeId, ofdUrl, receiptNumber: r, terminalCode: t, fiscalMark: s, issuedAt, amount: null },
      update: { ofdUrl, fiscalMark: s, issuedAt },
    });

    this.logger.log(`Saved Paynet receipt #${r} for store ${storeId}`);
    return { receiptNumber: r, amount: null };
  }

  /** Get unintegrated receipts for a store from the last 24 hours */
  async getUnintegrated(storeId: string): Promise<PaynetReceiptDto[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.prisma.paynetReceipt.findMany({
      where: {
        storeId,
        integrated: false,
        createdAt: { gte: since },
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
