import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * StoreGuard ensures that:
 * 1. SUPER_ADMIN can access any store (if storeId in params/query/body)
 * 2. Regular users can only access their own store
 * 3. Attaches the effective storeId to the request for use in services
 */
@Injectable()
export class StoreGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Get storeId from various sources
    const paramStoreId = request.params?.storeId;
    const queryStoreId = request.query?.storeId;
    const bodyStoreId = request.body?.storeId;
    const requestedStoreId = paramStoreId || queryStoreId || bodyStoreId;

    // SUPER_ADMIN can access any store
    if (user.role === UserRole.SUPER_ADMIN) {
      // If a specific store is requested, use that; otherwise throw error
      if (requestedStoreId) {
        request.storeId = requestedStoreId;
        return true;
      }
      // SUPER_ADMIN must specify a store for store-scoped operations
      throw new ForbiddenException('Store ID is required for this operation');
    }

    // Regular users must have a storeId
    if (!user.storeId) {
      throw new ForbiddenException('User is not assigned to any store');
    }

    // If a specific store is requested, it must match user's store
    if (requestedStoreId && requestedStoreId !== user.storeId) {
      throw new ForbiddenException('Access denied to this store');
    }

    // Set the effective storeId on request
    request.storeId = user.storeId;
    return true;
  }
}
