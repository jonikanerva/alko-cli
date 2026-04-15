/**
 * Store opening hours for a single day
 */
export interface OpeningHours {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
}

/**
 * Store entity stored in SQLite.
 * `updatedAt` is an ISO 8601 string.
 */
export interface Store {
  id: string;
  name: string;
  city: string;
  address: string;
  postalCode: string;
  coordinates: {
    lat: number;
    lng: number;
  } | null;
  storeLink: string;
  phone: string | null;
  email: string | null;
  openingHoursToday: string | null;
  openingHoursTomorrow: string | null;
  updatedAt: string;
}

export interface StoreSearchFilters {
  city?: string;
  name?: string;
}

export interface StoreSearchOptions {
  limit?: number;
  offset?: number;
}
