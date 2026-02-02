export type ProductUnit = 'PCS' | 'KG' | 'L' | 'M';

export interface Product {
  id: string;
  barcode: string;
  nameRu: string;
  nameUz: string;
  descriptionRu?: string;
  descriptionUz?: string;
  price: number;
  costPrice?: number;
  unit: ProductUnit;
  stock: number;
  minStock: number;
  categoryId?: string;
  category?: Category;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  nameRu: string;
  nameUz: string;
  parentId?: string;
  parent?: Category;
  children?: Category[];
  products?: Product[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductCreateInput {
  barcode: string;
  nameRu: string;
  nameUz: string;
  descriptionRu?: string;
  descriptionUz?: string;
  price: number;
  costPrice?: number;
  unit?: ProductUnit;
  stock?: number;
  minStock?: number;
  categoryId?: string;
}

export interface ProductUpdateInput {
  barcode?: string;
  nameRu?: string;
  nameUz?: string;
  descriptionRu?: string;
  descriptionUz?: string;
  price?: number;
  costPrice?: number;
  unit?: ProductUnit;
  stock?: number;
  minStock?: number;
  categoryId?: string;
  isActive?: boolean;
}

export interface ProductSearchQuery {
  query?: string;
  categoryId?: string;
  isActive?: boolean;
  lowStock?: boolean;
  page?: number;
  limit?: number;
}

export interface LowStockProduct {
  id: string;
  barcode: string;
  nameRu: string;
  nameUz: string;
  stock: number;
  minStock: number;
  unit: ProductUnit;
}
