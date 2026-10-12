import {
  LOCAL_ONLY_SETTINGS,
  RECEIPT_LAYOUT_SETTINGS,
  SATELLITE_OWN_RECEIPT,
  isSatelliteOwnSetting,
  satelliteKeepsOnPull,
} from './local-only-settings';
import { LABEL_PRINTER_KEYS } from '../printer/label-printer-config';

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

  it.each(['store_name', 'store_address', 'tax_rate', 'regos_vcr_enabled'])(
    'leaves the store setting %s to the main',
    (key) => expect(isSatelliteOwnSetting(key)).toBe(false),
  );

  // Scoped to satellites on purpose: the fleet's VPS sync must not change because of this.
  it('does not widen what every terminal keeps off the VPS', () => {
    expect(LOCAL_ONLY_SETTINGS.has('cash_drawer_enabled')).toBe(false);
    expect(LOCAL_ONLY_SETTINGS.has('bulk_weigh_enabled')).toBe(false);
  });
});

describe('LOCAL_ONLY_SETTINGS', () => {
  // Per-till sync bookkeeping. Uploaded, another till's settings pull would adopt it.
  it.each(['debt_ledger_cursor', 'debt_ledger_balance_mode', 'fiscal_sync_backfill'])(
    'keeps %s on this till',
    (key) => {
      expect(LOCAL_ONLY_SETTINGS.has(key)).toBe(true);
    },
  );
});

describe('label printer settings', () => {
  it.each(Object.values(LABEL_PRINTER_KEYS))('keeps %s on this machine', (key) => {
    expect(LOCAL_ONLY_SETTINGS.has(key)).toBe(true);
  });
});

describe('receipt layout on a satellite', () => {
  it.each(['receipt_header', 'receipt_logo_top', 'receipt_show_payment', SATELLITE_OWN_RECEIPT])(
    'lets a satellite set %s',
    (key) => expect(isSatelliteOwnSetting(key)).toBe(true),
  );

  it('follows the main until the satellite saved its own layout', () => {
    for (const key of RECEIPT_LAYOUT_SETTINGS) {
      expect(satelliteKeepsOnPull(key, false)).toBe(false);
      expect(satelliteKeepsOnPull(key, true)).toBe(true);
    }
  });

  it('changes nothing for other keys', () => {
    expect(satelliteKeepsOnPull('cash_drawer_enabled', false)).toBe(true);
    expect(satelliteKeepsOnPull('store_name', true)).toBe(false);
  });

  // Satellites only: the fleet's VPS sync is untouched.
  it('keeps the layout off the VPS exclusion list', () => {
    for (const key of RECEIPT_LAYOUT_SETTINGS) expect(LOCAL_ONLY_SETTINGS.has(key)).toBe(false);
  });
});
