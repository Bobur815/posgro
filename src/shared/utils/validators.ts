// Email validation
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Barcode validation (EAN-13 or custom format)
export const isValidBarcode = (barcode: string): boolean => {
  // Accept numeric barcodes of 8-13 digits or alphanumeric codes
  const numericRegex = /^\d{8,13}$/;
  const alphanumericRegex = /^[A-Za-z0-9-]{4,20}$/;
  return numericRegex.test(barcode) || alphanumericRegex.test(barcode);
};

// Password validation (minimum 6 characters)
export const isValidPassword = (password: string): boolean => {
  return password.length >= 6;
};

// Price validation (positive number)
export const isValidPrice = (price: number): boolean => {
  return typeof price === 'number' && price >= 0 && isFinite(price);
};

// Quantity validation (positive number)
export const isValidQuantity = (quantity: number): boolean => {
  return typeof quantity === 'number' && quantity > 0 && isFinite(quantity);
};

// Stock validation (non-negative integer)
export const isValidStock = (stock: number): boolean => {
  return Number.isInteger(stock) && stock >= 0;
};

// UUID validation
export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Date string validation (YYYY-MM-DD)
export const isValidDateString = (dateString: string): boolean => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

// Phone number validation (basic)
export const isValidPhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^\+?[\d\s-]{9,15}$/;
  return phoneRegex.test(phone);
};

// Validate payment amount
export const isValidPaymentAmount = (
  paidAmount: number,
  totalAmount: number,
): boolean => {
  return isValidPrice(paidAmount) && paidAmount >= totalAmount;
};

// Validate discount
export const isValidDiscount = (
  discount: number,
  discountType: 'PERCENTAGE' | 'FIXED',
  subtotal: number,
): boolean => {
  if (discount < 0) return false;
  if (discountType === 'PERCENTAGE') {
    return discount >= 0 && discount <= 100;
  }
  return discount <= subtotal;
};
