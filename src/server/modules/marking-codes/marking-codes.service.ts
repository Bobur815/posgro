import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface RecordEntry {
  code: string;
  productBarcode?: string;
  soldAt?: string;
}

@Injectable()
export class MarkingCodesService {
  constructor(private prisma: PrismaService) {}

  async check(storeId: string, code: string) {
    const record = await (this.prisma as any).soldMarkingCode.findFirst({
      where: { storeId, code },
      select: { soldAt: true, terminalId: true },
    });

    if (record) {
      return {
        alreadySold: true,
        soldAt: record.soldAt.toISOString(),
        terminalId: record.terminalId,
      };
    }

    return { alreadySold: false };
  }

  async record(
    storeId: string,
    entries: RecordEntry[],
    terminalId: string,
  ): Promise<{ recorded: number; conflicts: string[] }> {
    let recorded = 0;
    const conflicts: string[] = [];

    for (const entry of entries) {
      try {
        await (this.prisma as any).soldMarkingCode.create({
          data: {
            storeId,
            code: entry.code,
            productBarcode: entry.productBarcode ?? null,
            terminalId,
            soldAt: entry.soldAt ? new Date(entry.soldAt) : new Date(),
          },
        });
        recorded++;
      } catch {
        // Unique constraint violation — already sold (possibly by another terminal)
        conflicts.push(entry.code);
      }
    }

    return { recorded, conflicts };
  }
}
