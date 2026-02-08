import { DiscountType } from "@shared/types/sale.types";

// Format currency (Uzbek Som)
export const formatCurrency = (
  amount: number,
  locale: 'ru' | 'uz' = 'ru',
): string => {
  const formatted = amount.toLocaleString(locale === 'ru' ? 'ru-RU' : 'uz-UZ');
  return locale === 'ru' ? `${formatted} сум` : `${formatted} so'm`;
};

// Format date
export const formatDate = (
  date: Date | string,
  locale: 'ru' | 'uz' = 'ru',
): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Format time
export const formatTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Format datetime
export const formatDateTime = (
  date: Date | string,
  locale: 'ru' | 'uz' = 'ru',
): string => {
  return `${formatDate(date, locale)} ${formatTime(date)}`;
};

// Format quantity with unit
export const formatQuantity = (
  quantity: number,
  unit: string,
  locale: 'ru' | 'uz' = 'ru',
): string => {
  const unitLabels: Record<string, { ru: string; uz: string }> = {
    PCS: { ru: 'шт', uz: 'dona' },
    KG: { ru: 'кг', uz: 'kg' },
    L: { ru: 'л', uz: 'l' },
    M: { ru: 'м', uz: 'm' },
  };
  const label = unitLabels[unit]?.[locale] || unit;
  return `${quantity} ${label}`;
};

// Generate receipt number
export const generateReceiptNumber = (terminalId: string): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${terminalId}-${timestamp}-${random}`;
};

// Parse barcode from scanner input
export const parseBarcode = (input: string): string => {
  // Remove any whitespace and special characters
  return input.trim().replace(/[^\w-]/g, '');
};

// Calculate discount amount
export const calculateDiscount = (
  subtotal: number,
  discount: number,
  discountType: DiscountType,
): number => {
  if (discountType === 'PERCENTAGE') {
    return Math.round((subtotal * discount) / 100);
  }
  return Math.min(discount, subtotal);
};

// Calculate change amount
export const calculateChange = (
  paidAmount: number,
  totalAmount: number,
): number => {
  return Math.max(0, paidAmount - totalAmount);
};

// Truncate text
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

// Sanitize string for database
export const sanitizeString = (str: string): string => {
  return str.trim().replace(/\s+/g, ' ');
};

// Convert to ISO date string (YYYY-MM-DD)
export const toISODateString = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// Parse price from string input
export const parsePrice = (input: string): number => {
  const cleaned = input.replace(/[^\d.,]/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed);
};
