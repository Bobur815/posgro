import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload, LoginResponse, StoreChoice } from './types/auth.types';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteConfigService } from '../site-config/site-config.service';
import {
  DASHBOARD_STORE_SELECT,
  dashboardLoginBlockReason,
  type LoginClient,
} from './dashboard-access';

/**
 * How recently one of a store's terminals must have reported in (`POST /terminals/heartbeat`) for
 * the store to count as open. A terminal reports once per sync cycle — every 5 minutes by default,
 * for as long as the app is running — so this allows two missed cycles before the store reads as
 * closed. Judged by the server's clock (the row's `updatedAt`), never the till's.
 */
const TERMINAL_ONLINE_WINDOW_MS = 12 * 60_000;

/**
 * An OFFLINE_ONLY store cannot be managed from the dashboard (its data lives on its terminal), so a
 * sign-in never opens one — but the store switcher still lists it, greyed out, so an owner can see
 * it is theirs.
 */
const OFFLINE_ONLY_REASON = 'auth.errors.store_offline_only';

/** Likewise a store blocked for an unpaid subscription: listed, greyed out, not opened. */
const SUBSCRIPTION_BLOCKED_REASON = 'auth.errors.subscription_blocked';

const GREYED_OUT: ReadonlySet<string> = new Set([OFFLINE_ONLY_REASON, SUBSCRIPTION_BLOCKED_REASON]);

/** The signed-in user as `validateUser` puts it on the request — `password` is the account's hash. */
type SignedIn = {
  phone: string;
  storeId?: string | null;
  storeIds?: string[];
  client?: LoginClient;
  password?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly siteConfig: SiteConfigService,
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

    // Listed: every active store the password opens, an OFFLINE_ONLY or unpaid one included (greyed
    // out in the switcher). Signed in to: only one the dashboard can actually open.
    const rules = await this.siteConfig.getSubscriptionRules();
    const reasonOf = (a: (typeof active)[number]) =>
      dashboardLoginBlockReason(a.role, a.storeId, a.store, client, rules);
    const listable = active.filter((a) => {
      const reason = reasonOf(a);
      return !reason || GREYED_OUT.has(reason);
    });
    const allowed = listable.filter((a) => !reasonOf(a));
    if (allowed.length === 0) {
      // After the password, as for a single store: a wrong password reveals nothing about stores.
      throw new ForbiddenException(reasonOf(active[0]) as string);
    }

    allowed.sort((a, b) => (a.store?.name ?? '').localeCompare(b.store?.name ?? ''));
    const chosen = allowed.find((a) => a.storeId === dto.preferredStoreId) ?? allowed[0];
    return this.issue(
      chosen,
      dto.client,
      listable.map((a) => a.storeId as string),
      userAgent,
      ipAddress,
    );
  }

  /**
   * Move this sign-in to another of its stores: a new session for that store's account, and the
   * current one ended. Only a store the token lists — the password opened its account at login.
   */
  async switchStore(
    current: SignedIn & { sessionId?: string },
    storeId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<LoginResponse> {
    const storeIds = await this.allowedStoreIds(current);
    if (!storeIds.includes(storeId)) {
      throw new ForbiddenException('auth.errors.store_not_allowed');
    }

    const target = await this.prisma.user.findUnique({
      where: { storeId_phone: { storeId, phone: current.phone } },
      include: { store: { select: DASHBOARD_STORE_SELECT } },
    });
    if (!target || !target.active) {
      throw new ForbiddenException('auth.errors.store_not_allowed');
    }
    const reason = dashboardLoginBlockReason(
      target.role,
      target.storeId,
      target.store,
      current.client,
      await this.siteConfig.getSubscriptionRules(),
    );
    if (reason) throw new ForbiddenException(reason);

    if (current.sessionId) {
      await this.prisma.userSession.updateMany({
        where: { id: current.sessionId },
        data: { isRevoked: true },
      });
    }
    return this.issue(target, current.client, storeIds, userAgent, ipAddress);
  }

  /** The stores this sign-in can switch between, as they are now (see allowedStoreIds). */
  async listStores(current: SignedIn): Promise<StoreChoice[]> {
    return this.storeChoices(current.phone, await this.allowedStoreIds(current), current.client);
  }

  /**
   * The stores this sign-in may open: those its token listed at sign-in (or its own store, for a
   * token that lists none — a terminal's, or one from before), plus any whose account carries this
   * account's exact password hash. That hash is only ever a copy made when the store was created
   * for this owner (stores.service.ts startingPassword) — two passwords set separately never hash
   * alike — so a store created after sign-in shows up without signing in again, and nothing the
   * password would not open does.
   */
  private async allowedStoreIds(current: SignedIn): Promise<string[]> {
    const listed = current.storeIds?.length
      ? current.storeIds
      : current.storeId
        ? [current.storeId]
        : [];
    if (!current.password) return listed;

    const twins = await this.prisma.user.findMany({
      where: { phone: current.phone, password: current.password, active: true, storeId: { not: null } },
      select: { storeId: true },
    });
    return [...new Set([...listed, ...twins.map((t) => t.storeId as string)])];
  }

  private async storeChoices(
    phone: string,
    storeIds: string[],
    client?: LoginClient,
  ): Promise<StoreChoice[]> {
    if (storeIds.length === 0) return [];
    const accounts = await this.prisma.user.findMany({
      where: { phone, storeId: { in: storeIds }, active: true },
      include: { store: { select: { id: true, name: true, ...DASHBOARD_STORE_SELECT } } },
    });
    const rules = await this.siteConfig.getSubscriptionRules();

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
      .flatMap((a) => {
        if (!a.store) return [];
        const reason = dashboardLoginBlockReason(a.role, a.storeId, a.store, client, rules);
        // A deactivated store is not listed at all; an OFFLINE_ONLY or unpaid one is, greyed out.
        if (reason && !GREYED_OUT.has(reason)) return [];
        return [
          {
            id: a.storeId as string,
            name: a.store.name,
            role: a.role,
            online: open.has(a.storeId as string),
            offlineOnly: reason === OFFLINE_ONLY_REASON,
            subscriptionBlocked: reason === SUBSCRIPTION_BLOCKED_REASON,
          },
        ];
      })
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
      select: DASHBOARD_STORE_SELECT,
    });

    const reason = dashboardLoginBlockReason(
      role,
      storeId,
      store,
      client,
      await this.siteConfig.getSubscriptionRules(),
    );
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
    // switching it to OFFLINE_ONLY, or its grace days running out — leaves everyone already signed
    // in working normally until their token expires, which for an eight-hour token is most of a
    // working day.
    //
    // `user.store` rides along on the query above, and the rules are cached, so this costs no
    // extra round trip.
    //
    // Returning null yields a 401, which is what we want: the browser's interceptor clears the
    // session and sends them to the login page, where the next attempt explains why in a toast.
    // Throwing 403 here instead would leave them nominally signed in with every request failing.
    //
    // Judged as the client the token was minted for. Omitting it defaults to 'dashboard' and 401s
    // every request from an OFFLINE_ONLY terminal — including the login screen's subscription
    // panel, which exists precisely for those stores.
    const rules = await this.siteConfig.getSubscriptionRules();
    if (dashboardLoginBlockReason(user.role, user.storeId, user.store, payload.client, rules)) {
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
