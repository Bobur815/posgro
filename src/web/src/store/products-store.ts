import { Product, Supplier } from '@shared/types';
import { create } from 'zustand';

export interface Category {
  id: string;
  nameUz: string;
  nameRu: string;
  active: boolean;
}

interface ProductsState {
  products: Product[];
  categories: Category[];
  suppliers: Supplier[];
  isLoading: boolean;
  error: string | null;
  setProducts: (products: Product[]) => void;
  setCategories: (categories: Category[]) => void;
  setSuppliers: (suppliers: Supplier[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useProductsStore = create<ProductsState>((set) => ({
  products: [],
  categories: [],
  suppliers: [],
  isLoading: false,
  error: null,

  setProducts: (products) => set({ products }),
  setCategories: (categories) => set({ categories }),
  setSuppliers: (suppliers) => set({ suppliers }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
