import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_KNOWLEDGE_DOMAIN_IDS,
  advanceKnowledge,
  createKnowledgeProfile,
  getKnowledgeLevel,
  shareKnowledgeWithPeer,
} from './knowledge';
import { canExecuteVillagerAction, evaluateVillagerDecision } from './npcBrain';
import { buildNpcPersonality, recordNpcMemory } from './personality';
import { createInitialWorld, normalizeWorldState } from './simulation';

test('personality axes derive deterministically from traits without breaking bounds', () => {
  const scout = buildNpcPersonality('p_1', ['curious_scout', 'swift_footed'], 0.85, 0.55);
  const homebody = buildNpcPersonality('p_1', ['cautious_homebody', 'stubborn'], 0.4, 0.45);

  assert.ok(scout.curiosity > homebody.curiosity, 'curious_scout should exceed cautious_homebody curiosity');
  assert.ok(homebody.caution > scout.caution, 'cautious_homebody should have higher caution');
  assert.ok(homebody.stubbornness > scout.stubbornness, 'stubborn trait should raise stubbornness');
  assert.ok(scout.archetype.length > 0);
});

test('bounded memory stream caps at 24 entries and retains high-importance events', () => {
  const world = createInitialWorld('whisper_solo');
  const adam = world.villagers[0];
  adam.memories = [];

  recordNpcMemory(adam, {
    day: 1,
    timeOfDay: 0.3,
    kind: 'discovery',
    summary: 'Critical first spark discovery',
    importance: 10,
    sentiment: 'positive',
  });

  for (let i = 0; i < 30; i++) {
    recordNpcMemory(adam, {
      day: 2 + Math.floor(i / 5),
      timeOfDay: 0.2 + (i % 5) * 0.1,
      kind: 'work',
      summary: `Routine haul #${i}`,
      importance: 2,
      sentiment: 'neutral',
    });
  }

  assert.equal(adam.memories!.length, 24);
  assert.ok(
    adam.memories!.some((m) => m.summary === 'Critical first spark discovery'),
    'High-importance memory should be retained across bounding trim',
  );
});

test('awakening founders start near 0 across 10 knowledge domains and learn authentically', () => {
  const world = createInitialWorld('whisper_solo');
  const [adam, eve] = world.villagers;

  assert.equal(ALL_KNOWLEDGE_DOMAIN_IDS.length, 10);
  for (const dom of ALL_KNOWLEDGE_DOMAIN_IDS) {
    assert.ok(getKnowledgeLevel(adam, dom) <= 3, `Expected awakening domain ${dom} near 0, got ${getKnowledgeLevel(adam, dom)}`);
  }

  const adv = advanceKnowledge(adam, 'foraging', 22);
  assert.ok(adv.next > adv.prev);
  assert.equal(adv.crossedRank, 'Novice');

  // Authentic peer sharing: teacher (adam) > learner (eve) transfers knowledge
  const share = shareKnowledgeWithPeer(adam, eve, 'foraging');
  assert.ok(share !== null && share.gained > 0);
  assert.ok(getKnowledgeLevel(eve, 'foraging') > 2);

  // Cannot conjure knowledge when teacher does not exceed learner
  const emptyShare = shareKnowledgeWithPeer(eve, adam, 'foraging');
  assert.equal(emptyShare, null);
});

test('pre-action validation blocks impossible actions and decision trace records reasons', () => {
  const world = createInitialWorld('whisper_solo');
  const adam = world.villagers[0];
  adam.hunger = 30;
  world.villageResources.cradle.food = 0;
  world.villageResources.cradle.berries = 0;
  world.villageResources.cradle.grain = 0;
  world.villageResources.cradle.meat = 0;
  world.villageResources.cradle.fish = 0;
  world.comforts.bread = 0;
  world.comforts.tea = 0;
  world.comforts.honey = 0;

  const stockCheck = canExecuteVillagerAction(world, adam, 'eat_stockpile');
  assert.equal(stockCheck.valid, false);
  assert.ok(stockCheck.blockedReason?.toLowerCase().includes('empty'));

  const quarryCheck = canExecuteVillagerAction(world, adam, 'task:quarry');
  assert.equal(quarryCheck.valid, false);
  assert.ok(quarryCheck.blockedReason);

  const evalRes = evaluateVillagerDecision(world, adam);
  assert.notEqual(evalRes.selectedAction, 'eat_stockpile');
  assert.equal(evalRes.trace.validated, true);
  assert.ok(evalRes.trace.candidates.length >= 3);
  assert.ok(evalRes.trace.candidates.some((c) => c.action === 'eat_stockpile' && !c.valid));
});

test('decision hysteresis keeps valid ongoing task stable instead of thrashing', () => {
  const world = createInitialWorld('whisper_solo');
  const adam = world.villagers[0];
  adam.cognition = {
    stage: 'experimenting',
    awareness: 50,
    observedConcepts: ['berry_bush', 'stone_boulder', 'embers'],
    socialCount: 2,
    focusObject: null,
  };
  adam.knowledge = createKnowledgeProfile('awakening');
  adam.hunger = 80;
  adam.warmth = 85;
  adam.energy = 85;
  world.villageResources.cradle.berries = 25;
  world.villageResources.cradle.food = 25;
  world.villageResources.cradle.timber = 20;
  adam.decisionTrace = {
    chosenAction: 'task:chop',
    chosenLabel: 'Woodcraft',
    reason: 'Prior choice',
    goal: 'Woodcraft',
    validated: true,
    evaluatedAtDay: 1,
    evaluatedAtTime: 0.4,
    candidates: [],
  };

  const nextEval = evaluateVillagerDecision(world, adam);
  assert.equal(nextEval.selectedAction, 'task:chop');
});

test('normalizeWorldState hydrates legacy v9 villagers with personality, knowledge, and memories', () => {
  const world = createInitialWorld('whisper_solo');
  const legacy = JSON.parse(JSON.stringify(world));
  for (const v of legacy.villagers) {
    delete v.personality;
    delete v.knowledge;
    delete v.memories;
    delete v.decisionTrace;
    delete v.reputation;
  }
  const hydrated = normalizeWorldState(legacy);
  const v0 = hydrated.villagers[0];
  assert.ok(v0.personality && v0.personality.archetype.length > 0);
  assert.ok(v0.knowledge && typeof v0.knowledge.foraging === 'number');
  assert.ok(Array.isArray(v0.memories) && v0.memories.length >= 1);
  assert.ok(v0.decisionTrace && v0.decisionTrace.candidates.length >= 1);
  assert.equal(typeof v0.reputation, 'number');
});
