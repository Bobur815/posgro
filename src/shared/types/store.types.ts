export interface Store {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  settings: StoreSettings | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreSettings {
  taxRate?: number;
  receiptHeader?: string;
  receiptFooter?: string;
  currency?: string;
  logoUrl?: string;
}

export interface StoreCreateInput {
  name: string;
  address?: string;
  phone?: string;
  settings?: StoreSettings;
}

export interface StoreUpdateInput {
  name?: string;
  address?: string;
  phone?: string;
  active?: boolean;
  settings?: StoreSettings;
}

export interface StoreWithStats extends Store {
  usersCount: number;
  productsCount: number;
  salesCount: number;
  totalRevenue: number;
}
