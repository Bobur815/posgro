import { format, parseISO } from 'date-fns';

// Re-export shared formatCurrency for convenience
export { formatCurrency } from '@shared/utils';

// Date formatters
export function formatDate(date: Date | string, formatStr: string = 'dd.MM.yyyy'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatStr);
}

export function formatDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'dd.MM.yyyy HH:mm:ss');
}

// Quantity formatter
const unitLabels: Record<string, { ru: string; uz: string }> = {
  'шт': { ru: 'шт', uz: 'dona' },
  'кг': { ru: 'кг', uz: 'kg' },
  'л': { ru: 'л', uz: 'l' },
  'м': { ru: 'м', uz: 'm' },
};

export { formatPhone } from '@shared/utils';

export function formatQuantity(quantity: number, unit: string, locale: 'ru' | 'uz' = 'ru'): string {
  const label = unitLabels[unit]?.[locale] || unit;
  if (unit === 'кг' || unit === 'л') {
    const formatted = quantity % 1 === 0
      ? quantity.toString()
      : quantity.toFixed(1);
    return formatted + ' ' + label;
  }
  return Math.floor(quantity) + ' ' + label;
}
