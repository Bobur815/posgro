export const USER_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN', // Can manage all stores
  ADMIN: 'ADMIN',             // Store admin
  USER: 'USER',               // Cashier
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [
    // All ADMIN permissions plus store management
    'stores.create',
    'stores.update',
    'stores.delete',
    'stores.view',
    'stores.manage_all',
    'products.create',
    'products.update',
    'products.delete',
    'products.view',
    'sales.create',
    'sales.view',
    'sales.refund',
    'users.create',
    'users.update',
    'users.delete',
    'users.view',
    'reports.view',
    'reports.export',
    'inventory.manage',
    'settings.manage',
    'sync.manual',
  ],
  ADMIN: [
    'products.create',
    'products.update',
    'products.delete',
    'products.view',
    'sales.create',
    'sales.view',
    'sales.refund',
    'users.create',
    'users.update',
    'users.delete',
    'users.view',
    'reports.view',
    'reports.export',
    'inventory.manage',
    'settings.manage',
    'sync.manual',
  ],
  USER: [
    'products.view',
    'sales.create',
    'sales.view',
  ],
} as const;

export const isSuperAdmin = (role: string): boolean => role === USER_ROLES.SUPER_ADMIN;
export const isAdmin = (role: string): boolean => role === USER_ROLES.ADMIN || role === USER_ROLES.SUPER_ADMIN;

export const hasPermission = (role: string, permission: string): boolean => {
  const permissions = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS];
  return permissions ? permissions.includes(permission as any) : false;
};
