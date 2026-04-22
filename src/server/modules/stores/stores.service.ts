import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.store.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            users: true,
            products: true,
            sales: true,
          },
        },
      },
    });
  }

  async findById(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            products: true,
            sales: true,
          },
        },
      },
    });

    if (!store) {
      throw new NotFoundException("Store not found");
    }

    return store;
  }

  private async generateStoreId(): Promise<string> {
    const existing = await this.prisma.store.findMany({ select: { id: true } });
    const usedIds = new Set(existing.map((s) => s.id));

    let digits = 4;
    let min = 1000;
    let max = 9999;

    while (true) {
      for (let id = min; id <= max; id++) {
        const candidate = String(id);
        if (!usedIds.has(candidate)) return candidate;
      }
      // All N-digit IDs taken — expand to next digit length
      digits++;
      min = Math.pow(10, digits - 1);
      max = Math.pow(10, digits) - 1;
    }
  }

  async create(createStoreDto: CreateStoreDto) {
    const id = await this.generateStoreId();

    return this.prisma.store.create({
      data: {
        id,
        name: createStoreDto.name,
        address: createStoreDto.address,
        phone: createStoreDto.phone,
        settings: createStoreDto.settings
          ? JSON.stringify(createStoreDto.settings)
          : null,
        active: true,
      },
    });
  }

  async update(id: string, updateStoreDto: UpdateStoreDto) {
    await this.findById(id);

    const data: Record<string, unknown> = {};

    if (updateStoreDto.name !== undefined) data.name = updateStoreDto.name;
    if (updateStoreDto.address !== undefined)
      data.address = updateStoreDto.address;
    if (updateStoreDto.phone !== undefined) data.phone = updateStoreDto.phone;
    if (updateStoreDto.active !== undefined)
      data.active = updateStoreDto.active;
    if (updateStoreDto.plan !== undefined) data.plan = updateStoreDto.plan;
    if (updateStoreDto.settings !== undefined) {
      data.settings = JSON.stringify(updateStoreDto.settings);
    }

    return this.prisma.store.update({
      where: { id },
      data,
    });
  }

  async activate(id: string) {
    await this.findById(id);

    await this.prisma.store.update({
      where: { id },
      data: { active: true },
    });

    return { success: true };
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.store.delete({ where: { id } });
    return { success: true };
  }

  async deactivate(id: string) {
    await this.findById(id);

    await this.prisma.store.update({
      where: { id },
      data: { active: false },
    });

    return { success: true };
  }

  async addCredits(id: string, amount: number) {
    await this.findById(id);

    const updated = await this.prisma.store.update({
      where: { id },
      data: { aiCredits: { increment: amount } },
      select: { id: true, aiCredits: true },
    });

    return { success: true, aiCredits: Number(updated.aiCredits) };
  }

  async getStats(id: string) {
    const store = await this.findById(id);

    // Get total revenue for this store
    const salesAgg = await this.prisma.sale.aggregate({
      where: { storeId: id },
      _sum: { finalAmount: true },
      _count: true,
    });

    const productsCount = await this.prisma.product.count({
      where: { storeId: id, active: true },
    });

    const usersCount = await this.prisma.user.count({
      where: { storeId: id, active: true },
    });

    return {
      store,
      stats: {
        totalRevenue: salesAgg._sum.finalAmount || 0,
        totalSales: salesAgg._count,
        productsCount,
        usersCount,
      },
    };
  }
}
