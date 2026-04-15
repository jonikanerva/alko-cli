import { Command } from 'commander';
import { getAlkoScraper, registerBrowserCleanup } from '../services/scraper.js';
import {
  detectFormat,
  formatAvailabilityTable,
  formatJson,
} from '../utils/formatter.js';
import { logger } from '../utils/logger.js';

interface AvailabilityOptions {
  city?: string;
  json?: boolean;
  table?: boolean;
}

export function registerAvailabilityCommand(program: Command): void {
  program
    .command('availability <productId>')
    .description('Check real-time store availability for a product on alko.fi')
    .option('--city <city>', 'Filter results by city (case-insensitive substring match)')
    .option('--json', 'Emit JSON (default when stdout is piped)')
    .option('--table', 'Force human-readable table (default when stdout is a TTY)')
    .addHelpText(
      'after',
      `\nExamples:\n` +
        `  alko availability 004246\n` +
        `  alko availability 004246 --city Helsinki\n` +
        `  alko availability 004246 --json | jq '.stores[].storeName'\n`
    )
    .action(async (productId: string, opts: AvailabilityOptions) => {
      // Alko product IDs are numeric with variable padding (commonly 6 digits,
      // but historical products may be shorter). Allow 3-6 digits and reject
      // anything else to avoid shipping non-sensical URLs to the scraper.
      if (!/^\d{3,6}$/.test(productId)) {
        process.stderr.write(
          `availability: productId must be a numeric ID (got "${productId}")\n`
        );
        process.exitCode = 1;
        return;
      }

      registerBrowserCleanup();
      const scraper = getAlkoScraper();

      try {
        const result = await scraper.getProductAvailability(productId);

        let stores = result.stores;
        if (opts.city) {
          const needle = opts.city.toLowerCase();
          stores = stores.filter((s) => s.city.toLowerCase().includes(needle));
        }

        const filtered = { ...result, stores };
        const format = detectFormat(opts);

        if (format === 'json') {
          process.stdout.write(formatJson(filtered));
        } else {
          process.stdout.write(formatAvailabilityTable(filtered));
        }
      } catch (err) {
        logger.error('availability failed', { err: String(err) });
        process.stderr.write(
          `availability failed: ${err instanceof Error ? err.message : String(err)}\n`
        );
        process.exitCode = 1;
      } finally {
        // Primary close path — the process-level guards in scraper.ts are
        // backup for signals / unhandled rejections.
        await scraper.close();
      }
    });
}
