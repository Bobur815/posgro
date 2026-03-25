import { getPrismaClient } from "../database/sqlite-client";
import { getAppConfig } from "../config/app-config";
import { getServerToken } from "./queue-manager";
import type {
  Category,
  Supplier,
  Product,
  InventoryArrival,
} from "../../generated/prisma-sqlite";

async function apiPost(
  url: string,
  token: string,
  body: unknown,
): Promise<Response> {
  const config = getAppConfig();
  return fetch(`${config.vpsApiUrl}${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function getLastUploadTime(
  prisma: ReturnType<typeof getPrismaClient>,
): Promise<Date> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "last_upload_sync" },
  });
  return setting ? new Date(setting.value) : new Date(0);
}

async function setLastUploadTime(
  prisma: ReturnType<typeof getPrismaClient>,
): Promise<void> {
  const now = new Date().toISOString();
  await prisma.systemSetting.upsert({
    where: { key: "last_upload_sync" },
    update: { value: now },
    create: { key: "last_upload_sync", value: now },
  });
}

export async function uploadLocalData(): Promise<void> {
  const prisma = getPrismaClient();
  const token = getServerToken();
  if (!token) {
    throw new Error("No server token — log in first to sync");
  }

  const since = await getLastUploadTime(prisma);
  console.log(
    `Uploading local data created/updated after ${since.toISOString()}...`,
  );

  await uploadCategories(prisma, token, since);
  await uploadSuppliers(prisma, token, since);
  await uploadProducts(prisma, token, since);
  await uploadArrivals(prisma, token, since);

  await setLastUploadTime(prisma);
  console.log("Upload sync completed");
}

async function uploadCategories(
  prisma: ReturnType<typeof getPrismaClient>,
  token: string,
  _since: Date,
): Promise<void> {
  // Always upload all categories — they are few and the server upserts by name,
  // so this is safe and avoids missing categories created before last_upload_sync was set.
  const categories = await prisma.category.findMany({});

  if (categories.length === 0) {
    console.log("No categories to upload");
    return;
  }

  console.log(`Uploading ${categories.length} categories...`);
  const payload = categories.map((c: Category) => ({
    nameUz: c.nameUz,
    nameRu: c.nameRu,
    active: c.active,
  }));

  const res = await apiPost("/categories/sync-bulk", token, {
    categories: payload,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload categories: ${text}`);
  }
  const result = (await res.json()) as {
    created: number;
    updated: number;
    errors: number;
  };
  console.log(
    `Categories uploaded: ${result.created} created, ${result.updated} updated, ${result.errors} errors`,
  );
}

async function uploadSuppliers(
  prisma: ReturnType<typeof getPrismaClient>,
  token: string,
  since: Date,
): Promise<void> {
  const suppliers = await prisma.supplier.findMany({
    where: { createdAt: { gt: since } },
  });

  if (suppliers.length === 0) {
    console.log("No new suppliers to upload");
    return;
  }

  console.log(`Uploading ${suppliers.length} suppliers...`);
  const payload = suppliers.map((s: Supplier) => ({
    id: s.id,
    nameUz: s.nameUz,
    nameRu: s.nameRu,
    phone: s.phone || undefined,
    address: s.address || undefined,
    active: s.active,
  }));

  const res = await apiPost("/suppliers/sync-bulk", token, {
    suppliers: payload,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload suppliers: ${text}`);
  }
  const result = (await res.json()) as {
    created: number;
    updated: number;
    errors: number;
  };
  console.log(
    `Suppliers uploaded: ${result.created} created, ${result.updated} updated, ${result.errors} errors`,
  );
}

async function uploadProducts(
  prisma: ReturnType<typeof getPrismaClient>,
  token: string,
  since: Date,
): Promise<void> {
  const products = await prisma.product.findMany({
    where: { updatedAt: { gt: since } },
  });

  if (products.length === 0) {
    console.log("No new/updated products to upload");
    return;
  }

  console.log(`Uploading ${products.length} products...`);
  const payload = products.map((p: Product) => ({
    barcode: p.barcode,
    nameUz: p.nameUz,
    nameRu: p.nameRu,
    price: Number(p.price),
    cost: p.cost ? Number(p.cost) : undefined,
    stock: Number(p.stock),
    minStock: Number(p.minStock),
    unit: p.unit,
    categoryId: p.categoryId,
    active: p.active,
    productType: p.productType,
    internalCode: p.internalCode ?? undefined,
    bulkQuantity: p.bulkQuantity ? Number(p.bulkQuantity) : undefined,
    minSaleQty: p.minSaleQty ? Number(p.minSaleQty) : undefined,
    maxSaleQty: p.maxSaleQty ? Number(p.maxSaleQty) : undefined,
  }));

  const res = await apiPost("/products/sync-bulk", token, {
    products: payload,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload products: ${text}`);
  }
  const result = (await res.json()) as {
    created: number;
    updated: number;
    errors: number;
  };
  console.log(
    `Products uploaded: ${result.created} created, ${result.updated} updated, ${result.errors} errors`,
  );
}

async function uploadArrivals(
  prisma: ReturnType<typeof getPrismaClient>,
  token: string,
  since: Date,
): Promise<void> {
  const arrivals = await prisma.inventoryArrival.findMany({
    where: { createdAt: { gt: since } },
    include: { product: true },
  });

  if (arrivals.length === 0) {
    console.log("No new arrivals to upload");
    return;
  }

  console.log(`Uploading ${arrivals.length} inventory arrivals...`);
  const payload = arrivals.map(
    (a: InventoryArrival & { product: Product }) => ({
      id: a.id,
      productBarcode: a.product.barcode,
      supplierId: a.supplierId || undefined,
      quantity: Number(a.quantity),
      cost: Number(a.cost),
      notes: a.notes || undefined,
      createdBy: a.createdBy,
      createdAt: a.createdAt.toISOString(),
    }),
  );

  const res = await apiPost("/inventory/arrivals/sync-bulk", token, {
    arrivals: payload,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload arrivals: ${text}`);
  }
  const result = (await res.json()) as {
    created: number;
    skipped: number;
    errors: number;
  };
  console.log(
    `Arrivals uploaded: ${result.created} created, ${result.skipped} skipped, ${result.errors} errors`,
  );
}
