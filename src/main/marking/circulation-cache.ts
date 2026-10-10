// asl-belgisi circulation answers for the sale path, remembered per marking code.
//
// The scan-time check (markingCodes:checkCirculation) asks while the cashier keeps scanning; the
// fiscal gate in regos-vcr-service asks again just before Receipt.Sale and usually finds the answer
// here already, so a receipt rarely waits for the registry. Only real answers are remembered: an
// unreachable registry is asked again next time.
import { classifyCirculation, type CirculationVerdict } from '../../shared/utils/circulation';
import { normalizeDataMatrix } from '../../shared/utils/marking';
import { verifyCirculation } from './circulation-check';

export interface CirculationAnswer {
  /** false when asl-belgisi could not be asked (offline, no token, timeout, server error). */
  reachable: boolean;
  /** UNKNOWN whenever unreachable, or for a status we do not classify. */
  verdict: CirculationVerdict;
  /** Raw asl-belgisi status, or NOT_FOUND when the registry has no such code. */
  status?: string;
}

/** Short: the cashier is scanning on, and the fiscal gate must not hold a receipt for long. */
export const SALE_PATH_TIMEOUT_MS = 2000;
const TTL_MS = 6 * 60 * 60 * 1000;

const answers = new Map<string, { answer: CirculationAnswer; at: number }>();
const inFlight = new Map<string, Promise<CirculationAnswer>>();

async function ask(code: string, timeoutMs: number): Promise<CirculationAnswer> {
  const { reachable, isValid, status } = await verifyCirculation(code, timeoutMs);
  if (!reachable) return { reachable: false, verdict: 'UNKNOWN' };
  if (isValid === false) return { reachable: true, verdict: 'OUT', status: 'NOT_FOUND' };
  return { reachable: true, verdict: classifyCirculation(status), status };
}

/**
 * The circulation verdict for one marking code. `fresh` skips the remembered answer (a manual
 * retry of a blocked receipt must see the registry as it is now). Concurrent asks for one code
 * share a single request. Never throws.
 */
export async function checkCirculation(
  rawCode: string,
  opts: { timeoutMs?: number; fresh?: boolean; now?: number } = {},
): Promise<CirculationAnswer> {
  const code = normalizeDataMatrix(rawCode);
  if (!code) return { reachable: false, verdict: 'UNKNOWN' };
  const now = opts.now ?? Date.now();

  if (!opts.fresh) {
    const hit = answers.get(code);
    if (hit && now - hit.at < TTL_MS) return hit.answer;
    const pending = inFlight.get(code);
    if (pending) return pending;
  }

  const request = ask(code, opts.timeoutMs ?? SALE_PATH_TIMEOUT_MS)
    .catch((): CirculationAnswer => ({ reachable: false, verdict: 'UNKNOWN' }))
    .then((answer) => {
      if (answer.reachable) answers.set(code, { answer, at: Date.now() });
      return answer;
    })
    .finally(() => {
      if (inFlight.get(code) === request) inFlight.delete(code);
    });
  inFlight.set(code, request);
  return request;
}

/** Tests only. */
export function clearCirculationCache(): void {
  answers.clear();
  inFlight.clear();
}
