// Format currency (Uzbek Som)
export const formatCurrency = (
  amount: number,
  locale: 'ru' | 'uz' = 'ru',
): string => {
  const formatted = amount.toLocaleString(locale === 'ru' ? 'ru-RU' : 'uz-UZ');
  return locale === 'ru' ? `${formatted} сум` : `${formatted} so'm`;
};
