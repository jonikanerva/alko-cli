import type { AlkoApiStore } from './scraper.js';
import type { Store } from '../types/index.js';

/**
 * Project the raw Alko store API shape into the CLI's canonical `Store`
 * entity, returning `null` when required fields (id, name) are missing.
 *
 * `openingHoursToday` / `openingHoursTomorrow` are picked from the
 * store's own `openHours` array by date, so the CLI displays the right
 * hours regardless of the server's locale. The API does not expose
 * phone / email, so those default to `null`.
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

  const todayIso = toIsoDate(today);
  const tomorrowIso = toIsoDate(addDays(today, 1));

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

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
