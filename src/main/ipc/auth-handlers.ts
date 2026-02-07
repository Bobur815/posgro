import { ipcMain } from 'electron';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { getPrismaClient } from '../database/sqlite-client';
import { setAuthToken, clearAuthToken } from '../sync/queue-manager';
import { getAppConfig } from '../config/app-config';

interface JwtPayload {
  sub: string;
  phone: string;
  role: string;
  iat: number;
  exp: number;
}

let currentUser: {
  id: string;
  phone: string;
  role: string;
  nameUz: string;
  nameRu: string;
} | null = null;

export function setupAuthHandlers(): void {
  ipcMain.handle('auth:login', async (_event, phone: string, password: string) => {
    const prisma = getPrismaClient();
    const config = getAppConfig();

    // Find user in local database
    const user = await prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.active) {
      throw new Error('User account is deactivated');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid password');
    }

    // Generate JWT token (for local use and sync)
    const token = jwt.sign(
      {
        sub: user.id,
        phone: user.phone,
        role: user.role,
      },
      config.jwtSecret || 'local-secret-key',
      {
        expiresIn: '8h',
      }
    );

    // Store token for sync operations
    await setAuthToken(token);

    // Set current user
    currentUser = {
      id: user.id,
      phone: user.phone,
      role: user.role,
      nameUz: user.nameUz,
      nameRu: user.nameRu,
    };

    // Log login
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        phone: user.phone,
        action: 'login',
        entity: 'user',
        entityId: user.id,
        details: JSON.stringify({ terminalId: config.terminalId }),
      },
    });

    return {
      token,
      user: currentUser,
    };
  });

  ipcMain.handle('auth:loginWithPin', async (_event, pin: string) => {
    const prisma = getPrismaClient();
    const config = getAppConfig();

    // Get store config with PIN
    const localConfig = await prisma.localConfig.findUnique({
      where: { id: 'config' },
    });

    if (!localConfig || !localConfig.storePin) {
      throw new Error('Store PIN not configured');
    }

    // Verify PIN
    const isPinValid = await bcrypt.compare(pin, localConfig.storePin);
    if (!isPinValid) {
      throw new Error('Invalid PIN');
    }

    // Find default cashier (first active USER)
    const cashier = await prisma.user.findFirst({
      where: {
        role: 'USER',
        active: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!cashier) {
      throw new Error('No cashier account found');
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        sub: cashier.id,
        phone: cashier.phone,
        role: cashier.role,
      },
      config.jwtSecret || 'local-secret-key',
      {
        expiresIn: '8h',
      }
    );

    // Store token for sync operations
    await setAuthToken(token);

    // Set current user
    currentUser = {
      id: cashier.id,
      phone: cashier.phone,
      role: cashier.role,
      nameUz: cashier.nameUz,
      nameRu: cashier.nameRu,
    };

    // Log login
    await prisma.auditLog.create({
      data: {
        userId: cashier.id,
        phone: cashier.phone,
        action: 'pin_login',
        entity: 'user',
        entityId: cashier.id,
        details: JSON.stringify({ terminalId: config.terminalId }),
      },
    });

    return {
      token,
      user: currentUser,
    };
  });

  ipcMain.handle('auth:logout', async () => {
    const prisma = getPrismaClient();
    const config = getAppConfig();

    if (currentUser) {
      // Log logout
      await prisma.auditLog.create({
        data: {
          userId: currentUser.id,
          phone: currentUser.phone,
          action: 'logout',
          entity: 'user',
          entityId: currentUser.id,
          details: JSON.stringify({ terminalId: config.terminalId }),
        },
      });
    }

    // Clear token and user
    await clearAuthToken();
    currentUser = null;
  });

  ipcMain.handle('auth:getProfile', async () => {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    return currentUser;
  });

  // Restore session from stored token (called on app start)
  ipcMain.handle('auth:restoreSession', async (_event, token: string) => {
    if (!token) {
      return null;
    }

    const config = getAppConfig();

    try {
      // Verify the token
      const decoded = jwt.verify(token, config.jwtSecret || 'local-secret-key') as JwtPayload;

      // Get user from database
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      if (!user || !user.active) {
        return null;
      }

      // Restore current user
      currentUser = {
        id: user.id,
        phone: user.phone,
        role: user.role,
        nameUz: user.nameUz,
        nameRu: user.nameRu,
      };

      // Restore token for sync
      await setAuthToken(token);

      return currentUser;
    } catch (err) {
      // Token invalid or expired
      console.log('Session restore failed:', err);
      return null;
    }
  });

  // Users management (Admin only)
  ipcMain.handle('users:getAll', async () => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      throw new Error('Unauthorized');
    }

    const prisma = getPrismaClient();
    return prisma.user.findMany({
      select: {
        id: true,
        phone: true,
        role: true,
        nameUz: true,
        nameRu: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  ipcMain.handle('users:create', async (_event, data) => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      throw new Error('Unauthorized');
    }

    const prisma = getPrismaClient();

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        phone: data.phone,
        password: hashedPassword,
        role: data.role || 'USER',
        nameUz: data.nameUz,
        nameRu: data.nameRu,
        active: true,
      },
      select: {
        id: true,
        phone: true,
        role: true,
        nameUz: true,
        nameRu: true,
        active: true,
      },
    });

    // Log action
    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        phone: currentUser.phone,
        action: 'create_user',
        entity: 'user',
        entityId: user.id,
        details: JSON.stringify({ phone: user.phone }),
      },
    });

    return user;
  });

  ipcMain.handle('users:update', async (_event, id: string, data) => {
    if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.id !== id)) {
      throw new Error('Unauthorized');
    }

    const prisma = getPrismaClient();
    const updateData: Record<string, unknown> = {};

    if (data.nameUz) updateData.nameUz = data.nameUz;
    if (data.nameRu) updateData.nameRu = data.nameRu;
    if (data.active !== undefined && currentUser.role === 'ADMIN') {
      updateData.active = data.active;
    }
    if (data.role && currentUser.role === 'ADMIN') {
      updateData.role = data.role;
    }
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        phone: true,
        role: true,
        nameUz: true,
        nameRu: true,
        active: true,
      },
    });

    return user;
  });

  ipcMain.handle('users:delete', async (_event, id: string) => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      throw new Error('Unauthorized');
    }

    if (currentUser.id === id) {
      throw new Error('Cannot delete your own account');
    }

    const prisma = getPrismaClient();

    // Soft delete (deactivate)
    await prisma.user.update({
      where: { id },
      data: { active: false },
    });

    // Log action
    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        phone: currentUser.phone,
        action: 'delete_user',
        entity: 'user',
        entityId: id,
      },
    });

    return true;
  });
}

export function getCurrentUser() {
  return currentUser;
}
