# Self-hosted visitor map — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the third-party MapMyVisitors footer widget with a self-owned visitor map — a Cloudflare Worker records visits into a D1 database we control, the homepage renders the dots on an inline world-map SVG, and a password-protected dashboard shows the country/city breakdown.

**Architecture:** A dedicated Worker on `visitors.haokaiding.qzz.io` exposes `POST /hit` (record a visit from `request.cf` geo), `GET /points` (aggregated JSON, edge-cached), and `GET /stats` (Basic-Auth dashboard). Data lives in one flat D1 table, never purged. The static homepage inlines a real equirectangular world-map SVG (generated once from world-atlas via d3-geo, so the projection matches the page's linear projection exactly) and a small ES module plots dots and fires the beacon. No runtime JS dependencies on the site.

**Tech Stack:** Cloudflare Workers + D1 (SQLite), vanilla ES modules, `node:test`/`node:assert` (matching the repo's existing `tests/*.test.mjs`), d3-geo + topojson-client + world-atlas (dev-only, for the one-time map generation).

**Spec:** `docs/superpowers/specs/2026-06-16-self-hosted-visitor-map-design.md`

---

## File structure

```
worker/
  package.json              # { "private": true, "type": "module" } — makes .js ESM for node + wrangler
  wrangler.jsonc            # Worker config: name, main, D1 binding, custom-domain route
  schema.sql                # hits table + index
  src/
    lib.js                  # PURE functions (no I/O): isBot, roundCoord, buildPointsPayload,
                            #   isoMonth, corsHeaders, checkBasicAuth, esc, statsHtml
    worker.js               # fetch handler: routes -> lib + D1 (the only file touching I/O)
scripts/build-worldmap/
  package.json              # dev-only devDeps: d3-geo, topojson-client, world-atlas
  build.mjs                 # generates assets/images/world-equirect.svg (run once)
assets/
  images/world-equirect.svg # generated equirectangular land silhouette, viewBox 0 0 1000 500
  js/visitor-map.js         # ES module: project, dotRadius, beacon + render (browser); pure fns exported for tests
tests/
  worker-lib.test.mjs       # unit tests for worker/src/lib.js
  visitor-map.test.mjs      # unit tests for assets/js/visitor-map.js pure fns
  site-content.test.mjs     # MODIFY: assert self-hosted map markup + endpoint, MapMyVisitors gone
index.html                  # MODIFY footer: inline world SVG + headline + module tag; remove MMV slot
scripts.js                  # MODIFY: delete setupVisitorMapFallback (superseded by the module)
styles.css                  # MODIFY: visitor-map theme vars (land/dot colors) for light + dark
```

Responsibility split: `lib.js` is pure and fully unit-tested; `worker.js` is the only place with D1/`request.cf` I/O (smoke-tested via `wrangler dev`). The browser module keeps DOM code behind a `typeof document` guard so its pure functions import cleanly into node tests.

---

## Task 1: Worker scaffold

**Files:**
- Create: `worker/package.json`
- Create: `worker/wrangler.jsonc`
- Create: `worker/schema.sql`

- [ ] **Step 1: Create `worker/package.json`**

```json
{ "private": true, "type": "module" }
```

- [ ] **Step 2: Create `worker/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS hits (
  id      INTEGER PRIMARY KEY,
  ts      INTEGER NOT NULL,
  country TEXT,
  city    TEXT,
  lat     REAL,
  lon     REAL
);
CREATE INDEX IF NOT EXISTS idx_hits_ts ON hits(ts);
```

- [ ] **Step 3: Create `worker/wrangler.jsonc`**

The `database_id` is empty for now; Task 10 fills it from `wrangler d1 create` output.

```jsonc
{
  "$schema": "https://json.schemastore.org/wrangler.json",
  "name": "haokaiding-visitors",
  "main": "src/worker.js",
  "compatibility_date": "2026-06-01",
  "d1_databases": [
    { "binding": "DB", "database_name": "visitor-map", "database_id": "" }
  ],
  "routes": [
    { "pattern": "visitors.haokaiding.qzz.io", "custom_domain": true }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add worker/package.json worker/wrangler.jsonc worker/schema.sql
git commit -m "Scaffold visitor-map Worker (config, schema)"
```

---

## Task 2: lib — isBot + roundCoord

**Files:**
- Create: `worker/src/lib.js`
- Test: `tests/worker-lib.test.mjs`

- [ ] **Step 1: Write the failing test**

`tests/worker-lib.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBot, roundCoord } from '../worker/src/lib.js';

test('isBot flags crawlers and empty UA', () => {
  assert.equal(isBot(''), true);
  assert.equal(isBot(null), true);
  assert.equal(isBot('Googlebot/2.1 (+http://www.google.com/bot.html)'), true);
  assert.equal(isBot('curl/8.4.0'), true);
  assert.equal(isBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'), false);
});

test('roundCoord rounds to 0.1 and rejects non-finite', () => {
  assert.equal(roundCoord(22.547), 22.5);
  assert.equal(roundCoord(-0.1278), -0.1);
  assert.equal(roundCoord('x'), null);
  assert.equal(roundCoord(NaN), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/worker-lib.test.mjs`
Expected: FAIL — `Cannot find module '../worker/src/lib.js'`.

- [ ] **Step 3: Write minimal implementation**

`worker/src/lib.js`:

```js
export function isBot(ua) {
  if (!ua) return true;
  return /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview|pinterest|w3c_validator|headlesschrome|lighthouse|gptbot|ccbot|claudebot|python-requests|curl|wget|go-http-client|node-fetch|axios|httpclient/i.test(ua);
}

export function roundCoord(n, step = 0.1) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const inv = 1 / step;
  return Math.round(n * inv) / inv;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/worker-lib.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/lib.js tests/worker-lib.test.mjs
git commit -m "Add isBot + roundCoord with tests"
```

---

## Task 3: lib — buildPointsPayload + isoMonth

**Files:**
- Modify: `worker/src/lib.js`
- Modify: `tests/worker-lib.test.mjs`

- [ ] **Step 1: Add the failing test** (append to `tests/worker-lib.test.mjs`)

```js
import { buildPointsPayload, isoMonth } from '../worker/src/lib.js';

test('isoMonth formats a unix-seconds timestamp as YYYY-MM (UTC)', () => {
  assert.equal(isoMonth(Date.UTC(2026, 5, 16) / 1000), '2026-06');
});

test('buildPointsPayload sums views, counts cities/countries, shapes points', () => {
  const rows = [
    { country: 'CN', city: 'Shenzhen', lat: 22.5, lon: 113.9, n: 300 },
    { country: 'US', city: 'Boston', lat: 42.4, lon: -71.1, n: 140 },
    { country: 'CN', city: 'Shanghai', lat: 31.2, lon: 121.5, n: 120 },
  ];
  const p = buildPointsPayload(rows, Date.UTC(2026, 5, 1) / 1000);
  assert.equal(p.totalViews, 560);
  assert.equal(p.cities, 3);
  assert.equal(p.countries, 2);
  assert.equal(p.since, '2026-06');
  assert.deepEqual(p.points[0], { lat: 22.5, lon: 113.9, city: 'Shenzhen', country: 'CN', n: 300 });
});

test('buildPointsPayload handles empty input', () => {
  const p = buildPointsPayload([], null);
  assert.equal(p.totalViews, 0);
  assert.equal(p.cities, 0);
  assert.equal(p.since, null);
  assert.deepEqual(p.points, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/worker-lib.test.mjs`
Expected: FAIL — `buildPointsPayload is not a function`.

- [ ] **Step 3: Implement** (append to `worker/src/lib.js`)

```js
export function isoMonth(tsSeconds) {
  const d = new Date(tsSeconds * 1000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

export function buildPointsPayload(rows, firstTsSeconds) {
  let total = 0;
  const countries = new Set();
  for (const r of rows) {
    total += r.n;
    if (r.country) countries.add(r.country);
  }
  return {
    since: firstTsSeconds ? isoMonth(firstTsSeconds) : null,
    totalViews: total,
    cities: rows.length,
    countries: countries.size,
    points: rows.map(r => ({ lat: r.lat, lon: r.lon, city: r.city, country: r.country, n: r.n })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/worker-lib.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/lib.js tests/worker-lib.test.mjs
git commit -m "Add buildPointsPayload + isoMonth with tests"
```

---

## Task 4: lib — corsHeaders + checkBasicAuth

**Files:**
- Modify: `worker/src/lib.js`
- Modify: `tests/worker-lib.test.mjs`

- [ ] **Step 1: Add the failing test**

```js
import { corsHeaders, checkBasicAuth } from '../worker/src/lib.js';

test('corsHeaders echoes allowed origins, falls back otherwise', () => {
  assert.equal(corsHeaders('https://haokaiding.qzz.io')['Access-Control-Allow-Origin'], 'https://haokaiding.qzz.io');
  assert.equal(corsHeaders('http://localhost:4567')['Access-Control-Allow-Origin'], 'http://localhost:4567');
  assert.equal(corsHeaders('https://evil.example')['Access-Control-Allow-Origin'], 'https://haokaiding.qzz.io');
  assert.equal(corsHeaders(null)['Access-Control-Allow-Origin'], 'https://haokaiding.qzz.io');
});

test('checkBasicAuth validates the Basic header', () => {
  const header = 'Basic ' + Buffer.from('admin:s3cret').toString('base64');
  assert.equal(checkBasicAuth(header, 'admin', 's3cret'), true);
  assert.equal(checkBasicAuth(header, 'admin', 'wrong'), false);
  assert.equal(checkBasicAuth('Basic not-base64!!', 'admin', 's3cret'), false);
  assert.equal(checkBasicAuth(null, 'admin', 's3cret'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/worker-lib.test.mjs`
Expected: FAIL — `corsHeaders is not a function`.

- [ ] **Step 3: Implement** (append to `worker/src/lib.js`)

```js
const ALLOWED_ORIGINS = ['https://haokaiding.qzz.io', 'https://haokaiding.github.io'];

export function corsHeaders(origin) {
  const ok = origin && (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export function checkBasicAuth(header, user, pass) {
  if (!header || !header.startsWith('Basic ')) return false;
  let decoded;
  try { decoded = atob(header.slice(6)); } catch { return false; }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  return decoded.slice(0, i) === user && decoded.slice(i + 1) === pass;
}
```

Note: `atob` is a global in both Cloudflare Workers and node ≥ 16.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/worker-lib.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/lib.js tests/worker-lib.test.mjs
git commit -m "Add corsHeaders + checkBasicAuth with tests"
```

---

## Task 5: lib — esc + statsHtml

**Files:**
- Modify: `worker/src/lib.js`
- Modify: `tests/worker-lib.test.mjs`

- [ ] **Step 1: Add the failing test**

```js
import { esc, statsHtml } from '../worker/src/lib.js';

test('esc escapes HTML metacharacters', () => {
  assert.equal(esc('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');
  assert.equal(esc(null), '');
});

test('statsHtml renders totals, country/city rows, and escapes values', () => {
  const html = statsHtml({
    totalViews: 560, countries: 2, cities: 3, since: 1748736000,
    topCountries: [{ country: 'CN', n: 420 }, { country: 'US', n: 140 }],
    topCities: [{ city: '<x>', country: 'CN', n: 300 }],
    daily: [{ day: '2026-06-16', n: 12 }],
    recent: [{ ts: 1750000000, city: 'Boston', country: 'US' }],
  });
  assert.match(html, /560/);
  assert.match(html, /CN/);
  assert.match(html, /Boston/);
  assert.match(html, /&lt;x&gt;/);
  assert.doesNotMatch(html, /<x>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/worker-lib.test.mjs`
Expected: FAIL — `esc is not a function`.

- [ ] **Step 3: Implement** (append to `worker/src/lib.js`)

```js
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function rows(items, cells) {
  return items.map(it => '<tr>' + cells(it).map(c => `<td>${c}</td>`).join('') + '</tr>').join('');
}

export function statsHtml(data) {
  const maxDay = Math.max(1, ...data.daily.map(d => d.n));
  const bars = data.daily.map(d =>
    `<span title="${esc(d.day)}: ${d.n}" style="height:${Math.round(d.n / maxDay * 40)}px"></span>`
  ).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>visitor stats</title><style>
body{background:#0e1117;color:#c9d4e0;font:14px/1.6 ui-monospace,Menlo,monospace;margin:0;padding:24px;}
h1{font-size:15px;color:#e6edf3;font-weight:500;margin:0 0 16px;}
.totals{display:flex;gap:24px;margin-bottom:24px;flex-wrap:wrap;}
.totals b{display:block;color:#2dd4bf;font-size:22px;}
h2{font-size:13px;color:#8b97a8;font-weight:500;margin:24px 0 8px;}
table{border-collapse:collapse;width:100%;max-width:520px;}
td{padding:3px 10px 3px 0;border-bottom:0.5px solid #1d2530;}
.spark{display:flex;align-items:flex-end;gap:2px;height:42px;}
.spark span{width:3px;background:#2dd4bf;opacity:.8;display:inline-block;}
</style></head><body>
<h1>visitor log — ${esc(isoMonth(data.since))} →</h1>
<div class="totals">
  <span><b>${data.totalViews}</b>pageviews</span>
  <span><b>${data.cities}</b>cities</span>
  <span><b>${data.countries}</b>countries</span>
</div>
<h2>daily (last 90d)</h2><div class="spark">${bars}</div>
<h2>top countries</h2><table>${rows(data.topCountries, c => [esc(c.country), c.n])}</table>
<h2>top cities</h2><table>${rows(data.topCities, c => [esc(c.city), esc(c.country), c.n])}</table>
<h2>recent</h2><table>${rows(data.recent, r => [new Date(r.ts * 1000).toISOString().slice(0, 16).replace('T', ' '), esc(r.city), esc(r.country)])}</table>
</body></html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/worker-lib.test.mjs`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/lib.js tests/worker-lib.test.mjs
git commit -m "Add esc + statsHtml dashboard renderer with tests"
```

---

## Task 6: Worker fetch handler

**Files:**
- Create: `worker/src/worker.js`

The handler does I/O (D1, `request.cf`) so it is verified by a local `wrangler dev` smoke test rather than a unit test; all branching logic it relies on is already unit-tested in `lib.js`.

- [ ] **Step 1: Write `worker/src/worker.js`**

```js
import { isBot, roundCoord, buildPointsPayload, corsHeaders, checkBasicAuth, statsHtml } from './lib.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/hit' && request.method === 'POST') {
      const ua = request.headers.get('User-Agent');
      if (!isBot(ua)) {
        const cf = request.cf || {};
        const lat = roundCoord(cf.latitude != null ? parseFloat(cf.latitude) : NaN);
        const lon = roundCoord(cf.longitude != null ? parseFloat(cf.longitude) : NaN);
        await env.DB.prepare('INSERT INTO hits (ts, country, city, lat, lon) VALUES (?, ?, ?, ?, ?)')
          .bind(Math.floor(Date.now() / 1000), cf.country || null, cf.city || null, lat, lon)
          .run();
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/points' && request.method === 'GET') {
      const cache = caches.default;
      const cacheKey = new Request(url.toString());
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
      const grouped = await env.DB.prepare(
        'SELECT country, city, lat, lon, COUNT(*) AS n FROM hits WHERE lat IS NOT NULL AND lon IS NOT NULL GROUP BY lat, lon ORDER BY n DESC'
      ).all();
      const first = await env.DB.prepare('SELECT MIN(ts) AS first FROM hits').first();
      const payload = buildPointsPayload(grouped.results || [], first ? first.first : null);
      const resp = new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...corsHeaders(origin) },
      });
      await cache.put(cacheKey, resp.clone());
      return resp;
    }

    if (url.pathname === '/stats' && request.method === 'GET') {
      if (!checkBasicAuth(request.headers.get('Authorization'), env.ADMIN_USER || 'admin', env.ADMIN_PASS)) {
        return new Response('Auth required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="visitors"' } });
      }
      const totals = await env.DB.prepare('SELECT COUNT(*) AS total, COUNT(DISTINCT country) AS countries, MIN(ts) AS first FROM hits').first();
      const cityRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM (SELECT 1 FROM hits GROUP BY lat, lon)').first();
      const topCountries = (await env.DB.prepare('SELECT country, COUNT(*) AS n FROM hits GROUP BY country ORDER BY n DESC LIMIT 20').all()).results || [];
      const topCities = (await env.DB.prepare('SELECT city, country, COUNT(*) AS n FROM hits GROUP BY city, country ORDER BY n DESC LIMIT 20').all()).results || [];
      const daily = (await env.DB.prepare("SELECT date(ts,'unixepoch') AS day, COUNT(*) AS n FROM hits GROUP BY day ORDER BY day DESC LIMIT 90").all()).results || [];
      const recent = (await env.DB.prepare('SELECT ts, city, country FROM hits ORDER BY ts DESC LIMIT 50').all()).results || [];
      const data = {
        totalViews: totals.total, countries: totals.countries, cities: cityRow.c, since: totals.first,
        topCountries, topCities, daily: daily.slice().reverse(), recent,
      };
      return new Response(statsHtml(data), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return new Response('Not found', { status: 404 });
  },
};
```

- [ ] **Step 2: Smoke-test locally with a local D1**

```bash
cd worker
npx --yes wrangler@3 d1 execute visitor-map --local --file=schema.sql
npx --yes wrangler@3 dev --local --port 8787 &
sleep 4
curl -s -X POST -H 'User-Agent: Mozilla/5.0 Chrome/124' http://127.0.0.1:8787/hit -o /dev/null -w 'hit:%{http_code}\n'
curl -s http://127.0.0.1:8787/points
curl -s -o /dev/null -w 'stats-noauth:%{http_code}\n' http://127.0.0.1:8787/stats
kill %1
cd ..
```

Expected: `hit:204`; `/points` returns JSON with `"totalViews":1` and one point (the local `request.cf` may have null geo in dev — `totalViews:1` with an empty `points` array is acceptable here, the geo path is verified in Task 11 against the live edge); `stats-noauth:401`.

- [ ] **Step 3: Commit**

```bash
git add worker/src/worker.js
git commit -m "Add visitor-map Worker fetch handler (/hit, /points, /stats)"
```

---

## Task 7: Generate the static equirectangular world SVG

Generated with `geoEquirectangular().fitSize([1000,500],{type:'Sphere'})`, which maps lon[-180,180]→x[0,1000] and lat[90,-90]→y[0,500] — identical to the page's linear `project()` in Task 8, so dots align exactly.

**Files:**
- Create: `scripts/build-worldmap/package.json`
- Create: `scripts/build-worldmap/build.mjs`
- Create (generated): `assets/images/world-equirect.svg`

- [ ] **Step 1: Create `scripts/build-worldmap/package.json`**

```json
{
  "private": true,
  "type": "module",
  "devDependencies": {
    "d3-geo": "^3.1.1",
    "topojson-client": "^3.1.0",
    "world-atlas": "^2.0.2"
  }
}
```

- [ ] **Step 2: Create `scripts/build-worldmap/build.mjs`**

```js
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-110m.json');

const W = 1000, H = 500;
const projection = geoEquirectangular().fitSize([W, H], { type: 'Sphere' });
const path = geoPath(projection);
const land = feature(world, world.objects.countries);
const d = land.features.map(f => path(f)).filter(Boolean).join(' ');

const svg = `<svg id="vmWorld" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="World map of site visitors" preserveAspectRatio="xMidYMid meet">
<path class="vm-land" d="${d}"/>
<g id="visitor-dots"></g>
</svg>`;

writeFileSync(new URL('../../assets/images/world-equirect.svg', import.meta.url), svg);
console.log('wrote assets/images/world-equirect.svg (' + svg.length + ' bytes)');
```

- [ ] **Step 3: Install dev deps and run the generator**

```bash
cd scripts/build-worldmap && npm install && node build.mjs && cd ../..
test -s assets/images/world-equirect.svg && echo "svg generated"
```

Expected: prints `wrote assets/images/world-equirect.svg (...)` and `svg generated`.

- [ ] **Step 4: Sanity-check the SVG opens and has the dots group**

```bash
grep -c 'id="visitor-dots"' assets/images/world-equirect.svg
head -c 120 assets/images/world-equirect.svg
```

Expected: `1`, and the head shows the `<svg id="vmWorld" ... viewBox="0 0 1000 500"`.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-worldmap/package.json scripts/build-worldmap/build.mjs assets/images/world-equirect.svg
git commit -m "Generate static equirectangular world-map SVG for the visitor map"
```

---

## Task 8: Frontend map module — pure functions

**Files:**
- Create: `assets/js/visitor-map.js`
- Test: `tests/visitor-map.test.mjs`

- [ ] **Step 1: Write the failing test**

`tests/visitor-map.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, dotRadius } from '../assets/js/visitor-map.js';

test('project maps lon/lat linearly onto the 1000x500 viewBox', () => {
  assert.deepEqual(project(0, 0, 1000, 500), [500, 250]);
  assert.deepEqual(project(-180, 90, 1000, 500), [0, 0]);
  assert.deepEqual(project(180, -90, 1000, 500), [1000, 500]);
  const [x, y] = project(113.9, 22.5, 1000, 500);
  assert.ok(Math.abs(x - 816.4) < 0.5 && Math.abs(y - 187.5) < 0.5);
});

test('dotRadius grows with n but stays within bounds', () => {
  assert.ok(dotRadius(1) >= 2.6);
  assert.ok(dotRadius(100000) <= 11);
  assert.ok(dotRadius(300) > dotRadius(30));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/visitor-map.test.mjs`
Expected: FAIL — `Cannot find module '../assets/js/visitor-map.js'`.

- [ ] **Step 3: Write the module** (`assets/js/visitor-map.js`)

```js
const ENDPOINT = 'https://visitors.haokaiding.qzz.io';
const VIEW_W = 1000, VIEW_H = 500;

export function project(lon, lat, w, h) {
  return [(lon + 180) / 360 * w, (90 - lat) / 180 * h];
}

export function dotRadius(n, max = 11, min = 2.6) {
  return Math.min(max, Math.max(min, Math.cbrt(n) * 1.55));
}

export function renderDots(doc, points) {
  const g = doc.getElementById('visitor-dots');
  if (!g) return;
  while (g.firstChild) g.removeChild(g.firstChild);
  const NS = 'http://www.w3.org/2000/svg';
  for (const p of points) {
    const [x, y] = project(p.lon, p.lat, VIEW_W, VIEW_H);
    const c = doc.createElementNS(NS, 'circle');
    c.setAttribute('cx', x.toFixed(1));
    c.setAttribute('cy', y.toFixed(1));
    c.setAttribute('r', dotRadius(p.n).toFixed(1));
    c.setAttribute('class', 'vm-dot');
    const t = doc.createElementNS(NS, 'title');
    t.textContent = `${p.city || '?'}, ${p.country || '?'} — ${p.n}`;
    c.appendChild(t);
    g.appendChild(c);
  }
}

function setHeadline(doc, data) {
  const el = doc.getElementById('vmHeadline');
  if (el) el.textContent = `${data.totalViews} pageviews · ${data.cities} cities · since ${data.since || '—'}`;
}

async function loadPoints(doc) {
  try {
    const res = await fetch(ENDPOINT + '/points', { mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderDots(doc, data.points || []);
    setHeadline(doc, data);
    const fb = doc.getElementById('visitorMapFallback');
    if (fb) fb.dataset.state = 'loaded';
  } catch {
    const fb = doc.getElementById('visitorMapFallback');
    if (fb) fb.classList.add('show-help');
  }
}

function sendBeacon() {
  try {
    if (sessionStorage.getItem('vm_hit')) return;
    sessionStorage.setItem('vm_hit', '1');
  } catch { /* private mode: still beacon once */ }
  fetch(ENDPOINT + '/hit', { method: 'POST', keepalive: true, mode: 'cors' }).catch(() => {});
}

if (typeof document !== 'undefined') {
  const start = () => { sendBeacon(); loadPoints(document); };
  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/visitor-map.test.mjs`
Expected: PASS (2 tests). The `typeof document !== 'undefined'` guard prevents the browser bootstrap from running under node.

- [ ] **Step 5: Commit**

```bash
git add assets/js/visitor-map.js tests/visitor-map.test.mjs
git commit -m "Add visitor-map browser module (projection, dots, beacon) with tests"
```

---

## Task 9: Wire the map into the homepage

**Files:**
- Modify: `index.html` (footer visitor block, lines ~298-316 — the `<section class="visitor-record">`)
- Modify: `styles.css` (append visitor-map theme vars + rules)
- Modify: `scripts.js` (delete `setupVisitorMapFallback` and its call)
- Modify: `tests/site-content.test.mjs`

- [ ] **Step 1: Update the test first** (`tests/site-content.test.mjs`) — replace the MapMyVisitors assertions block with:

```js
assert.doesNotMatch(
  indexHtml,
  /mapmyvisitors|clustrmaps/i,
  'expected the third-party visitor-map widget to be fully removed',
);
assert.match(
  indexHtml,
  /id="visitor-dots"/,
  'expected the inline world-map SVG with a dots group to be present',
);
assert.match(
  indexHtml,
  /assets\/js\/visitor-map\.js/,
  'expected the self-hosted visitor-map module to be loaded',
);
```

Also remove the now-obsolete assertion that referenced `setupVisitorMapFallback` in `scripts.js`, if present.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/site-content.test.mjs`
Expected: FAIL — index.html still contains `mapmyvisitors` and lacks `id="visitor-dots"`.

- [ ] **Step 3: Replace the footer visitor block in `index.html`**

Replace the entire `<section class="visitor-record">…</section>` (the noscript + fallback + `mapmyvisitors-slot` div) with:

```html
      <section class="visitor-record" aria-labelledby="visitorLogLabel">
        <p id="visitorLogLabel" class="footer-label">visitor log</p>
        <p id="vmHeadline" class="vm-headline">loading visitor map…</p>
        <div class="visitor-map" id="visitorMap" aria-labelledby="visitorLogLabel">
          <div id="visitorMapFallback" class="visitor-map-fallback" role="status">
            <p class="fallback-help">Visitor map is loading… if it stays blank, the counter service may be unreachable.</p>
          </div>
          <!--WORLD_SVG-->
        </div>
      </section>
```

Then replace the `<!--WORLD_SVG-->` marker with the full contents of `assets/images/world-equirect.svg`:

```bash
python3 - <<'PY'
svg = open('assets/images/world-equirect.svg').read().strip()
html = open('index.html').read()
open('index.html','w').write(html.replace('<!--WORLD_SVG-->', svg))
print('inlined', len(svg), 'bytes of SVG')
PY
```

- [ ] **Step 4: Load the module in `index.html`**

Just before `</body>` (alongside the existing `scripts.js` tag), add:

```html
    <script type="module" src="assets/js/visitor-map.js"></script>
```

- [ ] **Step 5: Remove the dead fallback code from `scripts.js`**

Delete the entire `setupVisitorMapFallback` function definition and the line that calls it (search `setupVisitorMapFallback`). The new module owns the map now.

- [ ] **Step 6: Add theme rules to `styles.css`** (append)

```css
:root { --vm-land: #d7dde6; --vm-dot: #1d9e75; --vm-panel: #f4f6f9; }
body.dark-mode { --vm-land: #1b2433; --vm-dot: #2dd4bf; --vm-panel: #0e1117; }
.vm-headline { font-size: 0.78rem; color: var(--color-text-muted, #8b97a8); margin: 0 0 6px; font-family: var(--font-mono); }
#visitorMap { position: relative; background: var(--vm-panel); border-radius: 6px; padding: 8px; }
#vmWorld { width: 100%; height: auto; display: block; line-height: 0; }
.vm-land { fill: var(--vm-land); stroke: none; }
.vm-dot { fill: var(--vm-dot); fill-opacity: 0.9; }
.visitor-map-fallback { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; text-align: center; padding: 12px; }
.visitor-map-fallback.show-help { display: flex; }
```

Adjust `--color-text-muted` to whatever muted text variable the file already defines (grep `--color-text` in `styles.css`); do not invent a new variable if one exists.

- [ ] **Step 7: Run all suites + a quick local preview**

```bash
for f in tests/*.test.mjs; do node "$f" 2>&1 | tail -1; done
```

Expected: all suites pass (the `node --test` files print a tap summary; the legacy ones print their `… checks passed` line).

Then verify in the browser preview: start the `homepage` preview server, scroll to the footer, confirm the world map renders (land silhouette themed to the current mode). Dots will be absent until the Worker is deployed (Task 10/11) — that is expected at this step; the land map and "loading…/unreachable" fallback behavior are what to confirm here.

- [ ] **Step 8: Commit**

```bash
git add index.html styles.css scripts.js tests/site-content.test.mjs
git commit -m "Wire self-hosted visitor map into homepage; remove MapMyVisitors widget"
```

---

## Task 10: Deploy the Worker (requires the owner's one-time login)

**Files:** none (deploy actions); ends by editing `worker/wrangler.jsonc` with the real `database_id`.

- [ ] **Step 1: Owner logs in (interactive, one-time)**

```bash
npx --yes wrangler@3 login
```

Expected: browser opens, owner authorizes the `qzz.io` Cloudflare account; terminal prints `Successfully logged in.`

- [ ] **Step 2: Create the D1 database**

```bash
cd worker
npx --yes wrangler@3 d1 create visitor-map
```

Expected: prints a `database_id` (a UUID). Copy it into `worker/wrangler.jsonc` → `d1_databases[0].database_id`.

- [ ] **Step 3: Apply the schema to the remote D1**

```bash
npx --yes wrangler@3 d1 execute visitor-map --remote --file=schema.sql
```

Expected: `Executed 2 commands` (table + index), no error.

- [ ] **Step 4: Set the dashboard password (Worker secret)**

```bash
npx --yes wrangler@3 secret put ADMIN_PASS
```

Expected: prompt for a value; owner types a strong password; prints `Success!`. (Optional: also `wrangler secret put ADMIN_USER`; otherwise the username defaults to `admin`.)

- [ ] **Step 5: Deploy + bind the custom domain**

```bash
npx --yes wrangler@3 deploy
cd ..
```

Expected: deploy succeeds and reports the custom domain `visitors.haokaiding.qzz.io` being provisioned. The `routes` entry in `wrangler.jsonc` triggers Cloudflare to create the proxied DNS record + per-hostname certificate. Certificate issuance for this 3rd-level subdomain can take a few minutes.

- [ ] **Step 6: Smoke-test the live endpoints**

```bash
curl -s -o /dev/null -w 'hit:%{http_code}\n' -X POST -H 'User-Agent: Mozilla/5.0 Chrome/124' https://visitors.haokaiding.qzz.io/hit
sleep 2
curl -s https://visitors.haokaiding.qzz.io/points
curl -s -o /dev/null -w 'stats-noauth:%{http_code}\n' https://visitors.haokaiding.qzz.io/stats
```

Expected: `hit:204`; `/points` returns JSON and — because this hit came through the real edge — `totalViews` ≥ 1 with one point carrying a real `country`/`city`/`lat`/`lon`; `stats-noauth:401`. If `hit` returns a TLS/000 error, the cert is still issuing — wait and retry.

- [ ] **Step 7: Commit the database id**

```bash
git add worker/wrangler.jsonc
git commit -m "Wire deployed D1 database id into wrangler config"
```

---

## Task 11: Cutover verification

**Files:** possibly `assets/js/visitor-map.js` (only if the live smoke test in Task 10 failed and the endpoint constant needs a change — normally none).

- [ ] **Step 1: Confirm dots render against the live Worker**

Start the `homepage` preview server, scroll to the footer. The `/points` fetch now returns data, so dots should appear over the land map, and `#vmHeadline` should read `N pageviews · M cities · since YYYY-MM`. Confirm light and dark mode both look right (toggle the theme switcher).

- [ ] **Step 2: Confirm the dashboard auth + content**

```bash
curl -s -o /dev/null -w 'noauth:%{http_code}\n' https://visitors.haokaiding.qzz.io/stats
curl -s -u admin:<the-password-you-set> https://visitors.haokaiding.qzz.io/stats | grep -o 'pageviews\|top countries\|top cities' | sort -u
```

Expected: `noauth:401`; the authed call shows `pageviews`, `top countries`, `top cities`.

- [ ] **Step 3: Full test sweep**

```bash
for f in tests/*.test.mjs; do node "$f" 2>&1 | tail -1; done
```

Expected: every suite passes.

- [ ] **Step 4: Push and verify live**

```bash
git fetch origin && git status -sb | head -1
git push origin main
```

After the GitHub Pages rebuild (~1 min), verify the live site:

```bash
curl -sL https://haokaiding.qzz.io | grep -o 'id="visitor-dots"\|visitor-map.js' | sort -u
```

Expected: both markers present; the deployed footer shows the self-hosted map with live dots.

- [ ] **Step 5: Final commit (if any cleanup was needed)**

```bash
git add -A && git commit -m "Finalize self-hosted visitor map cutover" || echo "nothing to finalize"
```

---

## Self-review notes

- **Spec coverage:** `/hit` (T6), `/points` + edge cache (T6), `/stats` Basic-Auth dashboard with top countries/cities/daily/recent (T5+T6), D1 schema + indefinite retention (T1), city-level no-IP/no-cookie/no-UA + bot filter (T2/T6), session-deduped beacon (T8), inline equirectangular SVG matching a linear projection (T7/T8), light/dark theming (T9), transition keeping the site working + graceful fallback (T9 keeps the page intact; dots simply absent pre-deploy), custom-domain deploy with cert caveat (T10), tests incl. updated site-content (T9), cost note (no action). All covered.
- **Bot filter vs. own beacon:** the page beacon uses `fetch` (real browser UA), which is not matched by the bot regex — confirmed the regex targets crawler/library UAs only.
- **Type consistency:** `buildPointsPayload(rows, firstTsSeconds)`, `project(lon,lat,w,h)`, `dotRadius(n)`, viewBox `1000×500`, ids `vmWorld`/`visitor-dots`/`vmHeadline`/`visitorMapFallback`, D1 binding `DB`, secret `ADMIN_PASS`/`ADMIN_USER`, endpoint `https://visitors.haokaiding.qzz.io` — used identically across tasks.
- **Placeholder scan:** the only deferred value is `wrangler.jsonc.database_id`, which is intentionally produced by the documented `d1 create` command in Task 10, not a plan gap.
