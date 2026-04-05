import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { getServerToken } from './queue-manager';

export async function syncProducts(): Promise<void> {
  const prisma = getPrismaClient();
  const config = getAppConfig();

  const token = getServerToken();
  if (!token) {
    throw new Error('No server token available — log in first to sync');
  }

  // Get last sync timestamp
  const lastSyncSetting = await prisma.systemSetting.findUnique({
    where: { key: 'last_product_sync' },
  });
  const lastSync = lastSyncSetting?.value || new Date(0).toISOString();


  try {
    const response = await fetch(
      `${config.vpsApiUrl}/products?updatedAfter=${encodeURIComponent(lastSync)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const products = await response.json();

    if (!Array.isArray(products) || products.length === 0) {
      return;
    }


    for (const product of products) {
      // Check if a product with the same barcode already exists locally
      const existing = await prisma.product.findUnique({
        where: { barcode: product.barcode },
        select: { id: true },
      });

      if (existing && existing.id === product.id) {
        // IDs match — just update fields
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            nameRu: product.nameRu,
            nameUz: product.nameUz,
            price: product.price,
            stock: product.stock,
            minStock: product.minStock,
            unit: product.unit,
            categoryId: product.categoryId,
            active: product.active,
            mxik: product.mxik ?? null,
            productType: product.productType ?? 'REGULAR',
            internalCode: product.internalCode ?? null,
            updatedAt: new Date(product.updatedAt),
          },
        });
      } else if (existing && existing.id !== product.id) {
        // ID mismatch — fix it if safe (no sales reference the old local ID)
        const saleCount = await prisma.saleItem.count({ where: { productId: existing.id } });
        if (saleCount === 0) {
          await prisma.product.delete({ where: { id: existing.id } });
          await prisma.product.create({
            data: {
              id: product.id,
              barcode: product.barcode,
              nameRu: product.nameRu,
              nameUz: product.nameUz,
              price: product.price,
              cost: product.cost ?? null,
              stock: product.stock,
              minStock: product.minStock,
              unit: product.unit,
              categoryId: product.categoryId,
              active: product.active,
              mxik: product.mxik ?? null,
              productType: product.productType ?? 'REGULAR',
              internalCode: product.internalCode ?? null,
              createdAt: new Date(product.createdAt),
              updatedAt: new Date(product.updatedAt),
            },
          });
        } else {
          // Has sales — keep local ID, just update fields
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              nameRu: product.nameRu,
              nameUz: product.nameUz,
              price: product.price,
              stock: product.stock,
              minStock: product.minStock,
              unit: product.unit,
              categoryId: product.categoryId,
              active: product.active,
              mxik: product.mxik ?? null,
              productType: product.productType ?? 'REGULAR',
              internalCode: product.internalCode ?? null,
              updatedAt: new Date(product.updatedAt),
            },
          });
        }
      } else {
        // No local product — create with VPS ID
        await prisma.product.create({
          data: {
            id: product.id,
            barcode: product.barcode,
            nameRu: product.nameRu,
            nameUz: product.nameUz,
            price: product.price,
            cost: product.cost ?? null,
            stock: product.stock,
            minStock: product.minStock,
            unit: product.unit,
            categoryId: product.categoryId,
            active: product.active,
            mxik: product.mxik ?? null,
            productType: product.productType ?? 'REGULAR',
            internalCode: product.internalCode ?? null,
            createdAt: new Date(product.createdAt),
            updatedAt: new Date(product.updatedAt),
          },
        });
      }
    }

    // Update last sync timestamp
    await prisma.systemSetting.upsert({
      where: { key: 'last_product_sync' },
      update: { value: new Date().toISOString() },
      create: { key: 'last_product_sync', value: new Date().toISOString() },
    });

  } catch (error) {
    console.error('Failed to sync products:', error);
    throw error;
  }
}

export async function syncCategories(): Promise<void> {
  const prisma = getPrismaClient();
  const config = getAppConfig();

  const token = getServerToken();
  if (!token) {
    throw new Error('No server token available — log in first to sync');
  }

  try {
    const response = await fetch(`${config.vpsApiUrl}/categories`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch categories: ${response.statusText}`);
    }

    const categories = await response.json();

    if (!Array.isArray(categories) || categories.length === 0) {
      return;
    }


    const productCount = await prisma.product.count();
    if (productCount === 0) {
      // No products yet — safe to fully replace categories with VPS IDs
      await prisma.$executeRaw`PRAGMA foreign_keys = OFF`;
      await prisma.$executeRaw`DELETE FROM categories`;
      await prisma.$executeRaw`DELETE FROM sqlite_sequence WHERE name='categories'`;
      await prisma.$executeRaw`PRAGMA foreign_keys = ON`;
      for (const category of categories) {
        await prisma.category.create({
          data: {
            id: category.id,
            nameRu: category.nameRu,
            nameUz: category.nameUz,
            active: category.active,
          },
        });
      }
    } else {
      // Products exist — match by nameUz to avoid breaking categoryId references
      for (const category of categories) {
        const existing = await prisma.category.findFirst({
          where: { nameUz: category.nameUz },
        });
        if (existing) {
          await prisma.category.update({
            where: { id: existing.id },
            data: { nameRu: category.nameRu, active: category.active },
          });
        } else {
          await prisma.category.create({
            data: { nameRu: category.nameRu, nameUz: category.nameUz, active: category.active },
          });
        }
      }
    }

  } catch (error) {
    console.error('Failed to sync categories:', error);
    throw error;
  }
}
