import {
  LabelPrinterError,
  LabelPrinterService,
  classifyOpenError,
  type SerialConnection,
  type SerialDeps,
} from './label-printer.service';

// The real module loads a native binding; these tests never touch a port.
jest.mock('serialport', () => ({ SerialPort: class {} }));

type OpenResult = Error | null;

/** A fake port that records what happens to it and answers `open` from a script. */
function fakeDeps(opts: {
  ports?: string[];
  openResults?: OpenResult[];
  writeError?: Error;
  log: string[];
}): SerialDeps {
  const openResults = [...(opts.openResults ?? [])];
  return {
    list: async () => (opts.ports ?? ['COM3']).map((path) => ({ path })),
    delay: async (ms) => {
      opts.log.push(`delay ${ms}`);
    },
    connect: (port) => {
      let open = false;
      const conn: SerialConnection = {
        get isOpen() {
          return open;
        },
        open: (cb) => {
          const err = openResults.shift() ?? null;
          opts.log.push(`open ${port} ${err ? 'fail' : 'ok'}`);
          open = !err;
          setImmediate(() => cb(err));
        },
        write: (data, cb) => {
          opts.log.push(`write ${data.toString('latin1')}`);
          setImmediate(() => cb(opts.writeError ?? null));
          return true;
        },
        drain: (cb) => setImmediate(() => cb(null)),
        close: (cb) => {
          opts.log.push(`close ${port}`);
          open = false;
          setImmediate(() => cb(null));
        },
      };
      return conn;
    },
  };
}

const job = (data: string) => ({ port: 'COM3', baudRate: 115200, data: Buffer.from(data) });

describe('LabelPrinterService', () => {
  it('opens, writes, drains and closes for each job, one job at a time', async () => {
    const log: string[] = [];
    const svc = new LabelPrinterService(fakeDeps({ log }));
    await Promise.all([svc.print(job('A')), svc.print(job('B'))]);
    expect(log).toEqual([
      'open COM3 ok',
      'write A',
      'close COM3',
      'open COM3 ok',
      'write B',
      'close COM3',
    ]);
  });

  it('keeps the queue going after a failed job', async () => {
    const log: string[] = [];
    const svc = new LabelPrinterService(
      fakeDeps({ log, openResults: [new Error('File not found'), new Error('File not found')] }),
    );
    const first = svc.print(job('A'));
    const second = svc.print(job('B'));
    await expect(first).rejects.toMatchObject({ code: 'PORT_NOT_FOUND' });
    await expect(second).resolves.toBeUndefined();
    expect(log.slice(-2)).toEqual(['write B', 'close COM3']);
  });

  it('retries the open once after a delay', async () => {
    const log: string[] = [];
    const svc = new LabelPrinterService(
      fakeDeps({ log, openResults: [new Error('The semaphore timeout period has expired.')] }),
    );
    await svc.print(job('A'));
    expect(log).toEqual(['open COM3 fail', 'delay 1500', 'open COM3 ok', 'write A', 'close COM3']);
  });

  it('reports PORT_NOT_FOUND without opening when the port is not listed', async () => {
    const log: string[] = [];
    const svc = new LabelPrinterService(fakeDeps({ log, ports: ['COM5'] }));
    await expect(svc.print(job('A'))).rejects.toMatchObject({ code: 'PORT_NOT_FOUND' });
    expect(log).toEqual([]);
  });

  it('reports WRITE_FAILED and still closes the port', async () => {
    const log: string[] = [];
    const svc = new LabelPrinterService(fakeDeps({ log, writeError: new Error('broken pipe') }));
    await expect(svc.print(job('A'))).rejects.toMatchObject({ code: 'WRITE_FAILED' });
    expect(log[log.length - 1]).toBe('close COM3');
  });

  it('classifies access denied as PORT_BUSY and anything else as PORT_NOT_FOUND', () => {
    expect(classifyOpenError('COM3', new Error('Opening COM3: Access denied')).code).toBe(
      'PORT_BUSY',
    );
    const missing = classifyOpenError('COM3', new Error('Opening COM3: File not found'));
    expect(missing).toBeInstanceOf(LabelPrinterError);
    expect(missing.code).toBe('PORT_NOT_FOUND');
  });

  it('lists ports in COM-number order', async () => {
    const svc = new LabelPrinterService(fakeDeps({ log: [], ports: ['COM10', 'COM3', 'COM1'] }));
    expect((await svc.listPorts()).map((p) => p.path)).toEqual(['COM1', 'COM3', 'COM10']);
  });
});
