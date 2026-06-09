/**
 * ASL-BELGISI marking-code status test harness.
 *
 * Goal: given a scanned DataMatrix marking code, find out whether the product
 * is IN circulation or OUT of circulation (withdrawn / retired / written off).
 *
 * Run with tsx (no build needed):
 *   npm run test:aslbelgisi -- "<rawDataMatrix>" ["<another>"...]
 *   npx tsx scripts/aslbelgisi-test.ts "01048701234567892126..."
 *
 * The raw arg can include the scanner's ZXing prefix (]d2 / ]C1 / ]e0) and a
 * leading FNC1 (\x1d) — they are stripped exactly like the web client does.
 * Internal \x1d AI separators are preserved (required by the API).
 *
 * Env (from .env, loaded via dotenv):
 *   ASLBELGISI_API_KEY   Bearer token for xtrace.aslbelgisi.uz   (REQUIRED)
 *
 * Flags:
 *   --history   Request full code history (addCodeHistory: true) — more detail.
 *   --raw       Print only the raw JSON response, skip the verdict.
 *
 * Mirrors src/server/modules/aslbelgisi/aslbelgisi.service.ts (request shape)
 * and src/web/src/api/client.ts (normalizeDataMatrix).
 */

import 'dotenv/config';

const ASL_BELGISI_BASE = 'https://xtrace.aslbelgisi.uz';
const ENDPOINT = `${ASL_BELGISI_BASE}/public/api/cod/public/codes`;

// --- circulation verdict buckets -------------------------------------------------
// Status values per tasks/ASL_BELGISI_INTEGRATION.md (+ common aslbelgisi enums).
// We classify into three buckets; anything unrecognised is reported as UNKNOWN so
// you can eyeball the raw response and extend these sets.
const IN_CIRCULATION = new Set([
  'APPLIED', // code applied to the product
  'INTRODUCED', // введён в оборот — introduced into circulation
  'IN_CIRCULATION', // being sold / moved
]);
const NOT_YET_IN_CIRCULATION = new Set([
  'EMITTED', // issued, not yet applied
]);
const OUT_OF_CIRCULATION = new Set([
  'WITHDRAWN', // recalled
  'RETIRED', // retired from the system
  'WRITTEN_OFF', // списан
  'SOLD', // выведен из оборота через продажу
  'DISAGGREGATED', // расформирован
  'RETURNED', // возврат
]);

type Verdict = 'IN_CIRCULATION' | 'NOT_YET' | 'OUT_OF_CIRCULATION' | 'UNKNOWN';

function classify(status?: string): Verdict {
  if (!status) return 'UNKNOWN';
  const s = status.toUpperCase();
  if (IN_CIRCULATION.has(s)) return 'IN_CIRCULATION';
  if (NOT_YET_IN_CIRCULATION.has(s)) return 'NOT_YET';
  if (OUT_OF_CIRCULATION.has(s)) return 'OUT_OF_CIRCULATION';
  return 'UNKNOWN';
}

// Mirror of normalizeDataMatrix() in src/web/src/api/client.ts.
function normalizeDataMatrix(raw: string): string {
  return raw.replace(/^\](d2|C1|e0)/, '').replace(/^\x1d/, '');
}

// The aslbelgisi registry keys a code on AIs 01 (GTIN) + 21 (serial) only.
// The trailing crypto/verification group (AI 91/92/93) is NOT part of the lookup
// key — sending it returns an empty array. Build fallback candidates that drop it,
// covering both real scans (GS-separated) and pasted text (no GS byte).
function lookupCandidates(normalized: string): string[] {
  const candidates = [normalized];
  // Real scan: cut at the GS (\x1d) that precedes the crypto group → keep 01..serial.
  if (normalized.includes('\x1d')) {
    candidates.push(normalized.split('\x1d')[0]);
  }
  // Pasted text (GS lost): strip a trailing 9{1,3} crypto group if present.
  const noTail = normalized.replace(/\x1d?9[123][^\x1d]*$/, '');
  if (noTail !== normalized) candidates.push(noTail);
  return [...new Set(candidates)];
}

function label(v: Verdict): string {
  switch (v) {
    case 'IN_CIRCULATION':
      return '✅ IN CIRCULATION (sellable)';
    case 'NOT_YET':
      return '🕓 NOT YET IN CIRCULATION (emitted, not applied)';
    case 'OUT_OF_CIRCULATION':
      return '⛔ OUT OF CIRCULATION (do NOT sell)';
    default:
      return '❓ UNKNOWN status — inspect raw response below';
  }
}

async function queryCode(apiKey: string, code: string, wantHistory: boolean): Promise<any | null> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ codes: [code], addCodeHistory: wantHistory }),
  });
  const rawBody = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${rawBody.slice(0, 300)}`);
  const data = JSON.parse(rawBody);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

function printable(code: string): string {
  return code.replace(/\x1d/g, '<GS>');
}

async function main() {
  const argv = process.argv.slice(2);
  const wantHistory = argv.includes('--history');
  const rawOnly = argv.includes('--raw');
  const rawCodes = argv.filter((a) => !a.startsWith('--'));

  const apiKey = process.env.ASLBELGISI_API_KEY ?? '';
  if (!apiKey) {
    console.error('✗ ASLBELGISI_API_KEY is not set in .env');
    process.exit(1);
  }
  if (rawCodes.length === 0) {
    console.error('Usage: npm run test:aslbelgisi -- "<rawDataMatrix>" [--history] [--raw]');
    process.exit(1);
  }

  console.log(`Key: ${apiKey.slice(0, 6)}… | endpoint: ${ENDPOINT}`);
  console.log(`Verifying ${rawCodes.length} code(s), addCodeHistory=${wantHistory}\n`);

  for (const raw of rawCodes) {
    const normalized = normalizeDataMatrix(raw);
    const candidates = lookupCandidates(normalized);

    let mc: any | null = null;
    let matchedOn = '';
    for (const cand of candidates) {
      try {
        mc = await queryCode(apiKey, cand, wantHistory);
      } catch (e) {
        console.error(`✗ ${(e as Error).message}`);
        process.exit(1);
      }
      if (mc) {
        matchedOn = cand;
        break;
      }
    }

    console.log('═'.repeat(72));
    console.log(`Input : ${printable(normalized)}`);

    if (!mc) {
      console.log('Result: ⛔ NOT FOUND in the registry (tried '
        + `${candidates.length} candidate(s): ${candidates.map(printable).join(' | ')})`);
      console.log('        → predates tracking, wrong/damaged code, or not a marked product.');
      continue;
    }

    if (matchedOn !== normalized) {
      console.log(`Note  : resolved after stripping crypto tail → "${printable(matchedOn)}"`);
    }

    const verdict = classify(mc.status);
    console.log(`Verdict: ${label(verdict)}`);
    if (!rawOnly) {
      console.log(`  status         : ${mc.status ?? '—'}`);
      console.log(`  extendedStatus : ${mc.extendedStatus ?? '—'}`);
      console.log(`  gtin           : ${mc.gtin ?? '—'}`);
      console.log(`  packageType    : ${mc.packageType ?? '—'}`);
      console.log(`  productionDate : ${mc.productionDate ?? '—'}`);
      console.log(`  expirationDate : ${mc.expirationDate ?? '—'}`);
      console.log(`  issuer         : ${mc.issuerShortInfo?.issuerName?.ru ?? '—'}`);
      console.log(`  all fields     : ${Object.keys(mc).join(', ')}`);
    }
    console.log('\nFull record:');
    console.log(JSON.stringify(mc, null, 2));
  }
}

main();
