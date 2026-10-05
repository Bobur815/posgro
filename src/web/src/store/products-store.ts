import { Product, Supplier } from '@shared/types';
import { create } from 'zustand';

export interface Category {
  id: string;
  nameUz: string;
  nameRu: string;
  mxikGroupCode?: string | null;
  active: boolean;
}

interface ProductsState {
  products: Product[];
  categories: Category[];
  suppliers: Supplier[];
  isLoading: boolean;
  error: string | null;
  setProducts: (products: Product[]) => void;
  /** Replace the product with the same id in place, or prepend it (the list is newest first). */
  upsertProduct: (product: Product) => void;
  removeProduct: (id: Product['id']) => void;
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
  upsertProduct: (product) =>
    set((state) => {
      const idx = state.products.findIndex((p) => p.id === product.id);
      if (idx === -1) return { products: [product, ...state.products] };
      const products = state.products.slice();
      products[idx] = product;
      return { products };
    }),
  removeProduct: (id) => set((state) => ({ products: state.products.filter((p) => p.id !== id) })),
  setCategories: (categories) => set({ categories }),
  setSuppliers: (suppliers) => set({ suppliers }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
