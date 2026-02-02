import { format, formatDistance, parseISO } from 'date-fns';
import { ru, uz } from 'date-fns/locale';

// Currency formatter
export function formatCurrency(amount: number, locale: string = 'uz'): string {
  return amount.toLocaleString(locale === 'uz' ? 'uz-UZ' : 'ru-RU') + ' сум';
}

// Compact currency (for large numbers)
export function formatCompactCurrency(amount: number): string {
  if (amount >= 1000000) {
    return (amount / 1000000).toFixed(1) + 'M сум';
  }
  if (amount >= 1000) {
    return (amount / 1000).toFixed(1) + 'K сум';
  }
  return amount.toLocaleString() + ' сум';
}

// Date formatters
export function formatDate(date: Date | string, formatStr: string = 'dd.MM.yyyy'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatStr);
}

export function formatDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'dd.MM.yyyy HH:mm');
}

export function formatTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'HH:mm');
}

export function formatRelativeTime(date: Date | string, locale: string = 'ru'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatDistance(dateObj, new Date(), {
    addSuffix: true,
    locale: locale === 'uz' ? uz : ru,
  });
}

// Quantity formatter
export function formatQuantity(quantity: number, unit: string): string {
  if (unit === 'кг' || unit === 'л') {
    return quantity.toFixed(3) + ' ' + unit;
  }
  return Math.floor(quantity) + ' ' + unit;
}

// Percentage formatter
export function formatPercent(value: number, decimals: number = 1): string {
  return value.toFixed(decimals) + '%';
}

// Phone number formatter (Uzbekistan)
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 12 && cleaned.startsWith('998')) {
    return `+${cleaned.slice(0, 3)} ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8, 10)} ${cleaned.slice(10, 12)}`;
  }
  if (cleaned.length === 9) {
    return `+998 ${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5, 7)} ${cleaned.slice(7, 9)}`;
  }
  return phone;
}

// Barcode formatter
export function formatBarcode(barcode: string): string {
  // EAN-13 format
  if (barcode.length === 13) {
    return `${barcode.slice(0, 1)} ${barcode.slice(1, 7)} ${barcode.slice(7, 13)}`;
  }
  return barcode;
}

// Receipt number formatter
export function formatReceiptNumber(number: string): string {
  return number.replace(/-/g, ' ');
}
