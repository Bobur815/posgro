// Uzbek wording for the fiscal errors a till writes into its log, so a log alert to an Uzbek chat
// does not quote Russian. Pure, no imports.
//
// The till words a fiscal failure in Russian — `describeVcrError()` and `VCR_ERROR_HINTS` in
// src/main/fiscal/regos-vcr-client.ts — and the alert carries it as `[<REGOS code>] <wording>`.
// That wording is a closed set, so it is translated here sentence by sentence. log-uz.test.ts
// checks every sentence the till can produce has an entry: change the two together.
// Anything else (REGOS's own description for an unknown code, non-fiscal lines) is shown as written.

/** describeVcrError()'s pattern-based sentences, which are not keyed by code. */
const BY_SENTENCE: Record<string, string> = {
  'Не отсканирован код маркировки (Asl-Belgisi)': 'Markirovka kodi skanerlanmagan (Asl-Belgisi)',
  'Код маркировки недействителен (товар вне оборота)':
    'Markirovka kodi yaroqsiz (mahsulot muomaladan chiqarilgan)',
  'Код маркировки содержит недопустимые символы': 'Markirovka kodida ruxsat etilmagan belgilar bor',
  'Неверный код маркировки — проверьте DataMatrix товара':
    "Markirovka kodi noto'g'ri — mahsulotning DataMatrix kodini tekshiring",
  'Неверная ставка НДС для товара': "Mahsulot uchun QQS stavkasi noto'g'ri",
  'Неверный код МХИК (ИКПУ) товара': "Mahsulotning MXIK (IKPU) kodi noto'g'ri",
  'Фискальная смена пуста — закрывать нечего': "Fiskal smena bo'sh — yopadigan narsa yo'q",
  'Нет связи с виртуальной кассой (REGOS:VCR)': "Virtual kassa (REGOS:VCR) bilan aloqa yo'q",
};

/** VCR_ERROR_HINTS, by REGOS code. */
const BY_CODE: Record<number, string> = {
  0: 'Virtual kassa ishlamayapti — REGOS:VCR ilovasi ishga tushirilganini tekshiring',
  701003: "Chek ma'lumotlari noto'g'ri (MXIK, QQS va summalarni tekshiring)",
  703000: "So'rov formati noto'g'ri",
  704006: "Fiskal modul bloklangan — TXKMga (texnik xizmat ko'rsatish markazi) murojaat qiling",
  704010: 'Z-hisobot ochilmagan — smenani oching',
  704011: 'Z-hisobot allaqachon ochiq',
  704017: 'Fiskal modul topilmadi — USB ulanishini tekshiring',
  704019: "24 soatdan beri vaqt serveri bilan aloqa yo'q — internetni tekshiring",
  704025: "24 soatdan beri litsenziya serveri bilan aloqa yo'q — internetni tekshiring",
  704029: 'Qarzdorlik bor — TXKMga murojaat qiling',
  705000: "Kassir logini yoki paroli noto'g'ri",
  705002: 'REGOS:VCR da printer sozlanmagan',
  705511: 'Mahsulotning MXIK (IKPU) kodini tekshirishda xato',
  704100: 'Smena allaqachon ochiq',
  704101: "Ochiq smena yo'q — smenani oching",
  704034: "To'lov tizimi qo'llab-quvvatlanmaydi",
  704035: "To'lov ID raqami ko'rsatilmagan",
  704036: "Bekor qilib bo'lmaydi — to'lov allaqachon o'tkazilgan yoki chek yopilgan",
  704037: "Sotuv cheki ID raqami ko'rsatilmagan",
  704038: "To'lov tizimi faol emas — uni REGOS:VCR da yoqing",
  704039: "Qo'shimcha chek turlari faol emas",
  704040: "To'lovni bajarishda xato",
  705520: "To'lov terminali xatosi",
  705521: "To'lov terminali javob bermayapti",
  705522: 'Amal terminal tomonidan rad etildi',
  705523: 'Terminal boshqa amal bilan band',
  705524: "To'lov terminali uchun summa noto'g'ri",
  705525: 'Terminal sozlanmagan',
  705526: 'Bank bilan aloqada xato',
  705700: 'Payme GO xatosi',
  705701: 'Payme GO ishlamayapti',
  705720: 'Click PASS xatosi',
  705721: 'Click PASS ishlamayapti',
  705730: 'Uzum Pay xatosi',
  705731: 'Uzum Pay ishlamayapti',
  705740: 'Anor GO xatosi',
  705741: 'Anor GO ishlamayapti',
  705750: 'NIC API xatosi',
  705751: 'NIC API ishlamayapti',
};

/** `[701003] <wording>` — how an alert carries a fiscal failure. */
const FISCAL = /^\[(\d+)\]\s*(.*)$/s;

/** The fallback describeVcrError() uses for a code with no description at all. */
const UNKNOWN_VCR = /^Ошибка ВКМ \((\d+)\)$/;

/**
 * The Uzbek for one alert line, or the line itself when it is not a fiscal error we know.
 * The exact sentence wins over the code: one code (701003) covers several distinct sentences.
 */
export function toUzbekLogText(text: string): string {
  const m = FISCAL.exec(text);
  if (!m) return text;
  const [, code, wording] = m;
  const sentence = BY_SENTENCE[wording.trim()];
  if (sentence) return `[${code}] ${sentence}`;
  if (UNKNOWN_VCR.test(wording.trim())) return `[${code}] Virtual kassa xatosi (${code})`;
  const byCode = BY_CODE[Number(code)];
  return byCode ? `[${code}] ${byCode}` : text;
}

/** For the guard test: every Russian sentence and code this table covers. */
export const COVERED = {
  sentences: Object.keys(BY_SENTENCE),
  codes: Object.keys(BY_CODE).map(Number),
};
