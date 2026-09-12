import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload, LoginResponse, StoreChoice } from './types/auth.types';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dashboardLoginBlockReason, type LoginClient } from './dashboard-access';

/**
 * How recently one of a store's terminals must have reported in (`POST /terminals/heartbeat`) for
 * the store to count as open. A terminal reports once per sync cycle — every 5 minutes by default,
 * for as long as the app is running — so this allows two missed cycles before the store reads as
 * closed. Judged by the server's clock (the row's `updatedAt`), never the till's.
 */
const TERMINAL_ONLINE_WINDOW_MS = 12 * 60_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(loginDto: LoginDto, userAgent?: string, ipAddress?: string): Promise<LoginResponse> {
    const { storeId, phone, password } = loginDto;

    const user = await this.usersService.findByPhoneAndStore(phone, storeId);
    // No store named and not a super admin: the web dashboard's login, which finds the stores
    // itself. A terminal always names its store, and takes the path below unchanged.
    if (!user && !storeId) {
      return this.loginAcrossStores(loginDto, userAgent, ipAddress);
    }
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.active) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (user.role !== UserRole.SUPER_ADMIN && !user.storeId) {
      throw new UnauthorizedException('User is not assigned to any store');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.assertStoreCanUseDashboard(user.role, user.storeId, loginDto.client);

    return this.issue(user, loginDto.client, undefined, userAgent, ipAddress);
  }

  /**
   * Sign in by phone and password alone. One person with several stores has one account in each
   * (users are per store), so this keeps the accounts the password opens, drops those whose store
   * cannot be managed from here, and signs in to one of them — `preferredStoreId` when allowed, the
   * first by name otherwise. The token lists them all, for switching (`switchStore`).
   *
   * An account with the same phone but another password is never offered: it may be someone
   * else's, and it is not this password's to open.
   */
  private async loginAcrossStores(
    dto: LoginDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<LoginResponse> {
    const client = dto.client ?? 'dashboard';
    const accounts = await this.usersService.findStoreAccountsByPhone(dto.phone);

    const opened: typeof accounts = [];
    for (const account of accounts) {
      if (await bcrypt.compare(dto.password, account.password)) opened.push(account);
    }
    if (opened.length === 0) throw new UnauthorizedException('Invalid credentials');

    const active = opened.filter((a) => a.active);
    if (active.length === 0) throw new UnauthorizedException('Account is deactivated');

    const allowed = active.filter(
      (a) => !dashboardLoginBlockReason(a.role, a.storeId, a.store, client),
    );
    if (allowed.length === 0) {
      // After the password, as for a single store: a wrong password reveals nothing about stores.
      const first = active[0];
      throw new ForbiddenException(
        dashboardLoginBlockReason(first.role, first.storeId, first.store, client) as string,
      );
    }

    allowed.sort((a, b) => (a.store?.name ?? '').localeCompare(b.store?.name ?? ''));
    const chosen = allowed.find((a) => a.storeId === dto.preferredStoreId) ?? allowed[0];
    return this.issue(
      chosen,
      dto.client,
      allowed.map((a) => a.storeId as string),
      userAgent,
      ipAddress,
    );
  }

  /**
   * Move this sign-in to another of its stores: a new session for that store's account, and the
   * current one ended. Only a store the token lists — the password opened its account at login.
   */
  async switchStore(
    current: { phone: string; sessionId?: string; storeIds?: string[]; client?: LoginClient },
    storeId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<LoginResponse> {
    const storeIds = current.storeIds ?? [];
    if (!storeIds.includes(storeId)) {
      throw new ForbiddenException('auth.errors.store_not_allowed');
    }

    const target = await this.prisma.user.findUnique({
      where: { storeId_phone: { storeId, phone: current.phone } },
      include: { store: { select: { active: true, mode: true } } },
    });
    if (!target || !target.active) {
      throw new ForbiddenException('auth.errors.store_not_allowed');
    }
    const reason = dashboardLoginBlockReason(target.role, target.storeId, target.store, current.client);
    if (reason) throw new ForbiddenException(reason);

    if (current.sessionId) {
      await this.prisma.userSession.updateMany({
        where: { id: current.sessionId },
        data: { isRevoked: true },
      });
    }
    return this.issue(target, current.client, storeIds, userAgent, ipAddress);
  }

  /**
   * The stores this sign-in can switch between, as they are now. A token that lists none — a
   * terminal's, or one from before — lists its own store.
   */
  listStores(current: {
    phone: string;
    storeId: string | null;
    storeIds?: string[];
    client?: LoginClient;
  }): Promise<StoreChoice[]> {
    const ids = current.storeIds?.length
      ? current.storeIds
      : current.storeId
        ? [current.storeId]
        : [];
    return this.storeChoices(current.phone, ids, current.client);
  }

  private async storeChoices(
    phone: string,
    storeIds: string[],
    client?: LoginClient,
  ): Promise<StoreChoice[]> {
    if (storeIds.length === 0) return [];
    const accounts = await this.prisma.user.findMany({
      where: { phone, storeId: { in: storeIds }, active: true },
      include: { store: { select: { id: true, name: true, active: true, mode: true } } },
    });

    // Open = at least one of its terminals (the main, in a LAN shop — satellites report to it) has
    // sent a heartbeat within the window.
    const live = await this.prisma.terminalHeartbeat.findMany({
      where: {
        storeId: { in: storeIds },
        updatedAt: { gte: new Date(Date.now() - TERMINAL_ONLINE_WINDOW_MS) },
      },
      select: { storeId: true },
      distinct: ['storeId'],
    });
    const open = new Set(live.map((h) => h.storeId));

    return accounts
      .filter((a) => a.store && !dashboardLoginBlockReason(a.role, a.storeId, a.store, client))
      .map((a) => ({
        id: a.storeId as string,
        name: a.store!.name,
        role: a.role,
        online: open.has(a.storeId as string),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** A session and a token for `user`. `storeIds`, when given, are the stores it may switch to. */
  private async issue(
    user: {
      id: string;
      storeId: string | null;
      phone: string;
      role: UserRole;
      nameUz: string;
      nameRu: string;
    },
    client: LoginClient | undefined,
    storeIds: string[] | undefined,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<LoginResponse> {
    const deviceName = await this.resolveDeviceName(user.id, ipAddress);
    const session = await this.prisma.userSession.create({
      data: { userId: user.id, userAgent, ipAddress, deviceName },
    });

    const payload: JwtPayload = {
      sub: user.id,
      storeId: user.storeId,
      phone: user.phone,
      role: user.role,
      sessionId: session.id,
      // Carried so `validateUser()` can re-apply the store gate the same way this login did.
      // A POS token for an OFFLINE_ONLY store is legitimate; a dashboard one is not.
      client,
      ...(storeIds ? { storeIds } : {}),
    };

    const token = this.jwtService.sign(payload);

    return {
      token,
      user: {
        id: user.id,
        storeId: user.storeId,
        phone: user.phone,
        role: user.role,
        nameUz: user.nameUz,
        nameRu: user.nameRu,
      },
      ...(storeIds ? { stores: await this.storeChoices(user.phone, storeIds, client) } : {}),
    };
  }

  /**
   * Refuse a dashboard login when the store itself cannot be managed from here.
   *
   * The rule lives in `dashboard-access.ts` so it can be tested without Nest; this method is only
   * the database read and the HTTP shape around it.
   *
   * Checked after the password on purpose: a wrong password must not reveal whether a store
   * exists or what state it is in. Checked here rather than only in the browser because the token
   * is what actually grants access — a UI-only block leaves every endpoint reachable.
   */
  private async assertStoreCanUseDashboard(
    role: UserRole,
    storeId: string | null,
    client: LoginClient = 'dashboard',
  ): Promise<void> {
    if (role === UserRole.SUPER_ADMIN || !storeId) return;

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { active: true, mode: true },
    });

    const reason = dashboardLoginBlockReason(role, storeId, store, client);
    if (!reason) return;

    // 403, not 401: the browser's axios interceptor turns a 401 into a logout and a redirect,
    // which reloads the login page and wipes the explanation before it can be read.
    throw new ForbiddenException(reason);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.usersService.findById(userId);

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('invalid_password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePassword(userId, hashedPassword);

    return { success: true };
  }

  async validateUser(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.active) {
      return null;
    }

    // Re-check the store on every request, not just at login. Otherwise deactivating a store — or
    // switching it to OFFLINE_ONLY — leaves everyone already signed in working normally until
    // their token expires, which for an eight-hour token is most of a working day.
    //
    // `user.store` rides along on the query above, so this costs no extra round trip.
    //
    // Returning null yields a 401, which is what we want: the browser's interceptor clears the
    // session and sends them to the login page, where the next attempt explains why in a toast.
    // Throwing 403 here instead would leave them nominally signed in with every request failing.
    //
    // Judged as the client the token was minted for. Omitting it defaults to 'dashboard' and 401s
    // every request from an OFFLINE_ONLY terminal — including the login screen's subscription
    // panel, which exists precisely for those stores.
    if (dashboardLoginBlockReason(user.role, user.storeId, user.store, payload.client)) {
      return null;
    }

    if (payload.sessionId) {
      const session = await this.prisma.userSession.findUnique({
        where: { id: payload.sessionId },
      });
      if (!session || session.isRevoked) {
        return null;
      }
    }

    return {
      ...user,
      storeId: payload.storeId,
      sessionId: payload.sessionId,
      // For switching stores and listing them (`switchStore`, `listStores`).
      storeIds: payload.storeIds ?? [],
      client: payload.client,
    };
  }

  async getSessions(userId: string) {
    return this.prisma.userSession.findMany({
      where: { userId, isRevoked: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(sessionId: string, userId: string) {
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      throw new UnauthorizedException('Session not found');
    }
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
    return { success: true };
  }

  async revokeOtherSessions(currentSessionId: string, userId: string) {
    await this.prisma.userSession.updateMany({
      where: { userId, isRevoked: false, id: { not: currentSessionId } },
      data: { isRevoked: true },
    });
    return { success: true };
  }

  async nameDevice(userId: string, ipAddress: string, name: string) {
    await this.prisma.userSession.updateMany({
      where: { userId, ipAddress, isRevoked: false },
      data: { deviceName: name.trim() || null },
    });
    return { success: true };
  }

  private async resolveDeviceName(userId: string, ipAddress?: string): Promise<string | null> {
    if (!ipAddress) return null;
    const prev = await this.prisma.userSession.findFirst({
      where: { userId, ipAddress, deviceName: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { deviceName: true },
    });
    return prev?.deviceName ?? null;
  }
}
