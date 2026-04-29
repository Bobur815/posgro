import { ipcMain } from 'electron';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { getPrismaClient } from '../database/sqlite-client';
import { setAuthToken, clearAuthToken, setServerToken, clearServerToken } from '../sync/queue-manager';
import { getAppConfig } from '../config/app-config';
import type { AuthUser } from '../../shared/types/user.types';

interface JwtPayload {
  sub: string;
  phone: string;
  role: string;
  iat: number;
  exp: number;
}

let currentUser: AuthUser | null = null;

export function setupAuthHandlers(): void {
  ipcMain.handle('auth:login', async (_event, phone: string, password: string) => {
    const prisma = getPrismaClient();
    const config = getAppConfig();

    // Use storeId from LocalConfig (authoritative) rather than env-based app-config
    const localConfig = await prisma.localConfig.findUnique({ where: { id: 'config' } });
    const storeId = localConfig?.storeId || config.storeId;
    const vpsApiUrl = localConfig?.apiUrl || config.vpsApiUrl;

    // Find user in local database
    let user = await prisma.user.findUnique({ where: { phone } });

    let serverTokenObtained = false;

    if (!user) {
      // User not in local DB — try VPS (covers new terminal setup or user only on server)
      let synced = false;
      try {
        const serverRes = await fetch(`${vpsApiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, phone, password }),
        });
        if (serverRes.ok) {
          const body = await serverRes.json() as { token: string; user: { id: string; phone: string; role: string; nameUz: string; nameRu: string } };
          setServerToken(body.token);
          serverTokenObtained = true;
          await prisma.systemSetting.upsert({
            where: { key: 'server_token' },
            update: { value: body.token },
            create: { key: 'server_token', value: body.token },
          });
          // Create user locally so offline logins work in future
          const hashedPassword = await bcrypt.hash(password, 10);
          user = await prisma.user.upsert({
            where: { phone },
            update: { password: hashedPassword, role: body.user.role, nameUz: body.user.nameUz, nameRu: body.user.nameRu, active: true },
            create: {
              id: body.user.id,
              phone: body.user.phone,
              password: hashedPassword,
              role: body.user.role,
              nameUz: body.user.nameUz,
              nameRu: body.user.nameRu,
              active: true,
            },
          });
          synced = true;
        }
      } catch {
        // VPS unreachable
      }
      if (!synced) {
        throw new Error('auth.errors.user_not_found');
      }
    }

    if (!user!.active) {
      throw new Error('auth.errors.user_deactivated');
    }

    // Verify password against local hash
    const isValidPassword = await bcrypt.compare(password, user!.password);

    if (!isValidPassword) {
      // Local hash may be stale (password changed on web) — try VPS as fallback
      let vpsAccepted = false;
      try {
        const serverRes = await fetch(`${vpsApiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, phone, password }),
        });
        if (serverRes.ok) {
          vpsAccepted = true;
          serverTokenObtained = true;
          const { token: sToken } = await serverRes.json() as { token: string };
          setServerToken(sToken);
          await prisma.systemSetting.upsert({
            where: { key: 'server_token' },
            update: { value: sToken },
            create: { key: 'server_token', value: sToken },
          });
          // Sync local hash so future offline logins use the new password
          const hashedPassword = await bcrypt.hash(password, 10);
          await prisma.user.update({ where: { phone }, data: { password: hashedPassword } });
        }
      } catch {
        // VPS unreachable — fall through to invalid_password
      }
      if (!vpsAccepted) {
        throw new Error('auth.errors.invalid_password');
      }
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

    // Login to VPS to get a server-issued token (skip if already obtained in fallback above)
    if (!serverTokenObtained) try {
      const serverRes = await fetch(`${vpsApiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, phone, password }),
      });
      if (serverRes.ok) {
        const { token: sToken } = await serverRes.json() as { token: string };
        setServerToken(sToken);
        await prisma.systemSetting.upsert({
          where: { key: 'server_token' },
          update: { value: sToken },
          create: { key: 'server_token', value: sToken },
        });
      } else {
        const text = await serverRes.text();
        console.warn(`VPS login failed (${serverRes.status}): ${text} — storeId: ${storeId}, phone: ${phone}`);
        const existingSetting = await prisma.systemSetting.findUnique({ where: { key: 'server_token' } });
        if (existingSetting?.value) {
          try {
            const parts = existingSetting.value.split('.');
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as { exp?: number };
            if (!payload.exp || payload.exp * 1000 > Date.now()) {
              setServerToken(existingSetting.value);
            }
          } catch {
            // Invalid token format — ignore
          }
        }
      }
    } catch (err) {
      console.warn('VPS login error (server unreachable):', err);
      const existingSetting = await prisma.systemSetting.findUnique({ where: { key: 'server_token' } });
      if (existingSetting?.value) {
        try {
          const parts = existingSetting.value.split('.');
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as { exp?: number };
          if (!payload.exp || payload.exp * 1000 > Date.now()) {
            setServerToken(existingSetting.value);
          }
        } catch {
          // Invalid token format — ignore
        }
      }
    }

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
      throw new Error('auth.errors.pin_not_configured');
    }

    // Verify PIN
    const isPinValid = await bcrypt.compare(pin, localConfig.storePin);
    if (!isPinValid) {
      throw new Error('auth.errors.invalid_pin');
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
      throw new Error('auth.errors.no_cashier_found');
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

    // Restore persisted server token (saved during last full login) so sync works
    const serverTokenSetting = await prisma.systemSetting.findUnique({ where: { key: 'server_token' } });
    if (serverTokenSetting?.value) {
      try {
        const parts = serverTokenSetting.value.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as { exp?: number };
        if (!payload.exp || payload.exp * 1000 > Date.now()) {
          setServerToken(serverTokenSetting.value);
        }
      } catch {
        // Invalid token — ignore
      }
    }

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

    // Clear tokens and user
    await clearAuthToken();
    clearServerToken();
    await prisma.systemSetting.deleteMany({ where: { key: 'server_token' } });
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

      // Restore server token if persisted and not expired
      const serverTokenSetting = await prisma.systemSetting.findUnique({ where: { key: 'server_token' } });
      if (serverTokenSetting?.value) {
        try {
          const parts = serverTokenSetting.value.split('.');
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as { exp?: number };
          if (!payload.exp || payload.exp * 1000 > Date.now()) {
            setServerToken(serverTokenSetting.value);
          }
        } catch {
          // Invalid token — ignore
        }
      }

      return currentUser;
    } catch (err) {
      // Token invalid or expired
      console.error('Session restore failed:', err);
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

  ipcMain.handle('auth:changePassword', async (_event, currentPassword: string, newPassword: string) => {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({ where: { id: currentUser.id } });

    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new Error('auth.errors.invalid_password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { password: hashedPassword },
    });

    return true;
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
