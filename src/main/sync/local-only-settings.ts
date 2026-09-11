/**
 * System-setting keys that never cross the wire in either direction.
 *
 * This list is deliberately shared by both sync directions. It used to be duplicated in
 * upload-sync.ts and products-sync.ts, and the two copies had already drifted — a key excluded
 * from upload but not from download is worse than not excluding it at all, because the server's
 * stale copy then silently overwrites the terminal's own value on the next cycle.
 */
export const LOCAL_ONLY_SETTINGS = new Set([
  // ── Sync bookkeeping: meaningful only to this terminal ──
  'server_token',
  'last_product_sync',
  'last_sale_sync',
  'last_upload_sync',
  'last_audit_log_sync',
  'ai_token_limit_daily',

  // ── Machine-scoped hardware config ──
  // Windows device names and a physical label size. They describe the box this terminal runs on,
  // not the store, so a second terminal's values must never land here. These matter more now that
  // a cashier-only store stops uploading settings entirely: without the download exclusion, one
  // terminal's printer name would propagate to every other terminal in the store.
  'printer_name',
  'label_printer_name',
  'label_width_mm',

  // ── Machine-scoped fiscal (REGOS VCR) config ──
  // The VCR is a local service: its URL must resolve to this machine (127.0.0.1, never a shared
  // hostname) and the POS id identifies this physical register to the fiscal registrar.
  'regos_vcr_url',
  'regos_vcr_pos_id',
  // Encrypted with THIS terminal's safeStorage/DPAPI key, so only this machine can decrypt it.
  // Syncing it lets another terminal's blob overwrite the local row, after which decryption
  // throws and the cashier password silently resolves to ''.
  'regos_vcr_password_enc',

  // ── LAN credentials (tasks/LAN_MAIN_TERMINAL_PLAN.md) ──
  // The key this main signs LAN tokens with, and a satellite's device secret. Either one leaving
  // the machine would let another terminal of the store impersonate this one on the shop network.
  'lan_signing_secret',
  'lan_device_secret',
  // Who is signed in at a satellite, kept so an open session survives a restart read-only (§6.9).
  'lan_session_user',
]);

/**
 * Settings that describe a satellite's own till, on top of `LOCAL_ONLY_SETTINGS`: whether a cash
 * drawer and a USB scale are attached, and the price-tag layouts sized for its label printer.
 *
 * A satellite may write these (the write guard refuses store settings there), and its pull from
 * the main skips them — otherwise the main's value would overwrite the till's own on the next
 * cycle, and a satellite could never turn its drawer on.
 *
 * **Scoped to satellites on purpose.** They are arguably machine settings for every terminal, but
 * moving them into `LOCAL_ONLY_SETTINGS` would change VPS sync across the whole fleet — a newly set
 * up terminal currently inherits them from the server — and that is a decision of its own
 * (tasks/LAN_MAIN_TERMINAL_PLAN.md §12.3).
 */
export const SATELLITE_MACHINE_SETTINGS = new Set([
  'cash_drawer_enabled',
  'bulk_weigh_enabled',
  'price_tag_templates',
]);

/** Whether a satellite owns this setting itself, rather than taking its main's. */
export function isSatelliteOwnSetting(key: string): boolean {
  return LOCAL_ONLY_SETTINGS.has(key) || SATELLITE_MACHINE_SETTINGS.has(key);
}
