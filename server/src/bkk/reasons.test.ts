import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyReason } from './reasons.ts';

test('késés okának felismerése a forgalmi hír szövegéből', () => {
  assert.equal(classifyReason('Műszaki hiba miatt a 4-6-os villamos késik').code, 'technical');
  assert.equal(classifyReason('Közúti baleset miatt terelve közlekedik').code, 'accident');
  assert.equal(classifyReason('Vágányfelújítás miatt pótlóbusz jár').code, 'construction');
  assert.equal(classifyReason('Demonstráció miatt lezárják az Andrássy utat').code, 'demonstration');
  assert.equal(classifyReason('Valami egészen más').code, 'other');
  assert.equal(classifyReason('bármi', 'WEATHER').code, 'weather');
});
