// MXIK package (unit) codes — sourced from tasnif `integration-mxik/get/history/{mxik}`.
// A marked product's `package_code` (REGOS:VCR) is one of these. There can be several
// (single bottle, block of 12, pack of 1560, …) so the UI picks the single-unit one.

export interface MxikPackage {
  code: string;
  name: string;
}

/** Map a raw tasnif `data.packageNames` array into {code, name}. */
export function mapPackageNames(raw: unknown): MxikPackage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      const o = p as Record<string, unknown>;
      return {
        code: String(o.code ?? ''),
        name: String(o.nameRu || o.nameUz || o.nameLat || o.code || ''),
      };
    })
    .filter((p) => p.code);
}

/**
 * Pick the single-unit package — the one a piece-sold product uses. Package names look
 * like "блок=12 шт …", "упаковка=1560 шт …", "блок=1 шт …"; we choose the smallest
 * "=N" quantity (1 if present), falling back to the first entry.
 */
export function pickSingleUnitPackage(pkgs: MxikPackage[]): MxikPackage | undefined {
  if (pkgs.length === 0) return undefined;
  // Quantity from a "…=N…" name; a name with no "=" is the base unit (e.g. "шт (бутылка)") → 1.
  const qtyOf = (name: string): number => {
    const m = name.match(/=\s*(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  };
  const hasEquals = (name: string): number => (name.includes('=') ? 1 : 0);
  // Smallest quantity first; among equal quantities prefer the plain base unit (no "=").
  return [...pkgs].sort(
    (a, b) => qtyOf(a.name) - qtyOf(b.name) || hasEquals(a.name) - hasEquals(b.name),
  )[0];
}

