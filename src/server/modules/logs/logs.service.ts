import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadLogsDto } from './dto/upload-logs.dto';

// Terminal logs are diagnostic, not source-of-truth — keep ~1 month and purge the rest nightly so
// terminal_logs doesn't grow unbounded.
const LOG_RETENTION_DAYS = 30;

/**
 * The line a till writes for every REGOS:VCR failure, raw code included
 * (src/main/fiscal/regos-vcr-service.ts): `[fiscal] raw VCR error [701003] Receipt.Sale: …`.
 * The staff-facing message collapses several codes into one, so this is the line to search by.
 */
const VCR_MARKER = 'raw VCR error [';

/** A REGOS code is six digits; 0 is the till's own "VCR unreachable". */
const VCR_CODE = /^(0|\d{6})$/;

export interface LogsQuery {
  storeId?: string;
  terminalId?: string;
  level?: string;
  from?: string;
  to?: string;
  /** A VCR error number, or 'any' for every VCR error. */
  vcrCode?: string;
  page?: number;
  limit?: number;
}

/** One VCR error number seen in the logs: how often, and REGOS's words for it the last time. */
export interface VcrCodeSummary {
  code: string;
  count: number;
  latest: string | null;
}

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nightly retention sweep — drops terminal_logs older than the retention window across all
   * stores so the table doesn't grow unbounded.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'log-retention' })
  async purgeOldLogs(): Promise<void> {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const terminal = await this.prisma.terminalLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    this.logger.log(
      `Log retention: purged ${terminal.count} terminal_logs older than ${LOG_RETENTION_DAYS}d`,
    );
  }

  async uploadLogs(storeId: string, dto: UploadLogsDto): Promise<{ saved: number }> {
    if (!dto.entries.length) return { saved: 0 };

    await this.prisma.terminalLog.createMany({
      data: dto.entries.map(e => ({
        storeId,
        terminalId: dto.terminalId,
        level: e.level,
        message: e.msg,
        timestamp: new Date(e.ts),
      })),
    });

    return { saved: dto.entries.length };
  }

  async getMeta(
    callerRole: string,
    callerStoreId: string | null,
  ): Promise<{
    stores: string[];
    terminalsByStore: Record<string, string[]>;
    vcrCodes: VcrCodeSummary[];
  }> {
    const where: Record<string, unknown> = {};
    if (callerRole !== 'SUPER_ADMIN') {
      where.storeId = callerStoreId;
    }

    const rows = await this.prisma.terminalLog.findMany({
      where,
      select: { storeId: true, terminalId: true },
      distinct: ['storeId', 'terminalId'],
      orderBy: [{ storeId: 'asc' }, { terminalId: 'asc' }],
    });

    const terminalsByStore: Record<string, string[]> = {};
    for (const row of rows) {
      if (!terminalsByStore[row.storeId]) terminalsByStore[row.storeId] = [];
      terminalsByStore[row.storeId].push(row.terminalId);
    }

    return {
      stores: Object.keys(terminalsByStore).sort(),
      terminalsByStore,
      vcrCodes: await this.vcrCodes(callerRole === 'SUPER_ADMIN' ? null : callerStoreId, callerRole),
    };
  }

  /** The VCR error numbers in the logs, most frequent first — the filter's suggestions. */
  private async vcrCodes(storeId: string | null, callerRole: string): Promise<VcrCodeSummary[]> {
    if (callerRole !== 'SUPER_ADMIN' && !storeId) return [];
    const rows = await this.prisma.$queryRaw<
      Array<{ code: string | null; count: number | bigint; latest: string | null }>
    >`
      SELECT substring("message" from 'raw VCR error \\[([0-9]+)\\]') AS code,
             count(*)::int AS count,
             (array_agg(substring("message" from 'raw VCR error \\[[0-9]+\\][^:]*: (.*)$')
                        ORDER BY "timestamp" DESC))[1] AS latest
      FROM terminal_logs
      WHERE "message" LIKE ${`%${VCR_MARKER}%`}
      ${storeId ? Prisma.sql`AND store_id = ${storeId}` : Prisma.empty}
      GROUP BY 1
      ORDER BY 2 DESC`;
    return rows
      .filter((r): r is typeof r & { code: string } => Boolean(r.code))
      .map((r) => ({ code: r.code, count: Number(r.count), latest: r.latest }));
  }

  async getLogs(
    callerRole: string,
    callerStoreId: string | null,
    query: LogsQuery,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    // SUPER_ADMIN may query any store or pass a specific storeId filter
    if (callerRole !== 'SUPER_ADMIN') {
      where.storeId = callerStoreId;
    } else if (query.storeId) {
      where.storeId = query.storeId;
    }

    if (query.terminalId) where.terminalId = query.terminalId;
    if (query.level && query.level !== 'all') where.level = query.level;
    if (query.vcrCode) {
      const code = query.vcrCode.trim();
      if (code !== 'any' && !VCR_CODE.test(code)) {
        throw new BadRequestException('vcrCode must be a VCR error number, or "any"');
      }
      // The closing bracket makes it exact: 701003 must not also match a longer code.
      where.message = { contains: code === 'any' ? VCR_MARKER : `${VCR_MARKER}${code}]` };
    }
    if (query.from || query.to) {
      where.timestamp = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.terminalLog.count({ where }),
      this.prisma.terminalLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          storeId: true,
          terminalId: true,
          level: true,
          message: true,
          timestamp: true,
        },
      }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
