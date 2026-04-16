import { Command } from 'commander';
import { SqliteService } from '../db/sqlite.js';
import { getDbPath } from '../utils/paths.js';
import { detectFormat, formatJson } from '../utils/formatter.js';

interface StatusOptions {
  json?: boolean;
  table?: boolean;
}

interface StatusReport {
  dbPath: string;
  schemaVersion: string | null;
  products: {
    count: number;
    lastSync: string | null;
    lastSyncProductCount: string | null;
    ageHours: number | null;
  };
  stores: {
    count: number;
  };
}

function buildReport(db: SqliteService): StatusReport {
  const lastSync = db.getMeta('last_sync');
  const ageHours =
    lastSync ? Math.round((Date.now() - new Date(lastSync).getTime()) / 3600000) : null;

  return {
    dbPath: db.path,
    schemaVersion: db.getMeta('schema_version'),
    products: {
      count: db.getProductCount(),
      lastSync,
      lastSyncProductCount: db.getMeta('last_sync_product_count'),
      ageHours,
    },
    stores: {
      count: db.getStoreCount(),
    },
  };
}

function renderText(r: StatusReport): string {
  const lines: string[] = [];
  const row = (k: string, v: unknown) =>
    lines.push(`  ${k.padEnd(22)} ${v === null || v === undefined ? '(none)' : v}`);

  lines.push('Alko CLI status');
  lines.push('');
  row('Database', r.dbPath);
  row('Schema version', r.schemaVersion);
  lines.push('');
  row('Products', r.products.count);
  row('Last sync', r.products.lastSync);
  row('Last sync count', r.products.lastSyncProductCount);
  row('Age (hours)', r.products.ageHours);
  lines.push('');
  row('Stores', r.stores.count);

  return lines.join('\n') + '\n';
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show local catalog status: DB path, product/store counts, last sync')
    .option('--json', 'Emit JSON (default when stdout is piped)')
    .option('--table', 'Force human-readable report (default when stdout is a TTY)')
    .action((opts: StatusOptions) => {
      const db = new SqliteService(getDbPath());
      try {
        const report = buildReport(db);
        const format = detectFormat(opts);
        if (format === 'json') {
          process.stdout.write(formatJson(report));
        } else {
          process.stdout.write(renderText(report));
        }
      } catch (err) {
        process.stderr.write(
          `status failed: ${err instanceof Error ? err.message : String(err)}\n`
        );
        process.exitCode = 1;
      } finally {
        db.close();
      }
    });
}
