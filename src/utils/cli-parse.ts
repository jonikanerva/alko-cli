/**
 * Shared argument parsers for CLI commands.
 *
 * Commander hands everything through as a raw string; these helpers
 * turn them into well-typed values and throw a friendly error rather
 * than letting a malformed value leak all the way into SQLite.
 */

/**
 * Parse a positive integer from a CLI flag value. Rejects decimals,
 * zero, and negative numbers. The `flag` argument is only used in the
 * error message so the user sees which flag misbehaved.
 */
export function parsePositiveInt(raw: string, flag: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${flag} must be a positive integer (got "${raw}")`);
  }
  return n;
}

/** Narrow string type for the --order flag. */
export type SortOrder = 'asc' | 'desc';

/**
 * Parse a sort-order value from a CLI flag. Accepts only "asc" or
 * "desc" (case-insensitive). `undefined` falls back to the provided
 * default so callers can leave the flag omitted.
 */
export function parseSortOrder(
  raw: string | undefined,
  fallback: SortOrder = 'asc'
): SortOrder {
  if (raw === undefined) return fallback;
  const v = raw.toLowerCase();
  if (v === 'asc' || v === 'desc') return v;
  throw new Error(`--order must be "asc" or "desc" (got "${raw}")`);
}
