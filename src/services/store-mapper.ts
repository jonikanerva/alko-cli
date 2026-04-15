import type { AlkoApiStore } from './scraper.js';
import type { Store } from '../types/index.js';

const ALKO_TIMEZONE = 'Europe/Helsinki';

/**
 * Project the raw Alko store API shape into the CLI's canonical `Store`
 * entity, returning `null` when required fields (id, name) are missing.
 *
 * `openingHoursToday` / `openingHoursTomorrow` are picked from the
 * store's own `openHours` array by matching against today's and
 * tomorrow's date **in Europe/Helsinki** — that is what Alko's API
 * uses. Matching against UTC (which Node's `toISOString()` gives)
 * would misalign the comparison around Finnish midnight and silently
 * push today's hours into the "tomorrow" column.
 *
 * The API does not expose phone / email, so those default to `null`.
 *
 * Pure: no I/O, no logging. Safe to call on untrusted payloads.
 */
export function mapAlkoApiStore(raw: AlkoApiStore, today: Date = new Date()): Store | null {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;

  const lat = toFiniteNumber(raw.latitude);
  const lng = toFiniteNumber(raw.longitude);
  const coordinates = lat !== null && lng !== null ? { lat, lng } : null;

  const todayIso = toHelsinkiIsoDate(today);
  const tomorrowIso = addDaysToIsoDate(todayIso, 1);

  const openHours = Array.isArray(raw.openHours) ? raw.openHours : [];
  const openingHoursToday = openHours.find((h) => h?.date === todayIso)?.hours ?? null;
  const openingHoursTomorrow = openHours.find((h) => h?.date === tomorrowIso)?.hours ?? null;

  return {
    id: raw.id.trim(),
    name,
    city: cleanString(raw.city) ?? '',
    address: cleanString(raw.address) ?? '',
    postalCode: cleanString(raw.postalCode) ?? '',
    coordinates,
    storeLink: `/myymalat-palvelut/${raw.id.trim()}`,
    phone: null,
    email: null,
    openingHoursToday,
    openingHoursTomorrow,
    updatedAt: today.toISOString(),
  };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Format `d` as `yyyy-mm-dd` in the Europe/Helsinki civil calendar.
 * Uses `en-CA` (whose default numeric date format is ISO-8601) paired
 * with an explicit `timeZone` so the conversion does not depend on the
 * JS host's local locale or DST state.
 */
function toHelsinkiIsoDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: ALKO_TIMEZONE });
}

/**
 * Add `n` calendar days to a `yyyy-mm-dd` string, returning the result
 * in the same format. Performed in UTC because the input already
 * represents a calendar date (not an instant) — no DST ambiguity.
 */
function addDaysToIsoDate(isoDate: string, n: number): string {
  const [y, m, day] = isoDate.split('-').map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, day + n));
  return dt.toISOString().slice(0, 10);
}
