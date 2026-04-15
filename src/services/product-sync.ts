import type { AlkoScraper } from './scraper.js';
import type { SqliteService } from '../db/sqlite.js';
import { mapAlkoApiProduct } from './product-mapper.js';
import { logger } from '../utils/logger.js';

export interface SyncResult {
  success: boolean;
  productsProcessed: number;
  productsAdded: number;
  productsUpdated: number;
  productsRemoved: number;
  invalidCount: number;
  errors: string[];
  source: 'api';
  durationMs: number;
}

export interface SyncOptions {
  /** Cap the number of products fetched; omit to sync the full catalog. */
  limit?: number;
  /** Page size passed to the search API; default 500, max 1000. */
  pageSize?: number;
}

/**
 * Sync the catalog from Alko's internal search API into the local SQLite
 * store. Scraper elapsed-time is dominated by Incapsula-respecting rate
 * limiting, so the full catalog (~11 400 products, 500 per page) takes
 * on the order of tens of seconds.
 */
export async function syncProducts(
  db: SqliteService,
  scraper: AlkoScraper,
  opts: SyncOptions = {}
): Promise<SyncResult> {
  const start = Date.now();

  logger.info('Fetching products from Alko API', opts);
  const rawProducts = await scraper.listProducts({
    limit: opts.limit,
    pageSize: opts.pageSize,
    onProgress: (fetched, total) => {
      if (total !== null && fetched % 1000 < (opts.pageSize ?? 500)) {
        logger.info('sync progress', { fetched, total });
      }
    },
  });

  const errors: string[] = [];
  const valid = [];
  let invalidCount = 0;

  for (const raw of rawProducts) {
    const mapped = mapAlkoApiProduct(raw);
    if (mapped) {
      valid.push(mapped);
    } else {
      invalidCount++;
      if (errors.length < 10) {
        errors.push(`Skipped invalid product: ${JSON.stringify({ id: raw?.id, name: raw?.name })}`);
      }
    }
  }

  logger.info(`Upserting ${valid.length} products to SQLite`);
  const { added, updated } = db.upsertProducts(valid);

  // Mirror-delete products the API no longer advertises — but only on a
  // full sync. A --limit run would otherwise delete most of the catalog.
  let removed = 0;
  const isFullSync = opts.limit === undefined;
  if (isFullSync) {
    const keepIds = new Set(valid.map((p) => p.id));
    removed = db.deleteProductsNotIn(keepIds);
    if (removed > 0) logger.info(`Removed ${removed} products no longer in catalog`);
  }

  // Deliberately NOT writing last_sync / last_sync_source /
  // last_sync_product_count here — the update command is responsible
  // for stamping those only after BOTH product and store syncs have
  // finished successfully, and only on a full (unlimited) sync. A
  // premature write would cause the next `alko update` to be skipped
  // by the 24 h staleness guard even when the previous run was
  // truncated by --limit or cut short by a store-sync failure.
  const result: SyncResult = {
    success: true,
    productsProcessed: valid.length,
    productsAdded: added,
    productsUpdated: updated,
    productsRemoved: removed,
    invalidCount,
    errors,
    source: 'api',
    durationMs: Date.now() - start,
  };

  logger.info(
    `Sync done: ${added} added, ${updated} updated, ${removed} removed, ${invalidCount} invalid (${result.durationMs}ms)`
  );

  return result;
}
