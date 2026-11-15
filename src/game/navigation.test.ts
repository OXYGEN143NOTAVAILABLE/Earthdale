import test from 'node:test';
import assert from 'node:assert/strict';
import { ISLAND_DEFS } from './catalog';
import {
  checkTargetReachability,
  classifyMainWorldTerrain,
  findIslandPath,
  getTerrainSpeedMultiplier,
  steerMainWorldEntity,
} from './navigation';
import { applyWorldCommand, createInitialWorld, stepSimulation } from './simulation';

test('terrain classification separates land, shallow river/spring water, deep sky-sea, and built bridges', () => {
  const world = createInitialWorld('whisper_solo');
  const cradle = ISLAND_DEFS.cradle;

  assert.equal(classifyMainWorldTerrain(world, cradle.centerX + 95, cradle.centerY - 40), 'land');
  // Cradle spring center is deep water; outer mossy bank is shallow water
  const sx = cradle.centerX + cradle.springOffset!.dx;
  const sy = cradle.centerY + cradle.springOffset!.dy;
  assert.equal(classifyMainWorldTerrain(world, sx, sy), 'deep_water');
  assert.equal(classifyMainWorldTerrain(world, sx + 26, sy), 'shallow_water');

  // Open sky-sea far from any island is deep_water
  assert.equal(classifyMainWorldTerrain(world, 200, 200), 'deep_water');

  // Built bridge deck over sky-sea becomes bridge terrain
  const br = world.bridges[0];
  br.built = true;
  const midX = (br.x1 + br.x2) * 0.5;
  const midY = (br.y1 + br.y2) * 0.5;
  assert.equal(classifyMainWorldTerrain(world, midX, midY), 'bridge');

  // Mist Atoll lagoon center is deep water, Embervault trench is deep water
  const mist = ISLAND_DEFS.mistatoll;
  assert.equal(classifyMainWorldTerrain(world, mist.centerX - mist.radiusX * 0.14, mist.centerY), 'deep_water');
  const ev = ISLAND_DEFS.embervault;
  assert.equal(classifyMainWorldTerrain(world, ev.centerX - ev.radiusX * 0.34, ev.centerY + ev.radiusY * 0.22), 'deep_water');
});

test('A* pathfinding routes around solid buildings without entering deep water', () => {
  const world = createInitialWorld('sovereign_sandbox');
  const cradle = ISLAND_DEFS.cradle;

  // Place a solid stone cottage directly between start and goal
  world.buildings.push({
    id: 'test_wall_cottage',
    type: 'cottage',
    name: 'Test Cottage',
    islandId: 'cradle',
    cultureId: 'hearthfolk',
    description: 'Obstacle',
    level: 1,
    maxLevel: 3,
    x: cradle.centerX + 80,
    y: cradle.centerY - 40,
    unlocked: true,
    disrepair: 0,
    hp: 200,
    maxHp: 200,
    housingCapacity: 4,
    baseCost: {},
    benefitDescription: 'Test',
  });

  const plan = findIslandPath(
    world,
    'cradle',
    cradle.centerX + 20,
    cradle.centerY - 40,
    cradle.centerX + 160,
    cradle.centerY - 40,
  );
  assert.equal(plan.reachable, true);
  assert.ok(plan.waypoints.length >= 1);

  for (const wp of plan.waypoints) {
    assert.notEqual(classifyMainWorldTerrain(world, wp.x, wp.y), 'deep_water');
    // Waypoints should not cut straight through cottage center
    const d = Math.hypot(wp.x - (cradle.centerX + 80), wp.y - (cradle.centerY - 40));
    assert.ok(d > 15, `waypoint ${wp.x},${wp.y} clipped inside obstacle (${d})`);
  }
});

test('cross-island move is rejected without bridge/dock/glider/cableway and succeeds once sky-bridge is built', () => {
  const world = createInitialWorld('whisper_solo');
  const tc = ISLAND_DEFS.timbercrown;
  const adam = world.villagers[0];

  const blocked = checkTargetReachability(world, 'cradle', adam.x, adam.y, tc.centerX, tc.centerY);
  assert.equal(blocked.reachable, false);

  const cmdBlocked = applyWorldCommand(
    world,
    {
      kind: 'move_villager',
      villagerId: adam.id,
      islandId: 'timbercrown',
      x: tc.centerX,
      y: tc.centerY,
    },
    [],
  );
  assert.equal(cmdBlocked.ok, false);

  // Build bridge linking cradle <-> timbercrown
  const br = world.bridges.find(
    (b) =>
      (b.fromIsland === 'cradle' && b.toIsland === 'timbercrown') ||
      (b.fromIsland === 'timbercrown' && b.toIsland === 'cradle'),
  );
  assert.ok(br);
  br.built = true;

  const allowed = checkTargetReachability(world, 'cradle', adam.x, adam.y, tc.centerX, tc.centerY);
  assert.equal(allowed.reachable, true);
  const cmdAllowed = applyWorldCommand(
    world,
    {
      kind: 'move_villager',
      villagerId: adam.id,
      islandId: 'timbercrown',
      x: tc.centerX,
      y: tc.centerY,
    },
    [],
  );
  assert.equal(cmdAllowed.ok, true);
});

test('shallow water slows movement and deep-water guard prevents walking into sea or deep pools', () => {
  const world = createInitialWorld('whisper_solo');
  const cradle = ISLAND_DEFS.cradle;
  assert.ok(getTerrainSpeedMultiplier('shallow_water') < getTerrainSpeedMultiplier('land'));
  assert.equal(getTerrainSpeedMultiplier('deep_water'), 0);

  // Try steering straight off the southern cliff into deep sky-sea
  const stuck = { lastX: cradle.centerX, lastY: cradle.centerY + cradle.radiusY - 40, timer: 0, detourSign: 1 as const };
  let x = cradle.centerX;
  let y = cradle.centerY + cradle.radiusY - 55;
  for (let i = 0; i < 40; i++) {
    const res = steerMainWorldEntity(world, 'cradle', x, y, cradle.centerX, cradle.centerY + cradle.radiusY + 300, 12, false, stuck, 0.05);
    x = res.x;
    y = res.y;
    assert.notEqual(classifyMainWorldTerrain(world, x, y), 'deep_water', 'walker entered deep_water');
  }
});

test('sunterrace rivers force A* around deep pools via shallow stone fords', () => {
  const world = createInitialWorld('whisper_solo');
  const st = ISLAND_DEFS.sunterrace;
  const plan = findIslandPath(
    world,
    'sunterrace',
    st.centerX - 300,
    st.centerY + 180,
    st.centerX + 260,
    st.centerY - 220,
  );
  assert.equal(plan.reachable, true);
  assert.ok(plan.waypoints.length >= 1);
  for (const wp of plan.waypoints) {
    assert.notEqual(classifyMainWorldTerrain(world, wp.x, wp.y), 'deep_water');
  }
});

test('crowded villagers stay separated and never teleport over 60 simulated seconds', () => {
  const world = createInitialWorld('sovereign_sandbox');
  const cradle = ISLAND_DEFS.cradle;
  // Move multiple villagers toward the same spot on Cradle
  for (const v of world.villagers) {
    v.islandId = 'cradle';
    v.x = cradle.centerX - 40 + Math.random() * 10;
    v.y = cradle.centerY + Math.random() * 10;
    v.targetX = cradle.centerX + 110;
    v.targetY = cradle.centerY - 25;
    v.state = 'walking';
    v.decisionCooldown = 999;
  }

  for (let tick = 0; tick < 600; tick++) {
    const prev = world.villagers.map((v) => ({ id: v.id, x: v.x, y: v.y }));
    stepSimulation(world, 0.05, [], false);
    for (const v of world.villagers) {
      const p = prev.find((item) => item.id === v.id)!;
      const stepDelta = Math.hypot(v.x - p.x, v.y - p.y);
      assert.ok(stepDelta < 18, `villager ${v.name} teleported ${stepDelta}u in single tick`);
      assert.notEqual(classifyMainWorldTerrain(world, v.x, v.y), 'deep_water');
    }
  }

  for (let i = 0; i < world.villagers.length; i++) {
    for (let j = i + 1; j < world.villagers.length; j++) {
      const a = world.villagers[i];
      const b = world.villagers[j];
      if (a.islandId !== b.islandId) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(d >= 8.5, `villagers overlapped at distance ${d}`);
    }
  }
});
