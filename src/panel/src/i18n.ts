/**
 * The portal's own strings, deliberately not the POS's i18next setup.
 *
 * This is a public page of about thirty strings, often opened on a slow connection in a shop.
 * Pulling in i18next plus `ru.json`/`uz.json` — eight hundred lines each, written for the till —
 * would cost far more bundle than it saves in duplication.
 *
 * Uzbek is the default: this page is for shops in Uzbekistan, unlike the dashboard, which
 * defaults to Russian because that is what its operators use.
 */

export type Lang = 'uz' | 'ru';

export const LANGS: Lang[] = ['uz', 'ru'];

const STRINGS = {
  uz: {
    'nav.tools': 'Dasturlar',
    'nav.docs': "Qo'llanmalar",
    'nav.support': 'Yordam',

    'hero.title': 'POSGRO kassa dasturi',
    'hero.subtitle':
      "Internetsiz ham ishlaydi, aloqa tiklanganda o'zi sinxronlaydi. Fiskal chek, markirovkali mahsulotlar va tarozi qo'llab-quvvatlanadi.",
    'hero.download': 'Yuklab olish',
    'hero.windows': 'Windows uchun',
    'hero.updated': 'Yangilangan',
    'hero.unavailable': "Yuklab olish vaqtincha mavjud emas. Iltimos, keyinroq urinib ko'ring.",

    'section.drivers': 'Drayverlar',
    'section.tools': 'Utilitalar',
    'section.manuals': "Qo'llanmalar",
    'section.other': 'Boshqa',
    'section.empty': "Hozircha fayl yo'q.",

    'card.download': 'Yuklab olish',
    'card.version': 'Versiya',

    'footer.rights': 'Barcha huquqlar himoyalangan.',
    'footer.dashboard': 'Boshqaruv paneli',

    'theme.toggle': 'Mavzuni almashtirish',
    'lang.toggle': 'Tilni almashtirish',
    loading: 'Yuklanmoqda…',
  },
  ru: {
    'nav.tools': 'Программы',
    'nav.docs': 'Руководства',
    'nav.support': 'Поддержка',

    'hero.title': 'Кассовая программа POSGRO',
    'hero.subtitle':
      'Работает без интернета и синхронизируется, когда связь появится. Фискальный чек, маркировка и весы поддерживаются.',
    'hero.download': 'Скачать',
    'hero.windows': 'для Windows',
    'hero.updated': 'Обновлено',
    'hero.unavailable': 'Загрузка временно недоступна. Попробуйте позже.',

    'section.drivers': 'Драйверы',
    'section.tools': 'Утилиты',
    'section.manuals': 'Руководства',
    'section.other': 'Прочее',
    'section.empty': 'Пока нет файлов.',

    'card.download': 'Скачать',
    'card.version': 'Версия',

    'footer.rights': 'Все права защищены.',
    'footer.dashboard': 'Панель управления',

    'theme.toggle': 'Переключить тему',
    'lang.toggle': 'Переключить язык',
    loading: 'Загрузка…',
  },
} as const;

export type StringKey = keyof (typeof STRINGS)['uz'];

export function translate(lang: Lang, key: StringKey): string {
  return STRINGS[lang][key] ?? key;
}

const STORAGE_KEY = 'posgro-panel-lang';

/**
 * Saved choice, else the browser's language, else Uzbek.
 *
 * Wrapped because `localStorage` throws outright in a private window on some browsers rather than
 * returning null — and a portal that will not render because it could not read a preference is
 * worse than one in the wrong language.
 */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'uz' || saved === 'ru') return saved;
  } catch {
    /* private window, or site data blocked */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru')
    ? 'ru'
    : 'uz';
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* the page works fine without remembering */
  }
}
