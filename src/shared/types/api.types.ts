import { DiscountType } from "./sale.types";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SyncRequest {
  storeId: string;
  terminalId: string;
  sales: SaleSyncPayload[];
  lastSyncTime: string;
}

export interface SaleSyncPayload {
  id: string;
  storeId: string;
  receiptNumber: string;
  items: SaleItemSyncPayload[];
  subtotal: number;
  discount: number;
  discountType: DiscountType;
  finalAmount: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: string;
  cashAmount?: number;
  cardAmount?: number;
  cashierId: string;
  cashierName: string;
  terminalId: string;
  createdAt: string;
}

export interface SaleItemSyncPayload {
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
}

export interface SyncResponse {
  success: boolean;
  syncedCount: number;
  products: ProductSyncData[];
  lastSyncTime: string;
}

export interface ProductSyncData {
  id: string;
  storeId: string;
  barcode: string;
  nameRu: string;
  nameUz: string;
  price: number;
  stock: number;
  unit: string;
  categoryId?: string;
  isActive: boolean;
  updatedAt: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  timestamp: string;
  path: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  version: string;
}
