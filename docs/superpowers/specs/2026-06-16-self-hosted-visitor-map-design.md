# Self-hosted visitor map — design

- **Date:** 2026-06-16
- **Status:** approved (design); pending implementation plan
- **Repo:** `haokaiding.github.io` (static GitHub Pages site, served at `haokaiding.qzz.io`)
- **Owner:** Haokai Ding

## Motivation

The footer visitor map was ClustrMaps, which rebranded to MapMyVisitors and
**decommissioned `clustrmaps.com` (DNS SERVFAIL)** — the old `1c87l` map died and
its accumulated history is unrecoverable (the old `d=` token returns "Incorrect
map code" on the new backend). A stopgap migration to a fresh MapMyVisitors
account (`1c5ic`) restored the widget, but it has the same fundamental flaw: the
data lives on a third party that can rebrand, shut down, or wipe it again, with
no export.

**Goal:** replace the third-party widget with a self-owned visitor map where the
data lives in a database we control, so it is retained indefinitely and can never
be taken away by a vendor. Keep the same on-page experience (a world map of
visitor dots in the footer) plus a private dashboard for the country/city
breakdown — equivalent to the MapMyVisitors dashboard, but ours.

## Non-goals (YAGNI)

- No unique-visitor identification via cookies, fingerprinting, or IP. Pageviews
  (session-deduped) only.
- No full analytics suite (referrers, funnels, events). Just geographic visit data.
- No geo precision beyond city level.
- No real-time streaming/websockets. The public map and dashboard read aggregated
  snapshots.

## Architecture overview

```
Visitor loads haokaiding.qzz.io
  ├─ beacon:  POST  visitors.haokaiding.qzz.io/hit
  │             (fired once per browser session; sessionStorage guard; no cookie)
  │             └─ Worker reads request.cf (country, city, lat, lon),
  │                drops bots by User-Agent (inspected, not stored),
  │                INSERTs one row into D1
  └─ render:  GET   visitors.haokaiding.qzz.io/points
                (Worker returns aggregated JSON, edge-cached ~5 min)
                └─ homepage projects points onto an inline equirectangular
                   world-map SVG and draws dots

Owner (private):  GET visitors.haokaiding.qzz.io/stats   (HTTP Basic Auth)
                  └─ console-styled dashboard: totals, top countries,
                     top cities, daily trend, recent visits
```

A dedicated Cloudflare Worker is bound to the custom domain
`visitors.haokaiding.qzz.io` (same `qzz.io` zone; wrangler provisions the proxied
DNS record and an edge certificate for the exact hostname). The homepage and the
Worker are different origins, so the Worker sets CORS to allow only
`https://haokaiding.qzz.io`, `https://haokaiding.github.io`, and `http://localhost:*`
(dev).

## Components

### 1. Cloudflare Worker (`worker/`)

Single Worker, routed by path:

- `POST /hit` → record a visit, respond `204`. Logic:
  - Read `request.cf.country`, `request.cf.city`, `request.cf.latitude`, `request.cf.longitude`.
  - Drop the request (still return 204) if the User-Agent matches a bot regex or is empty.
  - Round lat/lon to ~0.1° before storing (city-cluster + extra fuzzing).
  - `INSERT INTO hits (ts, country, city, lat, lon) VALUES (?, ?, ?, ?, ?)`.
- `GET /points` → aggregated JSON for the public map:
  ```json
  { "since": "2026-06", "totalViews": 1284, "cities": 92, "countries": 41,
    "points": [ { "lat": 22.5, "lon": 113.9, "city": "Shenzhen", "country": "CN", "n": 300 } ] }
  ```
  Grouped by rounded lat/lon. Cached via the Cache API (~5 min) to bound D1 reads.
- `GET /stats` → owner dashboard (see §4). HTTP Basic Auth.
- CORS preflight (`OPTIONS`) handled for `/hit` and `/points`.

### 2. D1 database

One table — keep it flat (YAGNI; add rollups only if query latency ever demands it):

```sql
CREATE TABLE hits (
  id      INTEGER PRIMARY KEY,
  ts      INTEGER NOT NULL,   -- unix epoch seconds (UTC)
  country TEXT,               -- ISO-3166 alpha-2, e.g. 'CN'
  city    TEXT,
  lat     REAL,               -- rounded to ~0.1
  lon     REAL
);
CREATE INDEX idx_hits_ts ON hits(ts);
```

Never auto-purged — indefinite retention is the entire point. D1 free tier is 5 GB
and 5 M rows read/day; a personal site will not approach either.

### 3. Frontend (homepage)

Replaces the MapMyVisitors slot in `index.html` footer.

- **Beacon:** on load, if `sessionStorage` has no `vm_hit` flag, `fetch(HIT_URL, {method:'POST', keepalive:true})` and set the flag. One pageview per browser session; reloads don't double-count. No cookie.
- **Render:** fetch `/points`, then plot each point onto an **inline static
  equirectangular (Plate Carrée) world-map SVG** embedded in the page. Projection
  is linear: `x = (lon + 180) / 360 * W`, `y = (90 - lat) / 180 * H`. Dot radius
  scales with `n` (cube-root, capped). Dots and land use existing CSS variables so
  the map follows the site's light/dark theme.
- **Headline:** `N pageviews · M cities · since 2026-06`, plus a smaller
  `last 30 days: K`.
- **Graceful degradation:** if `/points` fails, show the existing fallback text;
  the site is otherwise unaffected.

The world-map SVG is a real public-domain equirectangular map (e.g. Natural
Earth / Wikimedia "BlankMap-World" in Plate Carrée), inlined so the static site
takes **no runtime dependency** (no D3 at runtime — D3 was only used for the
design mockup). Implementation must confirm the chosen SVG's viewBox maps
linearly to lon/lat so dots align with the linear projection above.

### 4. Owner dashboard (`/stats`)

Console-styled HTML page served by the Worker, behind **HTTP Basic Auth**
(password stored via `wrangler secret put`, never in code or repo). Shows:

- Totals: total pageviews, distinct cities, distinct countries, span since first hit.
- **Top countries** table (country, views).
- **Top cities** table (city, country, views) — the country/city breakdown the
  owner asked for.
- Daily trend (last ~90 days) as a small inline bar/sparkline.
- Recent visits (last ~50): timestamp + city + country.

All derived from `GROUP BY` / `ORDER BY` queries over `hits`.

## Privacy

- No IP stored. No cookies. No User-Agent stored (UA is inspected at the edge for
  bot filtering, then discarded).
- Only coarse city-level geo (rounded) + timestamp persist. No personal data →
  GDPR-friendly, cleaner than ClustrMaps/MapMyVisitors.

## Deployment (after one-time `wrangler login` by the owner)

1. `npx wrangler d1 create visitor-map` → record the database id into `wrangler.jsonc`.
2. `npx wrangler d1 execute visitor-map --file=worker/schema.sql` (remote) to create the table + index.
3. `npx wrangler secret put ADMIN_PASS` (and `ADMIN_USER` if desired) for `/stats`.
4. `npx wrangler deploy` with the D1 binding.
5. Bind custom domain `visitors.haokaiding.qzz.io` to the Worker (wrangler creates
   the proxied DNS record + cert; allow a few minutes for cert issuance on this
   3rd-level subdomain — `*.qzz.io` does not cover it, but Worker custom domains
   provision a per-hostname cert).

## Repo layout

```
worker/
  wrangler.jsonc      # Worker config + D1 binding + custom domain route
  src/worker.js       # /hit, /points, /stats, CORS, bot filter
  schema.sql          # hits table + index
index.html            # footer slot swapped to self-hosted map + inline world SVG
scripts.js            # beacon + /points fetch + dot projection/render
tests/                # updated (see Testing)
```

## Transition & rollback

- Build the new map **alongside** the current MapMyVisitors widget. Do not remove
  MapMyVisitors until: `visitors.haokaiding.qzz.io/points` returns data AND the
  inline SVG renders correctly in local preview.
- Then swap the footer slot to the self-hosted map and remove the MapMyVisitors
  script + links. Update the three test suites accordingly.
- **Rollback:** if the Worker is unavailable, the homepage map fetch fails
  gracefully (fallback text). Reverting the footer to MapMyVisitors is a small,
  isolated diff if ever needed.

## Testing

- **Worker:** local `wrangler dev` + curl `/hit` (assert a row is inserted) and
  `/points` (assert JSON shape and aggregation). `/stats` returns 401 without
  auth, 200 with.
- **Projection unit test:** node test asserting `lon/lat → x/y` for known points
  (e.g. (0,0) → center; equator/prime-meridian alignment) and that render
  degrades on fetch error.
- **Existing suites:** `tests/asset-paths`, `tests/secondary-pages`,
  `tests/site-content` stay green. The site-content assertions that currently
  check for the MapMyVisitors embed are updated to assert the self-hosted map
  markup + the `visitors.haokaiding.qzz.io` endpoints, and that the MapMyVisitors
  script is gone.

## Cost

Free indefinitely. Cloudflare Workers free tier = 100k requests/day; D1 free tier
= 5 GB storage + generous daily read/write. A personal homepage is orders of
magnitude under both.

## Decisions log

- Data granularity: **city-level, no IP** (chosen).
- Deployment auth: **`wrangler login` (OAuth)** driven locally (chosen).
- Subdomain: **`visitors.haokaiding.qzz.io`** (chosen).
- Counting: **session-deduped pageviews** (no unique-visitor identification).
- Storage: **D1 (SQLite)** over KV/R2 — needed for `GROUP BY` aggregation.
- Map render: **inline static equirectangular SVG + vanilla projection** over a
  runtime mapping library — keeps the static site dependency-free.
- Accent color: **teal** for dots (echoes the live/online semantics; trivially changeable).
- Added during design: **`/stats` owner dashboard** (Basic Auth) for the
  country/city breakdown.
```
