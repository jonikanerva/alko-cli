/**
 * End-to-end CLI integration tests. Spawns the built `alko` binary against
 * a temporary SQLite file + synthetic .xlsx fixture, then verifies its JSON
 * output for each command.
 *
 * Running the compiled binary avoids Vite's module-graph concerns with the
 * experimental `node:sqlite` builtin — Node's own loader handles it at
 * runtime.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..', '..');
const CLI_ENTRY = join(PROJECT_ROOT, 'dist', 'cli.js');

// Columns in the order the Alko Excel parser expects (see utils/excel-parser.ts).
const HEADERS = [
  'Numero',
  'Nimi',
  'Valmistaja',
  'Pullokoko',
  'Hinta',
  'Litrahinta',
  'Uutuus',
  'Hinnastojärjestyskoodi',
  'Tyyppi',
  'Alatyyppi',
  'Erityisryhmä',
  'Oluttyyppi',
  'Valmistusmaa',
  'Alue',
  'Vuosikerta',
  'Etikettimerkintöjä',
  'Huomautus',
  'Rypäleet',
  'Luonnehdinta',
  'Pakkaustyyppi',
  'Suljentatyyppi',
  'Alkoholi-%',
  'Hapot g/l',
  'Sokeri g/l',
  'Kantavierrep-%',
  'Väri EBC',
  'Katkerot EBU',
  'Energia kcal/100 ml',
  'Valikoima',
  'EAN',
];

type Row = (string | number | null)[];

function row(
  numero: string,
  overrides: Partial<{
    name: string;
    producer: string;
    price: number;
    pricePerLiter: number;
    bottleSize: string;
    type: string;
    beerType: string | null;
    specialGroup: string | null;
    country: string;
    region: string | null;
    alcohol: number;
  }> = {}
): Row {
  return [
    numero,
    overrides.name ?? 'Test product',
    overrides.producer ?? 'Test Producer',
    overrides.bottleSize ?? '0,75 l',
    overrides.price ?? 10,
    overrides.pricePerLiter ?? 13.33,
    null,
    1,
    overrides.type ?? 'punaviinit',
    null,
    overrides.specialGroup ?? null,
    overrides.beerType ?? null,
    overrides.country ?? 'Ranska',
    overrides.region ?? null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    overrides.alcohol ?? 13.5,
    null,
    null,
    null,
    null,
    null,
    null,
    'vakiovalikoima',
    '1234567890123',
  ];
}

function makeFixtureXlsx(rows: Row[]): Buffer {
  const data = [HEADERS, ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Hinnasto');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

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
  let xlsxPath: string;
  let dbPath: string;

  beforeAll(() => {
    if (!existsSync(CLI_ENTRY)) {
      execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    }

    tmpDir = mkdtempSync(join(tmpdir(), 'alko-cli-e2e-'));
    xlsxPath = join(tmpDir, 'fixture.xlsx');
    dbPath = join(tmpDir, 'e2e.db');

    writeFileSync(
      xlsxPath,
      makeFixtureXlsx([
        row('000001', { name: 'Chateau Ranska', country: 'Ranska', price: 12 }),
        row('000002', { name: 'Barolo Italia', country: 'Italia', price: 25 }),
        row('000003', { name: 'Rioja Espanja', country: 'Espanja', price: 18 }),
        row('000004', {
          name: 'Belgialainen IPA',
          type: 'oluet',
          beerType: 'ipa',
          country: 'Belgia',
          bottleSize: '0,33 l',
          alcohol: 6.2,
          price: 4,
        }),
      ])
    );
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

  it('seeds the catalog from an xlsx fixture', () => {
    const out = runCli(['update', '--from-file', xlsxPath, '--json'], {
      ALKO_DB_PATH: dbPath,
    });
    const result = JSON.parse(out.trim());
    expect(result.success).toBe(true);
    expect(result.productsProcessed).toBe(4);
    expect(result.source).toBe('file');
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
});
