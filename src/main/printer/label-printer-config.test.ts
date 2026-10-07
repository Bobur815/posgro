import {
  LABEL_PRINTER_DEFAULTS,
  LABEL_PRINTER_KEYS as K,
  parseLabelPrinterConfig,
  validateLabelPrinterConfig,
} from './label-printer-config';

describe('parseLabelPrinterConfig', () => {
  it('defaults to the spooler path, COM3, 115200, 40x30, gap 2 on a fresh till', () => {
    expect(parseLabelPrinterConfig({})).toEqual({
      mode: 'spooler',
      port: 'COM3',
      baudRate: 115200,
      widthMm: 40,
      heightMm: 30,
      gapMm: 2,
    });
  });

  it('reads stored values and falls back per field on garbage', () => {
    expect(
      parseLabelPrinterConfig({
        [K.mode]: 'bluetooth',
        [K.port]: 'com7',
        [K.baudRate]: '9600',
        [K.widthMm]: '58',
        [K.heightMm]: 'abc',
        [K.gapMm]: '-1',
      }),
    ).toEqual({
      ...LABEL_PRINTER_DEFAULTS,
      mode: 'bluetooth',
      port: 'COM7',
      baudRate: 9600,
      widthMm: 58,
    });
  });
});

describe('validateLabelPrinterConfig', () => {
  const ok = { ...LABEL_PRINTER_DEFAULTS, mode: 'bluetooth', port: ' com12 ' };

  it('normalizes the port', () => {
    expect(validateLabelPrinterConfig(ok).port).toBe('COM12');
  });

  it.each([
    ['mode', { ...ok, mode: 'usb' }],
    ['port', { ...ok, port: '/dev/ttyS0' }],
    ['baud', { ...ok, baudRate: 1234 }],
    ['width', { ...ok, widthMm: 5 }],
    ['gap', { ...ok, gapMm: 50 }],
  ])('rejects a bad %s', (_name, input) => {
    expect(() => validateLabelPrinterConfig(input)).toThrow();
  });
});
