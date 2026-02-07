import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { CreateArrivalDto } from './dto/create-arrival.dto';
import { Product } from '@prisma/client';
import { ArrivalFilters, InventoryArrivalWhereInput } from './types/inventory.types';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
  ) {}

  async getArrivals(storeId: string, filters?: ArrivalFilters) {
    const where: InventoryArrivalWhereInput = { storeId };

    if (filters?.productId) where.productId = filters.productId;
    if (filters?.startDate) where.createdAt = { gte: filters.startDate };

    return this.prisma.inventoryArrival.findMany({
      where,
      include: {
        product: true,
        supplier: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createArrival(storeId: string, createArrivalDto: CreateArrivalDto, userId: string) {
    // Validate product exists and belongs to store
    const product = await this.prisma.product.findUnique({
      where: { id: createArrivalDto.productId },
    });
    if (!product || product.storeId !== storeId) {
      throw new NotFoundException(`Product with ID ${createArrivalDto.productId} not found`);
    }

    // Validate supplier exists and belongs to store if provided
    if (createArrivalDto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({
        where: { id: createArrivalDto.supplierId },
      });
      if (!supplier || supplier.storeId !== storeId) {
        throw new NotFoundException(`Supplier with ID ${createArrivalDto.supplierId} not found`);
      }
    }

    const totalCost = createArrivalDto.quantity * createArrivalDto.cost;

    // Create arrival record
    const arrival = await this.prisma.inventoryArrival.create({
      data: {
        storeId,
        productId: createArrivalDto.productId,
        quantity: createArrivalDto.quantity,
        cost: createArrivalDto.cost,
        totalCost,
        supplierId: createArrivalDto.supplierId || null,
        notes: createArrivalDto.notes || null,
        createdBy: userId,
      },
      include: {
        product: true,
        supplier: true,
      },
    });

    // Update product stock and cost
    await this.prisma.product.update({
      where: { id: createArrivalDto.productId },
      data: {
        stock: { increment: createArrivalDto.quantity },
        cost: createArrivalDto.cost,
      },
    });

    return arrival;
  }

  async getLowStock(storeId: string) {
    // Get products where stock is at or below minStock
    const products = await this.prisma.product.findMany({
      where: {
        storeId,
        active: true,
      },
      include: { category: true },
      orderBy: { stock: 'asc' },
    });

    // Filter in memory since Prisma doesn't support comparing two columns directly
    return products.filter((p: Product) => Number(p.stock) <= Number(p.minStock));
  }
}
