// Standalone SQLite seed runner (no Electron dependency)
import path from "path";
import * as bcrypt from "bcrypt";

const prismaClientPath = path.join(
  __dirname,
  "..",
  "src",
  "generated",
  "prisma-sqlite",
);
const { PrismaClient } = require(prismaClientPath);

// Default to the Electron app's actual database in AppData
const useAppData =
  process.argv.includes("--appdata") || !process.argv.includes("--local");
const dbPath = useAppData
  ? path.join(process.env.APPDATA || "", "POSGRO", "pos-local.db")
  : path.join(__dirname, "..", "prisma", "local.db");
const dbUrl = "file:" + dbPath;
console.log(`Using database: ${dbPath}`);

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

async function main() {
  console.log("Seeding SQLite local database...");

  // LOCAL CONFIG
  const existingConfig = await prisma.localConfig.findUnique({
    where: { id: "config" },
    select: { id: true, storePin: true },
  });

  if (!existingConfig) {
    const hashedStorePin = await bcrypt.hash("1234", 10);
    await prisma.localConfig.create({
      data: {
        id: "config",
        storeId: "1234",
        storeName: "Yangi asr market",
        terminalId: "T1",
        apiUrl: "https://pos.bobur-dev.uz/api",
        storePin: hashedStorePin,
      },
    });
    console.log("Local config created (Store PIN: 1234)");
  }

  // USERS
  const adminExists = await prisma.user.findUnique({
    where: { phone: "998932144774" },
  });
  if (!adminExists) {
    const pw = await bcrypt.hash("123456", 10);
    await prisma.user.create({
      data: {
        phone: "998932144774",
        password: pw,
        role: "ADMIN",
        nameUz: "Administrator",
        nameRu: "Администратор",
        active: true,
      },
    });
    console.log("Admin user created");
  }

  const cashierExists = await prisma.user.findUnique({
    where: { phone: "998911234602" },
  });
  if (!cashierExists) {
    const pw = await bcrypt.hash("123456", 10);
    await prisma.user.create({
      data: {
        phone: "998911234602",
        password: pw,
        role: "USER",
        nameUz: "Boburshoh",
        nameRu: "Бобуршох",
        active: true,
      },
    });
    console.log("Cashier user created");
  }

  // CATEGORIES
  const categoryCount = await prisma.category.count();
  if (categoryCount === 0) {
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
    for (const c of categoriesData) {
      await prisma.category.create({ data: c });
    }
    console.log(`${categoriesData.length} categories created`);
  }

  // SYSTEM SETTINGS
  const defaultSettings = [
    { key: "store_name", value: "Yangi asr market" },
    { key: "store_address", value: "Fergana, Uzbekistan" },
    { key: "store_phone", value: "+998 932144774" },
    { key: "tax_rate", value: "0" },
    { key: "receipt_header", value: "Yangi asr market" },
    {
      key: "receipt_footer",
      value: "Xaridingiz uchun rahmat!\nSpasibo za pokupku!",
    },
    { key: "currency", value: "UZS" },
    { key: "currency_symbol", value: "so'm" },
    { key: "sync_interval", value: "5" },
    { key: "last_product_sync", value: new Date(0).toISOString() },
    { key: "last_sale_sync", value: new Date(0).toISOString() },
    { key: "default_language", value: "uz" },
    { key: "default_theme", value: "light" },
    { key: "printer_enabled", value: "false" },
    { key: "printer_name", value: "" },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log("System settings configured");

  console.log("\nLocal database seeding completed!");
  console.log("\n=== Login Credentials ===");
  console.log("Admin user:");
  console.log("  Phone: 998932144774");
  console.log("  Password: 123456");
  console.log("Cashier user:");
  console.log("  Phone: 998911234602");
  console.log("  Password: 123456");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
