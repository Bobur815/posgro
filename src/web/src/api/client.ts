import axios from "axios";

export interface DeviceSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  deviceName: string | null;
  createdAt: string;
  isCurrent: boolean;
  isRevoked: boolean;
}

const baseURL = import.meta.env.VITE_API_URL ?? "/api";

export const axiosInstance = axios.create({ baseURL });

// Request interceptor: inject JWT and language
axiosInstance.interceptors.request.use((config) => {
  // Lazy-import to avoid circular deps; read directly from localStorage
  const raw = localStorage.getItem("auth-storage");
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
  const lang = localStorage.getItem("language") ?? "ru";
  config.headers["Accept-Language"] = lang;
  return config;
});

// Response interceptor: 401 → logout
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth state
      localStorage.removeItem("auth-storage");
      window.location.href = "/web/login";
    }
    return Promise.reject(
      error instanceof Error
        ? error
        : new Error(error.response?.data?.message ?? String(error)),
    );
  },
);

// ─── Auth ────────────────────────────────────────────────────────────────────

export const auth = {
  login: async (phone: string, password: string, storeId?: string) => {
    const body: Record<string, string> = { phone, password };
    if (storeId) body.storeId = storeId;
    const { data } = await axiosInstance.post("/auth/login", body);
    return data as { token: string; user: unknown };
  },
  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
    } catch {
      /* ignore */
    }
  },
  getProfile: async () => {
    const { data } = await axiosInstance.get("/auth/profile");
    return data;
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const { data } = await axiosInstance.post("/auth/change-password", {
      currentPassword,
      newPassword,
    });
    return data;
  },
  getSessions: async (): Promise<DeviceSession[]> => {
    const { data } = await axiosInstance.get("/auth/sessions");
    return data;
  },
  revokeSession: async (sessionId: string) => {
    const { data } = await axiosInstance.delete(`/auth/sessions/${sessionId}`);
    return data;
  },
  revokeOtherSessions: async () => {
    const { data } = await axiosInstance.delete("/auth/sessions/others");
    return data;
  },
  nameDevice: async (ipAddress: string, name: string) => {
    const { data } = await axiosInstance.patch("/auth/sessions/device-name", { ipAddress, name });
    return data;
  },
};

// ─── Products ────────────────────────────────────────────────────────────────

export const products = {
  getAll: async (filters?: Record<string, unknown>) => {
    const { data } = await axiosInstance.get("/products", { params: filters });
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
    const { data } = await axiosInstance.get(
      `/products/internal-code/${internalCode}`,
    );
    return data;
  },
  getNextInternalCode: async (): Promise<string> => {
    const { data } = await axiosInstance.get('/products/next-internal-code');
    return data;
  },
  create: async (productData: unknown) => {
    const { data } = await axiosInstance.post("/products", productData);
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
    const { data } = await axiosInstance.get("/products", {
      params: { query },
    });
    return data;
  },
  getTopSelling: async (limit?: number) => {
    const { data } = await axiosInstance.get("/products/top-selling", {
      params: { limit },
    });
    return data;
  },
  getAnalytics: async (
    productId: number,
    startDate?: string,
    endDate?: string,
  ) => {
    const { data } = await axiosInstance.get(
      `/products/${productId}/analytics`,
      {
        params: { startDate, endDate },
      },
    );
    return data;
  },
};

// ─── Categories ──────────────────────────────────────────────────────────────

export const categories = {
  getAll: async () => {
    const { data } = await axiosInstance.get("/categories");
    return data;
  },
  create: async (categoryData: unknown) => {
    const { data } = await axiosInstance.post("/categories", categoryData);
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
    const { data } = await axiosInstance.post(
      "/inventory/arrivals",
      arrivalData,
    );
    return data;
  },
  getArrivals: async (filters?: { productId?: string }) => {
    const { data } = await axiosInstance.get("/inventory/arrivals", {
      params: filters,
    });
    return data;
  },
  getLowStock: async () => {
    const { data } = await axiosInstance.get("/inventory/low-stock");
    return data;
  },
};

// ─── Suppliers ───────────────────────────────────────────────────────────────

export const suppliers = {
  getAll: async (includeInactive?: boolean) => {
    const { data } = await axiosInstance.get("/suppliers", {
      params: { includeInactive },
    });
    return data;
  },
  getById: async (id: string) => {
    const { data } = await axiosInstance.get(`/suppliers/${id}`);
    return data;
  },
  create: async (supplierData: unknown) => {
    const { data } = await axiosInstance.post("/suppliers", supplierData);
    return data;
  },
  update: async (id: string, supplierData: unknown) => {
    const { data } = await axiosInstance.patch(`/suppliers/${id}`, supplierData);
    return data;
  },
  delete: async (id: string) => {
    const { data } = await axiosInstance.delete(`/suppliers/${id}`);
    return data;
  },
  getTransactions: async (filters?: unknown) => {
    const { data } = await axiosInstance.get("/suppliers/transactions", {
      params: filters as Record<string, unknown>,
    });
    return data;
  },
  createTransaction: async (transactionData: unknown) => {
    const { data } = await axiosInstance.post(
      "/suppliers/transactions",
      transactionData,
    );
    return data;
  },
  updateTransaction: async (id: string, transactionData: unknown) => {
    const { data } = await axiosInstance.put(
      `/suppliers/transactions/${id}`,
      transactionData,
    );
    return data;
  },
  deleteTransaction: async (id: string) => {
    const { data } = await axiosInstance.delete(
      `/suppliers/transactions/${id}`,
    );
    return data;
  },
  getBalance: async (supplierId: string) => {
    const { data } = await axiosInstance.get(
      `/suppliers/${supplierId}/balance`,
    );
    return data;
  },
  recordPayment: async (paymentData: unknown) => {
    const { data } = await axiosInstance.post(
      "/suppliers/payments",
      paymentData,
    );
    return data;
  },
};

// ─── Sales ───────────────────────────────────────────────────────────────────

export const sales = {
  getAll: async (filters?: { startDate?: string; endDate?: string }) => {
    const { data } = await axiosInstance.get("/sales", { params: filters });
    return data;
  },
  getById: async (id: string) => {
    const { data } = await axiosInstance.get(`/sales/${id}`);
    return data;
  },
  create: async (saleData: unknown) => {
    const { data } = await axiosInstance.post("/sales", saleData);
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
    const { data } = await axiosInstance.get("/sales/today/summary");
    return data;
  },
};

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = {
  getAll: async () => {
    const { data } = await axiosInstance.get("/users");
    return data;
  },
  getById: async (id: string) => {
    const { data } = await axiosInstance.get(`/users/${id}`);
    return data;
  },
  create: async (userData: unknown) => {
    const { data } = await axiosInstance.post("/users", userData);
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
    const { data } = await axiosInstance.get("/settings");
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
    const { data } = await axiosInstance.post("/invoice/scan", {
      imageBase64: imageData,
      mimeType,
    });
    return data;
  },
  matchProducts: async (items: unknown[]) => {
    const { data } = await axiosInstance.post("/invoice/match-products", {
      items,
    });
    return data;
  },
  getPlan: async (): Promise<{ plan: string; balance_uzs: number | null }> => {
    const { data } = await axiosInstance.get("/invoice/plan");
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
  aiPlan: string;
  balance: number;
  subscriptionPlan: string | null;
  subscriptionExpiresAt: string | null;
  scheduledDeleteAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number; products: number; sales: number; terminalHeartbeats: number };
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
    const { data } = await axiosInstance.get("/stores");
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
  create: async (payload: {
    name: string;
    address?: string;
    phone?: string;
  }): Promise<StoreRecord> => {
    const { data } = await axiosInstance.post("/stores", payload);
    return data;
  },
  update: async (
    id: string,
    payload: Partial<{
      name: string;
      address: string;
      phone: string;
      active: boolean;
      aiPlan: string;
      subscriptionPlan: string;
      subscriptionExpiresAt: string | null;
    }>,
  ): Promise<StoreRecord> => {
    const { data } = await axiosInstance.patch(`/stores/${id}`, payload);
    return data;
  },
  delete: async (id: string): Promise<{ success: boolean }> => {
    const { data } = await axiosInstance.delete(`/stores/${id}`);
    return data;
  },
  cancelDelete: async (id: string): Promise<{ success: boolean }> => {
    const { data } = await axiosInstance.put(`/stores/${id}/cancel-delete`);
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
  addCredits: async (id: string, amount: number): Promise<{ success: boolean; balance: number }> => {
    const { data } = await axiosInstance.post(`/stores/${id}/credits`, { amount });
    return data;
  },
};

// ─── Terminal Logs (Super Admin) ─────────────────────────────────────────────

export interface TerminalLogEntry {
  id: string;
  storeId: string;
  terminalId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

export interface LogsResponse {
  items: TerminalLogEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface LogsQueryParams {
  storeId?: string;
  terminalId?: string;
  level?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface LogsMeta {
  stores: string[];
  terminalsByStore: Record<string, string[]>;
}

export const logs = {
  getMeta: async (): Promise<LogsMeta> => {
    const { data } = await axiosInstance.get('/logs/meta');
    return data;
  },
  getLogs: async (params?: LogsQueryParams): Promise<LogsResponse> => {
    const { data } = await axiosInstance.get('/logs', { params });
    return data;
  },
};

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  storeId: string;
  store: { name: string };
  userId: string;
  phone: string;
  action: string;
  entity: string;
  entityId: string;
  details: string | null;
  createdAt: string;
}

export interface AuditLogsResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface AuditLogsQueryParams {
  storeId?: string;
  phone?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogsMeta {
  stores: string[];
  actions: string[];
  entities: string[];
}

export const auditLogs = {
  getMeta: async (): Promise<AuditLogsMeta> => {
    const { data } = await axiosInstance.get('/logs/audit/meta');
    return data;
  },
  getAuditLogs: async (params?: AuditLogsQueryParams): Promise<AuditLogsResponse> => {
    const { data } = await axiosInstance.get('/logs/audit', { params });
    return data;
  },
};

// ─── Site Config ─────────────────────────────────────────────────────────────

export interface LoginBanner {
  imageUrl: string;
  title: string;
  subtitle: string;
}

export interface SubscriptionPlanPrices {
  starter: number;
  pro: number;
  vip: number;
}

export const siteConfig = {
  getLoginBanner: async (): Promise<LoginBanner> => {
    const { data } = await axiosInstance.get('/site-config/login-banner');
    return data;
  },
  updateLoginBanner: async (banner: LoginBanner): Promise<LoginBanner> => {
    const { data } = await axiosInstance.put('/site-config/login-banner', banner);
    return data;
  },
  uploadImage: async (file: File): Promise<{ url: string }> => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await axiosInstance.post('/site-config/upload-image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  getSubscriptionPlans: async (): Promise<SubscriptionPlanPrices> => {
    const { data } = await axiosInstance.get('/site-config/subscription-plans');
    return data;
  },
  setSubscriptionPlans: async (prices: SubscriptionPlanPrices): Promise<SubscriptionPlanPrices> => {
    const { data } = await axiosInstance.put('/site-config/subscription-plans', prices);
    return data;
  },
};

// ─── Analytics ───────────────────────────────────────────────────────────────

export const analytics = {
  getData: async (filters: { startDate: string; endDate: string }) => {
    const { data } = await axiosInstance.get("/analytics/data", {
      params: filters,
    });
    return data;
  },
};

// ─── MXIK ────────────────────────────────────────────────────────────────────

export interface MxikScanInfo {
  name: string;
  brandName: string | null;
  attributeName: string | null;
  unitsName: string | null;
  groupCode: string | null;
}

export const mxik = {
  lookupCode: async (code: string): Promise<{ code: string; name: string; nameRu: string; packageCode: string }> => {
    const { data } = await axiosInstance.get(`/mxik/code/${encodeURIComponent(code)}`);
    return data;
  },
  searchByBarcode: async (barcode: string): Promise<{ code: string; name: string; nameRu: string; packageCode: string }> => {
    // Call tasnif directly from browser (VPS is geo-blocked; browser is in Uzbekistan)
    const TASNIF = 'https://tasnif.soliq.uz/api/cls-api';
    const searchRes = await fetch(`${TASNIF}/elasticsearch/search?lang=uz_cyrl&search=${encodeURIComponent(barcode)}&size=5&page=0`);
    const searchJson = await searchRes.json();
    if (!searchJson.success || !searchJson.data?.length) throw new Error('Not found');
    const match = searchJson.data.find((d: any) => d.internationalCode === barcode) ?? searchJson.data[0];
    const mxikCode: string = match.mxikCode;
    const detailRes = await fetch(`${TASNIF}/integration-mxik/get/history/${mxikCode}`);
    const detailJson = await detailRes.json();
    if (!detailJson.success || !detailJson.data) throw new Error('Not found');
    const d = detailJson.data;
    const brand = d.brandName ? `${d.brandName} ` : '';
    return {
      code: d.mxikCode,
      name: brand + (d.attributeNameUz ?? d.subPositionNameUz),
      nameRu: brand + (d.attributeNameRu ?? d.subPositionNameRu),
      packageCode: String(d.packageNames?.[0]?.code ?? '796'),
    };
  },
  // Batch MXIK lookup via by-params endpoint (called directly from browser — VPS is geo-blocked)
  lookupBatch: async (codes: string[]): Promise<Record<string, MxikScanInfo>> => {
    const TASNIF = 'https://tasnif.soliq.uz/api/cls-api';
    const results = await Promise.allSettled(
      codes.map(async (code) => {
        const res = await fetch(
          `${TASNIF}/mxik/search/by-params?mxikCode=${encodeURIComponent(code)}&size=1&page=0&lang=uz_cyrl`,
          { signal: AbortSignal.timeout(6000) },
        );
        const json = await res.json() as { success: boolean; data: Array<{ mxikCode: string; name: string; brandName: string; attributeName: string; unitsName: string; groupCode: string }> };
        if (!json.success || !json.data?.length) return { code, info: null };
        const d = json.data[0];
        return {
          code,
          info: {
            name: d.name,
            brandName: d.brandName || null,
            attributeName: d.attributeName || null,
            unitsName: d.unitsName || null,
            groupCode: d.groupCode || null,
          } satisfies MxikScanInfo,
        };
      }),
    );
    const map: Record<string, MxikScanInfo> = {};
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.info) {
        map[r.value.code] = r.value.info;
      }
    }
    return map;
  },
};

// ─── ASL-BELGISI ─────────────────────────────────────────────────────────────

// Normalize a GS1 DataMatrix string from a scanner:
// - Strip ZXing symbology prefix (]d2, ]C1, ]e0)
// - Strip leading FNC1 (\x1d) — the GS1 mode indicator prepended by some decoders
// - Keep internal \x1d characters — they are AI separators required by aslbelgisi
function normalizeDataMatrix(raw: string): string {
  return raw.replace(/^\](d2|C1|e0)/, '').replace(/^\x1d/, '');
}

export const aslBelgisi = {
  /**
   * Verify a DataMatrix marking code via the server proxy.
   * The server adds the ASLBELGISI_API_KEY Bearer token.
   */
  verifyMarkingCode: async (markingCode: string): Promise<{
    isValid: boolean;
    status?: string;
    extendedStatus?: string;
    gtin?: string;
    productId?: string;
    productionDate?: string;
    expirationDate?: string;
    productSeries?: string;
    issuerName?: string;
    packageType?: string;
    _error?: string;
  }> => {
    try {
      const normalized = normalizeDataMatrix(markingCode);
      const { data } = await axiosInstance.post('/aslbelgisi/verify', { code: normalized });
      return data;
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? String(e);
      return { isValid: false, _error: `HTTP ${e?.response?.status ?? '?'}: ${msg}` };
    }
  },

  /** Extract EAN-13 barcode from a 14-digit GTIN (strips leading zero). */
  extractGtinFromDataMatrix: (dataMatrix: string): string | null => {
    const normalized = normalizeDataMatrix(dataMatrix);
    const match = normalized.match(/^01(\d{14})/);
    if (!match) return null;
    const gtin14 = match[1];
    // GS1 GTIN-14 with leading 0 → EAN-13
    return gtin14.startsWith('0') ? gtin14.slice(1) : gtin14;
  },

  /** Detect QR/barcode type to route scanning logic correctly. */
  detectQrType: (qrData: string): 'fiscal' | 'datamatrix' | 'mxik' | 'barcode' => {
    if (qrData.includes('http://') || qrData.includes('https://')) return 'fiscal';
    // GS1 DataMatrix: raw or with ZXing ]d2/]C1 prefix, starts with AI "01" + 14 digits
    const normalized = normalizeDataMatrix(qrData);
    if (/^01\d{14}/.test(normalized)) return 'datamatrix';
    if (/^\d{17}$/.test(qrData)) return 'mxik';
    return 'barcode';
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
  logs,
  analytics,
  mxik,
  aslBelgisi,
};
