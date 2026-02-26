import {
  Supplier,
  SupplierTransaction,
  SupplierWithTransactions,
} from '@shared/types';
import { create } from 'zustand';

interface SuppliersState {
  suppliers: Supplier[];
  selectedSupplier: SupplierWithTransactions | null;
  transactions: SupplierTransaction[];
  isLoading: boolean;
  error: string | null;
  setSuppliers: (suppliers: Supplier[]) => void;
  setSelectedSupplier: (supplier: SupplierWithTransactions | null) => void;
  setTransactions: (transactions: SupplierTransaction[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSuppliersStore = create<SuppliersState>((set) => ({
  suppliers: [],
  selectedSupplier: null,
  transactions: [],
  isLoading: false,
  error: null,

  setSuppliers: (suppliers) => set({ suppliers }),
  setSelectedSupplier: (selectedSupplier) => set({ selectedSupplier }),
  setTransactions: (transactions) => set({ transactions }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
