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
