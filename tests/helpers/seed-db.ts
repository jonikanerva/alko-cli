import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Product } from '../../src/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..', '..');
const SEED_RUNNER = join(PROJECT_ROOT, 'tests', 'helpers', 'seed-runner.mjs');

/**
 * Seed a temporary SQLite catalog with deterministic test products and
 * the meta rows the `status` command reads. Used by the integration test
 * suite so end-to-end tests stay offline.
 *
 * Implementation note: seeding is delegated to a stand-alone Node script
 * (seed-runner.mjs) because Vitest's Vite-based loader cannot resolve
 * the `node:sqlite` builtin. Spawning Node mirrors the strategy used to
 * run the compiled CLI.
 */
export function seedTestCatalog(dbPath: string, products: Product[]): void {
  execFileSync('node', [SEED_RUNNER, dbPath], {
    input: JSON.stringify(products),
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

export function makeProduct(overrides: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    name: overrides.name,
    producer: '',
    ean: '',
    price: 10,
    pricePerLiter: 13.33,
    bottleSize: '0,75 l',
    packagingType: 'lasipullo',
    closureType: null,
    type: 'punaviinit',
    subtype: null,
    specialGroup: null,
    beerType: null,
    sortCode: 0,
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
    updatedAt: now,
    createdAt: now,
    ...overrides,
  };
}
