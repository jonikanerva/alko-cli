import { Command } from 'commander';
import { SqliteService } from '../db/sqlite.js';
import { getDbPath } from '../utils/paths.js';
import {
  detectFormat,
  formatJson,
  formatProductDetail,
} from '../utils/formatter.js';
import { getAlkoScraper, registerBrowserCleanup } from '../services/scraper.js';
import { logger } from '../utils/logger.js';

interface ShowOptions {
  enrich?: boolean;
  json?: boolean;
  table?: boolean;
}

export function registerShowCommand(program: Command): void {
  program
    .command('show <productId>')
    .description('Show detailed information about a single product')
    .option(
      '--enrich',
      'Scrape extra data (taste profile, pairings, certificates, ingredients) from alko.fi and persist it to the local catalog'
    )
    .option('--json', 'Emit JSON (default when stdout is piped)')
    .option('--table', 'Force human-readable block output (default when stdout is a TTY)')
    .addHelpText(
      'after',
      `\nExamples:\n` +
        `  alko show 004246\n` +
        `  alko show 004246 --enrich\n` +
        `  alko show 004246 --json | jq '.name'\n`
    )
    .action(async (productId: string, opts: ShowOptions) => {
      if (!/^\d{3,6}$/.test(productId)) {
        process.stderr.write(
          `show: productId must be a numeric ID (got "${productId}")\n`
        );
        process.exitCode = 1;
        return;
      }

      const db = new SqliteService(getDbPath());
      try {
        let product = db.getProduct(productId);
        if (!product) {
          process.stderr.write(
            `show: product ${productId} not found in the local catalog. ` +
              `Run \`alko update\` to sync, or check the ID.\n`
          );
          process.exitCode = 1;
          return;
        }

        if (opts.enrich) {
          registerBrowserCleanup();
          const scraper = getAlkoScraper();
          try {
            const enriched = await scraper.scrapeProductDetails(productId);
            if (enriched) {
              db.updateProductEnrichment(productId, {
                tasteProfile: enriched.tasteProfile,
                usageTips: enriched.usageTips,
                servingSuggestion: enriched.servingSuggestion,
                foodPairings: enriched.foodPairings.length > 0 ? enriched.foodPairings : null,
                certificates: enriched.certificates.length > 0 ? enriched.certificates : null,
                ingredients: enriched.ingredients,
                smokiness: enriched.smokiness,
                smokinessLabel: enriched.smokinessLabel,
              });
              const refreshed = db.getProduct(productId);
              if (refreshed) product = refreshed;
            } else {
              process.stderr.write(
                `show: enrichment scrape failed, showing cached data.\n`
              );
            }
          } finally {
            await scraper.close();
          }
        }

        const format = detectFormat(opts);
        if (format === 'json') {
          process.stdout.write(formatJson(product));
        } else {
          process.stdout.write(formatProductDetail(product));
        }
      } catch (err) {
        logger.error('show failed', { err: String(err) });
        process.stderr.write(
          `show failed: ${err instanceof Error ? err.message : String(err)}\n`
        );
        process.exitCode = 1;
      } finally {
        db.close();
      }
    });
}
