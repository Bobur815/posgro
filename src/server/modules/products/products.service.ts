import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: {
    categoryId?: string;
    active?: boolean;
    updatedAfter?: Date;
  }) {
    const where: any = {};

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

  async findById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async findByBarcode(barcode: string) {
    return this.prisma.product.findUnique({
      where: { barcode },
      include: { category: true },
    });
  }

  async search(query: string) {
    const searchQuery = query.toLowerCase();

    return this.prisma.product.findMany({
      where: {
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

  async create(createProductDto: CreateProductDto) {
    const existing = await this.findByBarcode(createProductDto.barcode);
    if (existing) {
      throw new ConflictException('Product with this barcode already exists');
    }

    return this.prisma.product.create({
      data: {
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

  async update(id: string, updateProductDto: UpdateProductDto) {
    await this.findById(id);

    if (updateProductDto.barcode) {
      const existing = await this.prisma.product.findFirst({
        where: {
          barcode: updateProductDto.barcode,
          NOT: { id },
        },
      });

      if (existing) {
        throw new ConflictException('Product with this barcode already exists');
      }
    }

    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
      include: { category: true },
    });
  }

  async deactivate(id: string) {
    await this.findById(id);

    await this.prisma.product.update({
      where: { id },
      data: { active: false },
    });

    return { success: true };
  }

  async updateStock(id: string, quantity: number) {
    await this.findById(id);

    return this.prisma.product.update({
      where: { id },
      data: { stock: { increment: quantity } },
    });
  }
}
