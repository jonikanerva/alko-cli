/**
 * Runtime configuration loaded from environment variables.
 */
export const config = {
  alkoBaseUrl: process.env.ALKO_BASE_URL || 'https://www.alko.fi',
  scrapeRateLimitMs: parseInt(process.env.SCRAPE_RATE_LIMIT_MS || '2000', 10),
  updateStalenessMs: parseInt(process.env.ALKO_UPDATE_STALENESS_MS || `${24 * 60 * 60 * 1000}`, 10),
} as const;
