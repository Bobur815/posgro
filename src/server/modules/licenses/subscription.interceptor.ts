import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { ALLOW_WHEN_BLOCKED } from '../../common/decorators/allow-when-blocked.decorator';
import { SiteConfigService } from '../site-config/site-config.service';
import { SUPER_ADMIN, type DashboardStore } from '../auth/dashboard-access';
import {
  storeSubscriptionFacts,
  subscriptionStatus,
  type SubscriptionRules,
} from '../../../shared/utils/subscription';

export const SUBSCRIPTION_BLOCKED = 'auth.errors.subscription_blocked';

/** The signed-in user as `validateUser` puts it on the request — the parts read here. */
interface RequestUser {
  role?: string;
  client?: string;
  store?: DashboardStore | null;
}

/**
 * Whether a till's request is refused: it signed in as a POS terminal, and its store is past its
 * grace days. A dashboard session never gets this far — `validateUser` already refuses it — and a
 * super admin is never blocked.
 */
export function refusesTill(
  user: RequestUser | undefined,
  rules: SubscriptionRules,
  now: number = Date.now(),
): boolean {
  if (!user || user.client !== 'pos' || user.role === SUPER_ADMIN || !user.store) return false;
  return subscriptionStatus(storeSubscriptionFacts(user.store), rules, now).state === 'blocked';
}

/**
 * The server's half of blocking a till. The till refuses to sell by itself, from its license; this
 * is what still holds when that check has been edited out of its code — it gets no sync, no uploads
 * and none of the shared services (MXIK, marking codes, invoice AI) until the store is paid for.
 *
 * An interceptor rather than a global guard because it has to know who is asking: global guards
 * run before a controller's `JwtAuthGuard` has put the user on the request, interceptors after.
 * The store's columns ride along on the user `validateUser` loaded, and the rules are cached, so
 * this adds no query.
 */
@Injectable()
export class SubscriptionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly siteConfig: SiteConfigService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const user = context.switchToHttp().getRequest<{ user?: RequestUser }>().user;
    if (!user || user.client !== 'pos') return next.handle();

    const open = this.reflector.getAllAndOverride<boolean>(ALLOW_WHEN_BLOCKED, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!open && refusesTill(user, await this.siteConfig.getSubscriptionRules())) {
      throw new ForbiddenException(SUBSCRIPTION_BLOCKED);
    }
    return next.handle();
  }
}
