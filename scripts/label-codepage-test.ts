// scripts/label-codepage-test.ts
//
// Which text encoding does the XP-365B print Cyrillic in? Prints two 40x30 labels:
//   1. CODEPAGE 1251 + cp1251 bytes  (what the spooler path has always sent)
//   2. CODEPAGE UTF-8 + UTF-8 bytes
// Each has Russian, Uzbek Cyrillic (Ў is in cp1251; Қ Ғ Ҳ are not and the app prints them as К Г Х)
// and Uzbek Latin.
//
// Run: npx tsx scripts/label-codepage-test.ts [COM3] [115200]
import { SerialPort } from 'serialport';
import { toCP1251 } from '../src/main/printer/tspl-builder';

const path = process.argv[2] ?? 'COM3';
const baudRate = Number(process.argv[3] ?? 115200);

const LINES = ['Молоко Ёё Щщ Ъъ', 'Ўў Ққ Ғғ Ҳҳ', "O'zbek g'alla oʻgʼ"];

function label(codepage: string, header: string): string {
  return [
    'SIZE 40 mm,30 mm',
    'GAP 2 mm,0',
    `CODEPAGE ${codepage}`,
    'CLS',
    `TEXT 16,16,"2",0,1,1,"${header}"`,
    ...LINES.map((l, i) => `TEXT 16,${56 + i * 40},"3",0,1,1,"${l}"`),
    'PRINT 1,1',
    '',
  ].join('\r\n');
}

const data = Buffer.concat([
  toCP1251(label('1251', '1) CODEPAGE 1251')),
  Buffer.from(label('UTF-8', '2) CODEPAGE UTF-8'), 'utf8'),
]);

const port = new SerialPort({ path, baudRate, autoOpen: false });
port.open((err) => {
  if (err) return console.error('open failed:', err.message);
  port.write(data, (werr) => {
    if (werr) console.error('write failed:', werr.message);
    port.drain(() => port.close(() => console.log(`sent ${data.length} bytes to ${path}`)));
  });
});
