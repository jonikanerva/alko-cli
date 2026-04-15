import { Command } from 'commander';
import { SqliteService } from '../db/sqlite.js';
import { getDbPath } from '../utils/paths.js';
import { detectFormat, formatJson, formatProductsTable } from '../utils/formatter.js';
import type { ProductSearchFilters, ProductSearchOptions, SmokinessLevel } from '../types/product.js';

interface ListOptions {
  query?: string;
  type?: string;
  country?: string;
  region?: string;
  minPrice?: string;
  maxPrice?: string;
  minAlcohol?: string;
  maxAlcohol?: string;
  assortment?: string;
  specialGroup?: string;
  beerType?: string;
  minSmokiness?: string;
  maxSmokiness?: string;
  organic?: boolean;
  vegan?: boolean;
  new?: boolean;
  sort?: string;
  order?: string;
  limit?: string;
  json?: boolean;
  table?: boolean;
}

function parseNumber(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number for --${field}: ${raw}`);
  }
  return n;
}

function parseSmokiness(raw: string | undefined, field: string): SmokinessLevel | undefined {
  const n = parseNumber(raw, field);
  if (n === undefined) return undefined;
  if (!Number.isInteger(n) || n < 0 || n > 4) {
    throw new Error(`--${field} must be an integer in [0,4], got ${raw}`);
  }
  return n as SmokinessLevel;
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .alias('search')
    .description('List and filter Alko products from the local catalog')
    .option('-q, --query <text>', 'Free text search (name/producer/country/grapes/description)')
    .option('--type <type>', 'Product type (e.g. punaviinit, oluet, viskit)')
    .option('--country <country>', 'Country of origin (case-insensitive)')
    .option('--region <region>', 'Region (case-insensitive)')
    .option('--min-price <eur>', 'Minimum price in EUR')
    .option('--max-price <eur>', 'Maximum price in EUR')
    .option('--min-alcohol <pct>', 'Minimum alcohol percentage')
    .option('--max-alcohol <pct>', 'Maximum alcohol percentage')
    .option('--assortment <name>', 'vakiovalikoima|tilausvalikoima|erikoiserä|kausituote')
    .option('--special-group <name>', 'Luomu | Vegaaneille soveltuva tuote | ...')
    .option('--beer-type <name>', 'Beer type (ipa, lager, stout & porter, ...)')
    .option('--min-smokiness <0-4>', 'Whiskey smokiness lower bound')
    .option('--max-smokiness <0-4>', 'Whiskey smokiness upper bound')
    .option('--organic', 'Only Luomu products')
    .option('--vegan', 'Only products marked vegan-suitable')
    .option('--new', 'Only new arrivals (Uutuus)')
    .option(
      '--sort <field>',
      'Sort by: name|price|alcohol|pricePerLiter (default: relevance when --query is given, else name)'
    )
    .option('--order <asc|desc>', 'Sort order', 'asc')
    .option('--limit <n>', 'Cap the result count (default: no limit — pipe to head/less to trim)')
    .option('--json', 'Emit JSON (default when stdout is piped)')
    .option('--table', 'Force human-readable table (default when stdout is a TTY)')
    .addHelpText(
      'after',
      `\nExamples:\n  alko list --country Ranska --max-price 20\n  alko list --query "cabernet sauvignon" --type punaviinit\n  alko list --type oluet --beer-type ipa --min-alcohol 6\n  alko list --organic --country Italia --sort price\n  alko list --query "syrah" --json | jq '.products[].name'\n`
    )
    .action((opts: ListOptions) => {
      const db = new SqliteService(getDbPath());
      try {
        const filters: ProductSearchFilters = {
          query: opts.query,
          type: opts.type,
          country: opts.country,
          region: opts.region,
          minPrice: parseNumber(opts.minPrice, 'min-price'),
          maxPrice: parseNumber(opts.maxPrice, 'max-price'),
          minAlcohol: parseNumber(opts.minAlcohol, 'min-alcohol'),
          maxAlcohol: parseNumber(opts.maxAlcohol, 'max-alcohol'),
          assortment: opts.assortment,
          specialGroup: opts.specialGroup,
          beerType: opts.beerType,
          isNew: opts.new ? true : undefined,
          isOrganic: opts.organic ? true : undefined,
          isVegan: opts.vegan ? true : undefined,
          minSmokiness: parseSmokiness(opts.minSmokiness, 'min-smokiness'),
          maxSmokiness: parseSmokiness(opts.maxSmokiness, 'max-smokiness'),
        };

        const sortBy = (['price', 'name', 'alcohol', 'pricePerLiter'] as const).find(
          (s) => s === opts.sort
        );
        if (opts.sort && !sortBy) {
          throw new Error(`Invalid --sort: ${opts.sort}. Use: name|price|alcohol|pricePerLiter`);
        }
        const sortOrder = opts.order === 'desc' ? 'desc' : 'asc';

        const options: ProductSearchOptions = {
          sortBy,
          sortOrder,
          limit: parseNumber(opts.limit, 'limit'),
        };

        const result = db.searchProducts(filters, options);
        const format = detectFormat(opts);

        if (format === 'json') {
          process.stdout.write(formatJson(result));
        } else {
          process.stdout.write(formatProductsTable(result));
        }
      } catch (err) {
        process.stderr.write(`list failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      } finally {
        db.close();
      }
    });
}
