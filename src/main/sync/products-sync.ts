import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { getAuthToken } from './queue-manager';

export async function syncProducts(): Promise<void> {
  const prisma = getPrismaClient();
  const config = getAppConfig();

  const token = await getAuthToken();
  if (!token) {
    throw new Error('No auth token available for sync');
  }

  // Get last sync timestamp
  const lastSyncSetting = await prisma.systemSetting.findUnique({
    where: { key: 'last_product_sync' },
  });
  const lastSync = lastSyncSetting?.value || new Date(0).toISOString();

  console.log(`Fetching products updated after ${lastSync}...`);

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
      console.log('No product updates');
      return;
    }

    console.log(`Updating ${products.length} products...`);

    // Upsert products
    for (const product of products) {
      await prisma.product.upsert({
        where: { id: product.id },
        update: {
          barcode: product.barcode,
          nameRu: product.nameRu,
          nameUz: product.nameUz,
          price: product.price,
          stock: product.stock,
          minStock: product.minStock,
          unit: product.unit,
          categoryId: product.categoryId,
          active: product.active,
          mxik: product.mxik ?? null,
          updatedAt: new Date(product.updatedAt),
        },
        create: {
          id: product.id,
          barcode: product.barcode,
          nameRu: product.nameRu,
          nameUz: product.nameUz,
          price: product.price,
          cost: product.cost,
          stock: product.stock,
          minStock: product.minStock,
          unit: product.unit,
          categoryId: product.categoryId,
          active: product.active,
          mxik: product.mxik ?? null,
          createdAt: new Date(product.createdAt),
          updatedAt: new Date(product.updatedAt),
        },
      });
    }

    // Update last sync timestamp
    await prisma.systemSetting.upsert({
      where: { key: 'last_product_sync' },
      update: { value: new Date().toISOString() },
      create: { key: 'last_product_sync', value: new Date().toISOString() },
    });

    console.log('Products updated successfully');
  } catch (error) {
    console.error('Failed to sync products:', error);
    throw error;
  }
}

export async function syncCategories(): Promise<void> {
  const prisma = getPrismaClient();
  const config = getAppConfig();

  const token = await getAuthToken();
  if (!token) {
    throw new Error('No auth token available for sync');
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
      console.log('No categories to sync');
      return;
    }

    console.log(`Syncing ${categories.length} categories...`);

    for (const category of categories) {
      await prisma.category.upsert({
        where: { id: category.id },
        update: {
          nameRu: category.nameRu,
          nameUz: category.nameUz,
          active: category.active,
        },
        create: {
          id: category.id,
          nameRu: category.nameRu,
          nameUz: category.nameUz,
          active: category.active,
        },
      });
    }

    console.log('Categories synced successfully');
  } catch (error) {
    console.error('Failed to sync categories:', error);
    throw error;
  }
}
