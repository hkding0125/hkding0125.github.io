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

export function pctChange(cur, prev) {
  if (!prev) return null;            // prev 0/undefined → null (caller renders "new"/"—")
  return Math.round(((cur - prev) / prev) * 100);
}

export function buildPointsPayload(rows, firstTsSeconds, last30 = 0) {
  let total = 0;
  const countries = new Set();
  for (const r of rows) {
    total += r.n;
    if (r.country) countries.add(r.country);
  }
  return {
    since: firstTsSeconds ? isoMonth(firstTsSeconds) : null,
    totalViews: total,
    last30,
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

export function parseUA(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' };
  let browser = 'Other';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/samsungbrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua)) browser = 'Safari';
  let os = 'Other';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/cros/i.test(ua)) os = 'ChromeOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  return { browser, os };
}

export function refDomain(referer) {
  if (!referer) return null;
  try { return new URL(referer).hostname || null; } catch { return null; }
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
  const now = Date.now();
  const periods = data.periods || [];
  const topRegions = data.topRegions || [];
  const topBrowsers = data.topBrowsers || [];
  const topOS = data.topOS || [];
  const topReferrers = data.topReferrers || [];
  const trend = data.trend || { day: [], week: [], month: [] };
  const growth = data.growth || {};

  const cards = [['pageviews', data.totalViews], ['unique visitors', data.uniqueTotal], ['countries', data.countries], ['cities', data.cities]]
    .map(([label, val]) => `<div class="card"><label>${label}</label><b>${val != null ? val : 0}</b></div>`).join('');

  // Growth pill for a percent value (null → "new", >0 → up, <0 → down, 0 → flat).
  const gPill = (n) => n == null
    ? '<span class="g-flat">new</span>'
    : n > 0 ? `<span class="g-up">▲${n}%</span>`
    : n < 0 ? `<span class="g-down">▼${Math.abs(n)}%</span>`
    : '<span class="g-flat">0%</span>';
  const gRow = (label, g) => g
    ? `<span class="g-line"><span class="g-lbl">${label}:</span> views ${gPill(g.v)} · unique ${gPill(g.u)}</span>`
    : '';
  const growthHtml = `${gRow('last 7 days vs prior', growth.week)}${gRow('last 30 days vs prior', growth.month)}`;

  const summary = periods.map(p =>
    `<tr><th scope="row">${esc(p.label)}</th><td>${p.views}</td><td>${p.uniques}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="empty">no data yet</td></tr>';

  const cMax = Math.max(1, ...data.topCountries.map(c => c.n));
  const topCountries = data.topCountries.map(c =>
    `<div class="row"><span class="flag">${flag(c.country)}</span><span class="name">${esc(regionName(c.country) || c.country)}</span><span class="bar"><i style="width:${Math.round(c.n / cMax * 100)}%"></i></span><span class="n">${c.n}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const topRegionsHtml = topRegions.map(r =>
    `<div class="row"><span class="flag">${flag(r.country)}</span><span class="name">${esc(r.region || '?')}<span class="cc">${esc(r.country || '')}</span></span><span class="n">${r.n}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const topCities = data.topCities.map(c =>
    `<div class="row"><span class="flag">${flag(c.country)}</span><span class="name">${esc(c.city || '?')}<span class="cc">${esc(c.country || '')}</span></span><span class="n">${c.n}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const bMax = Math.max(1, ...topBrowsers.map(b => b.n));
  const topBrowsersHtml = topBrowsers.map(b =>
    `<div class="row"><span class="name">${esc(b.browser || '?')}</span><span class="bar"><i style="width:${Math.round(b.n / bMax * 100)}%"></i></span><span class="n">${b.n}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const oMax = Math.max(1, ...topOS.map(o => o.n));
  const topOSHtml = topOS.map(o =>
    `<div class="row"><span class="name">${esc(o.os || '?')}</span><span class="bar"><i style="width:${Math.round(o.n / oMax * 100)}%"></i></span><span class="n">${o.n}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const topReferrersHtml = topReferrers.map(r =>
    `<div class="row"><span class="name">${esc(r.referrer || '?')}</span><span class="n">${r.n}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const recent = data.recent.map(r => {
    const place = [r.city, r.region].filter(Boolean).map(esc).join(', ') || '?';
    const ua = [r.browser, r.os].filter(Boolean).map(esc).join(' · ');
    return `<div class="row"><span class="flag">${flag(r.country)}</span><span class="name">${place}<span class="cc">${esc(r.country || '')}</span></span>${ua ? `<span class="ua">${ua}</span>` : ''}<span class="when">${relTime(r.ts, now)} ago</span></div>`;
  }).join('') || '<p class="empty">no visits yet</p>';

  const trendJson = JSON.stringify(trend);

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
.summary{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:18px}
.summary h2{font-size:13px;font-weight:600;color:var(--muted);margin:0 0 10px}
.summary table{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}
.summary th,.summary td{text-align:right;padding:7px 0;border-bottom:1px solid var(--line)}
.summary tr:last-child th,.summary tr:last-child td{border-bottom:none}
.summary thead th{color:var(--muted);font-size:12px;font-weight:600}
.summary th[scope=row]{text-align:left;font-weight:500;color:var(--ink)}
.summary td.empty{text-align:center;color:var(--faint)}
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
.ua{flex:none;color:var(--faint);font-size:12px}
.bar{flex:1;height:7px;border-radius:4px;background:var(--bg)}
.bar i{display:block;height:100%;border-radius:4px;background:var(--accent)}
.n{flex:none;min-width:42px;text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}
.when{flex:none;color:var(--faint);font-size:12px;font-variant-numeric:tabular-nums}
.empty{color:var(--faint);font-size:13px;margin:4px 0}
.growth{display:flex;flex-wrap:wrap;gap:8px 18px;margin:-6px 0 18px;font-size:12px;color:var(--muted)}
.g-line{display:inline-flex;align-items:center;gap:5px}
.g-lbl{color:var(--faint)}
.g-up{color:var(--accent);font-weight:600}
.g-down{color:#c0392b;font-weight:600}
.g-flat{color:var(--faint)}
.trend-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.trend-head h2{margin:0}
.trend-toggle{display:flex;gap:6px}
.trend-toggle button{font:12px/1 inherit;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:7px;padding:5px 10px;cursor:pointer}
.trend-toggle button.on{background:var(--accent);border-color:var(--accent);color:#fff}
#trend-chart svg{width:100%;height:auto;display:block}
.trend-legend{display:flex;gap:16px;margin-top:8px;font-size:12px;color:var(--muted)}
.trend-legend i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.trend-legend .lg-v{background:#cfe8df}
.trend-legend .lg-u{background:var(--accent)}
.foot{color:var(--faint);font-size:12px;margin-top:18px;text-align:center}
</style></head><body><div class="wrap">
<div class="head"><b>visitor log</b><span class="sub">haokaiding.qzz.io · since ${esc(since)}</span><span class="live"><i></i>self-hosted</span></div>
<div class="cards">${cards}</div>
<div class="growth">${growthHtml}</div>
<div class="summary"><h2>visits summary</h2><table><thead><tr><th scope="col"></th><th scope="col">Pageviews</th><th scope="col">Unique visitors</th></tr></thead><tbody>${summary}</tbody></table></div>
<div class="panel">${WORLD_SVG}</div>
<div class="grid">
  <div class="sec"><h2>top countries</h2>${topCountries}</div>
  <div class="sec"><h2>top regions</h2>${topRegionsHtml}</div>
  <div class="sec"><h2>top cities</h2>${topCities}</div>
  <div class="sec"><h2>top browsers</h2>${topBrowsersHtml}</div>
  <div class="sec"><h2>top OS</h2>${topOSHtml}</div>
  <div class="sec"><h2>top referrers</h2>${topReferrersHtml}</div>
</div>
<div class="sec" style="margin-bottom:18px"><h2>recent visits</h2>${recent}</div>
<div class="sec"><div class="trend-head"><h2>trends</h2>
  <div class="trend-toggle"><button data-g="day" class="on">day</button><button data-g="week">week</button><button data-g="month">month</button></div></div>
  <div id="trend-chart"></div>
  <div class="trend-legend"><span><i class="lg-v"></i>pageviews</span><span><i class="lg-u"></i>unique visitors</span></div>
</div>
<p class="foot">self-hosted on Cloudflare</p>
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

  var TREND=${trendJson};
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function drawTrend(series){
    var el=document.getElementById('trend-chart');
    if(!el)return;
    if(!series.length){el.innerHTML='<p class="empty">no data yet</p>';return;}
    var W=840,H=200,padL=6,padR=6,padT=12,padB=20,n=series.length;
    var maxV=Math.max(1,...series.map(function(d){return d.v;})),iw=W-padL-padR,ih=H-padT-padB,bw=iw/n;
    var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="visits trend">';
    series.forEach(function(d,i){var bh=d.v/maxV*ih,x=padL+i*bw,y=padT+ih-bh;
      s+='<rect x="'+(x+bw*0.15).toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+Math.max(0.5,bw*0.7).toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="1" fill="#cfe8df"><title>'+esc(d.b)+': '+d.v+' views, '+d.u+' unique</title></rect>';});
    var pts=series.map(function(d,i){return (padL+i*bw+bw/2).toFixed(1)+','+(padT+ih-d.u/maxV*ih).toFixed(1);}).join(' ');
    s+='<polyline fill="none" stroke="#1d9e75" stroke-width="2" points="'+pts+'"/>';
    var labels=[0,Math.floor((n-1)/2),n-1].filter(function(v,i,a){return a.indexOf(v)===i;});
    labels.forEach(function(i){var anchor=i===0?'start':i===n-1?'end':'middle';var x=padL+i*bw+bw/2;
      s+='<text x="'+x.toFixed(1)+'" y="'+(H-6)+'" font-size="10" fill="#9aa4b2" text-anchor="'+anchor+'">'+esc(series[i].b)+'</text>';});
    s+='</svg>';
    el.innerHTML=s;
  }
  var btns=document.querySelectorAll('.trend-toggle button');
  function select(g){btns.forEach(function(b){b.classList.toggle('on',b.getAttribute('data-g')===g);});drawTrend(TREND[g]||[]);}
  btns.forEach(function(b){b.addEventListener('click',function(){select(b.getAttribute('data-g'));});});
  select('day');
})();
</script>
</body></html>`;
}
