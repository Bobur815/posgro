import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductFilters, ProductWhereInput } from "./types/product.types";

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(storeId: string, filters?: ProductFilters) {
    const where: ProductWhereInput = { storeId };

    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.active !== undefined) where.active = filters.active;
    if (filters?.updatedAfter) {
      where.updatedAt = { gt: filters.updatedAfter };
    }

    return this.prisma.product.findMany({
      where,
      include: { category: true, supplier: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: number, storeId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, supplier: true },
    });

    if (!product || product.storeId !== storeId) {
      throw new NotFoundException("Product not found");
    }

    return product;
  }

  async findByBarcode(storeId: string, barcode: string) {
    return this.prisma.product.findUnique({
      where: { storeId_barcode: { storeId, barcode } },
      include: { category: true, supplier: true },
    });
  }

  async search(storeId: string, query: string) {
    const searchQuery = query.toLowerCase();

    return this.prisma.product.findMany({
      where: {
        storeId,
        active: true,
        OR: [
          { barcode: { contains: searchQuery } },
          { nameRu: { contains: searchQuery, mode: "insensitive" } },
          { nameUz: { contains: searchQuery, mode: "insensitive" } },
        ],
      },
      include: { category: true, supplier: true },
      take: 20,
    });
  }

  async create(storeId: string, createProductDto: CreateProductDto) {
    const existing = await this.findByBarcode(
      storeId,
      createProductDto.barcode,
    );
    if (existing) {
      throw new ConflictException(
        "Product with this barcode already exists in this store",
      );
    }

    return this.prisma.product.create({
      data: {
        storeId,
        barcode: createProductDto.barcode,
        nameUz: createProductDto.nameUz,
        nameRu: createProductDto.nameRu,
        price: createProductDto.price,
        cost: createProductDto.cost,
        stock: createProductDto.stock || 0,
        minStock: createProductDto.minStock || 0,
        unit: createProductDto.unit || "шт",
        categoryId: createProductDto.categoryId,
        supplierId: createProductDto.supplierId,
        productionDate: createProductDto.productionDate
          ? new Date(createProductDto.productionDate)
          : undefined,
        expiryDate: createProductDto.expiryDate
          ? new Date(createProductDto.expiryDate)
          : undefined,
        discountPercent: createProductDto.discountPercent ?? 0,
        isOnPromotion: createProductDto.isOnPromotion ?? false,
        active: createProductDto.active ?? true,
        mxik: createProductDto.mxik,
      },
      include: { category: true },
    });
  }

  async update(
    id: number,
    storeId: string,
    updateProductDto: UpdateProductDto,
  ) {
    await this.findById(id, storeId);

    if (updateProductDto.barcode) {
      const existing = await this.prisma.product.findFirst({
        where: {
          storeId,
          barcode: updateProductDto.barcode,
          NOT: { id },
        },
      });

      if (existing) {
        throw new ConflictException(
          "Product with this barcode already exists in this store",
        );
      }
    }

    const { productionDate, expiryDate, ...rest } = updateProductDto;
    return this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        ...(productionDate !== undefined && {
          productionDate: productionDate ? new Date(productionDate) : null,
        }),
        ...(expiryDate !== undefined && {
          expiryDate: expiryDate ? new Date(expiryDate) : null,
        }),
      },
      include: { category: true },
    });
  }

  async deactivate(id: number, storeId: string) {
    await this.findById(id, storeId);

    await this.prisma.product.update({
      where: { id },
      data: { active: false },
    });

    return { success: true };
  }

  async updateStock(id: number, storeId: string, quantity: number) {
    await this.findById(id, storeId);

    return this.prisma.product.update({
      where: { id },
      data: { stock: { increment: quantity } },
    });
  }

  async getAnalytics(
    id: number,
    storeId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const product = await this.findById(id, storeId);

    const saleItems = await this.prisma.saleItem.findMany({
      where: {
        productId: id,
        sale: {
          storeId,
          createdAt: { gte: startDate, lte: endDate },
        },
      },
      include: { sale: true },
    });

    const days = Math.max(
      1,
      Math.round(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    const totalUnitsSold = saleItems.reduce(
      (sum, item) => sum + Number(item.quantity),
      0,
    );
    const totalRevenue = saleItems.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0,
    );
    const costPrice = Number(product.cost ?? 0);
    const totalCost = saleItems.reduce(
      (sum, item) => sum + Number(item.quantity) * costPrice,
      0,
    );
    const profit = totalRevenue - totalCost;
    const profitMargin =
      totalRevenue > 0 ? Math.round((profit / totalRevenue) * 10000) / 100 : 0;
    const transactionCount = new Set(saleItems.map((i) => i.saleId)).size;
    const avgDailySales = Math.round((totalUnitsSold / days) * 100) / 100;

    return {
      productId: id,
      period: {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
        days,
      },
      sales: {
        totalUnitsSold,
        totalRevenue,
        totalCost,
        profit,
        profitMargin,
        avgDailySales,
        transactionCount,
      },
      inventory: {
        currentStock: Number(product.stock),
        cost: costPrice,
        inventoryValue: Number(product.stock) * costPrice,
      },
    };
  }

  async syncBulk(
    storeId: string,
    products: Array<{
      barcode: string;
      nameUz: string;
      nameRu: string;
      price: number;
      cost?: number;
      stock?: number;
      minStock?: number;
      unit?: string;
      categoryId?: number;
      active?: boolean;
    }>,
  ) {
    let created = 0,
      updated = 0,
      errors = 0;
    for (const p of products) {
      try {
        const existing = await this.prisma.product.findUnique({
          where: { storeId_barcode: { storeId, barcode: p.barcode } },
        });
        if (existing) {
          await this.prisma.product.update({
            where: { id: existing.id },
            data: {
              nameUz: p.nameUz,
              nameRu: p.nameRu,
              price: p.price,
              ...(p.cost !== undefined && { cost: p.cost }),
              ...(p.stock !== undefined && { stock: p.stock }),
              ...(p.minStock !== undefined && { minStock: p.minStock }),
              ...(p.unit && { unit: p.unit }),
              ...(p.active !== undefined && { active: p.active }),
            },
          });
          updated++;
        } else {
          await this.prisma.product.create({
            data: {
              storeId,
              barcode: p.barcode,
              nameUz: p.nameUz,
              nameRu: p.nameRu,
              price: p.price,
              cost: p.cost ?? 0,
              stock: p.stock ?? 0,
              minStock: p.minStock ?? 0,
              unit: (p.unit as any) ?? "шт",
              categoryId: p.categoryId as any,
              active: p.active !== undefined ? p.active : true,
            },
          });
          created++;
        }
      } catch {
        errors++;
      }
    }
    return { created, updated, errors };
  }
}
