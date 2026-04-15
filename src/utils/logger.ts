/**
 * Minimal stderr-only logger for CLI usage.
 * stdout is reserved for the CLI's own output (JSON/table), so all
 * diagnostic messages go to stderr where they can be filtered with 2>/dev/null.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
}

const activeLevel = LEVELS[resolveLevel()];

function write(level: LogLevel, message: string, context?: unknown): void {
  if (LEVELS[level] < activeLevel) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] ${level.toUpperCase()}`;
  if (context !== undefined) {
    process.stderr.write(`${prefix} ${message} ${JSON.stringify(context)}\n`);
  } else {
    process.stderr.write(`${prefix} ${message}\n`);
  }
}

export const logger = {
  debug: (msg: string, ctx?: unknown) => write('debug', msg, ctx),
  info: (msg: string, ctx?: unknown) => write('info', msg, ctx),
  warn: (msg: string, ctx?: unknown) => write('warn', msg, ctx),
  error: (msg: string, ctx?: unknown) => write('error', msg, ctx),
};
