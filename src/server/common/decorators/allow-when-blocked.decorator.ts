import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHEN_BLOCKED = 'allowWhenBlocked';

/**
 * Keep a route open to a till whose store is blocked for its subscription (SubscriptionInterceptor):
 * signing in, its store config and license, and reporting in. Everything else it is refused.
 */
export const AllowWhenBlocked = () => SetMetadata(ALLOW_WHEN_BLOCKED, true);
