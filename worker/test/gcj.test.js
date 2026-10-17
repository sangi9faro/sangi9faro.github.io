import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wgsToGcj, gcjToWgs, metres } from '../src/gcj.js';

test('GCJ-02 → WGS-84 round trip is within 1 m (成都 天府广场, 春熙路, 北京)', () => {
  for (const p of [[30.65747, 104.06569], [30.65427, 104.07926], [39.90872, 116.39748]]) {
    const g = wgsToGcj(...p), back = gcjToWgs(...g);
    assert.ok(metres(p, back) < 1, `${p} → ${back}`);
    assert.ok(metres(p, g) > 100, 'mainland points really are shifted (otherwise the test proves nothing)');
  }
});
test('outside the box nothing changes (伦敦, 悉尼); the box also covers 首尔 / 胡志明, so only 高德 results are converted', () => {
  assert.deepEqual(gcjToWgs(51.5074, -0.1278), [51.5074, -0.1278]);
  assert.deepEqual(gcjToWgs(-33.8688, 151.2093), [-33.8688, 151.2093]);
});
