// Format currency (Uzbek Som)
export const formatCurrency = (
  amount: number | null | undefined,
  locale: 'ru' | 'uz' = 'ru',
): string => {
  const value = amount ?? 0;
  const formatted = value.toLocaleString(locale === 'ru' ? 'ru-RU' : 'uz-UZ');
  return locale === 'ru' ? `${formatted} сум` : `${formatted} so'm`;
};
