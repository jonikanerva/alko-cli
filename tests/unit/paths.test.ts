import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDataDir, getDbPath } from '../../src/utils/paths.js';

/**
 * Path resolution is env-driven, so each test saves/restores the
 * relevant vars and points HOME at a fresh tempdir — `getDataDir`
 * has a `mkdirSync` side effect and we don't want it scribbling
 * into the developer's real home.
 */
describe('paths', () => {
  let originalHome: string | undefined;
  let originalXdg: string | undefined;
  let originalAlkoDbPath: string | undefined;
  let tempHome: string;

  beforeEach(() => {
    originalHome = process.env.HOME;
    originalXdg = process.env.XDG_DATA_HOME;
    originalAlkoDbPath = process.env.ALKO_DB_PATH;

    tempHome = mkdtempSync(join(tmpdir(), 'alko-paths-test-'));
    process.env.HOME = tempHome;
    delete process.env.XDG_DATA_HOME;
    delete process.env.ALKO_DB_PATH;
  });

  afterEach(() => {
    restore('HOME', originalHome);
    restore('XDG_DATA_HOME', originalXdg);
    restore('ALKO_DB_PATH', originalAlkoDbPath);
    rmSync(tempHome, { recursive: true, force: true });
  });

  it('defaults to ~/.alko-cli/alko.db', () => {
    expect(getDbPath()).toBe(join(tempHome, '.alko-cli', 'alko.db'));
  });

  it('creates the data directory on first access', () => {
    const dir = getDataDir();
    expect(dir).toBe(join(tempHome, '.alko-cli'));
    expect(existsSync(dir)).toBe(true);
  });

  it('places the DB under $XDG_DATA_HOME/alko-cli when that var is set', () => {
    const xdgRoot = join(tempHome, 'xdg-data');
    process.env.XDG_DATA_HOME = xdgRoot;
    expect(getDbPath()).toBe(join(xdgRoot, 'alko-cli', 'alko.db'));
  });

  it('treats a blank XDG_DATA_HOME as unset and falls back to ~/.alko-cli', () => {
    process.env.XDG_DATA_HOME = '   ';
    expect(getDbPath()).toBe(join(tempHome, '.alko-cli', 'alko.db'));
  });

  it('lets ALKO_DB_PATH override everything else', () => {
    const custom = join(tempHome, 'custom', 'alko.db');
    process.env.ALKO_DB_PATH = custom;
    process.env.XDG_DATA_HOME = join(tempHome, 'xdg');
    expect(getDbPath()).toBe(custom);
  });

  it('treats a blank ALKO_DB_PATH as unset', () => {
    process.env.ALKO_DB_PATH = '   ';
    expect(getDbPath()).toBe(join(tempHome, '.alko-cli', 'alko.db'));
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
