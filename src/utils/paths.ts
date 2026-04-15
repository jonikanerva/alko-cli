import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * Return the directory where alko-cli stores its data.
 * Honors XDG_DATA_HOME, defaults to ~/.config/alko-cli on macOS/Linux.
 * Creates the directory if it doesn't exist.
 */
export function getDataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  const base = xdg && xdg.trim() ? xdg : join(homedir(), '.config');
  const dir = join(base, 'alko-cli');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Return the absolute path of the SQLite database file.
 * Can be overridden with ALKO_DB_PATH env var (e.g. for tests).
 */
export function getDbPath(): string {
  const override = process.env.ALKO_DB_PATH;
  if (override && override.trim()) return override;
  return join(getDataDir(), 'alko.db');
}
