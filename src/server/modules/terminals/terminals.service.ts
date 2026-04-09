import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HeartbeatDto } from './dto/heartbeat.dto';

@Injectable()
export class TerminalsService {
  constructor(private prisma: PrismaService) {}

  async upsertHeartbeat(storeId: string, dto: HeartbeatDto) {
    return this.prisma.terminalHeartbeat.upsert({
      where: {
        storeId_terminalId: {
          storeId,
          terminalId: dto.terminalId,
        },
      },
      update: {
        unsyncedCount: dto.unsyncedCount,
        lastSyncAt: new Date(dto.lastSyncAt),
      },
      create: {
        storeId,
        terminalId: dto.terminalId,
        unsyncedCount: dto.unsyncedCount,
        lastSyncAt: new Date(dto.lastSyncAt),
      },
    });
  }

  async getStatus(storeId: string) {
    const heartbeats = await this.prisma.terminalHeartbeat.findMany({
      where: { storeId },
      orderBy: { terminalId: 'asc' },
    });

    return heartbeats.map((h) => ({
      terminalId: h.terminalId,
      lastSyncAt: h.lastSyncAt.toISOString(),
      unsyncedCount: h.unsyncedCount,
    }));
  }
}
