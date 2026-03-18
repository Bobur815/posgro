import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ?? '/api';

export const axiosInstance = axios.create({ baseURL });

// Request interceptor: inject JWT
axiosInstance.interceptors.request.use((config) => {
  // Lazy-import to avoid circular deps; read directly from localStorage
  const raw = localStorage.getItem('auth-storage');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const token: string | undefined = parsed?.state?.token;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // ignore
    }
  }
  return config;
});

// Response interceptor: 401 → logout
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth state
      localStorage.removeItem('auth-storage');
      window.location.href = '/web/login';
    }
    return Promise.reject(error instanceof Error ? error : new Error(error.response?.data?.message ?? String(error)));
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────

export const auth = {
  login: async (phone: string, password: string, storeId?: string) => {
    const body: Record<string, string> = { phone, password };
    if (storeId) body.storeId = storeId;
    const { data } = await axiosInstance.post('/auth/login', body);
    return data as { token: string; user: unknown };
  },
  logout: async () => {
    try { await axiosInstance.post('/auth/logout'); } catch { /* ignore */ }
  },
  getProfile: async () => {
    const { data } = await axiosInstance.get('/auth/profile');
    return data;
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const { data } = await axiosInstance.post('/auth/change-password', { currentPassword, newPassword });
    return data;
  },
};

// ─── Products ────────────────────────────────────────────────────────────────

export const products = {
  getAll: async (filters?: Record<string, unknown>) => {
    const { data } = await axiosInstance.get('/products', { params: filters });
    return data;
  },
  getById: async (id: string) => {
    const { data } = await axiosInstance.get(`/products/${id}`);
    return data;
  },
  getByBarcode: async (barcode: string) => {
    const { data } = await axiosInstance.get(`/products/barcode/${barcode}`);
    return data;
  },
  findByInternalCode: async (internalCode: string) => {
    const { data } = await axiosInstance.get(`/products/internal-code/${internalCode}`);
    return data;
  },
  create: async (productData: unknown) => {
    const { data } = await axiosInstance.post('/products', productData);
    return data;
  },
  update: async (id: string, productData: unknown) => {
    const { data } = await axiosInstance.patch(`/products/${id}`, productData);
    return data;
  },
  delete: async (id: string) => {
    const { data } = await axiosInstance.delete(`/products/${id}`);
    return data;
  },
  search: async (query: string) => {
    const { data } = await axiosInstance.get('/products', { params: { query } });
    return data;
  },
  getTopSelling: async (limit?: number) => {
    const { data } = await axiosInstance.get('/products/top-selling', { params: { limit } });
    return data;
  },
  getAnalytics: async (productId: number, startDate?: string, endDate?: string) => {
    const { data } = await axiosInstance.get(`/products/${productId}/analytics`, {
      params: { startDate, endDate },
    });
    return data;
  },
};

// ─── Categories ──────────────────────────────────────────────────────────────

export const categories = {
  getAll: async () => {
    const { data } = await axiosInstance.get('/categories');
    return data;
  },
  create: async (categoryData: unknown) => {
    const { data } = await axiosInstance.post('/categories', categoryData);
    return data;
  },
  update: async (id: string, categoryData: unknown) => {
    const { data } = await axiosInstance.put(`/categories/${id}`, categoryData);
    return data;
  },
  delete: async (id: string) => {
    const { data } = await axiosInstance.delete(`/categories/${id}`);
    return data;
  },
};

// ─── Inventory ───────────────────────────────────────────────────────────────

export const inventory = {
  createArrival: async (arrivalData: unknown) => {
    const { data } = await axiosInstance.post('/inventory/arrivals', arrivalData);
    return data;
  },
  getArrivals: async (filters?: { productId?: string }) => {
    const { data } = await axiosInstance.get('/inventory/arrivals', { params: filters });
    return data;
  },
  getLowStock: async () => {
    const { data } = await axiosInstance.get('/inventory/low-stock');
    return data;
  },
};

// ─── Suppliers ───────────────────────────────────────────────────────────────

export const suppliers = {
  getAll: async (includeInactive?: boolean) => {
    const { data } = await axiosInstance.get('/suppliers', {
      params: { includeInactive },
    });
    return data;
  },
  getById: async (id: string) => {
    const { data } = await axiosInstance.get(`/suppliers/${id}`);
    return data;
  },
  create: async (supplierData: unknown) => {
    const { data } = await axiosInstance.post('/suppliers', supplierData);
    return data;
  },
  update: async (id: string, supplierData: unknown) => {
    const { data } = await axiosInstance.put(`/suppliers/${id}`, supplierData);
    return data;
  },
  delete: async (id: string) => {
    const { data } = await axiosInstance.delete(`/suppliers/${id}`);
    return data;
  },
  getTransactions: async (filters?: unknown) => {
    const { data } = await axiosInstance.get('/suppliers/transactions', { params: filters as Record<string, unknown> });
    return data;
  },
  createTransaction: async (transactionData: unknown) => {
    const { data } = await axiosInstance.post('/suppliers/transactions', transactionData);
    return data;
  },
  updateTransaction: async (id: string, transactionData: unknown) => {
    const { data } = await axiosInstance.put(`/suppliers/transactions/${id}`, transactionData);
    return data;
  },
  deleteTransaction: async (id: string) => {
    const { data } = await axiosInstance.delete(`/suppliers/transactions/${id}`);
    return data;
  },
  getBalance: async (supplierId: string) => {
    const { data } = await axiosInstance.get(`/suppliers/${supplierId}/balance`);
    return data;
  },
  recordPayment: async (paymentData: unknown) => {
    const { data } = await axiosInstance.post('/suppliers/payments', paymentData);
    return data;
  },
};

// ─── Sales ───────────────────────────────────────────────────────────────────

export const sales = {
  getAll: async (filters?: { startDate?: string; endDate?: string }) => {
    const { data } = await axiosInstance.get('/sales', { params: filters });
    return data;
  },
  getById: async (id: string) => {
    const { data } = await axiosInstance.get(`/sales/${id}`);
    return data;
  },
  create: async (saleData: unknown) => {
    const { data } = await axiosInstance.post('/sales', saleData);
    return data;
  },
  update: async (id: string, saleData: unknown) => {
    const { data } = await axiosInstance.put(`/sales/${id}`, saleData);
    return data;
  },
  delete: async (id: string) => {
    const { data } = await axiosInstance.delete(`/sales/${id}`);
    return data;
  },
  getTodaySummary: async () => {
    const { data } = await axiosInstance.get('/sales/today/summary');
    return data;
  },
};

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = {
  getAll: async () => {
    const { data } = await axiosInstance.get('/users');
    return data;
  },
  getById: async (id: string) => {
    const { data } = await axiosInstance.get(`/users/${id}`);
    return data;
  },
  create: async (userData: unknown) => {
    const { data } = await axiosInstance.post('/users', userData);
    return data;
  },
  update: async (id: string, userData: unknown) => {
    const { data } = await axiosInstance.put(`/users/${id}`, userData);
    return data;
  },
  delete: async (id: string) => {
    const { data } = await axiosInstance.delete(`/users/${id}`);
    return data;
  },
};

// ─── Settings ────────────────────────────────────────────────────────────────

export const settings = {
  getAll: async () => {
    const { data } = await axiosInstance.get('/settings');
    return data;
  },
  get: async (key: string) => {
    const { data } = await axiosInstance.get(`/settings/${key}`);
    return data?.value ?? data;
  },
  set: async (key: string, value: string) => {
    const { data } = await axiosInstance.put(`/settings/${key}`, { value });
    return data;
  },
};

// ─── Receipt (AI OCR) ────────────────────────────────────────────────────────

export const receipt = {
  scan: async (imageData: string, mimeType?: string) => {
    const { data } = await axiosInstance.post('/invoice/scan', { imageBase64: imageData, mimeType });
    return data;
  },
  matchProducts: async (items: unknown[]) => {
    const { data } = await axiosInstance.post('/invoice/match-products', { items });
    return data;
  },
  getPlan: async (): Promise<{ plan: string; balance_usd: number | null }> => {
    const { data } = await axiosInstance.get('/invoice/plan');
    return data;
  },
};

// ─── Stores (Super Admin) ─────────────────────────────────────────────────────

export interface StoreRecord {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  plan: string;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number; products: number; sales: number };
}

export interface StoreStats {
  store: StoreRecord;
  stats: {
    totalRevenue: number;
    totalSales: number;
    productsCount: number;
    usersCount: number;
  };
}

export const stores = {
  getAll: async (): Promise<StoreRecord[]> => {
    const { data } = await axiosInstance.get('/stores');
    return data;
  },
  getById: async (id: string): Promise<StoreRecord> => {
    const { data } = await axiosInstance.get(`/stores/${id}`);
    return data;
  },
  getStats: async (id: string): Promise<StoreStats> => {
    const { data } = await axiosInstance.get(`/stores/${id}/stats`);
    return data;
  },
  create: async (payload: { name: string; address?: string; phone?: string }): Promise<StoreRecord> => {
    const { data } = await axiosInstance.post('/stores', payload);
    return data;
  },
  update: async (id: string, payload: Partial<{ name: string; address: string; phone: string; active: boolean; plan: string }>): Promise<StoreRecord> => {
    const { data } = await axiosInstance.patch(`/stores/${id}`, payload);
    return data;
  },
  delete: async (id: string): Promise<{ success: boolean }> => {
    const { data } = await axiosInstance.delete(`/stores/${id}`);
    return data;
  },
  activate: async (id: string): Promise<{ success: boolean }> => {
    const { data } = await axiosInstance.put(`/stores/${id}/activate`);
    return data;
  },
  deactivate: async (id: string): Promise<{ success: boolean }> => {
    const { data } = await axiosInstance.put(`/stores/${id}/deactivate`);
    return data;
  },
};

// ─── Analytics ───────────────────────────────────────────────────────────────

export const analytics = {
  getData: async (filters: { startDate: string; endDate: string }) => {
    const { data } = await axiosInstance.get('/analytics/data', { params: filters });
    return data;
  },
};

// ─── Combined export ─────────────────────────────────────────────────────────

export const api = {
  auth,
  products,
  categories,
  inventory,
  suppliers,
  sales,
  users,
  settings,
  receipt,
  stores,
  analytics,
};
