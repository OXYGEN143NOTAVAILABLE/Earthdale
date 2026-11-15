import { ISLAND_DEFS, getSocialTier } from './catalog';
import { emitWorldEvent } from './eventBus';
import { advanceKnowledge, shareKnowledgeWithPeer } from './knowledge';
import { getNpcPersonality, recordNpcMemory } from './personality';
import type {
  IslandId,
  SocialRelationshipRecord,
  SocialTier,
  VillagerEntity,
  WorldState,
} from './types';

const STAGE_ORDER: Record<SocialTier, number> = {
  rival: 0,
  stranger: 1,
  acquaintance: 2,
  guest: 3,
  friend: 4,
  confidant: 5,
  bonded: 6,
};

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
}

export function getDefaultRelScore(a: VillagerEntity, b: VillagerEntity): number {
  if (a.partnerId === b.id || b.partnerId === a.id) return 72;
  if (
    (a.parentIds && a.parentIds.includes(b.id)) ||
    (b.parentIds && b.parentIds.includes(a.id)) ||
    a.childrenIds.includes(b.id) ||
    b.childrenIds.includes(a.id)
  ) {
    return 64;
  }
  if (a.isStranger || b.isStranger) return 14;
  return 20;
}

export function ensureSocialRecord(
  world: WorldState,
  a: VillagerEntity,
  b: VillagerEntity,
): SocialRelationshipRecord {
  if (!a.socialRecords) a.socialRecords = {};
  if (!a.relationships) a.relationships = {};

  const existing = a.socialRecords[b.id];
  if (existing) {
    // Keep legacy scalar score in sync
    a.relationships[b.id] = Math.round(existing.score);
    return existing;
  }

  const rawScore =
    typeof a.relationships[b.id] === 'number'
      ? a.relationships[b.id]
      : getDefaultRelScore(a, b);
  const score = clampScore(rawScore);
  const tier = getSocialTier(score).id;
  const rec: SocialRelationshipRecord = {
    score,
    stage: tier,
    introduced: score >= 28 || a.partnerId === b.id || (a.parentIds?.includes(b.id) ?? false),
    conversations: score >= 45 ? 2 : score >= 28 ? 1 : 0,
    positiveEvents: score >= 45 ? 1 : 0,
    negativeEvents: score < 15 ? 1 : 0,
    lastDay: world.environment?.dayCount ?? 1,
  };
  a.socialRecords[b.id] = rec;
  a.relationships[b.id] = Math.round(score);
  return rec;
}

export function applySocialScoreChange(
  world: WorldState,
  a: VillagerEntity,
  b: VillagerEntity,
  delta: number,
  interactionKind: SocialRelationshipRecord['lastInteractionKind'],
  options: { markIntroduced?: boolean; countConversation?: boolean } = {},
): { prevStage: SocialTier; nextStage: SocialTier; record: SocialRelationshipRecord } {
  const rec = ensureSocialRecord(world, a, b);
  const prevStage = rec.stage;
  if (options.markIntroduced) rec.introduced = true;
  if (options.countConversation) rec.conversations += 1;
  if (delta > 0) rec.positiveEvents += 1;
  else if (delta < 0) rec.negativeEvents += 1;

  rec.score = clampScore(rec.score + delta);
  rec.stage = getSocialTier(rec.score).id;
  rec.lastDay = world.environment?.dayCount ?? 1;
  rec.lastInteractionKind = interactionKind;
  a.relationships[b.id] = Math.round(rec.score);

  return { prevStage, nextStage: rec.stage, record: rec };
}

function stageMilestoneText(aFirst: string, bFirst: string, stage: SocialTier, islandName: string): string {
  switch (stage) {
    case 'acquaintance':
      return `${aFirst} and ${bFirst} grew familiar as acquaintances on ${islandName}.`;
    case 'guest':
      return `${aFirst} and ${bFirst} began welcoming each other as trusted guests on ${islandName}.`;
    case 'friend':
      return `${aFirst} and ${bFirst} became true friends on ${islandName}.`;
    case 'confidant':
      return `${aFirst} and ${bFirst} became close confidants on ${islandName}.`;
    case 'bonded':
      return `${aFirst} and ${bFirst} forged a deep lifelong bond on ${islandName}.`;
    case 'rival':
      return `${aFirst} and ${bFirst} fell into bitter rivalry on ${islandName}.`;
    default:
      return `${aFirst} and ${bFirst} met on ${islandName}.`;
  }
}

function emitStageTransitionIfChanged(
  world: WorldState,
  a: VillagerEntity,
  b: VillagerEntity,
  prevStage: SocialTier,
  nextStage: SocialTier,
  islandId: IslandId,
): boolean {
  if (prevStage === nextStage) return false;
  const improved = STAGE_ORDER[nextStage] > STAGE_ORDER[prevStage];
  const fellToRival = nextStage === 'rival';
  if (!improved && !fellToRival) return false;

  const aFirst = a.name.split(' ')[0];
  const bFirst = b.name.split(' ')[0];
  const islandName = ISLAND_DEFS[islandId]?.name ?? 'Hearthglen';
  const summary = stageMilestoneText(aFirst, bFirst, nextStage, islandName);

  emitWorldEvent(world, {
    category: 'social',
    significance: nextStage === 'friend' || nextStage === 'confidant' || nextStage === 'bonded' || fellToRival ? 'notable' : 'minor',
    summary,
    islandId,
    participantIds: [a.id, b.id],
  });

  const sentiment = fellToRival ? 'negative' : 'positive';
  const importance = nextStage === 'friend' || nextStage === 'confidant' || nextStage === 'bonded' || fellToRival ? 7 : 6;
  recordNpcMemory(a, {
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    kind: fellToRival ? 'conflict' : 'social',
    summary: `Became ${getSocialTier(a.relationships[b.id] ?? 20).label.toLowerCase()} with ${bFirst}.`,
    actorIds: [b.id],
    importance,
    sentiment,
  });
  recordNpcMemory(b, {
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    kind: fellToRival ? 'conflict' : 'social',
    summary: `Became ${getSocialTier(b.relationships[a.id] ?? 20).label.toLowerCase()} with ${aFirst}.`,
    actorIds: [a.id],
    importance,
    sentiment,
  });
  return true;
}

export interface SocialEncounterResult {
  kind: 'introduction' | 'conversation' | 'quarrel';
  stageChanged: boolean;
  newStage: SocialTier;
  sharedDomain: string | null;
  sharedConcept: string | null;
}

export function processSocialEncounter(
  world: WorldState,
  a: VillagerEntity,
  b: VillagerEntity,
  onLearnConcept?: (villager: VillagerEntity, concept: string, peerFirstName?: string) => void,
): SocialEncounterResult {
  a.socialCooldown = 42 + Math.random() * 22;
  if (!a.pairChatCooldowns) a.pairChatCooldowns = {};
  if (!b.pairChatCooldowns) b.pairChatCooldowns = {};
  a.pairChatCooldowns[b.id] = 75;
  b.pairChatCooldowns[a.id] = 75;

  a.cognition.socialCount += 1;
  b.cognition.socialCount += 1;

  const recAB = ensureSocialRecord(world, a, b);
  const recBA = ensureSocialRecord(world, b, a);
  const pA = getNpcPersonality(a);
  const pB = getNpcPersonality(b);

  const aFirst = a.name.split(' ')[0];
  const bFirst = b.name.split(' ')[0];
  const islandId = a.islandId;
  const islandName = ISLAND_DEFS[islandId]?.name ?? 'Hearthglen';

  // Stage 1: Formal Stranger Introduction before deeper camaraderie
  if (!recAB.introduced || !recBA.introduced) {
    const warmthBonus = Math.round(((pA.sociability + pB.sociability + pA.empathy + pB.empathy) * 0.65));
    const introGain = Math.max(3, Math.min(6, 3 + warmthBonus));
    const resAB = applySocialScoreChange(world, a, b, introGain, 'greeting', {
      markIntroduced: true,
      countConversation: true,
    });
    applySocialScoreChange(world, b, a, introGain, 'greeting', {
      markIntroduced: true,
      countConversation: true,
    });

    advanceKnowledge(a, 'social_customs', 1.2);
    advanceKnowledge(b, 'social_customs', 1.2);

    if (!a.thoughtBubble) {
      a.thoughtBubble = `Hello, ${bFirst}!`;
      a.thoughtTimer = 2.4;
    }
    if (!b.thoughtBubble) {
      b.thoughtBubble = `Nice to meet you, ${aFirst}!`;
      b.thoughtTimer = 2.4;
    }

    recordNpcMemory(a, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: 'social',
      summary: `Introduced myself to ${bFirst} on ${islandName}.`,
      actorIds: [b.id],
      importance: 6,
      sentiment: 'positive',
    });
    recordNpcMemory(b, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: 'social',
      summary: `Introduced myself to ${aFirst} on ${islandName}.`,
      actorIds: [a.id],
      importance: 6,
      sentiment: 'positive',
    });

    emitWorldEvent(world, {
      category: 'social',
      significance: 'minor',
      summary: `${aFirst} and ${bFirst} introduced themselves on ${islandName}.`,
      islandId,
      participantIds: [a.id, b.id],
    });

    const stageChanged = emitStageTransitionIfChanged(world, a, b, resAB.prevStage, resAB.nextStage, islandId);
    return {
      kind: 'introduction',
      stageChanged,
      newStage: resAB.nextStage,
      sharedDomain: null,
      sharedConcept: null,
    };
  }

  // Stage 2: Subsequent conversation weighted by personality & mood
  const avgMood = (a.mood + b.mood) * 0.5;
  const empathyWarmth = (pA.empathy + pB.empathy + pA.honesty + pB.honesty) * 0.25;
  const frictionRisk =
    (pA.stubbornness + pB.stubbornness) * 0.35 +
    (pA.greed + pB.greed) * 0.2 -
    empathyWarmth +
    (avgMood < 32 ? 0.35 : 0) +
    (a.isStranger || b.isStranger ? 0.25 : 0);

  if (frictionRisk > 0.58 && (avgMood < 48 || a.isStranger || b.isStranger)) {
    const drop = -4;
    const resAB = applySocialScoreChange(world, a, b, drop, 'quarrel', { countConversation: true });
    applySocialScoreChange(world, b, a, drop, 'quarrel', { countConversation: true });

    if (!a.thoughtBubble) {
      a.thoughtBubble = 'Tense words...';
      a.thoughtTimer = 2.4;
    }
    recordNpcMemory(a, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: 'conflict',
      summary: `Had a tense disagreement with ${bFirst}.`,
      actorIds: [b.id],
      importance: 6,
      sentiment: 'negative',
    });
    recordNpcMemory(b, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: 'conflict',
      summary: `Clashed briefly with ${aFirst}.`,
      actorIds: [a.id],
      importance: 6,
      sentiment: 'negative',
    });
    emitWorldEvent(world, {
      category: 'social',
      significance: 'minor',
      summary: `${aFirst} and ${bFirst} exchanged sharp words on ${islandName}.`,
      islandId,
      participantIds: [a.id, b.id],
    });
    const stageChanged = emitStageTransitionIfChanged(world, a, b, resAB.prevStage, resAB.nextStage, islandId);
    return {
      kind: 'quarrel',
      stageChanged,
      newStage: resAB.nextStage,
      sharedDomain: null,
      sharedConcept: null,
    };
  }

  // Constructive dialogue + peer knowledge & concept sharing
  const affinityBoost = Math.max(3, Math.min(6, Math.round(3 + empathyWarmth * 2.5 + (avgMood >= 70 ? 1 : 0))));
  const resAB = applySocialScoreChange(world, a, b, affinityBoost, 'chat', { countConversation: true });
  applySocialScoreChange(world, b, a, affinityBoost, 'chat', { countConversation: true });

  advanceKnowledge(a, 'social_customs', 1.4);
  advanceKnowledge(b, 'social_customs', 1.4);

  const shared = shareKnowledgeWithPeer(a, b) ?? shareKnowledgeWithPeer(b, a);
  const novel = a.cognition.observedConcepts.find((c) => !b.cognition.observedConcepts.includes(c)) ?? null;
  if (novel && onLearnConcept) {
    onLearnConcept(b, novel, aFirst);
  } else if (!a.thoughtBubble) {
    a.thoughtBubble = shared ? `Shared ${shared.domain}!` : 'Good talk!';
    a.thoughtTimer = 2.4;
  }

  recordNpcMemory(a, {
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    kind: 'social',
    summary: shared
      ? `Shared ${shared.domain} craft with ${bFirst}.`
      : `Exchanged ideas with ${bFirst}.`,
    actorIds: [b.id],
    importance: 5,
    sentiment: 'positive',
  });
  recordNpcMemory(b, {
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    kind: 'social',
    summary: shared
      ? `Learned ${shared.domain} insights from ${aFirst}.`
      : `Spoke warmly with ${aFirst}.`,
    actorIds: [a.id],
    importance: 5,
    sentiment: 'positive',
  });

  const stageChanged = emitStageTransitionIfChanged(world, a, b, resAB.prevStage, resAB.nextStage, islandId);
  return {
    kind: 'conversation',
    stageChanged,
    newStage: resAB.nextStage,
    sharedDomain: shared ? shared.domain : null,
    sharedConcept: novel,
  };
}

export function processBonfireSocialCircle(
  world: WorldState,
  islandId: IslandId,
  gathered: VillagerEntity[],
) {
  if (gathered.length < 2) return;
  for (let i = 0; i < gathered.length; i++) {
    const a = gathered[i];
    for (let j = i + 1; j < gathered.length; j++) {
      const b = gathered[j];
      const rec = ensureSocialRecord(world, a, b);
      const delta = rec.introduced ? 4 : 5;
      const resAB = applySocialScoreChange(world, a, b, delta, 'ritual', {
        markIntroduced: true,
        countConversation: true,
      });
      applySocialScoreChange(world, b, a, delta, 'ritual', {
        markIntroduced: true,
        countConversation: true,
      });
      emitStageTransitionIfChanged(world, a, b, resAB.prevStage, resAB.nextStage, islandId);
    }
  }
  const islandName = ISLAND_DEFS[islandId]?.name ?? 'Hearthglen';
  emitWorldEvent(world, {
    category: 'social',
    significance: 'minor',
    summary: `${gathered.length} villagers gathered around the evening bonfire on ${islandName}.`,
    islandId,
    participantIds: gathered.map((m) => m.id),
  });
}

export function processDirectSocialShift(
  world: WorldState,
  a: VillagerEntity,
  b: VillagerEntity,
  delta: number,
  kind: SocialRelationshipRecord['lastInteractionKind'],
  eventSummary?: string,
) {
  const resAB = applySocialScoreChange(world, a, b, delta, kind, {
    markIntroduced: delta >= 0,
    countConversation: kind === 'hangout' || kind === 'parley' || kind === 'chat',
  });
  applySocialScoreChange(world, b, a, delta, kind, {
    markIntroduced: delta >= 0,
    countConversation: kind === 'hangout' || kind === 'parley' || kind === 'chat',
  });

  if (eventSummary) {
    emitWorldEvent(world, {
      category: 'social',
      significance: 'minor',
      summary: eventSummary,
      islandId: a.islandId,
      participantIds: [a.id, b.id],
    });
  }
  emitStageTransitionIfChanged(world, a, b, resAB.prevStage, resAB.nextStage, a.islandId);
}
