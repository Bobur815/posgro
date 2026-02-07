import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to get the current storeId from the request.
 * This is set by StoreGuard or from the authenticated user's storeId.
 *
 * Usage:
 * @Get()
 * findAll(@CurrentStore() storeId: string) { ... }
 */
export const CurrentStore = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    // StoreGuard sets request.storeId, or fall back to user's storeId
    return request.storeId || request.user?.storeId;
  },
);
