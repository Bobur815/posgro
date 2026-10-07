/**
 * Price-tag label printer reached over a serial (COM) port — an XP-365B paired over Bluetooth shows
 * up on Windows as an "Outgoing" COM port. Main process: printer/label-printer.service.ts.
 */

/** Which way price tags are sent. `spooler` is the Windows printer path that existed before. */
export type LabelPrintMode = 'spooler' | 'bluetooth';

export type LabelPrinterErrorCode = 'PORT_NOT_FOUND' | 'PORT_BUSY' | 'WRITE_FAILED';

export interface LabelPrinterConfig {
  mode: LabelPrintMode;
  /** e.g. `COM3`. The number changes when the printer is re-paired. */
  port: string;
  baudRate: number;
  /** Size used by the test print; price tags take theirs from the template. */
  widthMm: number;
  heightMm: number;
  gapMm: number;
}

export interface SerialPortInfo {
  path: string;
  /** Windows' friendly name, e.g. "Standard Serial over Bluetooth link". */
  friendlyName?: string;
  manufacturer?: string;
}

/** IPC result: errors cross as data, since Electron drops custom error classes. */
export type LabelPrinterResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; value: T })
  | { ok: false; code: LabelPrinterErrorCode; message: string };
