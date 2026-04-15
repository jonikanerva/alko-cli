import type { AlkoApiProduct } from './scraper.js';
import type { Product } from '../types/index.js';

/**
 * Project the raw Alko search API shape into the CLI's canonical `Product`
 * entity, returning `null` when required fields (id / name / price) are
 * missing or obviously invalid.
 *
 * The API does not expose some columns the schema still carries —
 * producer, EAN, explicit region / vintage columns, acids, sugar,
 * energy, beer-specific gravity / EBC / EBU — so those are left empty
 * / null here. Vintage is best-effort parsed from the product name
 * (e.g. "... 2020"). Any value that ends up in those columns via
 * `alko show --enrich` is preserved on resync by the SqliteService
 * UPDATE path (it skips columns the mapper doesn't own).
 *
 * Pure: no I/O, no logging. Safe to call on untrusted payloads.
 */
export function mapAlkoApiProduct(raw: AlkoApiProduct): Product | null {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;

  const price = toNumber(raw.price);
  if (price === null || price < 0) return null;

  const abvRaw = toNumber(raw.abv);
  const abv = abvRaw === null ? 0 : abvRaw;
  if (abv < 0 || abv > 100) return null;

  const volume = toNumber(raw.volume) ?? 0;
  const pricePerLiter = volume > 0 ? roundTo(price / volume, 2) : 0;

  const packageSize = takePipeLabel(raw.packageSizes?.[0]);
  const packagingType = takePipeLabel(raw.packageTypes?.[0]);
  const closureType = takePipeLabel(raw.closures?.[0]);
  const assortment = takePipeLabel(raw.selectionTypes?.[0]) ?? '';

  // productGroupName is more specific than mainGroupName
  // ("punaviinit" vs "viinit"). Prefer the specific one.
  const type = firstNonEmpty(raw.productGroupName) ?? firstNonEmpty(raw.mainGroupName) ?? '';

  const grapeLabels = (raw.grapes ?? [])
    .map((g) => takePipeLabel(g))
    .filter((g): g is string => g !== null);
  const grapes = grapeLabels.length > 0 ? grapeLabels.join(', ') : null;

  const country = raw.countryName?.trim() || takePipeLabel(raw.country) || '';

  const description = cleanString(raw.taste);
  const notes = cleanString(raw.additionalInfo);

  const now = new Date().toISOString();

  return {
    id: raw.id.trim(),
    name: raw.name.trim(),
    // Fields the API does not expose. Defaults are only used for INSERT
    // of brand-new products; SqliteService.upsertProducts's UPDATE path
    // does NOT write these back, so a value populated out-of-band (e.g.
    // via `alko show --enrich`) survives a re-sync.
    producer: '',
    ean: '',
    subtype: null,
    specialGroup: null,
    sortCode: 0,
    region: null,
    labelNotes: null,
    tasteProfile: null,
    usageTips: null,
    servingSuggestion: null,
    foodPairings: null,
    certificates: null,
    ingredients: null,
    smokiness: null,
    smokinessLabel: null,
    acids: null,
    sugar: null,
    energy: null,
    originalGravity: null,
    colorEBC: null,
    bitternessEBU: null,
    isNew: false,
    createdAt: now,

    // Fields the API does supply — these DO get overwritten on update.
    price,
    pricePerLiter,
    bottleSize: packageSize ?? '',
    packagingType,
    closureType,
    type,
    beerType: firstNonEmpty(raw.beerStyleName),
    country,
    vintage: extractVintageFromName(raw.name),
    grapes,
    description,
    notes,
    alcoholPercentage: abv,
    assortment,
    updatedAt: now,
  };
}

/**
 * Coerce a value that may be a number, numeric string, or nullish into
 * a plain `number`. Comma decimals ("12,50") are accepted for safety even
 * though the API currently emits JSON numbers.
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Alko's array-style metadata fields encode an id + slug + display label
 * separated by pipes, e.g. "packageTypeId|packageType_pullo|lasipullo".
 * This helper returns the last non-empty pipe segment (the display label)
 * or `null` when the input is missing or unparseable.
 */
function takePipeLabel(token: string | undefined | null): string | null {
  if (typeof token !== 'string') return null;
  const trimmed = token.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('|').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  return parts[parts.length - 1];
}

function firstNonEmpty(arr: string[] | undefined): string | null {
  if (!Array.isArray(arr)) return null;
  for (const v of arr) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Best-effort vintage parse: look for a trailing 4-digit year in the 1900s
 * or 2000s. Examples: "Château X 2019" → 2019, "Barolo 2015 Riserva" → 2015.
 * Returns `null` when the name contains no recognisable year.
 */
function extractVintageFromName(name: string): number | null {
  const matches = name.match(/\b(19|20)\d{2}\b/g);
  if (!matches || matches.length === 0) return null;
  const n = Number.parseInt(matches[matches.length - 1], 10);
  return Number.isFinite(n) ? n : null;
}
