import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Authentication
  auth: {
    login: (phone: string, password: string) =>
      ipcRenderer.invoke("auth:login", phone, password),
    loginWithPin: (pin: string) => ipcRenderer.invoke("auth:loginWithPin", pin),
    logout: () => ipcRenderer.invoke("auth:logout"),
    getProfile: () => ipcRenderer.invoke("auth:getProfile"),
    restoreSession: (token: string) =>
      ipcRenderer.invoke("auth:restoreSession", token),
    changePassword: (currentPassword: string, newPassword: string) =>
      ipcRenderer.invoke("auth:changePassword", currentPassword, newPassword),
  },

  // Products
  products: {
    getAll: (filters?: { categoryId?: string; active?: boolean }) =>
      ipcRenderer.invoke("products:getAll", filters),
    getById: (id: string) => ipcRenderer.invoke("products:getById", id),
    getByBarcode: (barcode: string) =>
      ipcRenderer.invoke("products:getByBarcode", barcode),
    findByInternalCode: (internalCode: string) =>
      ipcRenderer.invoke("products:findByInternalCode", internalCode),
    getNextInternalCode: () =>
      ipcRenderer.invoke("products:getNextInternalCode"),
    create: (data: unknown) => ipcRenderer.invoke("products:create", data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke("products:update", id, data),
    delete: (id: string) => ipcRenderer.invoke("products:delete", id),
    search: (query: string) => ipcRenderer.invoke("products:search", query),
    getTopSelling: (limit?: number) =>
      ipcRenderer.invoke("products:getTopSelling", limit),
    getAnalytics: (productId: number, startDate?: string, endDate?: string) =>
      ipcRenderer.invoke(
        "products:getAnalytics",
        productId,
        startDate,
        endDate,
      ),
  },

  // Sales
  sales: {
    create: (data: unknown) => ipcRenderer.invoke("sales:create", data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke("sales:update", id, data),
    delete: (id: string) => ipcRenderer.invoke("sales:delete", id),
    getAll: (filters?: { startDate?: string; endDate?: string; terminalId?: string }) =>
      ipcRenderer.invoke("sales:getAll", filters),
    getById: (id: string) => ipcRenderer.invoke("sales:getById", id),
    getTodaySummary: () => ipcRenderer.invoke("sales:getTodaySummary"),
  },

  // Users (Admin only)
  users: {
    getAll: () => ipcRenderer.invoke("users:getAll"),
    create: (data: unknown) => ipcRenderer.invoke("users:create", data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke("users:update", id, data),
    delete: (id: string) => ipcRenderer.invoke("users:delete", id),
  },

  // Categories
  categories: {
    getAll: () => ipcRenderer.invoke("categories:getAll"),
    create: (data: unknown) => ipcRenderer.invoke("categories:create", data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke("categories:update", id, data),
    delete: (id: string) => ipcRenderer.invoke("categories:delete", id),
  },

  // Inventory
  inventory: {
    createArrival: (data: unknown) =>
      ipcRenderer.invoke("inventory:createArrival", data),
    getArrivals: (filters?: { productId?: string }) =>
      ipcRenderer.invoke("inventory:getArrivals", filters),
    getLowStock: () => ipcRenderer.invoke("inventory:getLowStock"),
  },

  // Suppliers
  suppliers: {
    getAll: (includeInactive?: boolean) =>
      ipcRenderer.invoke("suppliers:getAll", includeInactive),
    getById: (id: string) => ipcRenderer.invoke("suppliers:getById", id),
    create: (data: unknown) => ipcRenderer.invoke("suppliers:create", data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke("suppliers:update", id, data),
    delete: (id: string) => ipcRenderer.invoke("suppliers:delete", id),
    getTransactions: (filters?: unknown) =>
      ipcRenderer.invoke("suppliers:getTransactions", filters),
    createTransaction: (data: unknown) =>
      ipcRenderer.invoke("suppliers:createTransaction", data),
    updateTransaction: (id: string, data: unknown) =>
      ipcRenderer.invoke("suppliers:updateTransaction", id, data),
    deleteTransaction: (id: string) =>
      ipcRenderer.invoke("suppliers:deleteTransaction", id),
    getBalance: (supplierId: string) =>
      ipcRenderer.invoke("suppliers:getBalance", supplierId),
    recordPayment: (data: unknown) =>
      ipcRenderer.invoke("suppliers:recordPayment", data),
  },

  // Sync
  sync: {
    trigger: () => ipcRenderer.invoke("sync:trigger"),
    getStatus: () => ipcRenderer.invoke("sync:getStatus"),
    onCompleted: (callback: () => void) => {
      ipcRenderer.on("sync:completed", callback);
      return () => ipcRenderer.removeListener("sync:completed", callback);
    },
    onFailed: (callback: (error: { message: string }) => void) => {
      const handler = (_event: IpcRendererEvent, error: { message: string }) =>
        callback(error);
      ipcRenderer.on("sync:failed", handler);
      return () => ipcRenderer.removeListener("sync:failed", handler);
    },
    onStockConflict: (callback: (conflicts: { id: number; nameRu: string; stock: number }[]) => void) => {
      const handler = (_event: IpcRendererEvent, conflicts: { id: number; nameRu: string; stock: number }[]) =>
        callback(conflicts);
      ipcRenderer.on("sync:stockConflict", handler);
      return () => ipcRenderer.removeListener("sync:stockConflict", handler);
    },
  },

  // Printer
  printer: {
    printReceipt: (saleId: string) =>
      ipcRenderer.invoke("printer:printReceipt", saleId),
    testPrint: () => ipcRenderer.invoke("printer:testPrint"),
    getAvailablePrinters: () => ipcRenderer.invoke("printer:getAvailable"),
    printPriceTags: (html: string, widthMm: number, heightMm: number) =>
      ipcRenderer.invoke("printer:printPriceTags", html, widthMm, heightMm),
    printWeightedLabel: (data: unknown) =>
      ipcRenderer.invoke("printer:printWeightedLabel", data),
    printPriceTagsTSPL: (req: unknown) =>
      ipcRenderer.invoke("printer:printPriceTagsTSPL", req),
    openCashDrawer: () => ipcRenderer.invoke("printer:openCashDrawer"),
    testOpenCashDrawer: () => ipcRenderer.invoke("printer:testOpenCashDrawer"),
  },

  // Pre-weighed items
  weighedItems: {
    create: (data: unknown) => ipcRenderer.invoke("weighedItems:create", data),
    findByBarcode: (barcode: string) =>
      ipcRenderer.invoke("weighedItems:findByBarcode", barcode),
    markAsSold: (id: string, saleId?: string) =>
      ipcRenderer.invoke("weighedItems:markAsSold", id, saleId),
    getAvailable: (productId: number) =>
      ipcRenderer.invoke("weighedItems:getAvailable", productId),
    getAll: (filters?: unknown) =>
      ipcRenderer.invoke("weighedItems:getAll", filters),
    delete: (id: string) => ipcRenderer.invoke("weighedItems:delete", id),
  },

  // Label Scale (Rongta RLS)
  scale: {
    testConnection: () => ipcRenderer.invoke("scale:testConnection"),
    syncProduct: (productId: number) =>
      ipcRenderer.invoke("scale:syncProduct", productId),
    syncAll: () => ipcRenderer.invoke("scale:syncAll"),
    updateConfig: (ip: string, port: number) =>
      ipcRenderer.invoke("scale:updateConfig", ip, port),
    getConfig: () => ipcRenderer.invoke("scale:getConfig"),
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke("settings:get", key),
    set: (key: string, value: string) =>
      ipcRenderer.invoke("settings:set", key, value),
    getAll: () => ipcRenderer.invoke("settings:getAll"),
  },

  // Receipt scanning
  receipt: {
    scan: (imageBase64: string, mimeType: string) =>
      ipcRenderer.invoke("receipt:scan", imageBase64, mimeType),
    matchProducts: (items: { name: string; mxik?: string | null }[]) =>
      ipcRenderer.invoke("receipt:matchProducts", items),
    getPlan: () => ipcRenderer.invoke("receipt:getPlan"),
    getScanUsage: () => ipcRenderer.invoke("receipt:getScanUsage"),
  },

  // Analytics
  analytics: {
    getData: (filters: { startDate: string; endDate: string; terminalId?: string }) =>
      ipcRenderer.invoke("analytics:getData", filters),
  },

  // Terminals
  terminals: {
    getKnown: () => ipcRenderer.invoke("terminals:getKnown"),
    getStatus: () => ipcRenderer.invoke("terminals:getStatus"),
  },

  // App info
  app: {
    getVersion: () => ipcRenderer.invoke("app:getVersion"),
    getTerminalId: () => ipcRenderer.invoke("app:getTerminalId"),
    getStoreInfo: () => ipcRenderer.invoke("app:getStoreInfo"),
    quit: () => ipcRenderer.invoke("app:quit"),
    onCloseRequested: (callback: () => void) => {
      ipcRenderer.on("app:close-requested", callback);
      return () => ipcRenderer.removeListener("app:close-requested", callback);
    },
    confirmClose: () => ipcRenderer.send("app:confirm-close"),
  },

  // Local config (VPS connection settings)
  config: {
    getLocalConfig: () => ipcRenderer.invoke("config:getLocalConfig"),
    updateLocalConfig: (data: {
      storeId?: string;
      apiUrl?: string;
      storeName?: string;
      terminalId?: string;
    }) => ipcRenderer.invoke("config:updateLocalConfig", data),
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
        changePassword: (
          currentPassword: string,
          newPassword: string,
        ) => Promise<boolean>;
      };
      products: {
        getAll: (filters?: unknown) => Promise<unknown[]>;
        getById: (id: string) => Promise<unknown>;
        getByBarcode: (barcode: string) => Promise<unknown>;
        findByInternalCode: (internalCode: string) => Promise<unknown>;
        getNextInternalCode: () => Promise<string>;
        create: (data: unknown) => Promise<unknown>;
        update: (id: string, data: unknown) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
        search: (query: string) => Promise<unknown[]>;
        getTopSelling: (limit?: number) => Promise<unknown[]>;
        getAnalytics: (
          productId: number,
          startDate?: string,
          endDate?: string,
        ) => Promise<unknown>;
      };
      sales: {
        create: (data: unknown) => Promise<unknown>;
        update: (id: string, data: unknown) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
        getAll: (filters?: { startDate?: string; endDate?: string; terminalId?: string }) => Promise<unknown[]>;
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
        onFailed: (
          callback: (error: { message: string }) => void,
        ) => () => void;
        onStockConflict: (
          callback: (conflicts: { id: number; nameRu: string; stock: number }[]) => void,
        ) => () => void;
      };
      printer: {
        printReceipt: (saleId: string) => Promise<boolean>;
        testPrint: () => Promise<boolean>;
        getAvailablePrinters: () => Promise<string[]>;
        printPriceTags: (
          html: string,
          widthMm: number,
          heightMm: number,
        ) => Promise<boolean>;
        printWeightedLabel: (data: unknown) => Promise<boolean>;
        printPriceTagsTSPL: (req: unknown) => Promise<boolean>;
        openCashDrawer: () => Promise<void>;
        testOpenCashDrawer: () => Promise<boolean>;
      };
      weighedItems: {
        create: (data: unknown) => Promise<unknown>;
        findByBarcode: (barcode: string) => Promise<unknown>;
        markAsSold: (id: string, saleId?: string) => Promise<unknown>;
        getAvailable: (productId: number) => Promise<unknown[]>;
        getAll: (filters?: unknown) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
      };
      settings: {
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<void>;
        getAll: () => Promise<Record<string, string>>;
      };
      receipt: {
        scan: (imageBase64: string, mimeType: string) => Promise<unknown>;
        matchProducts: (
          items: { name: string; mxik?: string | null }[],
        ) => Promise<unknown[]>;
        getPlan: () => Promise<{ plan: string; balance_uzs: number | null }>;
        getScanUsage: () => Promise<{ balance_uzs: number | null }>;
      };
      analytics: {
        getData: (filters: {
          startDate: string;
          endDate: string;
          terminalId?: string;
        }) => Promise<unknown>;
      };
      terminals: {
        getKnown: () => Promise<string[]>;
        getStatus: () => Promise<{ terminalId: string; lastSyncAt: string; unsyncedCount: number }[]>;
      };
      app: {
        getVersion: () => Promise<string>;
        getTerminalId: () => Promise<string>;
        getStoreInfo: () => Promise<{ storeId: string; storeName: string }>;
        quit: () => Promise<void>;
        onCloseRequested: (callback: () => void) => () => void;
        confirmClose: () => void;
      };
      config: {
        getLocalConfig: () => Promise<{
          storeId: string;
          apiUrl: string;
          storeName: string;
          terminalId: string;
        } | null>;
        updateLocalConfig: (data: {
          storeId?: string;
          apiUrl?: string;
          storeName?: string;
          terminalId?: string;
        }) => Promise<unknown>;
      };
    };
  }
}
