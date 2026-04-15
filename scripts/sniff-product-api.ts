/**
 * Diagnostic tool for Alko's internal product JSON API.
 *
 * Alko does not publish a documented product-listing API, but the frontend
 * for https://www.alko.fi/tuotteet/tuotelistaus calls
 *
 *   POST https://www.alko.fi/api/search/product?lang=fi
 *   Content-Type: application/json
 *   body: {"top": N, "skip": M}
 *
 * and receives an Azure Cognitive Search style envelope:
 *
 *   {
 *     "@odata.count": 11417,
 *     "@search.facets": { ... },
 *     "value": [ { id, name, price, abv, volume, countryName, ... }, ... ],
 *     "ranges": [ ... ]
 *   }
 *
 * Empirically verified behaviour (2026-04-15, alko.fi logged in as guest):
 *   - `top` returns exactly that many products (confirmed at 100, 500, 1000).
 *   - `skip` offsets into the result set — `{top:500, skip:10000}` returns
 *     the tail 500.
 *   - Works through Incapsula as long as the browser session is established
 *     first (GET https://www.alko.fi/ → cookies → POST /api/search/product).
 *   - `@odata.count` is the total catalog size.
 *
 * Product object keys observed (union across a 500-product probe):
 *   id, abv, beerStyleId, beerStyleName, beerSubstyleId, certificateClass,
 *   certificateId, closureId, closures, country, countryName, foodSymbolId,
 *   grapes, limeStock, limeWebshopTotalStock, mainGroupId, mainGroupName,
 *   mainGroups, name, onlineAvailability, onlineAvailabilityDatetimeTs,
 *   packageSizeId, packageSizes, packageTypes, price, productCommunication*,
 *   productGroupId, productGroupName, seasonalProductId, selectionTypeId,
 *   selectionTypes, statusId, storeId, taste, tasteStyle*, volume,
 *   webshopStock
 *
 * Notably absent vs. the old Excel price list:
 *   producer, EAN, region (string), vintage (as a field), acids, sugar,
 *   energy, originalGravity, colorEBC, bitternessEBU.
 *   → Product mapper leaves these as empty/null.
 *
 * Run:
 *   source ~/.nvm/nvm.sh && nvm use
 *   npx tsx scripts/sniff-product-api.ts 2>&1 | less
 *
 * Re-run if you suspect the endpoint shape has changed — this is the audit
 * trail for how `AlkoScraper.listProducts()` knows which URL to call and
 * what payload shape to expect.
 */
import { chromium } from 'playwright';

async function main(): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'fi-FI',
    timezoneId: 'Europe/Helsinki',
  });
  const page = await context.newPage();
  await page.addInitScript(`
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  `);

  console.error('-> Establishing session on alko.fi home');
  await page.goto('https://www.alko.fi/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  async function probe(body: Record<string, unknown>): Promise<void> {
    const result = (await page.evaluate(`
      (async () => {
        const r = await fetch('/api/search/product?lang=fi', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: ${JSON.stringify(JSON.stringify(body))},
        });
        const txt = await r.text();
        return { status: r.status, body: txt };
      })()
    `)) as { status: number; body: string };

    console.error(`\n-- POST ${JSON.stringify(body)} -> ${result.status}, ${result.body.length}B`);
    try {
      const j = JSON.parse(result.body) as {
        '@odata.count'?: number;
        value?: unknown[];
      };
      console.error(`   count=${j['@odata.count']}, value.length=${j.value?.length}`);
    } catch {
      console.error(`   (non-JSON body preview: ${result.body.slice(0, 200)})`);
    }
  }

  await probe({ top: 100, skip: 0 });
  await probe({ top: 1000, skip: 0 });
  await probe({ top: 500, skip: 10000 });
  await probe({ top: 24, skip: 100 });

  await browser.close();
}

void main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
