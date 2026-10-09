/**
 * The sale path's asl-belgisi answers: remembered per code so the fiscal gate rarely waits, never
 * remembered when the registry could not be asked, and one request per code however many ask.
 */

const verifyCirculation = jest.fn();
jest.mock('./circulation-check', () => ({
  verifyCirculation: (...a: unknown[]) => verifyCirculation(...a),
}));

import { checkCirculation, clearCirculationCache, SALE_PATH_TIMEOUT_MS } from './circulation-cache';

const CODE = '0104780047860466215abcDEF\x1d93Abcd';

beforeEach(() => {
  clearCirculationCache();
  verifyCirculation.mockReset();
});

describe('checkCirculation', () => {
  it('classifies the registry answer and asks with the short sale-path timeout', async () => {
    verifyCirculation.mockResolvedValue({ reachable: true, isValid: true, status: 'WITHDRAWN' });

    await expect(checkCirculation(CODE)).resolves.toEqual({
      reachable: true,
      verdict: 'OUT',
      status: 'WITHDRAWN',
    });
    expect(verifyCirculation).toHaveBeenCalledWith(CODE, SALE_PATH_TIMEOUT_MS);
  });

  it('calls a code the registry does not know OUT (NOT_FOUND)', async () => {
    verifyCirculation.mockResolvedValue({ reachable: true, isValid: false });
    await expect(checkCirculation(CODE)).resolves.toMatchObject({
      verdict: 'OUT',
      status: 'NOT_FOUND',
    });
  });

  it('keeps an unrecognised status UNKNOWN', async () => {
    verifyCirculation.mockResolvedValue({
      reachable: true,
      isValid: true,
      status: 'SOMETHING_NEW',
    });
    await expect(checkCirculation(CODE)).resolves.toMatchObject({
      reachable: true,
      verdict: 'UNKNOWN',
    });
  });

  it('remembers an answer, so the second ask costs no request', async () => {
    verifyCirculation.mockResolvedValue({ reachable: true, isValid: true, status: 'INTRODUCED' });

    await checkCirculation(CODE);
    await expect(checkCirculation(CODE)).resolves.toMatchObject({ verdict: 'IN' });
    expect(verifyCirculation).toHaveBeenCalledTimes(1);
  });

  it('asks again once the answer is older than six hours', async () => {
    verifyCirculation.mockResolvedValue({ reachable: true, isValid: true, status: 'INTRODUCED' });

    await checkCirculation(CODE);
    await checkCirculation(CODE, { now: Date.now() + 6 * 60 * 60 * 1000 + 1 });
    expect(verifyCirculation).toHaveBeenCalledTimes(2);
  });

  // A manual retry of a blocked receipt must see the registry as it is now.
  it('asks again when told fresh, and remembers the new answer', async () => {
    verifyCirculation
      .mockResolvedValueOnce({ reachable: true, isValid: true, status: 'WITHDRAWN' })
      .mockResolvedValueOnce({ reachable: true, isValid: true, status: 'INTRODUCED' });

    await checkCirculation(CODE);
    await expect(checkCirculation(CODE, { fresh: true, timeoutMs: 8000 })).resolves.toMatchObject({
      verdict: 'IN',
    });
    expect(verifyCirculation).toHaveBeenLastCalledWith(CODE, 8000);
    await expect(checkCirculation(CODE)).resolves.toMatchObject({ verdict: 'IN' });
    expect(verifyCirculation).toHaveBeenCalledTimes(2);
  });

  it('does not remember an unreachable registry', async () => {
    verifyCirculation
      .mockResolvedValueOnce({ reachable: false })
      .mockResolvedValueOnce({ reachable: true, isValid: true, status: 'INTRODUCED' });

    await expect(checkCirculation(CODE)).resolves.toEqual({ reachable: false, verdict: 'UNKNOWN' });
    await expect(checkCirculation(CODE)).resolves.toMatchObject({ verdict: 'IN' });
  });

  it('shares one request between concurrent asks for a code', async () => {
    let answer: (v: unknown) => void = () => {};
    verifyCirculation.mockReturnValue(new Promise((r) => (answer = r)));

    const both = Promise.all([checkCirculation(CODE), checkCirculation(CODE)]);
    answer({ reachable: true, isValid: true, status: 'INTRODUCED' });
    await expect(both).resolves.toEqual([
      expect.objectContaining({ verdict: 'IN' }),
      expect.objectContaining({ verdict: 'IN' }),
    ]);
    expect(verifyCirculation).toHaveBeenCalledTimes(1);
  });

  it('never throws', async () => {
    verifyCirculation.mockRejectedValue(new Error('boom'));
    await expect(checkCirculation(CODE)).resolves.toEqual({ reachable: false, verdict: 'UNKNOWN' });
  });

  it('strips the scanner prefix before asking', async () => {
    verifyCirculation.mockResolvedValue({ reachable: true, isValid: true, status: 'INTRODUCED' });
    await checkCirculation(`]d2${CODE}`);
    expect(verifyCirculation).toHaveBeenCalledWith(CODE, SALE_PATH_TIMEOUT_MS);
  });
});
