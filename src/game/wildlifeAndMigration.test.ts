import assert from 'node:assert/strict';
import test from 'node:test';
import { ISLAND_DEFS, generateCandidate } from './catalog';
import { dispatchMigrantBoat } from './migration';
import { classifyMainWorldTerrain } from './navigation';
import { applyWorldCommand, createInitialWorld, stepSimulation } from './simulation';
import { findShallowWaterDrinkPoint } from './wildlife';

test('wild animals exhibit thirst drinking at shallow water, grazing, resting, fleeing, reproduction, and never enter deep water', () => {
  const world = createInitialWorld('whisper_solo');
  const deer = world.wildHerds.find((h) => h.islandId === 'cradle' && h.kind === 'deer')!;
  const rabbit = world.wildHerds.find((h) => h.islandId === 'cradle' && h.kind === 'rabbit')!;

  // 1. Thirsty deer navigates to shallow water / shoreline and drinks without entering deep_water
  const drinkSpot = findShallowWaterDrinkPoint(world, 'cradle', deer.x, deer.y);
  assert.ok(drinkSpot, 'Cradle spring/river should yield a valid shallow-water drink point');
  assert.notEqual(classifyMainWorldTerrain(world, drinkSpot!.x, drinkSpot!.y), 'deep_water');

  deer.thirst = 20;
  deer.hunger = 80;
  deer.energy = 85;
  for (let i = 0; i < 60; i++) {
    stepSimulation(world, 0.05, [], false);
    assert.notEqual(
      classifyMainWorldTerrain(world, deer.x, deer.y),
      'deep_water',
      'Deer must never step into deep water',
    );
  }
  assert.equal(deer.behaviorState, 'drinking');

  // 2. Hungry animal enters grazing, tired animal enters resting
  deer.thirst = 90;
  deer.hunger = 30;
  deer.behaviorState = 'wandering';
  stepSimulation(world, 0.05, [], false);
  assert.equal(deer.behaviorState, 'grazing');

  deer.hunger = 85;
  deer.energy = 15;
  deer.behaviorState = 'wandering';
  stepSimulation(world, 0.05, [], false);
  assert.equal(deer.behaviorState, 'resting');

  // 3. Timid rabbit flees nearby active hunter/villager
  const adam = world.villagers[0];
  adam.islandId = 'cradle';
  adam.activeTask = 'hunt';
  adam.state = 'hunting';
  rabbit.x = adam.x + 28;
  rabbit.y = adam.y + 10;
  rabbit.thirst = 85;
  rabbit.hunger = 85;
  rabbit.energy = 85;
  stepSimulation(world, 0.05, [], false);
  assert.equal(rabbit.behaviorState, 'fleeing', 'Timid rabbit near hunter must flee');

  // 4. Healthy paired deer reproduce when reproCooldown <= 0
  const secondDeer = world.wildHerds.find((h) => h.islandId === 'cradle' && h.kind === 'deer' && h.id !== deer.id)!;
  deer.energy = 90;
  deer.hunger = 90;
  deer.thirst = 90;
  deer.reproCooldown = 0;
  deer.behaviorState = 'wandering';
  secondDeer.x = deer.x + 15;
  secondDeer.y = deer.y;
  secondDeer.energy = 90;
  secondDeer.hunger = 90;
  secondDeer.thirst = 90;
  secondDeer.reproCooldown = 0;
  secondDeer.behaviorState = 'wandering';
  const beforeCount = world.wildHerds.filter((h) => h.islandId === 'cradle' && h.kind === 'deer').length;
  stepSimulation(world, 0.05, [], false);
  const afterCount = world.wildHerds.filter((h) => h.islandId === 'cradle' && h.kind === 'deer').length;
  assert.equal(afterCount, beforeCount + 1, 'Well-fed nearby deer pair should produce a fawn');
});

test('migrant arrives physically by boat, docks, disembarks onto pier, introduces themselves, or sails away when declined', () => {
  const world = createInitialWorld('whisper_solo');
  const cradle = ISLAND_DEFS.cradle;
  // Ensure beds & food allow arrival resolution
  world.buildings.push({
    id: 'b_mig_cottage',
    type: 'cottage',
    name: 'Timber Cottage',
    islandId: 'cradle',
    cultureId: 'hearthfolk',
    description: '',
    level: 1,
    maxLevel: 4,
    x: cradle.centerX,
    y: cradle.centerY,
    unlocked: true,
    constructionStage: 'complete',
    disrepair: 0,
    hp: 160,
    maxHp: 160,
    housingCapacity: 4,
    baseCost: { timber: 22, stone: 12 },
    benefitDescription: '',
  });
  world.villageResources.cradle.food = 40;
  world.villageResources.cradle.berries = 40;

  const cand1 = generateCandidate('traveler', 1, new Set(world.villagers.map((v) => v.name)));
  cand1.islandId = 'cradle';
  cand1.greeterId = world.villagers[0].id;
  cand1.greeterName = world.villagers[0].name;
  const boat1 = dispatchMigrantBoat(world, 'cradle', cand1);
  assert.equal(boat1.kind, 'migrant_skiff');
  assert.equal(cand1.boatPhase, 'approaching');
  assert.ok(Math.hypot(boat1.x - cradle.dockSpot.seaX, boat1.y - cradle.dockSpot.seaY) > 100);

  // Sail until boat docks at harbor
  for (let i = 0; i < 300 && cand1.boatPhase === 'approaching'; i++) {
    stepSimulation(world, 0.05, [], false);
  }
  assert.equal(cand1.boatPhase, 'disembarked');
  assert.equal(boat1.state, 'docked');

  // Welcome migrant via command -> spawns at Cradle dock pier and initiates social greeting with greeter
  const resWelcome = applyWorldCommand(
    world,
    { kind: 'resolve_arrival', arrivalId: cand1.id, accept: true },
    [],
  );
  assert.equal(resWelcome.ok, true);
  const joined = world.villagers.find((v) => v.name === cand1.name);
  assert.ok(joined, 'Accepted migrant should join villagers');
  assert.ok(
    Math.hypot(joined!.x - cradle.dockSpot.x, joined!.y - cradle.dockSpot.y) < 25,
    'Accepted migrant should disembark physically at island pier',
  );
  assert.ok(
    (joined!.socialRecords?.[world.villagers[0].id]?.conversations ?? 0) >= 1,
    'Disembarking migrant should immediately perform social greeting with greeter',
  );
  assert.equal(boat1.state, 'returning', 'Migrant skiff should depart back to sea after disembarkation');

  // Declining a second migrant sends their skiff returning out to sea without adding a villager
  const cand2 = generateCandidate('traveler', 2, new Set(world.villagers.map((v) => v.name)));
  cand2.islandId = 'cradle';
  cand2.greeterId = world.villagers[0].id;
  cand2.greeterName = world.villagers[0].name;
  const boat2 = dispatchMigrantBoat(world, 'cradle', cand2);
  for (let i = 0; i < 300 && cand2.boatPhase === 'approaching'; i++) {
    stepSimulation(world, 0.05, [], false);
  }
  const popBeforeDecline = world.villagers.length;
  applyWorldCommand(world, { kind: 'resolve_arrival', arrivalId: cand2.id, accept: false }, []);
  assert.equal(world.villagers.length, popBeforeDecline);
  assert.equal(boat2.state, 'returning');
  assert.ok(
    (world.eventLog ?? []).some((e) => e.category === 'migration' && e.summary.includes('sailed away')),
    'Declining migrant should emit migration event',
  );
});
