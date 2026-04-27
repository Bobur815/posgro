export const UZ_PREFIX = '+998 (';
const MAX_DIGITS = 9;

export function digitsOnly(s: string | number): string {
  return String(s || '').replace(/\D/g, '');
}

export function formatUzPhone(digits: string | number): string {
  const d = digitsOnly(digits).slice(0, MAX_DIGITS);
  const a = d.slice(0, 2);
  const b = d.slice(2, 5);
  const c = d.slice(5, 7);
  const e = d.slice(7, 9);

  let tail = '';
  if (a) tail = a;
  if (a.length === 2) tail += ') ';

  if (b) tail = `${a}) ${b}`;
  if (b.length === 3) tail += '-';

  if (c) tail = `${a}) ${b}-${c}`;
  if (c.length === 2) tail += '-';

  if (e) tail = `${a}) ${b}-${c}-${e}`;

  return UZ_PREFIX + tail;
}

export function isUzPhoneComplete(digits: string | number): boolean {
  return digitsOnly(digits).length === MAX_DIGITS;
}

/** Extract 9-digit subscriber number from a stored phone string (strips +998 prefix if present). */
export function phoneToDigits(phone: string): string {
  const d = digitsOnly(phone);
  return d.startsWith('998') ? d.slice(3) : d;
}

/** Normalize any phone input to 12-digit storage format: 998XXXXXXXXX (no +, no spaces). */
export function normalizeUzPhone(phone: string): string {
  const d = digitsOnly(phone);
  const subscriber = d.startsWith('998') ? d.slice(3) : d;
  return '998' + subscriber.slice(0, 9);
}
