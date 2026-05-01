// src/main/database/seed.ts
import { getPrismaClient } from './sqlite-client';
import * as bcrypt from 'bcryptjs'; // still used for seeding test users

export async function seedLocalDatabase(): Promise<void> {
  const prisma = getPrismaClient();


  // ==================== LOCAL CONFIG ====================
  const existingConfig = await prisma.localConfig.findUnique({
    where: { id: 'config' },
    select: { id: true, storePin: true },
  });

  if (!existingConfig) {
    await prisma.localConfig.create({
      data: {
        id: 'config',
        storeId: process.env.STORE_ID || '1234',
        storeName: process.env.STORE_NAME || 'Yangi asr market',
        terminalId: process.env.TERMINAL_ID || 'T1',
        apiUrl: process.env.VPS_API_URL || 'https://pos.bobur-dev.uz/api',
        storePin: null,
      },
    });
  }

  // ==================== USERS ====================
  const adminExists = await prisma.user.findUnique({
    where: { phone: '998932144774' },
  });

  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('123456', 10);
    await prisma.user.create({
      data: {
        phone: '998932144774',
        password: hashedPassword,
        role: 'ADMIN',
        nameUz: 'Administrator',
        nameRu: 'Администратор',
        active: true,
      },
    });
  }

  const cashierExists = await prisma.user.findUnique({
    where: { phone: '998911234602' },
  });

  if (!cashierExists) {
    const hashedPassword = await bcrypt.hash('123456', 10);
    await prisma.user.create({
      data: {
        phone: '998911234602',
        password: hashedPassword,
        role: 'USER',
        nameUz: 'Boburshoh',
        nameRu: 'Бобуршох',
        active: true,
      },
    });
  }

  // ==================== CATEGORIES ====================
  const categoryCount = await prisma.category.count();

  if (categoryCount === 0) {
    const categories = [
      { nameUz: 'Salqin ichimliklar', nameRu: 'Напитки' },
      { nameUz: 'Sut mahsulotlari', nameRu: 'Молочные продукты' },
      { nameUz: 'Non mahsulotlari', nameRu: 'Хлебобулочные изделия' },
      { nameUz: 'Meva va sabzavotlar', nameRu: 'Фрукты и овощи' },
      { nameUz: "Go'sht mahsulotlari", nameRu: 'Мясные продукты' },
      { nameUz: 'Qandolat mahsulotlari', nameRu: 'Кондитерские изделия' },
      { nameUz: "Uy-ro'zg'or", nameRu: 'Бытовые товары' },
      { nameUz: 'Kosmetika va gigiena', nameRu: 'Косметика и гигиена' },
      { nameUz: 'Don mahsulotlari', nameRu: 'Крупы и зерновые' },
      { nameUz: 'Moylar va souslar', nameRu: 'Масла и соусы' },
      { nameUz: 'Konservalar', nameRu: 'Консервы' },
      { nameUz: 'Choy va qahva', nameRu: 'Чай и кофе' },
      { nameUz: 'Ziravorlar va bahorlar', nameRu: 'Специи и приправы' },
      { nameUz: 'Muzqaymoq', nameRu: 'Мороженое' },
      { nameUz: 'Tuxum', nameRu: 'Яйца' },
      { nameUz: 'Quruq mevalar', nameRu: 'Сухофрукты и орехи' },
      { nameUz: 'Bolalar mahsulotlari', nameRu: 'Детские товары' },
      { nameUz: 'Kanstovar', nameRu: 'Канцтовары' },
    ];

    for (const category of categories) {
      await prisma.category.create({ data: category });
    }
  }

  // ==================== SYSTEM SETTINGS ====================
  const defaultSettings = [
    { key: 'store_name', value: process.env.STORE_NAME || 'Yangi asr market' },
    { key: 'store_address', value: 'Fergana, Uzbekistan' },
    { key: 'store_phone', value: '+998 932144774' },
    { key: 'tax_rate', value: '0' },
    { key: 'receipt_header', value: 'Yangi asr market' },
    { key: 'receipt_footer', value: "Xaridingiz uchun rahmat!\nSpasibo za pokupku!" },
    { key: 'currency', value: 'UZS' },
    { key: 'currency_symbol', value: "so'm" },
    { key: 'sync_interval', value: '5' },
    { key: 'last_product_sync', value: new Date(0).toISOString() },
    { key: 'last_sale_sync', value: new Date(0).toISOString() },
    { key: 'default_language', value: 'uz' },
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

}

