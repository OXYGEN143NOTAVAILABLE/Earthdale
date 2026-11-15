import assert from 'node:assert/strict';
import test from 'node:test';
import { ISLAND_DEFS } from './catalog';
import {
  applyMultiplayerWorldCommand,
  enforceMultiplayerClock,
  sanitizeSyncedWorldState,
  stepMultiplayerWorld,
} from './multiplayerSync';
import {
  assignPlayerVillageInWorld,
  createInitialWorld,
  createParticlePool,
} from './simulation';
import type { SettingsState, WorldState } from './types';

test('Scenario J1: multiplayer locks simSpeed to 1x and sub-steps 10Hz server ticks accurately', () => {
  const world = createInitialWorld('whisper_solo');
  world.settings.simSpeed = 3;
  enforceMultiplayerClock(world);
  assert.equal(world.settings.simSpeed, 1);

  const particles = createParticlePool();
  for (const speed of [0, 2, 3] as const) {
    const res = applyMultiplayerWorldCommand(world, { kind: 'set_speed', speed }, particles, 'p_host');
    assert.equal(res.ok, false);
    assert.equal(world.settings.simSpeed, 1);
  }

  // Verify 0.12s server tick advances full 0.12s worth of timeOfDay (not clamped to 0.05s)
  world.environment.timeMode = 'cycle';
  const startTime = world.environment.timeOfDay;
  stepMultiplayerWorld(world, 0.12, particles);
  const expectedDelta = 0.12 / world.environment.cycleSpeedSeconds;
  const actualDelta = (world.environment.timeOfDay - startTime + 1) % 1;
  assert.ok(
    Math.abs(actualDelta - expectedDelta) < 1e-6,
    `Expected full 0.12s advance (${expectedDelta}), got ${actualDelta}`,
  );
  assert.equal(world.settings.simSpeed, 1);
});

test('Scenario J2: authoritative multiplayer state syncs positions, construction, depletion, social log, and governance without duplicates', () => {
  const serverWorld = createInitialWorld('whisper_solo');
  enforceMultiplayerClock(serverWorld);
  const particles = createParticlePool();

  const hostHome = assignPlayerVillageInWorld(serverWorld, 'player_host', 'cradle');
  const peerHome = assignPlayerVillageInWorld(serverWorld, 'player_peer');
  assert.equal(hostHome, 'cradle');
  assert.notEqual(peerHome, 'cradle');

  // Cross-island command rejection preserves isolation
  const illegalBuild = applyMultiplayerWorldCommand(
    serverWorld,
    {
      kind: 'place_building',
      buildingType: 'lean_to',
      islandId: peerHome,
      x: ISLAND_DEFS[peerHome].centerX + 40,
      y: ISLAND_DEFS[peerHome].centerY + 20,
    },
    particles,
    'player_host',
  );
  assert.equal(illegalBuild.ok, false);

  // Unlock shelter knowledge on server and issue a valid build request on host's own island
  serverWorld.unlockedTechIds.push('fire_making', 'woven_shelter');
  const validBuild = applyMultiplayerWorldCommand(
    serverWorld,
    {
      kind: 'place_building',
      buildingType: 'lean_to',
      islandId: 'cradle',
      x: ISLAND_DEFS.cradle.centerX + 55,
      y: ISLAND_DEFS.cradle.centerY + 35,
    },
    particles,
    'player_host',
  );
  assert.equal(validBuild.ok, true);

  // Simulate 15 seconds of authoritative 10Hz ticks
  for (let i = 0; i < 125; i++) {
    stepMultiplayerWorld(serverWorld, 0.12, particles);
  }

  // Broadcast serialized snapshot to two clients with different local audio/FPS preferences
  const payload = JSON.stringify(serverWorld);
  const hostLocalSettings: SettingsState = {
    fpsCap: 60,
    simSpeed: 3, // even if stale local setting was 3x, sync must lock to 1x
    muted: true,
    volume: 0.4,
    autoProgress: true,
  };
  const peerLocalSettings: SettingsState = {
    fpsCap: 30,
    simSpeed: 0,
    muted: false,
    volume: 0.8,
    autoProgress: true,
  };

  const clientA = sanitizeSyncedWorldState(JSON.parse(payload) as WorldState, hostLocalSettings);
  const clientB = sanitizeSyncedWorldState(JSON.parse(payload) as WorldState, peerLocalSettings);

  // Local client audio/fps preserved while simulation clock locked to 1x
  assert.equal(clientA.settings.simSpeed, 1);
  assert.equal(clientB.settings.simSpeed, 1);
  assert.equal(clientA.settings.fpsCap, 60);
  assert.equal(clientB.settings.fpsCap, 30);
  assert.equal(clientA.settings.muted, true);
  assert.equal(clientB.settings.muted, false);

  // Authoritative world fields match identically across both clients and have no duplicate event IDs
  assert.equal(clientA.villagers.length, clientB.villagers.length);
  for (let i = 0; i < clientA.villagers.length; i++) {
    assert.equal(clientA.villagers[i].x, clientB.villagers[i].x);
    assert.equal(clientA.villagers[i].y, clientB.villagers[i].y);
    assert.equal(clientA.villagers[i].state, clientB.villagers[i].state);
  }
  assert.deepEqual(clientA.buildings, clientB.buildings);
  assert.deepEqual(clientA.wildNodes, clientB.wildNodes);
  assert.deepEqual(clientA.communityRules, clientB.communityRules);
  assert.deepEqual(clientA.disputes, clientB.disputes);
  assert.deepEqual(clientA.eventLog, clientB.eventLog);

  const eventIds = (clientA.eventLog ?? []).map((e) => e.id);
  assert.equal(new Set(eventIds).size, eventIds.length, 'Event log must never contain duplicate event IDs');
});
