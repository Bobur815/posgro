// Format currency (Uzbek Som)
export const formatCurrency = (
  amount: number | null | undefined,
  locale: 'ru' | 'uz' = 'ru',
): string => {
  const value = amount ?? 0;
  const formatted = value.toLocaleString(locale === 'ru' ? 'ru-RU' : 'uz-UZ');
  return locale === 'ru' ? `${formatted} сум` : `${formatted} so'm`;
};

// ── Russian ──────────────────────────────────────────────────────────────────
const RU_HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
const RU_TENS     = ['', 'десять', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const RU_TEENS    = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const RU_ONES_M   = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const RU_ONES_F   = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];

function chunkRu(num: number, fem: boolean): string {
  const parts: string[] = [];
  const h = Math.floor(num / 100);
  const rest = num % 100;
  if (h) parts.push(RU_HUNDREDS[h]);
  if (rest >= 10 && rest <= 19) {
    parts.push(RU_TEENS[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) parts.push(RU_TENS[t]);
    if (o) parts.push(fem ? RU_ONES_F[o] : RU_ONES_M[o]);
  }
  return parts.join(' ');
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const last2 = n % 100;
  const last  = n % 10;
  if (last2 >= 11 && last2 <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
export function numberToWordsRu(n: number): string {
  if (!n || n <= 0) return '';
  n = Math.round(n);
  const parts: string[] = [];
  const billions  = Math.floor(n / 1_000_000_000);
  const millions  = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;
  if (billions)  { parts.push(chunkRu(billions,  false)); parts.push(pluralRu(billions,  'миллиард',  'миллиарда',  'миллиардов')); }
  if (millions)  { parts.push(chunkRu(millions,  false)); parts.push(pluralRu(millions,  'миллион',   'миллиона',   'миллионов'));  }
  if (thousands) { parts.push(chunkRu(thousands, true));  parts.push(pluralRu(thousands, 'тысяча',    'тысячи',     'тысяч'));      }
  if (remainder || !parts.length) parts.push(chunkRu(remainder, false));
  return parts.filter(Boolean).join(' ');
}

// ── Uzbek ─────────────────────────────────────────────────────────────────────
const UZ_ONES  = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"];
const UZ_TENS  = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"];
const UZ_TEENS = ["o'n", "o'n bir", "o'n ikki", "o'n uch", "o'n to'rt", "o'n besh", "o'n olti", "o'n yetti", "o'n sakkiz", "o'n to'qqiz"];

function chunkUz(num: number): string {
  if (!num) return '';
  const parts: string[] = [];
  const h = Math.floor(num / 100);
  const rest = num % 100;
  if (h === 1) parts.push('yuz');
  else if (h > 1) parts.push(`${UZ_ONES[h]} yuz`);
  if (rest >= 10 && rest <= 19) {
    parts.push(UZ_TEENS[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) parts.push(UZ_TENS[t]);
    if (o) parts.push(UZ_ONES[o]);
  }
  return parts.join(' ');
}

export function numberToWordsUz(n: number): string {
  if (!n || n <= 0) return '';
  n = Math.round(n);
  const parts: string[] = [];
  const billions  = Math.floor(n / 1_000_000_000);
  const millions  = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;
  if (billions)  { parts.push(chunkUz(billions));  parts.push('milliard'); }
  if (millions)  { parts.push(chunkUz(millions));  parts.push('million');  }
  if (thousands === 1) { parts.push('ming'); }
  else if (thousands > 1) { parts.push(chunkUz(thousands)); parts.push('ming'); }
  if (remainder || !parts.length) parts.push(chunkUz(remainder));
  return parts.filter(Boolean).join(' ');
}

// ── Shared hint ───────────────────────────────────────────────────────────────
export function amountHint(raw: string, lang: string): string {
  const n = parseFloat(raw.replace(/\s/g, '')) || 0;
  if (!n) return '';
  const words = lang === 'uz' ? numberToWordsUz(n) : numberToWordsRu(n);
  return `${n.toLocaleString('ru-RU')} so'm${words ? ` — ${words}` : ''}`;
}