import { WORLD_SVG } from './worldmap.js';

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

export function flag(cc) {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return '\u{1F3F3}\u{FE0F}';
  const up = cc.toUpperCase();
  return String.fromCodePoint(...[...up].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

export function regionName(cc) {
  if (!cc) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc.toUpperCase()) || cc;
  } catch {
    return cc;
  }
}

export function relTime(tsSeconds, nowMs = Date.now()) {
  const s = Math.max(0, Math.floor(nowMs / 1000) - tsSeconds);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

export function statsHtml(data) {
  const since = data.since ? isoMonth(data.since) : '—';
  const last30 = data.last30 != null ? data.last30 : 0;
  const now = Date.now();

  const cards = [['pageviews', data.totalViews], ['cities', data.cities], ['countries', data.countries], ['last 30 days', last30]]
    .map(([label, val]) => `<div class="card"><label>${label}</label><b>${val}</b></div>`).join('');

  const cMax = Math.max(1, ...data.topCountries.map(c => c.n));
  const topCountries = data.topCountries.map(c =>
    `<div class="row"><span class="flag">${flag(c.country)}</span><span class="name">${esc(regionName(c.country) || c.country)}</span><span class="bar"><i style="width:${Math.round(c.n / cMax * 100)}%"></i></span><span class="n">${c.n}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const topCities = data.topCities.map(c =>
    `<div class="row"><span class="flag">${flag(c.country)}</span><span class="name">${esc(c.city || '?')}<span class="cc">${esc(c.country || '')}</span></span><span class="n">${c.n}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const recent = data.recent.map(r =>
    `<div class="row"><span class="flag">${flag(r.country)}</span><span class="name">${esc(r.city || '?')}<span class="cc">${esc(r.country || '')}</span></span><span class="when">${relTime(r.ts, now)} ago</span></div>`
  ).join('') || '<p class="empty">no visits yet</p>';

  const maxDay = Math.max(1, ...data.daily.map(d => d.n));
  const bars = data.daily.map(d =>
    `<span class="dbar" title="${esc(d.day)}: ${d.n}"><i style="height:${Math.round(d.n / maxDay * 100)}%"></i></span>`
  ).join('') || '<p class="empty">no visits yet</p>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>visitor log · haokaiding.qzz.io</title><style>
:root{--bg:#f4f6f9;--surface:#fff;--line:#e6e9ef;--ink:#1f2733;--muted:#6b7685;--faint:#9aa4b2;--accent:#1d9e75;--land:#d7dde6}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;padding:24px}
.wrap{max-width:880px;margin:0 auto}
.head{display:flex;align-items:baseline;gap:10px;margin:0 0 18px;flex-wrap:wrap}
.head b{font-size:18px;font-weight:600}
.head .sub{font-size:13px;color:var(--muted)}
.head .live{margin-left:auto;font-size:12px;color:var(--accent);display:flex;align-items:center;gap:5px}
.head .live i{width:7px;height:7px;border-radius:50%;background:var(--accent);display:inline-block}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:18px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.card label{display:block;font-size:12px;color:var(--muted);margin-bottom:3px}
.card b{font-size:26px;font-weight:600;color:var(--accent)}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:8px;margin-bottom:18px;line-height:0}
.panel svg{width:100%;height:auto;display:block}
.vm-land{fill:var(--land)}
.vm-dot{fill:var(--accent);fill-opacity:.9}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-bottom:18px}
.sec{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.sec h2{font-size:13px;font-weight:600;color:var(--muted);margin:0 0 10px}
.row{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--line);font-size:14px}
.row:last-child{border-bottom:none}
.flag{font-size:18px;width:22px;flex:none;text-align:center}
.name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc{color:var(--faint);font-size:12px;margin-left:6px}
.bar{flex:1;height:7px;border-radius:4px;background:var(--bg)}
.bar i{display:block;height:100%;border-radius:4px;background:var(--accent)}
.n{flex:none;min-width:42px;text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}
.when{flex:none;color:var(--faint);font-size:12px;font-variant-numeric:tabular-nums}
.empty{color:var(--faint);font-size:13px;margin:4px 0}
.daily{display:flex;align-items:flex-end;gap:3px;height:90px}
.dbar{flex:1;display:flex;align-items:flex-end;height:100%}
.dbar i{width:100%;background:var(--accent);border-radius:2px 2px 0 0;min-height:2px}
.foot{color:var(--faint);font-size:12px;margin-top:18px;text-align:center}
</style></head><body><div class="wrap">
<div class="head"><b>visitor log</b><span class="sub">haokaiding.qzz.io · since ${esc(since)}</span><span class="live"><i></i>self-hosted</span></div>
<div class="cards">${cards}</div>
<div class="panel">${WORLD_SVG}</div>
<div class="grid">
  <div class="sec"><h2>top countries</h2>${topCountries}</div>
  <div class="sec"><h2>top cities</h2>${topCities}</div>
</div>
<div class="sec" style="margin-bottom:18px"><h2>recent visits</h2>${recent}</div>
<div class="sec"><h2>daily · last 90 days</h2><div class="daily">${bars}</div></div>
<p class="foot">self-hosted on Cloudflare · no cookies, no IP stored</p>
</div>
<script>
(function(){
  fetch('/points').then(function(r){return r.json();}).then(function(d){
    var g=document.getElementById('visitor-dots');
    if(!g||!d.points)return;
    var NS='http://www.w3.org/2000/svg';
    d.points.forEach(function(p){
      if(!isFinite(p.lon)||!isFinite(p.lat))return;
      var x=(p.lon+180)/360*1000, y=(90-p.lat)/180*500;
      var r=Math.min(11,Math.max(3,Math.cbrt(p.n)*1.6));
      var halo=document.createElementNS(NS,'circle');
      halo.setAttribute('cx',x.toFixed(1));halo.setAttribute('cy',y.toFixed(1));halo.setAttribute('r',(r*2.2).toFixed(1));halo.setAttribute('class','vm-dot');halo.setAttribute('fill-opacity','0.16');g.appendChild(halo);
      var c=document.createElementNS(NS,'circle');
      c.setAttribute('cx',x.toFixed(1));c.setAttribute('cy',y.toFixed(1));c.setAttribute('r',r.toFixed(1));c.setAttribute('class','vm-dot');
      var t=document.createElementNS(NS,'title');t.textContent=(p.city||'?')+', '+(p.country||'?')+' — '+p.n;c.appendChild(t);g.appendChild(c);
    });
  }).catch(function(){});
})();
</script>
</body></html>`;
}
