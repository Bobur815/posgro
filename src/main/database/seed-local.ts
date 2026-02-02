import { getPrismaClient } from './sqlite-client';
import * as bcrypt from 'bcrypt';

export async function seedLocalDatabase(): Promise<void> {
  const prisma = getPrismaClient();

  console.log('Seeding local database...');

  // Check if admin user exists
  const existingAdmin = await prisma.user.findUnique({
    where: { username: 'admin' },
  });

  if (!existingAdmin) {
    // Create default admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        username: 'admin',
        password: adminPassword,
        role: 'ADMIN',
        nameUz: 'Administrator',
        nameRu: 'Администратор',
        active: true,
      },
    });
    console.log('Default admin user created');
  }

  // Check if any categories exist
  const categoryCount = await prisma.category.count();

  if (categoryCount === 0) {
    // Create default categories
    const categories = [
      { id: 'beverages', nameUz: 'Ichimliklar', nameRu: 'Напитки' },
      { id: 'dairy', nameUz: 'Sut mahsulotlari', nameRu: 'Молочные продукты' },
      { id: 'bakery', nameUz: 'Non mahsulotlari', nameRu: 'Хлебобулочные изделия' },
      { id: 'produce', nameUz: 'Meva va sabzavotlar', nameRu: 'Фрукты и овощи' },
      { id: 'meat', nameUz: "Go'sht mahsulotlari", nameRu: 'Мясные продукты' },
      { id: 'grocery', nameUz: 'Oziq-ovqat', nameRu: 'Бакалея' },
      { id: 'sweets', nameUz: 'Shirinliklar', nameRu: 'Сладости' },
      { id: 'household', nameUz: "Uy-ro'zg'or", nameRu: 'Бытовые товары' },
    ];

    for (const category of categories) {
      await prisma.category.create({ data: category });
    }
    console.log('Default categories created');
  }

  // Create default system settings if not exist
  const defaultSettings = [
    { key: 'store_name', value: 'Grocery Store' },
    { key: 'store_address', value: '' },
    { key: 'store_phone', value: '' },
    { key: 'tax_rate', value: '0' },
    { key: 'receipt_header', value: '' },
    { key: 'receipt_footer', value: '' },
    { key: 'sync_interval', value: '5' },
    { key: 'last_product_sync', value: new Date(0).toISOString() },
    { key: 'last_sale_sync', value: new Date(0).toISOString() },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log('Local database seeding completed');
}
