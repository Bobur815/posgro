export interface CatalogEntry {
  mxikCode:          string;
  mxikName:          string;
  groupCode:         string;
  groupName:         string;
  classCode:         string;
  className:         string;
  internationalCode: string | null;
  unitName:          string | null;
}

// Groups excluded from the store's legal retail activity.
// Derived from HS chapter codes mirrored in MXIK group prefixes.
export const EXCLUDED_MXIK_GROUPS = new Set([
  '024', // Tobacco
  '025', // Salt, cement, asbestos (construction materials)
  '027', // Mineral fuels, petroleum products
  '030', // Pharmaceuticals
  '044', // Wood and articles of wood
  '071', // Precious metals, jewelry
  '087', // New motor vehicles
]);

export const EXCLUDED_MXIK_CLASSES = new Set([
  '02208', // Alcoholic beverages (within beverages group 022)
]);

/** Returns true if the given 17-digit MXIK code belongs to an excluded category. */
export function isMxikExcluded(mxikCode: string): boolean {
  return (
    EXCLUDED_MXIK_GROUPS.has(mxikCode.slice(0, 3)) ||
    EXCLUDED_MXIK_CLASSES.has(mxikCode.slice(0, 5))
  );
}
