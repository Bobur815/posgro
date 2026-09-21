export const USER_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN', // Can manage all stores
  ADMIN: 'ADMIN',             // Store admin
  USER: 'USER',               // Cashier
  CLIENT: 'CLIENT',           // Customer who buys on credit — not staff, and cannot sign in
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
  // A customer, not an operator: they appear in the debtors list and on their own receipts, and
  // that is all. Listed explicitly rather than left out so that "no permissions" is a decision
  // on the page, not an accident of hasPermission()'s fallback.
  CLIENT: [],
} as const;

/**
 * The i18n key that names each role.
 *
 * Exists because every screen used to write `role === 'ADMIN' ? admin : cashier`, so the day a
 * third role appeared it would have been labelled "Cashier" in the app bar, the user list and
 * the dashboard's top bar at once — silently, and in a way that reads as a permissions bug.
 */
export const ROLE_I18N_KEYS: Record<string, string> = {
  [USER_ROLES.SUPER_ADMIN]: 'users.superAdmin',
  [USER_ROLES.ADMIN]: 'users.admin',
  [USER_ROLES.USER]: 'users.cashier',
  [USER_ROLES.CLIENT]: 'users.client',
};

/** Pass the role itself as `defaultValue`: an unnamed role should read oddly, not read wrong. */
export const roleLabelKey = (role: string | null | undefined): string =>
  ROLE_I18N_KEYS[role ?? ''] ?? '';

export const isSuperAdmin = (role: string): boolean => role === USER_ROLES.SUPER_ADMIN;

/**
 * A customer record rather than someone who works here.
 *
 * Every login path checks this: a CLIENT has a password column like everyone else (it is NOT
 * NULL), holding a value nobody knows, and must never be able to sign in on the strength of it.
 */
export const isClient = (role: string | null | undefined): boolean => role === USER_ROLES.CLIENT;
export const isAdmin = (role: string): boolean => role === USER_ROLES.ADMIN || role === USER_ROLES.SUPER_ADMIN;

export const hasPermission = (role: string, permission: string): boolean => {
  // Widened to string[] deliberately: CLIENT's list is empty, so the inferred union of the
  // literal tuples narrows `includes` to `never` and rejects every argument.
  const permissions: readonly string[] | undefined =
    ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS];
  return permissions ? permissions.includes(permission) : false;
};
