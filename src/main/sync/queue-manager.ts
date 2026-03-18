import { safeStorage } from 'electron';

const TOKEN_KEY = 'auth_token';

// In-memory storage as fallback
let memoryToken: string | null = null;

/**
 * Store the authentication token securely
 */
export async function setAuthToken(token: string): Promise<void> {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      // Encrypt and store the token
      const encryptedToken = safeStorage.encryptString(token);
      // Store encrypted token (in production, use electron-store or similar)
      memoryToken = encryptedToken.toString('base64');
    } else {
      // Fallback to memory storage (less secure)
      memoryToken = token;
    }
    console.log('Auth token stored');
  } catch (error) {
    console.error('Failed to store auth token:', error);
    // Fallback to memory
    memoryToken = token;
  }
}

/**
 * Retrieve the authentication token
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    if (!memoryToken) {
      return null;
    }

    if (safeStorage.isEncryptionAvailable()) {
      // Decrypt the token
      const encryptedBuffer = Buffer.from(memoryToken, 'base64');
      return safeStorage.decryptString(encryptedBuffer);
    } else {
      return memoryToken;
    }
  } catch (error) {
    console.error('Failed to retrieve auth token:', error);
    return memoryToken;
  }
}

/**
 * Clear the authentication token
 */
export async function clearAuthToken(): Promise<void> {
  memoryToken = null;
  console.log('Auth token cleared');
}

/**
 * Check if a valid token exists
 */
export async function hasValidToken(): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) {
    return false;
  }

  // Optionally validate token structure (JWT)
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    // Check if token is expired
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const exp = payload.exp;
    if (exp && exp * 1000 < Date.now()) {
      await clearAuthToken();
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Server-issued token (obtained by logging in to the VPS server)
// Stored in memory only — must re-authenticate each app session
let serverToken: string | null = null;

export function setServerToken(token: string): void {
  serverToken = token;
}

export function getServerToken(): string | null {
  return serverToken;
}

export function clearServerToken(): void {
  serverToken = null;
}

/**
 * Queue for offline operations
 */
interface QueuedOperation {
  id: string;
  type: 'sale' | 'inventory';
  data: unknown;
  createdAt: Date;
  retryCount: number;
}

const operationQueue: QueuedOperation[] = [];

export function queueOperation(type: 'sale' | 'inventory', data: unknown): string {
  const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  operationQueue.push({
    id,
    type,
    data,
    createdAt: new Date(),
    retryCount: 0,
  });
  console.log(`Operation queued: ${id}`);
  return id;
}

export function getQueuedOperations(): QueuedOperation[] {
  return [...operationQueue];
}

export function removeFromQueue(id: string): void {
  const index = operationQueue.findIndex((op) => op.id === id);
  if (index !== -1) {
    operationQueue.splice(index, 1);
    console.log(`Operation removed from queue: ${id}`);
  }
}

export function incrementRetryCount(id: string): void {
  const operation = operationQueue.find((op) => op.id === id);
  if (operation) {
    operation.retryCount++;
  }
}

export function getQueueLength(): number {
  return operationQueue.length;
}
