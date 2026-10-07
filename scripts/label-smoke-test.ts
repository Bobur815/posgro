// scripts/label-smoke-test.ts
import { SerialPort } from 'serialport';

const port = new SerialPort({ path: 'COM3', baudRate: 115200, autoOpen: false });

port.open((err) => {
  if (err) return console.error('open failed:', err.message);

  const tspl = [
    'SIZE 40 mm,30 mm',
    'GAP 2 mm,0',
    'CLS',
    'TEXT 20,20,"3",0,1,1,"Test"',
    'BARCODE 20,60,"128",50,1,0,2,2,"123456789"',
    'PRINT 1,1',
    '',
  ].join('\r\n');

  port.write(tspl, (werr) => {
    if (werr) console.error('write failed:', werr.message);
    port.drain(() => port.close());
  });
});