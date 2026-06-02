import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(storeId: string) {
    const cats = await this.prisma.category.findMany({
      where: { storeId, active: true },
      orderBy: { nameRu: 'asc' },
    });
    // [mxik-debug] Confirm what PostgreSQL actually returns for this store.
    console.log(
      `[categories.findAll] storeId=${storeId} → ${cats.length} cats:`,
      cats.map((c) => `id=${c.id} ${c.nameUz} mxik=${JSON.stringify(c.mxikGroupCode)}`),
    );
    return cats;
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
    // [mxik-debug] Confirm what the POS uploads — does mxikGroupCode arrive?
    console.log(
      `[categories.syncBulk] storeId=${storeId} received ${categories.length}:`,
      categories.map((c) => `${c.nameUz} mxik=${JSON.stringify(c.mxikGroupCode)}`),
    );
    for (const c of categories) {
      try {
        const existing = await this.prisma.category.findFirst({
          where: { storeId, nameRu: c.nameRu, nameUz: c.nameUz },
        });
        if (existing) {
          const data: { active?: boolean; mxikGroupCode?: string | null } = {};
          if (c.active !== undefined) data.active = c.active;
          if (c.mxikGroupCode !== undefined) data.mxikGroupCode = c.mxikGroupCode;
          if (Object.keys(data).length > 0) {
            await this.prisma.category.update({ where: { id: existing.id }, data });
          }
          updated++;
        } else {
          await this.prisma.category.create({
            data: { storeId, nameUz: c.nameUz, nameRu: c.nameRu, active: c.active ?? true, mxikGroupCode: c.mxikGroupCode ?? null },
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
