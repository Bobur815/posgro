import { useState, useCallback } from 'react';
import type { Smena, SmenaMovement, SmenaStats } from '@shared/types/smena.types';

export type { Smena, SmenaMovement, SmenaStats };

export function useSmena() {
  const [currentSmena, setCurrentSmena] = useState<(Smena & { stats?: SmenaStats; movements?: SmenaMovement[] }) | null>(null);
  const [history, setHistory] = useState<(Smena & { stats?: SmenaStats })[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCurrent = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await window.electronAPI.smena.getCurrent();
      setCurrentSmena(data as (Smena & { stats?: SmenaStats; movements?: SmenaMovement[] }) | null);
      return data as (Smena & { stats?: SmenaStats; movements?: SmenaMovement[] }) | null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load smena');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openSmena = useCallback(async (initialCash: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const smena = await window.electronAPI.smena.open({ initialCash });
      await loadCurrent();
      return smena;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open smena';
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [loadCurrent]);

  const closeSmena = useCallback(async (smenaId: string, finalCash: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.smena.close({ smenaId, finalCash });
      setCurrentSmena(null);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to close smena';
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addMovement = useCallback(async (
    smenaId: string,
    type: 'PAY_IN' | 'PAY_OUT',
    amount: number,
    note?: string
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const movement = await window.electronAPI.smena.addMovement({ smenaId, type, amount, note });
      await loadCurrent();
      return movement;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add movement';
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [loadCurrent]);

  const loadHistory = useCallback(async (limit?: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await window.electronAPI.smena.getHistory({ limit });
      setHistory(data as (Smena & { stats?: SmenaStats })[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const printXReport = useCallback(async (smenaId: string) => {
    try {
      await window.electronAPI.smena.printXReport(smenaId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to print X-report';
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  const printZReport = useCallback(async (smenaId: string) => {
    try {
      await window.electronAPI.smena.printZReport(smenaId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to print Z-report';
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  return {
    currentSmena,
    history,
    isLoading,
    error,
    loadCurrent,
    openSmena,
    closeSmena,
    addMovement,
    loadHistory,
    printXReport,
    printZReport,
  };
}
