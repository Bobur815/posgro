import { SerialPort } from 'serialport';
import { buildTestLabelTSPL, toCP1251, type TsplTestLabel } from './tspl-builder';
import type { LabelPrinterErrorCode, SerialPortInfo } from '../../shared/types/label-printer.types';

/**
 * Sends TSPL to a label printer on a serial (COM) port — the XP-365B paired over Bluetooth, which
 * Windows exposes as an "Outgoing" COM port.
 *
 * Each job opens the port, writes, drains and closes it again; nothing holds the port between
 * jobs. A Bluetooth printer that went to sleep, or was re-paired under a new COM number, then only
 * costs the job in hand, and the next one starts clean. Jobs run one at a time through a queue so
 * two prints can never interleave their bytes on the wire.
 */

export class LabelPrinterError extends Error {
  constructor(
    readonly code: LabelPrinterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LabelPrinterError';
  }
}

export interface LabelPrintJob {
  port: string;
  baudRate: number;
  data: Buffer;
}

/** The part of `SerialPort` this service uses, so tests can swap in a fake. */
export interface SerialConnection {
  open(cb: (err: Error | null) => void): void;
  write(data: Buffer, cb: (err: Error | null | undefined) => void): boolean;
  drain(cb: (err: Error | null) => void): void;
  close(cb: (err: Error | null) => void): void;
  readonly isOpen: boolean;
}

export interface SerialDeps {
  list(): Promise<SerialPortInfo[]>;
  connect(port: string, baudRate: number): SerialConnection;
  delay(ms: number): Promise<void>;
}

/** The first Bluetooth open often fails while Windows wakes the link; one retry covers it. */
const OPEN_RETRY_DELAY_MS = 1500;
/** A sleeping Bluetooth printer can leave `open` hanging rather than failing. */
const OPEN_TIMEOUT_MS = 8000;
const WRITE_TIMEOUT_MS = 15000;

const realDeps: SerialDeps = {
  async list() {
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      // `friendlyName` is filled on Windows only and is not in the cross-platform PortInfo type.
      friendlyName: (p as { friendlyName?: string }).friendlyName,
      manufacturer: p.manufacturer,
    }));
  },
  connect(port, baudRate) {
    return new SerialPort({ path: port, baudRate, autoOpen: false });
  },
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Map a Windows serial error to a code the cashier can act on. Messages come from bindings-cpp,
 * e.g. "Opening COM3: File not found", "Opening COM3: Access denied", "Opening COM5: The semaphore
 * timeout period has expired" (the paired printer is off).
 */
export function classifyOpenError(port: string, err: Error): LabelPrinterError {
  if (/access denied|busy|in use/i.test(err.message)) {
    return new LabelPrinterError('PORT_BUSY', `${port}: ${err.message}`);
  }
  return new LabelPrinterError('PORT_NOT_FOUND', `${port}: ${err.message}`);
}

function comNumber(path: string): number {
  const m = /^COM(\d+)$/i.exec(path);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

export class LabelPrinterService {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: SerialDeps = realDeps) {}

  /** COM ports Windows knows about, COM1, COM2 … COM10 in numeric order. */
  async listPorts(): Promise<SerialPortInfo[]> {
    const ports = await this.deps.list();
    return [...ports].sort(
      (a, b) => comNumber(a.path) - comNumber(b.path) || a.path.localeCompare(b.path),
    );
  }

  /** Queue a job; resolves once its bytes are drained to the port and the port is closed. */
  print(job: LabelPrintJob): Promise<void> {
    const run = this.tail.then(
      () => this.runJob(job),
      () => this.runJob(job),
    );
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** Print one self-describing label with the configured port, baud and size. */
  testPrint(cfg: TsplTestLabel & { baudRate: number }): Promise<void> {
    return this.print({
      port: cfg.port,
      baudRate: cfg.baudRate,
      data: toCP1251(buildTestLabelTSPL(cfg)),
    });
  }

  private async runJob(job: LabelPrintJob): Promise<void> {
    const known = await this.deps.list().catch(() => null);
    if (known && !known.some((p) => p.path.toUpperCase() === job.port.toUpperCase())) {
      throw new LabelPrinterError('PORT_NOT_FOUND', `${job.port} is not present`);
    }

    let conn: SerialConnection;
    try {
      conn = await this.open(job);
    } catch (first) {
      console.warn(`[label-printer] open ${job.port} failed, retrying:`, (first as Error).message);
      await this.deps.delay(OPEN_RETRY_DELAY_MS);
      conn = await this.open(job);
    }

    try {
      await this.write(conn, job.data);
    } finally {
      await new Promise<void>((resolve) => conn.close(() => resolve()));
    }
  }

  private open(job: LabelPrintJob): Promise<SerialConnection> {
    const conn = this.deps.connect(job.port, job.baudRate);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(
          new LabelPrinterError(
            'PORT_NOT_FOUND',
            `${job.port}: no answer in ${OPEN_TIMEOUT_MS} ms`,
          ),
        );
      }, OPEN_TIMEOUT_MS);
      conn.open((err) => {
        if (settled) {
          // Opened after we gave up on it: let it go, or the next job finds the port busy.
          if (!err && conn.isOpen) conn.close(() => undefined);
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (err) reject(classifyOpenError(job.port, err));
        else resolve(conn);
      });
    });
  }

  private write(conn: SerialConnection, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new LabelPrinterError('WRITE_FAILED', message));
      };
      const timer = setTimeout(() => fail(`no drain in ${WRITE_TIMEOUT_MS} ms`), WRITE_TIMEOUT_MS);
      conn.write(data, (werr) => {
        if (werr) return fail(werr.message);
        conn.drain((derr) => {
          if (derr) return fail(derr.message);
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        });
      });
    });
  }
}
