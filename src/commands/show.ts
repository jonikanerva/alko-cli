import { Command } from 'commander';
import { SqliteService } from '../db/sqlite.js';
import { getDbPath } from '../utils/paths.js';
import {
  detectFormat,
  formatJson,
  formatProductDetail,
} from '../utils/formatter.js';
import { config } from '../config.js';

interface ShowOptions {
  json?: boolean;
  table?: boolean;
}

export function registerShowCommand(program: Command): void {
  program
    .command('show <productId>')
    .description('Show detailed information about a single product')
    .option('--json', 'Emit JSON (default when stdout is piped)')
    .option('--table', 'Force human-readable block output (default when stdout is a TTY)')
    .addHelpText(
      'after',
      `\nExamples:\n` +
        `  alko show 004246\n` +
        `  alko show 004246 --json | jq '.name'\n`
    )
    .action((productId: string, opts: ShowOptions) => {
      if (!/^\d{3,6}$/.test(productId)) {
        process.stderr.write(
          `show: productId must be a numeric ID (got "${productId}")\n`
        );
        process.exitCode = 1;
        return;
      }

      const db = new SqliteService(getDbPath());
      try {
        const product = db.getProduct(productId);
        if (!product) {
          process.stderr.write(
            `show: product ${productId} not found in the local catalog. ` +
              `Run \`alko update\` to sync, or check the ID.\n`
          );
          process.exitCode = 1;
          return;
        }

        const url = `${config.alkoBaseUrl}/fi/tuotteet/${productId}`;
        const format = detectFormat(opts);
        if (format === 'json') {
          process.stdout.write(formatJson({ ...product, url }));
        } else {
          process.stdout.write(formatProductDetail(product, url));
        }
      } catch (err) {
        process.stderr.write(
          `show failed: ${err instanceof Error ? err.message : String(err)}\n`
        );
        process.exitCode = 1;
      } finally {
        db.close();
      }
    });
}
