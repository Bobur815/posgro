// tasnif.soliq.uz lookups (MXIK by barcode, package codes for an MXIK), done from the main process:
// no browser CORS, and the terminal is in Uzbekistan where tasnif answers. Shared by the product
// form's IPC handlers and the fiscal backlog, which fills a missing MXIK before fiscalising.
import { mapPackageNames, type MxikPackage } from '../../shared/utils/mxik-packages';
import { findBarcodeMatch } from '../../shared/utils/mxik-lookup';

const TASNIF = 'https://tasnif.soliq.uz/api/cls-api';

export interface TasnifMxik {
  code: string;
  name: string;
  nameRu: string;
}

/**
 * MXIK for a barcode. `ok: false` means tasnif could not be asked (network, HTTP error, bad body);
 * `match: null` means it answered and has no product with exactly this barcode — its search is
 * fuzzy, so only an exact barcode match counts (see findBarcodeMatch).
 */
export async function lookupMxikByBarcode(
  barcode: string,
): Promise<{ ok: true; match: TasnifMxik | null } | { ok: false }> {
  const bc = (barcode || '').trim();
  if (!bc) return { ok: true, match: null };
  try {
    const searchRes = await fetch(
      `${TASNIF}/elasticsearch/search?lang=uz_cyrl&search=${encodeURIComponent(bc)}&size=5&page=0`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!searchRes.ok) return { ok: false };
    const searchJson = (await searchRes.json()) as {
      success?: boolean;
      data?: Array<{ mxikCode: string; internationalCode?: string }>;
    };
    if (!searchJson?.success) return { ok: false };
    const match = searchJson.data?.length ? findBarcodeMatch(searchJson.data, bc) : null;
    if (!match) return { ok: true, match: null };

    const detailRes = await fetch(`${TASNIF}/integration-mxik/get/history/${match.mxikCode}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!detailRes.ok) return { ok: false };
    const detailJson = (await detailRes.json()) as {
      data?: {
        mxikCode: string;
        brandName?: string | null;
        attributeNameUz?: string | null;
        attributeNameRu?: string | null;
        subPositionNameUz?: string | null;
        subPositionNameRu?: string | null;
      };
    };
    const d = detailJson?.data;
    if (!d) return { ok: true, match: null };
    const brand = d.brandName ? `${d.brandName} ` : '';
    return {
      ok: true,
      match: {
        code: d.mxikCode,
        name: brand + (d.attributeNameUz ?? d.subPositionNameUz ?? ''),
        nameRu: brand + (d.attributeNameRu ?? d.subPositionNameRu ?? ''),
      },
    };
  } catch (error) {
    console.error('tasnif MXIK lookup failed:', error instanceof Error ? error.message : error);
    return { ok: false };
  }
}

/** Package (unit) codes registered for an MXIK; empty when unknown or tasnif is unreachable. */
export async function getMxikPackages(mxikCode: string): Promise<MxikPackage[]> {
  if (!/^\d{17}$/.test(mxikCode || '')) return [];
  try {
    const response = await fetch(`${TASNIF}/integration-mxik/get/history/${mxikCode}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { data?: { packageNames?: unknown } };
    return mapPackageNames(json?.data?.packageNames);
  } catch (error) {
    console.error('Failed to fetch MXIK packages:', error instanceof Error ? error.message : error);
    return [];
  }
}
