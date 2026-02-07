import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierFilters, SupplierWhereInput } from './types/supplier.types';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

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
