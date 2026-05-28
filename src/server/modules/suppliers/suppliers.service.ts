import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierFilters, SupplierWhereInput } from './types/supplier.types';
import { SupplierTransactionType, SupplierPaymentMethod } from '@prisma/client';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async findByPhoneAnyStore(phone: string) {
    return this.prisma.supplier.findFirst({
      where: { phone, active: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAll(storeId: string, filters?: SupplierFilters) {
    const where: SupplierWhereInput = { storeId };

    if (filters?.active !== undefined) {
      where.active = filters.active;
    }

    if (filters?.search) {
      where.OR = [
        { nameRu: { contains: filters.search, mode: 'insensitive' } },
        { nameUz: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search } },
      ];
    }

    return this.prisma.supplier.findMany({
      where,
      include: { categories: true },
      orderBy: { nameRu: 'asc' },
    });
  }

  async findById(id: string, storeId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        categories: true,
        arrivals: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { product: true },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
        products: {
          where: { active: true },
          orderBy: { nameRu: 'asc' },
        },
      },
    });

    if (!supplier || supplier.storeId !== storeId) {
      throw new NotFoundException('Supplier not found');
    }

    return supplier;
  }

  async create(storeId: string, createSupplierDto: CreateSupplierDto) {
    const { categoryIds, ...data } = createSupplierDto;

    return this.prisma.supplier.create({
      data: {
        storeId,
        nameUz: data.nameUz,
        nameRu: data.nameRu,
        phone: data.phone || null,
        address: data.address || null,
        balance: data.balance ?? 0,
        active: true,
        categories: categoryIds?.length
          ? { connect: categoryIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { categories: true },
    });
  }

  async update(id: string, storeId: string, updateSupplierDto: UpdateSupplierDto) {
    await this.findById(id, storeId);

    const { categoryIds, ...data } = updateSupplierDto;

    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...data,
        categories: categoryIds
          ? { set: categoryIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { categories: true },
    });
  }

  async deactivate(id: string, storeId: string) {
    await this.findById(id, storeId);

    await this.prisma.supplier.update({
      where: { id },
      data: { active: false },
    });

    return { success: true };
  }

  async syncBulk(storeId: string, suppliers: Array<{
    id: string;
    nameUz: string;
    nameRu: string;
    phone?: string;
    address?: string;
    active?: boolean;
  }>) {
    let created = 0, updated = 0, errors = 0;
    for (const s of suppliers) {
      try {
        await this.prisma.supplier.upsert({
          where: { id: s.id },
          update: {
            nameUz: s.nameUz,
            nameRu: s.nameRu,
            phone: s.phone || null,
            address: s.address || null,
            ...(s.active !== undefined && { active: s.active }),
          },
          create: {
            id: s.id,
            storeId,
            nameUz: s.nameUz,
            nameRu: s.nameRu,
            phone: s.phone || null,
            address: s.address || null,
            active: s.active !== undefined ? s.active : true,
          },
        });
        created++;
      } catch {
        errors++;
      }
    }
    return { created, updated, errors };
  }

  async getTransactions(storeId: string, filters?: { supplierId?: string; type?: string }) {
    return this.prisma.supplierTransaction.findMany({
      where: {
        storeId,
        ...(filters?.supplierId && { supplierId: filters.supplierId }),
        ...(filters?.type && { type: filters.type as SupplierTransactionType }),
      },
      include: { supplier: { select: { id: true, nameRu: true, nameUz: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTransaction(storeId: string, userId: string, data: Record<string, unknown>) {
    const { supplierId, type, paymentMethod, amount, description, referenceId, referenceType, dueDate, paidAt } = data;

    const transaction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supplierTransaction.create({
        data: {
          storeId,
          supplierId: supplierId as string,
          type: type as SupplierTransactionType,
          paymentMethod: (paymentMethod ?? 'CASH') as SupplierPaymentMethod,
          amount: amount as number,
          description: (description as string) ?? null,
          referenceId: (referenceId as string) ?? null,
          referenceType: (referenceType as string) ?? null,
          dueDate: dueDate ? new Date(dueDate as string) : null,
          paidAt: paidAt ? new Date(paidAt as string) : null,
          createdBy: userId,
        },
      });

      // Adjust supplier balance: positive amount decreases debt (we paid), negative increases debt
      const balanceDelta = this.balanceDeltaFor(type as SupplierTransactionType, Number(amount));
      await tx.supplier.update({
        where: { id: supplierId as string },
        data: { balance: { increment: balanceDelta } },
      });

      return created;
    });

    return transaction;
  }

  async updateTransaction(txId: string, storeId: string, data: Record<string, unknown>) {
    const existing = await this.prisma.supplierTransaction.findUnique({ where: { id: txId } });
    if (!existing || existing.storeId !== storeId) throw new NotFoundException('Transaction not found');

    const { type, paymentMethod, amount, description, dueDate, paidAt } = data;

    return this.prisma.$transaction(async (tx) => {
      // Reverse old balance impact then apply new one
      const oldDelta = this.balanceDeltaFor(existing.type, Number(existing.amount));
      const newType = (type ?? existing.type) as SupplierTransactionType;
      const newAmount = amount !== undefined ? Number(amount) : Number(existing.amount);
      const newDelta = this.balanceDeltaFor(newType, newAmount);

      await tx.supplier.update({
        where: { id: existing.supplierId },
        data: { balance: { increment: newDelta - oldDelta } },
      });

      const updateData: Record<string, unknown> = {};
      if (type) updateData.type = type as SupplierTransactionType;
      if (paymentMethod) updateData.paymentMethod = paymentMethod as SupplierPaymentMethod;
      if (amount !== undefined) updateData.amount = amount as number;
      if (description !== undefined) updateData.description = description as string;
      if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate as string) : null;
      if (paidAt !== undefined) updateData.paidAt = paidAt ? new Date(paidAt as string) : null;

      return tx.supplierTransaction.update({ where: { id: txId }, data: updateData });
    });
  }

  async deleteTransaction(txId: string, storeId: string) {
    const existing = await this.prisma.supplierTransaction.findUnique({ where: { id: txId } });
    if (!existing || existing.storeId !== storeId) throw new NotFoundException('Transaction not found');

    await this.prisma.$transaction(async (tx) => {
      const delta = this.balanceDeltaFor(existing.type, Number(existing.amount));
      await tx.supplier.update({
        where: { id: existing.supplierId },
        data: { balance: { increment: -delta } },
      });
      await tx.supplierTransaction.delete({ where: { id: txId } });
    });

    return { success: true };
  }

  async getBalance(supplierId: string, storeId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, storeId: true, balance: true, nameRu: true, nameUz: true },
    });
    if (!supplier || supplier.storeId !== storeId) throw new NotFoundException('Supplier not found');
    return { supplierId, balance: supplier.balance };
  }

  async recordPayment(storeId: string, userId: string, data: Record<string, unknown>) {
    return this.createTransaction(storeId, userId, { ...data, type: 'PAYMENT' });
  }

  private balanceDeltaFor(type: SupplierTransactionType, amount: number): number {
    // Positive balance = we owe them; negative = they owe us
    switch (type) {
      case 'PURCHASE':   return amount;   // we received goods → debt increases
      case 'PAYMENT':    return -amount;  // we paid → debt decreases
      case 'RETURN':     return -amount;  // we returned goods → debt decreases
      case 'ADVANCE':    return -amount;  // we pre-paid → they owe us
      case 'ADJUSTMENT': return amount;   // manual, positive or negative
      default:           return 0;
    }
  }

  async delete(id: string, storeId: string) {
    await this.findById(id, storeId);

    // Check if supplier has arrivals
    const arrivalsCount = await this.prisma.inventoryArrival.count({
      where: { supplierId: id },
    });

    if (arrivalsCount > 0) {
      // Soft delete if has arrivals
      return this.deactivate(id, storeId);
    }

    // Hard delete if no arrivals
    await this.prisma.supplier.delete({
      where: { id },
    });

    return { success: true, deleted: true };
  }
}
