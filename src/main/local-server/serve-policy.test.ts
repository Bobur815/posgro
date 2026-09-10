import { shouldServeLocally } from './serve-policy';

/**
 * This decides whether a till opens a listening socket on a shop's network, so the case that
 * matters most is the one where nothing should change: every terminal in the field upgrades into
 * `isMain = true`, and none of them asked to serve anything.
 */

describe('shouldServeLocally', () => {
  it('serves an OFFLINE_ONLY store, which has no VPS to serve its dashboard', () => {
    expect(shouldServeLocally({ mode: 'OFFLINE_ONLY', isMain: true }, 0)).toBe(true);
  });

  it('serves a main that has satellites, in ONLINE mode', () => {
    expect(shouldServeLocally({ mode: 'ONLINE', isMain: true }, 1)).toBe(true);
  });

  /**
   * The whole fleet upgrades to isMain = true (§10.1). If that alone were enough to serve, the
   * release would open a port in every shop running the app, none of which asked for satellites.
   */
  it.each([
    ['never activated', { mode: null, isMain: true }],
    ['ordinary online store', { mode: 'ONLINE', isMain: true }],
    ['unrecognised mode from a newer server', { mode: 'SOMETHING_NEW', isMain: true }],
  ])('does not serve a main with no satellites (%s)', (_label, config) => {
    expect(shouldServeLocally(config, 0)).toBe(false);
  });

  // A satellite answers nobody. Rows here would be leftovers from before it was demoted.
  it('never serves from a satellite, even with stale paired rows', () => {
    expect(shouldServeLocally({ mode: 'ONLINE', isMain: false }, 3)).toBe(false);
  });

  // An OFFLINE_ONLY satellite still serves nothing of its own — but the store-level rule wins,
  // because that is what the shop's dashboard is served from today and demoting a till must not
  // take the dashboard offline.
  it('still serves an OFFLINE_ONLY store regardless of role', () => {
    expect(shouldServeLocally({ mode: 'OFFLINE_ONLY', isMain: false }, 0)).toBe(true);
  });

  it.each([
    ['config unreadable', null],
    ['config missing', undefined],
    ['role absent on an old row', { mode: 'ONLINE' }],
  ])('does not serve when the config says nothing (%s)', (_label, config) => {
    expect(shouldServeLocally(config, 2)).toBe(false);
  });
});
