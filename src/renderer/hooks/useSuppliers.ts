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

  // Load all suppliers
  const loadSuppliers = useCallback(async (includeInactive?: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const data = await window.electronAPI.suppliers.getAll(includeInactive);
      setSuppliers(data as Supplier[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [setSuppliers, setLoading, setError]);

  // Get supplier by ID with transactions
  const getById = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const data = await window.electronAPI.suppliers.getById(id);
      const supplier = data as SupplierWithTransactions | null;
      setSelectedSupplier(supplier);
      return supplier;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load supplier');
      return null;
    } finally {
      setLoading(false);
    }
  }, [setSelectedSupplier, setLoading, setError]);

  // Create supplier
  const createSupplier = useCallback(async (data: SupplierCreateInput) => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.suppliers.create(data);
      await loadSuppliers();
      return result as Supplier;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create supplier');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadSuppliers, setLoading, setError]);

  // Update supplier
  const updateSupplier = useCallback(async (id: string, data: SupplierUpdateInput) => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.suppliers.update(id, data);
      await loadSuppliers();
      return result as Supplier;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update supplier');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadSuppliers, setLoading, setError]);

  // Delete supplier (soft delete)
  const deleteSupplier = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      await window.electronAPI.suppliers.delete(id);
      await loadSuppliers();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete supplier');
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadSuppliers, setLoading, setError]);

  // Load transactions with filters
  const loadTransactions = useCallback(async (filters?: SupplierTransactionFilters) => {
    setLoading(true);
    setError(null);

    try {
      const data = await window.electronAPI.suppliers.getTransactions(filters);
      setTransactions(data as SupplierTransaction[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [setTransactions, setLoading, setError]);

  // Create transaction
  const createTransaction = useCallback(async (
    data: SupplierTransactionCreateInput & { createdBy: string }
  ) => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.suppliers.createTransaction(data);
      // Reload supplier to get updated balance
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

  // Update transaction
  const updateTransaction = useCallback(async (
    id: string,
    data: SupplierTransactionUpdateInput
  ) => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.suppliers.updateTransaction(id, data);
      await loadSuppliers();
      return result as SupplierTransaction;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update transaction');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadSuppliers, setLoading, setError]);

  // Delete transaction
  const deleteTransaction = useCallback(async (id: string, supplierId?: string) => {
    setLoading(true);
    setError(null);

    try {
      await window.electronAPI.suppliers.deleteTransaction(id);
      // Reload supplier to get updated balance
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

  // Get balance summary
  const getBalance = useCallback(async (supplierId: string) => {
    try {
      const data = await window.electronAPI.suppliers.getBalance(supplierId);
      return data as BalanceSummary | null;
    } catch (err) {
      console.error('Failed to get balance:', err);
      return null;
    }
  }, []);

  // Record payment shortcut
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
      const result = await window.electronAPI.suppliers.recordPayment(data);
      // Reload supplier to get updated balance
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

  // Clear selected supplier
  const clearSelectedSupplier = useCallback(() => {
    setSelectedSupplier(null);
  }, [setSelectedSupplier]);

  return {
    // State
    suppliers,
    selectedSupplier,
    transactions,
    isLoading,
    error,

    // Supplier operations
    loadSuppliers,
    getById,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    clearSelectedSupplier,

    // Transaction operations
    loadTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,

    // Balance operations
    getBalance,
    recordPayment,
  };
}
