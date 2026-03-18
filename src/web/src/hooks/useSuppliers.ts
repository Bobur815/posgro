import { useCallback } from 'react';
import { useSuppliersStore } from '../store/suppliers-store';
import {
  Supplier,
  SupplierTransaction,
  SupplierWithTransactions,
  SupplierCreateInput,
  SupplierUpdateInput,
  SupplierTransactionCreateInput,
  SupplierTransactionUpdateInput,
  SupplierTransactionFilters,
} from '@shared/types';
import { suppliers as suppliersApi } from '../api/client';

function transformSupplier<T extends { balance?: any; transactions?: any[] }>(s: T): T {
  return {
    ...s,
    balance: s.balance !== undefined ? Number(s.balance) : 0,
    transactions: s.transactions?.map((tx: any) => ({
      ...tx,
      amount: Number(tx.amount),
    })),
  };
}

interface BalanceSummary {
  balance: number;
  totalDebt: number;
  totalCredit: number;
}

export function useSuppliers() {
  const {
    suppliers,
    selectedSupplier,
    transactions,
    isLoading,
    error,
    setSuppliers,
    setSelectedSupplier,
    setTransactions,
    setLoading,
    setError,
  } = useSuppliersStore();

  const loadSuppliers = useCallback(async (includeInactive?: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const data = await suppliersApi.getAll(includeInactive);
      setSuppliers((data as any[]).map(transformSupplier) as Supplier[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [setSuppliers, setLoading, setError]);

  const getById = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const data = await suppliersApi.getById(id);
      const supplier = data ? transformSupplier(data as any) as SupplierWithTransactions : null;
      setSelectedSupplier(supplier);
      return supplier;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load supplier');
      return null;
    } finally {
      setLoading(false);
    }
  }, [setSelectedSupplier, setLoading, setError]);

  const createSupplier = useCallback(async (data: SupplierCreateInput) => {
    setLoading(true);
    setError(null);

    try {
      const result = await suppliersApi.create(data);
      await loadSuppliers();
      return result as Supplier;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create supplier');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadSuppliers, setLoading, setError]);

  const updateSupplier = useCallback(async (id: string, data: SupplierUpdateInput) => {
    setLoading(true);
    setError(null);

    try {
      const result = await suppliersApi.update(id, data);
      await loadSuppliers();
      return result as Supplier;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update supplier');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadSuppliers, setLoading, setError]);

  const deleteSupplier = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      await suppliersApi.delete(id);
      await loadSuppliers();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete supplier');
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadSuppliers, setLoading, setError]);

  const loadTransactions = useCallback(async (filters?: SupplierTransactionFilters) => {
    setLoading(true);
    setError(null);

    try {
      const data = await suppliersApi.getTransactions(filters);
      setTransactions(data as SupplierTransaction[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [setTransactions, setLoading, setError]);

  const createTransaction = useCallback(async (
    data: SupplierTransactionCreateInput & { createdBy: string }
  ) => {
    setLoading(true);
    setError(null);

    try {
      const result = await suppliersApi.createTransaction(data);
      if (selectedSupplier?.id === data.supplierId) {
        await getById(data.supplierId);
      }
      await loadSuppliers();
      return result as SupplierTransaction;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create transaction');
      return null;
    } finally {
      setLoading(false);
    }
  }, [selectedSupplier, getById, loadSuppliers, setLoading, setError]);

  const updateTransaction = useCallback(async (
    id: string,
    data: SupplierTransactionUpdateInput
  ) => {
    setLoading(true);
    setError(null);

    try {
      const result = await suppliersApi.updateTransaction(id, data);
      await loadSuppliers();
      return result as SupplierTransaction;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update transaction');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadSuppliers, setLoading, setError]);

  const deleteTransaction = useCallback(async (id: string, supplierId?: string) => {
    setLoading(true);
    setError(null);

    try {
      await suppliersApi.deleteTransaction(id);
      if (supplierId && selectedSupplier?.id === supplierId) {
        await getById(supplierId);
      }
      await loadSuppliers();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete transaction');
      return false;
    } finally {
      setLoading(false);
    }
  }, [selectedSupplier, getById, loadSuppliers, setLoading, setError]);

  const getBalance = useCallback(async (supplierId: string) => {
    try {
      const data = await suppliersApi.getBalance(supplierId);
      return data as BalanceSummary | null;
    } catch (err) {
      console.error('Failed to get balance:', err);
      return null;
    }
  }, []);

  const recordPayment = useCallback(async (data: {
    supplierId: string;
    amount: number;
    paymentMethod: string;
    description?: string;
    createdBy: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const result = await suppliersApi.recordPayment(data);
      if (selectedSupplier?.id === data.supplierId) {
        await getById(data.supplierId);
      }
      await loadSuppliers();
      return result as SupplierTransaction;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
      return null;
    } finally {
      setLoading(false);
    }
  }, [selectedSupplier, getById, loadSuppliers, setLoading, setError]);

  const clearSelectedSupplier = useCallback(() => {
    setSelectedSupplier(null);
  }, [setSelectedSupplier]);

  return {
    suppliers,
    selectedSupplier,
    transactions,
    isLoading,
    error,
    loadSuppliers,
    getById,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    clearSelectedSupplier,
    loadTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getBalance,
    recordPayment,
  };
}
