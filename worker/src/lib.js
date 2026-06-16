export function isBot(ua) {
  if (!ua) return true;
  return /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview|pinterest|w3c_validator|headlesschrome|lighthouse|gptbot|ccbot|claudebot|python-requests|curl|wget|go-http-client|node-fetch|axios|httpclient/i.test(ua);
}

export function roundCoord(n, step = 0.1) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const inv = 1 / step;
  return Math.round(n * inv) / inv;
}

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

const ALLOWED_ORIGINS = ['https://haokaiding.qzz.io', 'https://haokaiding.github.io'];

export function isAllowedOrigin(origin) {
  return Boolean(origin && (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)));
}

export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
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

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function rows(items, cells) {
  return items.map(it => '<tr>' + cells(it).map(c => `<td>${c}</td>`).join('') + '</tr>').join('');
}

export function statsHtml(data) {
  const since = data.since ? isoMonth(data.since) : '—';
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
<h1>visitor log — ${esc(since)} →</h1>
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
