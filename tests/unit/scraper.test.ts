import { describe, it, expect } from 'vitest';
import {
  parseAvailabilityApiResponse,
  type AvailabilityApiResponse,
} from '../../src/services/scraper.js';

function apiItem(overrides: Partial<AvailabilityApiResponse> = {}): AvailabilityApiResponse {
  return {
    id: '2001',
    count: 10,
    storeName: 'Alko Testikylä',
    outletType: '1',
    address: 'Testikatu 1',
    latitude: 0,
    longitude: 0,
    openHours: [],
    city: 'TESTIKYLÄ',
    postalCode: '00100',
    open: true,
    ...overrides,
  };
}

describe('parseAvailabilityApiResponse', () => {
  it('returns an empty array for non-array input', () => {
    expect(parseAvailabilityApiResponse(null as unknown as AvailabilityApiResponse[])).toEqual([]);
    expect(parseAvailabilityApiResponse(undefined as unknown as AvailabilityApiResponse[])).toEqual(
      []
    );
  });

  it('filters out stores with zero stock', () => {
    const input = [apiItem({ count: 0 }), apiItem({ id: '2002', count: 3 })];
    const result = parseAvailabilityApiResponse(input);
    expect(result).toHaveLength(1);
    expect(result[0].storeId).toBe('2002');
  });

  it('classifies stock buckets', () => {
    const result = parseAvailabilityApiResponse([
      apiItem({ id: '1', count: 1 }),
      apiItem({ id: '2', count: 5 }),
      apiItem({ id: '3', count: 6 }),
      apiItem({ id: '4', count: 50 }),
    ]);
    expect(result.map((r) => r.status)).toEqual([
      'low_stock',
      'low_stock',
      'in_stock',
      'in_stock',
    ]);
  });

  it('maps API fields to StoreAvailability shape', () => {
    const [store] = parseAvailabilityApiResponse([
      apiItem({
        id: '2050',
        count: 12,
        storeName: 'Alko Helsinki Kamppi',
        address: 'Urho Kekkosen katu 1',
        city: 'HELSINKI',
        postalCode: '00100',
        open: false,
      }),
    ]);
    expect(store).toEqual({
      storeId: '2050',
      storeName: 'Alko Helsinki Kamppi',
      address: 'Urho Kekkosen katu 1',
      city: 'HELSINKI',
      postalCode: '00100',
      quantity: 12,
      status: 'in_stock',
      open: false,
    });
  });

  it('defaults missing string fields to empty strings', () => {
    const [store] = parseAvailabilityApiResponse([
      apiItem({
        address: undefined as unknown as string,
        city: undefined as unknown as string,
        postalCode: undefined as unknown as string,
      }),
    ]);
    expect(store.address).toBe('');
    expect(store.city).toBe('');
    expect(store.postalCode).toBe('');
  });
});
