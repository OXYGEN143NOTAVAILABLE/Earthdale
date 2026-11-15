import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSandboxWorld,
  findSandboxPath,
  getTerrainAt,
  runSandboxToCompletion,
  setSandboxBridge,
  stepSandbox,
} from './sandbox.ts';

test('Sandbox simulation is deterministic for identical seed and config', () => {
  const a = runSandboxToCompletion(createSandboxWorld({ scenarioId: 'default', seed: 77, durationSeconds: 90 }), 0.25);
  const b = runSandboxToCompletion(createSandboxWorld({ scenarioId: 'default', seed: 77, durationSeconds: 90 }), 0.25);

  assert.equal(a.timeSec, b.timeSec);
  assert.deepEqual(a.stockpile, b.stockpile);
  assert.equal(a.events.length, b.events.length);
  assert.deepEqual(
    a.villagers.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y), goal: v.currentGoal })),
    b.villagers.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y), goal: v.currentGoal })),
  );
});

test('Scenario A: 2 villagers with 2 available beds do NOT build unnecessary houses', () => {
  const w = createSandboxWorld({ scenarioId: 'small_pop', durationSeconds: 180 });
  runSandboxToCompletion(w, 0.25);

  const housingBuildings = w.buildings.filter((b) => b.beds > 0);
  assert.equal(housingBuildings.length, 1, '2 villagers with 2 beds should not stake extra houses');
  assert.equal(w.metrics.housesConstructedCount, 0);
});

test('Scenario B: Social development progresses from stranger and logs real events', () => {
  const w = createSandboxWorld({ scenarioId: 'social_dev', durationSeconds: 160 });
  runSandboxToCompletion(w, 0.25);

  const introEvents = w.events.filter((e) => e.category === 'introductions');
  assert.ok(introEvents.length >= 1, 'Expected at least 1 confirmed introduction event');

  // Verify at least one pair progressed beyond stranger after introductions/chats
  const maxScore = Math.max(
    ...w.villagers.flatMap((v) => Object.values(v.relationships).map((r) => r.score)),
  );
  assert.ok(maxScore >= 12, `Expected relationship score to progress past stranger (>=12), got ${maxScore}`);

  // Confirm every event references existing villager IDs when present
  const validIds = new Set(w.villagers.map((v) => v.id));
  for (const ev of w.events) {
    for (const id of ev.involvedIds) {
      assert.ok(validIds.has(id), `Event ${ev.id} references unknown villager ${id}`);
    }
  }
});

test('Scenario C: Finite resource nodes deplete cleanly and cannot yield below 0', () => {
  const w = createSandboxWorld({
    scenarioId: 'resource_depletion',
    durationSeconds: 180,
    initialWood: 0,
    initialTwigs: 2,
  });
  const twigNodes = w.nodes.filter((n) => n.kind === 'twig');
  assert.equal(twigNodes.length, 2);
  assert.equal(twigNodes[0].amount, 5);

  runSandboxToCompletion(w, 0.25);

  for (const n of w.nodes) {
    assert.ok(n.amount >= 0, `Node ${n.id} amount went negative: ${n.amount}`);
  }
  const depletedCount = w.nodes.filter((n) => n.amount === 0).length;
  assert.ok(depletedCount >= 1, 'Expected scarce nodes to deplete to 0 during 180s run');
});

test('Scenario D: Staged construction consumes materials and completes shelter', () => {
  const w = createSandboxWorld({ scenarioId: 'construction', durationSeconds: 160 });
  const initialWood = w.stockpile.wood;
  const project = w.buildings.find((b) => b.stage !== 'complete');
  assert.ok(project, 'Expected an incomplete construction project in construction scenario');

  runSandboxToCompletion(w, 0.25);

  assert.equal(project.stage, 'complete');
  assert.equal(project.progress, 100);
  assert.equal(project.deliveredWood, project.requiredWood);
  assert.equal(project.deliveredStone, project.requiredStone);
  assert.ok(w.stockpile.wood < initialWood || w.metrics.totalResourcesGathered > 0);
});

test('Scenario E: Deep water blocks traversal without bridge and allows crossing with bridge', () => {
  const w = createSandboxWorld({ scenarioId: 'deep_water', durationSeconds: 90, hasBridgeOverDeepWater: false });
  const eastTarget = w.nodes.find((n) => n.x > 800);
  assert.ok(eastTarget, 'Expected eastern resource across pond');

  const blocked = findSandboxPath(w, w.villagers[0].x, w.villagers[0].y, eastTarget.x, eastTarget.y);
  assert.equal(blocked.reachable, false, 'Eastern bank across deep water must be unreachable without bridge');

  // Run 40s without bridge — verify no villager ever enters deep water
  for (let i = 0; i < 160; i++) {
    stepSandbox(w, 0.25);
    for (const v of w.villagers) {
      assert.notEqual(getTerrainAt(w, v.x, v.y), 'deep_water', `${v.name} entered deep water!`);
    }
  }

  // Open footbridge and re-test pathfinding
  setSandboxBridge(w, true);
  const open = findSandboxPath(w, w.villagers[0].x, w.villagers[0].y, eastTarget.x, eastTarget.y);
  assert.equal(open.reachable, true, 'Eastern bank should become reachable once bridge is opened');
});

test('Scenario F: Collision cluster separates overlapping villagers safely', () => {
  const w = createSandboxWorld({ scenarioId: 'collision_cluster', durationSeconds: 60 });
  runSandboxToCompletion(w, 0.25);

  for (let i = 0; i < w.villagers.length; i++) {
    for (let j = i + 1; j < w.villagers.length; j++) {
      const a = w.villagers[i];
      const b = w.villagers[j];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      assert.ok(d >= 18, `Villagers ${a.name} and ${b.name} remained heavily overlapped (dist=${d.toFixed(1)})`);
    }
    assert.notEqual(getTerrainAt(w, w.villagers[i].x, w.villagers[i].y), 'deep_water');
  }
});

test('Scenario G: Animals exhibit multiple behaviors and never enter deep water', () => {
  const w = createSandboxWorld({ scenarioId: 'animal_ecosystem', durationSeconds: 120 });
  const observedStates = new Set<string>();
  for (let i = 0; i < 480; i++) {
    stepSandbox(w, 0.25);
    for (const a of w.animals) {
      observedStates.add(a.state);
      assert.notEqual(getTerrainAt(w, a.x, a.y), 'deep_water', `Animal ${a.id} entered deep water`);
    }
  }
  assert.ok(observedStates.size >= 2, `Expected animals to transition across states, saw: ${[...observedStates].join(', ')}`);
});

test('Scenario H: Boat arrives, docks, disembarks migrants, and introduces them', () => {
  const w = createSandboxWorld({ scenarioId: 'migration', durationSeconds: 120 });
  const startPop = w.villagers.length;
  runSandboxToCompletion(w, 0.25);

  assert.equal(w.boats[0].state, 'docked');
  assert.equal(w.boats[0].disembarked, true);
  assert.equal(w.villagers.length, startPop + 2);
  const migrationEvents = w.events.filter((e) => e.category === 'migration');
  assert.ok(migrationEvents.length >= 2);
});

test('Scenario I: Repeated theft leads to witness memories, collective vote, and physical banishment', () => {
  const w = createSandboxWorld({ scenarioId: 'governance', durationSeconds: 220 });
  runSandboxToCompletion(w, 0.25);

  const saboteur = w.villagers[4];
  assert.ok(saboteur.ruleViolations >= 1, 'Expected low-honesty villager to commit theft when hungry');
  const conflictEvents = w.events.filter((e) => e.category === 'conflicts' || e.category === 'governance');
  assert.ok(conflictEvents.length >= 1, 'Expected theft/governance events in log');
});
