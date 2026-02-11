import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication
  auth: {
    login: (phone: string, password: string) =>
      ipcRenderer.invoke('auth:login', phone, password),
    loginWithPin: (pin: string) =>
      ipcRenderer.invoke('auth:loginWithPin', pin),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getProfile: () => ipcRenderer.invoke('auth:getProfile'),
    restoreSession: (token: string) =>
      ipcRenderer.invoke('auth:restoreSession', token),
  },

  // Products
  products: {
    getAll: (filters?: { categoryId?: string; active?: boolean }) =>
      ipcRenderer.invoke('products:getAll', filters),
    getById: (id: string) => ipcRenderer.invoke('products:getById', id),
    getByBarcode: (barcode: string) =>
      ipcRenderer.invoke('products:getByBarcode', barcode),
    create: (data: unknown) => ipcRenderer.invoke('products:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('products:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('products:delete', id),
    search: (query: string) => ipcRenderer.invoke('products:search', query),
    getTopSelling: (limit?: number) => ipcRenderer.invoke('products:getTopSelling', limit),
    getAnalytics: (productId: number, startDate?: string, endDate?: string) =>
      ipcRenderer.invoke('products:getAnalytics', productId, startDate, endDate),
  },

  // Sales
  sales: {
    create: (data: unknown) => ipcRenderer.invoke('sales:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('sales:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('sales:delete', id),
    getAll: (filters?: { startDate?: string; endDate?: string }) =>
      ipcRenderer.invoke('sales:getAll', filters),
    getById: (id: string) => ipcRenderer.invoke('sales:getById', id),
    getTodaySummary: () => ipcRenderer.invoke('sales:getTodaySummary'),
  },

  // Users (Admin only)
  users: {
    getAll: () => ipcRenderer.invoke('users:getAll'),
    create: (data: unknown) => ipcRenderer.invoke('users:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('users:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('users:delete', id),
  },

  // Categories
  categories: {
    getAll: () => ipcRenderer.invoke('categories:getAll'),
    create: (data: unknown) => ipcRenderer.invoke('categories:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('categories:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('categories:delete', id),
  },

  // Inventory
  inventory: {
    createArrival: (data: unknown) =>
      ipcRenderer.invoke('inventory:createArrival', data),
    getArrivals: (filters?: { productId?: string }) =>
      ipcRenderer.invoke('inventory:getArrivals', filters),
    getLowStock: () => ipcRenderer.invoke('inventory:getLowStock'),
  },

  // Suppliers
  suppliers: {
    getAll: (includeInactive?: boolean) =>
      ipcRenderer.invoke('suppliers:getAll', includeInactive),
    getById: (id: string) => ipcRenderer.invoke('suppliers:getById', id),
    create: (data: unknown) => ipcRenderer.invoke('suppliers:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('suppliers:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('suppliers:delete', id),
    getTransactions: (filters?: unknown) =>
      ipcRenderer.invoke('suppliers:getTransactions', filters),
    createTransaction: (data: unknown) =>
      ipcRenderer.invoke('suppliers:createTransaction', data),
    updateTransaction: (id: string, data: unknown) =>
      ipcRenderer.invoke('suppliers:updateTransaction', id, data),
    deleteTransaction: (id: string) =>
      ipcRenderer.invoke('suppliers:deleteTransaction', id),
    getBalance: (supplierId: string) =>
      ipcRenderer.invoke('suppliers:getBalance', supplierId),
    recordPayment: (data: unknown) =>
      ipcRenderer.invoke('suppliers:recordPayment', data),
  },

  // Sync
  sync: {
    trigger: () => ipcRenderer.invoke('sync:trigger'),
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    onCompleted: (callback: () => void) => {
      ipcRenderer.on('sync:completed', callback);
      return () => ipcRenderer.removeListener('sync:completed', callback);
    },
    onFailed: (callback: (error: { message: string }) => void) => {
      const handler = (_event: IpcRendererEvent, error: { message: string }) => callback(error);
      ipcRenderer.on('sync:failed', handler);
      return () => ipcRenderer.removeListener('sync:failed', handler);
    },
  },

  // Printer
  printer: {
    printReceipt: (saleId: string) =>
      ipcRenderer.invoke('printer:printReceipt', saleId),
    testPrint: () => ipcRenderer.invoke('printer:testPrint'),
    getAvailablePrinters: () => ipcRenderer.invoke('printer:getAvailable'),
    printPriceTags: (html: string, widthMm: number, heightMm: number) =>
      ipcRenderer.invoke('printer:printPriceTags', html, widthMm, heightMm),
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) =>
      ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },

  // App info
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getTerminalId: () => ipcRenderer.invoke('app:getTerminalId'),
    getStoreInfo: () => ipcRenderer.invoke('app:getStoreInfo'),
    quit: () => ipcRenderer.invoke('app:quit'),
  },
});

// Type declarations for the exposed API
declare global {
  interface Window {
    electronAPI: {
      auth: {
        login: (phone: string, password: string) => Promise<unknown>;
        loginWithPin: (pin: string) => Promise<unknown>;
        logout: () => Promise<void>;
        getProfile: () => Promise<unknown>;
        restoreSession: (token: string) => Promise<unknown>;
      };
      products: {
        getAll: (filters?: unknown) => Promise<unknown[]>;
        getById: (id: string) => Promise<unknown>;
        getByBarcode: (barcode: string) => Promise<unknown>;
        create: (data: unknown) => Promise<unknown>;
        update: (id: string, data: unknown) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
        search: (query: string) => Promise<unknown[]>;
        getTopSelling: (limit?: number) => Promise<unknown[]>;
        getAnalytics: (productId: number, startDate?: string, endDate?: string) => Promise<unknown>;
      };
      sales: {
        create: (data: unknown) => Promise<unknown>;
        update: (id: string, data: unknown) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
        getAll: (filters?: unknown) => Promise<unknown[]>;
        getById: (id: string) => Promise<unknown>;
        getTodaySummary: () => Promise<unknown>;
      };
      users: {
        getAll: () => Promise<unknown[]>;
        create: (data: unknown) => Promise<unknown>;
        update: (id: string, data: unknown) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
      };
      categories: {
        getAll: () => Promise<unknown[]>;
        create: (data: unknown) => Promise<unknown>;
        update: (id: string, data: unknown) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
      };
      inventory: {
        createArrival: (data: unknown) => Promise<unknown>;
        getArrivals: (filters?: unknown) => Promise<unknown[]>;
        getLowStock: () => Promise<unknown[]>;
      };
      suppliers: {
        getAll: (includeInactive?: boolean) => Promise<unknown[]>;
        getById: (id: string) => Promise<unknown>;
        create: (data: unknown) => Promise<unknown>;
        update: (id: string, data: unknown) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
        getTransactions: (filters?: unknown) => Promise<unknown[]>;
        createTransaction: (data: unknown) => Promise<unknown>;
        updateTransaction: (id: string, data: unknown) => Promise<unknown>;
        deleteTransaction: (id: string) => Promise<boolean>;
        getBalance: (supplierId: string) => Promise<unknown>;
        recordPayment: (data: unknown) => Promise<unknown>;
      };
      sync: {
        trigger: () => Promise<void>;
        getStatus: () => Promise<unknown>;
        onCompleted: (callback: () => void) => () => void;
        onFailed: (callback: (error: { message: string }) => void) => () => void;
      };
      printer: {
        printReceipt: (saleId: string) => Promise<boolean>;
        testPrint: () => Promise<boolean>;
        getAvailablePrinters: () => Promise<string[]>;
        printPriceTags: (html: string, widthMm: number, heightMm: number) => Promise<boolean>;
      };
      settings: {
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<void>;
        getAll: () => Promise<Record<string, string>>;
      };
      app: {
        getVersion: () => Promise<string>;
        getTerminalId: () => Promise<string>;
        getStoreInfo: () => Promise<{ storeId: string; storeName: string }>;
        quit: () => Promise<void>;
      };
    };
  }
}
