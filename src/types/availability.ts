/**
 * Real-time store availability for a product (scraped from alko.fi).
 * The new Alko website exposes GET /api/product-api/availability/{productId}
 * which returns exact per-store stock counts, so we use the numeric `quantity`
 * directly instead of a legacy "6-10" range string.
 */
export interface StoreAvailability {
  storeId: string;
  storeName: string;
  address: string;
  city: string;
  postalCode: string;
  quantity: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
  /** Whether the store is currently open according to the API. */
  open: boolean;
}

export interface ProductAvailabilityResult {
  productId: string;
  /** ISO 8601 timestamp for when the scrape was performed. */
  checkedAt: string;
  stores: StoreAvailability[];
}
