import { blocksRoute, isAdminLocked, isCashierOnly } from './mode-store';

/**
 * The one question the product, stock, supplier and user screens ask: is master data edited
 * somewhere other than this terminal? A cashier-only store (on the web) and a satellite (on its
 * main) both answer yes; the screens do not need to know which.
 */
describe('isAdminLocked', () => {
  it('is false for an ordinary terminal', () => {
    expect(isAdminLocked({ posAdminLocked: false, isSatellite: false })).toBe(false);
  });

  it('is true for a cashier-only store', () => {
    expect(isAdminLocked({ posAdminLocked: true, isSatellite: false })).toBe(true);
  });

  it('is true for a satellite', () => {
    expect(isAdminLocked({ posAdminLocked: false, isSatellite: true })).toBe(true);
  });
});

/**
 * Users and suppliers are pulled to a cashier-only till, so it shows them read-only. A satellite's
 * live on its main, so it does not.
 */
describe('isCashierOnly', () => {
  it('is true for a cashier-only store', () => {
    expect(isCashierOnly({ posAdminLocked: true, isSatellite: false })).toBe(true);
  });

  it('is false for a satellite, even one whose store is cashier-only', () => {
    expect(isCashierOnly({ posAdminLocked: false, isSatellite: true })).toBe(false);
    expect(isCashierOnly({ posAdminLocked: true, isSatellite: true })).toBe(false);
  });

  it('is false for an ordinary terminal', () => {
    expect(isCashierOnly({ posAdminLocked: false, isSatellite: false })).toBe(false);
  });
});

describe('blocksRoute', () => {
  const ordinary = { posAdminLocked: false, isSatellite: false };
  const cashierOnly = { posAdminLocked: true, isSatellite: false };
  const satellite = { posAdminLocked: false, isSatellite: true };

  it('never blocks on an ordinary terminal', () => {
    expect(blocksRoute(ordinary, false)).toBe(false);
    expect(blocksRoute(ordinary, true)).toBe(false);
  });

  it('opens a read-only route on a cashier-only store and keeps the rest closed', () => {
    expect(blocksRoute(cashierOnly, true)).toBe(false);
    expect(blocksRoute(cashierOnly, false)).toBe(true);
  });

  it('keeps every guarded route closed on a satellite', () => {
    expect(blocksRoute(satellite, true)).toBe(true);
    expect(blocksRoute(satellite, false)).toBe(true);
    expect(blocksRoute({ posAdminLocked: true, isSatellite: true }, true)).toBe(true);
  });
});
