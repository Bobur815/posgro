import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncSmenaDto, ShiftOpenedDto } from './dto/sync-smena.dto';
import { TelegramService } from '../telegram/telegram.service';
import * as fmt from '../telegram/bot-commands';

export interface SmenaSyncResult {
  synced: number;
  skipped: number;
}

@Injectable()
export class SmenaService {
  private readonly logger = new Logger(SmenaService.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  /**
   * A till just opened. Nothing is persisted: the server only ever stores CLOSED shifts, and an
   * open one is already visible through the terminal heartbeat.
   *
   * Best-effort at both ends — the terminal does not await this call, and a shop that was offline
   * at opening time simply gets no message. The close notification arrives through the normal
   * sync regardless.
   */
  async notifyOpened(storeId: string, s: ShiftOpenedDto): Promise<void> {
    await this.telegram.notifyStoreAdmins(storeId, (lang) =>
      fmt.msgShiftOpened(
        {
          terminalId: s.terminalId,
          cashierName: s.cashierName,
          initialCash: Number(s.initialCash),
          openedAt: s.openedAt,
          zReportNumber: s.zReportNumber,
        },
        lang,
      ),
    );
  }

  /**
   * Report a shift that has just been mirrored up for the FIRST time.
   *
   * Called only when the upsert created the row. A terminal retries a batch until the server
   * confirms it, and `upsertOne` is idempotent by design, so notifying on every upsert would
   * send the same shift report once per retry.
   */
  private async notifyClosed(storeId: string, s: SyncSmenaDto): Promise<void> {
    await this.telegram.notifyStoreAdmins(storeId, (lang) =>
      fmt.msgShiftClosed(
        {
          terminalId: s.terminalId,
          cashierName: s.cashierName,
          initialCash: Number(s.initialCash),
          finalCash: Number(s.finalCash),
          openedAt: s.openedAt,
          closedAt: s.closedAt,
          zReportNumber: s.zReportNumber,
          cashSalesAmount: Number(s.cashSalesAmount),
          cardSalesAmount: Number(s.cardSalesAmount),
          payInTotal: Number(s.payInTotal),
          payOutTotal: Number(s.payOutTotal),
          returnAmount: Number(s.returnAmount),
        },
        lang,
      ),
    );
  }

  /**
   * Mirror closed shifts up from a terminal.
   *
   * Idempotent by construction: the terminal's own shift id is the primary key, so a retry after
   * a dropped response updates the same row instead of creating a second shift. That matters
   * more here than for sales — a duplicated shift would double the period's expected cash and
   * report a shortage the size of a full day's takings.
   */
  async syncFromTerminal(
    storeId: string,
    smenas: SyncSmenaDto[],
  ): Promise<SmenaSyncResult> {
    let synced = 0;
    let skipped = 0;

    for (const s of smenas) {
      try {
        await this.upsertOne(storeId, s);
        synced++;
      } catch (err) {
        // One malformed shift must not cost the terminal the rest of the batch — it would
        // retry the whole set forever and never drain the queue.
        this.logger.error(
          `Failed to sync smena ${s.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        skipped++;
      }
    }

    return { synced, skipped };
  }

  /**
   * The VPS id for this cashier, resolved by phone.
   *
   * A cashier created on a terminal keeps that terminal's id locally, while the VPS may already
   * know them under an id it minted first (users/sync-bulk keeps the existing row). Sales have
   * always been remapped this way; shifts were not, so the same person's takings and drawer
   * counts could land under two different cashier ids. Falls back to the terminal's id, which
   * is what every terminal that does not send a phone yet will get.
   */
  private async resolveCashierId(storeId: string, s: SyncSmenaDto): Promise<string> {
    if (!s.cashierPhone) return s.cashierId;
    const user = await this.prisma.user.findUnique({
      where: { storeId_phone: { storeId, phone: s.cashierPhone } },
      select: { id: true },
    });
    return user?.id ?? s.cashierId;
  }

  private async upsertOne(storeId: string, s: SyncSmenaDto): Promise<void> {
    const data = {
      storeId,
      terminalId: s.terminalId,
      cashierId: await this.resolveCashierId(storeId, s),
      cashierName: s.cashierName,
      status: 'CLOSED',
      initialCash: new Prisma.Decimal(s.initialCash),
      finalCash: new Prisma.Decimal(s.finalCash),
      zReportNumber: s.zReportNumber,
      regosZReportId: s.regosZReportId ?? null,
      cashSalesAmount: new Prisma.Decimal(s.cashSalesAmount),
      cardSalesAmount: new Prisma.Decimal(s.cardSalesAmount),
      payInTotal: new Prisma.Decimal(s.payInTotal),
      payOutTotal: new Prisma.Decimal(s.payOutTotal),
      returnAmount: new Prisma.Decimal(s.returnAmount),
      openedAt: new Date(s.openedAt),
      closedAt: new Date(s.closedAt),
      syncedAt: new Date(),
    };

    // Read before the upsert so "this shift is new to us" can be answered at all — afterwards
    // the row exists either way. It is what keeps the Telegram report to one per shift.
    const known = await this.prisma.smena.findUnique({
      where: { id: s.id },
      select: { id: true },
    });

    // Movements are replaced wholesale rather than merged: the terminal's set is authoritative,
    // and a movement voided locally between two sync attempts has to disappear here too.
    await this.prisma.$transaction([
      this.prisma.smena.upsert({
        where: { id: s.id },
        create: { id: s.id, ...data },
        update: data,
      }),
      this.prisma.smenaMovement.deleteMany({ where: { smenaId: s.id } }),
      this.prisma.smenaMovement.createMany({
        data: s.movements.map((m) => ({
          id: m.id,
          smenaId: s.id,
          type: m.type,
          amount: new Prisma.Decimal(m.amount),
          note: m.note ?? null,
          createdAt: new Date(m.createdAt),
        })),
      }),
    ]);

    // After the shift is durable, and not awaited: the terminal is waiting on this response to
    // mark the shift synced, and a slow Telegram must not hold that up or fail it. Caught rather
    // than `void`ed — an unhandled rejection takes the whole API process down with it.
    if (!known) {
      this.notifyClosed(storeId, s).catch((err) =>
        this.logger.error(`Shift ${s.id} closed but could not be reported`, err as Error),
      );
    }
  }

  async findAll(storeId: string, from?: Date, to?: Date) {
    return this.prisma.smena.findMany({
      where: {
        storeId,
        ...(from || to
          ? { closedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      orderBy: { closedAt: 'desc' },
      include: { movements: true },
    });
  }
}
