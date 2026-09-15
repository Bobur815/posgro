/**
 * The landing page's own strings. Same reasoning as the portal's: this is a public page of a few
 * dozen strings, often opened on a slow connection, and pulling in i18next plus the till's
 * eight-hundred-line locale files would cost far more bundle than it saves in duplication.
 *
 * Tariff copy and contact details are NOT here — those come from the dashboard
 * (site-config landing_plans / landing_contact), with content.ts as the baked fallback.
 */

export type Lang = 'uz' | 'ru';

const STRINGS = {
  uz: {
    'nav.features': 'Imkoniyatlar',
    'nav.pricing': 'Tariflar',
    'nav.contact': 'Aloqa',
    'nav.login': 'Kirish',

    'hero.title': "Do'koningiz uchun kassa dasturi",
    'hero.lede':
      "Internetsiz ham ishlaydi va aloqa tiklanganda o'zi sinxronlaydi. Fiskal chek, markirovkali mahsulotlar, tarozi va ombor — bir dasturda.",
    'hero.cta': 'Bepul boshlash',
    'hero.download': 'Dasturni yuklab olish',

    'features.title': 'Nima qila oladi',
    'features.offline.t': 'Internetsiz ishlaydi',
    'features.offline.d':
      "Aloqa uzilsa ham savdo to'xtamaydi. Cheklar terminalda saqlanadi va internet qaytganda serverga o'zi yuboriladi.",
    'features.fiscal.t': 'Fiskal chek',
    'features.fiscal.d':
      'REGOS va OFD bilan ishlaydi. Har bir savdo qonun talab qilganidek rasmiylashtiriladi.',
    'features.marking.t': 'Markirovka',
    'features.marking.d':
      "Asl-Belgisi orqali markirovkali mahsulotlar tekshiriladi va sotuvda hisobga olinadi.",
    'features.hardware.t': 'Jihozlar',
    'features.hardware.d':
      "Tarozi, chek printeri, etiketka printeri va skaner — do'konda bor jihozlar bilan ishlaydi.",
    'features.multi.t': 'Bir nechta kassa',
    'features.multi.d':
      "Kassalar lokal tarmoqda birgalikda ishlaydi. Internet bo'lmasa ham bir-birini ko'radi.",
    'features.dashboard.t': 'Har qayerdan nazorat',
    'features.dashboard.d':
      "Savdo, foyda va qoldiqni telefondan ko'ring. Do'konga borish shart emas.",

    'pricing.title': 'Tariflar',
    'pricing.lede': "Do'kon o'lchamiga qarab tanlang. Istalgan vaqtda o'zgartirsa bo'ladi.",
    'pricing.month': '/oy',
    'pricing.once': 'bir marta',
    'pricing.popular': 'Eng ommabop',
    'pricing.cta': 'Tanlash',
    'pricing.sum': "so'm",

    'contact.title': 'Bog‘laning',
    'contact.lede': "Savolingiz bormi? Telegram orqali yozing yoki qo'ng'iroq qiling.",
    'contact.phone': 'Telefon',
    'contact.hours': 'Ish vaqti',
    'contact.write': 'Telegramda yozish',

    'footer.dashboard': 'Boshqaruv paneli',
    'footer.download': 'Yuklab olish',
    'footer.rights': 'Barcha huquqlar himoyalangan.',

    'theme.toggle': 'Mavzuni almashtirish',
    'lang.toggle': 'Tilni almashtirish',
  },
  ru: {
    'nav.features': 'Возможности',
    'nav.pricing': 'Тарифы',
    'nav.contact': 'Контакты',
    'nav.login': 'Войти',

    'hero.title': 'Кассовая программа для вашего магазина',
    'hero.lede':
      'Работает без интернета и синхронизируется, когда связь появится. Фискальный чек, маркировка, весы и склад — в одной программе.',
    'hero.cta': 'Начать бесплатно',
    'hero.download': 'Скачать программу',

    'features.title': 'Что умеет',
    'features.offline.t': 'Работает без интернета',
    'features.offline.d':
      'Продажи не останавливаются при обрыве связи. Чеки хранятся на терминале и уходят на сервер сами, когда интернет вернётся.',
    'features.fiscal.t': 'Фискальный чек',
    'features.fiscal.d':
      'Работает с REGOS и ОФД. Каждая продажа оформляется так, как требует закон.',
    'features.marking.t': 'Маркировка',
    'features.marking.d':
      'Маркированные товары проверяются через Asl-Belgisi и учитываются при продаже.',
    'features.hardware.t': 'Оборудование',
    'features.hardware.d':
      'Весы, чековый принтер, принтер этикеток и сканер — работает с тем, что уже есть в магазине.',
    'features.multi.t': 'Несколько касс',
    'features.multi.d':
      'Кассы работают вместе в локальной сети и видят друг друга даже без интернета.',
    'features.dashboard.t': 'Контроль откуда угодно',
    'features.dashboard.d':
      'Смотрите продажи, прибыль и остатки с телефона. Ехать в магазин не нужно.',

    'pricing.title': 'Тарифы',
    'pricing.lede': 'Выберите по размеру магазина. Поменять можно в любой момент.',
    'pricing.month': '/мес',
    'pricing.once': 'разово',
    'pricing.popular': 'Популярный',
    'pricing.cta': 'Выбрать',
    'pricing.sum': 'сум',

    'contact.title': 'Свяжитесь с нами',
    'contact.lede': 'Есть вопрос? Напишите в Telegram или позвоните.',
    'contact.phone': 'Телефон',
    'contact.hours': 'Время работы',
    'contact.write': 'Написать в Telegram',

    'footer.dashboard': 'Панель управления',
    'footer.download': 'Скачать',
    'footer.rights': 'Все права защищены.',

    'theme.toggle': 'Переключить тему',
    'lang.toggle': 'Переключить язык',
  },
} as const;

export type StringKey = keyof (typeof STRINGS)['uz'];

export function translate(lang: Lang, key: StringKey): string {
  return STRINGS[lang][key] ?? key;
}

const LANG_KEY = 'posgro-landing-lang';

/** Saved choice, else the browser's language, else Uzbek — the market this page is for. */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'uz' || saved === 'ru') return saved;
  } catch {
    /* private window, or site data blocked — the page must still render */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru')
    ? 'ru'
    : 'uz';
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* the page works fine without remembering */
  }
}

/** Thousands separated with a narrow space: 6 000 000, the way prices are written locally. */
export function formatPrice(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
