# alko-cli

Command-line tool for querying the Alko.fi alcohol product catalog from a
local SQLite mirror. Companion to the `alko-mcp` Model Context Protocol
server — same upstream data, different surface.

## Features

- **Local SQLite catalog** (~11 000 products) synced from Alko.fi's
  internal product JSON API via Playwright — no network required for
  searches once the catalog is seeded.
- **Full-text search** via SQLite FTS5 (unicode-normalised) with relevance
  scoring for name / producer / description matches.
- **Real-time store availability** via Playwright-driven scraping of
  alko.fi (bypasses the site's Incapsula bot protection).
- **Human-friendly or JSON output**, autodetected from `isTTY` so pipes
  and scripts get machine-readable data for free.

## Requirements

- **Node.js 24+** (uses the experimental built-in `node:sqlite` module).
- **Playwright** browsers — install on first use with
  `npx playwright install chromium`.

## Install

```bash
git clone <repo>
cd alko-cli
npm install
npm run build
# Optionally expose the binary globally:
npm link
```

Once linked, `alko --help` works from anywhere. Otherwise run it as
`node dist/cli.js …`.

## Quick start

```bash
# Seed the local catalog (fetches alko.fi's full product list, ~11k products)
alko update

# Browse what you have
alko status
alko list --country Ranska --max-price 20
alko show 000001

# Fetch live stock for a product
alko availability 000001 --city Helsinki
```

## Commands

| Command                         | Purpose                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `alko update`                   | Refresh the product catalog from alko.fi's product JSON API (via Playwright).       |
| `alko list` (alias `search`)    | Filter and browse products from the local catalog.                                  |
| `alko show <productId>`         | Print a single product's details, optionally enriched from alko.fi.                 |
| `alko availability <productId>` | Check per-store stock in real time (scrapes alko.fi).                               |
| `alko stores`                   | List stores in the local catalog (optionally filter by city).                       |
| `alko status`                   | Show DB path, schema version, catalog size and last-sync info.                      |

All commands accept `--json` (force JSON) and `--table` (force human output).
When neither flag is set the format is auto-picked from `stdout.isTTY`
(table when attached to a terminal, JSON when piped).

### `alko update`

```bash
alko update                  # Fetch the full catalog from alko.fi
alko update --force          # Skip the 24 h "data is fresh" guard
alko update --limit 100      # Stop after N products (handy for smoke tests)
alko update --page-size 1000 # Products per API page (default 500, max 1000)
alko update --json           # Emit a machine-readable sync summary
```

Launches a headless Chromium, establishes a session with alko.fi, and
paginates through Alko's internal product search API
(`POST /api/search/product?lang=fi`). Catalog size is currently ~11 000
products; a full sync takes on the order of tens of seconds because the
scraper is rate-limited to respect the site.

### `alko list` / `alko search`

```bash
alko list --country Ranska --max-price 20
alko list --query "cabernet sauvignon" --type punaviinit
alko list --type oluet --beer-type ipa --min-alcohol 6
alko list --organic --country Italia --sort price
alko list --query "syrah" --limit 50 --json | jq '.products[].name'
```

Filter flags: `--query`, `--type`, `--country`, `--region`, `--min-price`,
`--max-price`, `--min-alcohol`, `--max-alcohol`, `--assortment`,
`--special-group`, `--beer-type`, `--min-smokiness`, `--max-smokiness`,
`--organic`, `--vegan`, `--new`. Sort with `--sort name|price|alcohol|pricePerLiter`
and `--order asc|desc`. Paginate with `--limit N --offset K`.

### `alko show`

```bash
alko show 000001
alko show 000001 --enrich        # Also scrape taste/pairings/certificates
alko show 000001 --json | jq '.producer'
```

`--enrich` scrapes the product page for taste profile, serving tips,
food pairings, certificates and (for whiskies) smokiness, then persists
them to the local catalog so future lookups are free.

### `alko availability`

```bash
alko availability 000001
alko availability 000001 --city Helsinki
alko availability 000001 --json | jq '.stores[].storeName'
```

Launches a headless Chromium, establishes a session with alko.fi, and
queries the real-time availability JSON API. Returns stores with stock
sorted by quantity. Exits 1 if the product ID is invalid.

### `alko stores`

```bash
alko stores --city Helsinki
alko stores --limit 200 --json
```

### `alko status`

```bash
alko status
alko status --json
```

## Configuration

Environment variables:

| Variable                   | Purpose                                                         | Default                                                                                             |
| -------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `ALKO_DB_PATH`             | Override the SQLite file location (great for tests).            | `$XDG_DATA_HOME/alko-cli/alko.db` or `~/.config/alko-cli/alko.db`                                  |
| `XDG_DATA_HOME`            | Base directory for the catalog.                                 | `~/.config`                                                                                         |
| `ALKO_BASE_URL`            | Base URL used by the scraper.                                   | `https://www.alko.fi`                                                                               |
| `ALKO_UPDATE_STALENESS_MS` | How old `last_sync` can be before `alko update` actually runs.  | 24 h                                                                                                |
| `SCRAPE_RATE_LIMIT_MS`     | Minimum interval between scraper requests.                      | 2000                                                                                                |
| `LOG_LEVEL`                | `debug` \| `info` \| `warn` \| `error`.                         | `info`                                                                                              |

## Data layout

```
$XDG_DATA_HOME/alko-cli/alko.db      # SQLite database (WAL journal)
$XDG_DATA_HOME/alko-cli/alko.db-wal  # Write-ahead log, managed by SQLite
```

## Development

```bash
npm install
npm run dev            # tsx watch mode
npm run build          # tsc -> dist/
npm run typecheck
npm run lint
npm run test:run       # Vitest unit + CLI end-to-end
```

## License

MIT.
