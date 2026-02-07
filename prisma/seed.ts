// prisma/seed.ts
import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database seed...");

  // ==================== CREATE DEFAULT STORE ====================
  const store = await prisma.store.upsert({
    where: { id: "default-store" },
    update: {},
    create: {
      id: "default-store",
      name: "Grocery Store",
      address: "Fergana, Uzbekistan",
      phone: "+998 90 166 27 14",
      active: true,
      settings: JSON.stringify({
        taxRate: 0,
        receiptHeader: "Grocery Store",
        receiptFooter: "Xaridingiz uchun rahmat!\nSpasibo za pokupku!",
        currency: "UZS",
      }),
    },
  });
  console.log(`Created store: ${store.name}`);

  // ==================== CREATE SUPER ADMIN ====================
  const superAdminPassword = await bcrypt.hash("123456", 10);
  let superAdmin = await prisma.user.findFirst({
    where: { phone: "998901662714", storeId: null },
  });
  if (!superAdmin) {
    superAdmin = await prisma.user.create({
      data: {
        phone: "998901662714",
        password: superAdminPassword,
        role: UserRole.SUPER_ADMIN,
        nameUz: "Super Administrator",
        nameRu: "Супер Администратор",
        active: true,
        storeId: null,
      },
    });
  }
  console.log(`Created super admin: ${superAdmin.phone} (password: 123456)`);

  // ==================== CREATE STORE ADMIN ====================
  const adminPassword = await bcrypt.hash("123456", 10);
  const admin = await prisma.user.upsert({
    where: { storeId_phone: { storeId: store.id, phone: "998901234567" } },
    update: {},
    create: {
      storeId: store.id,
      phone: "998901234567",
      password: adminPassword,
      role: UserRole.ADMIN,
      nameUz: "Administrator",
      nameRu: "Администратор",
      active: true,
    },
  });
  console.log(`Created admin: ${admin.phone} (password: 123456)`);

  // ==================== CREATE CASHIER ====================
  const cashierPassword = await bcrypt.hash("123456", 10);
  const cashier = await prisma.user.upsert({
    where: { storeId_phone: { storeId: store.id, phone: "998911112222" } },
    update: {},
    create: {
      storeId: store.id,
      phone: "998911112222",
      password: cashierPassword,
      role: UserRole.USER,
      nameUz: "Kassir",
      nameRu: "Кассир",
      active: true,
    },
  });
  console.log(`Created cashier: ${cashier.phone} (password: 123456)`);

  // ==================== CREATE CATEGORIES ====================
  const categoriesData = [
    { nameUz: "Ichimliklar", nameRu: "Напитки" },
    { nameUz: "Sut mahsulotlari", nameRu: "Молочные продукты" },
    { nameUz: "Non mahsulotlari", nameRu: "Хлебобулочные изделия" },
    { nameUz: "Meva va sabzavotlar", nameRu: "Фрукты и овощи" },
    { nameUz: "Go'sht mahsulotlari", nameRu: "Мясные продукты" },
    { nameUz: "Oziq-ovqat", nameRu: "Бакалея" },
    { nameUz: "Shirinliklar", nameRu: "Сладости" },
    { nameUz: "Uy-ro'zg'or", nameRu: "Бытовые товары" },
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

  // ==================== CREATE SUPPLIERS ====================
  const allCategories = await prisma.category.findMany({
    where: { storeId: store.id },
  });
  const categoryMap = new Map(allCategories.map((c) => [c.nameRu, c.id]));

  const getCategoryIds = (names: string[]) =>
    allCategories
      .filter((c) => names.includes(c.nameRu))
      .map((c) => ({ id: c.id }));

  const suppliers = [
    {
      id: "supplier-1",
      nameUz: "Coca-Cola Ichimliklari",
      nameRu: "Coca-Cola Напитки",
      phone: "+998901234567",
      address: "Toshkent, Uzbekistan",
      categoryNames: ["Напитки"],
    },
    {
      id: "supplier-2",
      nameUz: "Sut Mahsulotlari MChJ",
      nameRu: "Молочные Продукты ООО",
      phone: "+998901234568",
      address: "Samarqand, Uzbekistan",
      categoryNames: ["Молочные продукты"],
    },
    {
      id: "supplier-3",
      nameUz: "Umumiy Yetkazib Beruvchi",
      nameRu: "Универсальный Поставщик",
      phone: "+998901234569",
      address: "Farg'ona, Uzbekistan",
      categoryNames: ["Напитки", "Молочные продукты", "Бакалея", "Сладости"],
    },
  ];

  for (const { categoryNames, ...supplier } of suppliers) {
    await prisma.supplier.upsert({
      where: { id: supplier.id },
      update: {
        categories: { set: getCategoryIds(categoryNames) },
      },
      create: {
        ...supplier,
        storeId: store.id,
        active: true,
        categories: { connect: getCategoryIds(categoryNames) },
      },
    });
  }
  console.log(`Created ${suppliers.length} suppliers`);

  // ==================== CREATE PRODUCTS ====================

  // Helper dates for expiry
  const daysFromNow = (days: number) =>
    new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const products = [
    // Beverages — supplied by Coca-Cola (supplier-1)
    { barcode: "4780000000001", nameUz: "Coca-Cola 1L", nameRu: "Кока-Кола 1Л", price: 12000, cost: 9500, stock: 50, minStock: 10, unit: "шт", categoryId: categoryMap.get("Напитки")!, supplierId: "supplier-1", expiryDate: daysFromNow(180), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000002", nameUz: "Fanta 1L", nameRu: "Фанта 1Л", price: 12000, cost: 9500, stock: 45, minStock: 10, unit: "шт", categoryId: categoryMap.get("Напитки")!, supplierId: "supplier-1", expiryDate: daysFromNow(180), discountPercent: 10, isOnPromotion: true },
    { barcode: "4780000000003", nameUz: "Sprite 1L", nameRu: "Спрайт 1Л", price: 12000, cost: 9500, stock: 40, minStock: 10, unit: "шт", categoryId: categoryMap.get("Напитки")!, supplierId: "supplier-1", expiryDate: daysFromNow(180), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000004", nameUz: "Suv 1.5L", nameRu: "Вода 1.5Л", price: 3000, cost: 2000, stock: 100, minStock: 20, unit: "шт", categoryId: categoryMap.get("Напитки")!, supplierId: "supplier-3", expiryDate: daysFromNow(365), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000005", nameUz: "Sharbat 1L", nameRu: "Сок 1Л", price: 15000, cost: 11000, stock: 30, minStock: 10, unit: "шт", categoryId: categoryMap.get("Напитки")!, supplierId: "supplier-3", expiryDate: daysFromNow(90), discountPercent: 5, isOnPromotion: true },
    // Dairy — supplied by Dairy Supplier (supplier-2)
    { barcode: "4780000000010", nameUz: "Sut 1L", nameRu: "Молоко 1Л", price: 12000, cost: 9000, stock: 30, minStock: 15, unit: "шт", categoryId: categoryMap.get("Молочные продукты")!, supplierId: "supplier-2", expiryDate: daysFromNow(7), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000011", nameUz: "Kefir 1L", nameRu: "Кефир 1Л", price: 14000, cost: 10000, stock: 25, minStock: 10, unit: "шт", categoryId: categoryMap.get("Молочные продукты")!, supplierId: "supplier-2", expiryDate: daysFromNow(5), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000012", nameUz: "Smetana 400g", nameRu: "Сметана 400г", price: 16000, cost: 12000, stock: 20, minStock: 8, unit: "шт", categoryId: categoryMap.get("Молочные продукты")!, supplierId: "supplier-2", expiryDate: daysFromNow(10), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000013", nameUz: "Tvorog 250g", nameRu: "Творог 250г", price: 18000, cost: 13500, stock: 15, minStock: 5, unit: "шт", categoryId: categoryMap.get("Молочные продукты")!, supplierId: "supplier-2", expiryDate: daysFromNow(2), discountPercent: 15, isOnPromotion: true },
    { barcode: "4780000000014", nameUz: "Sariyog' 200g", nameRu: "Масло сливочное 200г", price: 28000, cost: 22000, stock: 25, minStock: 10, unit: "шт", categoryId: categoryMap.get("Молочные продукты")!, supplierId: "supplier-2", expiryDate: daysFromNow(30), discountPercent: 0, isOnPromotion: false },
    // Bakery — no supplier, short expiry
    { barcode: "4780000000020", nameUz: "Non (oq)", nameRu: "Хлеб белый", price: 4000, cost: 2800, stock: 50, minStock: 20, unit: "шт", categoryId: categoryMap.get("Хлебобулочные изделия")!, expiryDate: daysFromNow(1), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000021", nameUz: "Non (qora)", nameRu: "Хлеб черный", price: 5000, cost: 3500, stock: 40, minStock: 15, unit: "шт", categoryId: categoryMap.get("Хлебобулочные изделия")!, expiryDate: daysFromNow(1), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000022", nameUz: "Bulochka", nameRu: "Булочка", price: 3000, cost: 2000, stock: 60, minStock: 25, unit: "шт", categoryId: categoryMap.get("Хлебобулочные изделия")!, expiryDate: daysFromNow(-1), discountPercent: 20, isOnPromotion: true },
    // Fruits & Vegetables
    { barcode: "4780000000030", nameUz: "Olma", nameRu: "Яблоки", price: 18000, cost: 12000, stock: 25, minStock: 10, unit: "кг", categoryId: categoryMap.get("Фрукты и овощи")!, expiryDate: daysFromNow(14), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000031", nameUz: "Banan", nameRu: "Бананы", price: 25000, cost: 18000, stock: 8, minStock: 8, unit: "кг", categoryId: categoryMap.get("Фрукты и овощи")!, expiryDate: daysFromNow(4), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000032", nameUz: "Pomidor", nameRu: "Помидоры", price: 15000, cost: 10000, stock: 30, minStock: 10, unit: "кг", categoryId: categoryMap.get("Фрукты и овощи")!, expiryDate: daysFromNow(7), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000033", nameUz: "Bodring", nameRu: "Огурцы", price: 12000, cost: 8000, stock: 0, minStock: 10, unit: "кг", categoryId: categoryMap.get("Фрукты и овощи")!, expiryDate: daysFromNow(5), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000034", nameUz: "Kartoshka", nameRu: "Картофель", price: 8000, cost: 5000, stock: 50, minStock: 20, unit: "кг", categoryId: categoryMap.get("Фрукты и овощи")!, discountPercent: 0, isOnPromotion: false },
    // Meat
    { barcode: "4780000000040", nameUz: "Mol go'shti", nameRu: "Говядина", price: 85000, cost: 70000, stock: 15, minStock: 5, unit: "кг", categoryId: categoryMap.get("Мясные продукты")!, discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000041", nameUz: "Tovuq go'shti", nameRu: "Курица", price: 45000, cost: 35000, stock: 20, minStock: 8, unit: "кг", categoryId: categoryMap.get("Мясные продукты")!, discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000042", nameUz: "Qo'y go'shti", nameRu: "Баранина", price: 95000, cost: 80000, stock: 10, minStock: 3, unit: "кг", categoryId: categoryMap.get("Мясные продукты")!, discountPercent: 0, isOnPromotion: false },
    // Groceries — supplied by Universal supplier (supplier-3)
    { barcode: "4780000000050", nameUz: "Guruch 1kg", nameRu: "Рис 1кг", price: 18000, cost: 14000, stock: 40, minStock: 15, unit: "шт", categoryId: categoryMap.get("Бакалея")!, supplierId: "supplier-3", expiryDate: daysFromNow(365), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000051", nameUz: "Makaron 400g", nameRu: "Макароны 400г", price: 8000, cost: 5500, stock: 50, minStock: 20, unit: "шт", categoryId: categoryMap.get("Бакалея")!, supplierId: "supplier-3", expiryDate: daysFromNow(270), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000052", nameUz: "Shakar 1kg", nameRu: "Сахар 1кг", price: 14000, cost: 11000, stock: 45, minStock: 20, unit: "шт", categoryId: categoryMap.get("Бакалея")!, supplierId: "supplier-3", discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000053", nameUz: "Tuz 1kg", nameRu: "Соль 1кг", price: 3000, cost: 2000, stock: 60, minStock: 25, unit: "шт", categoryId: categoryMap.get("Бакалея")!, supplierId: "supplier-3", discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000054", nameUz: "O'simlik yog'i 1L", nameRu: "Масло растительное 1Л", price: 28000, cost: 22000, stock: 35, minStock: 15, unit: "шт", categoryId: categoryMap.get("Бакалея")!, supplierId: "supplier-3", expiryDate: daysFromNow(180), discountPercent: 0, isOnPromotion: false },
    // Sweets — supplied by Universal supplier (supplier-3)
    { barcode: "4780000000060", nameUz: "Shokolad 100g", nameRu: "Шоколад 100г", price: 15000, cost: 11000, stock: 40, minStock: 15, unit: "шт", categoryId: categoryMap.get("Сладости")!, supplierId: "supplier-3", expiryDate: daysFromNow(120), discountPercent: 10, isOnPromotion: true },
    { barcode: "4780000000061", nameUz: "Pechene 300g", nameRu: "Печенье 300г", price: 12000, cost: 8500, stock: 35, minStock: 15, unit: "шт", categoryId: categoryMap.get("Сладости")!, supplierId: "supplier-3", expiryDate: daysFromNow(90), discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000062", nameUz: "Konfet 200g", nameRu: "Конфеты 200г", price: 20000, cost: 15000, stock: 30, minStock: 10, unit: "шт", categoryId: categoryMap.get("Сладости")!, supplierId: "supplier-3", expiryDate: daysFromNow(60), discountPercent: 0, isOnPromotion: false },
    // Household — no supplier, no expiry
    { barcode: "4780000000070", nameUz: "Kir yuvish kukuni 1kg", nameRu: "Стиральный порошок 1кг", price: 35000, cost: 26000, stock: 25, minStock: 10, unit: "шт", categoryId: categoryMap.get("Бытовые товары")!, discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000071", nameUz: "Idish yuvish vositasi 500ml", nameRu: "Средство для мытья посуды 500мл", price: 18000, cost: 13000, stock: 30, minStock: 12, unit: "шт", categoryId: categoryMap.get("Бытовые товары")!, discountPercent: 0, isOnPromotion: false },
    { barcode: "4780000000072", nameUz: "Hojatxona qog'ozi 4 dona", nameRu: "Туалетная бумага 4шт", price: 15000, cost: 10000, stock: 40, minStock: 15, unit: "шт", categoryId: categoryMap.get("Бытовые товары")!, discountPercent: 5, isOnPromotion: true },
    // Extra products
    {
      barcode: "4780000000073",
      nameUz: "Shampun 400ml",
      nameRu: "Шампунь 400мл",
      price: 32000,
      cost: 24000,
      stock: 20,
      minStock: 8,
      unit: "шт",
      categoryId: categoryMap.get("Бытовые товары")!,
      discountPercent: 10,
      isOnPromotion: true,
    },
    {
      barcode: "4780000000074",
      nameUz: "Sovun 150g",
      nameRu: "Мыло 150г",
      price: 8000,
      cost: 5000,
      stock: 50,
      minStock: 20,
      unit: "шт",
      categoryId: categoryMap.get("Бытовые товары")!,
      discountPercent: 0,
      isOnPromotion: false,
    },

    // Electronics section - add a new category
    {
      barcode: "4780000000080",
      nameUz: "Batareyka AA 4 dona",
      nameRu: "Батарейки AA 4шт",
      price: 25000,
      cost: 18000,
      stock: 30,
      minStock: 10,
      unit: "шт",
      categoryId: categoryMap.get("Бытовые товары")!,
      discountPercent: 0,
      isOnPromotion: false,
    },
    {
      barcode: "4780000000081",
      nameUz: "Batareyka AAA 4 dona",
      nameRu: "Батарейки AAA 4шт",
      price: 22000,
      cost: 16000,
      stock: 25,
      minStock: 8,
      unit: "шт",
      categoryId: categoryMap.get("Бытовые товары")!,
      discountPercent: 0,
      isOnPromotion: false,
    },

    // Baby products
    {
      barcode: "4780000000090",
      nameUz: "Bolalar salfetkasi 100 dona",
      nameRu: "Детские салфетки 100шт",
      price: 18000,
      cost: 12000,
      stock: 35,
      minStock: 12,
      unit: "шт",
      categoryId: categoryMap.get("Бытовые товары")!,
      discountPercent: 5,
      isOnPromotion: true,
    },
    {
      barcode: "4780000000091",
      nameUz: "Bolalar kremi 150ml",
      nameRu: "Детский крем 150мл",
      price: 28000,
      cost: 20000,
      stock: 15,
      minStock: 5,
      unit: "шт",
      categoryId: categoryMap.get("Бытовые товары")!,
      discountPercent: 0,
      isOnPromotion: false,
    },

    // More dairy products
    {
      barcode: "4780000000100",
      nameUz: "Yogurt 500g",
      nameRu: "Йогурт 500г",
      price: 14000,
      cost: 10000,
      stock: 25,
      minStock: 10,
      unit: "шт",
      categoryId: categoryMap.get("Молочные продукты")!,
      supplierId: "supplier-2",
      expiryDate: daysFromNow(14),
      discountPercent: 10,
      isOnPromotion: true,
    },
    {
      barcode: "4780000000101",
      nameUz: "Suzma 500g",
      nameRu: "Сюзьма 500г",
      price: 20000,
      cost: 15000,
      stock: 18,
      minStock: 6,
      unit: "шт",
      categoryId: categoryMap.get("Молочные продукты")!,
      supplierId: "supplier-2",
      expiryDate: daysFromNow(7),
      discountPercent: 0,
      isOnPromotion: false,
    },

    // More beverages
    {
      barcode: "4780000000110",
      nameUz: "Pepsi 1L",
      nameRu: "Пепси 1Л",
      price: 12000,
      cost: 9500,
      stock: 35,
      minStock: 10,
      unit: "шт",
      categoryId: categoryMap.get("Напитки")!,
      supplierId: "supplier-1",
      expiryDate: daysFromNow(180),
      discountPercent: 15,
      isOnPromotion: true,
    },
    {
      barcode: "4780000000111",
      nameUz: "7Up 1L",
      nameRu: "7Up 1Л",
      price: 12000,
      cost: 9500,
      stock: 30,
      minStock: 10,
      unit: "шт",
      categoryId: categoryMap.get("Напитки")!,
      supplierId: "supplier-1",
      expiryDate: daysFromNow(180),
      discountPercent: 0,
      isOnPromotion: false,
    },

    // Energy drinks
    {
      barcode: "4780000000120",
      nameUz: "Burn 0.5L",
      nameRu: "Burn 0.5Л",
      price: 15000,
      cost: 11000,
      stock: 20,
      minStock: 5,
      unit: "шт",
      categoryId: categoryMap.get("Напитки")!,
      supplierId: "supplier-1",
      expiryDate: daysFromNow(120),
      discountPercent: 0,
      isOnPromotion: false,
    },

    // More sweets
    {
      barcode: "4780000000130",
      nameUz: "Shokolad sutli 100g",
      nameRu: "Шоколад молочный 100г",
      price: 16000,
      cost: 12000,
      stock: 25,
      minStock: 8,
      unit: "шт",
      categoryId: categoryMap.get("Сладости")!,
      supplierId: "supplier-3",
      expiryDate: daysFromNow(150),
      discountPercent: 10,
      isOnPromotion: true,
    },
    {
      barcode: "4780000000131",
      nameUz: "Shokolad qora 100g",
      nameRu: "Шоколад горький 100г",
      price: 18000,
      cost: 13000,
      stock: 15,
      minStock: 5,
      unit: "шт",
      categoryId: categoryMap.get("Сладости")!,
      supplierId: "supplier-3",
      expiryDate: daysFromNow(150),
      discountPercent: 0,
      isOnPromotion: false,
    },

    // Snacks
    {
      barcode: "4780000000140",
      nameUz: "Chips 150g",
      nameRu: "Чипсы 150г",
      price: 15000,
      cost: 10000,
      stock: 40,
      minStock: 15,
      unit: "шт",
      categoryId: categoryMap.get("Сладости")!,
      supplierId: "supplier-3",
      expiryDate: daysFromNow(60),
      discountPercent: 0,
      isOnPromotion: false,
    },
    {
      barcode: "4780000000141",
      nameUz: "Yong`oq 200g",
      nameRu: "Орехи 200г",
      price: 25000,
      cost: 18000,
      stock: 25,
      minStock: 8,
      unit: "шт",
      categoryId: categoryMap.get("Сладости")!,
      discountPercent: 0,
      isOnPromotion: false,
    },

    // Tea and coffee
    {
      barcode: "4780000000150",
      nameUz: "Choy qora 100g",
      nameRu: "Чай черный 100г",
      price: 18000,
      cost: 13000,
      stock: 35,
      minStock: 12,
      unit: "шт",
      categoryId: categoryMap.get("Бакалея")!,
      supplierId: "supplier-3",
      discountPercent: 5,
      isOnPromotion: true,
    },
    {
      barcode: "4780000000151",
      nameUz: "Choy yashil 50g",
      nameRu: "Чай зеленый 50г",
      price: 22000,
      cost: 16000,
      stock: 20,
      minStock: 6,
      unit: "шт",
      categoryId: categoryMap.get("Бакалея")!,
      supplierId: "supplier-3",
      discountPercent: 0,
      isOnPromotion: false,
    },
    {
      barcode: "4780000000152",
      nameUz: "Kofe 250g",
      nameRu: "Кофе 250г",
      price: 45000,
      cost: 35000,
      stock: 15,
      minStock: 4,
      unit: "шт",
      categoryId: categoryMap.get("Бакалея")!,
      supplierId: "supplier-3",
      discountPercent: 0,
      isOnPromotion: false,
    },

    // Canned food
    {
      barcode: "4780000000160",
      nameUz: "Konserva baliq 250g",
      nameRu: "Консерва рыба 250г",
      price: 30000,
      cost: 22000,
      stock: 25,
      minStock: 8,
      unit: "шт",
      categoryId: categoryMap.get("Бакалея")!,
      supplierId: "supplier-3",
      expiryDate: daysFromNow(365),
      discountPercent: 0,
      isOnPromotion: false,
    },
    {
      barcode: "4780000000161",
      nameUz: "Konserva go`sht 250g",
      nameRu: "Консерва мясо 250г",
      price: 35000,
      cost: 25000,
      stock: 20,
      minStock: 6,
      unit: "шт",
      categoryId: categoryMap.get("Бакалея")!,
      supplierId: "supplier-3",
      expiryDate: daysFromNow(365),
      discountPercent: 10,
      isOnPromotion: true,
    },

    // Spices
    {
      barcode: "4780000000170",
      nameUz: "Qalampir 50g",
      nameRu: "Перец 50г",
      price: 8000,
      cost: 5000,
      stock: 40,
      minStock: 15,
      unit: "шт",
      categoryId: categoryMap.get("Бакалея")!,
      supplierId: "supplier-3",
      discountPercent: 0,
      isOnPromotion: false,
    },
    {
      barcode: "4780000000171",
      nameUz: "Zira 50g",
      nameRu: "Зира 50г",
      price: 12000,
      cost: 8000,
      stock: 30,
      minStock: 10,
      unit: "шт",
      categoryId: categoryMap.get("Бакалея")!,
      supplierId: "supplier-3",
      discountPercent: 0,
      isOnPromotion: false,
    },

    // More fruits & vegetables
    {
      barcode: "4780000000180",
      nameUz: "Apelsin",
      nameRu: "Апельсины",
      price: 20000,
      cost: 14000,
      stock: 25,
      minStock: 8,
      unit: "кг",
      categoryId: categoryMap.get("Фрукты и овощи")!,
      expiryDate: daysFromNow(10),
      discountPercent: 0,
      isOnPromotion: false,
    },
    {
      barcode: "4780000000181",
      nameUz: "Limon",
      nameRu: "Лимоны",
      price: 15000,
      cost: 10000,
      stock: 20,
      minStock: 6,
      unit: "кг",
      categoryId: categoryMap.get("Фрукты и овощи")!,
      expiryDate: daysFromNow(14),
      discountPercent: 0,
      isOnPromotion: false,
    },
    {
      barcode: "4780000000182",
      nameUz: "Sabzi",
      nameRu: "Морковь",
      price: 10000,
      cost: 7000,
      stock: 35,
      minStock: 12,
      unit: "кг",
      categoryId: categoryMap.get("Фрукты и овощи")!,
      expiryDate: daysFromNow(21),
      discountPercent: 0,
      isOnPromotion: false,
    },

    // More meat products
    {
      barcode: "4780000000190",
      nameUz: "Kolbasa 1kg",
      nameRu: "Колбаса 1кг",
      price: 65000,
      cost: 50000,
      stock: 12,
      minStock: 4,
      unit: "кг",
      categoryId: categoryMap.get("Мясные продукты")!,
      expiryDate: daysFromNow(7),
      discountPercent: 0,
      isOnPromotion: false,
    },
    {
      barcode: "4780000000191",
      nameUz: "Sosiska 1kg",
      nameRu: "Сосиски 1кг",
      price: 55000,
      cost: 40000,
      stock: 15,
      minStock: 5,
      unit: "кг",
      categoryId: categoryMap.get("Мясные продукты")!,
      expiryDate: daysFromNow(5),
      discountPercent: 15,
      isOnPromotion: true,
    },

    // Fish
    {
      barcode: "4780000000200",
      nameUz: "Baliq 1kg",
      nameRu: "Рыба 1кг",
      price: 40000,
      cost: 30000,
      stock: 8,
      minStock: 3,
      unit: "кг",
      categoryId: categoryMap.get("Мясные продукты")!,
      expiryDate: daysFromNow(2),
      discountPercent: 0,
      isOnPromotion: false,
    },

    // Eggs
    {
      barcode: "4780000000210",
      nameUz: "Tuxum 10 dona",
      nameRu: "Яйца 10шт",
      price: 18000,
      cost: 13000,
      stock: 40,
      minStock: 15,
      unit: "шт",
      categoryId: categoryMap.get("Мясные продукты")!,
      expiryDate: daysFromNow(21),
      discountPercent: 0,
      isOnPromotion: false,
    },

    // Frozen products
    {
      barcode: "4780000000220",
      nameUz: "Muzlagan sabzavotlar 1kg",
      nameRu: "Замороженные овощи 1кг",
      price: 15000,
      cost: 10000,
      stock: 25,
      minStock: 8,
      unit: "шт",
      categoryId: categoryMap.get("Фрукты и овощи")!,
      discountPercent: 0,
      isOnPromotion: false,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: {
        storeId_barcode: { storeId: store.id, barcode: product.barcode },
      },
      update: {},
      create: {
        storeId: store.id,
        ...product,
      },
    });
  }
  console.log(`Created ${products.length} products`);

  // ==================== CREATE SYSTEM SETTINGS ====================
  const settings = [
    { key: "store_name", value: "Grocery Store" },
    { key: "store_address", value: "Fergana, Uzbekistan" },
    { key: "store_phone", value: "+998 90 166 27 14" },
    { key: "tax_rate", value: "0" },
    { key: "receipt_header", value: "Grocery Store" },
    {
      key: "receipt_footer",
      value: "Xaridingiz uchun rahmat!\nSpasibo za pokupku!",
    },
    { key: "sync_interval", value: "5" },
    { key: "default_language", value: "ru" },
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
  console.log("Super Admin: 998901662714 / 123456");
  console.log("Admin:       998901234567 / 123456");
  console.log("Cashier:     998911112222 / 123456");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
