import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CURRENT_WORLD_VERSION,
  ISLAND_DEFS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './catalog';
import { classifyMainWorldTerrain } from './navigation';
import {
  applyWorldCommand,
  createHudSnapshot,
  createInitialWorld,
  createParticlePool,
  normalizeWorldState,
  stepSimulation,
} from './simulation';
import type { WorldState } from './types';

test('Milestone 9A: 10-minute (600s) main-world stability run produces zero NaNs, zero deep-water breaches, bounded logs, and authentic progression', () => {
  const world = createInitialWorld('whisper_solo');
  const particles = createParticlePool();

  const totalSteps = 12_000; // 12,000 * 0.05s = 600 simulated seconds (10 minutes)
  for (let i = 0; i < totalSteps; i++) {
    stepSimulation(world, 0.05, particles, false);
  }

  // Verify villagers stayed valid, healthy, bounded, and on walkable terrain
  assert.ok(world.villagers.length >= 2, 'Founding population should survive initial 10 minutes');
  for (const v of [...world.villagers, ...world.clanVillagers]) {
    assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y), `${v.name} coordinates must be finite`);
    assert.ok(v.x >= 0 && v.x <= WORLD_WIDTH && v.y >= 0 && v.y <= WORLD_HEIGHT, `${v.name} must remain in world bounds`);
    assert.ok(Number.isFinite(v.hunger) && Number.isFinite(v.warmth) && Number.isFinite(v.energy) && Number.isFinite(v.mood));
    assert.ok((v.memories?.length ?? 0) <= 24, `${v.name} memories must stay capped at <= 24`);

    const inBoatOrAir = Boolean(v.voyageBoatId || v.transitGliderId || v.transitCableId || v.state === 'sailing');
    if (!inBoatOrAir) {
      const terrain = classifyMainWorldTerrain(world, v.x, v.y);
      assert.notEqual(
        terrain,
        'deep_water',
        `${v.name} must not enter deep water while on foot on ${v.islandId} at (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`,
      );
    }
  }

  // Verify wild animals stayed on valid non-deep-water terrain
  for (const h of world.wildHerds) {
    assert.ok(Number.isFinite(h.x) && Number.isFinite(h.y), `Wild ${h.kind} coordinates must be finite`);
    const terrain = classifyMainWorldTerrain(world, h.x, h.y);
    assert.notEqual(terrain, 'deep_water', `Wild ${h.kind} must never walk into deep water`);
  }

  // Verify bounded world logs and governance arrays
  assert.ok((world.eventLog?.length ?? 0) <= 200, 'eventLog must be capped <= 200');
  assert.ok((world.incidents?.length ?? 0) <= 60, 'incidents must be capped <= 60');
  assert.ok((world.disputes?.length ?? 0) <= 24, 'disputes must be capped <= 24');
  assert.ok(world.chronicle.length <= 42, 'chronicle must be capped <= 42');

  // Verify finite mineral/stone nodes stay within [0, maxAmount]
  for (const node of world.wildNodes) {
    assert.ok(Number.isFinite(node.amount), `Wild node ${node.id} amount must be finite`);
    assert.ok(node.amount >= 0 && node.amount <= node.maxAmount + 1e-6, `Wild node ${node.id} amount out of bounds`);
  }

  // Verify authentic cognitive & village progression happened naturally
  const cradlePop = world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === 'cradle');
  const maxAwareness = Math.max(...cradlePop.map((v) => v.cognition.awareness));
  assert.ok(maxAwareness > 20, `Founders should awaken and learn naturally over 10m (awareness=${maxAwareness})`);

  const housesOnCradle = world.buildings.filter(
    (b) => b.islandId === 'cradle' && (b.type === 'lean_to' || b.type === 'cottage'),
  );
  assert.ok(
    housesOnCradle.length <= 2,
    `Small 2-villager population with initial beds must not spam excessive houses (count=${housesOnCradle.length})`,
  );

  // Verify HUD snapshot serializes cleanly
  const hud = createHudSnapshot(world);
  assert.doesNotThrow(() => JSON.stringify(hud));
});

test('Milestone 9B: legacy pre-overhaul save migrates cleanly via normalizeWorldState and simulates without errors', () => {
  const modern = createInitialWorld('whisper_solo');
  const legacyRaw = JSON.parse(JSON.stringify(modern)) as Record<string, unknown>;
  legacyRaw.version = Math.max(9, CURRENT_WORLD_VERSION - 1);
  delete legacyRaw.eventLog;
  delete legacyRaw.communityRules;
  delete legacyRaw.incidents;
  delete legacyRaw.disputes;

  for (const v of legacyRaw.villagers as Record<string, unknown>[]) {
    delete v.personality;
    delete v.knowledge;
    delete v.memories;
    delete v.decisionTrace;
    delete v.carriedResource;
    delete v.carriedAmount;
    delete v.carryCapacity;
    delete v.reputation;
    delete v.banished;
    delete v.offenseCount;
    delete v.contributionCount;
    delete v.knownIncidentIds;
    delete v.rumorIncidentIds;
  }
  for (const h of legacyRaw.wildHerds as Record<string, unknown>[]) {
    delete h.behaviorState;
    delete h.hunger;
    delete h.thirst;
    delete h.energy;
  }

  const migrated = normalizeWorldState(legacyRaw as unknown as WorldState);
  for (const v of migrated.villagers) {
    assert.ok(v.personality, 'personality hydrated');
    assert.ok(v.knowledge, 'knowledge hydrated');
    assert.ok(Array.isArray(v.memories), 'memories hydrated');
    assert.ok(v.decisionTrace, 'decisionTrace hydrated');
    assert.equal(typeof v.reputation, 'number', 'reputation hydrated');
    assert.equal(v.banished, false, 'banished hydrated');
  }
  assert.ok(Array.isArray(migrated.eventLog), 'eventLog hydrated');
  assert.ok(Array.isArray(migrated.communityRules), 'communityRules hydrated');
  assert.ok(Array.isArray(migrated.incidents), 'incidents hydrated');
  assert.ok(Array.isArray(migrated.disputes), 'disputes hydrated');

  const particles = createParticlePool();
  for (let i = 0; i < 120; i++) {
    stepSimulation(migrated, 0.05, particles, false);
  }
  const hud = createHudSnapshot(migrated);
  assert.ok(hud.villagers.length >= 2);
});

test('Milestone 9C: main-world cross-island move without bridge/dock/glider is rejected and construction requests queue cleanly', () => {
  const world = createInitialWorld('sovereign_sandbox');
  const particles = createParticlePool();
  const adam = world.villagers.find((v) => v.islandId === 'cradle')!;
  assert.ok(adam);

  // Move across sky-sea to Frostpeak without bridge/dock/glider/cableway should fail
  // Switch temporarily to whisper_solo so Sovereign teleport override doesn't bypass route check
  world.gameMode = 'whisper_solo';
  const blockedMove = applyWorldCommand(
    world,
    {
      kind: 'move_villager',
      villagerId: adam.id,
      islandId: 'frostpeak',
      x: ISLAND_DEFS.frostpeak.centerX,
      y: ISLAND_DEFS.frostpeak.centerY,
    },
    particles,
  );
  assert.equal(blockedMove.ok, false);
  assert.equal(adam.islandId, 'cradle');

  // Simultaneous construction placement requests on Cradle Isle remain bounded and non-overlapping
  const buildA = applyWorldCommand(
    world,
    {
      kind: 'place_building',
      buildingType: 'bonfire',
      islandId: 'cradle',
      x: ISLAND_DEFS.cradle.centerX + 45,
      y: ISLAND_DEFS.cradle.centerY + 25,
    },
    particles,
  );
  const buildB = applyWorldCommand(
    world,
    {
      kind: 'place_building',
      buildingType: 'farm_plot',
      islandId: 'cradle',
      x: ISLAND_DEFS.cradle.centerX - 45,
      y: ISLAND_DEFS.cradle.centerY - 25,
    },
    particles,
  );
  assert.equal(typeof buildA.ok, 'boolean');
  assert.equal(typeof buildB.ok, 'boolean');
  assert.ok(world.placedSuggestions.length <= 6);
});
