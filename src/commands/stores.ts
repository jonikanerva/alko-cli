import { Command } from 'commander';
import { SqliteService } from '../db/sqlite.js';
import { getDbPath } from '../utils/paths.js';
import { detectFormat, formatJson, formatStoresTable } from '../utils/formatter.js';
import { parsePositiveInt } from '../utils/cli-parse.js';

interface StoresOptions {
  city?: string;
  limit?: string;
  json?: boolean;
  table?: boolean;
}

export function registerStoresCommand(program: Command): void {
  program
    .command('stores')
    .description('List Alko stores from the local catalog, optionally filtered by city')
    .option('--city <city>', 'Filter stores by city (case-insensitive exact match)')
    .option('--limit <n>', 'Maximum stores to show', '50')
    .option('--json', 'Emit JSON (default when stdout is piped)')
    .option('--table', 'Force human-readable table (default when stdout is a TTY)')
    .addHelpText(
      'after',
      `\nExamples:\n  alko stores --city Helsinki\n  alko stores --limit 10 --json | jq '.[].name'\n`
    )
    .action((opts: StoresOptions) => {
      const db = new SqliteService(getDbPath());
      try {
        const limit = opts.limit === undefined ? 50 : parsePositiveInt(opts.limit, '--limit');
        const stores = db.listStores(opts.city, limit);

        if (stores.length === 0) {
          const hint = opts.city
            ? `No stores found for city "${opts.city}".`
            : `No stores in the local catalog yet.`;
          if (opts.json) {
            process.stdout.write(formatJson([]));
          } else {
            process.stderr.write(`${hint}\n`);
          }
          return;
        }

        const format = detectFormat(opts);
        if (format === 'json') {
          process.stdout.write(formatJson(stores));
        } else {
          process.stdout.write(formatStoresTable(stores));
        }
      } catch (err) {
        process.stderr.write(
          `stores failed: ${err instanceof Error ? err.message : String(err)}\n`
        );
        process.exitCode = 1;
      } finally {
        db.close();
      }
    });
}
