import { isBot, roundCoord, buildPointsPayload, corsHeaders, isAllowedOrigin, statsHtml } from './lib.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/hit' && request.method === 'POST') {
      const ua = request.headers.get('User-Agent');
      if (isAllowedOrigin(origin) && !isBot(ua)) {
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
      let json;
      const cached = await cache.match(cacheKey);
      if (cached) {
        json = await cached.text();
      } else {
        const grouped = await env.DB.prepare(
          'SELECT country, city, lat, lon, COUNT(*) AS n FROM hits WHERE lat IS NOT NULL AND lon IS NOT NULL GROUP BY lat, lon ORDER BY n DESC'
        ).all();
        const first = await env.DB.prepare('SELECT MIN(ts) AS first FROM hits').first();
        const last30row = await env.DB.prepare('SELECT COUNT(*) AS n FROM hits WHERE ts >= ?').bind(Math.floor(Date.now() / 1000) - 30 * 86400).first();
        json = JSON.stringify(buildPointsPayload(grouped.results || [], first ? first.first : null, last30row ? last30row.n : 0));
        await cache.put(cacheKey, new Response(json, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
        }));
      }
      return new Response(json, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...corsHeaders(origin) },
      });
    }

    if (url.pathname === '/stats' && request.method === 'GET') {
      const cache = caches.default;
      const cacheKey = new Request(url.toString());
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      const totals = await env.DB.prepare('SELECT COUNT(*) AS total, COUNT(DISTINCT country) AS countries, MIN(ts) AS first FROM hits').first();
      const cityRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM (SELECT 1 FROM hits GROUP BY lat, lon)').first();
      const topCountries = (await env.DB.prepare('SELECT country, COUNT(*) AS n FROM hits GROUP BY country ORDER BY n DESC LIMIT 20').all()).results || [];
      const topCities = (await env.DB.prepare('SELECT city, country, COUNT(*) AS n FROM hits GROUP BY city, country ORDER BY n DESC LIMIT 20').all()).results || [];
      const daily = (await env.DB.prepare("SELECT date(ts,'unixepoch') AS day, COUNT(*) AS n FROM hits GROUP BY day ORDER BY day DESC LIMIT 90").all()).results || [];
      const recent = (await env.DB.prepare('SELECT ts, city, country FROM hits ORDER BY ts DESC LIMIT 50').all()).results || [];
      const last30 = await env.DB.prepare('SELECT COUNT(*) AS n FROM hits WHERE ts >= ?').bind(Math.floor(Date.now() / 1000) - 30 * 86400).first();
      const data = {
        totalViews: totals.total, countries: totals.countries, cities: cityRow.c, since: totals.first,
        last30: last30 ? last30.n : 0,
        topCountries, topCities, daily: daily.slice().reverse(), recent,
      };
      const resp = new Response(statsHtml(data), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
      await cache.put(cacheKey, resp.clone());
      return resp;
    }

    return new Response('Not found', { status: 404 });
  },
};
