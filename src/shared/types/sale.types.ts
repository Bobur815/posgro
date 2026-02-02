export type PaymentMethod = 'CASH' | 'CARD' | 'MIXED';

export interface Sale {
  id: string;
  receiptNumber: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  discountType: 'PERCENTAGE' | 'FIXED';
  finalAmount: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  cardAmount?: number;
  cashierId: string;
  cashierName: string;
  terminalId: string;
  isSynced: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  createdAt: Date;
}

export interface CartItem {
  productId: string;
  barcode: string;
  name: string;
  price: number;
  quantity: number;
  discount: number;
  subtotal: number;
  unit: string;
  maxStock: number;
}

export interface SaleCreateInput {
  items: SaleItemInput[];
  discount?: number;
  discountType?: 'PERCENTAGE' | 'FIXED';
  paymentMethod: PaymentMethod;
  paidAmount: number;
  cashAmount?: number;
  cardAmount?: number;
}

export interface SaleItemInput {
  productId: string;
  quantity: number;
  discount?: number;
}

export interface SaleSyncData {
  id: string;
  receiptNumber: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  discountType: 'PERCENTAGE' | 'FIXED';
  finalAmount: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  cardAmount?: number;
  cashierId: string;
  cashierName: string;
  terminalId: string;
  createdAt: string;
}

export interface DailySummary {
  date: string;
  totalSales: number;
  totalRevenue: number;
  transactionCount: number;
  averageTransaction: number;
}
