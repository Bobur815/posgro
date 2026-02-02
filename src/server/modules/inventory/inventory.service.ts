import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { CreateArrivalDto } from './dto/create-arrival.dto';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
  ) {}

  async getArrivals(filters?: { productId?: string; startDate?: Date }) {
    const where: any = {};

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

  async createArrival(createArrivalDto: CreateArrivalDto, userId: string) {
    const totalCost = createArrivalDto.quantity * createArrivalDto.cost;

    // Create arrival record
    const arrival = await this.prisma.inventoryArrival.create({
      data: {
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

  async getLowStock() {
    // Get products where stock is at or below minStock
    const products = await this.prisma.product.findMany({
      where: {
        active: true,
      },
      include: { category: true },
      orderBy: { stock: 'asc' },
    });

    // Filter in memory since Prisma doesn't support comparing two columns directly
    return products.filter((p) => p.stock <= p.minStock);
  }
}
