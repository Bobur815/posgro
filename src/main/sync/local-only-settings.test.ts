import { LOCAL_ONLY_SETTINGS, isSatelliteOwnSetting } from './local-only-settings';

/**
 * Which settings a satellite may write for itself — the allowlist the write guard in
 * `settings:set` checks. Everything else is its main's, and refused there.
 */
describe('isSatelliteOwnSetting', () => {
  it.each(['printer_name', 'label_printer_name', 'label_width_mm'])(
    'lets a satellite set its own %s (machine config, never synced)',
    (key) => expect(isSatelliteOwnSetting(key)).toBe(true),
  );

  // The ones the guard used to refuse: a satellite could not switch its own drawer or scale on.
  it.each(['cash_drawer_enabled', 'bulk_weigh_enabled', 'price_tag_templates'])(
    'lets a satellite set %s, which describes its own till',
    (key) => expect(isSatelliteOwnSetting(key)).toBe(true),
  );

  it.each(['receipt_header', 'store_name', 'tax_rate', 'regos_vcr_enabled'])(
    'leaves the store setting %s to the main',
    (key) => expect(isSatelliteOwnSetting(key)).toBe(false),
  );

  // Scoped to satellites on purpose: the fleet's VPS sync must not change because of this.
  it('does not widen what every terminal keeps off the VPS', () => {
    expect(LOCAL_ONLY_SETTINGS.has('cash_drawer_enabled')).toBe(false);
    expect(LOCAL_ONLY_SETTINGS.has('bulk_weigh_enabled')).toBe(false);
  });
});
