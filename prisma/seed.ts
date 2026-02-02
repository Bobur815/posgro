import { PrismaClient } from '@prisma/client/edge';
import { USER_ROLES } from '@shared/constants';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: adminPassword,
      role: USER_ROLES.ADMIN,
      nameUz: 'Administrator',
      nameRu: 'Администратор',
      active: true,
    },
  });
  console.log(`✅ Created admin user: ${admin.username}`);

  // Create cashier user
  const cashierPassword = await bcrypt.hash('123456', 10);
  const cashier = await prisma.user.upsert({
    where: { username: 'cashier1' },
    update: {},
    create: {
      username: 'cashier1',
      password: cashierPassword,
      role: USER_ROLES.USER,
      nameUz: 'Kassir 1',
      nameRu: 'Кассир 1',
      active: true,
    },
  });
  console.log(`✅ Created cashier user: ${cashier.username}`);

  // Create categories
  const categories = [
    { nameUz: 'Ichimliklar', nameRu: 'Напитки' },
    { nameUz: 'Sut mahsulotlari', nameRu: 'Молочные продукты' },
    { nameUz: 'Non mahsulotlari', nameRu: 'Хлебобулочные изделия' },
    { nameUz: 'Meva va sabzavotlar', nameRu: 'Фрукты и овощи' },
    { nameUz: 'Go\'sht mahsulotlari', nameRu: 'Мясные продукты' },
    { nameUz: 'Oziq-ovqat', nameRu: 'Бакалея' },
    { nameUz: 'Shirinliklar', nameRu: 'Сладости' },
    { nameUz: 'Uy-ro\'zg\'or', nameRu: 'Бытовые товары' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { id: cat.nameUz.toLowerCase().replace(/[^a-z]/g, '-') },
      update: {},
      create: {
        id: cat.nameUz.toLowerCase().replace(/[^a-z]/g, '-'),
        nameUz: cat.nameUz,
        nameRu: cat.nameRu,
        active: true,
      },
    });
  }
  console.log(`✅ Created ${categories.length} categories`);

  // Create sample products
  const beveragesCategory = await prisma.category.findFirst({
    where: { nameRu: 'Напитки' },
  });

  const dairyCategory = await prisma.category.findFirst({
    where: { nameRu: 'Молочные продукты' },
  });

  if (beveragesCategory && dairyCategory) {
    const products = [
      {
        barcode: '4780000000001',
        nameUz: 'Coca-Cola 1L',
        nameRu: 'Кока-Кола 1Л',
        price: 12000,
        cost: 9000,
        stock: 50,
        minStock: 10,
        unit: 'шт',
        categoryId: beveragesCategory.id,
      },
      {
        barcode: '4780000000002',
        nameUz: 'Fanta 1L',
        nameRu: 'Фанта 1Л',
        price: 12000,
        cost: 9000,
        stock: 45,
        minStock: 10,
        unit: 'шт',
        categoryId: beveragesCategory.id,
      },
      {
        barcode: '4780000000003',
        nameUz: 'Suv 1.5L',
        nameRu: 'Вода 1.5Л',
        price: 3000,
        cost: 1500,
        stock: 100,
        minStock: 20,
        unit: 'шт',
        categoryId: beveragesCategory.id,
      },
      {
        barcode: '4780000000004',
        nameUz: 'Sut 1L',
        nameRu: 'Молоко 1Л',
        price: 14000,
        cost: 10000,
        stock: 30,
        minStock: 10,
        unit: 'шт',
        categoryId: dairyCategory.id,
      },
      {
        barcode: '4780000000005',
        nameUz: 'Kefir 1L',
        nameRu: 'Кефир 1Л',
        price: 12000,
        cost: 8000,
        stock: 25,
        minStock: 8,
        unit: 'шт',
        categoryId: dairyCategory.id,
      },
    ];

    for (const product of products) {
      await prisma.product.upsert({
        where: { barcode: product.barcode },
        update: {},
        create: product,
      });
    }
    console.log(`✅ Created ${products.length} sample products`);
  }

  // Create sample supplier
  await prisma.supplier.upsert({
    where: { id: 'default-supplier' },
    update: {},
    create: {
      id: 'default-supplier',
      nameUz: 'Asosiy yetkazib beruvchi',
      nameRu: 'Основной поставщик',
      phone: '+998901234567',
      address: 'Fergana, Uzbekistan',
      active: true,
    },
  });
  console.log('✅ Created default supplier');

  // Create default system settings
  const settings = [
    { key: 'store_name', value: 'Grocery Store' },
    { key: 'store_address', value: 'Fergana, Uzbekistan' },
    { key: 'store_phone', value: '+998 XX XXX XX XX' },
    { key: 'tax_rate', value: '0.12' },
    { key: 'receipt_header', value: 'Welcome to Grocery Store!' },
    { key: 'receipt_footer', value: 'Thank you for your purchase!' },
    { key: 'sync_interval', value: '5' },
    { key: 'default_language', value: 'ru' },
    { key: 'default_theme', value: 'light' },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
  console.log(`✅ Created ${settings.length} system settings`);

  console.log('🎉 Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
