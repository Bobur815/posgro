// Sync intervals in milliseconds
export const SYNC_INTERVALS = {
  DEFAULT: 5 * 60 * 1000, // 5 minutes
  FAST: 1 * 60 * 1000, // 1 minute
  SLOW: 15 * 60 * 1000, // 15 minutes
  MANUAL: 0, // Manual sync only
} as const;

export type SyncInterval = (typeof SYNC_INTERVALS)[keyof typeof SYNC_INTERVALS];

// Retry configuration
export const SYNC_RETRY = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY: 1000, // 1 second
  MAX_DELAY: 30000, // 30 seconds
  BACKOFF_MULTIPLIER: 2,
} as const;

// Sync status
export const SYNC_STATUS = {
  IDLE: 'IDLE',
  SYNCING: 'SYNCING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  OFFLINE: 'OFFLINE',
} as const;

export type SyncStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS];

// Batch sizes for sync operations
export const SYNC_BATCH_SIZE = {
  SALES: 50,
  PRODUCTS: 100,
} as const;

// Timeout for sync requests
export const SYNC_TIMEOUT = 30000; // 30 seconds
