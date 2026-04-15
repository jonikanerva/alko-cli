import { parseAlkoExcel, validateProducts } from '../utils/excel-parser.js';
import type { SqliteService } from '../db/sqlite.js';
import { downloadPriceList, readLocalPriceList } from './downloader.js';
import { logger } from '../utils/logger.js';

export interface SyncResult {
  success: boolean;
  productsProcessed: number;
  productsAdded: number;
  productsUpdated: number;
  invalidCount: number;
  errors: string[];
  source: 'remote' | 'file';
  durationMs: number;
}

export interface SyncOptions {
  /** Path to a local .xlsx file; if omitted, downloads from alko.fi */
  fromFile?: string;
}

export async function syncProducts(
  db: SqliteService,
  opts: SyncOptions = {}
): Promise<SyncResult> {
  const start = Date.now();
  const errors: string[] = [];

  const buffer = opts.fromFile
    ? await readLocalPriceList(opts.fromFile)
    : await downloadPriceList();

  logger.info('Parsing Excel file');
  const parsed = parseAlkoExcel(buffer);
  const { valid, invalid } = validateProducts(parsed);

  for (const { product, errors: productErrors } of invalid) {
    errors.push(`Product ${product.id}: ${productErrors.join(', ')}`);
  }

  logger.info(`Upserting ${valid.length} products to SQLite`);
  const { added, updated } = db.upsertProducts(valid);

  const nowIso = new Date().toISOString();
  db.setMeta('last_sync', nowIso);
  db.setMeta('last_sync_source', opts.fromFile ? 'file' : 'remote');
  db.setMeta('last_sync_product_count', String(valid.length));

  const result: SyncResult = {
    success: true,
    productsProcessed: valid.length,
    productsAdded: added,
    productsUpdated: updated,
    invalidCount: invalid.length,
    errors,
    source: opts.fromFile ? 'file' : 'remote',
    durationMs: Date.now() - start,
  };

  logger.info(
    `Sync done: ${added} added, ${updated} updated, ${invalid.length} invalid (${result.durationMs}ms)`
  );

  return result;
}
