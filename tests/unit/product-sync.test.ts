import { describe, it, expect, vi } from 'vitest';
import { syncProducts } from '../../src/services/product-sync.js';
import type { AlkoApiProduct, AlkoScraper } from '../../src/services/scraper.js';
import type { SqliteService } from '../../src/db/sqlite.js';
import type { Product } from '../../src/types/index.js';

/**
 * Minimal test doubles for the SqliteService surface that syncProducts
 * actually calls. Using a Pick keeps us off `any` while leaving the
 * rest of SqliteService unimplemented.
 */
type SqliteSurface = Pick<SqliteService, 'upsertProducts' | 'deleteProductsNotIn' | 'setMeta'>;
type ScraperSurface = Pick<AlkoScraper, 'listProducts'>;

function makeDb(): SqliteSurface & {
  upsertProducts: ReturnType<typeof vi.fn>;
  deleteProductsNotIn: ReturnType<typeof vi.fn>;
  setMeta: ReturnType<typeof vi.fn>;
} {
  return {
    upsertProducts: vi.fn<(p: Product[]) => { added: number; updated: number }>(() => ({
      added: 0,
      updated: 0,
    })),
    deleteProductsNotIn: vi.fn<(ids: Set<string>) => number>(() => 0),
    setMeta: vi.fn<(key: string, value: string) => void>(),
  };
}

function makeScraper(products: AlkoApiProduct[]): ScraperSurface {
  return {
    listProducts: vi.fn<AlkoScraper['listProducts']>(async () => products),
  };
}

const sampleApiProduct: AlkoApiProduct = {
  id: '111',
  name: 'Test Product',
  price: 10,
  abv: 12,
  volume: 0.75,
  mainGroupName: ['viinit'],
  productGroupName: ['punaviinit'],
  countryName: 'Ranska',
};

describe('syncProducts', () => {
  it('calls deleteProductsNotIn on a full (unlimited) sync', async () => {
    const db = makeDb();
    const scraper = makeScraper([sampleApiProduct]);

    await syncProducts(db as unknown as SqliteService, scraper as unknown as AlkoScraper, {});

    expect(db.deleteProductsNotIn).toHaveBeenCalledOnce();
    const keepIds = db.deleteProductsNotIn.mock.calls[0][0] as Set<string>;
    expect(keepIds.has('111')).toBe(true);
  });

  it('does NOT call deleteProductsNotIn on a --limit sync', async () => {
    const db = makeDb();
    const scraper = makeScraper([sampleApiProduct]);

    await syncProducts(db as unknown as SqliteService, scraper as unknown as AlkoScraper, {
      limit: 5,
    });

    expect(db.deleteProductsNotIn).not.toHaveBeenCalled();
  });

  it('does NOT stamp last_sync meta (defers to the update command)', async () => {
    const db = makeDb();
    const scraper = makeScraper([sampleApiProduct]);

    await syncProducts(db as unknown as SqliteService, scraper as unknown as AlkoScraper, {});

    expect(db.setMeta).not.toHaveBeenCalled();
  });

  it('drops invalid payloads before upsert and reports the count', async () => {
    const db = makeDb();
    const scraper = makeScraper([
      sampleApiProduct,
      // Invalid: missing name
      { id: '222', name: '', price: 10 } as AlkoApiProduct,
    ]);

    const result = await syncProducts(
      db as unknown as SqliteService,
      scraper as unknown as AlkoScraper,
      {}
    );

    expect(result.productsProcessed).toBe(1);
    expect(result.invalidCount).toBe(1);
    expect(db.upsertProducts).toHaveBeenCalledOnce();
    const upserted = db.upsertProducts.mock.calls[0][0] as Product[];
    expect(upserted.map((p) => p.id)).toEqual(['111']);
  });
});
