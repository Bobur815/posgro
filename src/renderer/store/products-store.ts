import { create } from 'zustand';

interface Product {
  id: string;
  barcode: string;
  nameUz: string;
  nameRu: string;
  price: number;
  cost: number | null;
  stock: number;
  minStock: number;
  unit: string;
  categoryId: string;
  category?: Category;
  active: boolean;
}

interface Category {
  id: string;
  nameUz: string;
  nameRu: string;
  active: boolean;
}

interface ProductsState {
  products: Product[];
  categories: Category[];
  isLoading: boolean;
  error: string | null;
  setProducts: (products: Product[]) => void;
  setCategories: (categories: Category[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useProductsStore = create<ProductsState>((set) => ({
  products: [],
  categories: [],
  isLoading: false,
  error: null,

  setProducts: (products) => set({ products }),
  setCategories: (categories) => set({ categories }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
