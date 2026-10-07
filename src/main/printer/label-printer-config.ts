import type { LabelPrinterConfig, LabelPrintMode } from '../../shared/types/label-printer.types';

/**
 * The COM-port label printer's settings, one `systemSetting` row each. All are this machine's —
 * listed in LOCAL_ONLY_SETTINGS (never synced) and THIS_MACHINE_SETTINGS (kept on a LAN takeover).
 */
export const LABEL_PRINTER_KEYS = {
  mode: 'label_print_mode',
  port: 'label_bt_port',
  baudRate: 'label_bt_baud',
  widthMm: 'label_bt_width_mm',
  heightMm: 'label_bt_height_mm',
  gapMm: 'label_bt_gap_mm',
} as const satisfies Record<keyof LabelPrinterConfig, string>;

/** `spooler` keeps price tags on the Windows printer, as before this setting existed. */
export const LABEL_PRINTER_DEFAULTS: LabelPrinterConfig = {
  mode: 'spooler',
  port: 'COM3',
  baudRate: 115200,
  widthMm: 40,
  heightMm: 30,
  gapMm: 2,
};

export const LABEL_BAUD_RATES = [9600, 19200, 38400, 57600, 115200] as const;

const MODES: readonly LabelPrintMode[] = ['spooler', 'bluetooth'];

function num(raw: unknown, min: number, max: number): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/**
 * Read the config from stored strings; anything missing or malformed falls back to its default,
 * so a hand-edited or half-written row never stops a print.
 */
export function parseLabelPrinterConfig(
  stored: Record<string, string | undefined>,
): LabelPrinterConfig {
  const d = LABEL_PRINTER_DEFAULTS;
  const k = LABEL_PRINTER_KEYS;
  const mode = stored[k.mode];
  const port = stored[k.port]?.trim();
  const baud = num(stored[k.baudRate], 0, Infinity);
  return {
    mode: MODES.includes(mode as LabelPrintMode) ? (mode as LabelPrintMode) : d.mode,
    port: port ? port.toUpperCase() : d.port,
    baudRate: LABEL_BAUD_RATES.some((b) => b === baud) ? (baud as number) : d.baudRate,
    widthMm: num(stored[k.widthMm], 10, 200) ?? d.widthMm,
    heightMm: num(stored[k.heightMm], 10, 200) ?? d.heightMm,
    gapMm: num(stored[k.gapMm], 0, 20) ?? d.gapMm,
  };
}

/** Validate a config coming from the renderer. Throws on anything out of range. */
export function validateLabelPrinterConfig(input: unknown): LabelPrinterConfig {
  const c = (input ?? {}) as Partial<Record<keyof LabelPrinterConfig, unknown>>;
  const port = typeof c.port === 'string' ? c.port.trim().toUpperCase() : '';
  const widthMm = num(c.widthMm, 10, 200);
  const heightMm = num(c.heightMm, 10, 200);
  const gapMm = num(c.gapMm, 0, 20);
  if (!MODES.includes(c.mode as LabelPrintMode)) throw new Error('Invalid label print mode');
  if (!/^COM\d{1,3}$/.test(port)) throw new Error('Invalid COM port');
  if (!LABEL_BAUD_RATES.some((b) => b === c.baudRate)) throw new Error('Invalid baud rate');
  if (widthMm === null || heightMm === null || gapMm === null)
    throw new Error('Invalid label size');
  return {
    mode: c.mode as LabelPrintMode,
    port,
    baudRate: c.baudRate as number,
    widthMm,
    heightMm,
    gapMm,
  };
}
