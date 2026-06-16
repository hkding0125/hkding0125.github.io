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
