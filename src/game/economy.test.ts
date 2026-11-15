import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addToVillagerInventory,
  canBuildCottage,
  deliverMaterialsForStage,
  depositCarriedToVillage,
  harvestWildNode,
  initStagedBuildingMaterials,
  tickWildNodeRegrowth,
  villageNeedsHousing,
} from './economy';
import { advanceKnowledge } from './knowledge';
import { evaluateVillagerDecision } from './npcBrain';
import { addVillageResource, createInitialWorld, stepSimulation } from './simulation';
import { BUILDING_BLUEPRINTS } from './techAndCultures';
import type { BuildingEntity } from './types';

test('finite mineral nodes never regrow and flora stripped bare stays depleted', () => {
  const world = createInitialWorld('whisper_solo');
  const boulder = world.wildNodes.find((n) => n.kind === 'stone_boulder')!;
  const bush = world.wildNodes.find((n) => n.kind === 'berry_bush')!;
  const tree = world.wildNodes.find((n) => n.kind === 'tree')!;

  const taken = harvestWildNode(boulder, 999);
  assert.ok(taken > 0);
  assert.equal(boulder.amount, 0);

  // Partial harvest on bush keeps > 0.05 so it can regrow; stripping tree to 0 stops regrowth
  harvestWildNode(bush, bush.maxAmount * 0.5);
  const bushAfterHarvest = bush.amount;
  harvestWildNode(tree, 999);
  assert.equal(tree.amount, 0);

  tickWildNodeRegrowth(world, 20);
  assert.equal(boulder.amount, 0, 'Stone boulders must stay strictly depleted');
  assert.equal(tree.amount, 0, 'Completely stripped trees must not magically regrow from zero');
  assert.ok(bush.amount > bushAfterHarvest, 'Partially harvested berry bush should regrow slowly');
});

test('no thin-air gathering occurs when matching wild nodes are absent', () => {
  const world = createInitialWorld('whisper_solo');
  // Strip all Cradle nodes so nothing exists on home island
  for (const n of world.wildNodes) {
    if (n.islandId === 'cradle') n.amount = 0;
  }
  const adam = world.villagers[0];
  adam.cognition = {
    stage: 'reasoning',
    awareness: 65,
    observedConcepts: ['berry_bush', 'stone_boulder', 'embers'],
    socialCount: 2,
    focusObject: null,
  };
  adam.activeTask = 'gather_stone';
  adam.state = 'working';
  adam.decisionCooldown = 99;
  world.villageResources.cradle.stone = 0;
  world.resources.stone = 0;

  for (let i = 0; i < 40; i++) {
    stepSimulation(world, 0.05, [], false);
  }

  assert.equal(world.villageResources.cradle.stone, 0, 'Village stone must remain 0 without a real stone node');
  assert.equal(adam.carriedAmount ?? 0, 0, 'Villager must not carry stone conjured from thin air');
});

test('per-NPC inventory fills on gather and deposits into village stockpile via haul_to_stockpile', () => {
  const world = createInitialWorld('whisper_solo');
  const adam = world.villagers[0];
  adam.cognition = {
    stage: 'reasoning',
    awareness: 65,
    observedConcepts: ['berry_bush', 'stone_boulder', 'embers'],
    socialCount: 2,
    focusObject: null,
  };

  const added = addToVillagerInventory(world, adam, 'timber', 6, addVillageResource);
  assert.equal(added, 6);
  assert.equal(adam.carriedResource, 'timber');
  assert.equal(adam.carriedAmount, 6);
  assert.equal(world.villageResources.cradle.timber, 0, 'Carried goods wait until delivered to stockpile');

  const evalRes = evaluateVillagerDecision(world, adam);
  assert.equal(evalRes.selectedAction, 'haul_to_stockpile');

  const deposited = depositCarriedToVillage(world, adam, addVillageResource, (w) => {
    w.resources.food = w.villageResources.cradle.berries;
  });
  assert.equal(deposited?.resource, 'timber');
  assert.equal(deposited?.amount, 6);
  assert.equal(world.villageResources.cradle.timber, 6);
  assert.equal(adam.carriedAmount, 0);
  assert.equal(adam.carriedResource, null);
});

test('staged construction pauses cleanly when stage materials are missing and resumes on delivery', () => {
  const world = createInitialWorld('whisper_solo');
  world.unlockedTechIds.push('fire_making');
  world.villageResources.cradle.timber = 2; // enough for foundation (ceil(6 * 0.25) = 2), NOT framework (ceil(6 * 0.5) = 3)
  world.villageResources.cradle.stone = 1;  // enough for foundation (ceil(4 * 0.25) = 1), NOT framework (ceil(4 * 0.5) = 2)
  const adam = world.villagers[0];
  adam.cognition = {
    stage: 'reasoning',
    awareness: 65,
    observedConcepts: ['berry_bush', 'stone_boulder', 'embers'],
    socialCount: 2,
    focusObject: null,
  };
  const fireBp = BUILDING_BLUEPRINTS.bonfire;
  const site: BuildingEntity = {
    id: 'test_bonfire_site',
    type: 'bonfire',
    name: fireBp.name,
    islandId: 'cradle',
    cultureId: 'hearthfolk',
    description: fireBp.description,
    level: 0,
    maxLevel: fireBp.maxLevel,
    x: adam.x + 12,
    y: adam.y,
    unlocked: false,
    disrepair: 0,
    hp: 160,
    maxHp: 160,
    housingCapacity: 0,
    baseCost: fireBp.baseCost,
    benefitDescription: fireBp.benefitDescription,
  };
  initStagedBuildingMaterials(site, fireBp.baseCost);
  world.buildings.push(site);
  world.activeConstruction = {
    buildingId: site.id,
    builderId: adam.id,
    progress: 0,
    duration: 4.0,
    isUpgrade: false,
    stage: 'foundation',
    pausedForMaterials: false,
  };

  // Step through foundation (0..25%) into framework gate (1.0s / 4.0s)
  for (let i = 0; i < 45; i++) {
    stepSimulation(world, 0.05, [], false);
  }
  assert.equal(site.unlocked, false);
  assert.equal(site.constructionStage, 'framework');
  assert.equal(site.pausedForMaterials, true, 'Construction must pause at framework when remaining materials are missing');
  assert.ok(
    (world.eventLog ?? []).some((e) => e.category === 'construction' && e.summary.includes('paused at framework')),
    'Expected paused construction WorldEvent in eventLog',
  );

  // Now deliver missing materials and continue stepping to completion
  world.villageResources.cradle.timber = 10;
  world.villageResources.cradle.stone = 10;
  const check = deliverMaterialsForStage(world, site, world.activeConstruction!, () => {});
  assert.equal(check.gateMet, true);
  assert.equal(site.pausedForMaterials, false);

  for (let i = 0; i < 120 && !site.unlocked; i++) {
    stepSimulation(world, 0.05, [], false);
  }
  assert.equal(site.unlocked, true, 'Construction should complete once stage materials are delivered');
  assert.equal(site.constructionStage, 'complete');
});

test('2-villager village with 2 beds never constructs extra houses and gates cottage by tech + knowledge', () => {
  assert.equal(villageNeedsHousing(2, 2), false);
  assert.equal(villageNeedsHousing(3, 2), true);

  const world = createInitialWorld('whisper_solo');
  // Without timber_joinery, cottage cannot be built
  assert.equal(canBuildCottage(world, 'cradle'), false);

  // Unlock all early/mid techs and give abundant resources, plus build 1 bonfire, 2 farms, 1 lean_to (2 beds for 2 villagers)
  world.unlockedTechIds.push('fire_making', 'woven_shelter', 'timber_joinery', 'agriculture_basics', 'masonry_bakery');
  for (const v of world.villagers) {
    v.cognition = {
      stage: 'reasoning',
      awareness: 70,
      observedConcepts: ['berry_bush', 'stone_boulder', 'embers'],
      socialCount: 2,
      focusObject: null,
    };
    advanceKnowledge(v, 'construction', 10);
  }
  assert.equal(canBuildCottage(world, 'cradle'), true);

  world.villageResources.cradle.food = 40;
  world.villageResources.cradle.berries = 40;
  world.villageResources.cradle.timber = 120;
  world.villageResources.cradle.stone = 120;
  world.villageResources.cradle.hides = 20;

  // Give them 1 unlocked bonfire + 1 unlocked lean_to (2 beds) + 2 farms so housing need is met (2 === 2)
  world.buildings.push(
    {
      id: 'b_fire',
      type: 'bonfire',
      name: 'Cultural Bonfire',
      islandId: 'cradle',
      cultureId: 'hearthfolk',
      description: '',
      level: 1,
      maxLevel: 3,
      x: world.villagers[0].x + 25,
      y: world.villagers[0].y,
      unlocked: true,
      constructionStage: 'complete',
      disrepair: 0,
      hp: 160,
      maxHp: 160,
      housingCapacity: 0,
      baseCost: { timber: 6, stone: 4 },
      benefitDescription: '',
    },
    {
      id: 'b_leanto',
      type: 'lean_to',
      name: 'Hide Lean-To',
      islandId: 'cradle',
      cultureId: 'hearthfolk',
      description: '',
      level: 1,
      maxLevel: 2,
      x: world.villagers[0].x - 75,
      y: world.villagers[0].y,
      unlocked: true,
      constructionStage: 'complete',
      disrepair: 0,
      hp: 160,
      maxHp: 160,
      housingCapacity: 2,
      baseCost: { timber: 10, hides: 2 },
      benefitDescription: '',
    },
  );

  // Trigger multiple autonomous build checks (next building should be farm_plot / woodshop, NOT another house)
  world.autoBuildTimer = 0;
  for (let i = 0; i < 400; i++) {
    stepSimulation(world, 0.05, [], false);
  }

  const housingCount = world.buildings.filter(
    (b) => b.islandId === 'cradle' && (b.type === 'lean_to' || b.type === 'cottage'),
  ).length;
  assert.equal(housingCount, 1, 'Village of 2 with 2 beds must NOT build a second house');
});
