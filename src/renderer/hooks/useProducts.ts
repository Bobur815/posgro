import { useState, useCallback } from 'react';
import { useProductsStore } from '../store/products-store';

export function useProducts() {
  const {
    products,
    categories,
    isLoading,
    error,
    setProducts,
    setCategories,
    setLoading,
    setError,
  } = useProductsStore();

  const loadProducts = useCallback(async (filters?: { categoryId?: string; active?: boolean }) => {
    setLoading(true);
    setError(null);

    try {
      const data = await window.electronAPI.products.getAll(filters);
      setProducts(data as any[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [setProducts, setLoading, setError]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await window.electronAPI.categories.getAll();
      setCategories(data as any[]);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }, [setCategories]);

  const search = useCallback(async (query: string) => {
    setLoading(true);

    try {
      const data = await window.electronAPI.products.search(query);
      setProducts(data as any[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [setProducts, setLoading, setError]);

  const searchByBarcode = useCallback(async (barcode: string) => {
    try {
      const product = await window.electronAPI.products.getByBarcode(barcode);
      return product;
    } catch (err) {
      console.error('Failed to find product:', err);
      return null;
    }
  }, []);

  const getById = useCallback(async (id: string) => {
    try {
      const product = await window.electronAPI.products.getById(id);
      return product;
    } catch (err) {
      console.error('Failed to get product:', err);
      return null;
    }
  }, []);

  const createProduct = useCallback(async (data: any) => {
    setLoading(true);

    try {
      await window.electronAPI.products.create(data);
      await loadProducts();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product');
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadProducts, setLoading, setError]);

  const updateProduct = useCallback(async (id: string, data: any) => {
    setLoading(true);

    try {
      await window.electronAPI.products.update(id, data);
      await loadProducts();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update product');
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadProducts, setLoading, setError]);

  const deleteProduct = useCallback(async (id: string) => {
    setLoading(true);

    try {
      await window.electronAPI.products.delete(id);
      await loadProducts();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product');
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadProducts, setLoading, setError]);

  const getLowStock = useCallback(async () => {
    try {
      const data = await window.electronAPI.inventory.getLowStock();
      return data;
    } catch (err) {
      console.error('Failed to get low stock:', err);
      return [];
    }
  }, []);

  return {
    products,
    categories,
    isLoading,
    error,
    loadProducts,
    loadCategories,
    search,
    searchByBarcode,
    getById,
    createProduct,
    updateProduct,
    deleteProduct,
    getLowStock,
  };
}
