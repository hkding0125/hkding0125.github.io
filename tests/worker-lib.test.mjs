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
