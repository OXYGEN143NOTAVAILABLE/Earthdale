import { getNpcPersonality } from './personality';
import type { KnowledgeDomainId, LifeStage, VillagerEntity } from './types';

export interface KnowledgeDomainMeta {
  id: KnowledgeDomainId;
  label: string;
  shortLabel: string;
  color: string;
  summary: string;
}

export const KNOWLEDGE_DOMAINS: KnowledgeDomainMeta[] = [
  { id: 'foraging', label: 'Foraging & Flora', shortLabel: 'Foraging', color: '#8CE0AC', summary: 'Identifying edible berries, herbs, and seasonal crops.' },
  { id: 'woodcraft', label: 'Woodcraft', shortLabel: 'Wood', color: '#B5895A', summary: 'Gathering kindling, felling timber, and shaping poles.' },
  { id: 'stonecraft', label: 'Stonecraft', shortLabel: 'Stone', color: '#A8B5C4', summary: 'Knapping flint, breaking boulders, and quarrying rock.' },
  { id: 'firecraft', label: 'Firecraft', shortLabel: 'Fire', color: '#F59E0B', summary: 'Striking sparks, tending hearths, and sustaining warmth.' },
  { id: 'toolmaking', label: 'Toolmaking', shortLabel: 'Tools', color: '#E5AF47', summary: 'Shaping flint spears, bows, and forged metal gear.' },
  { id: 'construction', label: 'Construction', shortLabel: 'Build', color: '#D98A6C', summary: 'Staking shelters, framing roofs, and raising masonry.' },
  { id: 'cooking', label: 'Cooking & Baking', shortLabel: 'Cooking', color: '#FDE68A', summary: 'Turning grain, meat, and herbs into nourishing meals.' },
  { id: 'healing', label: 'Healing & Herbs', shortLabel: 'Healing', color: '#65B386', summary: 'Clotting wounds, steeping teas, and tending injuries.' },
  { id: 'social_customs', label: 'Social Customs', shortLabel: 'Customs', color: '#F472B6', summary: 'Shared rituals, diplomacy, fairness, and cooperation.' },
  { id: 'sailing', label: 'Seamanship & Sky', shortLabel: 'Sailing', color: '#7CC6FE', summary: 'Navigating sky-seas, fishing, gliders, and island routes.' },
];

export const ALL_KNOWLEDGE_DOMAIN_IDS: KnowledgeDomainId[] = KNOWLEDGE_DOMAINS.map((d) => d.id);

export function createKnowledgeProfile(
  mode: 'awakening' | 'infant' | 'child' | 'native' | 'veteran' | 'legacy',
): Record<KnowledgeDomainId, number> {
  const base =
    mode === 'infant'
      ? 0
      : mode === 'awakening'
        ? 1.5
        : mode === 'child'
          ? 8
          : mode === 'native'
            ? 38
            : mode === 'veteran'
              ? 44
              : 42;

  return {
    foraging: base,
    woodcraft: base,
    stonecraft: base,
    firecraft: mode === 'awakening' ? 2 : base,
    toolmaking: mode === 'awakening' ? 0 : base * 0.85,
    construction: mode === 'awakening' ? 0 : base * 0.9,
    cooking: mode === 'awakening' ? 0 : base * 0.8,
    healing: mode === 'awakening' ? 0 : base * 0.75,
    social_customs: mode === 'awakening' ? 2 : base * 0.95,
    sailing: mode === 'awakening' ? 0 : base * 0.7,
  };
}

export function ensureVillagerKnowledge(v: VillagerEntity, legacyFallback = false): Record<KnowledgeDomainId, number> {
  if (!v.knowledge) {
    const stage: LifeStage = v.lifeStage ?? 'adult';
    if (stage === 'infant') {
      v.knowledge = createKnowledgeProfile('infant');
    } else if (v.isNativeClan || v.isStranger) {
      v.knowledge = createKnowledgeProfile('native');
    } else if (legacyFallback || (v.cognition?.awareness ?? 0) >= 35) {
      v.knowledge = createKnowledgeProfile('legacy');
    } else {
      v.knowledge = createKnowledgeProfile('awakening');
    }
  }
  return v.knowledge;
}

export function getKnowledgeLevel(v: VillagerEntity, domain: KnowledgeDomainId): number {
  const k = ensureVillagerKnowledge(v);
  return Math.max(0, Math.min(100, k[domain] ?? 0));
}

export function getAverageKnowledge(v: VillagerEntity): number {
  const k = ensureVillagerKnowledge(v);
  let total = 0;
  for (const id of ALL_KNOWLEDGE_DOMAIN_IDS) {
    total += k[id] ?? 0;
  }
  return total / ALL_KNOWLEDGE_DOMAIN_IDS.length;
}

export function getKnowledgeRankLabel(score: number): string {
  if (score >= 80) return 'Master';
  if (score >= 55) return 'Adept';
  if (score >= 30) return 'Apprentice';
  if (score >= 10) return 'Novice';
  return 'Untaught';
}

export function advanceKnowledge(
  v: VillagerEntity,
  domain: KnowledgeDomainId,
  rawDelta: number,
): { prev: number; next: number; crossedRank: string | null } {
  const k = ensureVillagerKnowledge(v);
  const prev = k[domain] ?? 0;
  const p = getNpcPersonality(v);
  const intFactor = 0.8 + ((v.stats?.intellect ?? 9) - 8) * 0.04;
  const curiosityFactor = 0.8 + p.curiosity * 0.45;
  const delta = Math.max(0, rawDelta * intFactor * curiosityFactor);
  const next = Math.min(100, Number((prev + delta).toFixed(2)));
  k[domain] = next;

  const prevRank = getKnowledgeRankLabel(prev);
  const nextRank = getKnowledgeRankLabel(next);
  return {
    prev,
    next,
    crossedRank: prevRank !== nextRank ? nextRank : null,
  };
}

/**
 * Transfers domain knowledge authentically from an experienced teacher to a peer
 * without global telepathy (only happens when teacher > learner).
 */
export function shareKnowledgeWithPeer(
  teacher: VillagerEntity,
  learner: VillagerEntity,
  domain?: KnowledgeDomainId,
): { domain: KnowledgeDomainId; gained: number } | null {
  const tk = ensureVillagerKnowledge(teacher);
  const lk = ensureVillagerKnowledge(learner);

  let chosenDomain: KnowledgeDomainId | undefined = domain;
  if (!chosenDomain) {
    let bestGap = 3;
    for (const id of ALL_KNOWLEDGE_DOMAIN_IDS) {
      const gap = (tk[id] ?? 0) - (lk[id] ?? 0);
      if (gap > bestGap) {
        bestGap = gap;
        chosenDomain = id;
      }
    }
  }
  if (!chosenDomain) return null;

  const gap = (tk[chosenDomain] ?? 0) - (lk[chosenDomain] ?? 0);
  if (gap <= 1.5) return null;

  const res = advanceKnowledge(learner, chosenDomain, Math.min(4.5, gap * 0.22));
  return {
    domain: chosenDomain,
    gained: Number((res.next - res.prev).toFixed(2)),
  };
}
