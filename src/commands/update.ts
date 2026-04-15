import { Command } from 'commander';
import { SqliteService } from '../db/sqlite.js';
import { getDbPath } from '../utils/paths.js';
import { config } from '../config.js';
import { syncProducts } from '../services/data-sync.js';
import { logger } from '../utils/logger.js';

interface UpdateOptions {
  force?: boolean;
  fromFile?: string;
  json?: boolean;
}

export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Download the latest Alko price list and refresh the local SQLite catalog')
    .option('-f, --force', 'Skip the "data is fresh" staleness check')
    .option('--from-file <path>', 'Read a local .xlsx file instead of downloading')
    .option('--json', 'Emit a JSON summary to stdout (instead of a human-readable line)')
    .action(async (opts: UpdateOptions) => {
      const db = new SqliteService(getDbPath());
      try {
        const lastSync = db.getMeta('last_sync');
        if (!opts.force && !opts.fromFile && lastSync) {
          const ageMs = Date.now() - new Date(lastSync).getTime();
          if (ageMs < config.updateStalenessMs) {
            const ageHours = Math.round(ageMs / 3600000);
            if (opts.json) {
              process.stdout.write(
                JSON.stringify({
                  skipped: true,
                  reason: 'fresh',
                  lastSync,
                  ageHours,
                }) + '\n'
              );
            } else {
              process.stderr.write(
                `Data is fresh (synced ${ageHours}h ago at ${lastSync}). Use --force to override.\n`
              );
            }
            return;
          }
        }

        const result = await syncProducts(db, { fromFile: opts.fromFile });

        if (opts.json) {
          process.stdout.write(JSON.stringify(result) + '\n');
        } else {
          process.stderr.write(
            `Updated: ${result.productsAdded} added, ${result.productsUpdated} updated, ${result.invalidCount} invalid (${result.durationMs}ms).\n`
          );
        }
      } catch (err) {
        logger.error('update failed', { err: String(err) });
        process.stderr.write(`Update failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      } finally {
        db.close();
      }
    });
}
