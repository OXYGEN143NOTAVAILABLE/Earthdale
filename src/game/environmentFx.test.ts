import test from 'node:test';
import assert from 'node:assert/strict';
import { ISLAND_DEFS } from './catalog';
import {
  computeAnchoredSunPosition,
  computeWaveDisplacement,
  computeWindState,
  createInteractorArray,
  MAX_FOLIAGE_INTERACTORS,
  packActorFoliageInteractors,
} from './environmentFx';
import { toWorldX, toWorldZ } from './lowPolyWorld';
import { createInitialWorld } from './simulation';

test('computeWindState produces normalized direction vectors and realistic weather/season scaling', () => {
  const mistSummer = computeWindState(12.5, 'mist', 'summer');
  const clearSpring = computeWindState(12.5, 'clear', 'spring');
  const rainAutumn = computeWindState(12.5, 'rain', 'autumn');
  const breezeWinter = computeWindState(12.5, 'breeze', 'winter');

  for (const sample of [mistSummer, clearSpring, rainAutumn, breezeWinter]) {
    const len = Math.hypot(sample.dirX, sample.dirZ);
    assert.ok(Math.abs(len - 1) < 1e-6, `Expected unit wind vector, got ${len}`);
    assert.ok(Number.isFinite(sample.gust) && sample.gust >= 0.25 && sample.gust <= 1.85);
    assert.ok(sample.cloudShadowFactor > 0.7 && sample.cloudShadowFactor <= 1.0);
  }

  assert.ok(rainAutumn.gust > clearSpring.gust, 'Rain/autumn wind should exceed calm clear spring');
  assert.ok(clearSpring.gust > mistSummer.gust, 'Mist should soften wind below clear weather');
  assert.ok(breezeWinter.waveHeight > mistSummer.waveHeight, 'Breeze waves should be taller than mist waves');
});

test('computeWaveDisplacement produces wind-driven multi-octave ocean displacement and clamped foam', () => {
  const rainWind = computeWindState(5.0, 'rain', 'autumn');
  const mistWind = computeWindState(5.0, 'mist', 'summer');

  let maxRainDisp = 0;
  let maxMistDisp = 0;
  for (let x = -40; x <= 40; x += 5) {
    for (let z = -40; z <= 40; z += 5) {
      const r = computeWaveDisplacement(x, z, 5.0, rainWind);
      const m = computeWaveDisplacement(x, z, 5.0, mistWind);
      assert.ok(Number.isFinite(r.dy) && Number.isFinite(r.foam));
      assert.ok(r.foam >= 0 && r.foam <= 1, `Foam must be in [0, 1], got ${r.foam}`);
      maxRainDisp = Math.max(maxRainDisp, Math.abs(r.dy));
      maxMistDisp = Math.max(maxMistDisp, Math.abs(m.dy));
    }
  }

  assert.ok(maxRainDisp > maxMistDisp, 'Rain swells must displace more than calm mist swells');
});

test('packActorFoliageInteractors filters airborne/sailing actors, sorts nearest-first, caps at 16, and boosts faster movers', () => {
  const world = createInitialWorld('whisper_solo');
  const cradle = ISLAND_DEFS.cradle;
  const focusX3 = toWorldX(cradle.centerX);
  const focusZ3 = toWorldZ(cradle.centerY);

  // Add plenty of extra villagers around Cradle to test capping at MAX_FOLIAGE_INTERACTORS (16)
  const baseV = world.villagers[0];
  for (let i = 0; i < 20; i++) {
    world.villagers.push({
      ...baseV,
      id: `extra_v_${i}`,
      x: cradle.centerX + (i % 5) * 12 - 24,
      y: cradle.centerY + Math.floor(i / 5) * 12 - 18,
      state: i === 0 ? 'sailing' : i === 1 ? 'gliding' : 'walking',
    });
  }

  const speedMap = new Map<string, number>();
  speedMap.set('extra_v_2', 2.4); // fast runner
  speedMap.set('extra_v_3', 0.05); // idle walker

  const slots = createInteractorArray();
  const packedCount = packActorFoliageInteractors(
    slots,
    world.villagers,
    world.livestock,
    world.wildHerds,
    { x: world.catX, y: world.catY },
    focusX3,
    focusZ3,
    toWorldX,
    toWorldZ,
    speedMap,
  );

  assert.equal(packedCount, MAX_FOLIAGE_INTERACTORS);
  assert.equal(slots.length, MAX_FOLIAGE_INTERACTORS);

  // Distances from focus must be monotonically non-decreasing
  let prevDist = -1;
  for (let i = 0; i < packedCount; i++) {
    const s = slots[i];
    assert.ok(s.w > 0.01, `Slot ${i} should have active weight`);
    assert.ok(s.z > 0.4, `Slot ${i} should have actor interaction radius`);
    const dist = Math.hypot(s.x - focusX3, s.y - focusZ3);
    assert.ok(dist >= prevDist - 1e-5, `Interactors must be sorted nearest-first (${dist} < ${prevDist})`);
    prevDist = dist;
  }

  // Verify speed weighting independently on a 2-villager focus
  const speedSlots = createInteractorArray();
  const fastV = { ...baseV, id: 'fast', x: cradle.centerX + 5, y: cradle.centerY, state: 'walking' as const };
  const slowV = { ...baseV, id: 'slow', x: cradle.centerX + 20, y: cradle.centerY, state: 'resting' as const };
  const twoCount = packActorFoliageInteractors(
    speedSlots,
    [slowV, fastV],
    [],
    [],
    null,
    focusX3,
    focusZ3,
    toWorldX,
    toWorldZ,
    speedMap.set('fast', 2.2).set('slow', 0.05),
  );
  assert.equal(twoCount, 2);
  assert.ok(speedSlots[0].w > speedSlots[1].w, 'Faster actor should apply stronger foliage bend weight');
});

test('computeAnchoredSunPosition keeps shadow frustum centered over distant islands', () => {
  const cradle = ISLAND_DEFS.cradle;
  const frost = ISLAND_DEFS.frostpeak;

  const cx = toWorldX(cradle.centerX);
  const cz = toWorldZ(cradle.centerY);
  const fx = toWorldX(frost.centerX);
  const fz = toWorldZ(frost.centerY);

  const cradleSun = computeAnchoredSunPosition(cx, cradle.elevationY + 0.5, cz, 0.5);
  const frostSun = computeAnchoredSunPosition(fx, frost.elevationY + 0.5, fz, 0.5);

  const dCradle = Math.hypot(cradleSun.x - cx, cradleSun.z - cz);
  const dFrost = Math.hypot(frostSun.x - fx, frostSun.z - fz);

  assert.ok(Math.abs(dCradle - dFrost) < 1e-5, 'Sun horizontal offset must stay anchored across islands');
  assert.ok(frostSun.y > frost.elevationY + 50, 'Sun elevation must stay well above tall highland islands');
});
