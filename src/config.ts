/**
 * Runtime configuration loaded from environment variables.
 */
export const config = {
  alkoPriceListUrl:
    process.env.ALKO_PRICE_LIST_URL ||
    'https://www.alko.fi/INTERSHOP/static/WFS/Alko-OnlineShop-Site/-/Alko-OnlineShop/fi_FI/Alkon%20Hinnasto%20Tekstitiedostona/alkon-hinnasto-tekstitiedostona.xlsx',
  alkoBaseUrl: process.env.ALKO_BASE_URL || 'https://www.alko.fi',
  scrapeRateLimitMs: parseInt(process.env.SCRAPE_RATE_LIMIT_MS || '2000', 10),
  updateStalenessMs: parseInt(process.env.ALKO_UPDATE_STALENESS_MS || `${24 * 60 * 60 * 1000}`, 10),
} as const;
