export type SandboxScenarioId =
  | 'default'
  | 'small_pop'
  | 'social_dev'
  | 'resource_depletion'
  | 'construction'
  | 'deep_water'
  | 'collision_cluster'
  | 'animal_ecosystem'
  | 'migration'
  | 'governance';

export type TerrainCellKind = 'land' | 'shallow_water' | 'deep_water' | 'bridge';

export type KnowledgeCategoryId =
  | 'survival'
  | 'resource_gathering'
  | 'tool_usage'
  | 'construction'
  | 'agriculture'
  | 'animal_handling'
  | 'exploration'
  | 'social_organization'
  | 'leadership'
  | 'governance';

export const KNOWLEDGE_CATEGORIES: { id: KnowledgeCategoryId; label: string }[] = [
  { id: 'survival', label: 'Survival' },
  { id: 'resource_gathering', label: 'Gathering' },
  { id: 'tool_usage', label: 'Tools' },
  { id: 'construction', label: 'Construction' },
  { id: 'agriculture', label: 'Agriculture' },
  { id: 'animal_handling', label: 'Animal Care' },
  { id: 'exploration', label: 'Exploration' },
  { id: 'social_organization', label: 'Social Org' },
  { id: 'leadership', label: 'Leadership' },
  { id: 'governance', label: 'Governance' },
];

export type SandboxRelationshipStage =
  | 'stranger'
  | 'acquaintance'
  | 'familiar'
  | 'friend'
  | 'close_friend'
  | 'rival'
  | 'enemy';

export type SandboxEventCategory =
  | 'introductions'
  | 'conversations'
  | 'friendships'
  | 'cooperation'
  | 'conflicts'
  | 'reputation'
  | 'governance'
  | 'migration'
  | 'construction'
  | 'learning';

export type SandboxEventSignificance = 'minor' | 'notable' | 'major';

export type SandboxResourceKind = 'twig' | 'small_tree' | 'medium_tree' | 'large_tree' | 'stone_boulder' | 'berry_bush';

export type SandboxConstructionStage = 'foundation' | 'framework' | 'walls' | 'roof' | 'complete';

export type SandboxHousingTier = 1 | 2 | 3 | 4;

export interface SandboxPersonality {
  sociability: number; // 0..1
  curiosity: number; // 0..1
  industriousness: number; // 0..1
  caution: number; // 0..1
  generosity: number; // 0..1
  honesty: number; // 0..1
  archetype: string;
}

export interface SandboxNeeds {
  hunger: number; // 0..100 (100 = full)
  energy: number; // 0..100 (100 = rested)
  warmth: number; // 0..100
  social: number; // 0..100
  safety: number; // 0..100
  mood: number; // 0..100
}

export interface SandboxMemoryEntry {
  id: string;
  timeSec: number;
  summary: string;
  importance: number; // 1..10
  sentiment: 'positive' | 'neutral' | 'negative';
  relatedVillagerId?: string;
}

export interface SandboxRelationship {
  peerId: string;
  score: number; // -100..100
  stage: SandboxRelationshipStage;
  conversations: number;
  positiveEvents: number;
  negativeEvents: number;
  lastInteractionSec: number;
  introduced: boolean;
}

export interface SandboxDecisionCandidate {
  action: string;
  score: number;
  valid: boolean;
  reason: string;
}

export interface SandboxDecisionTrace {
  chosenAction: string;
  chosenReason: string;
  validated: boolean;
  validationNote: string;
  evaluatedAtSec: number;
  candidates: SandboxDecisionCandidate[];
}

export interface SandboxInventory {
  wood: number;
  stone: number;
  food: number;
  capacity: number;
}

export interface SandboxCollisionState {
  vx: number;
  vy: number;
  speed: number;
  blockedBy: string | null;
  stuckTimer: number;
  recoveryCount: number;
  detourActive: boolean;
  detourSign: 1 | -1;
  terrainUnderfoot: TerrainCellKind;
  lastPosX: number;
  lastPosY: number;
  progressCheckTimer: number;
}

export interface SandboxVillager {
  id: string;
  name: string;
  cloakColor: string;
  x: number;
  y: number;
  radius: number;
  facing: 1 | -1;
  personality: SandboxPersonality;
  needs: SandboxNeeds;
  activity:
    | 'idle'
    | 'moving'
    | 'gathering'
    | 'hauling'
    | 'building'
    | 'eating'
    | 'resting'
    | 'socializing'
    | 'exploring'
    | 'arguing'
    | 'leaving';
  currentGoal: string;
  longTermGoal: string;
  decision: SandboxDecisionTrace;
  knowledge: Record<KnowledgeCategoryId, number>; // 0..100
  skills: {
    woodcraft: number;
    stonecraft: number;
    foraging: number;
    masonry: number;
    social: number;
  };
  inventory: SandboxInventory;
  relationships: Record<string, SandboxRelationship>;
  memories: SandboxMemoryEntry[];
  reputation: number; // -100..100 community standing
  ruleViolations: number;
  witnessedViolations: Record<string, number>;
  banished: boolean;
  targetX: number | null;
  targetY: number | null;
  targetNodeId: string | null;
  targetBuildingId: string | null;
  targetPeerId: string | null;
  path: { x: number; y: number }[];
  collision: SandboxCollisionState;
  actionTimer: number;
  decisionCooldown: number;
  socialCooldown: number;
  isMigrant?: boolean;
}

export interface SandboxResourceNode {
  id: string;
  kind: SandboxResourceKind;
  label: string;
  yieldType: 'wood' | 'stone' | 'food';
  x: number;
  y: number;
  radius: number;
  amount: number;
  maxAmount: number;
  renewable: boolean;
  regrowTimer: number;
}

export interface SandboxBuilding {
  id: string;
  kind: 'campfire' | 'primitive_shelter' | 'wooden_hut' | 'improved_house' | 'stockpile' | 'dock';
  name: string;
  housingTier: SandboxHousingTier;
  x: number;
  y: number;
  radius: number;
  beds: number;
  stage: SandboxConstructionStage;
  progress: number; // 0..100
  requiredWood: number;
  requiredStone: number;
  deliveredWood: number;
  deliveredStone: number;
  assignedBuilderIds: string[];
  pausedForMaterials: boolean;
}

export interface SandboxAnimal {
  id: string;
  species: 'rabbit' | 'deer' | 'boar' | 'sheep';
  x: number;
  y: number;
  radius: number;
  hunger: number; // 0..100
  energy: number; // 0..100
  state: 'wandering' | 'grazing' | 'drinking' | 'resting' | 'sleeping' | 'fleeing' | 'charging';
  targetX: number;
  targetY: number;
  pauseTimer: number;
  terrainUnderfoot: TerrainCellKind;
}

export interface SandboxBoat {
  id: string;
  name: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  state: 'approaching' | 'docked' | 'departing';
  passengerNames: string[];
  disembarked: boolean;
}

export interface SandboxEvent {
  id: string;
  timeSec: number;
  title: string;
  category: SandboxEventCategory;
  significance: SandboxEventSignificance;
  involvedIds: string[];
  involvedNames: string[];
  description: string;
  relationshipDelta?: string;
  consequence?: string;
}

export interface SandboxConfig {
  scenarioId: SandboxScenarioId;
  seed: number;
  durationSeconds: number; // 0 = unlimited manual run
  initialPopulation: number;
  initialWood: number;
  initialTwigs: number;
  initialStone: number;
  initialFood: number;
  hasBridgeOverDeepWater: boolean;
}

export interface SandboxWorld {
  config: SandboxConfig;
  width: number;
  height: number;
  gridCols: number;
  gridRows: number;
  cellSize: number;
  terrainGrid: TerrainCellKind[]; // gridCols * gridRows
  pond: {
    cx: number;
    cy: number;
    shallowRadiusX: number;
    shallowRadiusY: number;
    deepRadiusX: number;
    deepRadiusY: number;
    bridgeY: number;
    bridgeHalfHeight: number;
  };
  timeSec: number;
  completed: boolean;
  rngState: number;
  stockpile: {
    wood: number;
    stone: number;
    food: number;
  };
  villagers: SandboxVillager[];
  nodes: SandboxResourceNode[];
  buildings: SandboxBuilding[];
  animals: SandboxAnimal[];
  boats: SandboxBoat[];
  events: SandboxEvent[];
  rules: string[];
  metrics: {
    totalPathComputations: number;
    totalActionRejections: number;
    totalResourcesGathered: number;
    peakOverlapPairs: number;
    housesConstructedCount: number;
  };
}

export const SANDBOX_SCENARIO_META: {
  id: SandboxScenarioId;
  label: string;
  summary: string;
}[] = [
  {
    id: 'default',
    label: 'Standard Sandbox',
    summary: '4 diverse villagers, pond (shallow + deep core), bridge, finite trees/twigs/stones, shelter & wildlife.',
  },
  {
    id: 'small_pop',
    label: 'Scenario A · Small Population (2)',
    summary: '2 villagers with 2 beds already available. Verifies survival restraint and no 4-house spam.',
  },
  {
    id: 'social_dev',
    label: 'Scenario B · Social Development (6)',
    summary: '6 contrasting personalities observing introductions, chats, stage progression, and Social Log causality.',
  },
  {
    id: 'resource_depletion',
    label: 'Scenario C · Resource Depletion',
    summary: 'Scarce twigs (5 wood) and 2 small trees (10 wood). Nodes deplete to 0 and stay unavailable.',
  },
  {
    id: 'construction',
    label: 'Scenario D · Staged Construction',
    summary: 'Starts with basic knowledge & wood/stone to observe foundation → framework → walls → roof.',
  },
  {
    id: 'deep_water',
    label: 'Scenario E · Deep Water Crossing',
    summary: 'Target resources placed across a deep-water pond. Toggle bridge on/off to test A* routing.',
  },
  {
    id: 'collision_cluster',
    label: 'Scenario F · Collision Stress',
    summary: '8 villagers clustered near tight boulder/tree obstacles to verify separation & stuck recovery.',
  },
  {
    id: 'animal_ecosystem',
    label: 'Scenario G · Animal Ecosystem',
    summary: 'Rabbits, deer, boar, and sheep grazing, drinking at shallow shores, resting, and fleeing.',
  },
  {
    id: 'migration',
    label: 'Scenario H · Boat Migration',
    summary: 'External migrants sail in by boat, dock physically, disembark, and introduce themselves.',
  },
  {
    id: 'governance',
    label: 'Scenario I · Rules & Banishment',
    summary: 'Includes a low-honesty villager who steals food when hungry, triggering witnesses & banishment vote.',
  },
];

// Deterministic Mulberry32 PRNG
function nextRand(world: { rngState: number }): number {
  let t = (world.rngState += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function getRelationshipStage(score: number): SandboxRelationshipStage {
  if (score <= -45) return 'enemy';
  if (score <= -15) return 'rival';
  if (score < 12) return 'stranger';
  if (score < 28) return 'acquaintance';
  if (score < 48) return 'familiar';
  if (score < 72) return 'friend';
  return 'close_friend';
}

export const RELATIONSHIP_STAGE_META: Record<SandboxRelationshipStage, { label: string; color: string }> = {
  enemy: { label: 'Enemy', color: '#EF4444' },
  rival: { label: 'Rival', color: '#E38589' },
  stranger: { label: 'Stranger', color: '#9EB1C2' },
  acquaintance: { label: 'Acquaintance', color: '#D8CEBA' },
  familiar: { label: 'Familiar', color: '#A8D8EA' },
  friend: { label: 'Friend', color: '#8CE0AC' },
  close_friend: { label: 'Close Friend', color: '#FDE68A' },
};

const ARCHETYPE_PRESETS: SandboxPersonality[] = [
  {
    archetype: 'Warm Gatherer',
    sociability: 0.85,
    curiosity: 0.52,
    industriousness: 0.72,
    caution: 0.48,
    generosity: 0.88,
    honesty: 0.9,
  },
  {
    archetype: 'Curious Scout',
    sociability: 0.56,
    curiosity: 0.92,
    industriousness: 0.58,
    caution: 0.28,
    generosity: 0.62,
    honesty: 0.78,
  },
  {
    archetype: 'Stoic Builder',
    sociability: 0.34,
    curiosity: 0.38,
    industriousness: 0.92,
    caution: 0.66,
    generosity: 0.55,
    honesty: 0.86,
  },
  {
    archetype: 'Cautious Herbalist',
    sociability: 0.48,
    curiosity: 0.44,
    industriousness: 0.68,
    caution: 0.88,
    generosity: 0.76,
    honesty: 0.92,
  },
  {
    archetype: 'Opportunist',
    sociability: 0.42,
    curiosity: 0.6,
    industriousness: 0.36,
    caution: 0.4,
    generosity: 0.18,
    honesty: 0.22,
  },
  {
    archetype: 'Mediator',
    sociability: 0.88,
    curiosity: 0.64,
    industriousness: 0.65,
    caution: 0.55,
    generosity: 0.84,
    honesty: 0.95,
  },
];

const SANDBOX_NAMES = [
  'Rowan Briar',
  'Clara Finch',
  'Alder Moss',
  'Sylvie Lark',
  'Bram Hollow',
  'Iris Clover',
  'Finn Gale',
  'Maeve Reed',
  'Otis Crag',
  'Nora Brook',
  'Theo Haven',
  'Wren Ash',
];

const CLOAK_COLORS = ['#C26D4A', '#5A7D6C', '#5B7290', '#B88B4A', '#8C5E74', '#6E7F5E', '#A65C52', '#4F6D7A'];

export function defaultConfigForScenario(scenarioId: SandboxScenarioId): SandboxConfig {
  switch (scenarioId) {
    case 'small_pop':
      return {
        scenarioId,
        seed: 101,
        durationSeconds: 180,
        initialPopulation: 2,
        initialWood: 18,
        initialTwigs: 3,
        initialStone: 10,
        initialFood: 20,
        hasBridgeOverDeepWater: true,
      };
    case 'social_dev':
      return {
        scenarioId,
        seed: 202,
        durationSeconds: 240,
        initialPopulation: 6,
        initialWood: 24,
        initialTwigs: 4,
        initialStone: 12,
        initialFood: 35,
        hasBridgeOverDeepWater: true,
      };
    case 'resource_depletion':
      return {
        scenarioId,
        seed: 303,
        durationSeconds: 180,
        initialPopulation: 4,
        initialWood: 2,
        initialTwigs: 2,
        initialStone: 2,
        initialFood: 16,
        hasBridgeOverDeepWater: true,
      };
    case 'construction':
      return {
        scenarioId,
        seed: 404,
        durationSeconds: 200,
        initialPopulation: 4,
        initialWood: 22,
        initialTwigs: 4,
        initialStone: 12,
        initialFood: 26,
        hasBridgeOverDeepWater: true,
      };
    case 'deep_water':
      return {
        scenarioId,
        seed: 505,
        durationSeconds: 180,
        initialPopulation: 3,
        initialWood: 6,
        initialTwigs: 2,
        initialStone: 4,
        initialFood: 18,
        hasBridgeOverDeepWater: false,
      };
    case 'collision_cluster':
      return {
        scenarioId,
        seed: 606,
        durationSeconds: 120,
        initialPopulation: 8,
        initialWood: 16,
        initialTwigs: 4,
        initialStone: 10,
        initialFood: 30,
        hasBridgeOverDeepWater: true,
      };
    case 'animal_ecosystem':
      return {
        scenarioId,
        seed: 707,
        durationSeconds: 180,
        initialPopulation: 3,
        initialWood: 18,
        initialTwigs: 3,
        initialStone: 10,
        initialFood: 24,
        hasBridgeOverDeepWater: true,
      };
    case 'migration':
      return {
        scenarioId,
        seed: 808,
        durationSeconds: 180,
        initialPopulation: 3,
        initialWood: 20,
        initialTwigs: 3,
        initialStone: 10,
        initialFood: 32,
        hasBridgeOverDeepWater: true,
      };
    case 'governance':
      return {
        scenarioId,
        seed: 909,
        durationSeconds: 240,
        initialPopulation: 5,
        initialWood: 20,
        initialTwigs: 3,
        initialStone: 10,
        initialFood: 22,
        hasBridgeOverDeepWater: true,
      };
    case 'default':
    default:
      return {
        scenarioId: 'default',
        seed: 42,
        durationSeconds: 300,
        initialPopulation: 4,
        initialTwigs: 4,
        initialWood: 16,
        initialStone: 10,
        initialFood: 24,
        hasBridgeOverDeepWater: true,
      };
  }
}

function buildTerrainGrid(
  gridCols: number,
  gridRows: number,
  cellSize: number,
  pond: SandboxWorld['pond'],
  hasBridge: boolean,
): TerrainCellKind[] {
  const grid: TerrainCellKind[] = new Array(gridCols * gridRows).fill('land');
  for (let r = 0; r < gridRows; r++) {
    const cy = (r + 0.5) * cellSize;
    for (let c = 0; c < gridCols; c++) {
      const cx = (c + 0.5) * cellSize;
      const deepNorm = Math.hypot((cx - pond.cx) / pond.deepRadiusX, (cy - pond.cy) / pond.deepRadiusY);
      const shallowNorm = Math.hypot((cx - pond.cx) / pond.shallowRadiusX, (cy - pond.cy) / pond.shallowRadiusY);
      if (hasBridge && Math.abs(cy - pond.bridgeY) <= pond.bridgeHalfHeight && shallowNorm <= 1.08) {
        grid[r * gridCols + c] = 'bridge';
      } else if (deepNorm <= 1) {
        grid[r * gridCols + c] = 'deep_water';
      } else if (shallowNorm <= 1) {
        grid[r * gridCols + c] = 'shallow_water';
      } else {
        grid[r * gridCols + c] = 'land';
      }
    }
  }
  return grid;
}

export function getTerrainAt(world: SandboxWorld, x: number, y: number): TerrainCellKind {
  const col = clamp(Math.floor(x / world.cellSize), 0, world.gridCols - 1);
  const row = clamp(Math.floor(y / world.cellSize), 0, world.gridRows - 1);
  return world.terrainGrid[row * world.gridCols + col];
}

export function setSandboxBridge(world: SandboxWorld, enabled: boolean): void {
  world.config.hasBridgeOverDeepWater = enabled;
  world.terrainGrid = buildTerrainGrid(world.gridCols, world.gridRows, world.cellSize, world.pond, enabled);
  // Invalidate existing villager paths so everyone replans around water/bridge cleanly
  for (const v of world.villagers) {
    v.path = [];
  }
  recordEvent(world, {
    title: enabled ? 'Footbridge Opened' : 'Footbridge Removed',
    category: 'construction',
    significance: 'notable',
    involvedIds: [],
    involvedNames: [],
    description: enabled
      ? 'A wooden crossing was laid across the deep water pond.'
      : 'The crossing over deep water was removed; villagers must detour or cancel.',
  });
}

function makeKnowledgeBase(basicBonus = 0): Record<KnowledgeCategoryId, number> {
  return {
    survival: 25 + basicBonus,
    resource_gathering: 22 + basicBonus,
    tool_usage: 10 + Math.floor(basicBonus * 0.5),
    construction: 12 + Math.floor(basicBonus * 0.6),
    agriculture: 8,
    animal_handling: 8,
    exploration: 14,
    social_organization: 12,
    leadership: 6,
    governance: 5,
  };
}

function createVillager(
  world: SandboxWorld,
  idx: number,
  x: number,
  y: number,
  overridePersonality?: SandboxPersonality,
  isMigrant = false,
): SandboxVillager {
  const personality = overridePersonality ?? { ...ARCHETYPE_PRESETS[idx % ARCHETYPE_PRESETS.length] };
  const name = SANDBOX_NAMES[idx % SANDBOX_NAMES.length] + (idx >= SANDBOX_NAMES.length ? ` ${Math.floor(idx / SANDBOX_NAMES.length) + 1}` : '');
  const id = `sb_v_${idx + 1}`;
  const isSaboteur = world.config.scenarioId === 'governance' && idx === 4;
  return {
    id,
    name,
    cloakColor: CLOAK_COLORS[idx % CLOAK_COLORS.length],
    x,
    y,
    radius: 13,
    facing: 1,
    personality: isSaboteur
      ? {
          archetype: 'Rulebreaker',
          sociability: 0.45,
          curiosity: 0.55,
          industriousness: 0.25,
          caution: 0.2,
          generosity: 0.08,
          honesty: 0.1,
        }
      : personality,
    needs: {
      hunger: isSaboteur ? 38 : 74 + Math.round(nextRand(world) * 18),
      energy: 78 + Math.round(nextRand(world) * 16),
      warmth: 85,
      social: 52 + Math.round(nextRand(world) * 24),
      safety: 90,
      mood: 76,
    },
    activity: 'idle',
    currentGoal: 'Orient in clearing',
    longTermGoal:
      personality.curiosity > 0.75
        ? 'Survey terrain & outer shores'
        : personality.industriousness > 0.75
          ? 'Improve shelter & gather materials'
          : 'Build trust & sustain camp',
    decision: {
      chosenAction: 'idle',
      chosenReason: 'Awakened in sandbox clearing',
      validated: true,
      validationNote: 'Initial spawn state',
      evaluatedAtSec: 0,
      candidates: [],
    },
    knowledge: makeKnowledgeBase(idx === 2 ? 12 : 0),
    skills: {
      woodcraft: 1,
      stonecraft: 1,
      foraging: 1,
      masonry: idx === 2 ? 2 : 1,
      social: 1,
    },
    inventory: {
      wood: 0,
      stone: 0,
      food: 0,
      capacity: 6,
    },
    relationships: {},
    memories: [
      {
        id: `mem_init_${id}`,
        timeSec: 0,
        summary: 'Arrived at the flat river-pond clearing.',
        importance: 3,
        sentiment: 'neutral',
      },
    ],
    reputation: isSaboteur ? -10 : 12,
    ruleViolations: 0,
    witnessedViolations: {},
    banished: false,
    targetX: null,
    targetY: null,
    targetNodeId: null,
    targetBuildingId: null,
    targetPeerId: null,
    path: [],
    collision: {
      vx: 0,
      vy: 0,
      speed: 0,
      blockedBy: null,
      stuckTimer: 0,
      recoveryCount: 0,
      detourActive: false,
      detourSign: 1,
      terrainUnderfoot: getTerrainAt(world, x, y),
      lastPosX: x,
      lastPosY: y,
      progressCheckTimer: 0,
    },
    actionTimer: 0,
    decisionCooldown: 0.15 * idx,
    socialCooldown: 4 + idx * 1.5,
    isMigrant,
  };
}

function recordEvent(
  world: SandboxWorld,
  ev: Omit<SandboxEvent, 'id' | 'timeSec'>,
): void {
  world.events.unshift({
    id: `ev_${world.events.length + 1}_${Math.round(world.timeSec * 10)}`,
    timeSec: Number(world.timeSec.toFixed(1)),
    ...ev,
  });
  if (world.events.length > 220) {
    world.events.length = 220;
  }
}

export function createSandboxWorld(partialConfig?: Partial<SandboxConfig>): SandboxWorld {
  const scenarioId = partialConfig?.scenarioId ?? 'default';
  const baseCfg = defaultConfigForScenario(scenarioId);
  const config: SandboxConfig = { ...baseCfg, ...partialConfig };

  const width = 1200;
  const height = 760;
  const cellSize = 20;
  const gridCols = Math.floor(width / cellSize); // 60
  const gridRows = Math.floor(height / cellSize); // 38

  // Deep water pond divides west settlement from east groves/resources in Scenario E & standard
  const pond: SandboxWorld['pond'] =
    scenarioId === 'deep_water'
      ? {
          cx: 600,
          cy: 380,
          shallowRadiusX: 118,
          shallowRadiusY: 520,
          deepRadiusX: 78,
          deepRadiusY: 460,
          bridgeY: 380,
          bridgeHalfHeight: 24,
        }
      : {
          cx: 690,
          cy: 380,
          shallowRadiusX: 148,
          shallowRadiusY: 138,
          deepRadiusX: 98,
          deepRadiusY: 92,
          bridgeY: 380,
          bridgeHalfHeight: 22,
        };

  const world: SandboxWorld = {
    config,
    width,
    height,
    gridCols,
    gridRows,
    cellSize,
    terrainGrid: buildTerrainGrid(gridCols, gridRows, cellSize, pond, config.hasBridgeOverDeepWater),
    pond,
    timeSec: 0,
    completed: false,
    rngState: (config.seed || 42) >>> 0,
    stockpile: {
      wood: config.initialWood,
      stone: config.initialStone,
      food: config.initialFood,
    },
    villagers: [],
    nodes: [],
    buildings: [],
    animals: [],
    boats: [],
    events: [],
    rules: [
      'Share camp food during scarcity',
      'Respect shared stockpile & avoid theft',
      'Keep peace near the hearth',
    ],
    metrics: {
      totalPathComputations: 0,
      totalActionRejections: 0,
      totalResourcesGathered: 0,
      peakOverlapPairs: 0,
      housesConstructedCount: 0,
    },
  };

  // Core Camp Buildings on West Side
  world.buildings.push(
    {
      id: 'sb_campfire',
      kind: 'campfire',
      name: 'Central Hearth',
      housingTier: 1,
      x: 310,
      y: 380,
      radius: 22,
      beds: 0,
      stage: 'complete',
      progress: 100,
      requiredWood: 4,
      requiredStone: 2,
      deliveredWood: 4,
      deliveredStone: 2,
      assignedBuilderIds: [],
      pausedForMaterials: false,
    },
    {
      id: 'sb_stockpile',
      kind: 'stockpile',
      name: 'Timber Stockpile',
      housingTier: 1,
      x: 245,
      y: 310,
      radius: 24,
      beds: 0,
      stage: 'complete',
      progress: 100,
      requiredWood: 4,
      requiredStone: 0,
      deliveredWood: 4,
      deliveredStone: 0,
      assignedBuilderIds: [],
      pausedForMaterials: false,
    },
  );

  // Add initial shelter except in construction-focused start where villagers raise their first shelter
  if (scenarioId === 'small_pop') {
    world.buildings.push({
      id: 'sb_shelter_1',
      kind: 'primitive_shelter',
      name: 'Woven Lean-To',
      housingTier: 1,
      x: 230,
      y: 445,
      radius: 28,
      beds: 2,
      stage: 'complete',
      progress: 100,
      requiredWood: 8,
      requiredStone: 2,
      deliveredWood: 8,
      deliveredStone: 2,
      assignedBuilderIds: [],
      pausedForMaterials: false,
    });
  } else if (scenarioId === 'construction') {
    world.buildings.push({
      id: 'sb_shelter_wip',
      kind: 'wooden_hut',
      name: 'Timber Hut Project',
      housingTier: 2,
      x: 235,
      y: 455,
      radius: 30,
      beds: 2,
      stage: 'foundation',
      progress: 10,
      requiredWood: 14,
      requiredStone: 6,
      deliveredWood: 4,
      deliveredStone: 2,
      assignedBuilderIds: [],
      pausedForMaterials: false,
    });
  } else if (scenarioId !== 'resource_depletion') {
    world.buildings.push({
      id: 'sb_shelter_1',
      kind: 'primitive_shelter',
      name: 'Woven Lean-To',
      housingTier: 1,
      x: 235,
      y: 455,
      radius: 28,
      beds: 2,
      stage: 'complete',
      progress: 100,
      requiredWood: 8,
      requiredStone: 2,
      deliveredWood: 8,
      deliveredStone: 2,
      assignedBuilderIds: [],
      pausedForMaterials: false,
    });
  }

  // Resource Nodes (using realistic finite values from Phase 4 table)
  if (scenarioId === 'resource_depletion') {
    for (let i = 0; i < Math.max(1, config.initialTwigs); i++) {
      world.nodes.push({
        id: `sb_twig_${i}`,
        kind: 'twig',
        label: 'Dry Twigs',
        yieldType: 'wood',
        x: 380 + i * 55,
        y: 255 + (i % 2) * 38,
        radius: 14,
        amount: 5,
        maxAmount: 5,
        renewable: true,
        regrowTimer: 0,
      });
    }
    world.nodes.push(
      {
        id: 'sb_stree_1',
        kind: 'small_tree',
        label: 'Small Pine',
        yieldType: 'wood',
        x: 430,
        y: 470,
        radius: 18,
        amount: 10,
        maxAmount: 10,
        renewable: true,
        regrowTimer: 0,
      },
      {
        id: 'sb_stree_2',
        kind: 'small_tree',
        label: 'Small Birch',
        yieldType: 'wood',
        x: 490,
        y: 515,
        radius: 18,
        amount: 10,
        maxAmount: 10,
        renewable: true,
        regrowTimer: 0,
      },
      {
        id: 'sb_berry_1',
        kind: 'berry_bush',
        label: 'Berry Thicket',
        yieldType: 'food',
        x: 165,
        y: 255,
        radius: 15,
        amount: 8,
        maxAmount: 8,
        renewable: true,
        regrowTimer: 0,
      },
    );
  } else if (scenarioId === 'deep_water') {
    // Rich grove exclusively across the deep water pond on the east side
    const eastNodes: Omit<SandboxResourceNode, 'regrowTimer'>[] = [
      { id: 'sb_east_ltree_1', kind: 'large_tree', label: 'Eastern Cedar', yieldType: 'wood', x: 910, y: 240, radius: 22, amount: 15, maxAmount: 15, renewable: true },
      { id: 'sb_east_mtree_1', kind: 'medium_tree', label: 'Eastern Oak', yieldType: 'wood', x: 960, y: 380, radius: 20, amount: 12, maxAmount: 12, renewable: true },
      { id: 'sb_east_stone_1', kind: 'stone_boulder', label: 'Basalt Boulder', yieldType: 'stone', x: 930, y: 500, radius: 22, amount: 14, maxAmount: 14, renewable: false },
      { id: 'sb_east_berry_1', kind: 'berry_bush', label: 'Wild Berries', yieldType: 'food', x: 870, y: 360, radius: 15, amount: 10, maxAmount: 10, renewable: true },
    ];
    for (const n of eastNodes) world.nodes.push({ ...n, regrowTimer: 0 });
  } else {
    // Twigs near camp
    for (let i = 0; i < config.initialTwigs; i++) {
      world.nodes.push({
        id: `sb_twig_${i}`,
        kind: 'twig',
        label: 'Dry Twigs',
        yieldType: 'wood',
        x: 375 + (i % 3) * 52,
        y: 210 + Math.floor(i / 3) * 44,
        radius: 14,
        amount: 5,
        maxAmount: 5,
        renewable: true,
        regrowTimer: 0,
      });
    }
    const baseNodes: Omit<SandboxResourceNode, 'regrowTimer'>[] = [
      { id: 'sb_stree_1', kind: 'small_tree', label: 'Young Pine', yieldType: 'wood', x: 165, y: 170, radius: 18, amount: 10, maxAmount: 10, renewable: true },
      { id: 'sb_mtree_1', kind: 'medium_tree', label: 'Meadow Oak', yieldType: 'wood', x: 465, y: 160, radius: 20, amount: 12, maxAmount: 12, renewable: true },
      { id: 'sb_ltree_1', kind: 'large_tree', label: 'Elder Cedar', yieldType: 'wood', x: 965, y: 205, radius: 22, amount: 15, maxAmount: 15, renewable: true },
      { id: 'sb_ltree_2', kind: 'large_tree', label: 'Ancient Oak', yieldType: 'wood', x: 1020, y: 520, radius: 22, amount: 15, maxAmount: 15, renewable: true },
      { id: 'sb_stone_1', kind: 'stone_boulder', label: 'Granite Boulder', yieldType: 'stone', x: 145, y: 575, radius: 22, amount: 14, maxAmount: 14, renewable: false },
      { id: 'sb_stone_2', kind: 'stone_boulder', label: 'River Slate', yieldType: 'stone', x: 470, y: 590, radius: 20, amount: 12, maxAmount: 12, renewable: false },
      { id: 'sb_berry_1', kind: 'berry_bush', label: 'Brambles', yieldType: 'food', x: 375, y: 525, radius: 15, amount: 10, maxAmount: 10, renewable: true },
      { id: 'sb_berry_2', kind: 'berry_bush', label: 'East Berries', yieldType: 'food', x: 950, y: 365, radius: 15, amount: 10, maxAmount: 10, renewable: true },
    ];
    for (const n of baseNodes) {
      world.nodes.push({ ...n, regrowTimer: 0 });
    }
  }

  // Scenario F tight obstacle cluster in middle-west corridor to test stuck/separation
  if (scenarioId === 'collision_cluster') {
    world.nodes.push(
      { id: 'sb_clust_1', kind: 'stone_boulder', label: 'Cluster Stone A', yieldType: 'stone', x: 380, y: 330, radius: 22, amount: 12, maxAmount: 12, renewable: false, regrowTimer: 0 },
      { id: 'sb_clust_2', kind: 'stone_boulder', label: 'Cluster Stone B', yieldType: 'stone', x: 380, y: 420, radius: 22, amount: 12, maxAmount: 12, renewable: false, regrowTimer: 0 },
      { id: 'sb_clust_3', kind: 'medium_tree', label: 'Cluster Pine', yieldType: 'wood', x: 435, y: 375, radius: 20, amount: 12, maxAmount: 12, renewable: true, regrowTimer: 0 },
    );
  }

  // Villagers
  const pop = clamp(config.initialPopulation, 1, 20);
  for (let i = 0; i < pop; i++) {
    let vx = 290 + ((i % 4) - 1.5) * 34;
    let vy = 355 + (Math.floor(i / 4) - 0.5) * 42;
    if (scenarioId === 'collision_cluster') {
      // Spawn tightly packed to test separation & obstacle recovery
      vx = 325 + (i % 3) * 18;
      vy = 358 + Math.floor(i / 3) * 18;
    }
    const v = createVillager(world, i, vx, vy);
    world.villagers.push(v);
  }

  // Initialize mutual stranger relationships so every pair is inspectable
  for (const a of world.villagers) {
    for (const b of world.villagers) {
      if (a.id === b.id) continue;
      a.relationships[b.id] = {
        peerId: b.id,
        score: 0,
        stage: 'stranger',
        conversations: 0,
        positiveEvents: 0,
        negativeEvents: 0,
        lastInteractionSec: -999,
        introduced: false,
      };
    }
  }

  // Animals (shallow water shore & meadow)
  const animalConfigs: { species: SandboxAnimal['species']; x: number; y: number; radius: number }[] =
    scenarioId === 'animal_ecosystem'
      ? [
          { species: 'rabbit', x: 480, y: 230, radius: 7 },
          { species: 'rabbit', x: 510, y: 255, radius: 7 },
          { species: 'deer', x: 870, y: 270, radius: 12 },
          { species: 'deer', x: 905, y: 295, radius: 12 },
          { species: 'sheep', x: 185, y: 345, radius: 10 },
          { species: 'sheep', x: 205, y: 375, radius: 10 },
          { species: 'boar', x: 950, y: 580, radius: 12 },
        ]
      : [
          { species: 'rabbit', x: 495, y: 225, radius: 7 },
          { species: 'deer', x: 895, y: 275, radius: 12 },
          { species: 'sheep', x: 180, y: 345, radius: 10 },
          { species: 'boar', x: 960, y: 585, radius: 12 },
        ];

  animalConfigs.forEach((ac, idx) => {
    world.animals.push({
      id: `sb_animal_${idx + 1}`,
      species: ac.species,
      x: ac.x,
      y: ac.y,
      radius: ac.radius,
      hunger: 62 + Math.round(nextRand(world) * 28),
      energy: 72 + Math.round(nextRand(world) * 20),
      state: 'wandering',
      targetX: ac.x,
      targetY: ac.y,
      pauseTimer: 1 + nextRand(world) * 2,
      terrainUnderfoot: getTerrainAt(world, ac.x, ac.y),
    });
  });

  // Migration Boat in Scenario H
  if (scenarioId === 'migration') {
    world.buildings.push({
      id: 'sb_dock',
      kind: 'dock',
      name: 'Pond Landing Pier',
      housingTier: 1,
      x: 565,
      y: 445,
      radius: 22,
      beds: 0,
      stage: 'complete',
      progress: 100,
      requiredWood: 8,
      requiredStone: 2,
      deliveredWood: 8,
      deliveredStone: 2,
      assignedBuilderIds: [],
      pausedForMaterials: false,
    });
    world.boats.push({
      id: 'sb_migrant_boat_1',
      name: 'Wayfarer Skiff',
      x: 775,
      y: 420,
      targetX: 590,
      targetY: 445,
      state: 'approaching',
      passengerNames: ['Kael Gale', 'Tamsin Fern'],
      disembarked: false,
    });
  }

  recordEvent(world, {
    title: `Sandbox Initialized (${SANDBOX_SCENARIO_META.find((m) => m.id === scenarioId)?.label ?? scenarioId})`,
    category: 'learning',
    significance: 'notable',
    involvedIds: world.villagers.map((v) => v.id),
    involvedNames: world.villagers.map((v) => v.name),
    description: `${world.villagers.length} villagers entered the test clearing with ${config.initialWood} wood, ${config.initialStone} stone, and ${config.initialFood} food.`,
  });

  return world;
}

// ============================================================================
// A* GRID PATHFINDER WITH TERRAIN DEPTH + OBSTACLE CLEARANCE
// ============================================================================

export function isCellWalkable(
  world: SandboxWorld,
  col: number,
  row: number,
  allowShallow = true,
): boolean {
  if (col < 0 || row < 0 || col >= world.gridCols || row >= world.gridRows) return false;
  const kind = world.terrainGrid[row * world.gridCols + col];
  if (kind === 'deep_water') return false;
  if (kind === 'shallow_water' && !allowShallow) return false;

  const cx = (col + 0.5) * world.cellSize;
  const cy = (row + 0.5) * world.cellSize;
  for (const b of world.buildings) {
    if (b.kind === 'campfire' || b.kind === 'stockpile' || b.kind === 'dock') continue;
    if (dist(cx, cy, b.x, b.y) < b.radius + 6) return false;
  }
  for (const n of world.nodes) {
    if (n.amount <= 0) continue;
    if (dist(cx, cy, n.x, n.y) < n.radius + 4) return false;
  }
  return true;
}

function findNearestWalkableCell(
  world: SandboxWorld,
  startCol: number,
  startRow: number,
): { col: number; row: number } | null {
  if (isCellWalkable(world, startCol, startRow, true)) return { col: startCol, row: startRow };
  for (let rad = 1; rad <= 5; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const nc = startCol + dc;
        const nr = startRow + dr;
        if (isCellWalkable(world, nc, nr, true)) return { col: nc, row: nr };
      }
    }
  }
  return null;
}

export function findSandboxPath(
  world: SandboxWorld,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { reachable: boolean; waypoints: { x: number; y: number }[] } {
  world.metrics.totalPathComputations++;
  const cols = world.gridCols;
  const rows = world.gridRows;
  const startRaw = {
    col: clamp(Math.floor(fromX / world.cellSize), 0, cols - 1),
    row: clamp(Math.floor(fromY / world.cellSize), 0, rows - 1),
  };
  const goalRaw = {
    col: clamp(Math.floor(toX / world.cellSize), 0, cols - 1),
    row: clamp(Math.floor(toY / world.cellSize), 0, rows - 1),
  };

  // If the destination itself is literally inside deep water, reject immediately
  if (world.terrainGrid[goalRaw.row * cols + goalRaw.col] === 'deep_water') {
    return { reachable: false, waypoints: [] };
  }

  const start = findNearestWalkableCell(world, startRaw.col, startRaw.row);
  const goal = findNearestWalkableCell(world, goalRaw.col, goalRaw.row);
  if (!start || !goal) {
    return { reachable: false, waypoints: [] };
  }

  const total = cols * rows;
  const gScore = new Float32Array(total).fill(Infinity);
  const fScore = new Float32Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);

  const startIdx = start.row * cols + start.col;
  const goalIdx = goal.row * cols + goal.col;
  gScore[startIdx] = 0;
  fScore[startIdx] = Math.hypot(goal.col - start.col, goal.row - start.row);

  const open: number[] = [startIdx];
  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [-1, 1, 1.414],
    [1, -1, 1.414],
    [-1, -1, 1.414],
  ];

  let found = false;
  while (open.length > 0) {
    let bestPos = 0;
    let bestF = fScore[open[0]];
    for (let i = 1; i < open.length; i++) {
      const f = fScore[open[i]];
      if (f < bestF) {
        bestF = f;
        bestPos = i;
      }
    }
    const curr = open[bestPos];
    open.splice(bestPos, 1);

    if (curr === goalIdx) {
      found = true;
      break;
    }
    if (closed[curr]) continue;
    closed[curr] = 1;

    const cc = curr % cols;
    const cr = Math.floor(curr / cols);

    for (const [dc, dr, baseStep] of dirs) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (!isCellWalkable(world, nc, nr, true)) continue;
      // Disallow diagonal corner-cutting across unwalkable cells
      if (dc !== 0 && dr !== 0) {
        if (!isCellWalkable(world, cc + dc, cr, true) || !isCellWalkable(world, cc, cr + dr, true)) {
          continue;
        }
      }
      const nIdx = nr * cols + nc;
      if (closed[nIdx]) continue;
      const cellKind = world.terrainGrid[nIdx];
      const terrainMult = cellKind === 'shallow_water' ? 1.65 : cellKind === 'bridge' ? 0.92 : 1.0;
      const tentativeG = gScore[curr] + baseStep * terrainMult;
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = curr;
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + Math.hypot(goal.col - nc, goal.row - nr);
        if (!open.includes(nIdx)) open.push(nIdx);
      }
    }
  }

  if (!found) {
    return { reachable: false, waypoints: [] };
  }

  const rawPoints: { x: number; y: number }[] = [];
  let trace = goalIdx;
  while (trace !== -1) {
    const tc = trace % cols;
    const tr = Math.floor(trace / cols);
    rawPoints.push({ x: (tc + 0.5) * world.cellSize, y: (tr + 0.5) * world.cellSize });
    if (trace === startIdx) break;
    trace = cameFrom[trace];
  }
  rawPoints.reverse();
  if (rawPoints.length > 0) {
    rawPoints[rawPoints.length - 1] = {
      x: (goal.col + 0.5) * world.cellSize,
      y: (goal.row + 0.5) * world.cellSize,
    };
  }
  // Remove trivial first point if already standing inside cell
  if (rawPoints.length > 1 && dist(fromX, fromY, rawPoints[0].x, rawPoints[0].y) < world.cellSize * 0.65) {
    rawPoints.shift();
  }
  return { reachable: true, waypoints: rawPoints };
}

// ============================================================================
// UTILITY + VALIDATED DECISION ARCHITECTURE
// ============================================================================

function getTotalBeds(world: SandboxWorld): number {
  return world.buildings
    .filter((b) => b.stage === 'complete')
    .reduce((acc, b) => acc + b.beds, 0);
}

function getActivePop(world: SandboxWorld): number {
  return world.villagers.filter((v) => !v.banished).length;
}

function getNextUnlockedHousingBlueprint(v: SandboxVillager): {
  kind: SandboxBuilding['kind'];
  name: string;
  tier: SandboxHousingTier;
  wood: number;
  stone: number;
  beds: number;
  requiredKnowledge: number;
} {
  const c = v.knowledge.construction;
  if (c >= 65) {
    return { kind: 'improved_house', name: 'Timber Longhouse', tier: 3, wood: 24, stone: 12, beds: 4, requiredKnowledge: 65 };
  }
  if (c >= 30) {
    return { kind: 'wooden_hut', name: 'Wooden Hut', tier: 2, wood: 14, stone: 6, beds: 2, requiredKnowledge: 30 };
  }
  return { kind: 'primitive_shelter', name: 'Primitive Shelter', tier: 1, wood: 8, stone: 2, beds: 2, requiredKnowledge: 0 };
}

function findBestNodeForVillager(
  world: SandboxWorld,
  v: SandboxVillager,
  yieldType: 'wood' | 'stone' | 'food',
): { node: SandboxResourceNode; path: { x: number; y: number }[] } | null {
  const candidates = world.nodes
    .filter((n) => n.yieldType === yieldType && n.amount > 0)
    .sort((a, b) => dist(v.x, v.y, a.x, a.y) - dist(v.x, v.y, b.x, b.y));

  for (const node of candidates) {
    const res = findSandboxPath(world, v.x, v.y, node.x, node.y);
    if (res.reachable) {
      return { node, path: res.waypoints };
    }
  }
  return null;
}

function addMemory(
  v: SandboxVillager,
  timeSec: number,
  summary: string,
  importance: number,
  sentiment: SandboxMemoryEntry['sentiment'],
  relatedVillagerId?: string,
): void {
  if (importance < 2) return;
  v.memories.unshift({
    id: `m_${v.id}_${v.memories.length + 1}_${Math.round(timeSec * 10)}`,
    timeSec: Number(timeSec.toFixed(1)),
    summary,
    importance,
    sentiment,
    relatedVillagerId,
  });
  if (v.memories.length > 24) {
    // Keep highest importance memories when trimming
    v.memories = [...v.memories]
      .sort((a, b) => b.importance * 100 + b.timeSec - (a.importance * 100 + a.timeSec))
      .slice(0, 24)
      .sort((a, b) => b.timeSec - a.timeSec);
  }
}

function gainKnowledge(v: SandboxVillager, cat: KnowledgeCategoryId, amount: number): void {
  const prev = v.knowledge[cat];
  v.knowledge[cat] = clamp(Number((prev + amount).toFixed(2)), 0, 100);
}

function evaluateDecision(world: SandboxWorld, v: SandboxVillager): void {
  if (v.banished) return;

  const activePop = getActivePop(world);
  const beds = getTotalBeds(world);
  const activeConstruction = world.buildings.find((b) => b.stage !== 'complete');
  const carryTotal = v.inventory.wood + v.inventory.stone + v.inventory.food;

  const candidates: SandboxDecisionCandidate[] = [];

  // 1. Eat if hungry
  const hungerUrgency = Math.max(0, 82 - v.needs.hunger) * 1.45;
  const hasFoodAvail = v.inventory.food > 0 || world.stockpile.food > 0;
  candidates.push({
    action: 'eat',
    score: Number((hungerUrgency + (v.needs.hunger < 35 ? 35 : 0)).toFixed(1)),
    valid: v.needs.hunger < 75 && hasFoodAvail,
    reason: !hasFoodAvail ? 'No food in inventory or stockpile' : `Hunger at ${Math.round(v.needs.hunger)}%`,
  });

  // 2. Steal food if low honesty & hungry & rulebreaker
  const canSteal =
    v.personality.honesty < 0.3 &&
    v.needs.hunger < 55 &&
    world.stockpile.food > 0;
  if (v.personality.honesty < 0.3) {
    candidates.push({
      action: 'steal_food',
      score: Number((canSteal ? 68 + (1 - v.personality.honesty) * 20 : 0).toFixed(1)),
      valid: canSteal,
      reason: 'Low honesty + hunger urges covert taking from stockpile',
    });
  }

  // 3. Rest if low energy
  const restScore = Math.max(0, 74 - v.needs.energy) * 1.35;
  candidates.push({
    action: 'rest',
    score: Number(restScore.toFixed(1)),
    valid: v.needs.energy < 68,
    reason: `Energy at ${Math.round(v.needs.energy)}%`,
  });

  // 4. Haul carried goods to stockpile / construction site
  candidates.push({
    action: 'haul',
    score: Number((carryTotal >= v.inventory.capacity ? 86 : carryTotal >= 3 ? 48 : 0).toFixed(1)),
    valid: carryTotal > 0,
    reason: `Carrying ${carryTotal}/${v.inventory.capacity} materials`,
  });

  // 5. Build active construction OR propose needed shelter ONLY when beds < activePop
  const needsHousing = beds < activePop;
  if (activeConstruction) {
    const needsMat =
      activeConstruction.deliveredWood < activeConstruction.requiredWood ||
      activeConstruction.deliveredStone < activeConstruction.requiredStone;
    const matReady =
      (!needsMat) ||
      (activeConstruction.deliveredWood < activeConstruction.requiredWood &&
        (world.stockpile.wood > 0 || v.inventory.wood > 0)) ||
      (activeConstruction.deliveredStone < activeConstruction.requiredStone &&
        (world.stockpile.stone > 0 || v.inventory.stone > 0));
    candidates.push({
      action: 'build',
      score: Number((matReady ? 58 + v.personality.industriousness * 22 : 12).toFixed(1)),
      valid: matReady,
      reason: matReady
        ? `Continue ${activeConstruction.name} (${activeConstruction.stage})`
        : 'Construction paused: awaiting delivered materials',
    });
  } else if (needsHousing) {
    const bp = getNextUnlockedHousingBlueprint(v);
    const hasEnoughForFoundation = world.stockpile.wood >= 4;
    candidates.push({
      action: 'plan_shelter',
      score: Number((54 + v.personality.industriousness * 20).toFixed(1)),
      valid: hasEnoughForFoundation,
      reason: hasEnoughForFoundation
        ? `Beds (${beds}) < Pop (${activePop}): stake ${bp.name}`
        : `Beds (${beds}) < Pop (${activePop}) but stockpile lacks starter wood`,
    });
  } else {
    candidates.push({
      action: 'plan_shelter',
      score: 0,
      valid: false,
      reason: `Housing sufficient (${beds} beds for ${activePop} villagers)`,
    });
  }

  // 6. Gather Wood / Stone / Food from real finite nodes
  const woodNode = findBestNodeForVillager(world, v, 'wood');
  const berryNode = findBestNodeForVillager(world, v, 'food');
  const stoneNode = findBestNodeForVillager(world, v, 'stone');

  const woodDeficit = world.stockpile.wood < 18 ? 22 : 6;
  candidates.push({
    action: 'gather_wood',
    score: Number((26 + woodDeficit + v.personality.industriousness * 24).toFixed(1)),
    valid: Boolean(woodNode) && carryTotal < v.inventory.capacity,
    reason: woodNode
      ? `Target ${woodNode.node.label} (${woodNode.node.amount} left)`
      : 'No reachable wood node (depleted or blocked by deep water)',
  });

  const foodDeficit = world.stockpile.food < activePop * 5 ? 28 : 5;
  candidates.push({
    action: 'gather_food',
    score: Number((24 + foodDeficit + v.personality.industriousness * 16).toFixed(1)),
    valid: Boolean(berryNode) && carryTotal < v.inventory.capacity,
    reason: berryNode
      ? `Target ${berryNode.node.label} (${berryNode.node.amount} left)`
      : 'No reachable berry node',
  });

  const stoneDeficit = world.stockpile.stone < 8 ? 18 : 4;
  candidates.push({
    action: 'gather_stone',
    score: Number((20 + stoneDeficit + v.personality.industriousness * 18).toFixed(1)),
    valid: Boolean(stoneNode) && carryTotal < v.inventory.capacity,
    reason: stoneNode
      ? `Target ${stoneNode.node.label} (${stoneNode.node.amount} left)`
      : 'No reachable stone boulder',
  });

  // 7. Socialize with nearby available villager
  const socialPeer = world.villagers
    .filter(
      (o) =>
        o.id !== v.id &&
        !o.banished &&
        o.activity !== 'resting' &&
        (v.relationships[o.id]?.score ?? 0) > -45 &&
        dist(v.x, v.y, o.x, o.y) < 340,
    )
    .sort((a, b) => dist(v.x, v.y, a.x, a.y) - dist(v.x, v.y, b.x, b.y))[0];

  const socialNeedScore = Math.max(0, 88 - v.needs.social) * 0.85 + v.personality.sociability * 38;
  candidates.push({
    action: 'socialize',
    score: Number((v.socialCooldown <= 0 ? socialNeedScore : 0).toFixed(1)),
    valid: Boolean(socialPeer) && v.socialCooldown <= 0,
    reason: socialPeer ? `Talk with ${socialPeer.name.split(' ')[0]}` : 'No available peer nearby or on cooldown',
  });

  // 8. Explore surroundings
  candidates.push({
    action: 'explore',
    score: Number((18 + v.personality.curiosity * 34).toFixed(1)),
    valid: true,
    reason: `Curiosity ${Math.round(v.personality.curiosity * 100)}% urges scouting`,
  });

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const picked = sorted.find((c) => c.valid) ?? {
    action: 'explore',
    score: 10,
    valid: true,
    reason: 'Fallback scouting',
  };

  if (sorted[0] && !sorted[0].valid) {
    world.metrics.totalActionRejections++;
  }

  v.decision = {
    chosenAction: picked.action,
    chosenReason: picked.reason,
    validated: picked.valid,
    validationNote: sorted[0] && !sorted[0].valid ? `Top choice "${sorted[0].action}" blocked: ${sorted[0].reason}` : 'Action validated against world state',
    evaluatedAtSec: Number(world.timeSec.toFixed(1)),
    candidates: sorted.slice(0, 6),
  };

  // Apply chosen action into target & path
  v.targetNodeId = null;
  v.targetBuildingId = null;
  v.targetPeerId = null;

  if (picked.action === 'eat') {
    v.currentGoal = 'Eat food & restore hunger';
    if (v.inventory.food > 0) {
      v.activity = 'eating';
      v.actionTimer = 2.0;
      v.path = [];
    } else {
      const store = world.buildings.find((b) => b.kind === 'stockpile') ?? world.buildings[0];
      if (store) {
        const res = findSandboxPath(world, v.x, v.y, store.x, store.y);
        v.path = res.waypoints;
        v.targetX = store.x;
        v.targetY = store.y;
        v.targetBuildingId = store.id;
        v.activity = 'moving';
      }
    }
  } else if (picked.action === 'steal_food') {
    const store = world.buildings.find((b) => b.kind === 'stockpile');
    if (store) {
      v.currentGoal = 'Covertly take rations from stockpile';
      const res = findSandboxPath(world, v.x, v.y, store.x, store.y);
      v.path = res.waypoints;
      v.targetX = store.x;
      v.targetY = store.y;
      v.targetBuildingId = store.id;
      v.activity = 'moving';
    }
  } else if (picked.action === 'rest') {
    v.currentGoal = 'Rest beside hearth or shelter';
    const shelter =
      world.buildings.find((b) => b.beds > 0 && b.stage === 'complete') ??
      world.buildings.find((b) => b.kind === 'campfire');
    if (shelter) {
      const res = findSandboxPath(world, v.x, v.y, shelter.x + 18, shelter.y + 12);
      v.path = res.waypoints;
      v.targetX = shelter.x + 18;
      v.targetY = shelter.y + 12;
      v.targetBuildingId = shelter.id;
      v.activity = 'moving';
    } else {
      v.activity = 'resting';
      v.actionTimer = 4;
    }
  } else if (picked.action === 'haul') {
    const store = world.buildings.find((b) => b.kind === 'stockpile');
    if (store) {
      v.currentGoal = 'Deliver carried materials to stockpile';
      const res = findSandboxPath(world, v.x, v.y, store.x, store.y);
      v.path = res.waypoints;
      v.targetX = store.x;
      v.targetY = store.y;
      v.targetBuildingId = store.id;
      v.activity = 'hauling';
    }
  } else if (picked.action === 'plan_shelter') {
    const bp = getNextUnlockedHousingBlueprint(v);
    let bx = 235;
    let by = 515;
    const candidateSpots = [
      { x: 235, y: 515 },
      { x: 315, y: 515 },
      { x: 165, y: 380 },
      { x: 315, y: 245 },
      { x: 185, y: 245 },
    ];
    for (const spot of candidateSpots) {
      const clearOfBuildings = world.buildings.every((b) => dist(spot.x, spot.y, b.x, b.y) >= b.radius + 38);
      const clearOfNodes = world.nodes.every((n) => n.amount <= 0 || dist(spot.x, spot.y, n.x, n.y) >= n.radius + 36);
      if (clearOfBuildings && clearOfNodes && getTerrainAt(world, spot.x, spot.y) === 'land') {
        bx = spot.x;
        by = spot.y;
        break;
      }
    }
    const newB: SandboxBuilding = {
      id: `sb_build_${world.buildings.length + 1}`,
      kind: bp.kind,
      name: bp.name,
      housingTier: bp.tier,
      x: bx,
      y: by,
      radius: 28,
      beds: bp.beds,
      stage: 'foundation',
      progress: 0,
      requiredWood: bp.wood,
      requiredStone: bp.stone,
      deliveredWood: 0,
      deliveredStone: 0,
      assignedBuilderIds: [v.id],
      pausedForMaterials: false,
    };
    world.buildings.push(newB);
    recordEvent(world, {
      title: `Shelter Planned: ${bp.name}`,
      category: 'construction',
      significance: 'notable',
      involvedIds: [v.id],
      involvedNames: [v.name],
      description: `${v.name} staked a ${bp.name} foundation because beds (${beds}) < population (${activePop}).`,
    });
    v.currentGoal = `Build ${bp.name}`;
    const res = findSandboxPath(world, v.x, v.y, newB.x, newB.y + 30);
    v.path = res.waypoints;
    v.targetX = newB.x;
    v.targetY = newB.y + 30;
    v.targetBuildingId = newB.id;
    v.activity = 'moving';
  } else if (picked.action === 'build' && activeConstruction) {
    v.currentGoal = `Construct ${activeConstruction.name}`;
    const res = findSandboxPath(world, v.x, v.y, activeConstruction.x, activeConstruction.y + 32);
    v.path = res.waypoints;
    v.targetX = activeConstruction.x;
    v.targetY = activeConstruction.y + 32;
    v.targetBuildingId = activeConstruction.id;
    v.activity = 'moving';
  } else if (picked.action === 'gather_wood' && woodNode) {
    v.currentGoal = `Gather wood from ${woodNode.node.label}`;
    v.targetNodeId = woodNode.node.id;
    v.targetX = woodNode.node.x;
    v.targetY = woodNode.node.y;
    v.path = woodNode.path;
    v.activity = 'moving';
  } else if (picked.action === 'gather_food' && berryNode) {
    v.currentGoal = `Forage ${berryNode.node.label}`;
    v.targetNodeId = berryNode.node.id;
    v.targetX = berryNode.node.x;
    v.targetY = berryNode.node.y;
    v.path = berryNode.path;
    v.activity = 'moving';
  } else if (picked.action === 'gather_stone' && stoneNode) {
    v.currentGoal = `Mine ${stoneNode.node.label}`;
    v.targetNodeId = stoneNode.node.id;
    v.targetX = stoneNode.node.x;
    v.targetY = stoneNode.node.y;
    v.path = stoneNode.path;
    v.activity = 'moving';
  } else if (picked.action === 'socialize' && socialPeer) {
    v.currentGoal = `Converse with ${socialPeer.name.split(' ')[0]}`;
    v.targetPeerId = socialPeer.id;
    const res = findSandboxPath(world, v.x, v.y, socialPeer.x, socialPeer.y);
    v.path = res.waypoints;
    v.targetX = socialPeer.x;
    v.targetY = socialPeer.y;
    v.activity = 'moving';
  } else {
    // Explore a random walkable tile
    for (let tries = 0; tries < 8; tries++) {
      const tx = 90 + nextRand(world) * (world.width - 180);
      const ty = 90 + nextRand(world) * (world.height - 180);
      const res = findSandboxPath(world, v.x, v.y, tx, ty);
      if (res.reachable) {
        v.currentGoal = 'Explore clearing terrain';
        v.targetX = tx;
        v.targetY = ty;
        v.path = res.waypoints;
        v.activity = 'exploring';
        break;
      }
    }
  }
}

function handleSocialEncounter(world: SandboxWorld, a: SandboxVillager, b: SandboxVillager): void {
  const relA = a.relationships[b.id];
  const relB = b.relationships[a.id];
  if (!relA || !relB) return;

  const prevStageA = relA.stage;

  // Step 1: Introduction if never met
  if (!relA.introduced) {
    relA.introduced = true;
    relB.introduced = true;
    relA.score = clamp(relA.score + 8, -100, 100);
    relB.score = clamp(relB.score + 8, -100, 100);
    relA.stage = getRelationshipStage(relA.score);
    relB.stage = getRelationshipStage(relB.score);
    relA.conversations++;
    relB.conversations++;
    relA.lastInteractionSec = world.timeSec;
    relB.lastInteractionSec = world.timeSec;
    a.needs.social = clamp(a.needs.social + 18, 0, 100);
    b.needs.social = clamp(b.needs.social + 18, 0, 100);
    gainKnowledge(a, 'social_organization', 1.2);
    gainKnowledge(b, 'social_organization', 1.2);

    addMemory(a, world.timeSec, `Introduced myself to ${b.name}.`, 4, 'positive', b.id);
    addMemory(b, world.timeSec, `${a.name} introduced themselves kindly.`, 4, 'positive', a.id);

    recordEvent(world, {
      title: `${a.name.split(' ')[0]} introduced themselves to ${b.name.split(' ')[0]}`,
      category: 'introductions',
      significance: 'notable',
      involvedIds: [a.id, b.id],
      involvedNames: [a.name, b.name],
      description: `${a.name} and ${b.name} exchanged names and first impressions.`,
      relationshipDelta: '+8 mutual trust',
    });
    return;
  }

  // Step 2: Contextual interaction based on personality & honesty/generosity
  const compat =
    1 -
    (Math.abs(a.personality.honesty - b.personality.honesty) * 0.5 +
      Math.abs(a.personality.generosity - b.personality.generosity) * 0.5);
  const conflictRoll = nextRand(world);

  if (compat < 0.45 && conflictRoll < 0.42) {
    // Disagreement / Argument
    const delta = -10;
    relA.score = clamp(relA.score + delta, -100, 100);
    relB.score = clamp(relB.score + delta, -100, 100);
    relA.negativeEvents++;
    relB.negativeEvents++;
    relA.stage = getRelationshipStage(relA.score);
    relB.stage = getRelationshipStage(relB.score);
    a.needs.mood = clamp(a.needs.mood - 6, 0, 100);
    b.needs.mood = clamp(b.needs.mood - 6, 0, 100);

    addMemory(a, world.timeSec, `Argued with ${b.name} over camp duties.`, 5, 'negative', b.id);
    addMemory(b, world.timeSec, `Had a heated disagreement with ${a.name}.`, 5, 'negative', a.id);
    recordEvent(world, {
      title: `${a.name.split(' ')[0]} and ${b.name.split(' ')[0]} had a disagreement`,
      category: 'conflicts',
      significance: 'notable',
      involvedIds: [a.id, b.id],
      involvedNames: [a.name, b.name],
      description: `Contrasting values sparked an argument between ${a.name} and ${b.name}.`,
      relationshipDelta: `${delta} bond`,
    });
  } else if (a.personality.generosity > 0.68 && a.inventory.food > 0 && b.needs.hunger < 65) {
    // Share food
    a.inventory.food -= 1;
    b.needs.hunger = clamp(b.needs.hunger + 22, 0, 100);
    relA.score = clamp(relA.score + 12, -100, 100);
    relB.score = clamp(relB.score + 15, -100, 100);
    relA.positiveEvents++;
    relB.positiveEvents++;
    a.reputation = clamp(a.reputation + 4, -100, 100);
    relA.stage = getRelationshipStage(relA.score);
    relB.stage = getRelationshipStage(relB.score);

    addMemory(b, world.timeSec, `${a.name} shared food when I was hungry.`, 7, 'positive', a.id);
    recordEvent(world, {
      title: `${a.name.split(' ')[0]} shared food with ${b.name.split(' ')[0]}`,
      category: 'cooperation',
      significance: 'notable',
      involvedIds: [a.id, b.id],
      involvedNames: [a.name, b.name],
      description: `${a.name} noticed ${b.name}'s hunger and gave a portion from their pack.`,
      relationshipDelta: '+15 bond',
    });
  } else if (a.knowledge.construction - b.knowledge.construction >= 6) {
    // Teach construction / woodcraft
    const lessonGain = 4.5;
    gainKnowledge(b, 'construction', lessonGain);
    b.skills.masonry = Math.max(b.skills.masonry, Math.floor(b.knowledge.construction / 25) + 1);
    relA.score = clamp(relA.score + 9, -100, 100);
    relB.score = clamp(relB.score + 11, -100, 100);
    relA.positiveEvents++;
    relB.positiveEvents++;
    relA.stage = getRelationshipStage(relA.score);
    relB.stage = getRelationshipStage(relB.score);
    addMemory(b, world.timeSec, `${a.name} taught me construction techniques.`, 6, 'positive', a.id);
    recordEvent(world, {
      title: `${a.name.split(' ')[0]} taught ${b.name.split(' ')[0]} building craft`,
      category: 'learning',
      significance: 'notable',
      involvedIds: [a.id, b.id],
      involvedNames: [a.name, b.name],
      description: `${a.name} shared practical shelter-building knowledge (+${lessonGain} Construction).`,
      relationshipDelta: '+11 bond',
    });
  } else {
    // Regular conversation — gradual stage climb
    const gain = 6 + Math.round(compat * 4);
    relA.score = clamp(relA.score + gain, -100, 100);
    relB.score = clamp(relB.score + gain, -100, 100);
    relA.conversations++;
    relB.conversations++;
    relA.positiveEvents++;
    relB.positiveEvents++;
    relA.stage = getRelationshipStage(relA.score);
    relB.stage = getRelationshipStage(relB.score);
    a.needs.social = clamp(a.needs.social + 16, 0, 100);
    b.needs.social = clamp(b.needs.social + 16, 0, 100);
    gainKnowledge(a, 'social_organization', 0.8);
    gainKnowledge(b, 'social_organization', 0.8);

    recordEvent(world, {
      title: `${a.name.split(' ')[0]} & ${b.name.split(' ')[0]} conversed`,
      category: 'conversations',
      significance: 'minor',
      involvedIds: [a.id, b.id],
      involvedNames: [a.name, b.name],
      description: `${a.name} and ${b.name} spoke about gathering and shelter conditions.`,
      relationshipDelta: `+${gain} bond`,
    });
  }

  relA.lastInteractionSec = world.timeSec;
  relB.lastInteractionSec = world.timeSec;

  if (relA.stage !== prevStageA && (relA.stage === 'acquaintance' || relA.stage === 'friend' || relA.stage === 'close_friend')) {
    recordEvent(world, {
      title: `${a.name.split(' ')[0]} & ${b.name.split(' ')[0]} became ${RELATIONSHIP_STAGE_META[relA.stage].label}s`,
      category: 'friendships',
      significance: 'major',
      involvedIds: [a.id, b.id],
      involvedNames: [a.name, b.name],
      description: `Through repeated conversations and shared experiences, their bond reached ${RELATIONSHIP_STAGE_META[relA.stage].label}.`,
    });
  }
}

function handleTheftAndGovernance(world: SandboxWorld, thief: SandboxVillager): void {
  if (world.stockpile.food <= 0) return;
  const stolen = Math.min(2, world.stockpile.food);
  world.stockpile.food -= stolen;
  thief.needs.hunger = clamp(thief.needs.hunger + stolen * 22, 0, 100);
  thief.ruleViolations++;
  thief.reputation = clamp(thief.reputation - 22, -100, 100);

  const witnesses = world.villagers.filter(
    (v) => v.id !== thief.id && !v.banished && dist(v.x, v.y, thief.x, thief.y) < 260,
  );
  for (const w of witnesses) {
    w.witnessedViolations[thief.id] = (w.witnessedViolations[thief.id] ?? 0) + 1;
    const rel = w.relationships[thief.id];
    if (rel) {
      rel.score = clamp(rel.score - 24, -100, 100);
      rel.negativeEvents++;
      rel.stage = getRelationshipStage(rel.score);
    }
    addMemory(w, world.timeSec, `Witnessed ${thief.name} stealing food from stockpile!`, 9, 'negative', thief.id);
    gainKnowledge(w, 'governance', 5);
  }

  recordEvent(world, {
    title: `${thief.name} stole rations from stockpile`,
    category: 'conflicts',
    significance: 'major',
    involvedIds: [thief.id, ...witnesses.map((w) => w.id)],
    involvedNames: [thief.name, ...witnesses.map((w) => w.name)],
    description: `${thief.name} took ${stolen} food in violation of camp rules (${witnesses.length} witness${witnesses.length === 1 ? '' : 'es'}).`,
    consequence: 'Community standing dropped -22',
  });

  // Governance evaluation: require >=2 offenses & collective majority disapproval (not single accusation!)
  if (thief.ruleViolations >= 2) {
    const voters = world.villagers.filter((v) => v.id !== thief.id && !v.banished);
    let votesForBanish = 0;
    for (const v of voters) {
      const score = v.relationships[thief.id]?.score ?? 0;
      const witnessed = v.witnessedViolations[thief.id] ?? 0;
      if (score <= -20 || witnessed >= 2 || (witnessed >= 1 && v.personality.honesty > 0.7)) {
        votesForBanish++;
      }
    }
    if (voters.length >= 2 && votesForBanish > voters.length / 2) {
      thief.banished = true;
      thief.activity = 'leaving';
      thief.currentGoal = 'Banished — departing the clearing';
      thief.targetX = 35;
      thief.targetY = 380;
      const escape = findSandboxPath(world, thief.x, thief.y, 35, 380);
      thief.path = escape.waypoints;

      recordEvent(world, {
        title: `Community banished ${thief.name}`,
        category: 'governance',
        significance: 'major',
        involvedIds: [thief.id, ...voters.map((v) => v.id)],
        involvedNames: [thief.name, ...voters.map((v) => v.name)],
        description: `After ${thief.ruleViolations} verified thefts, ${votesForBanish}/${voters.length} villagers voted for banishment.`,
        consequence: `${thief.name} must physically leave the settlement`,
      });
    }
  }
}

function advanceConstruction(world: SandboxWorld, b: SandboxBuilding, builder: SandboxVillager, dt: number): void {
  // Pull materials from builder inventory or stockpile
  if (b.deliveredWood < b.requiredWood) {
    const takeInv = Math.min(builder.inventory.wood, b.requiredWood - b.deliveredWood);
    if (takeInv > 0) {
      builder.inventory.wood -= takeInv;
      b.deliveredWood += takeInv;
    }
    const takeStock = Math.min(world.stockpile.wood, b.requiredWood - b.deliveredWood);
    if (takeStock > 0) {
      world.stockpile.wood -= takeStock;
      b.deliveredWood += takeStock;
    }
  }
  if (b.deliveredStone < b.requiredStone) {
    const takeInv = Math.min(builder.inventory.stone, b.requiredStone - b.deliveredStone);
    if (takeInv > 0) {
      builder.inventory.stone -= takeInv;
      b.deliveredStone += takeInv;
    }
    const takeStock = Math.min(world.stockpile.stone, b.requiredStone - b.deliveredStone);
    if (takeStock > 0) {
      world.stockpile.stone -= takeStock;
      b.deliveredStone += takeStock;
    }
  }

  const maxAllowedByMats =
    ((b.deliveredWood / Math.max(1, b.requiredWood)) * 0.65 +
      (b.deliveredStone / Math.max(1, b.requiredStone)) * 0.35) *
    100;

  if (b.progress >= maxAllowedByMats && b.deliveredWood < b.requiredWood) {
    b.pausedForMaterials = true;
    builder.activity = 'idle';
    builder.decisionCooldown = 0.2;
    return;
  }

  b.pausedForMaterials = false;
  const speed = 11 + builder.skills.masonry * 3;
  const prevStage = b.stage;
  b.progress = clamp(Math.min(maxAllowedByMats, b.progress + speed * dt), 0, 100);
  gainKnowledge(builder, 'construction', dt * 0.7);

  if (b.progress >= 100 && b.deliveredWood >= b.requiredWood && b.deliveredStone >= b.requiredStone) {
    b.stage = 'complete';
    b.progress = 100;
    world.metrics.housesConstructedCount++;
    builder.skills.masonry = Math.min(10, builder.skills.masonry + 1);
    addMemory(builder, world.timeSec, `Completed construction of ${b.name}.`, 7, 'positive');
    recordEvent(world, {
      title: `${b.name} Completed`,
      category: 'construction',
      significance: 'major',
      involvedIds: [builder.id],
      involvedNames: [builder.name],
      description: `${builder.name} finished the roof and opened ${b.name} (+${b.beds} beds).`,
    });
    builder.activity = 'idle';
    builder.decisionCooldown = 0.3;
  } else if (b.progress >= 75) {
    b.stage = 'roof';
  } else if (b.progress >= 50) {
    b.stage = 'walls';
  } else if (b.progress >= 25) {
    b.stage = 'framework';
  } else {
    b.stage = 'foundation';
  }

  if (b.stage !== prevStage && b.stage !== 'complete') {
    recordEvent(world, {
      title: `${b.name}: ${b.stage} stage reached`,
      category: 'construction',
      significance: 'minor',
      involvedIds: [builder.id],
      involvedNames: [builder.name],
      description: `Construction progressed from ${prevStage} to ${b.stage}.`,
    });
  }
}

function stepAnimals(world: SandboxWorld, dt: number): void {
  for (const a of world.animals) {
    a.hunger = clamp(a.hunger - dt * 0.85, 0, 100);
    a.energy = clamp(a.energy - dt * (a.state === 'fleeing' ? 2.4 : 0.45), 0, 100);

    // Threat detection against nearby villagers
    const nearestVillager = world.villagers
      .filter((v) => !v.banished)
      .sort((u, v) => dist(a.x, a.y, u.x, u.y) - dist(a.x, a.y, v.x, v.y))[0];
    const threatDist = nearestVillager ? dist(a.x, a.y, nearestVillager.x, nearestVillager.y) : Infinity;

    if (nearestVillager && threatDist < (a.species === 'rabbit' ? 85 : a.species === 'deer' ? 105 : 65)) {
      if (a.species === 'rabbit' || a.species === 'deer') {
        a.state = 'fleeing';
        const ang = Math.atan2(a.y - nearestVillager.y, a.x - nearestVillager.x);
        a.targetX = clamp(a.x + Math.cos(ang) * 140, 45, world.width - 45);
        a.targetY = clamp(a.y + Math.sin(ang) * 140, 45, world.height - 45);
      } else if (a.species === 'boar' && threatDist < 55) {
        a.state = 'charging';
        a.targetX = nearestVillager.x;
        a.targetY = nearestVillager.y;
      }
    } else if (a.pauseTimer > 0) {
      a.pauseTimer -= dt;
      if (a.state === 'sleeping' || a.state === 'resting') {
        a.energy = clamp(a.energy + dt * 5.5, 0, 100);
      } else if (a.state === 'grazing') {
        a.hunger = clamp(a.hunger + dt * 6.5, 0, 100);
      }
      continue;
    } else if (a.energy < 28) {
      a.state = 'sleeping';
      a.pauseTimer = 4.5;
      continue;
    } else if (a.hunger < 45) {
      // Seek shallow water shore to drink or meadow grass to graze
      if (nextRand(world) < 0.35) {
        a.state = 'drinking';
        const ang = nextRand(world) * Math.PI * 2;
        a.targetX = world.pond.cx + Math.cos(ang) * (world.pond.shallowRadiusX * 0.88);
        a.targetY = world.pond.cy + Math.sin(ang) * (world.pond.shallowRadiusY * 0.88);
      } else {
        a.state = 'grazing';
        a.targetX = clamp(a.x + (nextRand(world) - 0.5) * 160, 45, world.width - 45);
        a.targetY = clamp(a.y + (nextRand(world) - 0.5) * 160, 45, world.height - 45);
      }
    } else if (dist(a.x, a.y, a.targetX, a.targetY) < 12) {
      a.state = 'resting';
      a.pauseTimer = 1.6 + nextRand(world) * 2.4;
      continue;
    }

    const d = dist(a.x, a.y, a.targetX, a.targetY);
    if (d > 4) {
      const spd =
        a.state === 'fleeing'
          ? 78
          : a.state === 'charging'
            ? 62
            : a.species === 'rabbit'
              ? 36
              : 28;
      const nx = a.x + ((a.targetX - a.x) / d) * spd * dt;
      const ny = a.y + ((a.targetY - a.y) / d) * spd * dt;
      const nextTerrain = getTerrainAt(world, nx, ny);
      if (nextTerrain !== 'deep_water') {
        a.x = clamp(nx, 30, world.width - 30);
        a.y = clamp(ny, 30, world.height - 30);
        a.terrainUnderfoot = nextTerrain;
      } else {
        // Turn away from deep water
        a.targetX = clamp(a.x + (nextRand(world) - 0.5) * 140, 45, world.width - 45);
        a.targetY = clamp(a.y + (nextRand(world) - 0.5) * 140, 45, world.height - 45);
        a.pauseTimer = 0.4;
      }
    } else {
      if (a.state === 'drinking' || a.state === 'grazing') {
        a.hunger = clamp(a.hunger + 22, 0, 100);
      }
      a.pauseTimer = 2.0 + nextRand(world) * 2.0;
    }
  }
}

function stepBoatsAndMigration(world: SandboxWorld, dt: number): void {
  for (const boat of world.boats) {
    if (boat.state === 'approaching') {
      const d = dist(boat.x, boat.y, boat.targetX, boat.targetY);
      if (d > 8) {
        boat.x += ((boat.targetX - boat.x) / d) * 34 * dt;
        boat.y += ((boat.targetY - boat.y) / d) * 34 * dt;
      } else {
        boat.state = 'docked';
        recordEvent(world, {
          title: `${boat.name} docked at shore`,
          category: 'migration',
          significance: 'major',
          involvedIds: [],
          involvedNames: boat.passengerNames,
          description: `External travelers (${boat.passengerNames.join(', ')}) arrived by boat at the landing pier.`,
        });
      }
    } else if (boat.state === 'docked' && !boat.disembarked) {
      boat.disembarked = true;
      for (let i = 0; i < boat.passengerNames.length; i++) {
        const idx = world.villagers.length;
        const nv = createVillager(
          world,
          idx,
          boat.targetX - 38 - i * 24,
          boat.targetY + (i === 0 ? -16 : 18),
          undefined,
          true,
        );
        nv.name = boat.passengerNames[i];
        // Initialize mutual stranger relationships with existing villagers
        for (const existing of world.villagers) {
          nv.relationships[existing.id] = {
            peerId: existing.id,
            score: 0,
            stage: 'stranger',
            conversations: 0,
            positiveEvents: 0,
            negativeEvents: 0,
            lastInteractionSec: -999,
            introduced: false,
          };
          existing.relationships[nv.id] = {
            peerId: nv.id,
            score: 0,
            stage: 'stranger',
            conversations: 0,
            positiveEvents: 0,
            negativeEvents: 0,
            lastInteractionSec: -999,
            introduced: false,
          };
        }
        world.villagers.push(nv);
      }
      recordEvent(world, {
        title: `${boat.passengerNames.join(' & ')} disembarked`,
        category: 'migration',
        significance: 'major',
        involvedIds: world.villagers.slice(-boat.passengerNames.length).map((v) => v.id),
        involvedNames: boat.passengerNames,
        description: 'Migrants stepped ashore and began meeting local villagers.',
      });
    }
  }
}

export function stepSandbox(world: SandboxWorld, dt: number): void {
  if (world.completed) return;
  const clampedDt = Math.min(0.25, Math.max(0, dt));
  world.timeSec += clampedDt;

  if (world.config.durationSeconds > 0 && world.timeSec >= world.config.durationSeconds) {
    world.timeSec = world.config.durationSeconds;
    world.completed = true;
    return;
  }

  // Slow regulated renewable regrowth (stone boulders NEVER regenerate)
  for (const n of world.nodes) {
    if (n.renewable && n.amount > 0 && n.amount < n.maxAmount) {
      n.regrowTimer += clampedDt;
      if (n.regrowTimer >= 45) {
        n.regrowTimer = 0;
        n.amount = Math.min(n.maxAmount, n.amount + 1);
      }
    }
  }

  stepAnimals(world, clampedDt);
  stepBoatsAndMigration(world, clampedDt);

  // Step Villagers
  for (const v of world.villagers) {
    v.needs.hunger = clamp(v.needs.hunger - clampedDt * 0.52, 0, 100);
    v.needs.energy = clamp(
      v.needs.energy - clampedDt * (v.activity === 'resting' ? -9.5 : v.activity === 'gathering' || v.activity === 'building' ? 0.65 : 0.35),
      0,
      100,
    );
    v.needs.social = clamp(v.needs.social - clampedDt * 0.32, 0, 100);
    if (v.socialCooldown > 0) v.socialCooldown = Math.max(0, v.socialCooldown - clampedDt);

    if (v.banished) {
      // Walk off the map
      if (v.path.length > 0) {
        const wp = v.path[0];
        const d = dist(v.x, v.y, wp.x, wp.y);
        if (d < 8) v.path.shift();
        else {
          v.x += ((wp.x - v.x) / d) * 58 * clampedDt;
          v.y += ((wp.y - v.y) / d) * 58 * clampedDt;
        }
      }
      continue;
    }

    // Active timed action (eating, resting, gathering, building)
    if (v.activity === 'eating') {
      v.actionTimer -= clampedDt;
      if (v.actionTimer <= 0) {
        if (v.inventory.food > 0) {
          v.inventory.food -= 1;
          v.needs.hunger = clamp(v.needs.hunger + 34, 0, 100);
          v.needs.mood = clamp(v.needs.mood + 5, 0, 100);
        } else if (world.stockpile.food > 0) {
          world.stockpile.food -= 1;
          v.needs.hunger = clamp(v.needs.hunger + 34, 0, 100);
        }
        v.activity = 'idle';
        v.decisionCooldown = 0.25;
      }
      continue;
    }

    if (v.activity === 'resting') {
      v.actionTimer -= clampedDt;
      if (v.actionTimer <= 0 || v.needs.energy >= 90) {
        v.activity = 'idle';
        v.decisionCooldown = 0.25;
      }
      continue;
    }

    if (v.activity === 'gathering') {
      v.actionTimer -= clampedDt;
      if (v.actionTimer <= 0) {
        const node = world.nodes.find((n) => n.id === v.targetNodeId);
        if (node && node.amount > 0) {
          const space = v.inventory.capacity - (v.inventory.wood + v.inventory.stone + v.inventory.food);
          const taken = Math.min(2, node.amount, Math.max(0, space));
          if (taken > 0) {
            node.amount -= taken;
            world.metrics.totalResourcesGathered += taken;
            if (node.yieldType === 'wood') {
              v.inventory.wood += taken;
              gainKnowledge(v, 'resource_gathering', 1.1);
            } else if (node.yieldType === 'stone') {
              v.inventory.stone += taken;
              gainKnowledge(v, 'resource_gathering', 1.2);
            } else {
              v.inventory.food += taken;
              gainKnowledge(v, 'survival', 1.0);
            }
            if (node.amount === 0) {
              addMemory(v, world.timeSec, `${node.label} was fully depleted.`, 4, 'neutral');
              recordEvent(world, {
                title: `${node.label} depleted`,
                category: 'learning',
                significance: 'minor',
                involvedIds: [v.id],
                involvedNames: [v.name],
                description: `${v.name} gathered the remaining ${node.yieldType} from ${node.label} (0 remaining).`,
              });
            }
          }
        }
        v.activity = 'idle';
        v.decisionCooldown = 0.25;
      }
      continue;
    }

    if (v.activity === 'building') {
      const b = world.buildings.find((item) => item.id === v.targetBuildingId && item.stage !== 'complete');
      if (!b) {
        v.activity = 'idle';
        v.decisionCooldown = 0.2;
      } else {
        advanceConstruction(world, b, v, clampedDt);
      }
      continue;
    }

    // Re-evaluate decision if idle or cooldown expired
    v.decisionCooldown -= clampedDt;
    if (v.activity === 'idle' || (v.path.length === 0 && v.decisionCooldown <= 0)) {
      evaluateDecision(world, v);
      v.decisionCooldown = 1.6 + nextRand(world) * 0.8;
    }

    // If walking toward a social peer, keep destination synced if peer moved significantly
    if (v.activity === 'moving' && v.targetPeerId) {
      const peer = world.villagers.find((p) => p.id === v.targetPeerId && !p.banished);
      if (!peer) {
        v.path = [];
        v.activity = 'idle';
      } else if (dist(v.x, v.y, peer.x, peer.y) <= 44) {
        // Reached social interaction distance
        v.path = [];
      } else if (v.targetX !== null && v.targetY !== null && dist(v.targetX, v.targetY, peer.x, peer.y) > 42) {
        const res = findSandboxPath(world, v.x, v.y, peer.x, peer.y);
        v.path = res.waypoints;
        v.targetX = peer.x;
        v.targetY = peer.y;
      }
    }

    // Check realistic interaction radius for nodes and buildings so villagers never fight solid pushout
    if ((v.activity === 'moving' || v.activity === 'hauling') && v.targetNodeId) {
      const targetNode = world.nodes.find((n) => n.id === v.targetNodeId);
      if (!targetNode || targetNode.amount <= 0) {
        v.path = [];
        v.activity = 'idle';
        v.decisionCooldown = 0.1;
      } else if (dist(v.x, v.y, targetNode.x, targetNode.y) <= targetNode.radius + v.radius + 14) {
        v.path = [];
      }
    } else if ((v.activity === 'moving' || v.activity === 'hauling') && v.targetBuildingId) {
      const targetBldg = world.buildings.find((b) => b.id === v.targetBuildingId);
      if (targetBldg && dist(v.x, v.y, targetBldg.x, targetBldg.y) <= targetBldg.radius + v.radius + 16) {
        v.path = [];
      }
    }

    // Follow A* waypoints with water depth speed + collision recovery
    if (v.path.length > 0) {
      const wp = v.path[0];
      const d = dist(v.x, v.y, wp.x, wp.y);
      if (d <= 8) {
        v.path.shift();
      } else {
        const terrain = getTerrainAt(world, v.x, v.y);
        v.collision.terrainUnderfoot = terrain;
        const speedMult = terrain === 'shallow_water' ? 0.55 : terrain === 'bridge' ? 1.08 : 1.0;
        const baseSpeed = 62 * speedMult;
        let dirX = (wp.x - v.x) / d;
        let dirY = (wp.y - v.y) / d;

        if (v.collision.detourActive) {
          const rot = v.collision.detourSign * 1.15;
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          const rx = dirX * cos - dirY * sin;
          const ry = dirX * sin + dirY * cos;
          dirX = rx;
          dirY = ry;
        }

        const nx = clamp(v.x + dirX * baseSpeed * clampedDt, 24, world.width - 24);
        const ny = clamp(v.y + dirY * baseSpeed * clampedDt, 24, world.height - 24);
        const nextTerrain = getTerrainAt(world, nx, ny);
        if (nextTerrain !== 'deep_water') {
          v.collision.vx = (nx - v.x) / Math.max(0.001, clampedDt);
          v.collision.vy = (ny - v.y) / Math.max(0.001, clampedDt);
          v.collision.speed = Math.hypot(v.collision.vx, v.collision.vy);
          v.facing = dirX >= 0 ? 1 : -1;
          v.x = nx;
          v.y = ny;
        } else {
          v.collision.blockedBy = 'deep_water';
          v.path = [];
          v.activity = 'idle';
          v.decisionCooldown = 0.2;
        }
      }

      // Stuck monitor
      v.collision.progressCheckTimer += clampedDt;
      if (v.collision.progressCheckTimer >= 0.7) {
        const moved = dist(v.x, v.y, v.collision.lastPosX, v.collision.lastPosY);
        if (moved < 3.2) {
          v.collision.stuckTimer += v.collision.progressCheckTimer;
          if (!v.collision.detourActive && v.collision.stuckTimer >= 0.7) {
            v.collision.detourActive = true;
            v.collision.recoveryCount++;
          } else if (v.collision.stuckTimer >= 2.1) {
            v.collision.detourSign = v.collision.detourSign === 1 ? -1 : 1;
            v.collision.detourActive = false;
            v.collision.stuckTimer = 0;
            // Recompute A* path cleanly
            if (v.targetX !== null && v.targetY !== null) {
              const replan = findSandboxPath(world, v.x, v.y, v.targetX, v.targetY);
              v.path = replan.waypoints;
            }
          }
        } else {
          v.collision.stuckTimer = 0;
          v.collision.detourActive = false;
          v.collision.blockedBy = null;
        }
        v.collision.lastPosX = v.x;
        v.collision.lastPosY = v.y;
        v.collision.progressCheckTimer = 0;
      }
    } else if (v.activity === 'moving' || v.activity === 'hauling' || v.activity === 'exploring') {
      v.collision.vx = 0;
      v.collision.vy = 0;
      v.collision.speed = 0;
      // Arrived at destination
      if (v.decision.chosenAction === 'steal_food') {
        handleTheftAndGovernance(world, v);
        v.activity = 'idle';
        v.decisionCooldown = 0.5;
      } else if (v.decision.chosenAction === 'eat') {
        v.activity = 'eating';
        v.actionTimer = 1.8;
      } else if (v.decision.chosenAction === 'rest') {
        v.activity = 'resting';
        v.actionTimer = 4.0;
      } else if (v.activity === 'hauling') {
        world.stockpile.wood += v.inventory.wood;
        world.stockpile.stone += v.inventory.stone;
        world.stockpile.food += v.inventory.food;
        v.inventory.wood = 0;
        v.inventory.stone = 0;
        v.inventory.food = 0;
        v.activity = 'idle';
        v.decisionCooldown = 0.25;
      } else if (v.targetBuildingId && (v.decision.chosenAction === 'build' || v.decision.chosenAction === 'plan_shelter')) {
        v.activity = 'building';
      } else if (v.targetNodeId) {
        const node = world.nodes.find((n) => n.id === v.targetNodeId);
        if (node && node.amount > 0 && dist(v.x, v.y, node.x, node.y) <= node.radius + 28) {
          v.activity = 'gathering';
          v.actionTimer = 1.8;
        } else {
          v.activity = 'idle';
        }
      } else if (v.targetPeerId) {
        const peer = world.villagers.find((p) => p.id === v.targetPeerId && !p.banished);
        if (peer && dist(v.x, v.y, peer.x, peer.y) <= 64) {
          handleSocialEncounter(world, v, peer);
          v.socialCooldown = 12 + nextRand(world) * 8;
          peer.socialCooldown = Math.max(peer.socialCooldown, 8);
        }
        v.activity = 'idle';
        v.decisionCooldown = 0.4;
      } else {
        gainKnowledge(v, 'exploration', 0.9);
        v.activity = 'idle';
        v.decisionCooldown = 0.4;
      }
    }
  }

  // Pairwise villager separation & solid obstacle resolution (prevents overlapping / freezing)
  let overlapPairs = 0;
  for (let i = 0; i < world.villagers.length; i++) {
    const a = world.villagers[i];
    if (a.banished) continue;
    for (let j = i + 1; j < world.villagers.length; j++) {
      const b = world.villagers[j];
      if (b.banished) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const minSep = a.radius + b.radius + 2;
      if (d < minSep) {
        overlapPairs++;
        const push = (minSep - d) * 0.52;
        const ux = d > 0.001 ? dx / d : 1;
        const uy = d > 0.001 ? dy / d : 0;
        const axNext = clamp(a.x - ux * push, 24, world.width - 24);
        const ayNext = clamp(a.y - uy * push, 24, world.height - 24);
        const bxNext = clamp(b.x + ux * push, 24, world.width - 24);
        const byNext = clamp(b.y + uy * push, 24, world.height - 24);
        if (getTerrainAt(world, axNext, ayNext) !== 'deep_water') {
          a.x = axNext;
          a.y = ayNext;
        }
        if (getTerrainAt(world, bxNext, byNext) !== 'deep_water') {
          b.x = bxNext;
          b.y = byNext;
        }
        a.collision.blockedBy = b.name.split(' ')[0];
        b.collision.blockedBy = a.name.split(' ')[0];
      }
    }

    // Solid obstacle pushout (trees, boulders, buildings)
    for (const n of world.nodes) {
      if (n.amount <= 0) continue;
      const dx = a.x - n.x;
      const dy = a.y - n.y;
      const d = Math.hypot(dx, dy);
      const minR = a.radius + n.radius;
      if (d < minR) {
        const ux = d > 0.001 ? dx / d : 1;
        const uy = d > 0.001 ? dy / d : 0;
        const nx = clamp(n.x + ux * minR, 24, world.width - 24);
        const ny = clamp(n.y + uy * minR, 24, world.height - 24);
        if (getTerrainAt(world, nx, ny) !== 'deep_water') {
          a.x = nx;
          a.y = ny;
        }
        a.collision.blockedBy = n.label;
      }
    }
  }
  world.metrics.peakOverlapPairs = Math.max(world.metrics.peakOverlapPairs, overlapPairs);
}

export function runSandboxToCompletion(
  world: SandboxWorld,
  stepDt = 0.25,
  maxSteps = 4000,
): SandboxWorld {
  let steps = 0;
  while (!world.completed && steps < maxSteps) {
    stepSandbox(world, stepDt);
    steps++;
  }
  return world;
}
