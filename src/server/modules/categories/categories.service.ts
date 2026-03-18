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

  async create(storeId: string, data: { nameRu: string; nameUz: string }) {
    return this.prisma.category.create({
      data: { storeId, nameRu: data.nameRu, nameUz: data.nameUz },
    });
  }

  async update(id: number, storeId: string, data: { nameRu?: string; nameUz?: string }) {
    await this.findById(id, storeId);
    return this.prisma.category.update({
      where: { id },
      data,
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

  async syncBulk(storeId: string, categories: Array<{ nameUz: string; nameRu: string; active?: boolean }>) {
    let created = 0, updated = 0, errors = 0;
    for (const c of categories) {
      try {
        const existing = await this.prisma.category.findFirst({
          where: { storeId, nameRu: c.nameRu, nameUz: c.nameUz },
        });
        if (existing) {
          if (c.active !== undefined) {
            await this.prisma.category.update({ where: { id: existing.id }, data: { active: c.active } });
          }
          updated++;
        } else {
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
