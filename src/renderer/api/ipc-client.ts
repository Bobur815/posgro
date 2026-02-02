// IPC Client wrapper for Electron communication
// Provides typed wrappers around window.electronAPI

// Re-export the electronAPI for easy access
export const ipc = typeof window !== 'undefined' ? window.electronAPI : null;

// Type-safe helper functions
export const auth = {
  login: (username: string, password: string) =>
    ipc?.auth.login(username, password),
  logout: () => ipc?.auth.logout(),
  getProfile: () => ipc?.auth.getProfile(),
};

export const products = {
  getAll: (filters?: { categoryId?: string; active?: boolean }) =>
    ipc?.products.getAll(filters),
  getById: (id: string) => ipc?.products.getById(id),
  getByBarcode: (barcode: string) => ipc?.products.getByBarcode(barcode),
  create: (data: unknown) => ipc?.products.create(data),
  update: (id: string, data: unknown) => ipc?.products.update(id, data),
  delete: (id: string) => ipc?.products.delete(id),
  search: (query: string) => ipc?.products.search(query),
};

export const sales = {
  create: (data: unknown) => ipc?.sales.create(data),
  getAll: (filters?: { startDate?: string; endDate?: string }) =>
    ipc?.sales.getAll(filters),
  getById: (id: string) => ipc?.sales.getById(id),
  getTodaySummary: () => ipc?.sales.getTodaySummary(),
};

export const users = {
  getAll: () => ipc?.users.getAll(),
  create: (data: unknown) => ipc?.users.create(data),
  update: (id: string, data: unknown) => ipc?.users.update(id, data),
  delete: (id: string) => ipc?.users.delete(id),
};

export const categories = {
  getAll: () => ipc?.categories.getAll(),
  create: (data: unknown) => ipc?.categories.create(data),
  update: (id: string, data: unknown) => ipc?.categories.update(id, data),
};

export const inventory = {
  createArrival: (data: unknown) => ipc?.inventory.createArrival(data),
  getArrivals: (filters?: { productId?: string }) =>
    ipc?.inventory.getArrivals(filters),
  getLowStock: () => ipc?.inventory.getLowStock(),
};

export const sync = {
  trigger: () => ipc?.sync.trigger(),
  getStatus: () => ipc?.sync.getStatus(),
  onCompleted: (callback: () => void) => ipc?.sync.onCompleted(callback),
  onFailed: (callback: (error: { message: string }) => void) =>
    ipc?.sync.onFailed(callback),
};

export const printer = {
  printReceipt: (saleId: string) => ipc?.printer.printReceipt(saleId),
  testPrint: () => ipc?.printer.testPrint(),
  getAvailablePrinters: () => ipc?.printer.getAvailablePrinters(),
};

export const settings = {
  get: (key: string) => ipc?.settings.get(key),
  set: (key: string, value: string) => ipc?.settings.set(key, value),
  getAll: () => ipc?.settings.getAll(),
};

export const app = {
  getVersion: () => ipc?.app.getVersion(),
  getTerminalId: () => ipc?.app.getTerminalId(),
  quit: () => ipc?.app.quit(),
};
