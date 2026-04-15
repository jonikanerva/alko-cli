import { describe, it, expect } from 'vitest';
import { mapAlkoApiProduct } from '../../src/services/product-mapper.js';
import type { AlkoApiProduct } from '../../src/services/scraper.js';

function raw(overrides: Partial<AlkoApiProduct> = {}): AlkoApiProduct {
  return {
    id: '000001',
    name: 'Test Product',
    price: 10,
    abv: 12.5,
    volume: 0.75,
    ...overrides,
  };
}

describe('mapAlkoApiProduct', () => {
  it('returns null when id is missing or blank', () => {
    expect(mapAlkoApiProduct(raw({ id: '' }))).toBeNull();
    expect(mapAlkoApiProduct(raw({ id: '   ' }))).toBeNull();
  });

  it('returns null when name is missing or blank', () => {
    expect(mapAlkoApiProduct(raw({ name: '' }))).toBeNull();
    expect(mapAlkoApiProduct(raw({ name: '   ' }))).toBeNull();
  });

  it('returns null when price is negative or non-numeric', () => {
    expect(mapAlkoApiProduct(raw({ price: -1 }))).toBeNull();
    expect(mapAlkoApiProduct(raw({ price: 'not-a-number' }))).toBeNull();
  });

  it('returns null when abv is out of [0, 100]', () => {
    expect(mapAlkoApiProduct(raw({ abv: 105 }))).toBeNull();
    expect(mapAlkoApiProduct(raw({ abv: -1 }))).toBeNull();
  });

  it('maps a minimal product', () => {
    const p = mapAlkoApiProduct(raw({ price: 12.5, volume: 0.5 }));
    expect(p).not.toBeNull();
    expect(p?.id).toBe('000001');
    expect(p?.name).toBe('Test Product');
    expect(p?.price).toBe(12.5);
    expect(p?.pricePerLiter).toBe(25);
    expect(p?.alcoholPercentage).toBe(12.5);
    expect(p?.producer).toBe('');
    expect(p?.ean).toBe('');
  });

  it('accepts numeric strings with comma decimals', () => {
    const p = mapAlkoApiProduct(raw({ price: '12,50', abv: '13,5', volume: '0,75' }));
    expect(p?.price).toBe(12.5);
    expect(p?.alcoholPercentage).toBe(13.5);
    // 12.50 / 0.75 = 16.666... rounded to 2 decimals
    expect(p?.pricePerLiter).toBe(16.67);
  });

  it('extracts display labels from pipe-encoded metadata', () => {
    const p = mapAlkoApiProduct(
      raw({
        packageSizes: ['packageSizeId|packageSize_0x75|0,75 l'],
        packageTypes: ['packageTypeId|packageType_pullo|lasipullo'],
        closures: ['closureId|closure_Luonnonkorkki|luonnonkorkki'],
        selectionTypes: ['selectionTypeId|selectionType_003|tilausvalikoima'],
      })
    );
    expect(p?.bottleSize).toBe('0,75 l');
    expect(p?.packagingType).toBe('lasipullo');
    expect(p?.closureType).toBe('luonnonkorkki');
    expect(p?.assortment).toBe('tilausvalikoima');
  });

  it('prefers productGroupName over mainGroupName for type', () => {
    const p = mapAlkoApiProduct(
      raw({
        mainGroupName: ['viinit'],
        productGroupName: ['punaviinit'],
      })
    );
    expect(p?.type).toBe('punaviinit');
  });

  it('falls back to mainGroupName when productGroupName is missing', () => {
    const p = mapAlkoApiProduct(raw({ mainGroupName: ['viinit'] }));
    expect(p?.type).toBe('viinit');
  });

  it('picks countryName when present, else parses pipe-encoded country', () => {
    const p1 = mapAlkoApiProduct(raw({ countryName: 'Ranska', country: 'countryId|FRA|Ranska|' }));
    expect(p1?.country).toBe('Ranska');

    const p2 = mapAlkoApiProduct(raw({ countryName: undefined, country: 'countryId|ITA|Italia|' }));
    expect(p2?.country).toBe('Italia');
  });

  it('joins grape display labels with a comma', () => {
    const p = mapAlkoApiProduct(
      raw({
        grapes: [
          'grapeId|grape_syrah|Syrah',
          'grapeId|grape_grenache|Grenache',
        ],
      })
    );
    expect(p?.grapes).toBe('Syrah, Grenache');
  });

  it('returns null grapes when the array is empty', () => {
    expect(mapAlkoApiProduct(raw({ grapes: [] }))?.grapes).toBeNull();
  });

  it('maps beerStyleName[0] into beerType', () => {
    const p = mapAlkoApiProduct(raw({ beerStyleName: ['ipa'] }));
    expect(p?.beerType).toBe('ipa');
  });

  it('extracts vintage from the last 4-digit year in the name', () => {
    expect(mapAlkoApiProduct(raw({ name: 'Château X 2019' }))?.vintage).toBe(2019);
    expect(mapAlkoApiProduct(raw({ name: 'Barolo 2015 Riserva' }))?.vintage).toBe(2015);
    expect(mapAlkoApiProduct(raw({ name: 'Des Grand Chemins Crozes-Hermitage 2020' }))?.vintage).toBe(2020);
  });

  it('returns null vintage when no year appears in the name', () => {
    expect(mapAlkoApiProduct(raw({ name: 'Sauvignon Blanc' }))?.vintage).toBeNull();
  });

  it('trims taste into description and tasteProfile', () => {
    const p = mapAlkoApiProduct(raw({ taste: '  Runsaanpunainen, täyteläinen  ' }));
    expect(p?.description).toBe('Runsaanpunainen, täyteläinen');
    expect(p?.tasteProfile).toBe('Runsaanpunainen, täyteläinen');
  });

  it('leaves price-per-liter at 0 when volume is 0 or missing', () => {
    const p = mapAlkoApiProduct(raw({ volume: 0 }));
    expect(p?.pricePerLiter).toBe(0);
    const p2 = mapAlkoApiProduct(raw({ volume: undefined }));
    expect(p2?.pricePerLiter).toBe(0);
  });

  it('ignores unknown extra fields without throwing', () => {
    const p = mapAlkoApiProduct(
      raw({
        id: '123',
        name: 'X',
        someNewField: 'whatever',
        anotherThing: [1, 2, 3],
      } as AlkoApiProduct)
    );
    expect(p).not.toBeNull();
    expect(p?.id).toBe('123');
  });

  it('trims leading/trailing whitespace from id and name', () => {
    const p = mapAlkoApiProduct(raw({ id: '  000777  ', name: '  Spaced Name  ' }));
    expect(p?.id).toBe('000777');
    expect(p?.name).toBe('Spaced Name');
  });
});
