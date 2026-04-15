import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { RateLimiter, ExponentialBackoff } from '../utils/rate-limiter.js';
import type { StoreAvailability, ProductAvailabilityResult } from '../types/availability.js';

/**
 * Enriched product data scraped from a product's public page.
 * Populated by {@link AlkoScraper.scrapeProductDetails}; any field can be
 * null/empty when the page layout doesn't expose that datum.
 */
export interface EnrichedProductData {
  tasteProfile: string | null;
  usageTips: string | null;
  servingSuggestion: string | null;
  foodPairings: string[];
  certificates: string[];
  ingredients: string | null;
  smokiness: number | null;
  smokinessLabel: string | null;
}

/**
 * Response item from Alko's availability API:
 * GET /api/product-api/availability/{productId}
 *
 * The field names mirror the JSON shape the endpoint returns; not every
 * field is consumed by the CLI (e.g. lat/lng), but we keep them so the
 * type matches the wire format exactly.
 */
export interface AvailabilityApiResponse {
  id: string; // store id (e.g. "2224")
  count: number; // exact stock quantity
  storeName: string;
  outletType: string;
  address: string;
  latitude: number;
  longitude: number;
  openHours: Array<{ hours: string; date: string }>;
  city: string;
  postalCode: string;
  open: boolean;
}

/**
 * Classify a stock count into a coarse status bucket. Matches the
 * conventions used by the Alko MCP server's scraper for consistency.
 */
function classifyStock(count: number): StoreAvailability['status'] {
  if (count <= 0) return 'out_of_stock';
  if (count <= 5) return 'low_stock';
  return 'in_stock';
}

/**
 * Convert the raw availability API payload into the CLI's
 * StoreAvailability entities. Only stores with stock are returned.
 *
 * Exported so unit tests can validate the mapping without spinning up
 * Playwright.
 */
export function parseAvailabilityApiResponse(
  apiData: AvailabilityApiResponse[]
): StoreAvailability[] {
  if (!Array.isArray(apiData)) return [];
  return apiData
    .filter((item) => item && item.count > 0)
    .map((item) => ({
      storeId: item.id,
      storeName: item.storeName,
      address: item.address ?? '',
      city: item.city ?? '',
      postalCode: item.postalCode ?? '',
      quantity: item.count,
      status: classifyStock(item.count),
      open: Boolean(item.open),
    }));
}

/**
 * Playwright-backed scraper for real-time store availability. Handles
 * Alko.fi's Incapsula bot protection by launching a stealthed Chromium,
 * visiting the homepage to collect cookies, and then calling the
 * availability JSON API from inside the page context.
 *
 * A single instance is meant to serve one or a handful of requests
 * during a CLI invocation — call {@link close} when done.
 */
export class AlkoScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private sessionEstablished = false;
  private readonly rateLimiter: RateLimiter;
  private readonly backoff: ExponentialBackoff;

  constructor() {
    this.rateLimiter = new RateLimiter(config.scrapeRateLimitMs);
    this.backoff = new ExponentialBackoff();
  }

  /**
   * Launch Chromium with anti-detection flags. Idempotent.
   */
  async init(): Promise<void> {
    if (this.browser) return;

    logger.info('Initializing Playwright browser');

    this.browser = await chromium.launch({
      headless: true,
      args: [
        // Anti-detection
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        // Safer container defaults (also fine on macOS)
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        // Performance / footprint
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'fi-FI',
      timezoneId: 'Europe/Helsinki',
    });

    this.page = await this.context.newPage();

    // Hide automation fingerprints that Incapsula looks for.
    await this.page.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      window.chrome = { runtime: {} };
    `);

    logger.info('Browser initialized');
  }

  /**
   * Navigate to alko.fi to collect session cookies and dismiss the
   * OneTrust cookie banner if present. Safe to call repeatedly.
   */
  async establishSession(): Promise<void> {
    if (!this.page) await this.init();
    if (this.sessionEstablished) return;

    logger.info('Establishing session with alko.fi');

    try {
      await this.page!.goto('https://www.alko.fi/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // Give Incapsula's challenge a moment to run.
      await this.page!.waitForTimeout(3000);

      try {
        const cookieButton = await this.page!.$(
          '#onetrust-accept-btn-handler, button:has-text("Hyväksy kaikki"), button[id*="cookie"], button[class*="cookie"]'
        );
        if (cookieButton) {
          logger.debug('Dismissing cookie consent');
          await cookieButton.click();
          await this.page!.waitForTimeout(1000);
        }
      } catch {
        // Banner may not be shown; safe to ignore.
      }

      this.sessionEstablished = true;
      this.backoff.reset();
      logger.info('Session established');
    } catch (err) {
      logger.error('Failed to establish session', { err: String(err) });
      throw err;
    }
  }

  /**
   * Fetch real-time store availability for a product via Alko's JSON API.
   * The API is called from within the page context so session cookies and
   * Incapsula tokens are applied automatically.
   */
  async getProductAvailability(productId: string): Promise<ProductAvailabilityResult> {
    if (!this.sessionEstablished) {
      await this.init();
      await this.establishSession();
    }

    await this.rateLimiter.throttleWithJitter();
    logger.info('Fetching availability', { productId });

    try {
      const apiData = (await this.page!.evaluate(`
        (async () => {
          const resp = await fetch('/api/product-api/availability/${productId}');
          if (!resp.ok) throw new Error('API returned ' + resp.status);
          return resp.json();
        })()
      `)) as AvailabilityApiResponse[];

      const stores = parseAvailabilityApiResponse(apiData);
      this.backoff.reset();

      logger.info('Availability fetched', {
        productId,
        stores: stores.length,
        units: stores.reduce((acc, s) => acc + s.quantity, 0),
      });

      return {
        productId,
        checkedAt: new Date().toISOString(),
        stores,
      };
    } catch (err) {
      logger.error('Availability fetch failed', { productId, err: String(err) });
      await this.backoff.wait();

      // After repeated failures, drop the session so the next call
      // re-establishes it from scratch.
      if ((this.backoff as unknown as { attempt: number }).attempt > 3) {
        this.sessionEstablished = false;
      }
      throw err;
    }
  }

  /**
   * Scrape enriched product data from a product's public page on alko.fi.
   * The site renders taste/serving information into plain body text with
   * well-known section headings, so we parse the innerText rather than
   * fighting with dynamic React class names.
   *
   * Returns null on scrape failure so callers can degrade gracefully.
   */
  async scrapeProductDetails(productId: string): Promise<EnrichedProductData | null> {
    if (!this.sessionEstablished) {
      await this.init();
      await this.establishSession();
    }

    await this.rateLimiter.throttleWithJitter();
    logger.info('Scraping product details', { productId });

    try {
      await this.page!.goto(`https://www.alko.fi/tuotteet/${productId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await this.page!.waitForTimeout(2000);

      const enriched = (await this.page!.evaluate(`
        (() => {
          const result = {
            tasteProfile: null,
            usageTips: null,
            servingSuggestion: null,
            foodPairings: [],
            certificates: [],
            ingredients: null,
            smokiness: null,
            smokinessLabel: null,
          };

          const bodyText = document.body.innerText || '';

          // Taste profile is the short descriptor line beneath the product
          // name. Heuristic: look for one of the colour/body lead-in words.
          const tasteMatch = bodyText.match(/^[^\\n]*?((?:Punainen|Valkoinen|Rosee|Kullanvärinen|Meripihkan|Kirkas|Tumma|Vaalea|Vaaleanruskea|Täyteläinen|Keskitäyteläinen|Kevyt|Kuiva|Makea|Puolimakea)[^\\n]{10,200})/m);
          if (tasteMatch) result.tasteProfile = tasteMatch[1].trim();

          const vinkkiMatch = bodyText.match(/KÄYTTÖVINKIT\\s*([^]*?)(?=TARJOILU|Tuotteen mahdollisesti|$)/i);
          if (vinkkiMatch) result.usageTips = vinkkiMatch[1].trim().substring(0, 500);

          const tarjoiluMatch = bodyText.match(/TARJOILU\\s*([^]*?)(?=Tuotteen mahdollisesti|Alko Oy|$)/i);
          if (tarjoiluMatch) result.servingSuggestion = tarjoiluMatch[1].trim().substring(0, 500);

          const ingredientsMatch = bodyText.match(/TUOTTAJAN ILMOITTAMAT AINESOSAT\\n([^]*?)(?=\\n[A-ZÄÖÅÜ][A-ZÄÖÅÜ\\/\\s]{2,}\\n|$)/);
          if (ingredientsMatch) result.ingredients = ingredientsMatch[1].trim().substring(0, 1000);

          // Whiskey-specific smokiness widget: .smokiness-icon.smokey count
          const smokinessContainer = document.querySelector('.smokiness');
          if (smokinessContainer) {
            const labelEl = smokinessContainer.querySelector('.smokiness-label');
            if (labelEl) result.smokinessLabel = labelEl.textContent?.trim() || null;
            const smokeyIcons = smokinessContainer.querySelectorAll('.smokiness-icon.smokey');
            result.smokiness = smokeyIcons.length;
          }

          // Certificates have .ecological.certificate class
          const seenCerts = new Set();
          document.querySelectorAll('.ecological.certificate.link-tooltip[aria-label]').forEach((el) => {
            const aria = el.getAttribute('aria-label');
            if (aria && !seenCerts.has(aria)) {
              seenCerts.add(aria);
              result.certificates.push(aria);
            }
          });

          // Food pairings: pdp-symbol-link anchors without the certificate class
          const seenPairings = new Set();
          document.querySelectorAll('a.pdp-symbol-link[aria-label]:not(.ecological.certificate)').forEach((el) => {
            const aria = el.getAttribute('aria-label');
            if (aria && !seenPairings.has(aria)) {
              seenPairings.add(aria);
              result.foodPairings.push(aria);
            }
          });

          return result;
        })()
      `)) as EnrichedProductData;

      this.backoff.reset();
      logger.info('Product details scraped', {
        productId,
        hasTaste: !!enriched.tasteProfile,
        hasTips: !!enriched.usageTips,
        hasServing: !!enriched.servingSuggestion,
        hasIngredients: !!enriched.ingredients,
        pairings: enriched.foodPairings.length,
        certificates: enriched.certificates.length,
        smokiness: enriched.smokiness,
      });
      return enriched;
    } catch (err) {
      logger.error('Product details scrape failed', { productId, err: String(err) });
      await this.backoff.wait();
      if ((this.backoff as unknown as { attempt: number }).attempt > 3) {
        this.sessionEstablished = false;
      }
      return null;
    }
  }

  /**
   * Tear down the browser and reset internal state. Safe to call even if
   * {@link init} was never invoked.
   */
  async close(): Promise<void> {
    if (!this.browser) return;
    try {
      await this.browser.close();
    } finally {
      this.browser = null;
      this.context = null;
      this.page = null;
      this.sessionEstablished = false;
    }
    logger.info('Browser closed');
  }

  isInitialized(): boolean {
    return this.browser !== null;
  }
}

// -------------------------------------------------------------------
// Singleton + process-level cleanup
// -------------------------------------------------------------------

let scraperInstance: AlkoScraper | null = null;

/**
 * Shared scraper instance for the current CLI invocation. We intentionally
 * keep a singleton so multiple consumers (e.g. `availability` now, and
 * `show --enrich` later in Vaihe 6) can reuse the same browser.
 */
export function getAlkoScraper(): AlkoScraper {
  if (!scraperInstance) scraperInstance = new AlkoScraper();
  return scraperInstance;
}

let cleanupRegistered = false;

/**
 * Install process-level guards that close the Playwright browser if the
 * CLI exits unexpectedly. Idempotent — safe to call from multiple commands.
 *
 * The primary close path is the `finally` block in each command's action.
 * These handlers catch the "forgot to close" case (uncaught rejection,
 * SIGINT from Ctrl+C, SIGTERM from a process manager).
 */
export function registerBrowserCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const closeIfNeeded = async (): Promise<void> => {
    if (scraperInstance?.isInitialized()) {
      try {
        await scraperInstance.close();
      } catch (err) {
        logger.warn('browser close on exit failed', { err: String(err) });
      }
    }
  };

  process.on('beforeExit', () => {
    // A pending Playwright pipe keeps the loop alive; by the time
    // beforeExit fires we expect the command's finally to have closed
    // the browser already. This is defense-in-depth.
    void closeIfNeeded();
  });

  const onSignal = (exitCode: number) => {
    void closeIfNeeded().finally(() => process.exit(exitCode));
  };
  process.on('SIGINT', () => onSignal(130));
  process.on('SIGTERM', () => onSignal(143));
}
