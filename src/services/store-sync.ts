import type { AlkoScraper } from './scraper.js';
import type { Store } from '../types/index.js';
import { mapAlkoApiStore } from './store-mapper.js';
import { logger } from '../utils/logger.js';

export interface StoreSyncResult {
  storesProcessed: number;
  storesAdded: number;
  storesUpdated: number;
  storesRemoved: number;
  invalidCount: number;
}

/**
 * Narrow surface of `SqliteService` that syncStores actually touches —
 * declared so tests can pass structurally-compatible stubs without
 * casting through `unknown`. `SqliteService` satisfies this shape
 * structurally.
 */
export interface StoreSyncDb {
  upsertStores(stores: Store[]): { added: number; updated: number };
  deleteStoresNotIn(keepIds: Set<string>): number;
}

/** Narrow surface of {@link AlkoScraper} used by syncStores. */
export type StoreSyncScraper = Pick<AlkoScraper, 'listStores'>;

/**
 * Sync the Alko store directory into the local SQLite store. Pulls the
 * full directory in a single /api/stores call (it's small — ~360 rows)
 * and upserts.
 */
export async function syncStores(
  db: StoreSyncDb,
  scraper: StoreSyncScraper
): Promise<StoreSyncResult> {
  logger.info('Fetching stores from Alko API');
  const rawStores = await scraper.listStores();

  const now = new Date();
  const valid = [];
  let invalidCount = 0;
  for (const raw of rawStores) {
    const mapped = mapAlkoApiStore(raw, now);
    if (mapped) valid.push(mapped);
    else invalidCount++;
  }

  logger.info(`Upserting ${valid.length} stores to SQLite`);
  const { added, updated } = db.upsertStores(valid);

  // The stores endpoint always returns the full directory; if a store is
  // gone from the API response, it has closed and should leave the local
  // catalog too.
  //
  // Build keepIds from the *raw* response so a malformed payload (which
  // the mapper would reject) does not cause a still-listed store to be
  // dropped from the local catalog.
  const keepIds = new Set(
    rawStores
      .map((r) => (typeof r?.id === 'string' ? r.id.trim() : ''))
      .filter((id) => id.length > 0)
  );
  const removed = db.deleteStoresNotIn(keepIds);
  if (removed > 0) logger.info(`Removed ${removed} stores no longer in directory`);

  return {
    storesProcessed: valid.length,
    storesAdded: added,
    storesUpdated: updated,
    storesRemoved: removed,
    invalidCount,
  };
}
