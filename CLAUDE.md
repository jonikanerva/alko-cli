# Alko CLI

Command-line interface for the Alko.fi alcohol product catalog. Ports the
`alko-mcp` MCP server's data model to a local SQLite file so a human (or
script) can query the catalog directly without running the MCP server or
Firestore.

## Project structure

```
alko-cli/
├── src/
│   ├── cli.ts                   # Entry point — registers commander commands
│   ├── config.ts                # Env-driven config
│   ├── commands/
│   │   ├── update.ts            # alko update (sync via Playwright + JSON API)
│   │   ├── list.ts              # alko list / search (filtered catalog)
│   │   ├── show.ts              # alko show [--enrich]
│   │   ├── availability.ts      # alko availability (real-time stock)
│   │   ├── stores.ts            # alko stores (list from DB)
│   │   └── status.ts            # alko status (catalog metadata)
│   ├── services/
│   │   ├── product-sync.ts      # listProducts → mapAlkoApiProduct → upsert
│   │   ├── product-mapper.ts    # Pure mapper: AlkoApiProduct → Product
│   │   ├── store-sync.ts        # listStores → mapAlkoApiStore → upsert
│   │   ├── store-mapper.ts      # Pure mapper: AlkoApiStore → Store
│   │   └── scraper.ts           # Playwright scraper (listProducts + listStores + availability + enrich)
│   ├── db/
│   │   ├── schema.ts            # SQL DDL + FTS5 virtual table
│   │   └── sqlite.ts            # SqliteService (node:sqlite)
│   ├── types/                   # Shared type definitions
│   └── utils/
│       ├── formatter.ts         # Table / JSON output helpers (isTTY autodetect)
│       ├── logger.ts            # Stderr-only leveled logger
│       ├── paths.ts             # DB path resolution (XDG-aware, ALKO_DB_PATH)
│       └── rate-limiter.ts      # Scraper throttling + exponential backoff
├── scripts/
│   └── sniff-product-api.ts     # Diagnostic: re-sniff Alko's product API shape
├── tests/
│   ├── helpers/seed-db.ts       # Seed temp SQLite for integration tests
│   ├── unit/                    # Pure-function tests (formatter, scraper parser, mapper)
│   └── integration/             # End-to-end CLI spawn tests
├── dist/                        # Compiled JS (tsc output; not committed)
└── package.json
```

## Relationship to `alko-mcp`

This CLI is the single-user, offline-capable sibling of the MCP server at
`../alko-mcp`. They share domain concepts (products, stores, food
pairings) but diverge on storage:

| Concern         | `alko-mcp`                          | `alko-cli`                  |
| --------------- | ----------------------------------- | --------------------------- |
| Storage         | Google Firestore                    | Local SQLite (node:sqlite)  |
| Transport       | MCP stdio / HTTP                    | Process invocation          |
| Full-text       | Client-side scoring over 15 000 rows| SQLite FTS5 (unicode61)     |
| Deployment      | Cloud Run                           | `npm link`                  |

When porting a feature from the MCP server, expect to strip Firestore
imports (`@google-cloud/firestore`, `Timestamp`) and swap
`FirestoreService` calls for `SqliteService`.

## Language Policy

- All project artifacts in **English**: code, comments, commits, branch
  names, PR titles, variable names, error messages.
- User communication in **Finnish**.

## Code Standards

- **Strong TypeScript**: no `any`, no `unknown` as bypass. Every
  parameter and return value explicitly typed.
- **Functional programming**: pure functions preferred, side effects
  only at I/O boundaries (SQLite, HTTP, Playwright, file I/O).
- **DRY**: if logic is similar to existing code, refactor to reuse.
  Never copy-paste.
- **Single-purpose functions**: each function does one thing.
- **Naming**: descriptive, intention-revealing, English.
- **UTC everywhere**: all internal code, database storage, and logs use
  UTC timestamps. Timezone conversion happens only at the edge —
  inbound data converts to UTC immediately, outbound output converts at
  the last moment.

## Verification

Node.js is managed via nvm. Always activate first:
`source ~/.nvm/nvm.sh && nvm use`

Run before every commit and PR — all must pass, no exceptions:

```
npm run test:all
```

This runs: `typecheck → lint → test:run → build`.

Integration tests need `dist/cli.js` to exist; the suite auto-builds if
missing, but `npm run build` first speeds up the first run.

## Git Workflow

- Use `/implement <task>` for the full branch → implement → test → PR
  workflow.
- Every feature gets its own branch. Branch from `main`, PR back to
  `main`.
- **NEVER** commit or push directly to `main`.
- **NEVER** force push (`--force` or `--force-with-lease`).
- Commits must be complete logical units — one logical change per
  commit.
- Commit messages: concise, English, focus on "why" not "what".
- PRs are merged with **merge commit**
  (`gh pr merge --merge --delete-branch`), not squash. Always delete
  the branch after merge.
- **PR as audit trail**: the PR description must fully describe what is
  being changed and why. Every correction after a failed review must be
  a separate commit + push + PR comment explaining the fix. Design
  decisions, trade-offs, and compromises must be documented in PR
  comments — the PR is the permanent record.

## Dependencies

**NEVER** add a new dependency without research and explicit human
approval.

When proposing a dependency, provide:

- Name and purpose
- Bundle size impact
- Maintenance status (last release, open issues)
- Alternatives considered and why this one wins

## Safeguards

- **NEVER** read `.env` files (`.env`, `.env.*`, `.env.local`,
  `.env.production`).
- **NEVER** commit secrets, credentials, API keys, session cookies, or
  tokens.
- **NEVER** run `rm -rf` on project directories.
- **NEVER** delete `alko.db` (or the companion `-wal` / `-shm` files)
  without confirming with the user — it may contain a fresh sync the
  user has not yet re-pulled.
- **NEVER** merge a PR without all verification passing.

## Planning

Use Claude Code's built-in `/plan` mode for any non-trivial work.
Before implementation, research:

- Modern TypeScript patterns relevant to the change
- Existing project patterns that should be followed
- Architecture impact (especially: does the change cross the
  `commands → services → db` boundary cleanly?)

## Code Review

Use `/codereview` (or `/codereview NUMBER`) for the full review loop.
The skill handles: isolated subagent review → audit trail comment →
fix → re-review (max 3 iterations).

Review criteria (used by the review subagent):

- **Scope verification**: diff matches PR description; undocumented
  changes → FAIL
- **Code quality**: no `any` types, pure functions, DRY, explicit error
  handling
- **Security**: no secrets, parameterized SQL, input validation
- **Architecture**: separation of concerns, consistent patterns
  (commands stay thin, services hold logic, db layer is the only SQL
  site)
- **Commits**: one logical change per commit, clear messages
- **Language**: all artifacts in English
- **Tests**: new logic has tests, no broken tests

CI checks must be green before verdict can be PASS.

## Testing

- Every new feature or behavior change must have tests. No exceptions.
- Edge cases must be explicitly tested — not just the happy path.
- Existing tests must not be deleted or weakened without justification.
- **Unit tests** (`tests/unit/`) cover pure functions: the availability
  API parser and every formatter helper.
- **End-to-end tests** (`tests/integration/cli.test.ts`) spawn the built
  CLI against a temp SQLite that `tests/helpers/seed-db.ts` populates
  directly via `SqliteService`. They exercise `list`, `show`, `status`
  and the error paths without touching the network. The spawn approach
  sidesteps Vite's `node:sqlite` resolution issue.

## Implementation Discipline

- Minimal scoped fixes: change only what is necessary.
- No unrelated refactors during fixes — document them as follow-ups.

## Development commands

```bash
npm install
npm run dev                  # tsx watch mode (iterating on source)
npm run build                # tsc -> dist/
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint src
npm run test:run             # vitest run (unit + CLI end-to-end)
npm run test:all             # typecheck + lint + test:run + build
```

## Key implementation notes

1. **Node 24+ `node:sqlite` built-in.** The DB layer uses Node's native
   SQLite (experimental) rather than `better-sqlite3`. This avoids a
   native-build dependency, but means:
   - Vitest cannot easily resolve `node:sqlite` through Vite's module
     graph — the end-to-end tests therefore spawn the built CLI via
     `execFileSync` instead of importing `SqliteService` directly.
   - Node emits an `ExperimentalWarning` on startup. This is informational
     and not surfaced by default tests.

2. **FTS5 relevance scoring** lives in `SqliteService.searchProducts`. The
   WHERE clause uses `products_fts MATCH ?` and ORDER BY a computed
   `__bonus` (custom weights for name/producer/other-field matches) plus
   the FTS5 `rank` as tiebreaker. The `buildFtsQuery` helper quotes each
   token so punctuation and FTS5 operators in user input can't blow up
   the query.

3. **Table / JSON autodetect** via `formatter.detectFormat(opts)`. The
   rule is: explicit `--json` or `--table` wins; otherwise
   `process.stdout.isTTY` → table, else JSON. This makes `alko list |
   jq` just work.

4. **Scraper singleton.** `getAlkoScraper()` returns a single
   `AlkoScraper` for the process, and `registerBrowserCleanup()` installs
   `beforeExit`, `SIGINT` and `SIGTERM` handlers that close Playwright
   cleanly. Each command's `finally` block is still the primary close
   path; the signal handlers are defense-in-depth.

5. **Catalog sync uses Alko's internal search API.** `AlkoScraper.listProducts()`
   POSTs to `/api/search/product?lang=fi` from inside the Playwright page
   context (Incapsula tokens applied automatically). The endpoint is an
   Azure Cognitive Search style envelope (`@odata.count` + `value[]`) and
   accepts `{top, skip}` pagination. The old Excel price list (xlsx) is
   no longer published by Alko — see `scripts/sniff-product-api.ts` for
   the audit trail and to re-discover the endpoint if Alko changes it.

   `alko update` also syncs the store directory in the same Playwright
   session via `AlkoScraper.listStores()` (GET `/api/stores`, a single
   ~600 kB envelope — no pagination needed).

6. **Availability uses Alko's JSON API.** The scraper calls
   `/api/product-api/availability/{productId}` from inside the Playwright
   page context (so session cookies and Incapsula tokens are applied
   automatically). The old DOM-scraping path from alko-mcp is obsolete —
   we get exact stock counts instead of "6-10" ranges.

7. **Meta table** (`meta` in SQLite) stores `schema_version`, `last_sync`,
   `last_sync_source`, `last_sync_product_count`. `alko update` writes
   these; `alko status` reads them.

8. **Stderr-only logger.** `utils/logger.ts` writes to stderr so commands
   can safely pipe machine-readable JSON on stdout. Default level is
   `warn` so routine CLI runs stay quiet; `--debug` (wired in `cli.ts`
   via a `preAction` hook on the root command) flips it to `debug` for
   the current invocation. `LOG_LEVEL` env var still works for scripts.

9. **Suppressing node:sqlite's ExperimentalWarning.** The CLI shebang is
   `#!/usr/bin/env -S node --no-warnings=ExperimentalWarning` — Node 24's
   targeted `--no-warnings=<name>` silences the SQLite experimental notice
   without hiding genuine warnings.

## Gotchas

- **Deleting the DB mid-operation** leaves stale WAL files
  (`alko.db-wal`, `alko.db-shm`). Safe to delete alongside the main file.
- **Playwright's `waitForTimeout`** is intentionally used to wait for
  Incapsula's JS challenge to run; do not replace it with
  `waitForLoadState('networkidle')` — the page is deliberately noisy.
- **Alko's product API is undocumented.** The endpoint
  (`POST /api/search/product?lang=fi`) and its payload shape are reverse
  engineered from live traffic. If `alko update` starts returning empty
  or differently shaped data, re-run `scripts/sniff-product-api.ts` to
  rediscover the call shape and update `AlkoScraper.listProducts()` +
  `product-mapper.ts` accordingly.
- **Fields the API does not expose** (producer, EAN, region, vintage as
  a column, acids, sugar, energy, EBC, EBU) are stored as empty / null
  in the catalog. `alko show --enrich` can fill some of these from the
  product detail page when needed.
