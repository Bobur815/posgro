import { isAdminLocked } from './mode-store';

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
