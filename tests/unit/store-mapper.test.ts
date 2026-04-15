import { describe, it, expect } from 'vitest';
import { mapAlkoApiStore } from '../../src/services/store-mapper.js';
import type { AlkoApiStore } from '../../src/services/scraper.js';

function raw(overrides: Partial<AlkoApiStore> = {}): AlkoApiStore {
  return {
    id: '2440',
    name: 'Akaa Toijala',
    address: 'Valtatie 1',
    postalCode: '37800',
    city: 'Akaa',
    latitude: 61.2,
    longitude: 23.86,
    openHours: [
      { hours: '9-20', date: '2026-04-15' },
      { hours: '9-21', date: '2026-04-16' },
    ],
    ...overrides,
  };
}

const today = new Date('2026-04-15T12:00:00.000Z');

describe('mapAlkoApiStore', () => {
  it('returns null when id is missing or blank', () => {
    expect(mapAlkoApiStore(raw({ id: '' }), today)).toBeNull();
    expect(mapAlkoApiStore(raw({ id: '   ' }), today)).toBeNull();
  });

  it('returns null when name is missing or blank', () => {
    expect(mapAlkoApiStore(raw({ name: '' }), today)).toBeNull();
    expect(mapAlkoApiStore(raw({ name: undefined }), today)).toBeNull();
  });

  it('maps a typical store payload', () => {
    const s = mapAlkoApiStore(raw(), today);
    expect(s).not.toBeNull();
    expect(s?.id).toBe('2440');
    expect(s?.name).toBe('Akaa Toijala');
    expect(s?.city).toBe('Akaa');
    expect(s?.address).toBe('Valtatie 1');
    expect(s?.postalCode).toBe('37800');
    expect(s?.storeLink).toBe('/myymalat-palvelut/2440');
    expect(s?.coordinates).toEqual({ lat: 61.2, lng: 23.86 });
    expect(s?.phone).toBeNull();
    expect(s?.email).toBeNull();
  });

  it("picks today's and tomorrow's hours by date", () => {
    const s = mapAlkoApiStore(raw(), today);
    expect(s?.openingHoursToday).toBe('9-20');
    expect(s?.openingHoursTomorrow).toBe('9-21');
  });

  it('leaves hours null when no matching date is in openHours', () => {
    const s = mapAlkoApiStore(
      raw({
        openHours: [{ hours: '9-18', date: '2026-05-01' }],
      }),
      today
    );
    expect(s?.openingHoursToday).toBeNull();
    expect(s?.openingHoursTomorrow).toBeNull();
  });

  it('returns null coordinates when either lat or lng is missing', () => {
    expect(mapAlkoApiStore(raw({ latitude: undefined }), today)?.coordinates).toBeNull();
    expect(mapAlkoApiStore(raw({ longitude: undefined }), today)?.coordinates).toBeNull();
  });

  it('ignores non-finite coordinates (NaN / Infinity)', () => {
    expect(mapAlkoApiStore(raw({ latitude: Number.NaN }), today)?.coordinates).toBeNull();
    expect(mapAlkoApiStore(raw({ longitude: Infinity }), today)?.coordinates).toBeNull();
  });

  it('trims whitespace from id, name, city, address, postalCode', () => {
    const s = mapAlkoApiStore(
      raw({
        id: '  2440  ',
        name: '  Akaa  ',
        city: '  Akaa  ',
        address: '  Valtatie 1  ',
        postalCode: '  37800  ',
      }),
      today
    );
    expect(s?.id).toBe('2440');
    expect(s?.name).toBe('Akaa');
    expect(s?.city).toBe('Akaa');
    expect(s?.address).toBe('Valtatie 1');
    expect(s?.postalCode).toBe('37800');
  });

  it('stamps updatedAt as the provided "today" value in ISO form', () => {
    const s = mapAlkoApiStore(raw(), today);
    expect(s?.updatedAt).toBe('2026-04-15T12:00:00.000Z');
  });
});
