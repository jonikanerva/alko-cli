import { describe, it, expect } from 'vitest';
import {
  detectFormat,
  formatJson,
  formatProductsTable,
  formatAvailabilityTable,
  formatStoresTable,
} from '../../src/utils/formatter.js';
import type { ProductSearchResult } from '../../src/types/product.js';
import type { ProductAvailabilityResult } from '../../src/types/availability.js';
import type { Product, Store } from '../../src/types/index.js';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: '000001',
    name: 'Test Wine',
    producer: 'Test Producer',
    ean: '1234567890123',
    price: 12.5,
    pricePerLiter: 16.67,
    bottleSize: '0,75 l',
    packagingType: null,
    closureType: null,
    type: 'punaviinit',
    subtype: null,
    specialGroup: null,
    beerType: null,
    sortCode: 1,
    country: 'Ranska',
    region: null,
    vintage: null,
    grapes: null,
    labelNotes: null,
    description: null,
    notes: null,
    tasteProfile: null,
    usageTips: null,
    servingSuggestion: null,
    foodPairings: null,
    certificates: null,
    ingredients: null,
    smokiness: null,
    smokinessLabel: null,
    alcoholPercentage: 13.5,
    acids: null,
    sugar: null,
    energy: null,
    originalGravity: null,
    colorEBC: null,
    bitternessEBU: null,
    assortment: 'vakiovalikoima',
    isNew: false,
    updatedAt: '2026-04-15T10:00:00.000Z',
    createdAt: '2026-04-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('detectFormat', () => {
  it('honours --json over --table', () => {
    expect(detectFormat({ json: true, table: true })).toBe('json');
  });

  it('returns json when stdout is not a TTY and no flag is set', () => {
    const original = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    try {
      expect(detectFormat({})).toBe('json');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: original,
        configurable: true,
      });
    }
  });

  it('returns table when stdout is a TTY and no flag is set', () => {
    const original = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      expect(detectFormat({})).toBe('table');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: original,
        configurable: true,
      });
    }
  });
});

describe('formatJson', () => {
  it('emits newline-terminated JSON', () => {
    expect(formatJson({ a: 1 })).toBe('{"a":1}\n');
  });

  it('preserves null values (unlike the MCP tools which strip them)', () => {
    expect(formatJson({ a: null })).toBe('{"a":null}\n');
  });
});

describe('formatProductsTable', () => {
  it('renders a friendly empty state', () => {
    const result: ProductSearchResult = {
      products: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    };
    expect(formatProductsTable(result)).toBe('No matching products.\n');
  });

  it('includes header, separator, and row counts', () => {
    const result: ProductSearchResult = {
      products: [product(), product({ id: '000002', name: 'Another Wine' })],
      total: 5,
      limit: 20,
      offset: 0,
      hasMore: true,
    };
    const out = formatProductsTable(result);
    expect(out).toContain('ID');
    expect(out).toContain('Nimi');
    expect(out).toContain('Test Wine');
    expect(out).toContain('Another Wine');
    expect(out).toMatch(/2 shown · 5 matches · next page: --offset 2/);
  });

  it('uses singular form for exactly one match', () => {
    const result: ProductSearchResult = {
      products: [product()],
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    };
    expect(formatProductsTable(result)).toMatch(/1 shown · 1 match\n$/);
  });
});

describe('formatAvailabilityTable', () => {
  const checkedAt = '2026-04-15T10:00:00.000Z';
  const base: ProductAvailabilityResult = {
    productId: '000001',
    checkedAt,
    stores: [],
  };

  it('renders a friendly empty state', () => {
    expect(formatAvailabilityTable(base)).toBe('No stock found for product 000001.\n');
  });

  it('sorts by quantity descending', () => {
    const out = formatAvailabilityTable({
      ...base,
      stores: [
        {
          storeId: '1',
          storeName: 'Alko Pieni',
          address: '',
          city: 'Helsinki',
          postalCode: '',
          quantity: 2,
          status: 'low_stock',
          open: true,
        },
        {
          storeId: '2',
          storeName: 'Alko Iso',
          address: '',
          city: 'Helsinki',
          postalCode: '',
          quantity: 42,
          status: 'in_stock',
          open: true,
        },
      ],
    });
    const isoIdx = out.indexOf('Alko Iso');
    const pieniIdx = out.indexOf('Alko Pieni');
    expect(isoIdx).toBeGreaterThan(-1);
    expect(pieniIdx).toBeGreaterThan(-1);
    expect(isoIdx).toBeLessThan(pieniIdx);
  });

  it('sums the quantities in the footer', () => {
    const out = formatAvailabilityTable({
      ...base,
      stores: [
        {
          storeId: '1',
          storeName: 'A',
          address: '',
          city: 'X',
          postalCode: '',
          quantity: 3,
          status: 'low_stock',
          open: true,
        },
        {
          storeId: '2',
          storeName: 'B',
          address: '',
          city: 'Y',
          postalCode: '',
          quantity: 8,
          status: 'in_stock',
          open: false,
        },
      ],
    });
    expect(out).toContain('2 stores · 11 units total');
  });
});

describe('formatStoresTable', () => {
  it('renders a friendly empty state', () => {
    expect(formatStoresTable([])).toBe('No matching stores.\n');
  });

  it('shows basic store fields', () => {
    const stores: Store[] = [
      {
        id: '2001',
        name: 'Alko Testi',
        city: 'HELSINKI',
        address: 'Testikatu 1',
        postalCode: '00100',
        coordinates: null,
        storeLink: '/myymalat-palvelut/2001',
        phone: null,
        email: null,
        openingHoursToday: '10-20',
        openingHoursTomorrow: null,
        updatedAt: '2026-04-15T10:00:00.000Z',
      },
    ];
    const out = formatStoresTable(stores);
    expect(out).toContain('Alko Testi');
    expect(out).toContain('HELSINKI');
    expect(out).toContain('Testikatu 1');
    expect(out).toContain('10-20');
    expect(out).toContain('1 stores.');
  });
});
