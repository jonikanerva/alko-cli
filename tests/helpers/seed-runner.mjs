// Stand-alone Node script invoked by tests/helpers/seed-db.ts to seed a
// temp SQLite catalog without importing SqliteService inside the Vitest
// process (Vite cannot resolve node:sqlite). Read products as JSON from
// stdin, write them to the SQLite path passed as the first argument.
//
// Run via: node tests/helpers/seed-runner.mjs <dbPath>
// Stdin: JSON array of Product objects

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..', '..');

const { SqliteService } = await import(
  join(PROJECT_ROOT, 'dist', 'db', 'sqlite.js')
);

const dbPath = process.argv[2];
if (!dbPath) {
  process.stderr.write('seed-runner: missing dbPath argument\n');
  process.exit(1);
}

const products = JSON.parse(readFileSync(0, 'utf8'));
const db = new SqliteService(dbPath);
try {
  db.upsertProducts(products);
  db.setMeta('last_sync', new Date().toISOString());
  db.setMeta('last_sync_source', 'fixture');
  db.setMeta('last_sync_product_count', String(products.length));
} finally {
  db.close();
}
