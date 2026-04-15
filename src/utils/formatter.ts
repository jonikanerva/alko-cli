import type { Product, Store } from '../types/index.js';
import type { ProductAvailabilityResult } from '../types/availability.js';
import type { ProductSearchResult } from '../types/product.js';

/**
 * Determine output format: explicit flag > autodetect by isTTY.
 * When stdout is piped (not TTY), default to JSON so downstream tools like
 * `jq` can parse it.
 */
export function detectFormat(flags: { json?: boolean; table?: boolean }): 'json' | 'table' {
  if (flags.json) return 'json';
  if (flags.table) return 'table';
  return process.stdout.isTTY ? 'table' : 'json';
}

/** JSON-serialize without any omission; arrays/objects returned as-is. */
export function formatJson(value: unknown): string {
  return JSON.stringify(value) + '\n';
}

/**
 * Truncate a string to `n` runes with an ellipsis suffix. Uses byte-width
 * (good enough for Latin + common Scandi chars). Returns the original
 * string if it's within length.
 */
function truncate(raw: string | null | undefined, max: number): string {
  const s = raw ?? '';
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, max);
  return s.slice(0, max - 1) + '…';
}

function padRight(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

function padLeft(s: string, width: number): string {
  if (s.length >= width) return s;
  return ' '.repeat(width - s.length) + s;
}

function euro(n: number): string {
  return n.toFixed(2) + '€';
}

function alcPct(n: number): string {
  return n.toFixed(1);
}

/**
 * Render a product search result as a human-readable table.
 */
export function formatProductsTable(result: ProductSearchResult): string {
  if (result.products.length === 0) {
    return 'No matching products.\n';
  }

  const rows = result.products.map((p) => ({
    id: p.id,
    name: truncate(p.name, 38),
    type: truncate(p.type, 14),
    country: truncate(p.country, 14),
    price: euro(p.price),
    alc: alcPct(p.alcoholPercentage),
  }));

  const widths = {
    id: Math.max(6, ...rows.map((r) => r.id.length)),
    name: Math.max(4, ...rows.map((r) => r.name.length)),
    type: Math.max(6, ...rows.map((r) => r.type.length)),
    country: Math.max(4, ...rows.map((r) => r.country.length)),
    price: Math.max(5, ...rows.map((r) => r.price.length)),
    alc: Math.max(4, ...rows.map((r) => r.alc.length)),
  };

  const header =
    '  ' +
    [
      padRight('ID', widths.id),
      padRight('Nimi', widths.name),
      padRight('Tyyppi', widths.type),
      padRight('Maa', widths.country),
      padLeft('Hinta', widths.price),
      padLeft('Alk%', widths.alc),
    ].join('  ');
  const sep =
    '  ' +
    [
      '─'.repeat(widths.id),
      '─'.repeat(widths.name),
      '─'.repeat(widths.type),
      '─'.repeat(widths.country),
      '─'.repeat(widths.price),
      '─'.repeat(widths.alc),
    ].join('  ');

  const body = rows
    .map(
      (r) =>
        '  ' +
        [
          padRight(r.id, widths.id),
          padRight(r.name, widths.name),
          padRight(r.type, widths.type),
          padRight(r.country, widths.country),
          padLeft(r.price, widths.price),
          padLeft(r.alc, widths.alc),
        ].join('  ')
    )
    .join('\n');

  const shown = result.products.length;
  const nextHint = result.hasMore
    ? ` · next page: --offset ${result.offset + shown}`
    : '';
  const footer = `\n\n  ${shown} shown · ${result.total} match${result.total === 1 ? '' : 'es'}${nextHint}\n`;

  return [header, sep, body].join('\n') + footer;
}

/**
 * Render a single product as a multi-line "key: value" block.
 */
export function formatProductDetail(p: Product): string {
  const lines: string[] = [];
  const add = (k: string, v: unknown) => {
    if (v === null || v === undefined || v === '') return;
    if (Array.isArray(v) && v.length === 0) return;
    lines.push(`${k.padEnd(20)}  ${Array.isArray(v) ? v.join(', ') : String(v)}`);
  };

  add('ID', p.id);
  add('Nimi', p.name);
  add('Valmistaja', p.producer);
  add('Tyyppi', p.type);
  add('Alatyyppi', p.subtype);
  add('Oluttyyppi', p.beerType);
  add('Maa', p.country);
  add('Alue', p.region);
  add('Vuosikerta', p.vintage);
  add('Rypäleet', p.grapes);
  add('Hinta', euro(p.price));
  add('Litrahinta', euro(p.pricePerLiter));
  add('Pullokoko', p.bottleSize);
  add('Pakkaustyyppi', p.packagingType);
  add('Suljentatyyppi', p.closureType);
  add('Alkoholi-%', alcPct(p.alcoholPercentage));
  add('Hapot g/l', p.acids);
  add('Sokeri g/l', p.sugar);
  add('Energia', p.energy);
  add('Savuisuus', p.smokiness !== null ? `${p.smokiness} (${p.smokinessLabel ?? ''})` : null);
  add('Erityisryhmä', p.specialGroup);
  add('Valikoima', p.assortment);
  add('Uutuus', p.isNew ? 'kyllä' : null);
  add('EAN', p.ean);
  add('Luonnehdinta', p.description);
  add('Huomautus', p.notes);
  add('Makuprofiili', p.tasteProfile);
  add('Käyttövinkit', p.usageTips);
  add('Tarjoilu', p.servingSuggestion);
  add('Ruokapari', p.foodPairings);
  add('Sertifikaatit', p.certificates);
  add('Ainesosat', p.ingredients);
  add('Updated', p.updatedAt);

  return lines.join('\n') + '\n';
}

/**
 * Render stores as a simple table.
 */
export function formatStoresTable(stores: Store[]): string {
  if (stores.length === 0) return 'No matching stores.\n';

  const rows = stores.map((s) => ({
    id: s.id,
    name: truncate(s.name, 30),
    city: truncate(s.city, 16),
    address: truncate(s.address, 36),
    today: s.openingHoursToday ?? '',
  }));

  const widths = {
    id: Math.max(4, ...rows.map((r) => r.id.length)),
    name: Math.max(4, ...rows.map((r) => r.name.length)),
    city: Math.max(4, ...rows.map((r) => r.city.length)),
    address: Math.max(7, ...rows.map((r) => r.address.length)),
    today: Math.max(5, ...rows.map((r) => r.today.length)),
  };

  const header =
    '  ' +
    [
      padRight('ID', widths.id),
      padRight('Nimi', widths.name),
      padRight('Kaupunki', widths.city),
      padRight('Osoite', widths.address),
      padRight('Tänään', widths.today),
    ].join('  ');
  const sep =
    '  ' +
    [
      '─'.repeat(widths.id),
      '─'.repeat(widths.name),
      '─'.repeat(widths.city),
      '─'.repeat(widths.address),
      '─'.repeat(widths.today),
    ].join('  ');

  const body = rows
    .map(
      (r) =>
        '  ' +
        [
          padRight(r.id, widths.id),
          padRight(r.name, widths.name),
          padRight(r.city, widths.city),
          padRight(r.address, widths.address),
          padRight(r.today, widths.today),
        ].join('  ')
    )
    .join('\n');

  return [header, sep, body].join('\n') + `\n\n  ${stores.length} stores.\n`;
}

/**
 * Render a product-availability result as a table. Stores with the most
 * stock come first so humans see the best options at a glance; downstream
 * JSON consumers get the API's original order via `formatJson`.
 */
export function formatAvailabilityTable(result: ProductAvailabilityResult): string {
  if (result.stores.length === 0) {
    return `No stock found for product ${result.productId}.\n`;
  }

  const sorted = [...result.stores].sort((a, b) => b.quantity - a.quantity);

  const rows = sorted.map((s) => ({
    store: truncate(s.storeName, 30),
    city: truncate(s.city, 18),
    qty: String(s.quantity),
    status: s.status,
    open: s.open ? 'yes' : 'no',
  }));

  const widths = {
    store: Math.max(5, ...rows.map((r) => r.store.length)),
    city: Math.max(4, ...rows.map((r) => r.city.length)),
    qty: Math.max(3, ...rows.map((r) => r.qty.length)),
    status: Math.max(6, ...rows.map((r) => r.status.length)),
    open: Math.max(4, ...rows.map((r) => r.open.length)),
  };

  const header =
    '  ' +
    [
      padRight('Store', widths.store),
      padRight('City', widths.city),
      padLeft('Qty', widths.qty),
      padRight('Status', widths.status),
      padRight('Open', widths.open),
    ].join('  ');
  const sep =
    '  ' +
    [
      '─'.repeat(widths.store),
      '─'.repeat(widths.city),
      '─'.repeat(widths.qty),
      '─'.repeat(widths.status),
      '─'.repeat(widths.open),
    ].join('  ');
  const body = rows
    .map(
      (r) =>
        '  ' +
        [
          padRight(r.store, widths.store),
          padRight(r.city, widths.city),
          padLeft(r.qty, widths.qty),
          padRight(r.status, widths.status),
          padRight(r.open, widths.open),
        ].join('  ')
    )
    .join('\n');

  const totalQty = sorted.reduce((acc, s) => acc + s.quantity, 0);
  const footer = `\n\n  ${sorted.length} stores · ${totalQty} units total · checked ${result.checkedAt}\n`;

  return [header, sep, body].join('\n') + footer;
}
