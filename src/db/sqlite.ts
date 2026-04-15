import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { SCHEMA_SQL, SCHEMA_VERSION, initialMetaSql } from './schema.js';
import type {
  Product,
  ProductSearchFilters,
  ProductSearchOptions,
  ProductSearchResult,
  Store,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * SqliteService — local SQLite storage layer.
 * Synchronous, file-backed via Node's built-in `node:sqlite` module.
 */
export class SqliteService {
  private readonly db: DatabaseSync;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.applyPragmas();
    this.runMigrations();
  }

  get path(): string {
    return this.dbPath;
  }

  private applyPragmas(): void {
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  private runMigrations(): void {
    this.db.exec(SCHEMA_SQL);
    this.db.exec(initialMetaSql(SCHEMA_VERSION));
  }

  close(): void {
    try {
      this.db.close();
    } catch (err) {
      logger.debug('sqlite close failed', { err: String(err) });
    }
  }

  // ============== Row <-> Product mapping ==============

  private rowToProduct(row: Record<string, unknown>): Product {
    return {
      id: row.id as string,
      name: row.name as string,
      producer: (row.producer as string) ?? '',
      ean: (row.ean as string) ?? '',
      price: Number(row.price ?? 0),
      pricePerLiter: Number(row.price_per_liter ?? 0),
      bottleSize: (row.bottle_size as string) ?? '',
      packagingType: (row.packaging_type as string) ?? null,
      closureType: (row.closure_type as string) ?? null,
      type: (row.type as string) ?? '',
      subtype: (row.subtype as string) ?? null,
      specialGroup: (row.special_group as string) ?? null,
      beerType: (row.beer_type as string) ?? null,
      sortCode: Number(row.sort_code ?? 0),
      country: (row.country as string) ?? '',
      region: (row.region as string) ?? null,
      vintage: row.vintage === null || row.vintage === undefined ? null : Number(row.vintage),
      grapes: (row.grapes as string) ?? null,
      labelNotes: (row.label_notes as string) ?? null,
      description: (row.description as string) ?? null,
      notes: (row.notes as string) ?? null,
      tasteProfile: (row.taste_profile as string) ?? null,
      usageTips: (row.usage_tips as string) ?? null,
      servingSuggestion: (row.serving_suggestion as string) ?? null,
      foodPairings: this.parseJsonArray(row.food_pairings),
      certificates: this.parseJsonArray(row.certificates),
      ingredients: (row.ingredients as string) ?? null,
      smokiness:
        row.smokiness === null || row.smokiness === undefined ? null : Number(row.smokiness),
      smokinessLabel: (row.smokiness_label as string) ?? null,
      alcoholPercentage: Number(row.alcohol_percentage ?? 0),
      acids: row.acids === null || row.acids === undefined ? null : Number(row.acids),
      sugar: row.sugar === null || row.sugar === undefined ? null : Number(row.sugar),
      energy: row.energy === null || row.energy === undefined ? null : Number(row.energy),
      originalGravity:
        row.original_gravity === null || row.original_gravity === undefined
          ? null
          : Number(row.original_gravity),
      colorEBC: row.color_ebc === null || row.color_ebc === undefined ? null : Number(row.color_ebc),
      bitternessEBU:
        row.bitterness_ebu === null || row.bitterness_ebu === undefined
          ? null
          : Number(row.bitterness_ebu),
      assortment: (row.assortment as string) ?? '',
      isNew: Number(row.is_new ?? 0) === 1,
      updatedAt: (row.updated_at as string) ?? '',
      createdAt: (row.created_at as string) ?? '',
    };
  }

  private parseJsonArray(value: unknown): string[] | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return null;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : null;
    } catch {
      return null;
    }
  }

  // ============== Products ==============

  getProduct(id: string): Product | null {
    const row = this.db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToProduct(row) : null;
  }

  getProductCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM products')
      .get() as { c: number } | undefined;
    return row ? Number(row.c) : 0;
  }

  getDistinctValues(field: 'type' | 'country' | 'region' | 'assortment' | 'special_group' | 'beer_type'): string[] {
    // Whitelist via parameter typing; safe against injection.
    const rows = this.db
      .prepare(`SELECT DISTINCT ${field} AS v FROM products WHERE ${field} IS NOT NULL AND ${field} != '' ORDER BY ${field}`)
      .all() as { v: string }[];
    return rows.map((r) => r.v);
  }

  /**
   * Upsert products in a single transaction.
   * Preserves created_at for existing products, bumps updated_at to now.
   *
   * The UPDATE path only rewrites columns the Alko search API is known
   * to supply (price, type, country, alcohol, etc.). Columns the API
   * does not expose — producer, ean, subtype, special_group, region,
   * notes, and all enrichment / beer-spec columns — are left alone, so
   * a value populated out-of-band (e.g. via `alko show --enrich`)
   * survives a re-sync. INSERT still writes every column because a
   * brand-new row has nothing to preserve.
   */
  upsertProducts(products: Product[]): { added: number; updated: number } {
    if (products.length === 0) return { added: 0, updated: 0 };

    const existing = this.db.prepare('SELECT id FROM products WHERE id = ?');
    const insert = this.db.prepare(
      `INSERT INTO products (
        id, name, producer, ean, price, price_per_liter, bottle_size,
        packaging_type, closure_type, type, subtype, special_group, beer_type,
        sort_code, country, region, vintage, grapes, label_notes,
        description, notes, taste_profile, usage_tips, serving_suggestion,
        food_pairings, certificates, ingredients, smokiness, smokiness_label,
        alcohol_percentage, acids, sugar, energy, original_gravity, color_ebc,
        bitterness_ebu, assortment, is_new, updated_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )`
    );
    const update = this.db.prepare(
      `UPDATE products SET
        name = ?,
        price = ?, price_per_liter = ?,
        bottle_size = ?, packaging_type = ?, closure_type = ?,
        type = ?, beer_type = ?,
        country = ?, vintage = ?, grapes = ?,
        description = ?,
        alcohol_percentage = ?, assortment = ?,
        updated_at = ?
       WHERE id = ?`
    );

    let added = 0;
    let updated = 0;

    this.db.exec('BEGIN');
    try {
      for (const p of products) {
        const existsRow = existing.get(p.id) as { id: string } | undefined;
        if (existsRow) {
          update.run(
            p.name,
            p.price,
            p.pricePerLiter,
            p.bottleSize,
            p.packagingType,
            p.closureType,
            p.type,
            p.beerType,
            p.country,
            p.vintage,
            p.grapes,
            p.description,
            p.alcoholPercentage,
            p.assortment,
            p.updatedAt,
            p.id
          );
          updated++;
        } else {
          insert.run(
            p.id,
            p.name,
            p.producer,
            p.ean,
            p.price,
            p.pricePerLiter,
            p.bottleSize,
            p.packagingType,
            p.closureType,
            p.type,
            p.subtype,
            p.specialGroup,
            p.beerType,
            p.sortCode,
            p.country,
            p.region,
            p.vintage,
            p.grapes,
            p.labelNotes,
            p.description,
            p.notes,
            p.tasteProfile,
            p.usageTips,
            p.servingSuggestion,
            p.foodPairings ? JSON.stringify(p.foodPairings) : null,
            p.certificates ? JSON.stringify(p.certificates) : null,
            p.ingredients,
            p.smokiness,
            p.smokinessLabel,
            p.alcoholPercentage,
            p.acids,
            p.sugar,
            p.energy,
            p.originalGravity,
            p.colorEBC,
            p.bitternessEBU,
            p.assortment,
            p.isNew ? 1 : 0,
            p.updatedAt,
            p.createdAt
          );
          added++;
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return { added, updated };
  }

  /**
   * Remove products whose IDs are not in `keepIds`. Returns the deletion
   * count. Intended for full catalog syncs — callers MUST NOT invoke this
   * after a partial (`--limit`) sync or every run would delete the whole
   * tail of the catalog.
   */
  deleteProductsNotIn(keepIds: Set<string>): number {
    if (keepIds.size === 0) return 0;
    const allIds = this.db.prepare('SELECT id FROM products').all() as { id: string }[];
    const doomed = allIds.filter((row) => !keepIds.has(row.id));
    if (doomed.length === 0) return 0;
    const stmt = this.db.prepare('DELETE FROM products WHERE id = ?');
    this.db.exec('BEGIN');
    try {
      for (const { id } of doomed) stmt.run(id);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return doomed.length;
  }

  /**
   * Remove stores whose IDs are not in `keepIds`. Same contract as
   * {@link deleteProductsNotIn}: full-sync callers only.
   */
  deleteStoresNotIn(keepIds: Set<string>): number {
    if (keepIds.size === 0) return 0;
    const allIds = this.db.prepare('SELECT id FROM stores').all() as { id: string }[];
    const doomed = allIds.filter((row) => !keepIds.has(row.id));
    if (doomed.length === 0) return 0;
    const stmt = this.db.prepare('DELETE FROM stores WHERE id = ?');
    this.db.exec('BEGIN');
    try {
      for (const { id } of doomed) stmt.run(id);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return doomed.length;
  }

  /**
   * Patch an existing product's enriched fields (tasteProfile, foodPairings, etc.).
   */
  updateProductEnrichment(
    id: string,
    patch: Partial<
      Pick<
        Product,
        | 'tasteProfile'
        | 'usageTips'
        | 'servingSuggestion'
        | 'foodPairings'
        | 'certificates'
        | 'ingredients'
        | 'smokiness'
        | 'smokinessLabel'
      >
    >
  ): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, v: unknown) => {
      fields.push(`${col} = ?`);
      values.push(v);
    };

    if (patch.tasteProfile !== undefined) push('taste_profile', patch.tasteProfile);
    if (patch.usageTips !== undefined) push('usage_tips', patch.usageTips);
    if (patch.servingSuggestion !== undefined) push('serving_suggestion', patch.servingSuggestion);
    if (patch.foodPairings !== undefined) push('food_pairings', patch.foodPairings ? JSON.stringify(patch.foodPairings) : null);
    if (patch.certificates !== undefined) push('certificates', patch.certificates ? JSON.stringify(patch.certificates) : null);
    if (patch.ingredients !== undefined) push('ingredients', patch.ingredients);
    if (patch.smokiness !== undefined) push('smokiness', patch.smokiness);
    if (patch.smokinessLabel !== undefined) push('smokiness_label', patch.smokinessLabel);

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db
      .prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));
  }

  // ============== Search ==============

  searchProducts(
    filters: ProductSearchFilters,
    options: ProductSearchOptions = {}
  ): ProductSearchResult {
    const { sortBy, sortOrder = 'asc', limit } = options;
    // SQLite treats `LIMIT -1` as "no upper bound" — honour it when the
    // caller did not pass a limit so the CLI returns the full match set.
    const sqlLimit = limit === undefined ? -1 : limit;

    // Tracking whether the caller *explicitly* requested a sort matters for
    // the FTS branch: when there is no text query, `name` ASC is the natural
    // default; with a text query we want relevance unless the user asked
    // otherwise. `sortBy === undefined` distinguishes those two cases.
    const userRequestedSort = sortBy !== undefined;

    const useFts = !!filters.query && filters.query.trim().length > 0;
    const whereClauses: string[] = [];
    const whereParams: unknown[] = [];

    // Structured filters (work with and without FTS)
    if (filters.type) {
      whereClauses.push('p.type = ?');
      whereParams.push(filters.type);
    }
    if (filters.country) {
      whereClauses.push('LOWER(p.country) = LOWER(?)');
      whereParams.push(filters.country);
    }
    if (filters.region) {
      whereClauses.push('LOWER(p.region) = LOWER(?)');
      whereParams.push(filters.region);
    }
    if (filters.assortment) {
      whereClauses.push('p.assortment = ?');
      whereParams.push(filters.assortment);
    }
    if (filters.specialGroup) {
      whereClauses.push('p.special_group = ?');
      whereParams.push(filters.specialGroup);
    } else if (filters.isOrganic) {
      whereClauses.push("p.special_group = 'Luomu'");
    } else if (filters.isVegan) {
      whereClauses.push("p.special_group = 'Vegaaneille soveltuva tuote'");
    }
    if (filters.beerType) {
      whereClauses.push('p.beer_type = ?');
      whereParams.push(filters.beerType);
    }
    if (filters.isNew !== undefined) {
      whereClauses.push('p.is_new = ?');
      whereParams.push(filters.isNew ? 1 : 0);
    }
    if (filters.minPrice !== undefined) {
      whereClauses.push('p.price >= ?');
      whereParams.push(filters.minPrice);
    }
    if (filters.maxPrice !== undefined) {
      whereClauses.push('p.price <= ?');
      whereParams.push(filters.maxPrice);
    }
    if (filters.minAlcohol !== undefined) {
      whereClauses.push('p.alcohol_percentage >= ?');
      whereParams.push(filters.minAlcohol);
    }
    if (filters.maxAlcohol !== undefined) {
      whereClauses.push('p.alcohol_percentage <= ?');
      whereParams.push(filters.maxAlcohol);
    }
    if (filters.minSmokiness !== undefined) {
      whereClauses.push('p.smokiness >= ?');
      whereParams.push(filters.minSmokiness);
    }
    if (filters.maxSmokiness !== undefined) {
      whereClauses.push('p.smokiness <= ?');
      whereParams.push(filters.maxSmokiness);
    }

    const sortColumn = this.sortColumnForSqlite(sortBy ?? 'name');
    const order = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    let rows: Record<string, unknown>[];
    let total: number;

    if (useFts) {
      const queryLower = filters.query!.toLowerCase();
      const ftsQuery = this.buildFtsQuery(filters.query!);

      const ftsWhere = ['products_fts MATCH ?', ...whereClauses];
      const whereSql = ftsWhere.join(' AND ');

      // Count first so the caller can show "X shown / Y matches" hints
      const countStmt = this.db.prepare(
        `SELECT COUNT(*) AS c
           FROM products_fts
           JOIN products p ON p.rowid = products_fts.rowid
          WHERE ${whereSql}`
      );
      const countRow = countStmt.get(ftsQuery, ...(whereParams as never[])) as
        | { c: number }
        | undefined;
      total = countRow ? Number(countRow.c) : 0;

      // Two ORDER BY modes: honour the user's explicit --sort when given,
      // otherwise fall back to relevance (custom LIKE bonus + FTS rank).
      const orderSql = userRequestedSort
        ? `ORDER BY ${sortColumn} ${order}, p.name COLLATE NOCASE ASC`
        : 'ORDER BY __bonus DESC, __rank ASC, p.name COLLATE NOCASE ASC';
      const selectStmt = this.db.prepare(
        `SELECT p.*,
           (CASE
             WHEN INSTR(LOWER(p.name), ?) > 0 THEN 100
             WHEN INSTR(LOWER(p.producer), ?) > 0 THEN 60
             WHEN INSTR(LOWER(COALESCE(p.country,'') || ' ' || COALESCE(p.region,'') || ' ' || COALESCE(p.grapes,'') || ' ' || COALESCE(p.description,'') || ' ' || COALESCE(p.subtype,'') || ' ' || COALESCE(p.type,'')), ?) > 0 THEN 40
             ELSE 0
           END) AS __bonus,
           products_fts.rank AS __rank
         FROM products_fts
         JOIN products p ON p.rowid = products_fts.rowid
         WHERE ${whereSql}
         ${orderSql}
         LIMIT ?`
      );
      rows = selectStmt.all(
        queryLower,
        queryLower,
        queryLower,
        ftsQuery,
        ...(whereParams as never[]),
        sqlLimit
      ) as Record<string, unknown>[];
    } else {
      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countStmt = this.db.prepare(`SELECT COUNT(*) AS c FROM products p ${whereSql}`);
      const countRow = countStmt.get(...(whereParams as never[])) as { c: number } | undefined;
      total = countRow ? Number(countRow.c) : 0;

      const selectStmt = this.db.prepare(
        `SELECT p.* FROM products p ${whereSql}
         ORDER BY ${sortColumn} ${order}, p.name COLLATE NOCASE ASC
         LIMIT ?`
      );
      rows = selectStmt.all(...(whereParams as never[]), sqlLimit) as Record<string, unknown>[];
    }

    return {
      products: rows.map((r) => this.rowToProduct(r)),
      total,
    };
  }

  private sortColumnForSqlite(sortBy: ProductSearchOptions['sortBy']): string {
    switch (sortBy) {
      case 'price':
        return 'p.price';
      case 'alcohol':
        return 'p.alcohol_percentage';
      case 'pricePerLiter':
        return 'p.price_per_liter';
      case 'name':
      default:
        return 'p.name COLLATE NOCASE';
    }
  }

  /**
   * Build an FTS5 MATCH query. Each whitespace-separated token becomes a
   * quoted FTS term; tokens are ANDed together so ALL words must match.
   * Quoting protects against FTS5 syntax chars in user input.
   */
  private buildFtsQuery(raw: string): string {
    const tokens = raw
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      // Strip characters that are significant to FTS5 (`"` and `*` handling)
      .map((t) => t.replace(/["]/g, ''))
      .filter((t) => t.length > 0);

    if (tokens.length === 0) return '""';
    return tokens.map((t) => `"${t}"`).join(' AND ');
  }

  // ============== Stores ==============

  getStore(id: string): Store | null {
    const row = this.db.prepare('SELECT * FROM stores WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToStore(row) : null;
  }

  listStores(city?: string, limit = 50): Store[] {
    let stmt: StatementSync;
    let rows: Record<string, unknown>[];
    if (city) {
      stmt = this.db.prepare(
        'SELECT * FROM stores WHERE LOWER(city) = LOWER(?) ORDER BY name COLLATE NOCASE LIMIT ?'
      );
      rows = stmt.all(city, limit) as Record<string, unknown>[];
    } else {
      stmt = this.db.prepare('SELECT * FROM stores ORDER BY city COLLATE NOCASE, name COLLATE NOCASE LIMIT ?');
      rows = stmt.all(limit) as Record<string, unknown>[];
    }
    return rows.map((r) => this.rowToStore(r));
  }

  upsertStores(stores: Store[]): { added: number; updated: number } {
    if (stores.length === 0) return { added: 0, updated: 0 };

    const existing = this.db.prepare('SELECT id FROM stores WHERE id = ?');
    const insert = this.db.prepare(
      `INSERT INTO stores (id, name, city, address, postal_code, lat, lng, store_link, phone, email, opening_hours_today, opening_hours_tomorrow, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const update = this.db.prepare(
      `UPDATE stores SET name = ?, city = ?, address = ?, postal_code = ?, lat = ?, lng = ?, store_link = ?, phone = ?, email = ?, opening_hours_today = ?, opening_hours_tomorrow = ?, updated_at = ? WHERE id = ?`
    );

    let added = 0;
    let updated = 0;

    this.db.exec('BEGIN');
    try {
      for (const s of stores) {
        const params = [
          s.name,
          s.city,
          s.address,
          s.postalCode,
          s.coordinates?.lat ?? null,
          s.coordinates?.lng ?? null,
          s.storeLink,
          s.phone,
          s.email,
          s.openingHoursToday,
          s.openingHoursTomorrow,
          s.updatedAt,
        ];
        const exists = existing.get(s.id) as { id: string } | undefined;
        if (exists) {
          update.run(...(params as never[]), s.id);
          updated++;
        } else {
          insert.run(s.id, ...(params as never[]));
          added++;
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return { added, updated };
  }

  private rowToStore(row: Record<string, unknown>): Store {
    const lat = row.lat === null || row.lat === undefined ? null : Number(row.lat);
    const lng = row.lng === null || row.lng === undefined ? null : Number(row.lng);
    return {
      id: row.id as string,
      name: row.name as string,
      city: (row.city as string) ?? '',
      address: (row.address as string) ?? '',
      postalCode: (row.postal_code as string) ?? '',
      coordinates: lat !== null && lng !== null ? { lat, lng } : null,
      storeLink: (row.store_link as string) ?? '',
      phone: (row.phone as string) ?? null,
      email: (row.email as string) ?? null,
      openingHoursToday: (row.opening_hours_today as string) ?? null,
      openingHoursTomorrow: (row.opening_hours_tomorrow as string) ?? null,
      updatedAt: (row.updated_at as string) ?? '',
    };
  }

  getStoreCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM stores')
      .get() as { c: number } | undefined;
    return row ? Number(row.c) : 0;
  }

  // ============== Meta ==============

  getMeta(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }
}
