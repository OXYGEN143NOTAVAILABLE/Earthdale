import type { NpcMemoryEntry, NpcMemoryKind, NpcPersonality, VillagerEntity } from './types';

function clamp01(val: number): number {
  return Math.max(0.05, Math.min(0.98, Number(val.toFixed(2))));
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export const PERSONALITY_AXES: { key: keyof Omit<NpcPersonality, 'archetype'>; label: string; color: string }[] = [
  { key: 'curiosity', label: 'Curiosity', color: '#7CC6FE' },
  { key: 'bravery', label: 'Bravery', color: '#F59E0B' },
  { key: 'sociability', label: 'Sociability', color: '#8CE0AC' },
  { key: 'industriousness', label: 'Industrious', color: '#E5AF47' },
  { key: 'discipline', label: 'Discipline', color: '#A8D8EA' },
  { key: 'empathy', label: 'Empathy', color: '#F472B6' },
  { key: 'caution', label: 'Caution', color: '#9EB1C2' },
  { key: 'honesty', label: 'Honesty', color: '#65B386' },
  { key: 'stubbornness', label: 'Stubborn', color: '#E38589' },
  { key: 'greed', label: 'Greed', color: '#D97706' },
];

export function derivePersonalityArchetype(p: Omit<NpcPersonality, 'archetype'>): string {
  const candidates: { label: string; score: number }[] = [
    { label: 'Pathfinder', score: p.curiosity * 1.15 + p.bravery * 0.45 - p.caution * 0.35 },
    { label: 'Hearthkeeper', score: p.sociability * 0.8 + p.empathy * 0.9 + p.honesty * 0.4 },
    { label: 'Master Builder', score: p.industriousness * 1.05 + p.discipline * 0.75 },
    { label: 'Sentinel', score: p.bravery * 0.95 + p.discipline * 0.65 + p.caution * 0.25 },
    { label: 'Pragmatist', score: p.caution * 0.85 + p.stubbornness * 0.55 + p.industriousness * 0.35 },
    { label: 'Opportunist', score: p.greed * 1.15 + p.stubbornness * 0.4 - p.empathy * 0.3 },
  ];
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.label ?? 'Settler';
}

/**
 * Deterministically derives continuous 10-axis personality from villager traits,
 * base curiosity/bravery, and stable ID seed while preserving all trait modifiers.
 */
export function buildNpcPersonality(
  id: string,
  traits: string[],
  baseCuriosity = 0.55,
  baseBravery = 0.55,
  isStranger = false,
): NpcPersonality {
  const jitter = (salt: string, span = 0.16) => (hashSeed(`${id}:${salt}`) - 0.5) * span;

  let curiosity = baseCuriosity + jitter('cur', 0.14);
  let bravery = baseBravery + jitter('brv', 0.14);
  let sociability = 0.52 + jitter('soc');
  let industriousness = 0.56 + jitter('ind');
  let discipline = 0.52 + jitter('dis');
  let empathy = 0.54 + jitter('emp');
  let greed = (isStranger ? 0.42 : 0.24) + jitter('grd', 0.18);
  let stubbornness = 0.34 + jitter('stb', 0.2);
  let honesty = (isStranger ? 0.48 : 0.72) + jitter('hon', 0.18);
  let caution = 0.46 + jitter('cau');

  for (const tid of traits) {
    if (tid === 'curious_scout') {
      curiosity += 0.24;
      caution -= 0.1;
    } else if (tid === 'brave_hunter') {
      bravery += 0.25;
      caution -= 0.12;
    } else if (tid === 'warmhearted') {
      sociability += 0.26;
      empathy += 0.26;
      honesty += 0.14;
      greed -= 0.12;
    } else if (tid === 'clever_crafter' || tid === 'master_artisan') {
      industriousness += 0.22;
      discipline += 0.16;
    } else if (tid === 'green_thumb') {
      industriousness += 0.14;
      empathy += 0.1;
      caution += 0.08;
    } else if (tid === 'calculated_mind') {
      discipline += 0.24;
      curiosity += 0.14;
      caution += 0.12;
    } else if (tid === 'swift_footed') {
      curiosity += 0.14;
      caution -= 0.08;
    } else if (tid === 'cautious_homebody') {
      caution += 0.28;
      curiosity -= 0.22;
      sociability -= 0.12;
    } else if (tid === 'stubborn') {
      stubbornness += 0.34;
      discipline -= 0.14;
    } else if (tid === 'timid') {
      bravery -= 0.28;
      caution += 0.24;
    } else if (tid === 'melancholic') {
      sociability -= 0.16;
      empathy += 0.08;
    } else if (tid === 'resilient' || tid === 'hard_skin') {
      bravery += 0.12;
      discipline += 0.1;
    } else if (tid === 'glass_cannon') {
      bravery += 0.14;
      caution -= 0.14;
    } else if (tid === 'danger_sense') {
      caution += 0.22;
      discipline += 0.1;
    }
  }

  const axes = {
    curiosity: clamp01(curiosity),
    bravery: clamp01(bravery),
    sociability: clamp01(sociability),
    industriousness: clamp01(industriousness),
    discipline: clamp01(discipline),
    empathy: clamp01(empathy),
    greed: clamp01(greed),
    stubbornness: clamp01(stubbornness),
    honesty: clamp01(honesty),
    caution: clamp01(caution),
  };

  return {
    ...axes,
    archetype: derivePersonalityArchetype(axes),
  };
}

export function getNpcPersonality(v: VillagerEntity): NpcPersonality {
  if (!v.personality) {
    v.personality = buildNpcPersonality(v.id, v.traits ?? [], v.curiosity, v.bravery, Boolean(v.isStranger));
  }
  return v.personality;
}

const MAX_NPC_MEMORIES = 24;

export function recordNpcMemory(
  v: VillagerEntity,
  params: {
    day: number;
    timeOfDay: number;
    kind: NpcMemoryKind;
    summary: string;
    actorIds?: string[];
    importance?: number;
    sentiment?: 'positive' | 'neutral' | 'negative';
  },
): NpcMemoryEntry {
  if (!Array.isArray(v.memories)) v.memories = [];

  const existingSame = v.memories.find(
    (m) => m.day === params.day && m.kind === params.kind && m.summary === params.summary,
  );
  if (existingSame) {
    existingSame.timeOfDay = params.timeOfDay;
    existingSame.importance = Math.max(existingSame.importance, params.importance ?? 5);
    return existingSame;
  }

  const entry: NpcMemoryEntry = {
    id: `mem_${params.day}_${Math.random().toString(36).slice(2, 7)}`,
    day: params.day,
    timeOfDay: Number(params.timeOfDay.toFixed(3)),
    kind: params.kind,
    summary: params.summary,
    actorIds: params.actorIds ? [...params.actorIds] : [],
    importance: Math.max(1, Math.min(10, Math.round(params.importance ?? 5))),
    sentiment: params.sentiment ?? 'neutral',
  };

  v.memories.unshift(entry);
  v.lastMemory = entry.summary;

  if (v.memories.length > MAX_NPC_MEMORIES) {
    // Keep highest salience/recency mix when trimming bounded memory stream
    v.memories.sort((a, b) => {
      const scoreA = a.importance * 2 + a.day * 0.4 + a.timeOfDay * 0.2;
      const scoreB = b.importance * 2 + b.day * 0.4 + b.timeOfDay * 0.2;
      return scoreB - scoreA;
    });
    v.memories.length = MAX_NPC_MEMORIES;
    v.memories.sort((a, b) => (b.day - a.day) || (b.timeOfDay - a.timeOfDay));
  }

  return entry;
}
