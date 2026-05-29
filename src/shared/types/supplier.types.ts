// Supplier Transaction Types

import type { SupplierPaymentMethod } from '../constants/payment-methods';
export type { SupplierPaymentMethod };

export type SupplierTransactionType =
  | 'PURCHASE'    // We received goods (increases our debt)
  | 'PAYMENT'     // We paid supplier (decreases our debt)
  | 'RETURN'      // We returned goods (decreases our debt)
  | 'ADVANCE'     // We paid in advance (supplier owes us)
  | 'ADJUSTMENT'; // Manual balance correction

// Types allowed when creating a new transaction via the UI (PURCHASE & ADJUSTMENT are system-only)
export type SupplierTransactionCreateType = 'PAYMENT' | 'RETURN' | 'ADVANCE';

export type SupplierPaymentType = 'IMMEDIATE' | 'INSTALLMENT';

export interface Supplier {
  id: string;
  nameRu: string;
  nameUz: string;
  phone?: string;
  address?: string;
  active: boolean;
  balance: number; // Negative = we owe them, Positive = they owe us
  paymentType: SupplierPaymentType;
  createdAt: string;
}

export interface SupplierTransaction {
  id: string;
  supplierId: string;
  supplier?: Supplier;
  type: SupplierTransactionType;
  paymentMethod: SupplierPaymentMethod;
  amount: number; // Positive = reduces our debt, Negative = increases our debt
  description?: Record<string, unknown> | string | null;
  referenceId?: string;
  referenceType?: string;
  dueDate?: string;
  paidAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierCreateInput {
  nameRu: string;
  nameUz: string;
  phone?: string;
  address?: string;
  balance?: number;
  paymentType?: SupplierPaymentType;
}

export interface SupplierUpdateInput {
  nameRu?: string;
  nameUz?: string;
  phone?: string;
  address?: string;
  active?: boolean;
  balance?: number;
  paymentType?: SupplierPaymentType;
}

export interface SupplierProduct {
  id: number;
  nameRu: string;
  nameUz: string;
  cost: number | null;
  price: number;
  stock: number;
  unit: string;
}

export interface SupplierTransactionCreateInput {
  supplierId: string;
  type: SupplierTransactionCreateType;
  paymentMethod: SupplierPaymentMethod;
  amount: number;
  description?: string;
  referenceId?: string;
  referenceType?: string;
  dueDate?: string;
}

export interface SupplierTransactionUpdateInput {
  type?: SupplierTransactionType;
  paymentMethod?: SupplierPaymentMethod;
  amount?: number;
  description?: string;
  dueDate?: string;
  paidAt?: string;
}

export interface SupplierTransactionFilters {
  supplierId?: string;
  type?: SupplierTransactionType;
  paymentMethod?: SupplierPaymentMethod;
  startDate?: string;
  endDate?: string;
  isPaid?: boolean;
}

export interface SupplierWithTransactions extends Supplier {
  transactions: SupplierTransaction[];
  products: SupplierProduct[];
  totalDebt: number;   // Sum of negative amounts (what we owe)
  totalCredit: number; // Sum of positive amounts (what they owe us)
}
