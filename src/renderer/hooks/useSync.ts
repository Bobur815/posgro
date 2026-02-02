import { useState, useEffect, useCallback } from 'react';

interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastError: string | null;
}

export function useSync() {
  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    lastError: null,
  });

  useEffect(() => {
    // Load initial status
    loadStatus();

    // Listen for sync events
    const unsubscribeCompleted = window.electronAPI.sync.onCompleted(() => {
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: new Date().toISOString(),
        lastError: null,
      }));
    });

    const unsubscribeFailed = window.electronAPI.sync.onFailed((error) => {
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastError: error.message,
      }));
    });

    return () => {
      unsubscribeCompleted();
      unsubscribeFailed();
    };
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await window.electronAPI.sync.getStatus();
      setStatus(data as SyncStatus);
    } catch (err) {
      console.error('Failed to load sync status:', err);
    }
  }, []);

  const triggerSync = useCallback(async () => {
    setStatus((prev) => ({ ...prev, isSyncing: true }));

    try {
      await window.electronAPI.sync.trigger();
    } catch (err) {
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastError: err instanceof Error ? err.message : 'Sync failed',
      }));
    }
  }, []);

  return {
    status,
    triggerSync,
    refreshStatus: loadStatus,
  };
}
