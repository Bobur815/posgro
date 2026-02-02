import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDailyAnalytics(date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const sales = await this.prisma.sale.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: { items: true },
    });

    const totalSales = sales.length;
    const totalRevenue = sales.reduce(
      (sum, sale) => sum + Number(sale.finalAmount),
      0,
    );

    // Sales by cashier
    const salesByCashier = sales.reduce((acc, sale) => {
      if (!acc[sale.cashierName]) {
        acc[sale.cashierName] = { count: 0, revenue: 0 };
      }
      acc[sale.cashierName].count++;
      acc[sale.cashierName].revenue += Number(sale.finalAmount);
      return acc;
    }, {} as Record<string, { count: number; revenue: number }>);

    // Sales by hour
    const salesByHour = sales.reduce((acc, sale) => {
      const hour = new Date(sale.createdAt).getHours();
      if (!acc[hour]) {
        acc[hour] = { count: 0, revenue: 0 };
      }
      acc[hour].count++;
      acc[hour].revenue += Number(sale.finalAmount);
      return acc;
    }, {} as Record<number, { count: number; revenue: number }>);

    // Top products
    const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
    for (const sale of sales) {
      for (const item of sale.items) {
        if (!productSales[item.productId]) {
          productSales[item.productId] = { name: item.productName, quantity: 0, revenue: 0 };
        }
        productSales[item.productId].quantity += Number(item.quantity);
        productSales[item.productId].revenue += Number(item.subtotal);
      }
    }

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      date: startOfDay.toISOString().split('T')[0],
      totalSales,
      totalRevenue,
      transactionCount: totalSales,
      averageTransaction: totalSales > 0 ? totalRevenue / totalSales : 0,
      topProducts,
      salesByCashier,
      salesByHour,
    };
  }

  async getMonthlyAnalytics(year: number, month: number) {
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const sales = await this.prisma.sale.findMany({
      where: {
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      include: { items: true },
    });

    const totalSales = sales.length;
    const totalRevenue = sales.reduce(
      (sum, sale) => sum + Number(sale.finalAmount),
      0,
    );

    // Sales by day
    const salesByDay = sales.reduce((acc, sale) => {
      const day = new Date(sale.createdAt).getDate();
      if (!acc[day]) {
        acc[day] = { count: 0, revenue: 0 };
      }
      acc[day].count++;
      acc[day].revenue += Number(sale.finalAmount);
      return acc;
    }, {} as Record<number, { count: number; revenue: number }>);

    return {
      year,
      month,
      totalSales,
      totalRevenue,
      averageDaily: totalRevenue / endOfMonth.getDate(),
      salesByDay,
    };
  }

  async getProductPerformance(startDate: Date, endDate: Date) {
    const sales = await this.prisma.sale.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { items: { include: { product: true } } },
    });

    const productStats: Record<
      string,
      { id: string; name: string; quantity: number; revenue: number; salesCount: number }
    > = {};

    for (const sale of sales) {
      for (const item of sale.items) {
        if (!productStats[item.productId]) {
          productStats[item.productId] = {
            id: item.productId,
            name: item.productName,
            quantity: 0,
            revenue: 0,
            salesCount: 0,
          };
        }
        productStats[item.productId].quantity += Number(item.quantity);
        productStats[item.productId].revenue += Number(item.subtotal);
        productStats[item.productId].salesCount++;
      }
    }

    return Object.values(productStats).sort((a, b) => b.revenue - a.revenue);
  }
}
