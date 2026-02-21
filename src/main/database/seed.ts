// src/main/database/seed.ts
import { Category, Supplier } from '@shared/types';
import { getPrismaClient } from './sqlite-client';
import * as bcrypt from 'bcrypt';

export async function seedLocalDatabase(): Promise<void> {
  const prisma = getPrismaClient();

  console.log('Seeding local database...');

  // ==================== LOCAL CONFIG ====================
  const existingConfig = await prisma.localConfig.findUnique({
    where: { id: 'config' },
    select: { id: true, storePin: true },
  });

  if (!existingConfig) {
    const hashedStorePin = await bcrypt.hash('1234', 10);
    await prisma.localConfig.create({
      data: {
        id: 'config',
        storeId: process.env.STORE_ID || 'store-001',
        storeName: process.env.STORE_NAME || 'Grocery Store',
        terminalId: process.env.TERMINAL_ID || 'T1',
        apiUrl: process.env.VPS_API_URL || 'http://localhost:3000',
        storePin: hashedStorePin,
      },
    });
    console.log('Local config created (Store PIN: 1234)');
  } else if (!existingConfig.storePin) {
    const hashedStorePin = await bcrypt.hash('1234', 10);
    await prisma.localConfig.update({
      where: { id: 'config' },
      data: { storePin: hashedStorePin },
    });
    console.log('Store PIN set to: 1234');
  }

  // ==================== USERS ====================
  const adminExists = await prisma.user.findUnique({
    where: { phone: '998901234567' },
  });

  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('123456', 10);
    await prisma.user.create({
      data: {
        phone: '998901234567',
        password: hashedPassword,
        role: 'ADMIN',
        nameUz: 'Administrator',
        nameRu: 'Администратор',
        active: true,
      },
    });
    console.log('Admin user created (phone: 998901234567, password: 123456)');
  }

  const cashierExists = await prisma.user.findUnique({
    where: { phone: '998911112222' },
  });

  if (!cashierExists) {
    const hashedPassword = await bcrypt.hash('123456', 10);
    await prisma.user.create({
      data: {
        phone: '998911112222',
        password: hashedPassword,
        role: 'USER',
        nameUz: 'Kassir',
        nameRu: 'Кассир',
        active: true,
      },
    });
    console.log('Cashier user created (phone: 998911112222, password: 123456)');
  }

  // ==================== CATEGORIES ====================
  const categoryCount = await prisma.category.count();

  if (categoryCount === 0) {
    const categories = [
      { nameUz: 'Ichimliklar', nameRu: 'Напитки' },
      { nameUz: 'Sut mahsulotlari', nameRu: 'Молочные продукты' },
      { nameUz: 'Non mahsulotlari', nameRu: 'Хлебобулочные изделия' },
      { nameUz: 'Meva va sabzavotlar', nameRu: 'Фрукты и овощи' },
      { nameUz: "Go'sht mahsulotlari", nameRu: 'Мясные продукты' },
      { nameUz: 'Oziq-ovqat', nameRu: 'Бакалея' },
      { nameUz: 'Shirinliklar', nameRu: 'Сладости' },
      { nameUz: "Uy-ro'zg'or", nameRu: 'Бытовые товары' },
    ];

    for (const category of categories) {
      await prisma.category.create({ data: category });
    }
    console.log(`${categories.length} categories created`);
  }

  // ==================== SUPPLIERS ====================
  const supplierCount = await prisma.supplier.count();

  if (supplierCount === 0) {
    const suppliers = [
      { nameUz: 'Coca-Cola Uzbekistan', nameRu: 'Кока-Кола Узбекистан', phone: '998712001234' },
      { nameUz: 'Nestlé Uzbekistan', nameRu: 'Нестле Узбекистан', phone: '998712002345' },
      { nameUz: 'Lactalis Uzbekistan', nameRu: 'Лакталис Узбекистан', phone: '998712003456' },
      { nameUz: 'Mahalliy yetkazib beruvchi', nameRu: 'Местный поставщик', phone: '998901112233' },
    ];

    for (const supplier of suppliers) {
      await prisma.supplier.create({ data: supplier });
    }
    console.log(`${suppliers.length} suppliers created`);
  }

      // ==================== PRODUCTS ====================
    const productCount = await prisma.product.count();

    if (productCount === 0) {
      const categories: Category[] = await prisma.category.findMany();
      const categoryMap = new Map(categories.map((c) => [c.nameRu, c.id]));
      
      // Get suppliers for supplierId
      const suppliers: Supplier[] = await prisma.supplier.findMany();
      const supplierIds = suppliers.map(s => s.id);

      // Helper for expiry dates
      const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      const products = [
        // Beverages
        { barcode: '4780000000001', nameUz: 'Coca-Cola 1L', nameRu: 'Кока-Кола 1Л', price: 12000, cost: 9500, stock: 50, minStock: 10, unit: 'шт', categoryId: categoryMap.get('Напитки')!, supplierId: supplierIds[0], expiryDate: daysFromNow(180), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000002', nameUz: 'Fanta 1L', nameRu: 'Фанта 1Л', price: 12000, cost: 9500, stock: 45, minStock: 10, unit: 'шт', categoryId: categoryMap.get('Напитки')!, supplierId: supplierIds[0], expiryDate: daysFromNow(180), discountPercent: 10, isOnPromotion: true },
        { barcode: '4780000000003', nameUz: 'Sprite 1L', nameRu: 'Спрайт 1Л', price: 12000, cost: 9500, stock: 40, minStock: 10, unit: 'шт', categoryId: categoryMap.get('Напитки')!, supplierId: supplierIds[0], expiryDate: daysFromNow(180), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000004', nameUz: 'Suv 1.5L', nameRu: 'Вода 1.5Л', price: 3000, cost: 2000, stock: 100, minStock: 20, unit: 'шт', categoryId: categoryMap.get('Напитки')!, supplierId: supplierIds[3], expiryDate: daysFromNow(365), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000005', nameUz: 'Sharbat 1L', nameRu: 'Сок 1Л', price: 15000, cost: 11000, stock: 30, minStock: 10, unit: 'шт', categoryId: categoryMap.get('Напитки')!, supplierId: supplierIds[3], expiryDate: daysFromNow(90), discountPercent: 5, isOnPromotion: true },
        // Dairy
        { barcode: '4780000000010', nameUz: 'Sut 1L', nameRu: 'Молоко 1Л', price: 12000, cost: 9000, stock: 30, minStock: 15, unit: 'шт', categoryId: categoryMap.get('Молочные продукты')!, supplierId: supplierIds[2], expiryDate: daysFromNow(7), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000011', nameUz: 'Kefir 1L', nameRu: 'Кефир 1Л', price: 14000, cost: 10000, stock: 25, minStock: 10, unit: 'шт', categoryId: categoryMap.get('Молочные продукты')!, supplierId: supplierIds[2], expiryDate: daysFromNow(5), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000012', nameUz: 'Smetana 400g', nameRu: 'Сметана 400г', price: 16000, cost: 12000, stock: 20, minStock: 8, unit: 'шт', categoryId: categoryMap.get('Молочные продукты')!, supplierId: supplierIds[2], expiryDate: daysFromNow(10), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000013', nameUz: 'Tvorog 250g', nameRu: 'Творог 250г', price: 18000, cost: 13500, stock: 15, minStock: 5, unit: 'шт', categoryId: categoryMap.get('Молочные продукты')!, supplierId: supplierIds[2], expiryDate: daysFromNow(2), discountPercent: 15, isOnPromotion: true },
        { barcode: '4780000000014', nameUz: "Sariyog' 200g", nameRu: 'Масло сливочное 200г', price: 28000, cost: 22000, stock: 25, minStock: 10, unit: 'шт', categoryId: categoryMap.get('Молочные продукты')!, supplierId: supplierIds[2], expiryDate: daysFromNow(30), discountPercent: 0, isOnPromotion: false },
        // Bakery
        { barcode: '4780000000020', nameUz: 'Non (oq)', nameRu: 'Хлеб белый', price: 4000, cost: 2800, stock: 50, minStock: 20, unit: 'шт', categoryId: categoryMap.get('Хлебобулочные изделия')!, expiryDate: daysFromNow(1), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000021', nameUz: 'Non (qora)', nameRu: 'Хлеб черный', price: 5000, cost: 3500, stock: 40, minStock: 15, unit: 'шт', categoryId: categoryMap.get('Хлебобулочные изделия')!, expiryDate: daysFromNow(1), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000022', nameUz: 'Bulochka', nameRu: 'Булочка', price: 3000, cost: 2000, stock: 60, minStock: 25, unit: 'шт', categoryId: categoryMap.get('Хлебобулочные изделия')!, expiryDate: daysFromNow(-1), discountPercent: 20, isOnPromotion: true },
        // Fruits & Vegetables
        { barcode: '4780000000030', nameUz: 'Olma', nameRu: 'Яблоки', price: 18000, cost: 12000, stock: 25, minStock: 10, unit: 'кг', categoryId: categoryMap.get('Фрукты и овощи')!, expiryDate: daysFromNow(14), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000031', nameUz: 'Banan', nameRu: 'Бананы', price: 25000, cost: 18000, stock: 8, minStock: 8, unit: 'кг', categoryId: categoryMap.get('Фрукты и овощи')!, expiryDate: daysFromNow(4), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000032', nameUz: 'Pomidor', nameRu: 'Помидоры', price: 15000, cost: 10000, stock: 30, minStock: 10, unit: 'кг', categoryId: categoryMap.get('Фрукты и овощи')!, expiryDate: daysFromNow(7), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000033', nameUz: 'Bodring', nameRu: 'Огурцы', price: 12000, cost: 8000, stock: 0, minStock: 10, unit: 'кг', categoryId: categoryMap.get('Фрукты и овощи')!, expiryDate: daysFromNow(5), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000034', nameUz: 'Kartoshka', nameRu: 'Картофель', price: 8000, cost: 5000, stock: 50, minStock: 20, unit: 'кг', categoryId: categoryMap.get('Фрукты и овощи')!, discountPercent: 0, isOnPromotion: false },
        // Meat
        { barcode: '4780000000040', nameUz: "Mol go'shti", nameRu: 'Говядина', price: 85000, cost: 70000, stock: 15, minStock: 5, unit: 'кг', categoryId: categoryMap.get('Мясные продукты')!, discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000041', nameUz: "Tovuq go'shti", nameRu: 'Курица', price: 45000, cost: 35000, stock: 20, minStock: 8, unit: 'кг', categoryId: categoryMap.get('Мясные продукты')!, discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000042', nameUz: "Qo'y go'shti", nameRu: 'Баранина', price: 95000, cost: 80000, stock: 10, minStock: 3, unit: 'кг', categoryId: categoryMap.get('Мясные продукты')!, discountPercent: 0, isOnPromotion: false },
        // Groceries
        { barcode: '4780000000050', nameUz: 'Guruch 1kg', nameRu: 'Рис 1кг', price: 18000, cost: 14000, stock: 40, minStock: 15, unit: 'шт', categoryId: categoryMap.get('Бакалея')!, supplierId: supplierIds[3], expiryDate: daysFromNow(365), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000051', nameUz: 'Makaron 400g', nameRu: 'Макароны 400г', price: 8000, cost: 5500, stock: 50, minStock: 20, unit: 'шт', categoryId: categoryMap.get('Бакалея')!, supplierId: supplierIds[3], expiryDate: daysFromNow(270), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000052', nameUz: 'Shakar 1kg', nameRu: 'Сахар 1кг', price: 14000, cost: 11000, stock: 45, minStock: 20, unit: 'шт', categoryId: categoryMap.get('Бакалея')!, supplierId: supplierIds[3], discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000053', nameUz: 'Tuz 1kg', nameRu: 'Соль 1кг', price: 3000, cost: 2000, stock: 60, minStock: 25, unit: 'шт', categoryId: categoryMap.get('Бакалея')!, supplierId: supplierIds[3], discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000054', nameUz: "O'simlik yog'i 1L", nameRu: 'Масло растительное 1Л', price: 28000, cost: 22000, stock: 35, minStock: 15, unit: 'шт', categoryId: categoryMap.get('Бакалея')!, supplierId: supplierIds[3], expiryDate: daysFromNow(180), discountPercent: 0, isOnPromotion: false },
        // Sweets
        { barcode: '4780000000060', nameUz: 'Shokolad 100g', nameRu: 'Шоколад 100г', price: 15000, cost: 11000, stock: 40, minStock: 15, unit: 'шт', categoryId: categoryMap.get('Сладости')!, supplierId: supplierIds[3], expiryDate: daysFromNow(120), discountPercent: 10, isOnPromotion: true },
        { barcode: '4780000000061', nameUz: 'Pechene 300g', nameRu: 'Печенье 300г', price: 12000, cost: 8500, stock: 35, minStock: 15, unit: 'шт', categoryId: categoryMap.get('Сладости')!, supplierId: supplierIds[3], expiryDate: daysFromNow(90), discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000062', nameUz: 'Konfet 200g', nameRu: 'Конфеты 200г', price: 20000, cost: 15000, stock: 30, minStock: 10, unit: 'шт', categoryId: categoryMap.get('Сладости')!, supplierId: supplierIds[3], expiryDate: daysFromNow(60), discountPercent: 0, isOnPromotion: false },
        // Household
        { barcode: '4780000000070', nameUz: 'Kir yuvish kukuni 1kg', nameRu: 'Стиральный порошок 1кг', price: 35000, cost: 26000, stock: 25, minStock: 10, unit: 'шт', categoryId: categoryMap.get('Бытовые товары')!, discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000071', nameUz: 'Idish yuvish vositasi 500ml', nameRu: 'Средство для мытья посуды 500мл', price: 18000, cost: 13000, stock: 30, minStock: 12, unit: 'шт', categoryId: categoryMap.get('Бытовые товары')!, discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000072', nameUz: "Hojatxona qog'ozi 4 dona", nameRu: 'Туалетная бумага 4шт', price: 15000, cost: 10000, stock: 40, minStock: 15, unit: 'шт', categoryId: categoryMap.get('Бытовые товары')!, discountPercent: 5, isOnPromotion: true },
        // Add more products with new fields
        { barcode: '4780000000073', nameUz: 'Shampun 400ml', nameRu: 'Шампунь 400мл', price: 32000, cost: 24000, stock: 20, minStock: 8, unit: 'шт', categoryId: categoryMap.get('Бытовые товары')!, discountPercent: 10, isOnPromotion: true },
        { barcode: '4780000000074', nameUz: 'Sovun 150g', nameRu: 'Мыло 150г', price: 8000, cost: 5000, stock: 50, minStock: 20, unit: 'шт', categoryId: categoryMap.get('Бытовые товары')!, discountPercent: 0, isOnPromotion: false },
        { barcode: '4780000000100', nameUz: 'Yogurt 500g', nameRu: 'Йогурт 500г', price: 14000, cost: 10000, stock: 25, minStock: 10, unit: 'шт', categoryId: categoryMap.get('Молочные продукты')!, supplierId: supplierIds[2], expiryDate: daysFromNow(14), discountPercent: 10, isOnPromotion: true },
        { barcode: '4780000000110', nameUz: 'Pepsi 1L', nameRu: 'Пепси 1Л', price: 12000, cost: 9500, stock: 35, minStock: 10, unit: 'шт', categoryId: categoryMap.get('Напитки')!, supplierId: supplierIds[0], expiryDate: daysFromNow(180), discountPercent: 15, isOnPromotion: true },
        { barcode: '4780000000130', nameUz: 'Shokolad sutli 100g', nameRu: 'Шоколад молочный 100г', price: 16000, cost: 12000, stock: 25, minStock: 8, unit: 'шт', categoryId: categoryMap.get('Сладости')!, supplierId: supplierIds[3], expiryDate: daysFromNow(150), discountPercent: 10, isOnPromotion: true },
        { barcode: '4780000000150', nameUz: 'Choy qora 100g', nameRu: 'Чай черный 100г', price: 18000, cost: 13000, stock: 35, minStock: 12, unit: 'шт', categoryId: categoryMap.get('Бакалея')!, supplierId: supplierIds[3], discountPercent: 5, isOnPromotion: true },
        { barcode: '4780000000191', nameUz: 'Sosiska 1kg', nameRu: 'Сосиски 1кг', price: 55000, cost: 40000, stock: 15, minStock: 5, unit: 'кг', categoryId: categoryMap.get('Мясные продукты')!, expiryDate: daysFromNow(5), discountPercent: 15, isOnPromotion: true },
      ];

      for (const product of products) {
        await prisma.product.create({ data: product });
      }
      console.log(`${products.length} products created`);

      // ==================== BULK WEIGHTED PRODUCTS ====================
      const weightedProducts = [
        {
          barcode: '2000001000000', // placeholder barcode (will be overridden by direct scan)
          nameUz: 'Shakar (og\'irlik)',
          nameRu: 'Сахар (на вес)',
          price: 4667, // per kg
          stock: 50,
          minStock: 5,
          unit: 'кг',
          categoryId: categoryMap.get('Бакалея')!,
          discountPercent: 0,
          isOnPromotion: false,
          productType: 'BULK_WEIGHTED',
          internalCode: '00001',
          canPrintLabel: true,
          bulkQuantity: 50,
          minSaleQty: 0.1,
          maxSaleQty: 25,
        },
        {
          barcode: '2000002000000',
          nameUz: 'Guruch (og\'irlik)',
          nameRu: 'Рис (на вес)',
          price: 12000,
          stock: 100,
          minStock: 10,
          unit: 'кг',
          categoryId: categoryMap.get('Бакалея')!,
          discountPercent: 0,
          isOnPromotion: false,
          productType: 'BULK_WEIGHTED',
          internalCode: '00002',
          canPrintLabel: true,
          bulkQuantity: 100,
          minSaleQty: 0.1,
          maxSaleQty: 50,
        },
        {
          barcode: '2000003000000',
          nameUz: 'Un (og\'irlik)',
          nameRu: 'Мука (на вес)',
          price: 3500,
          stock: 200,
          minStock: 20,
          unit: 'кг',
          categoryId: categoryMap.get('Бакалея')!,
          discountPercent: 0,
          isOnPromotion: false,
          productType: 'BULK_WEIGHTED',
          internalCode: '00003',
          canPrintLabel: true,
          bulkQuantity: 200,
          minSaleQty: 0.1,
          maxSaleQty: 100,
        },
      ];

      for (const product of weightedProducts) {
        const existing = await prisma.product.findUnique({ where: { internalCode: product.internalCode } });
        if (!existing) {
          await prisma.product.create({ data: product });
        }
      }
      console.log(`${weightedProducts.length} bulk weighted products created`);
    }

  // ==================== BULK WEIGHTED PRODUCTS (always check) ====================
  // Run outside of productCount === 0 block so they're added to existing DBs too
  {
    const categories: Category[] = await prisma.category.findMany();
    const categoryMap = new Map(categories.map((c) => [c.nameRu, c.id]));
    const bakaleaId = categoryMap.get('Бакалея');
    if (bakaleaId) {
      const weightedDefs = [
        { barcode: '2000001000000', nameUz: "Shakar (og'irlik)", nameRu: 'Сахар (на вес)', price: 4667, stock: 50, minStock: 5, unit: 'кг', internalCode: '00001', canPrintLabel: true, bulkQuantity: 50, minSaleQty: 0.1, maxSaleQty: 25 },
        { barcode: '2000002000000', nameUz: "Guruch (og'irlik)", nameRu: 'Рис (на вес)', price: 12000, stock: 100, minStock: 10, unit: 'кг', internalCode: '00002', canPrintLabel: true, bulkQuantity: 100, minSaleQty: 0.1, maxSaleQty: 50 },
        { barcode: '2000003000000', nameUz: "Un (og'irlik)", nameRu: 'Мука (на вес)', price: 3500, stock: 200, minStock: 20, unit: 'кг', internalCode: '00003', canPrintLabel: true, bulkQuantity: 200, minSaleQty: 0.1, maxSaleQty: 100 },
      ];
      for (const def of weightedDefs) {
        const existing = await prisma.product.findUnique({ where: { internalCode: def.internalCode } });
        if (!existing) {
          await prisma.product.create({
            data: { ...def, categoryId: bakaleaId, discountPercent: 0, isOnPromotion: false, productType: 'BULK_WEIGHTED' },
          });
        }
      }
      console.log('Bulk weighted products ensured');
    }
  }

  // ==================== SYSTEM SETTINGS ====================
  const defaultSettings = [
    { key: 'store_name', value: process.env.STORE_NAME || 'Grocery Store' },
    { key: 'store_address', value: '' },
    { key: 'store_phone', value: '' },
    { key: 'tax_rate', value: '0' },
    { key: 'receipt_header', value: 'Grocery Store' },
    { key: 'receipt_footer', value: "Xaridingiz uchun rahmat!\nSpasibo za pokupku!" },
    { key: 'currency', value: 'UZS' },
    { key: 'currency_symbol', value: "so'm" },
    { key: 'sync_interval', value: '5' },
    { key: 'last_product_sync', value: new Date(0).toISOString() },
    { key: 'last_sale_sync', value: new Date(0).toISOString() },
    { key: 'default_language', value: 'ru' },
    { key: 'default_theme', value: 'light' },
    { key: 'printer_enabled', value: 'false' },
    { key: 'printer_name', value: '' },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log('System settings configured');

  console.log('\nLocal database seeding completed!');
  console.log('\n=== Login Credentials ===');
  console.log('Admin:   998901234567 / 123456');
  console.log('Cashier: 998911112222 / 123456');
}

// Run if executed directly
if (require.main === module) {
  seedLocalDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}
