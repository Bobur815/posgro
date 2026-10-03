import { useState, useCallback } from 'react';
import { sales as salesApi, debtors as debtorsApi, type DashboardDebtPayment } from '../api/client';

interface Summary {
  date: string;
  totalSales: number;
  totalRevenue: number;
  totalItems: number;
  cashSales: number;
  cardSales: number;
  averageTransaction: number;
}

export function useSales() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [debtPayments, setDebtPayments] = useState<DashboardDebtPayment[]>([]);

  const getTodaySummary = useCallback(async (): Promise<Summary | null> => {
    setIsLoading(true);

    try {
      const summary = await salesApi.getTodaySummary();
      return summary as Summary;
    } catch (err) {
      console.error('Failed to get summary:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSales = useCallback(async (filters?: { startDate?: string; endDate?: string }) => {
    setIsLoading(true);
    setError(null);

    try {
      const [data, payments] = await Promise.all([
        salesApi.getAll(filters),
        // Only feeds the summary cards: a server without the endpoint yet, or a cashier who may
        // not read it, still gets the receipts list.
        debtorsApi.payments(filters ?? {}).catch((): DashboardDebtPayment[] => []),
      ]);
      setSales(data);
      setDebtPayments(payments);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales');
      setSales([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteSale = useCallback(async (id: string) => {
    try {
      await salesApi.delete(id);
      setSales((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to delete sale:', err);
    }
  }, []);

  return {
    isLoading,
    error,
    sales,
    debtPayments,
    getTodaySummary,
    loadSales,
    deleteSale,
  };
}
