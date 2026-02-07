import { create } from 'zustand';

export interface CartItem {
  productId: number;
  productName: string;
  barcode: string;
  unitPrice: number;
  quantity: number;
  stock: number;
}

interface CartState {
  items: CartItem[];
  subtotal: number;
  taxRate: number;
  tax: number;
  discount: number;
  total: number;
  itemCount: number;
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  setDiscount: (discount: number) => void;
  setTaxRate: (rate: number) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  subtotal: 0,
  taxRate: 0, // Default 0%, can be configured
  tax: 0,
  discount: 0,
  total: 0,
  itemCount: 0,

  addItem: (item) => {
    const { items, taxRate, discount } = get();
    const existingIndex = items.findIndex((i) => i.productId === item.productId);

    let newItems: CartItem[];

    if (existingIndex >= 0) {
      // Increase quantity of existing item
      newItems = items.map((i, index) => {
        if (index === existingIndex) {
          const newQuantity = Math.min(i.quantity + (item.quantity || 1), i.stock);
          return { ...i, quantity: newQuantity };
        }
        return i;
      });
    } else {
      // Add new item
      newItems = [...items, { ...item, quantity: item.quantity || 1 }];
    }

    const totals = calculateTotals(newItems, taxRate, discount);
    set({ items: newItems, ...totals });
  },

  removeItem: (productId) => {
    const { items, taxRate, discount } = get();
    const newItems = items.filter((i) => i.productId !== productId);
    const totals = calculateTotals(newItems, taxRate, discount);
    set({ items: newItems, ...totals });
  },

  updateQuantity: (productId, quantity) => {
    const { items, taxRate, discount } = get();

    if (quantity <= 0) {
      // Remove item if quantity is 0 or less
      const newItems = items.filter((i) => i.productId !== productId);
      const totals = calculateTotals(newItems, taxRate, discount);
      set({ items: newItems, ...totals });
      return;
    }

    const newItems = items.map((i) => {
      if (i.productId === productId) {
        const newQuantity = Math.min(quantity, i.stock);
        return { ...i, quantity: newQuantity };
      }
      return i;
    });

    const totals = calculateTotals(newItems, taxRate, discount);
    set({ items: newItems, ...totals });
  },

  setDiscount: (discount) => {
    const { items, taxRate } = get();
    const totals = calculateTotals(items, taxRate, discount);
    set({ discount, ...totals });
  },

  setTaxRate: (taxRate) => {
    const { items, discount } = get();
    const totals = calculateTotals(items, taxRate, discount);
    set({ taxRate, ...totals });
  },

  clearCart: () => {
    set({ items: [], subtotal: 0, tax: 0, discount: 0, total: 0, itemCount: 0 });
  },
}));

function calculateTotals(items: CartItem[], taxRate: number, discount: number) {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const tax = subtotal * (taxRate / 100);
  const total = Math.max(0, subtotal + tax - discount);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return { subtotal, tax, total, itemCount };
}
