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
    'nav.blog': 'Blog',
    'nav.login': 'Kirish',

    'hero.title': "Do'koningiz uchun kassa dasturi",
    'hero.lede':
      "Internetsiz ham ishlaydi va aloqa tiklanganda o'zi sinxronlaydi. Fiskal chek, markirovkali mahsulotlar, tarozi va ombor — bir dasturda.",
    'hero.cta': 'Bepul boshlash',
    'hero.download': 'Dasturni yuklab olish',

    'lead.titleAccent': "So'rov qoldiring",
    'lead.titleRest': "va menejerlarimiz siz bilan bog'lanadi",
    'lead.name': 'Ism-familiya',
    'lead.namePh': 'Ism-familiyangizni kiriting',
    'lead.phone': 'Telefon raqami',
    'lead.store': "Do'kon nomi",
    'lead.storePh': "Do'kon nomini kiriting",
    'lead.type': "Do'kon turi",
    'lead.typePh': "Do'kon turini tanlang",
    'lead.type.GROCERY': "Oziq-ovqat do'koni",
    'lead.type.SUPERMARKET': 'Supermarket',
    'lead.type.MINIMARKET': 'Minimarket',
    'lead.type.PHARMACY': 'Dorixona',
    'lead.type.HOUSEHOLD': "Xo'jalik mollari",
    'lead.type.CLOTHING': "Kiyim-kechak do'koni",
    'lead.type.ELECTRONICS': "Elektronika do'koni",
    'lead.type.SPORTS': "Sport anjomlari do'koni",
    'lead.type.TOYS': "O'yinchoqlar do'koni",
    'lead.type.FURNITURE': "Mebel do'koni",
    'lead.type.COSMETICS': "Kosmetika do'koni",
    'lead.type.JEWELRY': "Zargarlik buyumlari do'koni",
    'lead.type.BOOKS': "Kitob do'koni",
    'lead.type.PET': "Uy hayvonlari do'koni",
    'lead.type.OTHER': 'Boshqa',
    'lead.submit': "So'rov yuborish",
    'lead.sending': 'Yuborilmoqda…',
    'lead.close': 'Yopish',
    'lead.invalidPhone': "Telefon raqamini to'liq kiriting",
    'lead.failed': "Yuborib bo'lmadi. Qayta urinib ko'ring yoki bizga qo'ng'iroq qiling.",
    'lead.rateLimited': "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.",
    'lead.doneTitle': 'Rahmat!',
    'lead.doneText': "So'rovingiz qabul qilindi. Menejerimiz tez orada siz bilan bog'lanadi.",

    'features.title': 'Nima qila oladi',
    'features.offline.t': 'Internetsiz ishlaydi',
    'features.offline.d':
      "Aloqa uzilsa ham savdo to'xtamaydi. Cheklar terminalda saqlanadi va internet qaytganda serverga o'zi yuboriladi.",
    'features.fiscal.t': 'Fiskal chek',
    'features.fiscal.d':
      'Har bir savdo qonun talab qilganidek rasmiylashtiriladi.',
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

    'news.title': 'Yangiliklar',
    'news.lede': "POSGRO yangiliklari, yangi imkoniyatlar va ulardan foydalanish bo'yicha qo'llanmalar.",
    'news.details': 'Batafsil',
    'news.back': 'Barcha yangiliklar',
    'news.empty': "Hozircha yangiliklar yo'q.",
    'news.loadMore': "Yana ko'rsatish",
    'news.loadError': "Yangiliklarni yuklab bo'lmadi. Keyinroq qayta urinib ko'ring.",
    'news.notFound': 'Bunday yangilik topilmadi.',
    'news.close': 'Yopish',

    'footer.dashboard': 'Boshqaruv paneli',
    'footer.download': 'Yuklab olish',
    'footer.rights': 'Barcha huquqlar himoyalangan.',

    'lang.toggle': 'Tilni almashtirish',
  },
  ru: {
    'nav.features': 'Возможности',
    'nav.pricing': 'Тарифы',
    'nav.contact': 'Контакты',
    'nav.blog': 'Блог',
    'nav.login': 'Войти',

    'hero.title': 'Кассовая программа для вашего магазина',
    'hero.lede':
      'Работает без интернета и синхронизируется, когда связь появится. Фискальный чек, маркировка, весы и склад — в одной программе.',
    'hero.cta': 'Начать бесплатно',
    'hero.download': 'Скачать программу',

    'lead.titleAccent': 'Оставьте заявку',
    'lead.titleRest': 'и наши менеджеры свяжутся с вами',
    'lead.name': 'Имя и фамилия',
    'lead.namePh': 'Введите имя и фамилию',
    'lead.phone': 'Номер телефона',
    'lead.store': 'Название магазина',
    'lead.storePh': 'Введите название магазина',
    'lead.type': 'Тип магазина',
    'lead.typePh': 'Выберите тип магазина',
    'lead.type.GROCERY': 'Продуктовый магазин',
    'lead.type.SUPERMARKET': 'Супермаркет',
    'lead.type.MINIMARKET': 'Минимаркет',
    'lead.type.PHARMACY': 'Аптека',
    'lead.type.HOUSEHOLD': 'Хозтовары',
    "lead.type.CLOTHING": 'Магазин одежды',
    'lead.type.ELECTRONICS': 'Магазин электроники',
    'lead.type.SPORTS': 'Магазин спортивных товаров',
    'lead.type.TOYS': 'Магазин игрушек',
    'lead.type.FURNITURE': 'Магазин мебели',
    'lead.type.COSMETICS': 'Магазин косметики',
    'lead.type.JEWELRY': 'Ювелирный магазин',
    'lead.type.BOOKS': 'Книжный магазин',
    'lead.type.PET': 'Зоомагазин',
    'lead.type.OTHER': 'Другое',
    'lead.submit': 'Отправить заявку',
    'lead.sending': 'Отправка…',
    'lead.close': 'Закрыть',
    'lead.invalidPhone': 'Введите номер телефона полностью',
    'lead.failed': 'Не удалось отправить. Попробуйте ещё раз или позвоните нам.',
    'lead.rateLimited': 'Слишком много попыток. Попробуйте чуть позже.',
    'lead.doneTitle': 'Спасибо!',
    'lead.doneText': 'Заявка принята. Наш менеджер скоро свяжется с вами.',

    'features.title': 'Что умеет',
    'features.offline.t': 'Работает без интернета',
    'features.offline.d':
      'Продажи не останавливаются при обрыве связи. Чеки хранятся на терминале и уходят на сервер сами, когда интернет вернётся.',
    'features.fiscal.t': 'Фискальный чек',
    'features.fiscal.d':
      'Каждая продажа оформляется так, как требует закон.',
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

    'news.title': 'Новости',
    'news.lede': 'Новости POSGRO, новые возможности и инструкции, как ими пользоваться.',
    'news.details': 'Подробнее',
    'news.back': 'Все новости',
    'news.empty': 'Пока новостей нет.',
    'news.loadMore': 'Показать ещё',
    'news.loadError': 'Не удалось загрузить новости. Попробуйте позже.',
    'news.notFound': 'Такой новости нет.',
    'news.close': 'Закрыть',

    'footer.dashboard': 'Панель управления',
    'footer.download': 'Скачать',
    'footer.rights': 'Все права защищены.',

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
