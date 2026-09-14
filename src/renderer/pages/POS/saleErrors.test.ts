import { parseSaleError } from './saleErrors';

/** The message as the renderer actually receives it: wrapped by Electron around the main's JSON. */
const fromIpc = (payload: object) =>
  new Error(`Error invoking remote method 'sales:create': Error: ${JSON.stringify(payload)}`);

const t = (key: string) => key;

describe('parseSaleError on a satellite', () => {
  it.each([
    ['MAIN_UNREACHABLE', 'errors.mainUnreachable'],
    ['MAIN_SESSION_EXPIRED', 'errors.mainSessionExpired'],
    ['DEVICE_UNPAIRED', 'errors.deviceUnpaired'],
    ['SATELLITE_READ_ONLY', 'errors.satelliteReadOnly'],
  ])('names %s instead of showing raw JSON', (code, key) => {
    expect(parseSaleError(fromIpc({ code }), t)).toBe(key);
  });

  // A refusal from the main is the same refusal a till would give itself — same words.
  it('translates the main’s stock refusal exactly as a local one', () => {
    expect(
      parseSaleError(fromIpc({ code: 'INSUFFICIENT_STOCK', name: 'Вода', available: 0, requested: 1 }), t),
    ).toBe('errors.insufficientStock');
  });
});
