import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductFilters, ProductWhereInput } from './types/product.types';

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
      include: { category: true },
      orderBy: { nameRu: 'asc' },
    });
  }

  async findById(id: number, storeId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!product || product.storeId !== storeId) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async findByBarcode(storeId: string, barcode: string) {
    return this.prisma.product.findUnique({
      where: { storeId_barcode: { storeId, barcode } },
      include: { category: true },
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
          { nameRu: { contains: searchQuery, mode: 'insensitive' } },
          { nameUz: { contains: searchQuery, mode: 'insensitive' } },
        ],
      },
      include: { category: true },
      take: 20,
    });
  }

  async create(storeId: string, createProductDto: CreateProductDto) {
    const existing = await this.findByBarcode(storeId, createProductDto.barcode);
    if (existing) {
      throw new ConflictException('Product with this barcode already exists in this store');
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
        unit: createProductDto.unit || 'шт',
        categoryId: createProductDto.categoryId,
        active: true,
      },
      include: { category: true },
    });
  }

  async update(id: number, storeId: string, updateProductDto: UpdateProductDto) {
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
        throw new ConflictException('Product with this barcode already exists in this store');
      }
    }

    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
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
}
