export interface ScannedReceiptItem {
  scannedName: string;
  mxik?: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface ScannedReceiptData {
  supplierName?: string;
  receiptDate?: string;
  items: ScannedReceiptItem[];
  tier?: 'free' | 'paid';
  cost_usd?: number;
  charged_uzs?: number;
  balance_uzs?: number;
}

export interface ProductMatch {
  scannedName: string;
  matchedProductId: string | null;
  matchedProductNameRu: string | null;
  matchedProductNameUz: string | null;
  confidence: 'exact' | 'high' | 'medium' | 'low' | 'none';
}

export interface ReceiptLineItem {
  scannedName: string;
  productId: string;
  quantity: number;
  unitCost: number;
  confidence: 'high' | 'medium' | 'low' | 'none';
}
