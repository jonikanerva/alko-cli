/**
 * End-to-end CLI integration tests. Spawns the built `alko` binary against
 * a temporary SQLite file pre-seeded with deterministic test products, then
 * verifies its output for each command.
 *
 * Running the compiled binary avoids Vite's module-graph concerns with the
 * experimental `node:sqlite` builtin — Node's own loader handles it at
 * runtime. The test catalog is materialised by `seedTestCatalog`
 * (tests/helpers/seed-db.ts) — no network, no Playwright.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeProduct, seedTestCatalog } from '../helpers/seed-db.js';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..', '..');
const CLI_ENTRY = join(PROJECT_ROOT, 'dist', 'cli.js');

function runCli(args: string[], env: Record<string, string>): string {
  return execFileSync('node', [CLI_ENTRY, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runCliWithStderr(
  args: string[],
  env: Record<string, string>
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', [CLI_ENTRY, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('alko CLI end-to-end', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeAll(() => {
    if (!existsSync(CLI_ENTRY)) {
      execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    }

    tmpDir = mkdtempSync(join(tmpdir(), 'alko-cli-e2e-'));
    dbPath = join(tmpDir, 'e2e.db');

    seedTestCatalog(dbPath, [
      makeProduct({ id: '000001', name: 'Chateau Ranska', country: 'Ranska', price: 12 }),
      makeProduct({ id: '000002', name: 'Barolo Italia', country: 'Italia', price: 25 }),
      makeProduct({ id: '000003', name: 'Rioja Espanja', country: 'Espanja', price: 18 }),
      makeProduct({
        id: '000004',
        name: 'Belgialainen IPA',
        type: 'oluet',
        beerType: 'ipa',
        country: 'Belgia',
        bottleSize: '0,33 l',
        alcoholPercentage: 6.2,
        price: 4,
      }),
    ]);
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('--help prints top-level commands', () => {
    const out = runCli(['--help'], {});
    expect(out).toMatch(/update/);
    expect(out).toMatch(/list/);
    expect(out).toMatch(/availability/);
    expect(out).toMatch(/show/);
    expect(out).toMatch(/stores/);
    expect(out).toMatch(/status/);
  });

  it('filters products by country', () => {
    const out = runCli(['list', '--country', 'Ranska', '--json'], {
      ALKO_DB_PATH: dbPath,
    });
    const { products, total } = JSON.parse(out.trim());
    expect(total).toBe(1);
    expect(products[0].name).toBe('Chateau Ranska');
  });

  it('filters products by type + beer type', () => {
    const out = runCli(
      ['list', '--type', 'oluet', '--beer-type', 'ipa', '--json'],
      { ALKO_DB_PATH: dbPath }
    );
    const { products } = JSON.parse(out.trim());
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe('000004');
  });

  it('honours --sort on a text query (relevance is only the default)', () => {
    // Before the fix, FTS search forced relevance order and silently
    // ignored --sort. Seed a small dedicated catalog so we can assert
    // the ordering deterministically.
    const sortDb = join(tmpDir, 'sort.db');
    seedTestCatalog(sortDb, [
      makeProduct({ id: '000101', name: 'Chianti A', country: 'Italia', price: 10 }),
      makeProduct({ id: '000102', name: 'Chianti B', country: 'Italia', price: 25 }),
      makeProduct({ id: '000103', name: 'Chianti C', country: 'Italia', price: 15 }),
    ]);

    const descOut = runCli(
      ['list', '--query', 'chianti', '--sort', 'price', '--order', 'desc', '--json'],
      { ALKO_DB_PATH: sortDb }
    );
    const descPrices = JSON.parse(descOut.trim()).products.map(
      (p: { price: number }) => p.price
    );
    expect(descPrices).toEqual([25, 15, 10]);

    const ascOut = runCli(
      ['list', '--query', 'chianti', '--sort', 'price', '--json'],
      { ALKO_DB_PATH: sortDb }
    );
    const ascPrices = JSON.parse(ascOut.trim()).products.map(
      (p: { price: number }) => p.price
    );
    expect(ascPrices).toEqual([10, 15, 25]);
  });

  it('applies price bounds', () => {
    const out = runCli(
      ['list', '--min-price', '15', '--max-price', '30', '--json'],
      { ALKO_DB_PATH: dbPath }
    );
    const { products } = JSON.parse(out.trim());
    expect(products.map((p: { id: string }) => p.id).sort()).toEqual([
      '000002',
      '000003',
    ]);
  });

  it('shows a product by ID', () => {
    const out = runCli(['show', '000001', '--json'], { ALKO_DB_PATH: dbPath });
    const product = JSON.parse(out.trim());
    expect(product.id).toBe('000001');
    expect(product.country).toBe('Ranska');
  });

  it('reports catalog status', () => {
    const out = runCli(['status', '--json'], { ALKO_DB_PATH: dbPath });
    const status = JSON.parse(out.trim());
    expect(status.products.count).toBe(4);
    expect(status.schemaVersion).toBe('1');
    expect(status.products.lastSync).toBeTruthy();
  });

  it('rejects non-numeric availability product ids', () => {
    const result = runCliWithStderr(['availability', 'bad-id'], {
      ALKO_DB_PATH: dbPath,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/must be a numeric ID/);
  });

  it('exits 1 when show cannot find the product', () => {
    const result = runCliWithStderr(['show', '999999'], {
      ALKO_DB_PATH: dbPath,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not found/);
  });

  it('re-upserting an API-style payload preserves API-unowned fields', () => {
    // Simulates the real-world flow: catalog was seeded with full data
    // (producer, region, specialGroup, isNew, tasteProfile from --enrich),
    // then `alko update` runs a resync where the Alko search API does NOT
    // expose those columns. The mapper returns empty/null defaults for
    // them, but the DB UPDATE path must keep the existing values.
    const preserveDb = join(tmpDir, 'preserve.db');
    const original = makeProduct({
      id: '111111',
      name: 'Old Name',
      producer: 'Legacy Producer',
      ean: '6411100001234',
      region: 'Bordeaux',
      specialGroup: 'Luomu',
      isNew: true,
      price: 10,
      tasteProfile: 'Original enrichment taste profile',
    });
    seedTestCatalog(preserveDb, [original]);

    const apiResync = makeProduct({
      id: '111111',
      name: 'New Name From API',
      price: 25,
      type: 'valkoviinit',
      country: 'Italia',
      // Fields the Alko search API does not expose — mapper sets defaults:
      producer: '',
      ean: '',
      region: null,
      specialGroup: null,
      isNew: false,
      tasteProfile: null,
    });
    seedTestCatalog(preserveDb, [apiResync]);

    const out = runCli(['show', '111111', '--json'], { ALKO_DB_PATH: preserveDb });
    const product = JSON.parse(out.trim());

    // API-owned columns: updated
    expect(product.name).toBe('New Name From API');
    expect(product.price).toBe(25);
    expect(product.type).toBe('valkoviinit');
    expect(product.country).toBe('Italia');

    // API-unowned columns: preserved
    expect(product.producer).toBe('Legacy Producer');
    expect(product.ean).toBe('6411100001234');
    expect(product.region).toBe('Bordeaux');
    expect(product.specialGroup).toBe('Luomu');
    expect(product.isNew).toBe(true);
    expect(product.tasteProfile).toBe('Original enrichment taste profile');
  });
});
