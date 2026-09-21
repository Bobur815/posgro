/**
 * Baked-in content: the landing page renders THIS immediately, then fetches the live
 * config and swaps it in. With api.posgro.uz unreachable the page is still complete and
 * correct — which is exactly when someone is on it looking for a phone number.
 *
 * Generated from production on 2026-09-15. Regenerate rather than hand-editing:
 *   node scripts/sync-landing-content.mjs
 */
import type { LandingPlan, LandingContact } from '@shared/types/landing.types';

export interface Prices { starter: number; pro: number; vip: number }

export const FALLBACK_PLANS: LandingPlan[] = [
  {
    "id": "starter",
    "nameRu": "Старт",
    "nameUz": "Start",
    "taglineRu": "Для одной кассы — начните продавать сегодня",
    "taglineUz": "Bitta kassa uchun — savdoni bugundan boshlang",
    "featuresRu": [
      "Одно кассовое место",
      "Работает без интернета и синхронизируется, когда связь появится",
      "Фискальный чек",
      "Маркированные товары (Asl-Belgisi)",
      "Продажа по штрих-коду и с весами",
      "Смена, приход и расход кассы, X- и Z-отчёты",
      "Панель управления с телефона или компьютера"
    ],
    "featuresUz": [
      "Bitta kassa o'rni",
      "Internetsiz ishlaydi, aloqa tiklanganda o'zi sinxronlaydi",
      "Fiskal chek",
      "Markirovkali mahsulotlar (Asl-Belgisi)",
      "Shtrix-kod va tarozi bilan savdo",
      "Smena, kassa kirim-chiqimi, X va Z hisobot",
      "Telefon yoki kompyuterdan boshqaruv paneli"
    ],
    "highlighted": false,
    "order": 0,
    "ctaUrl": ""
  },
  {
    "id": "pro",
    "nameRu": "Про",
    "nameUz": "Pro",
    "taglineRu": "Для растущего магазина — склад, аналитика и несколько касс",
    "taglineUz": "O'sayotgan do'kon uchun — ombor, tahlil va bir nechta kassa",
    "featuresRu": [
      "Всё из тарифа «Старт»",
      "Несколько касс — совместная работа в локальной сети",
      "Склад: приход, поставщики, остатки и инвентаризация",
      "Приём накладной сканированием",
      "Полная аналитика: продажи, прибыль, топ товаров",
      "Ежедневный отчёт в Telegram",
      "Приоритетная поддержка"
    ],
    "featuresUz": [
      "Boshlang'ich tarifdagi hamma narsa",
      "Bir nechta kassa — lokal tarmoqda birgalikda ishlaydi",
      "Ombor: kirim, ta'minotchilar, qoldiq va inventarizatsiya",
      "Yuk xatini skaner qilib kirim qilish",
      "To'liq tahlil: savdo, foyda, eng ko'p sotilgan tovarlar",
      "Telegram orqali kunlik hisobot",
      "Ustuvor qo'llab-quvvatlash"
    ],
    "highlighted": true,
    "order": 1,
    "ctaUrl": ""
  },
  {
    "id": "vip",
    "nameRu": "VIP",
    "nameUz": "VIP",
    "taglineRu": "Один платёж — без абонентской платы, навсегда",
    "taglineUz": "Bir marta to'lang — oylik to'lovsiz, muddatsiz",
    "featuresRu": [
      "Всё из тарифа «Про»",
      "Единоразовый платёж — без ежемесячной оплаты",
      "Неограниченное число касс",
      "Несколько магазинов в одной панели",
      "Установка и настройка — за нами",
      "Все обновления бесплатно",
      "Персональный менеджер"
    ],
    "featuresUz": [
      "Pro tarifdagi hamma narsa",
      "Bir martalik to'lov — oylik to'lov yo'q",
      "Cheksiz kassa o'rni",
      "Bir nechta do'konni bitta paneldan boshqarish",
      "O'rnatish va sozlash bizning zimmamizda",
      "Barcha yangilanishlar bepul",
      "Shaxsiy menejer"
    ],
    "highlighted": false,
    "order": 2,
    "ctaUrl": ""
  }
];

export const FALLBACK_PRICES: Prices = {
  "starter": 100000,
  "pro": 150000,
  "vip": 6000000
};

export const FALLBACK_CONTACT: LandingContact = {
  "phones": [
    {
      "label": "",
      "number": "+998 90 166 27 14"
    }
  ],
  "socials": [
    {
      "platform": "telegram",
      "url": "https://t.me/posgro",
      "order": 0
    },
    {
      "platform": "instagram",
      "url": "https://www.instagram.com/posgro.uz/",
      "order": 1
    },
    {
      "platform": "facebook",
      "url": "https://www.facebook.com/posgro.uz",
      "order": 2
    }
  ],
  "email": "",
  "addressRu": "",
  "addressUz": "",
  "workingHoursRu": "Понедельник–суббота, 9:00–18:00",
  "workingHoursUz": "Dushanba–Shanba, 9:00–18:00"
};
