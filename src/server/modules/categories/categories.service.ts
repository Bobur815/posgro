import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(storeId: string) {
    return this.prisma.category.findMany({
      where: { storeId, active: true },
      orderBy: { nameRu: 'asc' },
    });
  }

  async create(storeId: string, data: { nameRu: string; nameUz: string; mxikGroupCode?: string | null }) {
    return this.prisma.category.create({
      data: { storeId, nameRu: data.nameRu, nameUz: data.nameUz, mxikGroupCode: data.mxikGroupCode ?? null },
    });
  }

  async update(id: number, storeId: string, data: { nameRu?: string; nameUz?: string; mxikGroupCode?: string | null }) {
    await this.findById(id, storeId);
    return this.prisma.category.update({
      where: { id },
      data: { ...data },
    });
  }

  async delete(id: number, storeId: string) {
    await this.findById(id, storeId);
    await this.prisma.category.update({
      where: { id },
      data: { active: false },
    });
    return { success: true };
  }

  async syncBulk(storeId: string, categories: Array<{ nameUz: string; nameRu: string; active?: boolean; mxikGroupCode?: string | null }>) {
    let created = 0, updated = 0, errors = 0;
    for (const c of categories) {
      try {
        const existing = await this.prisma.category.findFirst({
          where: { storeId, nameRu: c.nameRu, nameUz: c.nameUz },
        });
        if (existing) {
          // NOTE: mxik_group_code is intentionally NOT updated from terminal uploads.
          // It is server-authoritative (set via the dashboard / mapping scripts) and only
          // flows DOWN to terminals via syncCategories. Accepting it here let a terminal
          // with a null local value wipe the server's mapping (category bounce-back).
          const data: { active?: boolean } = {};
          if (c.active !== undefined) data.active = c.active;
          if (Object.keys(data).length > 0) {
            await this.prisma.category.update({ where: { id: existing.id }, data });
          }
          updated++;
        } else {
          // New terminal-originated category: leave mxik_group_code null for an admin to map.
          await this.prisma.category.create({
            data: { storeId, nameUz: c.nameUz, nameRu: c.nameRu, active: c.active ?? true },
          });
          created++;
        }
      } catch {
        errors++;
      }
    }
    return { created, updated, errors };
  }

  private async findById(id: number, storeId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, storeId },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }
}
