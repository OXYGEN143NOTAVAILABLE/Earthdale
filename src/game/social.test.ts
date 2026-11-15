import test from 'node:test';
import assert from 'node:assert/strict';
import { emitWorldEvent, MAX_WORLD_EVENTS, queryWorldEvents } from './eventBus';
import {
  ensureSocialRecord,
  processBonfireSocialCircle,
  processSocialEncounter,
} from './social';
import {
  createHudSnapshot,
  createInitialWorld,
  normalizeWorldState,
} from './simulation';
import type { VillagerEntity } from './types';

function makeDummyVillager(id: string, name: string): VillagerEntity {
  const world = createInitialWorld('whisper_solo');
  const template = structuredClone(world.villagers[0]);
  template.id = id;
  template.name = name;
  template.partnerId = null;
  template.parentIds = null;
  template.childrenIds = [];
  template.relationships = {};
  template.socialRecords = {};
  template.memories = [];
  template.cognition = {
    stage: 'observing',
    awareness: 24,
    observedConcepts: ['berry_bush'],
    socialCount: 0,
    focusObject: null,
  };
  return template;
}

test('eventBus emits, deduplicates within window, bounds at 200, and queries cleanly', () => {
  const world = createInitialWorld('whisper_solo');
  world.eventLog = [];

  const ev1 = emitWorldEvent(world, {
    category: 'social',
    significance: 'minor',
    summary: 'Adam and Eve spoke by the spring.',
    islandId: 'cradle',
    participantIds: ['founder_adam', 'founder_eve'],
  });
  assert.ok(ev1);

  // Duplicate summary on same day & island within dedupe window is suppressed
  const dup = emitWorldEvent(world, {
    category: 'social',
    significance: 'minor',
    summary: 'Adam and Eve spoke by the spring.',
    islandId: 'cradle',
    participantIds: ['founder_adam', 'founder_eve'],
  });
  assert.equal(dup, null);

  // Different summary passes and evicts oldest beyond MAX_WORLD_EVENTS
  for (let i = 0; i < MAX_WORLD_EVENTS + 15; i++) {
    emitWorldEvent(world, {
      category: i % 2 === 0 ? 'economy' : 'construction',
      significance: i % 5 === 0 ? 'notable' : 'minor',
      summary: `Event #${i}`,
      islandId: 'cradle',
      participantIds: i === MAX_WORLD_EVENTS ? ['founder_adam'] : [],
    });
  }

  assert.equal(world.eventLog.length, MAX_WORLD_EVENTS);
  assert.equal(
    world.eventLog.some((e) => e.summary === 'Event #5'),
    false,
    'expected oldest events beyond cap to be evicted',
  );
  const adamEvents = queryWorldEvents(world.eventLog, { participantId: 'founder_adam' });
  assert.ok(adamEvents.some((e) => e.summary === `Event #${MAX_WORLD_EVENTS}`));
  const econEvents = queryWorldEvents(world.eventLog, { category: 'economy' });
  assert.ok(econEvents.length > 0);
  assert.ok(econEvents.every((e) => e.category === 'economy'));
});

test('non-partner strangers introduce first and progress through social stages gradually', () => {
  const world = createInitialWorld('whisper_solo');
  world.eventLog = [];
  const a = makeDummyVillager('npc_a', 'Rowan Flint');
  const b = makeDummyVillager('npc_b', 'Lyra Moss');
  a.mood = 82;
  b.mood = 84;
  world.villagers.push(a, b);

  const initRec = ensureSocialRecord(world, a, b);
  assert.equal(initRec.stage, 'stranger');
  assert.equal(initRec.introduced, false);
  assert.equal(initRec.score, 20);

  // First encounter must be an introduction, NOT jumping straight to friend
  const intro = processSocialEncounter(world, a, b);
  assert.equal(intro.kind, 'introduction');
  assert.equal(a.socialRecords?.[b.id]?.introduced, true);
  assert.equal(b.socialRecords?.[a.id]?.introduced, true);
  assert.notEqual(intro.newStage, 'friend');
  assert.ok(world.eventLog.some((e) => e.category === 'social' && e.summary.includes('introduced')));

  // Subsequent conversations advance through acquaintance -> guest -> friend
  const seenStages = new Set<string>([intro.newStage]);
  for (let i = 0; i < 16; i++) {
    // Advance clock slightly so same-day dedupe doesn't merge separate milestone events
    world.environment.timeOfDay = (world.environment.timeOfDay + 0.05) % 1;
    if (world.environment.timeOfDay < 0.05) world.environment.dayCount += 1;
    const res = processSocialEncounter(world, a, b);
    assert.equal(res.kind, 'conversation');
    seenStages.add(res.newStage);
  }

  assert.ok(seenStages.has('acquaintance'), 'expected acquaintance intermediate stage');
  assert.ok(seenStages.has('guest'), 'expected guest intermediate stage');
  assert.ok(seenStages.has('friend') || seenStages.has('confidant') || seenStages.has('bonded'));
  assert.ok((a.socialRecords?.[b.id]?.conversations ?? 0) >= 15);
  assert.ok(world.eventLog.some((e) => e.summary.includes('true friends')));
});

test('low mood + clash personalities can produce a social quarrel with negative memory', () => {
  const world = createInitialWorld('whisper_solo');
  world.eventLog = [];
  const a = makeDummyVillager('npc_q1', 'Thorn Grudge');
  const b = makeDummyVillager('npc_q2', 'Vex Ash');
  a.mood = 18;
  b.mood = 20;
  a.personality = {
    curiosity: 0.3,
    bravery: 0.5,
    sociability: 0.2,
    industriousness: 0.5,
    discipline: 0.4,
    empathy: 0.1,
    greed: 0.9,
    stubbornness: 0.95,
    honesty: 0.2,
    caution: 0.5,
    archetype: 'Gruff Loner',
  };
  b.personality = { ...a.personality };

  // Introduce first
  a.socialRecords = {
    [b.id]: {
      score: 30,
      stage: 'acquaintance',
      introduced: true,
      conversations: 1,
      positiveEvents: 1,
      negativeEvents: 0,
      lastDay: 1,
    },
  };
  b.socialRecords = {
    [a.id]: {
      score: 30,
      stage: 'acquaintance',
      introduced: true,
      conversations: 1,
      positiveEvents: 1,
      negativeEvents: 0,
      lastDay: 1,
    },
  };
  a.relationships[b.id] = 30;
  b.relationships[a.id] = 30;

  const res = processSocialEncounter(world, a, b);
  assert.equal(res.kind, 'quarrel');
  assert.ok((a.relationships[b.id] ?? 30) < 30);
  assert.ok((a.memories ?? []).some((m) => m.sentiment === 'negative'));
  assert.ok(world.eventLog.some((e) => e.category === 'social' && e.summary.includes('sharp words')));
});

test('bonfire social circle and HUD snapshot expose real eventLog cleanly', () => {
  const world = createInitialWorld('whisper_solo');
  const v3 = makeDummyVillager('npc_c', 'Soren Vale');
  world.villagers.push(v3);

  processBonfireSocialCircle(world, 'cradle', world.villagers);
  assert.ok(
    (world.eventLog ?? []).some((e) => e.category === 'social' && e.summary.includes('evening bonfire')),
  );

  const hud = createHudSnapshot(world);
  assert.ok(Array.isArray(hud.eventLog));
  assert.ok((hud.eventLog?.length ?? 0) >= 2);

  // Legacy save without eventLog normalizes cleanly without throwing
  const legacy = structuredClone(world) as unknown as Record<string, unknown>;
  delete legacy.eventLog;
  const normalized = normalizeWorldState(legacy as unknown as ReturnType<typeof createInitialWorld>);
  assert.ok(Array.isArray(normalized.eventLog));
});
