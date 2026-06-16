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
