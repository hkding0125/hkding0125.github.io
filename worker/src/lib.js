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
