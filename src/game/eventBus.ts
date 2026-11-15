import type {
  ChronicleEntry,
  IslandId,
  WorldEvent,
  WorldEventCategory,
  WorldEventSignificance,
  WorldState,
} from './types';

export const MAX_WORLD_EVENTS = 200;

let eventSeq = 0;

export interface EmitWorldEventInput {
  category: WorldEventCategory;
  significance?: WorldEventSignificance;
  summary: string;
  islandId?: IslandId;
  participantIds?: string[];
  witnessIds?: string[];
  day?: number;
  timeOfDay?: number;
  dedupeWindow?: number;
}

export function mapChronicleKindToEventCategory(
  kind: ChronicleEntry['kind'],
): { category: WorldEventCategory; significance: WorldEventSignificance } {
  switch (kind) {
    case 'birth':
      return { category: 'social', significance: 'notable' };
    case 'bond':
      return { category: 'social', significance: 'notable' };
    case 'chief':
    case 'governance':
      return { category: 'rule', significance: 'major' };
    case 'arrival':
      return { category: 'migration', significance: 'notable' };
    case 'voyage':
      return { category: 'migration', significance: 'notable' };
    case 'build':
      return { category: 'construction', significance: 'notable' };
    case 'era':
      return { category: 'construction', significance: 'major' };
    case 'tech':
      return { category: 'economy', significance: 'notable' };
    case 'festival':
      return { category: 'social', significance: 'notable' };
    case 'war':
      return { category: 'survival', significance: 'major' };
    case 'death':
      return { category: 'survival', significance: 'major' };
    case 'ruin':
      return { category: 'survival', significance: 'major' };
    default:
      return { category: 'social', significance: 'minor' };
  }
}

export function emitWorldEvent(world: WorldState, input: EmitWorldEventInput): WorldEvent | null {
  const summary = input.summary.trim();
  if (!summary) return null;

  if (!Array.isArray(world.eventLog)) {
    world.eventLog = [];
  }

  const day = input.day ?? world.environment?.dayCount ?? 1;
  const timeOfDay = input.timeOfDay ?? world.environment?.timeOfDay ?? 0.36;
  const islandId = input.islandId ?? world.localHomeIslandId ?? 'cradle';
  const significance = input.significance ?? 'minor';
  const dedupeWindow = input.dedupeWindow ?? 0.025;

  // Avoid duplicate back-to-back events from repeated loop ticks
  const recentDuplicate = world.eventLog.some(
    (ev) =>
      ev.day === day &&
      ev.category === input.category &&
      ev.islandId === islandId &&
      ev.summary === summary &&
      Math.abs(ev.timeOfDay - timeOfDay) <= dedupeWindow,
  );
  if (recentDuplicate) {
    return null;
  }

  eventSeq = (eventSeq + 1) % 100000;
  const ev: WorldEvent = {
    id: `ev_${day}_${eventSeq}_${Math.random().toString(36).slice(2, 6)}`,
    day,
    timeOfDay,
    category: input.category,
    significance,
    summary,
    islandId,
    participantIds: [...new Set((input.participantIds ?? []).filter(Boolean))],
    witnessIds: input.witnessIds ? [...new Set(input.witnessIds.filter(Boolean))] : undefined,
  };

  world.eventLog.unshift(ev);
  if (world.eventLog.length > MAX_WORLD_EVENTS) {
    world.eventLog.length = MAX_WORLD_EVENTS;
  }
  return ev;
}

export interface WorldEventFilter {
  category?: WorldEventCategory | 'all';
  islandId?: IslandId | 'all';
  participantId?: string;
  significance?: WorldEventSignificance;
  limit?: number;
}

export function queryWorldEvents(
  events: WorldEvent[] | undefined,
  filter: WorldEventFilter = {},
): WorldEvent[] {
  if (!Array.isArray(events) || events.length === 0) return [];
  const filtered = events.filter((ev) => {
    if (filter.category && filter.category !== 'all' && ev.category !== filter.category) return false;
    if (filter.islandId && filter.islandId !== 'all' && ev.islandId !== filter.islandId) return false;
    if (filter.significance && ev.significance !== filter.significance) return false;
    if (
      filter.participantId &&
      !ev.participantIds.includes(filter.participantId) &&
      !(ev.witnessIds?.includes(filter.participantId) ?? false)
    ) {
      return false;
    }
    return true;
  });
  return typeof filter.limit === 'number' ? filtered.slice(0, Math.max(0, filter.limit)) : filtered;
}
