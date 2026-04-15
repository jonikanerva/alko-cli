import { Command } from 'commander';
import { SqliteService } from '../db/sqlite.js';
import { getDbPath } from '../utils/paths.js';
import { config } from '../config.js';
import { syncProducts } from '../services/product-sync.js';
import { syncStores } from '../services/store-sync.js';
import { getAlkoScraper, registerBrowserCleanup } from '../services/scraper.js';
import { logger } from '../utils/logger.js';

interface UpdateOptions {
  force?: boolean;
  limit?: string;
  pageSize?: string;
  json?: boolean;
}

export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description(
      'Refresh the local SQLite catalog from Alko.fi (fetches the full product list via Playwright + JSON API)'
    )
    .option('-f, --force', 'Skip the "data is fresh" staleness check')
    .option('--limit <n>', 'Stop after N products (useful for smoke tests)')
    .option('--page-size <n>', 'Products per API page (default 500, max 1000)')
    .option('--json', 'Emit a JSON summary to stdout (instead of a human-readable line)')
    .action(async (opts: UpdateOptions) => {
      const db = new SqliteService(getDbPath());

      const lastSync = db.getMeta('last_sync');
      if (!opts.force && lastSync) {
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
          db.close();
          return;
        }
      }

      const limit = opts.limit ? parsePositiveInt(opts.limit, '--limit') : undefined;
      const pageSize = opts.pageSize ? parsePositiveInt(opts.pageSize, '--page-size') : undefined;

      registerBrowserCleanup();
      const scraper = getAlkoScraper();

      try {
        const products = await syncProducts(db, scraper, { limit, pageSize });
        const stores = await syncStores(db, scraper);

        const summary = { ...products, stores };

        if (opts.json) {
          process.stdout.write(JSON.stringify(summary) + '\n');
        } else {
          process.stderr.write(
            `Updated products: ${products.productsAdded} added, ${products.productsUpdated} updated, ${products.invalidCount} invalid.\n` +
              `Updated stores:   ${stores.storesAdded} added, ${stores.storesUpdated} updated, ${stores.invalidCount} invalid.\n` +
              `Total: ${products.durationMs}ms.\n`
          );
        }
      } catch (err) {
        logger.error('update failed', { err: String(err) });
        process.stderr.write(
          `Update failed: ${err instanceof Error ? err.message : String(err)}\n`
        );
        process.exitCode = 1;
      } finally {
        db.close();
        await scraper.close();
      }
    });
}

function parsePositiveInt(raw: string, flag: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${flag} must be a positive integer (got "${raw}")`);
  }
  return n;
}
