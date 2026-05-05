import { ipcMain } from 'electron';
import log from 'electron-log/main';

export interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

const buffer: LogEntry[] = [];
const MAX_BUFFER = 500;

log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Custom transport: buffer info/warn/error for periodic upload to VPS
(log.transports as Record<string, unknown>).vpsBuffer = (message: { level: string; data: unknown[] }) => {
  const level = message.level as LogEntry['level'];
  if (level !== 'info' && level !== 'warn' && level !== 'error') return;
  if (buffer.length >= MAX_BUFFER) return;
  buffer.push({
    ts: new Date().toISOString(),
    level,
    msg: message.data.map(d => {
      if (d instanceof Error) return d.stack ?? d.message;
      if (typeof d === 'object' && d !== null) {
        try { return JSON.stringify(d); } catch { return String(d); }
      }
      return String(d);
    }).join(' '),
  });
};

// Hooks console.* → log.* so all existing console calls are captured
log.initialize();

// Receive error/warn/info entries forwarded from the renderer process
ipcMain.on('log:renderer', (_event, level: string, msg: string) => {
  if (level === 'error') log.error('[renderer]', msg);
  else if (level === 'warn') log.warn('[renderer]', msg);
  else log.info('[renderer]', msg);
});

export function flushLogs(): LogEntry[] {
  return buffer.splice(0, 200);
}

export { log };
