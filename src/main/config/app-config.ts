interface AppConfig {
  // Store identification (for multi-tenant)
  storeId: string;
  storeName: string;

  // Terminal identification
  terminalId: string;

  // VPS API connection
  vpsApiUrl: string;

  // Sync settings
  syncIntervalMs: number;
  retryIntervalMs: number;

  // JWT Secret (for local token generation)
  jwtSecret: string;

  // Printer settings
  printerName: string;
  printerType: 'thermal' | 'standard';

  // Debug mode
  debug: boolean;
}

let config: AppConfig | null = null;

export function getAppConfig(): AppConfig {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

function loadConfig(): AppConfig {
  return {
    // Store identification (for multi-tenant)
    storeId: process.env.STORE_ID || 'default-store',
    storeName: process.env.STORE_NAME || 'Grocery Store',

    // Terminal identification
    terminalId: process.env.TERMINAL_ID || 'TERMINAL_01',

    // VPS API connection
    vpsApiUrl: process.env.VPS_API_URL || 'http://localhost:3000/api',

    // Sync settings (default: 5 minutes)
    syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || '300000', 10),
    retryIntervalMs: parseInt(process.env.RETRY_INTERVAL_MS || '60000', 10),

    // JWT Secret
    jwtSecret: process.env.JWT_SECRET || 'local-development-secret-key-32chars',

    // Printer settings
    printerName: process.env.PRINTER_NAME || '',
    printerType: (process.env.PRINTER_TYPE as 'thermal' | 'standard') || 'thermal',

    // Debug mode
    debug: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development',
  };
}

export function updateConfig(updates: Partial<AppConfig>): void {
  config = {
    ...getAppConfig(),
    ...updates,
  };
}

export function resetConfig(): void {
  config = null;
}

// Environment validation
export function validateEnvironment(): string[] {
  const errors: string[] = [];

  if (!process.env.TERMINAL_ID) {
    errors.push('TERMINAL_ID is not set');
  }

  if (!process.env.VPS_API_URL) {
    errors.push('VPS_API_URL is not set (using default: http://localhost:3000/api)');
  }

  return errors;
}
