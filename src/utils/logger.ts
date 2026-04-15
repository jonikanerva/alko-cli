/**
 * Minimal stderr-only logger for CLI usage.
 * stdout is reserved for the CLI's own output (JSON/table), so all
 * diagnostic messages go to stderr where they can be filtered with 2>/dev/null.
 *
 * Default level is `warn` so routine CLI runs stay silent. Flip it with
 * `--debug` (wired in cli.ts) or the `LOG_LEVEL` env var for scripts.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function parseLevel(raw: string | undefined): LogLevel | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  return v === 'debug' || v === 'info' || v === 'warn' || v === 'error' ? v : null;
}

let activeLevel = LEVELS[parseLevel(process.env.LOG_LEVEL) ?? 'warn'];

/**
 * Override the active log level at runtime. Used by the CLI root to honour
 * `--debug` before command actions start emitting output.
 */
export function setLogLevel(level: LogLevel): void {
  activeLevel = LEVELS[level];
}

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
