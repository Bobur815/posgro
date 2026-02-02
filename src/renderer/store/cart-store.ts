import { create } from 'zustand';

interface CartItem {
  productId: string;
  productName: string;
  barcode: string;
  unitPrice: number;
  quantity: number;
  stock: number;
}

interface CartState {
  items: CartItem[];
  total: number;
  itemCount: number;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  total: 0,
  itemCount: 0,

  addItem: (item) => {
    const { items } = get();
    const existingIndex = items.findIndex((i) => i.productId === item.productId);

    let newItems: CartItem[];

    if (existingIndex >= 0) {
      // Increase quantity of existing item
      newItems = items.map((i, index) => {
        if (index === existingIndex) {
          const newQuantity = Math.min(i.quantity + item.quantity, i.stock);
          return { ...i, quantity: newQuantity };
        }
        return i;
      });
    } else {
      // Add new item
      newItems = [...items, item];
    }

    const total = calculateTotal(newItems);
    const itemCount = newItems.reduce((sum, i) => sum + i.quantity, 0);

    set({ items: newItems, total, itemCount });
  },

  removeItem: (productId) => {
    const { items } = get();
    const newItems = items.filter((i) => i.productId !== productId);
    const total = calculateTotal(newItems);
    const itemCount = newItems.reduce((sum, i) => sum + i.quantity, 0);

    set({ items: newItems, total, itemCount });
  },

  updateQuantity: (productId, quantity) => {
    const { items } = get();

    if (quantity <= 0) {
      // Remove item if quantity is 0 or less
      const newItems = items.filter((i) => i.productId !== productId);
      const total = calculateTotal(newItems);
      const itemCount = newItems.reduce((sum, i) => sum + i.quantity, 0);
      set({ items: newItems, total, itemCount });
      return;
    }

    const newItems = items.map((i) => {
      if (i.productId === productId) {
        const newQuantity = Math.min(quantity, i.stock);
        return { ...i, quantity: newQuantity };
      }
      return i;
    });

    const total = calculateTotal(newItems);
    const itemCount = newItems.reduce((sum, i) => sum + i.quantity, 0);

    set({ items: newItems, total, itemCount });
  },

  clearCart: () => {
    set({ items: [], total: 0, itemCount: 0 });
  },
}));

function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}
