// prisma/seed.ts
import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database seed...");

  // ==================== CREATE DEFAULT STORE ====================
  const store = await prisma.store.upsert({
    where: { id: "1234" },
    update: {},
    create: {
      id: "1234",
      name: "Yangi asr market",
      address: "Fergana, Uzbekistan",
      phone: "+998 932144774",
      active: true,
      settings: JSON.stringify({
        taxRate: 0,
        receiptHeader: "Yangi asr market",
        receiptFooter: "Xaridingiz uchun rahmat!\nSpasibo za pokupku!",
        currency: "UZS",
      }),
    },
  });
  console.log(`Created store: ${store.name}`);

  // ==================== CREATE SUPER ADMIN ====================
  const superAdminPassword = await bcrypt.hash("ErBo150893", 10);
  let superAdmin = await prisma.user.findFirst({
    where: { phone: "998901662714", storeId: null },
  });
  if (!superAdmin) {
    superAdmin = await prisma.user.create({
      data: {
        phone: "998901662714",
        password: superAdminPassword,
        role: UserRole.SUPER_ADMIN,
        nameUz: "Bobur Dev",
        nameRu: "Бобур Дев",
        active: true,
        storeId: null,
      },
    });
  }
  console.log(
    `Created super admin: ${superAdmin.phone} (password: ErBo150893)`,
  );

  // ==================== CREATE STORE ADMIN ====================
  const adminPassword = await bcrypt.hash("123456", 10);
  const admin = await prisma.user.upsert({
    where: { storeId_phone: { storeId: store.id, phone: "998932144774" } },
    update: {},
    create: {
      storeId: store.id,
      phone: "998932144774",
      password: adminPassword,
      role: UserRole.ADMIN,
      nameUz: "Admin",
      nameRu: "Админ",
      active: true,
    },
  });
  console.log(`Created admin: ${admin.phone} (password: 123456)`);

  // ==================== CREATE CASHIER ====================
  const cashierPassword = await bcrypt.hash("123456", 10);
  const cashier = await prisma.user.upsert({
    where: { storeId_phone: { storeId: store.id, phone: "998911234602" } },
    update: {},
    create: {
      storeId: store.id,
      phone: "998911234602",
      password: cashierPassword,
      role: UserRole.USER,
      nameUz: "Boburshoh",
      nameRu: "Бобуршох",
      active: true,
    },
  });
  console.log(`Created cashier: ${cashier.phone} (password: 123456)`);

  // ==================== CREATE CATEGORIES ====================
  const categoriesData = [
    { nameUz: "Salqin ichimliklar", nameRu: "Напитки" },
    { nameUz: "Sut mahsulotlari", nameRu: "Молочные продукты" },
    { nameUz: "Non mahsulotlari", nameRu: "Хлебобулочные изделия" },
    { nameUz: "Meva va sabzavotlar", nameRu: "Фрукты и овощи" },
    { nameUz: "Go'sht mahsulotlari", nameRu: "Мясные продукты" },
    { nameUz: "Qandolat mahsulotlari", nameRu: "Кондитерские изделия" },
    { nameUz: "Uy-ro'zg'or", nameRu: "Бытовые товары" },
    { nameUz: "Kosmetika va gigiena", nameRu: "Косметика и гигиена" },
    { nameUz: "Don mahsulotlari", nameRu: "Крупы и зерновые" }, // guruch, un, makaron
    { nameUz: "Moylar va souslar", nameRu: "Масла и соусы" }, // o'simlik moyi, ketchup, mayo
    { nameUz: "Konservalar", nameRu: "Консервы" }, // tushonka, kompot
    { nameUz: "Choy va qahva", nameRu: "Чай и кофе" },
    { nameUz: "Ziravorlar va bahorlar", nameRu: "Специи и приправы" },
    { nameUz: "Muzqaymoq", nameRu: "Мороженое" },
    { nameUz: "Tuxum", nameRu: "Яйца" },
    { nameUz: "Quruq mevalar", nameRu: "Сухофрукты и орехи" },
    { nameUz: "Bolalar mahsulotlari", nameRu: "Детские товары" }, // pampers, bocha ovqat
    { nameUz: "Kanstovar", nameRu: "Канцтовары" },
  ];

  for (const cat of categoriesData) {
    const existing = await prisma.category.findFirst({
      where: { storeId: store.id, nameUz: cat.nameUz },
    });
    if (!existing) {
      await prisma.category.create({
        data: {
          storeId: store.id,
          nameUz: cat.nameUz,
          nameRu: cat.nameRu,
          active: true,
        },
      });
    }
  }
  console.log(`Created ${categoriesData.length} categories`);

  // ==================== CREATE SYSTEM SETTINGS ====================
  const settings = [
    { key: "store_name", value: "Yangi Asr" },
    { key: "store_address", value: "Fergana, Uzbekistan" },
    { key: "store_phone", value: "+998 932144774" },
    { key: "tax_rate", value: "0" },
    { key: "receipt_header", value: "Yangi Asr" },
    {
      key: "receipt_footer",
      value: "Xaridingiz uchun rahmat!\nSpasibo za pokupku!",
    },
    { key: "sync_interval", value: "5" },
    { key: "default_language", value: "uz" },
    { key: "default_theme", value: "light" },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { storeId_key: { storeId: store.id, key: setting.key } },
      update: { value: setting.value },
      create: {
        storeId: store.id,
        ...setting,
      },
    });
  }
  console.log(`Created ${settings.length} system settings`);

  console.log("\nDatabase seed completed!");
  console.log("\n=== Login Credentials ===");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
