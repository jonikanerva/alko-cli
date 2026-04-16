/**
 * Product types available in Alko catalog
 */
export type ProductType =
  | 'punaviinit'
  | 'valkoviinit'
  | 'roseeviinit'
  | 'kuohuviinit ja samppanjat'
  | 'oluet'
  | 'viskit'
  | 'ginit ja maustetut viinat'
  | 'vodkat ja viinat'
  | 'rommit'
  | 'konjakit'
  | 'liköörit ja katkerot'
  | 'brandyt, armanjakit ja calvadosit'
  | 'siiderit'
  | 'alkoholittomat'
  | 'juomasekoitukset'
  | 'jälkiruokaviinit, väkevöidyt ja muut viinit'
  | 'viinijuomat'
  | 'lahja- ja juomatarvikkeet'
  | 'hanapakkaukset';

export type Assortment =
  | 'vakiovalikoima'
  | 'tilausvalikoima'
  | 'erikoiserä'
  | 'kausituote'
  | 'tarvikevalikoima';

export type SpecialGroup =
  | 'Luomu'
  | 'Vegaaneille soveltuva tuote'
  | 'Alkuviini'
  | 'Biodynaaminen';

export type BeerType =
  | 'ipa'
  | 'lager'
  | 'ale'
  | 'stout & porter'
  | 'vehnäolut'
  | 'erikoisuus'
  | 'vahva lager'
  | 'pils'
  | 'tumma lager';

export type PackagingType =
  | 'lasipullo'
  | 'tölkki'
  | 'muovipullo'
  | 'pullo'
  | 'hanapakkaus'
  | 'kartonkitölkki'
  | 'viinipussi'
  | 'paperipullo'
  | 'keraaminen pullo'
  | 'muu';

/**
 * Product entity stored in SQLite.
 * Timestamps are ISO 8601 strings (e.g. "2026-04-15T10:23:15.000Z")
 * because node:sqlite does not natively store Date objects.
 */
export interface Product {
  // Core identifiers
  id: string;
  name: string;
  producer: string;
  ean: string;

  // Pricing
  price: number;
  pricePerLiter: number;

  // Volume & Packaging
  bottleSize: string;
  packagingType: string | null;
  closureType: string | null;

  // Classification
  type: string;
  subtype: string | null;
  specialGroup: string | null;
  beerType: string | null;
  sortCode: number;

  // Origin
  country: string;
  region: string | null;

  // Wine-specific
  vintage: number | null;
  grapes: string | null;
  labelNotes: string | null;

  // Taste & Description
  description: string | null;
  notes: string | null;

  // Technical specs
  alcoholPercentage: number;
  acids: number | null;
  sugar: number | null;
  energy: number | null;

  // Beer-specific specs
  originalGravity: number | null;
  colorEBC: number | null;
  bitternessEBU: number | null;

  // Assortment & Status
  assortment: string;
  isNew: boolean;

  // Metadata (ISO 8601 strings)
  updatedAt: string;
  createdAt: string;
}

/**
 * Product search filters.
 *
 * `specialGroup` / `isNew` / `isOrganic` / `isVegan` columns exist in the
 * SQLite schema but the Alko JSON API does not populate them, so we do
 * not expose them as CLI filters — they would silently match nothing on
 * an API-seeded catalog.
 */
export interface ProductSearchFilters {
  query?: string;
  type?: string;
  country?: string;
  region?: string;
  minPrice?: number;
  maxPrice?: number;
  minAlcohol?: number;
  maxAlcohol?: number;
  assortment?: string;
  beerType?: string;
}

export interface ProductSearchOptions {
  sortBy?: 'price' | 'name' | 'alcohol' | 'pricePerLiter';
  sortOrder?: 'asc' | 'desc';
  /** Cap the result set. Omit to return every match. */
  limit?: number;
}

export interface ProductSearchResult {
  products: Product[];
  /** Total matches before any --limit is applied. */
  total: number;
}
