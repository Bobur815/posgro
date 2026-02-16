// General utility functions

import { TFunction } from "i18next";

// Generate unique ID
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

// Throttle function
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

// Deep clone object
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Check if object is empty
export function isEmpty(obj: object): boolean {
  return Object.keys(obj).length === 0;
}

// Group array by key
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

// Sort array of objects by key
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

// Calculate sum of array property
export function sumBy<T>(array: T[], key: keyof T): number {
  return array.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
}

// Calculate average of array property
export function averageBy<T>(array: T[], key: keyof T): number {
  if (array.length === 0) return 0;
  return sumBy(array, key) / array.length;
}

// Truncate text
export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

// Capitalize first letter
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

// Sleep function (for async/await)
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry function with exponential backoff
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        await sleep(baseDelay * Math.pow(2, attempt));
      }
    }
  }

  throw lastError;
}

// Storage helpers with JSON serialization
export const storage = {
  get<T>(key: string, defaultValue: T): T {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  },

  remove(key: string): void {
    localStorage.removeItem(key);
  },

  clear(): void {
    localStorage.clear();
  },
};

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
