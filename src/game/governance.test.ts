import test from 'node:test';
import assert from 'node:assert/strict';
import { ISLAND_DEFS } from './catalog';
import {
  evaluateAndResolveDispute,
  getPierApproachPoint,
  getStandingMeta,
  hasActiveCommunityRule,
  recordMisconductIncident,
  recordPositiveContribution,
  spreadIncidentRumor,
  WITNESS_RANGE,
} from './governance';
import { evaluateVillagerDecision } from './npcBrain';
import { createHudSnapshot, createInitialWorld, normalizeWorldState, stepSimulation } from './simulation';
import type { VillagerEntity } from './types';

function makeCitizen(id: string, name: string, x: number, y: number): VillagerEntity {
  const world = createInitialWorld('whisper_solo');
  const v = structuredClone(world.villagers[0]);
  v.id = id;
  v.name = name;
  v.islandId = 'cradle';
  v.homeIslandId = 'cradle';
  v.x = x;
  v.y = y;
  v.targetX = x;
  v.targetY = y;
  v.partnerId = null;
  v.parentIds = null;
  v.childrenIds = [];
  v.relationships = {};
  v.socialRecords = {};
  v.memories = [];
  v.reputation = 15;
  v.offenseCount = 0;
  v.contributionCount = 0;
  v.knownIncidentIds = [];
  v.rumorIncidentIds = [];
  v.banished = false;
  v.cognition = {
    stage: 'reasoning',
    awareness: 70,
    observedConcepts: ['berry_bush', 'spring', 'embers'],
    socialCount: 4,
    focusObject: null,
  };
  return v;
}

test('witnessed-only misconduct: distant villagers remain unaware until told secondhand', () => {
  const world = createInitialWorld('whisper_solo');
  const baseX = ISLAND_DEFS.cradle.centerX;
  const baseY = ISLAND_DEFS.cradle.centerY;

  const perp = makeCitizen('v_perp', 'Bram Sly', baseX, baseY);
  const nearWitness = makeCitizen('v_witness', 'Nora Watch', baseX + 55, baseY + 10);
  const farVillager = makeCitizen('v_far', 'Owen Far', baseX + WITNESS_RANGE + 180, baseY);

  world.villagers = [perp, nearWitness, farVillager];
  world.eventLog = [];

  const inc = recordMisconductIncident(
    world,
    perp,
    'theft',
    1,
    'pilfered berries from the common basket',
    nearWitness,
  );
  assert.ok(inc);

  // Witness observes firsthand and forms memory & lower trust
  assert.ok(inc.witnessIds.includes(nearWitness.id));
  assert.ok(nearWitness.knownIncidentIds?.includes(inc.id));
  assert.ok((nearWitness.relationships[perp.id] ?? 20) < 20);
  assert.ok((nearWitness.memories ?? []).some((m) => m.sentiment === 'negative'));

  // Distant villager is completely unaware initially
  assert.equal(inc.witnessIds.includes(farVillager.id), false);
  assert.equal(farVillager.knownIncidentIds?.includes(inc.id), false);
  assert.equal(farVillager.rumorIncidentIds?.includes(inc.id), false);
  assert.equal(farVillager.relationships[perp.id], undefined);

  // A single minor accusation MUST NOT open banishment or exile anyone
  assert.equal((world.disputes ?? []).length, 0);
  assert.equal(perp.banished, false);

  // Secondhand rumor sharing tells farVillager cautiously (not firsthand witness)
  const rumored = spreadIncidentRumor(world, nearWitness, farVillager);
  assert.equal(rumored?.id, inc.id);
  assert.ok(farVillager.rumorIncidentIds?.includes(inc.id));
  assert.equal(farVillager.knownIncidentIds?.includes(inc.id), false);
  assert.ok((farVillager.memories ?? []).some((m) => m.summary.includes('Heard secondhand')));
});

test('personal bonds & empathy allow non-unanimous council votes to reconcile instead of banishing', () => {
  const world = createInitialWorld('whisper_solo');
  const cx = ISLAND_DEFS.cradle.centerX;
  const cy = ISLAND_DEFS.cradle.centerY;

  const perp = makeCitizen('v_accused', 'Milo Reed', cx, cy);
  perp.personality = {
    curiosity: 0.5,
    bravery: 0.4,
    sociability: 0.6,
    industriousness: 0.5,
    discipline: 0.5,
    empathy: 0.6,
    greed: 0.5,
    stubbornness: 0.3,
    honesty: 0.78, // Remorseful / honest
    caution: 0.5,
    archetype: 'Candid Folk',
  };
  const accuser = makeCitizen('v_accuser', 'Kael Strict', cx + 30, cy);
  accuser.personality = {
    curiosity: 0.4,
    bravery: 0.6,
    sociability: 0.5,
    industriousness: 0.7,
    discipline: 0.9,
    empathy: 0.2,
    greed: 0.2,
    stubbornness: 0.7,
    honesty: 0.8,
    caution: 0.4,
    archetype: 'Strict Warden',
  };
  const friendDefender = makeCitizen('v_friend', 'Lyra Kind', cx + 40, cy + 20);
  friendDefender.personality = {
    curiosity: 0.5,
    bravery: 0.5,
    sociability: 0.8,
    industriousness: 0.5,
    discipline: 0.3,
    empathy: 0.9,
    greed: 0.1,
    stubbornness: 0.2,
    honesty: 0.7,
    caution: 0.5,
    archetype: 'Warm Heart',
  };
  friendDefender.relationships[perp.id] = 72; // Close friend defends accused!
  const distantNeutral = makeCitizen('v_distant', 'Bram Quiet', cx + 260, cy);
  distantNeutral.personality = {
    curiosity: 0.5,
    bravery: 0.4,
    sociability: 0.4,
    industriousness: 0.6,
    discipline: 0.4,
    empathy: 0.8,
    greed: 0.2,
    stubbornness: 0.3,
    honesty: 0.6,
    caution: 0.7,
    archetype: 'Cautious Sage',
  };

  world.villagers = [perp, accuser, friendDefender, distantNeutral];

  recordMisconductIncident(world, perp, 'hoarding', 1, 'kept extra grain aside', accuser);
  recordMisconductIncident(world, perp, 'hoarding', 1, 'held onto spare firewood', accuser);

  const disp = world.disputes?.[0];
  assert.ok(disp, 'expected council dispute after repeated incidents');
  const resolved = evaluateAndResolveDispute(world, disp);

  assert.notEqual(resolved.status, 'banished');
  assert.equal(perp.banished, false);
  assert.ok(resolved.votes.some((v) => v.voterId === friendDefender.id && v.decision === 'defend'));
  assert.ok(resolved.votesAgainstBanish >= resolved.votesForBanish);
});

test('Scenario I: repeated theft emerges community rule, passes banishment vote, and villager physically sails away', () => {
  const world = createInitialWorld('whisper_solo');
  const cx = ISLAND_DEFS.cradle.centerX;
  const cy = ISLAND_DEFS.cradle.centerY;

  const thief = makeCitizen('v_thief', 'Sable Thorn', cx, cy);
  thief.personality = {
    curiosity: 0.5,
    bravery: 0.4,
    sociability: 0.3,
    industriousness: 0.2,
    discipline: 0.2,
    empathy: 0.2,
    greed: 0.92,
    stubbornness: 0.85,
    honesty: 0.15,
    caution: 0.3,
    archetype: 'Covetous Rogue',
  };
  const strictProfile = {
    curiosity: 0.4,
    bravery: 0.6,
    sociability: 0.5,
    industriousness: 0.7,
    discipline: 0.92,
    empathy: 0.18,
    greed: 0.2,
    stubbornness: 0.6,
    honesty: 0.85,
    caution: 0.4,
    archetype: 'Warden',
  };

  const chief = makeCitizen('v_chief', 'Alden Chief', cx + 32, cy + 12);
  chief.isChief = true;
  chief.personality = { ...strictProfile };
  world.chiefId = chief.id;

  const witness2 = makeCitizen('v_wit2', 'Tamsin Stone', cx - 35, cy + 15);
  witness2.personality = { ...strictProfile };

  const witness3 = makeCitizen('v_wit3', 'Corin Oak', cx + 24, cy - 28);
  witness3.personality = { ...strictProfile };

  world.villagers = [thief, chief, witness2, witness3];
  world.eventLog = [];

  // Positive deed raises standing cleanly
  recordPositiveContribution(world, chief, 'build', witness2, 22);
  assert.equal(getStandingMeta(chief.reputation ?? 0).label, 'Respected');

  // Repeated witnessed thefts
  recordMisconductIncident(world, thief, 'theft', 2, 'stole smoked fish from the village storehouse', witness2);
  recordMisconductIncident(world, thief, 'theft', 2, 'raided stored bread and timber', witness3);

  assert.equal(hasActiveCommunityRule(world, 'cradle', 'no_theft'), true, 'no_theft rule should emerge');
  assert.ok((world.disputes ?? []).length >= 1, 'council dispute should open');
  assert.ok((thief.reputation ?? 15) < 0);

  // Step simulation forward until council deliberates & resolves to banish
  for (let i = 0; i < 240; i++) {
    stepSimulation(world, 0.05, [], false);
    if (thief.banished) break;
  }

  assert.equal(thief.banished, true, 'council should vote to banish repeat offender');
  assert.equal(world.disputes?.[0]?.status, 'banished');
  assert.ok((world.eventLog ?? []).some((e) => e.category === 'rule' && e.summary.includes('banish')));
  assert.ok((chief.memories ?? []).some((m) => m.kind === 'rule' && m.summary.includes('banishing')));

  // Banished villager decision trace locks onto walking to pier (not normal work)
  const dec = evaluateVillagerDecision(world, thief);
  const pier = getPierApproachPoint('cradle');
  assert.equal(dec.selectedAction, 'depart_banished');
  assert.equal(dec.targetX, pier.x);
  assert.equal(dec.targetY, pier.y);

  // Step simulation so thief walks to pier, boards exile skiff, and sails out to sea
  let sawExileSkiff = false;
  for (let i = 0; i < 1200; i++) {
    stepSimulation(world, 0.05, [], false);
    if (world.boats.some((b) => b.kind === 'migrant_skiff' && b.passengerIds.includes(thief.id))) {
      sawExileSkiff = true;
    }
    if (!world.villagers.some((v) => v.id === thief.id)) break;
  }

  assert.equal(sawExileSkiff, true, 'banished villager must physically board departing skiff');
  assert.equal(
    world.villagers.some((v) => v.id === thief.id),
    false,
    'banished villager departs world.villagers after skiff sails away',
  );
  assert.equal(world.departedCount, 1);

  // HUD snapshot and legacy save normalization expose governance fields cleanly
  const hud = createHudSnapshot(world);
  assert.ok((hud.communityRules ?? []).length >= 1);
  assert.ok((hud.disputes ?? []).length >= 1);

  const normalized = normalizeWorldState(world);
  assert.ok(Array.isArray(normalized.communityRules));
  assert.ok(Array.isArray(normalized.disputes));
});
