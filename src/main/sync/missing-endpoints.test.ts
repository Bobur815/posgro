import {
  RECHECK_MS,
  endpointKnownMissing,
  noteEndpointStatus,
  resetMissingEndpoints,
} from './missing-endpoints';

/**
 * A till ahead of its server must not 404 on every sync cycle: fail2ban's nginx-404 jail counts
 * those, and every till of a shop shares one IP.
 */
describe('missing endpoints', () => {
  beforeEach(resetMissingEndpoints);

  it('stays quiet after a 404, then asks once more', () => {
    noteEndpointStatus('x', 404, 0);
    expect(endpointKnownMissing('x', 1)).toBe(true);
    expect(endpointKnownMissing('x', RECHECK_MS - 1)).toBe(true);
    expect(endpointKnownMissing('x', RECHECK_MS)).toBe(false);
  });

  it('forgets the 404 as soon as the server answers anything else', () => {
    noteEndpointStatus('x', 404, 0);
    noteEndpointStatus('x', 201, 1);
    expect(endpointKnownMissing('x', 2)).toBe(false);
  });

  it('does not treat other failures as a missing endpoint', () => {
    noteEndpointStatus('x', 500, 0);
    expect(endpointKnownMissing('x', 1)).toBe(false);
  });
});
