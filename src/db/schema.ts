/**
 * SQLite schema for alko-cli.
 * All timestamps are ISO 8601 strings (TEXT columns).
 */

export const SCHEMA_VERSION = 2;

/**
 * Full schema DDL. Safe to run multiple times (IF NOT EXISTS everywhere).
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  producer         TEXT NOT NULL DEFAULT '',
  ean              TEXT NOT NULL DEFAULT '',
  price            REAL NOT NULL,
  price_per_liter  REAL NOT NULL,
  bottle_size      TEXT NOT NULL DEFAULT '',
  packaging_type   TEXT,
  closure_type     TEXT,
  type             TEXT NOT NULL DEFAULT '',
  subtype          TEXT,
  special_group    TEXT,
  beer_type        TEXT,
  sort_code        INTEGER NOT NULL DEFAULT 0,
  country          TEXT NOT NULL DEFAULT '',
  region           TEXT,
  vintage          INTEGER,
  grapes           TEXT,
  label_notes      TEXT,
  description      TEXT,
  notes            TEXT,
  alcohol_percentage REAL NOT NULL DEFAULT 0,
  acids              REAL,
  sugar              REAL,
  energy             REAL,
  original_gravity   REAL,
  color_ebc          REAL,
  bitterness_ebu     REAL,
  assortment  TEXT NOT NULL DEFAULT '',
  is_new      INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_country ON products(country);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_alcohol ON products(alcohol_percentage);
CREATE INDEX IF NOT EXISTS idx_products_assortment ON products(assortment);
CREATE INDEX IF NOT EXISTS idx_products_is_new ON products(is_new);
CREATE INDEX IF NOT EXISTS idx_products_type_price ON products(type, price);

CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  name, producer, country, region, type, subtype, description, grapes,
  content='products',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid, name, producer, country, region, type, subtype, description, grapes)
  VALUES (new.rowid, new.name, new.producer, new.country, new.region, new.type, new.subtype, new.description, new.grapes);
END;
CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, producer, country, region, type, subtype, description, grapes)
  VALUES ('delete', old.rowid, old.name, old.producer, old.country, old.region, old.type, old.subtype, old.description, old.grapes);
END;
CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, producer, country, region, type, subtype, description, grapes)
  VALUES ('delete', old.rowid, old.name, old.producer, old.country, old.region, old.type, old.subtype, old.description, old.grapes);
  INSERT INTO products_fts(rowid, name, producer, country, region, type, subtype, description, grapes)
  VALUES (new.rowid, new.name, new.producer, new.country, new.region, new.type, new.subtype, new.description, new.grapes);
END;

CREATE TABLE IF NOT EXISTS stores (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  city                   TEXT NOT NULL DEFAULT '',
  address                TEXT NOT NULL DEFAULT '',
  postal_code            TEXT NOT NULL DEFAULT '',
  lat                    REAL,
  lng                    REAL,
  store_link             TEXT NOT NULL DEFAULT '',
  phone                  TEXT,
  email                  TEXT,
  opening_hours_today    TEXT,
  opening_hours_tomorrow TEXT,
  updated_at             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stores_city ON stores(city COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

/**
 * SQL fragment that initializes the meta row if missing.
 */
export function initialMetaSql(version: number): string {
  return `
INSERT OR IGNORE INTO meta(key, value) VALUES
  ('schema_version', '${version}'),
  ('created_at', '${new Date().toISOString()}');
`;
}
