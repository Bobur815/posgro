export const PAYMENT_METHODS = {
  CASH: 'CASH',
  CARD: 'CARD',
  MIXED: 'MIXED',
} as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const PAYMENT_METHOD_LABELS = {
  ru: {
    CASH: 'Наличные',
    CARD: 'Карта',
    MIXED: 'Смешанная оплата',
  },
  uz: {
    CASH: 'Naqd pul',
    CARD: 'Karta',
    MIXED: 'Aralash to\'lov',
  },
} as const;

export const getPaymentMethodLabel = (
  method: PaymentMethod,
  locale: 'ru' | 'uz' = 'ru',
): string => {
  return PAYMENT_METHOD_LABELS[locale][method] || method;
};
