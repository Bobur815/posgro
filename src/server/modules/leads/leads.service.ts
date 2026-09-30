import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { LeadRequest } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { msgNewLead, type LeadStoreType } from '../telegram/bot-commands';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { ListLeadsQueryDto, UpdateLeadDto } from './dto/update-lead.dto';

/** A second submit from the same phone inside this window updates the first instead. */
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  /**
   * Saves a landing request and pings the super admins. The row is written first and the
   * notification never throws, so a Telegram outage cannot lose a request.
   */
  async create(dto: CreateLeadDto): Promise<{ ok: true }> {
    if (dto.website) {
      // Honeypot tripped: answer like a success so the bot has nothing to learn from.
      this.logger.warn('Lead honeypot filled — dropped');
      return { ok: true };
    }

    const data = {
      fullName: dto.fullName,
      phone: dto.phone,
      storeName: dto.storeName,
      storeType: dto.storeType,
      lang: dto.lang ?? 'uz',
    };

    // A double click, or someone re-sending after a slow network: one person, one lead, one ping.
    const recent = await this.prisma.leadRequest.findFirst({
      where: {
        phone: dto.phone,
        status: 'NEW',
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
    });
    if (recent) {
      await this.prisma.leadRequest.update({ where: { id: recent.id }, data });
      return { ok: true };
    }

    const lead = await this.prisma.leadRequest.create({ data });
    await this.telegram.notifySuperAdmins((lang) =>
      msgNewLead(
        {
          fullName: lead.fullName,
          phone: lead.phone,
          storeName: lead.storeName,
          storeType: lead.storeType as LeadStoreType,
          lang: lead.lang === 'ru' ? 'ru' : 'uz',
          createdAt: lead.createdAt,
        },
        lang,
      ),
    );
    return { ok: true };
  }

  findAll(query: ListLeadsQueryDto): Promise<LeadRequest[]> {
    return this.prisma.leadRequest.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async update(id: string, dto: UpdateLeadDto, actor: string): Promise<LeadRequest> {
    const exists = await this.prisma.leadRequest.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Lead not found');
    const lead = await this.prisma.leadRequest.update({ where: { id }, data: dto });
    // No AuditLog model exists yet; the application log is the trail until one does.
    this.logger.log(`Lead ${id} updated by ${actor}: ${JSON.stringify(dto)}`);
    return lead;
  }
}
