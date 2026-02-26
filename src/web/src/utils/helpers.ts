import { TFunction } from 'i18next';

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function isEmpty(obj: object): boolean {
  return Object.keys(obj).length === 0;
}

export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const groupKey = String(item[key]);
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

export function sortBy<T>(
  array: T[],
  key: keyof T,
  order: 'asc' | 'desc' = 'asc'
): T[] {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

export function sumBy<T>(array: T[], key: keyof T): number {
  return array.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
}

export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getExpiryDays(t: TFunction, productionDate?: string, expiryDate?: string): string {
  let prodDate: Date;
  if (!productionDate) {
    prodDate = new Date();
  } else {
    prodDate = new Date(productionDate);
  }

  if (!expiryDate) {
    return 'N/A';
  }
  const expDate = new Date(expiryDate);
  const diffTime = Math.abs(expDate.getTime() - prodDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (isNaN(diffDays)) {
    return 'N/A';
  }
  const pluralDays = diffDays === 1 ? t('common.day') : t('common.days');
  return `${diffDays} ${pluralDays}`;
}

export function getExpireInDays(t: TFunction, expiryDays: string, expiryDate?: string): string {
  if (expiryDays === 'N/A' || !expiryDate) {
    return 'N/A';
  }

  const expDate = new Date(expiryDate);
  const today = new Date();
  const diffTime = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (isNaN(diffDays)) {
    return 'N/A';
  }
  const pluralDays = diffDays === 1 ? t('common.day') : t('common.days');
  return `${diffDays} ${pluralDays}`;
}
