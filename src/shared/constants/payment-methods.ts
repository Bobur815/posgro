// ==================== SALE PAYMENT METHODS ====================
// Used for POS checkout (CASH, CARD, MIXED)

export const PAYMENT_METHODS = {
  CASH: "CASH",
  CARD: "CARD",
  MIXED: "MIXED",
} as const;

export type PaymentMethod =
  (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const PAYMENT_METHOD_LABELS = {
  ru: {
    CASH: "Наличные",
    CARD: "Карта",
    MIXED: "Смешанная оплата",
  },
  uz: {
    CASH: "Naqd pul",
    CARD: "Karta",
    MIXED: "Aralash to'lov",
  },
} as const;

export const getPaymentMethodLabel = (
  method: PaymentMethod,
  locale: "ru" | "uz" = "ru",
): string => {
  return PAYMENT_METHOD_LABELS[locale][method] || method;
};

// ==================== SUPPLIER PAYMENT METHODS ====================
// Used for supplier transactions (arrivals, payments, etc.)

export const SUPPLIER_PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "INSTALLMENT",
] as const;

export type SupplierPaymentMethod = (typeof SUPPLIER_PAYMENT_METHODS)[number];

/** Maps each SupplierPaymentMethod value to its i18n translation key */
export const SUPPLIER_PAYMENT_METHOD_I18N_KEYS: Record<
  SupplierPaymentMethod,
  string
> = {
  CASH: "suppliers.cash",
  CARD: "suppliers.card",
  BANK_TRANSFER: "suppliers.bankTransfer",
  INSTALLMENT: "suppliers.installment",
} as const;
