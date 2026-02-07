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
