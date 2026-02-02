import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { SyncSaleDto } from './dto/sync-sale.dto';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
  ) {}

  async findAll(filters?: {
    startDate?: Date;
    endDate?: Date;
    cashierId?: string;
  }) {
    const where: any = {};

    if (filters?.cashierId) where.cashierId = filters.cashierId;

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters?.startDate) where.createdAt.gte = filters.startDate;
      if (filters?.endDate) where.createdAt.lte = filters.endDate;
    }

    return this.prisma.sale.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findById(id: string, user?: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    // Non-admin users can only see their own sales
    if (user && user.role !== 'ADMIN' && sale.cashierId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    return sale;
  }

  async syncFromTerminal(syncSaleDto: SyncSaleDto) {
    // Check if sale already exists (idempotency)
    const existing = await this.prisma.sale.findUnique({
      where: { id: syncSaleDto.id },
    });

    if (existing) {
      return { id: existing.id, synced: true, message: 'Already synced' };
    }

    // Create sale with items
    const sale = await this.prisma.sale.create({
      data: {
        id: syncSaleDto.id,
        receiptNumber: syncSaleDto.receiptNumber,
        totalAmount: syncSaleDto.totalAmount,
        discountAmount: syncSaleDto.discountAmount || 0,
        finalAmount: syncSaleDto.finalAmount,
        paymentMethod: syncSaleDto.paymentMethod,
        cashierId: syncSaleDto.cashierId,
        cashierName: syncSaleDto.cashierName,
        terminalId: syncSaleDto.terminalId,
        synced: true,
        syncedAt: new Date(),
        createdAt: new Date(syncSaleDto.createdAt),
        items: {
          create: syncSaleDto.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            productName: item.productName,
            barcode: item.barcode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })),
        },
      },
      include: { items: true },
    });

    // Update product stock
    for (const item of syncSaleDto.items) {
      await this.productsService.updateStock(
        item.productId,
        -parseFloat(item.quantity),
      );
    }

    return { id: sale.id, synced: true };
  }

  async getDailySummary(date: Date, cashierId?: string) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const where: any = {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };

    if (cashierId) where.cashierId = cashierId;

    const sales = await this.prisma.sale.findMany({
      where,
      include: { items: true },
    });

    const totalSales = sales.length;
    const totalRevenue = sales.reduce(
      (sum, sale) => sum + Number(sale.finalAmount),
      0,
    );
    const totalItems = sales.reduce(
      (sum, sale) => sum + sale.items.length,
      0,
    );
    const cashSales = sales.filter((s) => s.paymentMethod === 'cash').length;
    const cardSales = sales.filter((s) => s.paymentMethod === 'card').length;

    return {
      date: startOfDay.toISOString().split('T')[0],
      totalSales,
      totalRevenue,
      totalItems,
      cashSales,
      cardSales,
      averageTransaction: totalSales > 0 ? totalRevenue / totalSales : 0,
    };
  }
}
