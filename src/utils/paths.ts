import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * Return the directory where alko-cli stores its data.
 *
 * Resolution order:
 *   1. $XDG_DATA_HOME (if set and non-blank) → $XDG_DATA_HOME/alko-cli
 *      — opt-in for users who follow the XDG Base Directory spec.
 *   2. Default → ~/.alko-cli
 *      — matches the dotfile convention used by aws, docker, cargo,
 *        nvm, ollama, etc. Keeps everything alko-cli owns in one
 *        discoverable place under $HOME.
 *
 * Creates the directory if it doesn't exist.
 */
export function getDataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  const dir =
    xdg && xdg.trim() ? join(xdg, 'alko-cli') : join(homedir(), '.alko-cli');
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
