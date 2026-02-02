// API endpoint definitions

export const API_ENDPOINTS = {
  // Auth
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    PROFILE: '/auth/profile',
  },

  // Products
  PRODUCTS: {
    BASE: '/products',
    BY_ID: (id: string) => `/products/${id}`,
    BY_BARCODE: (barcode: string) => `/products/barcode/${barcode}`,
    SEARCH: '/products/search',
    BULK_IMPORT: '/products/bulk-import',
  },

  // Categories
  CATEGORIES: {
    BASE: '/categories',
    BY_ID: (id: string) => `/categories/${id}`,
  },

  // Sales
  SALES: {
    BASE: '/sales',
    SYNC: '/sales/sync',
    BY_ID: (id: string) => `/sales/${id}`,
  },

  // Users
  USERS: {
    BASE: '/users',
    BY_ID: (id: string) => `/users/${id}`,
  },

  // Inventory
  INVENTORY: {
    ARRIVALS: '/inventory/arrivals',
    LOW_STOCK: '/inventory/low-stock',
  },

  // Analytics
  ANALYTICS: {
    DAILY: '/analytics/daily',
    MONTHLY: '/analytics/monthly',
    PRODUCT_PERFORMANCE: '/analytics/product-performance',
  },

  // Health check
  HEALTH: '/health',
} as const;
