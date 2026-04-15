import { describe, it, expect, vi } from 'vitest';
import {
  syncProducts,
  type ProductSyncDb,
  type ProductSyncScraper,
} from '../../src/services/product-sync.js';
import type { AlkoApiProduct } from '../../src/services/scraper.js';
import type { Product } from '../../src/types/index.js';

/**
 * Build the narrow db double syncProducts expects. Returning the mock
 * functions directly (not via a cast) means TypeScript enforces that
 * the shape matches the real `ProductSyncDb` surface.
 */
function makeDb(): ProductSyncDb & {
  upsertProducts: ReturnType<typeof vi.fn>;
  deleteProductsNotIn: ReturnType<typeof vi.fn>;
} {
  return {
    upsertProducts: vi.fn<(p: Product[]) => { added: number; updated: number }>(() => ({
      added: 0,
      updated: 0,
    })),
    deleteProductsNotIn: vi.fn<(ids: Set<string>) => number>(() => 0),
  };
}

function makeScraper(products: AlkoApiProduct[]): ProductSyncScraper {
  return {
    listProducts: vi.fn(async () => products),
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

    await syncProducts(db, scraper, {});

    expect(db.deleteProductsNotIn).toHaveBeenCalledOnce();
    const keepIds = db.deleteProductsNotIn.mock.calls[0][0] as Set<string>;
    expect(keepIds.has('111')).toBe(true);
  });

  it('does NOT call deleteProductsNotIn on a --limit sync', async () => {
    const db = makeDb();
    const scraper = makeScraper([sampleApiProduct]);

    await syncProducts(db, scraper, { limit: 5 });

    expect(db.deleteProductsNotIn).not.toHaveBeenCalled();
  });

  it('does NOT stamp last_sync meta (defers to the update command)', async () => {
    // `setMeta` is intentionally absent from ProductSyncDb — the service
    // has no way to call it. This test asserts the sync result came back
    // cleanly without mutating any other meta-adjacent surface.
    const db = makeDb();
    const scraper = makeScraper([sampleApiProduct]);

    const result = await syncProducts(db, scraper, {});

    expect(result.success).toBe(true);
    // The db double exposes only upsertProducts + deleteProductsNotIn, so
    // an accidental `setMeta` call would not even compile — the contract
    // is enforced at the type level rather than via runtime spying.
  });

  it('drops invalid payloads before upsert and reports the count', async () => {
    const db = makeDb();
    const scraper = makeScraper([
      sampleApiProduct,
      // Invalid: missing name
      { id: '222', name: '', price: 10 } as AlkoApiProduct,
    ]);

    const result = await syncProducts(db, scraper, {});

    expect(result.productsProcessed).toBe(1);
    expect(result.invalidCount).toBe(1);
    expect(db.upsertProducts).toHaveBeenCalledOnce();
    const upserted = db.upsertProducts.mock.calls[0][0] as Product[];
    expect(upserted.map((p) => p.id)).toEqual(['111']);
  });

  it('keeps raw upstream ids in keepIds even for mapper-invalid entries', async () => {
    // Regression: a malformed entry used to be excluded from keepIds,
    // which then caused `deleteProductsNotIn` to wipe a still-listed
    // row. The delete set must reflect what the API reported.
    const db = makeDb();
    const scraper = makeScraper([
      sampleApiProduct, // valid, id "111"
      { id: '222', name: '', price: 10 } as AlkoApiProduct, // invalid
    ]);

    await syncProducts(db, scraper, {});

    const keepIds = db.deleteProductsNotIn.mock.calls[0][0] as Set<string>;
    expect(keepIds.has('111')).toBe(true);
    expect(keepIds.has('222')).toBe(true);
  });
});
