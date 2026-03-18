// Supplier Transaction Types

import type { SupplierPaymentMethod } from '../constants/payment-methods';
export type { SupplierPaymentMethod };

export type SupplierTransactionType =
  | 'PURCHASE'    // We received goods (increases our debt)
  | 'PAYMENT'     // We paid supplier (decreases our debt)
  | 'RETURN'      // We returned goods (decreases our debt)
  | 'ADVANCE'     // We paid in advance (supplier owes us)
  | 'ADJUSTMENT'; // Manual balance correction

export interface Supplier {
  id: string;
  nameRu: string;
  nameUz: string;
  phone?: string;
  address?: string;
  active: boolean;
  balance: number; // Negative = we owe them, Positive = they owe us
  createdAt: string;
}

export interface SupplierTransaction {
  id: string;
  supplierId: string;
  supplier?: Supplier;
  type: SupplierTransactionType;
  paymentMethod: SupplierPaymentMethod;
  amount: number; // Positive = reduces our debt, Negative = increases our debt
  description?: string;
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
}

export interface SupplierUpdateInput {
  nameRu?: string;
  nameUz?: string;
  phone?: string;
  address?: string;
  active?: boolean;
  balance?: number;
}

export interface SupplierTransactionCreateInput {
  supplierId: string;
  type: SupplierTransactionType;
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
  totalDebt: number;   // Sum of negative amounts (what we owe)
  totalCredit: number; // Sum of positive amounts (what they owe us)
}
