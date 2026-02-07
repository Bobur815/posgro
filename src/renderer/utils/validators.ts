// Form validation utilities

export function isRequired(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function minLength(value: string, min: number): boolean {
  return value.length >= min;
}

export function maxLength(value: string, max: number): boolean {
  return value.length <= max;
}

export function isEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

export function isPhone(value: string): boolean {
  // Uzbekistan phone format: +998 XX XXX XX XX
  const phoneRegex = /^\+?998\s?\d{2}\s?\d{3}\s?\d{2}\s?\d{2}$/;
  return phoneRegex.test(value.replace(/\s/g, ''));
}

export function isBarcode(value: string): boolean {
  // EAN-13 or EAN-8
  return /^\d{8}$|^\d{13}$/.test(value);
}

export function isPositiveNumber(value: number): boolean {
  return typeof value === 'number' && !isNaN(value) && value > 0;
}

export function isNonNegativeNumber(value: number): boolean {
  return typeof value === 'number' && !isNaN(value) && value >= 0;
}

export function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

export function isPrice(value: number): boolean {
  return isNonNegativeNumber(value) && Number(value.toFixed(2)) === value;
}

export function isStrongPassword(value: string): boolean {
  // At least 6 characters, 1 uppercase, 1 lowercase, 1 number
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{6,}$/.test(value);
}

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// Generic form validator
export function validateForm<T extends Record<string, unknown>>(
  data: T,
  rules: Record<keyof T, Array<(value: unknown) => string | null>>
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [field, validators] of Object.entries(rules)) {
    const value = data[field as keyof T];

    for (const validator of validators as Array<(value: unknown) => string | null>) {
      const error = validator(value);
      if (error) {
        errors[field] = error;
        break;
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
