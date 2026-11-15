import {
  ALL_SKILL_IDS,
  applyArchipelagoSeed,
  buildBioFromTraits,
  COMFORT_LABELS,
  CURRENT_WORLD_VERSION,
  DEFAULT_WORLD_SEED,
  ERA_LABELS,
  generateCandidate,
  getIslandAtPoint,
  getUpgradeCost,
  inheritBabyTraits,
  INITIAL_SKY_BRIDGES,
  INITIAL_SKY_CABLEWAYS,
  islandCoastWobble,
  ISLAND_DEFS,
  ISLAND_ORDER,
  isPointInsideIsland,
  mulberry32,
  pickFavoriteComfort,
  pickRandomWish,
  PLAYER_VILLAGE_ISLANDS,
  rollBalancedTraits,
  rollStarterSkills,
  rollUnitStats,
  SEASON_META,
  SKILL_META,
  TASK_BY_ID,
  TASKS,
  TRAITS,
  WISH_LABELS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './catalog';
import {
  buildArchipelagoLandmarks,
  pondDepthAtSim,
  riverDepthAtSim,
  terrainSlopeAtSim,
} from './lowPolyWorld';
import {
  addToVillagerInventory,
  canBuildCottage,
  deliverMaterialsForStage,
  depositCarriedToVillage,
  getCarryCap,
  getConstructionStageForRatio,
  harvestWildNode,
  hasFoundationResources,
  initStagedBuildingMaterials,
  tickWildNodeRegrowth,
  villageNeedsHousing,
} from './economy';
import { emitWorldEvent, mapChronicleKindToEventCategory } from './eventBus';
import {
  advanceKnowledge,
  createKnowledgeProfile,
  ensureVillagerKnowledge,
} from './knowledge';
import {
  checkTargetReachability,
  classifyMainWorldTerrain,
  findBridgeStepNav,
  findCablewayStepNav,
  isOnBuiltBridgeNav,
  steerMainWorldEntity,
} from './navigation';
import {
  ensureGovernanceArrays,
  recordPositiveContribution,
  spreadIncidentRumor,
  tickGovernance,
} from './governance';
import {
  dispatchMigrantBoat,
  getGreetingVillagerForIsland,
  getMigrantLandingPoint,
  sendMigrantBoatAway,
  tickMigrantBoatLifecycle,
} from './migration';
import { evaluateVillagerDecision } from './npcBrain';
import { buildNpcPersonality, getNpcPersonality, recordNpcMemory } from './personality';
import { ensureWildAnimalState, stepWildAnimalBehavior } from './wildlife';
import {
  ensureSocialRecord,
  processBonfireSocialCircle,
  processDirectSocialShift,
  processSocialEncounter,
} from './social';
import {
  BUILDING_BLUEPRINTS,
  CROP_META,
  CULTURES,
  getAvailableFrontierTechs,
  getTechModifiers,
  LIVESTOCK_META,
  TECH_BY_ID,
  TECH_TREE,
  VILLAGE_CUSTOM_META,
} from './techAndCultures';
import type {
  ArrivalCandidate,
  AspirationItem,
  BoatEntity,
  BoatKind,
  BorderPolicy,
  BuildingEntity,
  BuildingType,
  ChiefFocus,
  ChronicleEntry,
  CognitiveStage,
  CropType,
  CultureId,
  DeathCause,
  EntityStuckState,
  ExploreRuinEntity,
  GameMode,
  GodCommentKind,
  HudSnapshot,
  IslandDef,
  IslandId,
  LineageRecord,
  LivestockKind,
  Particle,
  PlacedSuggestion,
  ProjectileFx,
  RationMode,
  ResourceFlowStats,
  SeasonType,
  SkillId,
  SkyBridgeEntity,
  SkyCablewayEntity,
  TaskType,
  VillageCultureProfile,
  VillageCustomId,
  VillageEra,
  VillagePolicy,
  VillageResources,
  VillagerEntity,
  WildHerdEntity,
  WildNodeEntity,
  WorldCommand,
  WorldState,
} from './types';

const ARCHIPELAGO_LANDMARKS = buildArchipelagoLandmarks();

const STORAGE_KEY = 'hearthglen_village_save_v9';
const LEGACY_STORAGE_KEYS = [
  'hearthglen_village_save_v8',
  'hearthglen_village_save_v7',
  'hearthglen_village_save_v6',
  'hearthglen_village_save_v5',
  'hearthglen_village_save_v4',
  'hearthglen_village_save_v3',
  'hearthglen_village_save_v2',
];
const PARTICLE_POOL_SIZE = 280;

export function makeEmptyResources(): VillageResources {
  return {
    food: 0,
    berries: 0,
    grain: 0,
    meat: 0,
    fish: 0,
    timber: 0,
    stone: 0,
    copper: 0,
    bronze: 0,
    iron: 0,
    wool: 0,
    hides: 0,
    herbs: 0,
    hearthlight: 0,
  };
}

export function makeEmptyFlow(): ResourceFlowStats {
  return {
    foodIn: 0,
    foodOut: 0,
    timberIn: 0,
    timberOut: 0,
    stoneIn: 0,
    stoneOut: 0,
    oreIn: 0,
    oreOut: 0,
  };
}

export function createParticlePool(): Particle[] {
  return Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
    active: false,
    kind: 'heart',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 2,
    alpha: 1,
    phase: 0,
    color: '#fff',
  }));
}

export function spawnParticle(
  pool: Particle[] | undefined,
  opts: Omit<Particle, 'active' | 'life'> & { life?: number },
) {
  if (!pool) return;
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) {
      pool[i].active = true;
      pool[i].kind = opts.kind;
      pool[i].x = opts.x;
      pool[i].y = opts.y;
      pool[i].vx = opts.vx;
      pool[i].vy = opts.vy;
      pool[i].life = opts.life ?? opts.maxLife;
      pool[i].maxLife = opts.maxLife;
      pool[i].size = opts.size;
      pool[i].alpha = opts.alpha;
      pool[i].phase = opts.phase;
      pool[i].color = opts.color;
      return;
    }
  }
}

export function getTechUnlocked(world: WorldState, techId?: string): boolean {
  if (!techId) return true;
  return world.unlockedTechIds.includes(techId);
}

export function hasBuildingType(world: WorldState, type: BuildingType, islandId?: IslandId): boolean {
  return world.buildings.some(
    (b) => b.type === type && b.unlocked && (!islandId || b.islandId === islandId),
  );
}

export function getIslandBonfire(world: WorldState, islandId: IslandId): BuildingEntity | null {
  return (
    world.buildings.find((b) => b.islandId === islandId && b.type === 'bonfire' && b.unlocked) ??
    null
  );
}

export function getTotalFood(res: VillageResources): number {
  return res.berries + res.grain + res.meat + res.fish;
}

export function getVillageRes(world: WorldState, islandId?: IslandId): VillageResources {
  const id = islandId ?? world.localHomeIslandId ?? 'cradle';
  if (!world.villageResources) {
    world.villageResources = {} as Record<IslandId, VillageResources>;
  }
  if (!world.villageResources[id]) {
    world.villageResources[id] = makeEmptyResources();
  }
  return world.villageResources[id];
}

function recordFlow(
  world: WorldState,
  islandId: IslandId,
  dir: 'in' | 'out',
  key: keyof VillageResources,
  amount: number,
) {
  if (amount <= 0) return;
  if (!world.resourceFlows) world.resourceFlows = {} as Record<IslandId, ResourceFlowStats>;
  const fl = (world.resourceFlows[islandId] ??= makeEmptyFlow());
  if (key === 'berries' || key === 'grain' || key === 'meat' || key === 'fish' || key === 'food') {
    if (dir === 'in') fl.foodIn += amount;
    else fl.foodOut += amount;
  } else if (key === 'timber') {
    if (dir === 'in') fl.timberIn += amount;
    else fl.timberOut += amount;
  } else if (key === 'stone') {
    if (dir === 'in') fl.stoneIn += amount;
    else fl.stoneOut += amount;
  } else if (key === 'copper' || key === 'bronze' || key === 'iron') {
    if (dir === 'in') fl.oreIn += amount;
    else fl.oreOut += amount;
  }
}

export function addVillageResource(
  world: WorldState,
  islandId: IslandId,
  key: keyof VillageResources,
  amount: number,
) {
  if (amount <= 0) return;
  const res = getVillageRes(world, islandId);
  res[key] = Math.max(0, (res[key] ?? 0) + amount);
  res.food = Math.max(0, getTotalFood(res));
  recordFlow(world, islandId, 'in', key, amount);
  if (islandId === (world.localHomeIslandId ?? 'cradle')) {
    world.resources = { ...res };
  }
}

function syncCombinedFood(world: WorldState) {
  if (world.villageResources) {
    for (const id of ISLAND_ORDER) {
      const r = world.villageResources[id];
      if (r) {
        r.food = Math.max(0, getTotalFood(r));
      }
    }
    const home = world.localHomeIslandId ?? 'cradle';
    if (world.villageResources[home]) {
      world.resources = { ...world.villageResources[home] };
      return;
    }
  }
  world.resources.food = Math.max(0, getTotalFood(world.resources));
}

function consumeFoodUnits(world: WorldState, islandId: IslandId, baseAmount: number): { ok: boolean; hungerGain: number; moodBonus: number } {
  const res = getVillageRes(world, islandId);
  res.food = Math.max(0, getTotalFood(res));
  const ration: RationMode = world.villagePolicies?.[islandId]?.rationMode ?? 'normal';
  const mult = ration === 'conserve' ? 0.72 : ration === 'feast' ? 1.35 : 1.0;
  const amount = Number((baseAmount * mult).toFixed(2));
  if (res.food < amount) {
    return { ok: false, hungerGain: 0, moodBonus: 0 };
  }
  let rem = amount;
  const order: ('berries' | 'fish' | 'grain' | 'meat')[] = ['berries', 'fish', 'grain', 'meat'];
  for (const key of order) {
    if (rem <= 0) break;
    const take = Math.min(res[key], rem);
    res[key] = Math.max(0, res[key] - take);
    rem -= take;
  }
  recordFlow(world, islandId, 'out', 'food', amount);
  res.food = Math.max(0, getTotalFood(res));
  if (islandId === (world.localHomeIslandId ?? 'cradle')) {
    world.resources = { ...res };
  }
  return {
    ok: true,
    hungerGain: ration === 'conserve' ? 25 : ration === 'feast' ? 42 : 34,
    moodBonus: ration === 'conserve' ? -2 : ration === 'feast' ? 6 : 1,
  };
}

export function canControlIsland(
  world: WorldState,
  islandId: IslandId,
  actorPlayerId?: string,
): boolean {
  if (world.gameMode === 'shared_siege') {
    return islandId === 'cradle' || islandId === 'sunterrace' || islandId === 'timbercrown';
  }
  if (actorPlayerId) {
    return world.islandOwners?.[islandId] === actorPlayerId;
  }
  // Single-player: player controls only their own village (localHomeIslandId)
  return islandId === (world.localHomeIslandId ?? 'cradle');
}

export function canControlVillager(
  world: WorldState,
  v: VillagerEntity,
  actorPlayerId?: string,
): boolean {
  if (v.isNativeClan || v.isStranger) return false;
  if (world.gameMode === 'shared_siege') return true;
  if (actorPlayerId) {
    return v.ownerPlayerId === actorPlayerId || world.islandOwners?.[v.homeIslandId] === actorPlayerId;
  }
  return v.homeIslandId === (world.localHomeIslandId ?? 'cradle');
}

function getLineageGeneration(
  lineage: Record<string, LineageRecord>,
  parentIds: [string, string] | null,
): number {
  if (!parentIds) return 1;
  const g1 = lineage[parentIds[0]]?.generation ?? 1;
  const g2 = lineage[parentIds[1]]?.generation ?? 1;
  return Math.max(g1, g2) + 1;
}

export function upsertLineage(
  world: WorldState,
  v: VillagerEntity,
  deathCause?: DeathCause | null,
) {
  if (!world.lineage) world.lineage = {};
  const existing = world.lineage[v.id];
  const mergedChildren = Array.from(
    new Set([...(existing?.childrenIds ?? []), ...(v.childrenIds ?? [])]),
  );
  world.lineage[v.id] = {
    id: v.id,
    name: v.name,
    homeIslandId: v.homeIslandId ?? v.islandId,
    cultureId: v.cultureId,
    lifeStage: v.lifeStage,
    birthDay: existing?.birthDay ?? Math.max(1, world.environment.dayCount - v.ageDays),
    deathDay: deathCause ? world.environment.dayCount : (existing?.deathDay ?? null),
    deathCause: deathCause ?? existing?.deathCause ?? null,
    parentIds: v.parentIds ?? existing?.parentIds ?? null,
    partnerId: v.partnerId ?? existing?.partnerId ?? null,
    childrenIds: mergedChildren,
    generation: existing?.generation ?? getLineageGeneration(world.lineage, v.parentIds),
    traits: [...(v.traits ?? [])],
    cloakColor: v.cloakColor,
  };
}

function isBridgePassable(world: WorldState, from: IslandId, to: IslandId): SkyBridgeEntity | null {
  return (
    world.bridges.find(
      (br) =>
        br.built &&
        ((br.fromIsland === from && br.toIsland === to) ||
          (br.fromIsland === to && br.toIsland === from)),
    ) ?? null
  );
}

function findBridgeStep(world: WorldState, from: IslandId, to: IslandId): SkyBridgeEntity | null {
  return findBridgeStepNav(world, from, to);
}

function islandNormalizedDist(island: IslandDef, wx: number, wy: number): number {
  const dx = (wx - island.centerX) / Math.max(20, island.radiusX);
  const dy = (wy - island.centerY) / Math.max(20, island.radiusY);
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(island, ang);
  return Math.hypot(dx, dy) / Math.max(0.4, wobble);
}

function isOnBuiltBridge(world: WorldState, x: number, y: number): SkyBridgeEntity | null {
  return isOnBuiltBridgeNav(world, x, y);
}

function findCablewayStep(world: WorldState, from: IslandId, to: IslandId): SkyCablewayEntity | null {
  return findCablewayStepNav(world, from, to);
}

function steerEntity(
  world: WorldState,
  islandId: IslandId,
  x: number,
  y: number,
  tx: number,
  ty: number,
  stepDist: number,
  ignoreSpring = false,
  stuckState?: EntityStuckState,
  dt = 0.05,
  selfId?: string,
) {
  return steerMainWorldEntity(
    world,
    islandId,
    x,
    y,
    tx,
    ty,
    stepDist,
    ignoreSpring,
    stuckState,
    dt,
    ARCHIPELAGO_LANDMARKS,
    selfId,
  );
}

function addChronicle(
  world: WorldState,
  text: string,
  kind: ChronicleEntry['kind'],
  meta?: { islandId?: IslandId; participantIds?: string[] },
) {
  world.chronicle.unshift({
    id: `chr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    day: world.environment.dayCount,
    text,
    kind,
  });
  if (world.chronicle.length > 42) {
    world.chronicle.length = 42;
  }
  const mapped = mapChronicleKindToEventCategory(kind);
  emitWorldEvent(world, {
    category: mapped.category,
    significance: mapped.significance,
    summary: text,
    islandId: meta?.islandId ?? world.localHomeIslandId ?? 'cradle',
    participantIds: meta?.participantIds ?? [],
  });
}

export function getTraitStats(v: VillagerEntity) {
  let workSpeed = 1;
  let moodDrift = 0;
  let energyDrain = 1;
  let obedience = 0.68;
  let rainSensitive = false;
  let nightLoving = false;
  let morningGrumpy = false;
  let curiosityMod = 0;
  let braveryMod = 0;
  let bleedChanceMult = 1;
  let damageTakenMult = 1;
  let attackPowerMult = 1;
  let hpMaxMod = 0;
  let healRateMult = 1;
  let teachRateMult = 1;
  let gatherYieldMult = 1;
  let moveSpeedMult = 1;
  let knowledgeMult = 1;

  for (const tid of v.traits) {
    const t = TRAITS[tid];
    if (!t) continue;
    workSpeed *= t.workSpeedMult;
    moodDrift += t.moodDrift;
    energyDrain *= t.energyDrainMult;
    obedience += t.obedienceMod;
    if (t.rainSensitive) rainSensitive = true;
    if (t.nightLoving) nightLoving = true;
    if (t.morningGrumpy) morningGrumpy = true;
    if (t.curiosityMod) curiosityMod += t.curiosityMod;
    if (t.braveryMod) braveryMod += t.braveryMod;
    if (t.bleedChanceMult) bleedChanceMult *= t.bleedChanceMult;
    if (t.damageTakenMult) damageTakenMult *= t.damageTakenMult;
    if (t.attackPowerMult) attackPowerMult *= t.attackPowerMult;
    if (t.hpMaxMod) hpMaxMod += t.hpMaxMod;
    if (t.healRateMult) healRateMult *= t.healRateMult;
    if (t.teachRateMult) teachRateMult *= t.teachRateMult;
    if (t.gatherYieldMult) gatherYieldMult *= t.gatherYieldMult;
    if (t.moveSpeedMult) moveSpeedMult *= t.moveSpeedMult;
    if (t.knowledgeMult) knowledgeMult *= t.knowledgeMult;
  }
  return {
    workSpeed,
    moodDrift,
    energyDrain,
    obedience: Math.max(0.2, Math.min(0.95, obedience)),
    rainSensitive,
    nightLoving,
    morningGrumpy,
    curiosityMod,
    braveryMod,
    bleedChanceMult,
    damageTakenMult,
    attackPowerMult,
    hpMaxMod,
    healRateMult,
    teachRateMult,
    gatherYieldMult,
    moveSpeedMult,
    knowledgeMult,
  };
}

export function getSkillLevel(v: VillagerEntity, skillId: SkillId): number {
  return Math.max(0, Math.min(10, v.skills?.[skillId] ?? 0));
}

export function gainSkillXp(world: WorldState, v: VillagerEntity, skillId: SkillId, amount: number) {
  if (v.lifeStage === 'infant') return;
  if (!v.skills) v.skills = {};
  if (!v.skillXp) v.skillXp = {};
  const currLv = getSkillLevel(v, skillId);
  if (currLv >= 10) return;
  const intMult = 1 + ((v.stats?.intellect ?? 8) - 8) * 0.04;
  const nextXp = (v.skillXp[skillId] ?? 0) + amount * Math.max(0.7, intMult);
  const needed = 18 * (currLv + 1);
  if (nextXp >= needed) {
    v.skillXp[skillId] = nextXp - needed;
    v.skills[skillId] = currLv + 1;
    v.thoughtBubble = `${SKILL_META[skillId].label} Lv.${currLv + 1}!`;
    v.thoughtTimer = 2.8;
    addChronicle(world, `${v.name.split(' ')[0]} reached ${SKILL_META[skillId].label} Lv.${currLv + 1}.`, 'tech');
  } else {
    v.skillXp[skillId] = nextXp;
  }
}

export function getHousingBedsForIsland(world: WorldState, islandId: IslandId): number {
  const beds = world.buildings
    .filter((b) => b.unlocked && b.islandId === islandId && b.cultureId !== 'ashen_raider')
    .reduce(
      (sum, b) =>
        sum +
        (b.housingCapacity > 0
          ? b.housingCapacity + Math.max(0, b.level - 1) * 2
          : 0),
      0,
    );
  // 2 founders can sleep beside the embers even before first shelter is built
  return Math.max(2, beds);
}

export function getTotalHousingBeds(world: WorldState, islandId?: IslandId): number {
  return getHousingBedsForIsland(world, islandId ?? world.localHomeIslandId ?? 'cradle');
}

export function getVillagePopulation(world: WorldState, islandId: IslandId): number {
  return (
    world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === islandId).length +
    world.clanVillagers.filter((cv) => (cv.homeIslandId ?? cv.islandId) === islandId).length
  );
}

function resolveLandPoint(
  islandId: IslandId,
  tx: number,
  ty: number,
  minCenterDist = 0,
): { x: number; y: number } {
  const isl = ISLAND_DEFS[islandId];
  const isOk = (wx: number, wy: number) => {
    const nd = islandNormalizedDist(isl, wx, wy);
    if (nd > 0.85) return false;
    if (Math.hypot(wx - isl.centerX, wy - isl.centerY) < minCenterDist) return false;
    if (classifyMainWorldTerrain({ bridges: [] }, wx, wy) !== 'land') return false;
    if (riverDepthAtSim(isl, wx, wy).depth > 0.14) return false;
    if (pondDepthAtSim(isl, wx, wy).inPond) return false;
    if (terrainSlopeAtSim(wx, wy) > 0.45) return false;
    return true;
  };
  if (isOk(tx, ty)) return { x: Math.round(tx), y: Math.round(ty) };
  const baseAng = Math.atan2(ty - isl.centerY, tx - isl.centerX);
  const baseFrac = Math.min(
    0.72,
    Math.max(0.12, Math.hypot((tx - isl.centerX) / isl.radiusX, (ty - isl.centerY) / isl.radiusY)),
  );
  for (let ring = 0; ring < 5; ring++) {
    const frac = Math.min(0.8, Math.max(0.08, baseFrac + (ring % 2 === 0 ? -0.1 : 0.1) * Math.ceil(ring / 2)));
    for (let step = 0; step < 20; step++) {
      const ang = baseAng + (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * 0.28;
      const wobble = islandCoastWobble(isl, ang);
      const cx = isl.centerX + Math.cos(ang) * isl.radiusX * frac * wobble;
      const cy = isl.centerY + Math.sin(ang) * isl.radiusY * frac * wobble;
      if (isOk(cx, cy)) return { x: Math.round(cx), y: Math.round(cy) };
    }
  }
  return { x: Math.round(isl.centerX), y: Math.round(isl.centerY) };
}

function buildInitialWildNodes(worldSeed: number): WildNodeEntity[] {
  const nodes: WildNodeEntity[] = [];
  let idx = 0;
  const rng = mulberry32((Math.floor(Math.abs(worldSeed)) || DEFAULT_WORLD_SEED) ^ 0x9e3779b9);

  const isValidNodeSpot = (
    islandId: IslandId,
    kind: WildNodeEntity['kind'],
    wx: number,
    wy: number,
  ): boolean => {
    const isl = ISLAND_DEFS[islandId];
    const nd = islandNormalizedDist(isl, wx, wy);
    if (nd > (kind === 'tree' ? 0.87 : 0.81)) return false;
    if (classifyMainWorldTerrain({ bridges: [] }, wx, wy) !== 'land') return false;
    if (riverDepthAtSim(isl, wx, wy).depth > 0.12) return false;
    if (pondDepthAtSim(isl, wx, wy).depth > 0.12) return false;
    if (terrainSlopeAtSim(wx, wy) > 0.43) return false;

    const minCenterDist = kind === 'tree' || kind === 'stone_boulder' ? 92 : 72;
    if (Math.hypot(wx - isl.centerX, wy - isl.centerY) < minCenterDist) return false;

    if (isl.hasSpring && isl.springOffset) {
      const sx = isl.centerX + isl.springOffset.dx;
      const sy = isl.centerY + isl.springOffset.dy;
      if (Math.hypot(wx - sx, wy - sy) < 64) return false;
    }

    if (Math.hypot(wx - isl.dockSpot.x, wy - isl.dockSpot.y) < 88) return false;

    const minNodeSep = kind === 'tree' || kind === 'stone_boulder' ? 42 : 30;
    for (let i = 0; i < nodes.length; i++) {
      const other = nodes[i];
      if (other.islandId !== islandId) continue;
      const req = other.kind === 'tree' || other.kind === 'stone_boulder' ? Math.max(minNodeSep, 40) : minNodeSep;
      if (Math.hypot(wx - other.x, wy - other.y) < req) return false;
    }
    return true;
  };

  const spawnSeededNodes = (
    islandId: IslandId,
    kind: WildNodeEntity['kind'],
    count: number,
    radMin: number,
    radMax: number,
    amount: number,
    variants?: WildNodeEntity['variant'][],
    scaleMin = 1,
    scaleMax = 1,
    groveCenters?: number[],
  ) => {
    const isl = ISLAND_DEFS[islandId];
    for (let i = 0; i < count; i++) {
      let chosenX: number | null = null;
      let chosenY: number | null = null;

      for (let attempt = 0; attempt < 42; attempt++) {
        let ang: number;
        let rad: number;
        if (groveCenters && groveCenters.length > 0 && attempt < 26) {
          const baseGrove = groveCenters[i % groveCenters.length];
          ang = baseGrove + (rng() - 0.5) * 0.92;
          rad = radMin + rng() * (radMax - radMin);
        } else {
          ang = rng() * Math.PI * 2;
          rad = radMin + rng() * (radMax - radMin);
        }
        const wob = islandCoastWobble(isl, ang);
        const cx = Math.round(isl.centerX + Math.cos(ang) * isl.radiusX * rad * wob);
        const cy = Math.round(isl.centerY + Math.sin(ang) * isl.radiusY * rad * wob);
        if (isValidNodeSpot(islandId, kind, cx, cy)) {
          chosenX = cx;
          chosenY = cy;
          break;
        }
      }

      if (chosenX === null || chosenY === null) continue;
      const variant = variants && variants.length > 0 ? variants[i % variants.length] : undefined;
      const sc = Number((scaleMin + rng() * (scaleMax - scaleMin)).toFixed(2));
      nodes.push({
        id: `node_${idx++}`,
        islandId,
        kind,
        x: chosenX,
        y: chosenY,
        amount,
        maxAmount: amount,
        variant,
        scale: sc,
      });
    }
  };

  const makeGroves = (numGroves: number): number[] => {
    const startAng = rng() * Math.PI * 2;
    const angles: number[] = [];
    for (let g = 0; g < numGroves; g++) {
      angles.push(startAng + (g / numGroves) * Math.PI * 2 + (rng() - 0.5) * 0.5);
    }
    return angles;
  };

  // Cradle Isle: sunlit meadow bordered by organic oak/pine woodland groves, scarce flint, stones & berries
  const cradleGroves = makeGroves(4);
  spawnSeededNodes('cradle', 'berry_bush', 3, 0.24, 0.52, 18);
  spawnSeededNodes('cradle', 'branch_pile', 2, 0.28, 0.58, 22);
  spawnSeededNodes('cradle', 'flint_pile', 1, 0.30, 0.56, 18);
  spawnSeededNodes('cradle', 'stone_boulder', 2, 0.32, 0.62, 33, undefined, 1.02, 1.18);
  spawnSeededNodes('cradle', 'tree', 24, 0.36, 0.78, 48, ['oak', 'pine', 'cedar', 'oak'], 1.75, 2.32, cradleGroves);

  // Timbercrown Cliffside: dense highland cedar & pine forest, scarce boulders & berries
  const timberGroves = makeGroves(3);
  spawnSeededNodes('timbercrown', 'berry_bush', 2, 0.25, 0.54, 17);
  spawnSeededNodes('timbercrown', 'branch_pile', 2, 0.30, 0.60, 24);
  spawnSeededNodes('timbercrown', 'flint_pile', 1, 0.32, 0.58, 20);
  spawnSeededNodes('timbercrown', 'stone_boulder', 2, 0.34, 0.64, 36, undefined, 1.08, 1.25);
  spawnSeededNodes('timbercrown', 'tree', 22, 0.34, 0.78, 62, ['cedar', 'pine', 'cedar'], 2.02, 2.72, timberGroves);

  // Sun-Terrace Rivers: fertile multi-river loam with fruit orchards, berry thickets & field boulders
  const sunGroves = makeGroves(3);
  spawnSeededNodes('sunterrace', 'berry_bush', 2, 0.28, 0.58, 22);
  spawnSeededNodes('sunterrace', 'branch_pile', 1, 0.34, 0.62, 24);
  spawnSeededNodes('sunterrace', 'flint_pile', 1, 0.32, 0.60, 18);
  spawnSeededNodes('sunterrace', 'stone_boulder', 2, 0.34, 0.65, 33, undefined, 1.0, 1.15);
  spawnSeededNodes('sunterrace', 'tree', 17, 0.38, 0.76, 48, ['orchard', 'oak', 'pine'], 1.78, 2.22, sunGroves);

  // Copper-Crag Spire: mineral caldera with scarce pines and abundant copper/iron veins
  spawnSeededNodes('coppercrag', 'copper_vein', 2, 0.26, 0.58, 72);
  spawnSeededNodes('coppercrag', 'iron_vein', 2, 0.28, 0.60, 68);
  spawnSeededNodes('coppercrag', 'stone_boulder', 2, 0.32, 0.62, 44, undefined, 1.15, 1.32);
  spawnSeededNodes('coppercrag', 'flint_pile', 1, 0.32, 0.56, 28);
  spawnSeededNodes('coppercrag', 'tree', 3, 0.42, 0.72, 38, ['pine'], 1.7, 1.88);

  // Outer Mist Atoll: compact crescent lagoon rim with coastal oaks, flint & stone
  spawnSeededNodes('mistatoll', 'berry_bush', 1, 0.32, 0.62, 16);
  spawnSeededNodes('mistatoll', 'flint_pile', 1, 0.34, 0.62, 22);
  spawnSeededNodes('mistatoll', 'stone_boulder', 1, 0.34, 0.60, 28, undefined, 0.92, 1.05);
  spawnSeededNodes('mistatoll', 'tree', 4, 0.38, 0.74, 40, ['oak', 'pine'], 1.78, 1.95);

  // Starbloom Ruins: jade sanctuary with ancient oaks, orchards & copper
  const starGroves = makeGroves(3);
  spawnSeededNodes('starbloom', 'berry_bush', 2, 0.26, 0.56, 22);
  spawnSeededNodes('starbloom', 'branch_pile', 1, 0.32, 0.60, 26);
  spawnSeededNodes('starbloom', 'stone_boulder', 1, 0.34, 0.62, 36, undefined, 1.08, 1.2);
  spawnSeededNodes('starbloom', 'copper_vein', 1, 0.40, 0.68, 52);
  spawnSeededNodes('starbloom', 'tree', 14, 0.36, 0.76, 52, ['oak', 'orchard', 'pine', 'cedar'], 1.85, 2.34, starGroves);

  // Ashen Bastion: volcanic iron fortress island
  spawnSeededNodes('embervault', 'iron_vein', 2, 0.26, 0.56, 85);
  spawnSeededNodes('embervault', 'copper_vein', 1, 0.32, 0.62, 75);
  spawnSeededNodes('embervault', 'stone_boulder', 2, 0.32, 0.64, 44, undefined, 1.12, 1.28);
  spawnSeededNodes('embervault', 'tree', 3, 0.44, 0.74, 35, ['pine'], 1.58, 1.74);

  // Frostpeak Massif: alpine glacier ridges, iron veins & frost cedars
  const frostGroves = makeGroves(2);
  spawnSeededNodes('frostpeak', 'iron_vein', 2, 0.28, 0.56, 80);
  spawnSeededNodes('frostpeak', 'stone_boulder', 2, 0.32, 0.62, 42, undefined, 1.12, 1.28);
  spawnSeededNodes('frostpeak', 'branch_pile', 1, 0.34, 0.64, 26);
  spawnSeededNodes('frostpeak', 'tree', 12, 0.38, 0.74, 54, ['cedar', 'pine'], 2.0, 2.54, frostGroves);

  return nodes;
}

function buildInitialExploreRuins(worldSeed: number): ExploreRuinEntity[] {
  const rng = mulberry32((Math.floor(Math.abs(worldSeed)) || DEFAULT_WORLD_SEED) + 313);
  const place = (id: IslandId, rFrac: number) => {
    const isl = ISLAND_DEFS[id];
    const ang = rng() * Math.PI * 2;
    const wob = islandCoastWobble(isl, ang);
    return resolveLandPoint(
      id,
      isl.centerX + Math.cos(ang) * isl.radiusX * rFrac * wob,
      isl.centerY + Math.sin(ang) * isl.radiusY * rFrac * wob,
      rFrac > 0.18 ? 110 : 0,
    );
  };
  const sunPt = place('sunterrace', 0.32);
  const starPt = place('starbloom', 0.14);
  const timberPt = place('timbercrown', 0.36);
  const frostPt = place('frostpeak', 0.18);
  const emberPt = place('embervault', 0.14);

  return [
    {
      id: 'ruin_sun_obelisk',
      name: 'Sun-Terrace Solarium',
      islandId: 'sunterrace',
      kind: 'sun_obelisk',
      x: sunPt.x,
      y: sunPt.y,
      exploredCount: 0,
      cooldownTimer: 0,
      lootLabel: '+Wheat Seeds, Honey & Lore',
      guardianThreat: false,
    },
    {
      id: 'ruin_star_observatory',
      name: 'Starbloom Observatory',
      islandId: 'starbloom',
      kind: 'star_observatory',
      x: starPt.x,
      y: starPt.y,
      exploredCount: 0,
      cooldownTimer: 0,
      lootLabel: '+Hearthlight Relics, Herbs & Lore',
      guardianThreat: false,
    },
    {
      id: 'ruin_cedar_totem',
      name: 'Whispering Cedar Totem',
      islandId: 'timbercrown',
      kind: 'cedar_totem',
      x: timberPt.x,
      y: timberPt.y,
      exploredCount: 0,
      cooldownTimer: 0,
      lootLabel: '+Timber, Tea & Lore',
      guardianThreat: false,
    },
    {
      id: 'ruin_frost_shrine',
      name: 'Frostpeak Star-Shrine',
      islandId: 'frostpeak',
      kind: 'frost_shrine',
      x: frostPt.x,
      y: frostPt.y,
      exploredCount: 0,
      cooldownTimer: 0,
      lootLabel: '+Iron, Hearthlight & Crystal Lore',
      guardianThreat: true,
    },
    {
      id: 'ruin_ashen_vault',
      name: 'Ashen Iron Vault',
      islandId: 'embervault',
      kind: 'ashen_vault',
      x: emberPt.x,
      y: emberPt.y,
      exploredCount: 0,
      cooldownTimer: 0,
      lootLabel: '+Heavy Iron, Bronze & War Spoils',
      guardianThreat: true,
    },
  ];
}

function buildInitialWildHerds(worldSeed: number): WildHerdEntity[] {
  const herds: WildHerdEntity[] = [];
  const rng = mulberry32((Math.floor(Math.abs(worldSeed)) || DEFAULT_WORLD_SEED) + 521);
  const spawn = (
    id: string,
    kind: WildHerdEntity['kind'],
    islandId: IslandId,
    color: string,
  ) => {
    const isl = ISLAND_DEFS[islandId];
    const ang = rng() * Math.PI * 2;
    const rad = 0.24 + rng() * 0.42;
    const wob = islandCoastWobble(isl, ang);
    const pos = resolveLandPoint(
      islandId,
      isl.centerX + Math.cos(ang) * isl.radiusX * rad * wob,
      isl.centerY + Math.sin(ang) * isl.radiusY * rad * wob,
      70,
    );
    const scale =
      kind === 'boar'
        ? Number((0.95 + rng() * 0.37).toFixed(2))
        : kind === 'deer'
          ? Number((0.92 + rng() * 0.34).toFixed(2))
          : Number((0.76 + rng() * 0.28).toFixed(2));
    const hp = Math.round((kind === 'boar' ? 58 : kind === 'deer' ? 32 : 14) * scale);
    herds.push({
      id,
      kind,
      islandId,
      x: pos.x,
      y: pos.y,
      targetX: pos.x + 35,
      targetY: pos.y,
      facing: 1,
      pauseTimer: rng() * 2,
      hp,
      maxHp: hp,
      aggroTargetId: null,
      color,
      scale,
    });
  };

  // Cradle Isle: rabbits & deer roaming the sunlit meadow
  spawn('wild_r1', 'rabbit', 'cradle', '#E5DDD0');
  spawn('wild_r2', 'rabbit', 'cradle', '#C8B094');
  spawn('wild_r4', 'rabbit', 'cradle', '#DDD2C2');
  spawn('wild_d1', 'deer', 'cradle', '#A67249');
  spawn('wild_d5', 'deer', 'cradle', '#9E683E');

  // Timbercrown Ridge: deer & dangerous wild boars
  spawn('wild_d2', 'deer', 'timbercrown', '#9E683E');
  spawn('wild_d3', 'deer', 'timbercrown', '#A67249');
  spawn('wild_b1', 'boar', 'timbercrown', '#5E463A');
  spawn('wild_b2', 'boar', 'timbercrown', '#4D382E');

  // Sun-Terrace Rivers: rabbits & deer
  spawn('wild_r3', 'rabbit', 'sunterrace', '#D4C7B8');
  spawn('wild_d4', 'deer', 'sunterrace', '#B07B52');
  spawn('wild_d6', 'deer', 'sunterrace', '#A67249');

  // Copper-Crag: mountain boar
  spawn('wild_b3', 'boar', 'coppercrag', '#56433B');

  // Starbloom Ruins: deer & rabbits
  spawn('wild_r5', 'rabbit', 'starbloom', '#EAE2D6');
  spawn('wild_d7', 'deer', 'starbloom', '#A67249');

  // Frostpeak Massif: white-pelt deer & fierce mountain boar
  spawn('wild_d8', 'deer', 'frostpeak', '#D8DEE6');
  spawn('wild_b4', 'boar', 'frostpeak', '#5B5654');

  // Ashen Bastion: scorched boar
  spawn('wild_b5', 'boar', 'embervault', '#3C2D28');

  return herds;
}

function canVillagerWork(world: WorldState, v: VillagerEntity): boolean {
  if (v.lifeStage === 'infant' || v.lifeStage === 'child') return false;
  if (world.gameMode === 'sovereign_sandbox' || world.gameMode === 'shared_siege') return true;
  return (
    v.cognition.awareness >= 30 &&
    v.cognition.observedConcepts.length >= 2 &&
    v.cognition.socialCount >= 1
  );
}

function cognitiveStageFromAwareness(awareness: number): CognitiveStage {
  if (awareness >= 96) return 'enlightened';
  if (awareness >= 72) return 'reasoning';
  if (awareness >= 30) return 'experimenting';
  if (awareness >= 14) return 'observing';
  return 'awakening';
}

function makeFounder(
  id: string,
  name: string,
  cloakColor: string,
  hairColor: string,
  skinTone: string,
  hairStyle: number,
  traits: string[],
  dx: number,
  dy: number,
): VillagerEntity {
  const cradle = ISLAND_DEFS.cradle;
  const stats = rollUnitStats(traits, false);
  const skills = rollStarterSkills('adult', false);
  const hpMod = traits.reduce((sum, tid) => sum + (TRAITS[tid]?.hpMaxMod ?? 0), 0);
  const maxHp = Math.max(70, 100 + (stats.endurance - 8) * 4 + hpMod);
  return {
    id,
    name,
    bioDescription: buildBioFromTraits(traits, false),
    cultureId: 'hearthfolk',
    islandId: 'cradle',
    homeIslandId: 'cradle',
    ownerPlayerId: null,
    visitStatus: 'home',
    visitTargetIslandId: null,
    parleyPartnerId: null,
    cloakColor,
    hairColor,
    skinTone,
    hairStyle,
    lifeStage: 'adult',
    ageDays: 14,
    isChief: false,
    traits,
    stats,
    skills,
    skillXp: {},
    rtsOrder: null,
    drafted: false,
    teachCooldown: 0,
    partnerId: null,
    parentIds: null,
    childrenIds: [],
    homeBuildingId: null,
    hp: maxHp,
    maxHp,
    warmth: 88,
    mood: 84,
    energy: 95,
    hunger: 88,
    affectionXp: 10,
    affectionLevel: 1,
    gearTier: 0,
    weaponType: 'none',
    curiosity: traits.includes('curious_scout') ? 0.88 : 0.72,
    bravery: traits.includes('brave_hunter') ? 0.78 : 0.55,
    voyageBoatId: null,
    killCount: 0,
    cognition: {
      stage: 'awakening',
      awareness: 0,
      observedConcepts: [],
      socialCount: 0,
      focusObject: 'berry_bush',
    },
    favoriteComfort: pickFavoriteComfort(),
    activeWish: 'explore',
    wishFulfilledToday: false,
    currentDialogue: 'Everything is brand new—soft grass, bright sky, loose stones. Let me look closer and talk with kin!',
    lastMemory: 'Opened eyes bare-handed under an endless sky.',
    relationships: {},
    hangOutTargetId: null,
    socialCooldown: 12,
    pairChatCooldowns: {},
    suggestedTask: null,
    activeTask: 'explore',
    state: 'exploring',
    autonomyReason: 'Exploring nearby stones, berries & kin before beginning village work.',
    thoughtBubble: 'What is this world?',
    thoughtTimer: 5.5,
    x: cradle.centerX + dx,
    y: cradle.centerY + dy,
    targetX: cradle.centerX + dx * 4,
    targetY: cradle.centerY + dy * 4,
    facing: 1,
    animPhase: Math.random() * 6,
    bounceScale: 1,
    decisionCooldown: 2.2,
    birthCooldownDays: 0,
    attackCooldown: 0,
    edgeAckCooldown: 0,
    stuckState: { lastX: cradle.centerX + dx, lastY: cradle.centerY + dy, timer: 0, detourSign: 1 },
    personality: buildNpcPersonality(id, traits, traits.includes('curious_scout') ? 0.88 : 0.72, traits.includes('brave_hunter') ? 0.78 : 0.55, false),
    knowledge: createKnowledgeProfile('awakening'),
    memories: [
      {
        id: `mem_init_${id}`,
        day: 1,
        timeOfDay: 0.25,
        kind: 'discovery',
        summary: 'Opened eyes bare-handed under an endless sky.',
        actorIds: [],
        importance: 8,
        sentiment: 'positive',
      },
    ],
    carriedResource: null,
    carriedAmount: 0,
    carryCapacity: 6,
    reputation: 15,
    banished: false,
  };
}

function makeNativeClanVillager(
  id: string,
  name: string,
  islandId: IslandId,
  cultureId: CultureId,
  cloakColor: string,
  hairColor: string,
  skinTone: string,
  dx: number,
  dy: number,
  task: TaskType,
): VillagerEntity {
  const isl = ISLAND_DEFS[islandId];
  const isAshen = cultureId === 'ashen_raider';
  const traits =
    cultureId === 'sylvan'
      ? ['curious_scout', 'swift_footed', 'danger_sense']
      : cultureId === 'cragforge'
        ? ['clever_crafter', 'hard_skin', 'master_artisan']
        : isAshen
          ? ['hard_skin', 'brave_hunter']
          : ['brave_hunter', 'warmhearted'];
  const stats = rollUnitStats(traits, isAshen);
  const skills = rollStarterSkills('adult', isAshen);
  const maxHp = isAshen ? 105 : 115;
  const spawnPos = resolveLandPoint(islandId, isl.centerX + dx, isl.centerY + dy);
  return {
    id,
    name,
    bioDescription: `Born and raised among the ${CULTURES[cultureId].name} of ${isl.name}.`,
    cultureId,
    islandId,
    homeIslandId: islandId,
    ownerPlayerId: null,
    visitStatus: 'home',
    visitTargetIslandId: null,
    parleyPartnerId: null,
    isNativeClan: true,
    cloakColor,
    hairColor,
    skinTone,
    hairStyle: Math.floor(Math.random() * 4),
    lifeStage: 'adult',
    ageDays: 19,
    isChief: false,
    traits,
    stats,
    skills,
    skillXp: {},
    rtsOrder: null,
    drafted: false,
    teachCooldown: 0,
    partnerId: null,
    parentIds: null,
    childrenIds: [],
    homeBuildingId: null,
    hp: maxHp,
    maxHp,
    warmth: 92,
    mood: 82,
    energy: 92,
    hunger: 85,
    affectionXp: 15,
    affectionLevel: 1,
    gearTier: cultureId === 'cragforge' ? 2 : 1,
    weaponType: cultureId === 'sylvan' ? 'bow' : cultureId === 'cragforge' ? 'bronze_blade' : 'flint_spear',
    curiosity: 0.55,
    bravery: 0.72,
    voyageBoatId: null,
    killCount: 0,
    cognition: {
      stage: 'reasoning',
      awareness: 78,
      observedConcepts: ['berry_bush', 'branch_pile', 'stone_boulder', 'spring', 'embers'],
      socialCount: 6,
      focusObject: null,
    },
    favoriteComfort: pickFavoriteComfort(),
    activeWish: 'chat',
    wishFulfilledToday: false,
    currentDialogue: `Welcome under the sky-clouds! Our ${CULTURES[cultureId].name} folk are building our hearth on ${isl.name}.`,
    lastMemory: `Tending local traditions on ${isl.name}.`,
    relationships: {},
    hangOutTargetId: null,
    socialCooldown: 24,
    pairChatCooldowns: {},
    suggestedTask: null,
    activeTask: task,
    state: 'working',
    autonomyReason: `Gathering & building ${CULTURES[cultureId].name} life on ${isl.name}.`,
    thoughtBubble: null,
    thoughtTimer: 0,
    x: spawnPos.x,
    y: spawnPos.y,
    targetX: spawnPos.x,
    targetY: spawnPos.y,
    facing: 1,
    animPhase: Math.random() * 6,
    bounceScale: 1,
    decisionCooldown: 3 + Math.random() * 4,
    birthCooldownDays: 99,
    attackCooldown: 0,
    edgeAckCooldown: 0,
    stuckState: { lastX: spawnPos.x, lastY: spawnPos.y, timer: 0, detourSign: 1 },
    personality: buildNpcPersonality(id, traits, 0.55, 0.72, isAshen),
    knowledge: createKnowledgeProfile('native'),
    memories: [
      {
        id: `mem_init_${id}`,
        day: 1,
        timeOfDay: 0.25,
        kind: 'social',
        summary: `Raised among the ${CULTURES[cultureId].name} on ${isl.name}.`,
        actorIds: [],
        importance: 6,
        sentiment: 'neutral',
      },
    ],
    carriedResource: null,
    carriedAmount: 0,
    carryCapacity: 6,
    reputation: isAshen ? -15 : 22,
    banished: false,
  };
}

function buildInitialVillageCultures(): Record<IslandId, VillageCultureProfile> {
  return {
    cradle: {
      islandId: 'cradle',
      cultureId: 'hearthfolk',
      ethosTitle: 'Awakening Nomads',
      motto: 'Two bare hands discovering grass, flint, and shared embers.',
      traditionLevel: 0,
      ritualPoints: 0,
      nightlyGatherings: 0,
      customs: [],
      lastRitualDay: 0,
    },
    timbercrown: {
      islandId: 'timbercrown',
      cultureId: 'sylvan',
      ethosTitle: 'Cedarwood Sylvans',
      motto: 'Tall cedars shelter every watchful bow and dawn hum.',
      traditionLevel: 2,
      ritualPoints: 45,
      nightlyGatherings: 4,
      customs: ['nightly_hearth_circle', 'dawn_forage_song'],
      lastRitualDay: 0,
    },
    sunterrace: {
      islandId: 'sunterrace',
      cultureId: 'hearthfolk',
      ethosTitle: 'Untilled Golden Loam',
      motto: 'Ancient stepped loam awaiting planters, orchards, and songs.',
      traditionLevel: 0,
      ritualPoints: 0,
      nightlyGatherings: 0,
      customs: [],
      lastRitualDay: 0,
    },
    coppercrag: {
      islandId: 'coppercrag',
      cultureId: 'cragforge',
      ethosTitle: 'Cragforge Smiths',
      motto: 'Hammer cadences echo across caldera stone and glowing copper.',
      traditionLevel: 2,
      ritualPoints: 48,
      nightlyGatherings: 4,
      customs: ['nightly_hearth_circle', 'forge_drum_rhythm'],
      lastRitualDay: 0,
    },
    mistatoll: {
      islandId: 'mistatoll',
      cultureId: 'mist_mariner',
      ethosTitle: 'Mist-Reef Mariners',
      motto: 'Turquoise sea lanterns ward skiffs across the drifting reef.',
      traditionLevel: 2,
      ritualPoints: 50,
      nightlyGatherings: 5,
      customs: ['nightly_hearth_circle', 'sea_lantern_vigil'],
      lastRitualDay: 0,
    },
    starbloom: {
      islandId: 'starbloom',
      cultureId: 'hearthfolk',
      ethosTitle: 'Unclaimed Star-Meadow',
      motto: 'Sunken starlight ruins awaiting pilgrim hearths and herbalists.',
      traditionLevel: 0,
      ritualPoints: 0,
      nightlyGatherings: 0,
      customs: [],
      lastRitualDay: 0,
    },
    embervault: {
      islandId: 'embervault',
      cultureId: 'ashen_raider',
      ethosTitle: 'Ashen Bastion Warband',
      motto: 'Volcanic iron vaults guarded behind obsidian palisades and fire.',
      traditionLevel: 2,
      ritualPoints: 60,
      nightlyGatherings: 5,
      customs: ['nightly_hearth_circle', 'forge_drum_rhythm'],
      lastRitualDay: 0,
    },
    frostpeak: {
      islandId: 'frostpeak',
      cultureId: 'cragforge',
      ethosTitle: 'Frozen Alpine Watch',
      motto: 'Glacier crystals sing high above the clouds beside ancient iron.',
      traditionLevel: 0,
      ritualPoints: 0,
      nightlyGatherings: 0,
      customs: [],
      lastRitualDay: 0,
    },
  };
}

function buildNativeOutposts(): {
  buildings: BuildingEntity[];
  boats: BoatEntity[];
  clanVillagers: VillagerEntity[];
  raiders: VillagerEntity[];
} {
  const mist = ISLAND_DEFS.mistatoll;
  const tc = ISLAND_DEFS.timbercrown;
  const cc = ISLAND_DEFS.coppercrag;
  const ev = ISLAND_DEFS.embervault;

  const buildings: BuildingEntity[] = [
    // Timbercrown Native Sylvan Village
    {
      id: 'sylvan_bonfire',
      type: 'bonfire',
      name: 'Cedar Hearth Circle',
      islandId: 'timbercrown',
      cultureId: 'sylvan',
      description: 'Moss-ringed highland bonfire where Cedarwood Sylvans gather each dusk.',
      level: 2,
      maxLevel: 3,
      x: tc.centerX - 18,
      y: tc.centerY + 14,
      unlocked: true,
      disrepair: 0,
      hp: 180,
      maxHp: 180,
      housingCapacity: 0,
      baseCost: { timber: 6, stone: 4 },
      benefitDescription: 'Sylvan cultural hearth',
    },
    {
      id: 'sylvan_cottage_1',
      type: 'cottage',
      name: 'Sylvan Canopy Hall',
      islandId: 'timbercrown',
      cultureId: 'sylvan',
      description: 'Stilted cedarwood lodge overlooking the waterfall cliff.',
      level: 2,
      maxLevel: 4,
      x: tc.centerX + 86,
      y: tc.centerY - 54,
      unlocked: true,
      disrepair: 0,
      hp: 210,
      maxHp: 210,
      housingCapacity: 4,
      baseCost: { timber: 22, stone: 10 },
      benefitDescription: 'Native Sylvan dwelling',
    },
    {
      id: 'sylvan_woodshop',
      type: 'woodshop',
      name: 'Bowyer & Cedar Mill',
      islandId: 'timbercrown',
      cultureId: 'sylvan',
      description: 'Open-rafter forestry workshop shaping yew bows and planks.',
      level: 1,
      maxLevel: 3,
      x: tc.centerX - 115,
      y: tc.centerY - 48,
      unlocked: true,
      disrepair: 0,
      hp: 170,
      maxHp: 170,
      housingCapacity: 0,
      baseCost: { timber: 20, stone: 8 },
      benefitDescription: 'Sylvan timber workshop',
    },

    // Copper-Crag Native Cragforge Village
    {
      id: 'crag_bonfire',
      type: 'bonfire',
      name: 'Caldera Ember Pit',
      islandId: 'coppercrag',
      cultureId: 'cragforge',
      description: 'Basalt-walled hearth warming high-altitude smiths at dusk.',
      level: 2,
      maxLevel: 3,
      x: cc.centerX - 10,
      y: cc.centerY + 24,
      unlocked: true,
      disrepair: 0,
      hp: 200,
      maxHp: 200,
      housingCapacity: 0,
      baseCost: { timber: 6, stone: 4 },
      benefitDescription: 'Cragforge cultural hearth',
    },
    {
      id: 'crag_cottage',
      type: 'cottage',
      name: 'Basalt Mason Hall',
      islandId: 'coppercrag',
      cultureId: 'cragforge',
      description: 'Thick stone bastion home braced against highland gales.',
      level: 2,
      maxLevel: 4,
      x: cc.centerX - 110,
      y: cc.centerY - 42,
      unlocked: true,
      disrepair: 0,
      hp: 250,
      maxHp: 250,
      housingCapacity: 4,
      baseCost: { timber: 18, stone: 20 },
      benefitDescription: 'Cragforge smith dwelling',
    },
    {
      id: 'crag_smeltery',
      type: 'smeltery',
      name: 'Cragforge Furnace',
      islandId: 'coppercrag',
      cultureId: 'cragforge',
      description: 'Roaring clay-stone furnace casting copper and bronze.',
      level: 2,
      maxLevel: 3,
      x: cc.centerX + 98,
      y: cc.centerY - 18,
      unlocked: true,
      disrepair: 0,
      hp: 240,
      maxHp: 240,
      housingCapacity: 0,
      baseCost: { timber: 24, stone: 24 },
      benefitDescription: 'Cragforge ore furnace',
    },

    // Mist Atoll Native Mist-Mariner Settlement
    {
      id: 'mist_bonfire',
      type: 'bonfire',
      name: 'Mist-Clan Beacon',
      islandId: 'mistatoll',
      cultureId: 'mist_mariner',
      description: 'Driftwood hearth burning turquoise sea-salt embers.',
      level: 2,
      maxLevel: 3,
      x: mist.centerX - 15,
      y: mist.centerY + 6,
      unlocked: true,
      disrepair: 0,
      hp: 180,
      maxHp: 180,
      housingCapacity: 0,
      baseCost: { timber: 6, stone: 4 },
      benefitDescription: 'Mist Mariner cultural hearth',
    },
    {
      id: 'mist_cottage',
      type: 'cottage',
      name: 'Reed Longhouse',
      islandId: 'mistatoll',
      cultureId: 'mist_mariner',
      description: 'Stilted driftwood hall with woven reed eaves.',
      level: 2,
      maxLevel: 4,
      x: mist.centerX + 55,
      y: mist.centerY - 38,
      unlocked: true,
      disrepair: 0,
      hp: 220,
      maxHp: 220,
      housingCapacity: 4,
      baseCost: { timber: 22, stone: 12 },
      benefitDescription: 'Mist Mariner dwelling',
    },
    {
      id: 'mist_dock',
      type: 'dock',
      name: 'Mariner Reef Pier',
      islandId: 'mistatoll',
      cultureId: 'mist_mariner',
      description: 'Crescent-prow naval jetty facing the central archipelago.',
      level: 2,
      maxLevel: 3,
      x: mist.dockSpot.x,
      y: mist.dockSpot.y,
      unlocked: true,
      disrepair: 0,
      hp: 200,
      maxHp: 200,
      housingCapacity: 0,
      baseCost: { timber: 24, stone: 10 },
      benefitDescription: 'Mist Mariner fleet pier',
    },

    // Ashen Bastion Volcanic Fortress (Battle Island)
    {
      id: 'ember_bonfire',
      type: 'bonfire',
      name: 'Obsidian War-Brazier',
      islandId: 'embervault',
      cultureId: 'ashen_raider',
      description: 'Scorched iron brazier rallying the Ashen Bastion garrison.',
      level: 2,
      maxLevel: 3,
      x: ev.centerX - 65,
      y: ev.centerY + 35,
      unlocked: true,
      disrepair: 0,
      hp: 220,
      maxHp: 220,
      housingCapacity: 0,
      baseCost: { timber: 8, stone: 10 },
      benefitDescription: 'Ashen Bastion war hearth',
    },
    {
      id: 'ember_barracks',
      type: 'barracks',
      name: 'Ashen Iron Citadel',
      islandId: 'embervault',
      cultureId: 'ashen_raider',
      description: 'Basalt keep guarding rich subterranean iron vaults.',
      level: 2,
      maxLevel: 3,
      x: ev.centerX + 105,
      y: ev.centerY + 45,
      unlocked: true,
      disrepair: 0,
      hp: 300,
      maxHp: 300,
      housingCapacity: 4,
      baseCost: { timber: 28, stone: 28 },
      benefitDescription: 'Bastion garrison hall',
    },
    {
      id: 'ember_watchtower',
      type: 'watchtower',
      name: 'Scorched Bastion Tower',
      islandId: 'embervault',
      cultureId: 'ashen_raider',
      description: 'Volcanic stone tower firing warning bolts over the caldera rim.',
      level: 2,
      maxLevel: 3,
      x: ev.centerX - 115,
      y: ev.centerY - 75,
      unlocked: true,
      disrepair: 0,
      hp: 240,
      maxHp: 240,
      housingCapacity: 0,
      baseCost: { timber: 22, stone: 20 },
      benefitDescription: 'Bastion defensive tower',
    },
  ];

  const boats: BoatEntity[] = [
    {
      id: 'boat_mist_1',
      name: 'Sea-Mist Skiff',
      kind: 'fishing_skiff',
      cultureId: 'mist_mariner',
      homeIslandId: 'mistatoll',
      targetIslandId: 'mistatoll',
      x: mist.dockSpot.seaX - 24,
      y: mist.dockSpot.seaY - 35,
      targetX: mist.dockSpot.seaX - 45,
      targetY: mist.dockSpot.seaY + 55,
      yaw: 0,
      hp: 100,
      maxHp: 100,
      state: 'fishing',
      cargoText: 'Sea-Reef Nets',
      passengerIds: [],
      tripTimer: 16,
    },
  ];

  const clanVillagers: VillagerEntity[] = [
    makeNativeClanVillager('syl_1', 'Rowan Fern', 'timbercrown', 'sylvan', '#4F8459', '#5A3B28', '#E7BC9B', -42, 28, 'chop'),
    makeNativeClanVillager('syl_2', 'Linden Moss', 'timbercrown', 'sylvan', '#6B9962', '#8B5A34', '#F2D0B6', 54, -22, 'hunt'),
    makeNativeClanVillager('syl_3', 'Bramble Pine', 'timbercrown', 'sylvan', '#487654', '#3A281E', '#D7A37E', -88, -32, 'forage'),
    makeNativeClanVillager('crag_1', 'Durnan Flint', 'coppercrag', 'cragforge', '#9D5B36', '#2D2420', '#D9A582', -38, 12, 'smelt'),
    makeNativeClanVillager('crag_2', 'Sera Slate', 'coppercrag', 'cragforge', '#5B6A7A', '#7E3E2A', '#EBC3A4', 65, 22, 'quarry'),
    makeNativeClanVillager('crag_3', 'Torin Brass', 'coppercrag', 'cragforge', '#B86E3E', '#40342E', '#DFAD89', -75, -55, 'guard'),
    makeNativeClanVillager('mist_1', 'Kael Tide', 'mistatoll', 'mist_mariner', '#3D7E8A', '#24292E', '#D59C78', -25, 18, 'fish'),
    makeNativeClanVillager('mist_2', 'Nera Drift', 'mistatoll', 'mist_mariner', '#4C9BA6', '#563D2D', '#E8BEA0', 48, -14, 'forage'),
    makeNativeClanVillager('mist_3', 'Orin Reef', 'mistatoll', 'mist_mariner', '#376C78', '#332C28', '#C98F6A', -70, 52, 'guard'),
  ];

  const makeBastionGuard = (id: string, name: string, dx: number, dy: number): VillagerEntity => ({
    ...makeNativeClanVillager(id, name, 'embervault', 'ashen_raider', '#7E2E28', '#251D1B', '#C68A66', dx, dy, 'guard'),
    isNativeClan: false,
    isStranger: true,
    hp: 95,
    maxHp: 95,
    gearTier: 3,
    weaponType: 'iron_blade',
    bravery: 0.92,
    state: 'fighting',
    autonomyReason: 'Guarding the Ashen Bastion iron vaults.',
    currentDialogue: 'Only steel claims the vault below this cone!',
  });

  const raiders: VillagerEntity[] = [
    makeBastionGuard('ash_guard_1', 'Cinder Vane', -45, -15),
    makeBastionGuard('ash_guard_2', 'Krag Ashblade', 72, 24),
    makeBastionGuard('ash_guard_3', 'Pyra Ember', -12, 85),
  ];

  const landCheck = (id: IslandId, x: number, y: number) => resolveLandPoint(id, x, y);
  for (const b of buildings) {
    if (b.type === 'dock') continue;
    const p = landCheck(b.islandId, b.x, b.y);
    b.x = p.x;
    b.y = p.y;
  }

  return { buildings, boats, clanVillagers, raiders };
}

export function createInitialWorld(gameMode: GameMode = 'whisper_solo', seed?: number): WorldState {
  const worldSeed =
    typeof seed === 'number' && Number.isFinite(seed) && seed > 0
      ? Math.floor(seed)
      : Math.floor(1 + Math.random() * 2_147_483_640) || DEFAULT_WORLD_SEED;
  applyArchipelagoSeed(worldSeed);

  const isSiege = gameMode === 'shared_siege';
  const isSovereign = gameMode === 'sovereign_sandbox';

  const adam = makeFounder(
    'founder_adam',
    'Adam Ash',
    '#8A6A4E',
    '#4A3525',
    '#E6BA9A',
    0,
    ['curious_scout', 'clever_crafter', 'hard_skin'],
    -18,
    12,
  );
  const eve = makeFounder(
    'founder_eve',
    'Eve Briar',
    '#6B7B58',
    '#8B4A32',
    '#F4D5BD',
    2,
    ['green_thumb', 'warmhearted', 'calculated_mind'],
    18,
    -6,
  );
  adam.relationships[eve.id] = 68;
  eve.relationships[adam.id] = 68;
  adam.partnerId = eve.id;
  eve.partnerId = adam.id;

  const initialVillagers: VillagerEntity[] = [adam, eve];
  if (isSiege) {
    adam.weaponType = 'flint_spear';
    adam.gearTier = 1;
    adam.cognition = { stage: 'reasoning', awareness: 65, observedConcepts: ['berry_bush', 'stone_boulder', 'embers'], socialCount: 2, focusObject: null };
    adam.knowledge = createKnowledgeProfile('veteran');
    eve.weaponType = 'bow';
    eve.gearTier = 1;
    eve.cognition = { stage: 'reasoning', awareness: 65, observedConcepts: ['berry_bush', 'stone_boulder', 'embers'], socialCount: 2, focusObject: null };
    eve.knowledge = createKnowledgeProfile('veteran');

    const bram = makeFounder(
      'founder_bram',
      'Bram Crag',
      '#5B7290',
      '#2E2622',
      '#D19A74',
      1,
      ['brave_hunter', 'hard_skin', 'pain_dampener'],
      -42,
      -26,
    );
    bram.weaponType = 'flint_spear';
    bram.gearTier = 1;
    bram.cognition = { stage: 'reasoning', awareness: 65, observedConcepts: ['berry_bush', 'stone_boulder', 'embers'], socialCount: 2, focusObject: null };
    bram.knowledge = createKnowledgeProfile('veteran');

    const clara = makeFounder(
      'founder_clara',
      'Clara Finch',
      '#A65C52',
      '#7A5438',
      '#F4D5BD',
      3,
      ['master_artisan', 'swift_recovery', 'curious_scout'],
      42,
      24,
    );
    clara.weaponType = 'bow';
    clara.gearTier = 1;
    clara.cognition = { stage: 'reasoning', awareness: 65, observedConcepts: ['berry_bush', 'stone_boulder', 'embers'], socialCount: 2, focusObject: null };
    clara.knowledge = createKnowledgeProfile('veteran');

    initialVillagers.push(bram, clara);
  }

  const outpost = buildNativeOutposts();
  // Default whisper_solo AND shared_siege start all settlements with ZERO pre-built buildings (except siege bonfire)!
  const startingBuildings: BuildingEntity[] = isSovereign
    ? [...outpost.buildings]
    : isSiege
      ? [
          {
            id: 'siege_bonfire',
            type: 'bonfire',
            name: 'Hearthglen Watch-Fire',
            islandId: 'cradle',
            cultureId: 'hearthfolk',
            description: 'Central rallying bonfire for defenders against the multi-front siege.',
            level: 1,
            maxLevel: 3,
            x: ISLAND_DEFS.cradle.centerX,
            y: ISLAND_DEFS.cradle.centerY,
            unlocked: true,
            disrepair: 0,
            hp: 260,
            maxHp: 260,
            housingCapacity: 0,
            baseCost: { timber: 6, stone: 4 },
            benefitDescription: 'Rally hearth & night warmth',
          },
        ]
      : [];

  const starterCradleRes: VillageResources = isSovereign
    ? {
        food: 42,
        berries: 22,
        grain: 20,
        meat: 0,
        fish: 0,
        timber: 55,
        stone: 45,
        copper: 12,
        bronze: 6,
        iron: 4,
        wool: 10,
        hides: 6,
        herbs: 8,
        hearthlight: 12,
      }
    : isSiege
      ? {
          food: 14,
          berries: 14,
          grain: 0,
          meat: 0,
          fish: 0,
          timber: 22,
          stone: 18,
          copper: 0,
          bronze: 0,
          iron: 0,
          wool: 0,
          hides: 0,
          herbs: 4,
          hearthlight: 6,
        }
      : {
          food: 4,
          berries: 4,
          grain: 0,
          meat: 0,
          fish: 0,
          timber: 0,
          stone: 0,
          copper: 0,
          bronze: 0,
          iron: 0,
          wool: 0,
          hides: 0,
          herbs: 0,
          hearthlight: 0,
        };

  const villageResources: Record<IslandId, VillageResources> = {
    cradle: { ...starterCradleRes },
    timbercrown: { ...makeEmptyResources(), food: 18, berries: 10, meat: 8, timber: 24, stone: 10 },
    sunterrace: { ...makeEmptyResources(), food: 10, grain: 6, berries: 4, timber: 10, stone: 6 },
    coppercrag: { ...makeEmptyResources(), food: 16, meat: 10, berries: 6, timber: 14, stone: 24, copper: 10 },
    mistatoll: { ...makeEmptyResources(), food: 20, fish: 16, berries: 4, timber: 16, stone: 8 },
    starbloom: { ...makeEmptyResources(), food: 8, berries: 8, timber: 8, stone: 6, herbs: 6 },
    embervault: { ...makeEmptyResources(), food: 18, meat: 18, timber: 12, stone: 20, iron: 16 },
    frostpeak: { ...makeEmptyResources(), food: 6, berries: 6, timber: 4, stone: 16, iron: 8 },
  };

  const villagePolicies: Record<IslandId, VillagePolicy> = {
    cradle: { rationMode: 'normal', borderPolicy: 'parley' },
    timbercrown: { rationMode: 'normal', borderPolicy: 'parley' },
    sunterrace: { rationMode: 'normal', borderPolicy: 'open_trade' },
    coppercrag: { rationMode: 'normal', borderPolicy: 'parley' },
    mistatoll: { rationMode: 'normal', borderPolicy: isSiege ? 'closed' : 'parley' },
    starbloom: { rationMode: 'normal', borderPolicy: 'open_trade' },
    embervault: { rationMode: 'normal', borderPolicy: 'closed' },
    frostpeak: { rationMode: 'normal', borderPolicy: 'open_trade' },
  };

  const resourceFlows: Record<IslandId, ResourceFlowStats> = {
    cradle: makeEmptyFlow(),
    timbercrown: makeEmptyFlow(),
    sunterrace: makeEmptyFlow(),
    coppercrag: makeEmptyFlow(),
    mistatoll: makeEmptyFlow(),
    starbloom: makeEmptyFlow(),
    embervault: makeEmptyFlow(),
    frostpeak: makeEmptyFlow(),
  };

  const islandOwners: Record<IslandId, string | null> = {
    cradle: 'player_solo',
    timbercrown: null,
    sunterrace: null,
    coppercrag: null,
    mistatoll: null,
    starbloom: null,
    embervault: null,
    frostpeak: null,
  };

  const world: WorldState = {
    version: CURRENT_WORLD_VERSION,
    worldSeed,
    gameMode,
    era: 1,
    localHomeIslandId: 'cradle',
    islandOwners,
    resources: { ...starterCradleRes },
    villageResources,
    villagePolicies,
    resourceFlows,
    lineage: {},
    comforts: { bread: 0, tea: 0, honey: 0 },
    knowledgeXp: 0,
    unlockedTechIds: isSiege ? ['fire_making', 'woven_shelter', 'flint_spears', 'archery_watch'] : [],
    activeTechId: isSiege ? 'masonry_bakery' : 'fire_making',
    islands: {
      cradle: { id: 'cradle', discovered: true, owningCultureId: 'hearthfolk', ownerPlayerId: 'player_solo', dockBuilt: isSovereign, settledDay: 1 },
      timbercrown: { id: 'timbercrown', discovered: false, owningCultureId: 'sylvan', ownerPlayerId: null, dockBuilt: false, settledDay: 1 },
      sunterrace: { id: 'sunterrace', discovered: false, owningCultureId: 'hearthfolk', ownerPlayerId: null, dockBuilt: false, settledDay: null },
      coppercrag: { id: 'coppercrag', discovered: false, owningCultureId: 'cragforge', ownerPlayerId: null, dockBuilt: false, settledDay: 1 },
      mistatoll: { id: 'mistatoll', discovered: false, owningCultureId: 'mist_mariner', ownerPlayerId: null, dockBuilt: isSovereign, settledDay: 1 },
      starbloom: { id: 'starbloom', discovered: false, owningCultureId: 'hearthfolk', ownerPlayerId: null, dockBuilt: false, settledDay: null },
      embervault: { id: 'embervault', discovered: false, owningCultureId: 'ashen_raider', ownerPlayerId: null, dockBuilt: false, settledDay: 1 },
      frostpeak: { id: 'frostpeak', discovered: false, owningCultureId: 'cragforge', ownerPlayerId: null, dockBuilt: false, settledDay: null },
    },
    villageCultures: buildInitialVillageCultures(),
    bridges: INITIAL_SKY_BRIDGES.map((b) => ({ ...b })),
    cableways: INITIAL_SKY_CABLEWAYS.map((c) => ({ ...c })),
    gliders: [],
    exploreRuins: buildInitialExploreRuins(worldSeed),
    projectiles: [],
    wildNodes: buildInitialWildNodes(worldSeed),
    villagers: initialVillagers,
    clanVillagers: isSiege ? [] : [...outpost.clanVillagers],
    raiders: isSiege ? [] : [...outpost.raiders],
    buildings: startingBuildings,
    placedSuggestions: [],
    livestock: [],
    wildHerds: buildInitialWildHerds(worldSeed),
    boats: isSovereign ? [...outpost.boats] : [],
    memorials: [],
    diplomacy: {
      hearthfolk: { cultureId: 'hearthfolk', trust: 100, status: 'peaceful', grievances: [], lastEnvoyDay: 1, raidTimer: 0 },
      sylvan: { cultureId: 'sylvan', trust: 74, status: 'peaceful', grievances: [], lastEnvoyDay: 1, raidTimer: 0 },
      cragforge: { cultureId: 'cragforge', trust: 68, status: 'peaceful', grievances: [], lastEnvoyDay: 1, raidTimer: 0 },
      mist_mariner: {
        cultureId: 'mist_mariner',
        trust: isSiege ? 12 : 38,
        status: isSiege ? 'war' : 'wary',
        grievances: ['Wary of uncharted sails near their misty reef'],
        lastEnvoyDay: 0,
        raidTimer: 45,
      },
      ashen_raider: {
        cultureId: 'ashen_raider',
        trust: 0,
        status: 'war',
        grievances: ['Defends volcanic iron vaults against all outsiders'],
        lastEnvoyDay: 0,
        raidTimer: 75,
      },
    },
    pendingArrivals: [],
    chronicle: [
      {
        id: 'chr_init_1',
        day: 1,
        text: isSovereign
          ? 'Sovereign Sandbox opened over 8 floating islands—you command Hearthglen while rival islands govern themselves autonomously.'
          : isSiege
            ? 'Shared Siege Defense begun! Rally defenders together across Cradle Isle against multi-front raiders from sea, gliders & bridges.'
            : 'Adam and Eve awakened with empty hands and no buildings on Cradle Isle—securing fire, food, and shelter before raising their village.',
        kind: 'era',
      },
    ],
    eventLog: [
      {
        id: 'ev_init_1',
        day: 1,
        timeOfDay: 0.36,
        category: 'migration',
        significance: 'notable',
        summary: isSovereign
          ? 'Sovereign Sandbox opened over 8 floating islands.'
          : isSiege
            ? 'Defenders rallied on Cradle Isle against the coming siege.'
            : 'Adam and Eve awakened with empty hands on Cradle Isle.',
        islandId: 'cradle',
        participantIds: initialVillagers.map((v) => v.id),
      },
    ],
    communityRules: [],
    incidents: [],
    disputes: [],
    completedAspirations: [],
    chiefId: null,
    chiefFocus: isSiege ? 'defense' : 'balanced',
    siege: isSiege
      ? {
          wave: 0,
          nextWaveTimer: 32,
          activeFronts: [],
          totalKills: 0,
          warningText: 'War horns echo across 3 horizons — gather stone & brace defenses!',
          lastWaveDay: 1,
        }
      : {
          wave: 0,
          nextWaveTimer: 0,
          activeFronts: [],
          totalKills: 0,
          warningText: null,
          lastWaveDay: 1,
        },
    environment: {
      timeOfDay: 0.36,
      timeMode: 'cycle',
      cycleSpeedSeconds: 180,
      weather: 'clear',
      weatherMode: 'dynamic',
      weatherTimer: 85,
      season: 'spring',
      seasonDay: 1,
      dayCount: 1,
      festivalActive: false,
    },
    settings: {
      fpsCap: 60,
      simSpeed: 1,
      muted: true,
      volume: 0.45,
      autoProgress: true,
    },
    lastTickTimestamp: Date.now(),
    nextTravelerTimer: 300,
    activeConstruction: null,
    suggestedBuildingId: null,
    autoBuildTimer: 4,
    autoWelcomeTimer: 18,
    prosperityScore: 55,
    villageTrajectory: 'steady',
    trajectoryReasons: ['Founders exploring natural berries, loose stones & social ties before building.'],
    ruinDaysCount: 0,
    departedCount: 0,
    deathCount: 0,
    catX: ISLAND_DEFS.cradle.centerX - 42,
    catY: ISLAND_DEFS.cradle.centerY + 34,
    catTargetX: ISLAND_DEFS.cradle.centerX + 46,
    catTargetY: ISLAND_DEFS.cradle.centerY + 42,
    catFacing: 1,
    catPauseTimer: 2,
  };

  for (const v of [...world.villagers, ...world.clanVillagers]) {
    upsertLineage(world, v);
  }
  ensureSocialRecord(world, adam, eve);
  ensureSocialRecord(world, eve, adam);
  syncCombinedFood(world);
  for (const v of world.villagers) {
    v.decisionTrace = evaluateVillagerDecision(world, v).trace;
  }
  return world;
}

export function normalizeWorldState(raw: WorldState): WorldState {
  const seed =
    typeof raw.worldSeed === 'number' && Number.isFinite(raw.worldSeed) && raw.worldSeed > 0
      ? Math.floor(raw.worldSeed)
      : DEFAULT_WORLD_SEED;
  applyArchipelagoSeed(seed);
  const base = createInitialWorld(raw.gameMode ?? 'whisper_solo', seed);
  const merged: WorldState = {
    ...base,
    ...raw,
    worldSeed: seed,
    gameMode: raw.gameMode ?? 'whisper_solo',
    localHomeIslandId: raw.localHomeIslandId ?? 'cradle',
    islandOwners: { ...base.islandOwners, ...(raw.islandOwners ?? {}) },
    resources: { ...base.resources, ...(raw.resources ?? {}) },
    villageResources: { ...base.villageResources, ...(raw.villageResources ?? {}) },
    villagePolicies: { ...base.villagePolicies, ...(raw.villagePolicies ?? {}) },
    resourceFlows: { ...base.resourceFlows, ...(raw.resourceFlows ?? {}) },
    lineage: { ...(raw.lineage ?? {}) },
    comforts: { ...base.comforts, ...(raw.comforts ?? {}) },
    islands: { ...base.islands, ...(raw.islands ?? {}) },
    villageCultures: { ...base.villageCultures, ...(raw.villageCultures ?? {}) },
    diplomacy: { ...base.diplomacy, ...(raw.diplomacy ?? {}) },
    environment: { ...base.environment, ...(raw.environment ?? {}) },
    cableways: Array.isArray(raw.cableways) && raw.cableways.length > 0 ? raw.cableways : base.cableways,
    gliders: Array.isArray(raw.gliders) ? raw.gliders : [],
    exploreRuins: Array.isArray(raw.exploreRuins) && raw.exploreRuins.length > 0 ? raw.exploreRuins : base.exploreRuins,
    projectiles: Array.isArray(raw.projectiles) ? raw.projectiles : [],
    clanVillagers: Array.isArray(raw.clanVillagers) ? raw.clanVillagers : base.clanVillagers,
    raiders: Array.isArray(raw.raiders) ? raw.raiders : base.raiders,
    siege: raw.siege ?? base.siege,
    eventLog: Array.isArray(raw.eventLog) ? raw.eventLog.slice(0, 200) : [],
    communityRules: Array.isArray(raw.communityRules) ? raw.communityRules : [],
    incidents: Array.isArray(raw.incidents) ? raw.incidents : [],
    disputes: Array.isArray(raw.disputes) ? raw.disputes : [],
    settings: {
      fpsCap: raw.settings?.fpsCap ?? 60,
      simSpeed: (raw.settings?.simSpeed ?? 1) as 0 | 1 | 2 | 3,
      muted: raw.settings?.muted ?? true,
      volume: raw.settings?.volume ?? 0.45,
      autoProgress: raw.settings?.autoProgress ?? true,
    },
  };
  for (const v of [...merged.villagers, ...merged.clanVillagers, ...merged.raiders]) {
    if (!v.homeIslandId) v.homeIslandId = v.islandId;
    if (!v.visitStatus) v.visitStatus = 'home';
    if (!v.pairChatCooldowns) v.pairChatCooldowns = {};
    if (!v.stuckState) v.stuckState = { lastX: v.x, lastY: v.y, timer: 0, detourSign: 1 };
    if (!v.cognition) {
      v.cognition = {
        stage: 'reasoning',
        awareness: 75,
        observedConcepts: ['berry_bush', 'branch_pile', 'stone_boulder', 'spring'],
        socialCount: 3,
        focusObject: null,
      };
    } else if (typeof v.cognition.socialCount !== 'number') {
      v.cognition.socialCount = v.cognition.awareness >= 30 ? 2 : 0;
    }
    if (!v.stats) v.stats = rollUnitStats(v.traits ?? [], Boolean(v.isStranger));
    if (!v.skills) v.skills = rollStarterSkills(v.lifeStage ?? 'adult', Boolean(v.isStranger));
    if (!v.skillXp) v.skillXp = {};
    if (v.rtsOrder === undefined) v.rtsOrder = null;
    if (v.drafted === undefined) v.drafted = false;
    getNpcPersonality(v);
    ensureVillagerKnowledge(v, true);
    if (!Array.isArray(v.memories) || v.memories.length === 0) {
      v.memories = v.lastMemory
        ? [
            {
              id: `mem_norm_${v.id}`,
              day: merged.environment.dayCount,
              timeOfDay: merged.environment.timeOfDay,
              kind: 'discovery',
              summary: v.lastMemory,
              actorIds: [],
              importance: 5,
              sentiment: 'neutral',
            },
          ]
        : [];
    }
    if (typeof v.carryCapacity !== 'number') v.carryCapacity = 6;
    if (typeof v.carriedAmount !== 'number') v.carriedAmount = 0;
    if (v.carriedResource === undefined) v.carriedResource = null;
    if (typeof v.reputation !== 'number') v.reputation = v.isStranger ? -15 : 15;
    if (v.banished === undefined) v.banished = false;
    if (typeof v.offenseCount !== 'number') v.offenseCount = 0;
    if (typeof v.contributionCount !== 'number') v.contributionCount = 0;
    if (!Array.isArray(v.knownIncidentIds)) v.knownIncidentIds = [];
    if (!Array.isArray(v.rumorIncidentIds)) v.rumorIncidentIds = [];
    if (!v.isStranger) upsertLineage(merged, v);
  }
  ensureGovernanceArrays(merged);
  for (const b of merged.buildings) {
    if (b.unlocked) {
      b.constructionStage = 'complete';
      b.pausedForMaterials = false;
    } else {
      b.constructionStage = b.constructionStage ?? 'foundation';
      b.pausedForMaterials = Boolean(b.pausedForMaterials);
    }
  }
  for (const h of merged.wildHerds) {
    ensureWildAnimalState(h);
  }
  syncCombinedFood(merged);
  for (const v of merged.villagers) {
    if (!v.decisionTrace) {
      v.decisionTrace = evaluateVillagerDecision(merged, v).trace;
    }
  }
  return merged;
}

export function assignPlayerVillageInWorld(
  world: WorldState,
  playerId: string,
  preferredIslandId?: IslandId,
): IslandId {
  if (world.gameMode === 'shared_siege') {
    if (!world.islandOwners) world.islandOwners = {} as Record<IslandId, string | null>;
    if (!world.islandOwners.cradle) world.islandOwners.cradle = playerId;
    world.islands.cradle.discovered = true;
    return 'cradle';
  }

  let assigned: IslandId | null = preferredIslandId ?? null;
  if (!assigned) {
    // Reconnect check first
    for (const id of PLAYER_VILLAGE_ISLANDS) {
      if (world.islandOwners[id] === playerId) {
        assigned = id;
        break;
      }
    }
  }
  if (!assigned) {
    for (const id of PLAYER_VILLAGE_ISLANDS) {
      const owner = world.islandOwners[id];
      if (!owner || owner === 'player_solo') {
        assigned = id;
        break;
      }
    }
  }
  if (!assigned) assigned = 'cradle';

  world.islandOwners[assigned] = playerId;
  world.islands[assigned].ownerPlayerId = playerId;
  world.islands[assigned].discovered = true;
  world.islands[assigned].settledDay ??= world.environment.dayCount;

  // Claim local villagers on assigned island or promote native clan / spawn 2 founders
  let existingLocals = world.villagers.filter((v) => v.homeIslandId === assigned);
  if (existingLocals.length === 0) {
    const promoted: VillagerEntity[] = [];
    for (let i = world.clanVillagers.length - 1; i >= 0; i--) {
      if (world.clanVillagers[i].homeIslandId === assigned) {
        const cv = world.clanVillagers.splice(i, 1)[0];
        cv.isNativeClan = false;
        cv.ownerPlayerId = playerId;
        cv.cognition.awareness = Math.max(cv.cognition.awareness, 45);
        cv.cognition.stage = cognitiveStageFromAwareness(cv.cognition.awareness);
        promoted.push(cv);
      }
    }
    if (promoted.length > 0) {
      world.villagers.push(...promoted);
      existingLocals = promoted;
    }
  } else {
    for (const v of existingLocals) {
      v.ownerPlayerId = playerId;
    }
  }

  if (existingLocals.length === 0) {
    const isl = ISLAND_DEFS[assigned];
    const names = new Set(world.villagers.map((u) => u.name));
    const c1 = generateCandidate('traveler', world.environment.dayCount, names);
    names.add(c1.name);
    const c2 = generateCandidate('traveler', world.environment.dayCount, names);
    const f1 = makeFounder(`vil_mp_${assigned}_1_${Date.now()}`, c1.name, c1.cloakColor, c1.hairColor, c1.skinTone, c1.hairStyle, c1.traits, -20, 10);
    const f2 = makeFounder(`vil_mp_${assigned}_2_${Date.now()}`, c2.name, c2.cloakColor, c2.hairColor, c2.skinTone, c2.hairStyle, c2.traits, 20, -8);
    for (const f of [f1, f2]) {
      f.islandId = assigned;
      f.homeIslandId = assigned;
      f.ownerPlayerId = playerId;
      f.cultureId = world.islands[assigned].owningCultureId;
      f.x = isl.centerX + (f === f1 ? -22 : 22);
      f.y = isl.centerY + (f === f1 ? 10 : -8);
      f.targetX = isl.centerX;
      f.targetY = isl.centerY;
      f.cognition = { stage: 'experimenting', awareness: 38, observedConcepts: ['berry_bush', 'stone_boulder'], socialCount: 2, focusObject: null };
      f.stuckState = { lastX: f.x, lastY: f.y, timer: 0, detourSign: 1 };
    }
    f1.partnerId = f2.id;
    f2.partnerId = f1.id;
    f1.relationships[f2.id] = 66;
    f2.relationships[f1.id] = 66;
    world.villagers.push(f1, f2);
    existingLocals = [f1, f2];
    const res = getVillageRes(world, assigned);
    if (res.food < 12) res.berries += 12 - res.food;
    if (res.timber < 18) res.timber = 18;
    if (res.stone < 12) res.stone = 12;
  }

  for (const v of existingLocals) {
    upsertLineage(world, v);
  }
  syncCombinedFood(world);
  addChronicle(world, `A new sky-deity claimed ${ISLAND_DEFS[assigned].name} (${existingLocals.length} villagers).`, 'era');
  return assigned;
}

export function loadWorldFromStorage(): WorldState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(legacyKey);
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorldState;
    if (!parsed || parsed.version !== CURRENT_WORLD_VERSION || !Array.isArray(parsed.villagers)) {
      return null;
    }
    return normalizeWorldState(parsed);
  } catch {
    return null;
  }
}

export function saveWorldToStorage(world: WorldState) {
  if (typeof localStorage === 'undefined') return;
  try {
    world.lastTickTimestamp = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(world));
  } catch {
    // Ignore storage quota issues
  }
}

export function clearWorldStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(legacyKey);
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function getTaskAvailable(world: WorldState, task: TaskType, islandId?: IslandId): boolean {
  const meta = TASK_BY_ID[task];
  if (!meta) return false;
  if (task === 'gather_stone' || task === 'forage' || task === 'chop') return true;
  if (meta.requiredTechId && !getTechUnlocked(world, meta.requiredTechId)) return false;
  if (task === 'farm' && !hasBuildingType(world, 'farm_plot', islandId)) return false;
  if (task === 'pasture' && !hasBuildingType(world, 'pasture', islandId)) return false;
  if (task === 'quarry' && !hasBuildingType(world, 'quarry', islandId)) return false;
  if (task === 'fish' && !hasBuildingType(world, 'dock', islandId)) {
    return false;
  }
  if (task === 'bake' && !hasBuildingType(world, 'bakery', islandId)) return false;
  if (task === 'study' && !hasBuildingType(world, 'library', islandId)) return false;
  if (task === 'smelt' && !hasBuildingType(world, 'smeltery', islandId)) return false;
  if (task === 'guard' && !hasBuildingType(world, 'watchtower', islandId) && !hasBuildingType(world, 'barracks', islandId)) return false;
  return true;
}

function getBuildCost(bp: (typeof BUILDING_BLUEPRINTS)[BuildingType]): Partial<VillageResources> {
  return bp.baseCost;
}

function hasResourcesFor(res: VillageResources, cost: Partial<VillageResources>): boolean {
  for (const [k, v] of Object.entries(cost)) {
    if (typeof v === 'number' && (res[k as keyof VillageResources] ?? 0) < v) {
      return false;
    }
  }
  return true;
}

export function spendVillageResources(
  world: WorldState,
  islandId: IslandId,
  cost: Partial<VillageResources>,
) {
  const res = getVillageRes(world, islandId);
  for (const [k, v] of Object.entries(cost)) {
    if (typeof v === 'number' && v > 0) {
      const key = k as keyof VillageResources;
      const actual = Math.min(res[key] ?? 0, v);
      res[key] = Math.max(0, (res[key] ?? 0) - v);
      recordFlow(world, islandId, 'out', key, actual);
    }
  }
  syncCombinedFood(world);
}

function findValidSiteOnIsland(world: WorldState, islandId: IslandId): { x: number; y: number } | null {
  const isl = ISLAND_DEFS[islandId];
  for (let attempt = 0; attempt < 64; attempt++) {
    const ang = (attempt * 2.39996) % (Math.PI * 2);
    const rFactor = 0.14 + ((attempt % 8) / 8) * 0.64;
    const x = Math.round(isl.centerX + Math.cos(ang) * (isl.radiusX - 90) * rFactor);
    const y = Math.round(isl.centerY + Math.sin(ang) * (isl.radiusY - 80) * rFactor);
    if (!isPointInsideIsland(isl, x, y, 48)) continue;
    if (world.buildings.some((b) => Math.hypot(b.x - x, b.y - y) < 82)) continue;
    if (
      world.wildNodes.some(
        (n) => n.islandId === islandId && Math.hypot(n.x - x, n.y - y) < (n.kind === 'tree' ? (n.scale ?? 1) * 18 + 26 : 42),
      )
    ) {
      continue;
    }
    if (isl.hasSpring && isl.springOffset) {
      const sx = isl.centerX + isl.springOffset.dx;
      const sy = isl.centerY + isl.springOffset.dy;
      if (Math.hypot(x - sx, y - sy) < 58) continue;
    }
    if (world.exploreRuins.some((r) => r.islandId === islandId && Math.hypot(r.x - x, r.y - y) < 68)) continue;
    if (
      ARCHIPELAGO_LANDMARKS.some(
        (lm) => lm.islandId === islandId && lm.kind !== 'reed_clump' && Math.hypot(lm.x - x, lm.y - y) < lm.scale * 22 + 24,
      )
    ) {
      continue;
    }
    if (
      world.bridges.some(
        (br) =>
          (br.fromIsland === islandId && Math.hypot(br.x1 - x, br.y1 - y) < 58) ||
          (br.toIsland === islandId && Math.hypot(br.x2 - x, br.y2 - y) < 58),
      )
    ) {
      continue;
    }
    return { x, y };
  }
  return { x: isl.centerX + 55, y: isl.centerY + 42 };
}

function pickBuildingCulture(islandId: IslandId, world: WorldState): CultureId {
  return world.islands[islandId]?.owningCultureId ?? ISLAND_DEFS[islandId].defaultCultureId;
}

function createBuildingInstance(
  world: WorldState,
  type: BuildingType,
  islandId: IslandId,
  x: number,
  y: number,
  cropType: CropType = 'turnip',
  livestockKind: LivestockKind = 'sheep',
): BuildingEntity {
  const bp = BUILDING_BLUEPRINTS[type];
  const cultureId = pickBuildingCulture(islandId, world);
  const isl = ISLAND_DEFS[islandId];
  const nearWater =
    isl.hasSpring && isl.springOffset
      ? Math.hypot(x - (isl.centerX + isl.springOffset.dx), y - (isl.centerY + isl.springOffset.dy)) < 120
      : false;
  const b: BuildingEntity = {
    id: `bld_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    name: type === 'farm_plot' ? `${CROP_META[cropType].label} Field` : type === 'pasture' ? `${LIVESTOCK_META[livestockKind].label} Pen` : bp.name,
    islandId,
    cultureId,
    description: bp.description,
    level: 0,
    maxLevel: bp.maxLevel,
    x,
    y,
    unlocked: false,
    disrepair: 0,
    hp: 160,
    maxHp: 160,
    housingCapacity: bp.housingCapacity,
    baseCost: bp.baseCost,
    benefitDescription: bp.benefitDescription,
    cropState:
      type === 'farm_plot'
        ? { cropType, growth: 0.08, fertility: isl.soilQuality, irrigated: nearWater || isl.hasWaterfall }
        : undefined,
    livestockKind: type === 'pasture' ? livestockKind : undefined,
  };
  initStagedBuildingMaterials(b, bp.baseCost);
  return b;
}

function spawnPastureLivestock(world: WorldState, pasture: BuildingEntity) {
  const kind: LivestockKind = pasture.livestockKind ?? 'sheep';
  const count = kind === 'fowl' ? 4 : 3;
  const baseColor = LIVESTOCK_META[kind].color;
  for (let i = 0; i < count; i++) {
    const scale = Number((0.86 + Math.random() * 0.32).toFixed(2));
    world.livestock.push({
      id: `stk_${pasture.id}_${i}`,
      kind,
      islandId: pasture.islandId,
      pastureId: pasture.id,
      x: pasture.x + (Math.random() * 24 - 12),
      y: pasture.y + (Math.random() * 16 - 8),
      targetX: pasture.x + (Math.random() * 22 - 11),
      targetY: pasture.y + (Math.random() * 14 - 7),
      facing: Math.random() < 0.5 ? 1 : -1,
      pauseTimer: Math.random() * 3,
      yieldTimer: 18 + Math.random() * 12,
      color: baseColor,
      scale,
    });
  }
}

function spawnDockBoat(world: WorldState, dock: BuildingEntity, kind: BoatKind) {
  const isl = ISLAND_DEFS[dock.islandId];
  const cultureId = dock.cultureId;
  const labelMap: Record<BoatKind, string> = {
    fishing_skiff: 'Coastal Skiff',
    cargo_merchant: 'Archipelago Merchant',
    war_galley: 'Shielded Galley',
    migrant_skiff: 'Migrant Skiff',
  };
  const maxHp = kind === 'war_galley' ? 240 : kind === 'cargo_merchant' ? 160 : 100;
  world.boats.push({
    id: `boat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: `${CULTURES[cultureId].name.split(' ')[0]} ${labelMap[kind]}`,
    kind,
    cultureId,
    homeIslandId: dock.islandId,
    targetIslandId: dock.islandId,
    x: isl.dockSpot.seaX,
    y: isl.dockSpot.seaY,
    targetX: isl.dockSpot.seaX + (Math.random() * 90 - 45),
    targetY: isl.dockSpot.seaY + (Math.random() * 80 - 40),
    yaw: 0,
    hp: maxHp,
    maxHp,
    state: kind === 'fishing_skiff' ? 'fishing' : 'docked',
    cargoText: kind === 'fishing_skiff' ? 'Nets & Catch' : kind === 'cargo_merchant' ? 'Timber & Grain' : 'Patrol Crew',
    passengerIds: [],
    tripTimer: 8 + Math.random() * 8,
  });
}

function discoverIsland(world: WorldState, islandId: IslandId, explorerName?: string) {
  const islState = world.islands[islandId];
  if (!islState || islState.discovered) return;
  islState.discovered = true;
  const def = ISLAND_DEFS[islandId];
  if (islandId === 'mistatoll') {
    const dip = world.diplomacy.mist_mariner;
    if (dip.status === 'unknown') {
      dip.status = 'wary';
      dip.trust = 38;
    }
    addChronicle(
      world,
      `${explorerName ?? 'Scouts'} pierced the eastern mist and sighted ${def.name}—home to the wary Mist Mariners!`,
      'voyage',
    );
  } else {
    addChronicle(
      world,
      `${explorerName ?? 'Explorers'} charted ${def.name}! (${def.subtitle})`,
      'voyage',
    );
  }
}

export function killVillager(
  world: WorldState,
  villagerId: string,
  cause: DeathCause,
  particles: Particle[],
) {
  const idx = world.villagers.findIndex((v) => v.id === villagerId);
  if (idx === -1) return;
  const v = world.villagers[idx];
  // Archive permanent lineage record with cause and kin links intact BEFORE removal
  upsertLineage(world, v, cause);
  world.villagers.splice(idx, 1);
  world.deathCount += 1;

  const epitaphs: Record<DeathCause, string> = {
    starvation: 'Fell to hunger when winter stores ran bare.',
    freezing: 'Taken by bitter frost without dry wool or hearth.',
    boar: 'Charged by a fierce wild boar in the highland brush.',
    shipwreck: 'Lost to stormy sky-sea squalls far from shore.',
    combat: 'Fell defending the archipelago against raiders.',
    old_age: 'Passed peacefully after many seasons by the fire.',
  };

  world.memorials.push({
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    villagerName: v.name,
    islandId: v.islandId,
    x: v.x,
    y: v.y,
    dayDied: world.environment.dayCount,
    cause,
    epitaph: epitaphs[cause],
  });

  if (world.chiefId === v.id) {
    world.chiefId = null;
  }
  if (world.activeConstruction?.builderId === v.id) {
    world.activeConstruction = null;
  }

  for (const rem of world.villagers) {
    if (rem.partnerId === v.id) rem.partnerId = null;
    if (rem.hangOutTargetId === v.id) rem.hangOutTargetId = null;
    if (rem.childrenIds.includes(v.id)) {
      rem.childrenIds = rem.childrenIds.filter((cid) => cid !== v.id);
    }
    const wasKin = v.partnerId === rem.id || (rem.relationships[v.id] ?? 0) >= 55;
    rem.mood = Math.max(5, rem.mood - (wasKin ? 22 : 10));
    if (wasKin) {
      rem.thoughtBubble = `Farewell, ${v.name.split(' ')[0]}...`;
      rem.thoughtTimer = 4.2;
      rem.lastMemory = `Mourned the loss of ${v.name.split(' ')[0]}.`;
    }
  }

  addChronicle(world, `${v.name} died (${cause.replace('_', ' ')}) on ${ISLAND_DEFS[v.islandId].name}.`, 'death');

  for (let i = 0; i < 6; i++) {
    spawnParticle(particles, {
      kind: cause === 'boar' || cause === 'combat' ? 'blood' : 'smoke',
      x: v.x + (Math.random() * 12 - 6),
      y: v.y - 6,
      vx: (Math.random() - 0.5) * 8,
      vy: -10 - Math.random() * 8,
      maxLife: 1.4,
      size: 2.2,
      alpha: 0.85,
      phase: 0,
      color: cause === 'boar' || cause === 'combat' ? '#D9534F' : '#CBD5E1',
    });
  }

  if (world.villagers.length === 0) {
    world.villageTrajectory = 'ruined';
    world.prosperityScore = 0;
    addChronicle(world, 'Every inhabitant perished. Only silent stone cairns remain above the clouds.', 'ruin');
  }
}

function grantKnowledge(world: WorldState, amount: number, particles: Particle[], sourceUnit?: VillagerEntity) {
  if (world.villagers.length === 0) return;
  const techMods = getTechModifiers(world.unlockedTechIds);
  const libs = world.buildings.filter((b) => b.type === 'library' && b.unlocked);
  const libBonus = 1 + libs.reduce((acc, b) => acc + b.level * 0.65, 0);
  const bonfires = world.buildings.filter((b) => b.type === 'bonfire' && b.unlocked);
  const fireBonus = bonfires.length > 0 ? 1.25 : 1.0;
  const enlightenedBoost = world.villagers.some((v) => v.cognition.stage === 'enlightened') ? 1.3 : 1.0;
  const traitMult = sourceUnit ? getTraitStats(sourceUnit).knowledgeMult : 1.0;

  world.knowledgeXp += amount * libBonus * fireBonus * enlightenedBoost * techMods.knowledgeMult * traitMult;

  const frontier = getAvailableFrontierTechs(world.unlockedTechIds);
  if (frontier.length === 0) {
    world.activeTechId = null;
    return;
  }

  if (!world.activeTechId || !frontier.some((f) => f.id === world.activeTechId)) {
    world.activeTechId = frontier[0].id;
  }

  const activeNode = TECH_BY_ID[world.activeTechId];
  if (activeNode && world.knowledgeXp >= activeNode.costXp) {
    world.knowledgeXp -= activeNode.costXp;
    world.unlockedTechIds.push(activeNode.id);
    addChronicle(
      world,
      `Cultural Discovery: ${activeNode.name} — ${activeNode.effectSummary ?? activeNode.unlocksLabel}!`,
      'tech',
    );

    const firstV = sourceUnit ?? world.villagers[0];
    if (firstV) {
      firstV.thoughtBubble = `${activeNode.name}!`;
      firstV.thoughtTimer = 4.0;
      spawnParticle(particles, {
        kind: 'sparkle',
        x: firstV.x,
        y: firstV.y - 14,
        vx: 0,
        vy: -14,
        maxLife: 1.5,
        size: 3,
        alpha: 1,
        phase: 0,
        color: '#FDE047',
      });
    }

    const nextFrontier = getAvailableFrontierTechs(world.unlockedTechIds);
    world.activeTechId = nextFrontier[0]?.id ?? null;
  }
}

function applyCombatStrike(
  world: WorldState,
  attacker: VillagerEntity | null,
  defender: VillagerEntity,
  rawDmg: number,
  baseBleedChance: number,
  cause: DeathCause,
  particles: Particle[],
): boolean {
  const defStats = getTraitStats(defender);
  const techMods = getTechModifiers(world.unlockedTechIds);
  const defTactics = getSkillLevel(defender, 'tactics');
  const armorMit = defender.gearTier * 2.5 + (defender.isStranger ? 0 : techMods.armorBonus) + defTactics * 0.4;
  const dmg = Math.max(2, Math.round((rawDmg - armorMit) * defStats.damageTakenMult));
  defender.hp = Math.max(0, defender.hp - dmg);

  // Bleeding roll (reduced by hard_skin, defender bleedResist, and herbalism/tech!)
  const bleedMult =
    defStats.bleedChanceMult *
    Math.max(0.08, 1 - (defender.stats?.bleedResist ?? 0.1) - (defender.isStranger ? 0 : techMods.bleedResistBonus));
  const atkBladeBonus = attacker ? getSkillLevel(attacker, 'blade_mastery') * 0.03 : 0;
  const finalBleedChance = Math.max(0.02, (baseBleedChance + atkBladeBonus) * bleedMult);
  if (Math.random() < finalBleedChance && defender.hp > 0) {
    if (!defender.stats) defender.stats = rollUnitStats(defender.traits, Boolean(defender.isStranger));
    defender.stats.bleedStack = Math.min(4, defender.stats.bleedStack + 1);
    defender.stats.bleedTimer = 12;
    defender.thoughtBubble = defender.traits.includes('hard_skin') ? 'Scratched!' : 'Bleeding!';
    defender.thoughtTimer = 2.4;
  }

  for (let i = 0; i < 3; i++) {
    spawnParticle(particles, {
      kind: 'blood',
      x: defender.x + (Math.random() * 8 - 4),
      y: defender.y - 6,
      vx: (Math.random() - 0.5) * 10,
      vy: -8 - Math.random() * 6,
      maxLife: 0.7,
      size: 1.8,
      alpha: 0.85,
      phase: 0,
      color: '#DC2626',
    });
  }

  if (defender.hp <= 0) {
    if (!defender.isStranger) {
      killVillager(world, defender.id, cause, particles);
    }
    return true;
  }
  return false;
}

function updateVillagerEquipment(world: WorldState, v: VillagerEntity) {
  if (v.lifeStage === 'infant') return;
  const res = getVillageRes(world, v.homeIslandId ?? v.islandId);
  let targetGear = v.gearTier;
  if (getTechUnlocked(world, 'iron_statecraft') && res.iron >= 2 && (v.bravery > 0.65 || v.activeTask === 'guard' || v.drafted)) {
    targetGear = 3;
  } else if (getTechUnlocked(world, 'bronze_smelting') && res.bronze >= 2 && v.bravery > 0.55) {
    targetGear = Math.max(targetGear, 3) as 0 | 1 | 2 | 3;
  } else if (getTechUnlocked(world, 'animal_husbandry') && res.wool >= 1) {
    targetGear = Math.max(targetGear, 2) as 0 | 1 | 2 | 3;
  } else if (getTechUnlocked(world, 'woven_shelter')) {
    targetGear = Math.max(targetGear, 1) as 0 | 1 | 2 | 3;
  }
  v.gearTier = targetGear;

  if (getTechUnlocked(world, 'iron_statecraft') && res.iron >= 1 && (v.activeTask === 'guard' || v.drafted || v.bravery > 0.68)) {
    v.weaponType = 'iron_blade';
  } else if (getTechUnlocked(world, 'bronze_smelting') && res.bronze >= 1 && (v.activeTask === 'guard' || v.activeTask === 'hunt' || v.drafted)) {
    v.weaponType = 'bronze_blade';
  } else if (getTechUnlocked(world, 'archery_watch') && (v.activeTask === 'hunt' || v.activeTask === 'guard')) {
    v.weaponType = 'bow';
  } else if (getTechUnlocked(world, 'flint_spears') && (v.activeTask === 'hunt' || v.activeTask === 'guard' || v.bravery > 0.54 || v.drafted)) {
    v.weaponType = 'flint_spear';
  }
}

function getOwnedBuildIslands(world: WorldState): IslandId[] {
  if (world.gameMode === 'shared_siege') {
    return (['cradle', 'sunterrace', 'timbercrown'] as IslandId[]).filter((id) => world.islands[id]?.discovered);
  }
  const owned = PLAYER_VILLAGE_ISLANDS.filter((id) => Boolean(world.islandOwners?.[id]));
  if (owned.length > 0) return owned;
  return [world.localHomeIslandId ?? 'cradle'];
}

function pickNextAutonomousBuilding(world: WorldState, targetHomeIslandId?: IslandId): {
  type: BuildingType;
  islandId: IslandId;
  x: number;
  y: number;
  cropType?: CropType;
  livestockKind?: LivestockKind;
  suggestionId?: string;
} | null {
  const homeIsles = targetHomeIslandId ? [targetHomeIslandId] : getOwnedBuildIslands(world);
  const primaryIsle: IslandId = homeIsles[0] ?? world.localHomeIslandId ?? 'cradle';

  // 1. Honor player's click-placed suggestions for controlled islands if tech & resources ready
  for (const sug of world.placedSuggestions) {
    if (targetHomeIslandId && sug.islandId !== targetHomeIslandId && world.gameMode !== 'shared_siege') continue;
    const bp = BUILDING_BLUEPRINTS[sug.buildingType];
    if (!bp) continue;
    if (!getTechUnlocked(world, bp.requiredTechId)) continue;
    const payIsle: IslandId = world.islandOwners?.[sug.islandId] ? sug.islandId : primaryIsle;
    if (!hasResourcesFor(getVillageRes(world, payIsle), getBuildCost(bp))) continue;
    return {
      type: sug.buildingType,
      islandId: sug.islandId,
      x: sug.x,
      y: sug.y,
      cropType: sug.cropType,
      livestockKind: sug.livestockKind,
      suggestionId: sug.id,
    };
  }

  // 2. Basic-Needs-First survival & cultural priority per owned village
  for (const homeId of homeIsles) {
    const res = getVillageRes(world, homeId);
    const pop = Math.max(1, world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === homeId).length);
    const beds = getHousingBedsForIsland(world, homeId);
    const countIsleType = (t: BuildingType) =>
      world.buildings.filter((b) => b.islandId === homeId && b.type === t && b.unlocked).length;
    const anyPendingOnIsle = world.buildings.some((b) => b.islandId === homeId && !b.unlocked);
    if (anyPendingOnIsle) continue;

    const priorities: { type: BuildingType; islandId: IslandId; cropType?: CropType; livestockKind?: LivestockKind }[] = [];

    // Tier 1: Fire & Food security BEFORE shelter/industry
    if (countIsleType('bonfire') === 0) {
      priorities.push({ type: 'bonfire', islandId: homeId });
    }
    const foodTarget = Math.max(10, pop * 6);
    if (res.food < foodTarget && countIsleType('farm_plot') < 2) {
      priorities.push({
        type: 'farm_plot',
        islandId: homeId,
        cropType: countIsleType('farm_plot') === 0 ? 'turnip' : 'wheat',
      });
    }

    // Tier 2: Housing & Shelter BEFORE workshops/quarries/libraries/smelteries (strictly beds < pop)
    const homeCount = countIsleType('lean_to') + countIsleType('cottage');
    const needsHousing = villageNeedsHousing(pop, beds) || homeCount === 0;
    if (needsHousing) {
      if (canBuildCottage(world, homeId) && hasFoundationResources(res, getBuildCost(BUILDING_BLUEPRINTS.cottage))) {
        priorities.push({ type: 'cottage', islandId: homeId });
      } else {
        priorities.push({ type: 'lean_to', islandId: homeId });
      }
    }

    // Tier 3: Only expand workshops, crafts & defenses once basic food & housing are secure!
    const basicNeedsSecured =
      countIsleType('bonfire') > 0 &&
      (res.food >= Math.max(8, pop * 4) || countIsleType('farm_plot') >= 1) &&
      !villageNeedsHousing(pop, beds) &&
      homeCount > 0;

    if (basicNeedsSecured) {
      if (countIsleType('farm_plot') < 3) {
        priorities.push({
          type: 'farm_plot',
          islandId: homeId,
          cropType: countIsleType('farm_plot') === 0 ? 'turnip' : countIsleType('farm_plot') === 1 ? 'wheat' : 'herbs',
        });
      }
      if (countIsleType('woodshop') === 0) priorities.push({ type: 'woodshop', islandId: homeId });
      if (countIsleType('pasture') === 0) priorities.push({ type: 'pasture', islandId: homeId, livestockKind: 'sheep' });
      if (countIsleType('quarry') === 0) priorities.push({ type: 'quarry', islandId: homeId });
      if (countIsleType('dock') === 0) priorities.push({ type: 'dock', islandId: homeId });
      if (countIsleType('glider_pad') === 0) priorities.push({ type: 'glider_pad', islandId: homeId });
      if (countIsleType('bakery') === 0) priorities.push({ type: 'bakery', islandId: homeId });
      if (countIsleType('library') === 0) priorities.push({ type: 'library', islandId: homeId });
      if (countIsleType('watchtower') < 2) priorities.push({ type: 'watchtower', islandId: homeId });
      if (countIsleType('smeltery') === 0) priorities.push({ type: 'smeltery', islandId: homeId });
      if (countIsleType('barracks') === 0) priorities.push({ type: 'barracks', islandId: homeId });
    }

    for (const cand of priorities) {
      if (cand.type === 'cottage' && !canBuildCottage(world, cand.islandId)) continue;
      const bp = BUILDING_BLUEPRINTS[cand.type];
      if (!getTechUnlocked(world, bp.requiredTechId)) continue;
      if (!hasFoundationResources(res, getBuildCost(bp))) continue;
      const site = findValidSiteOnIsland(world, cand.islandId);
      if (!site) continue;
      return {
        ...cand,
        x: site.x,
        y: site.y,
      };
    }
  }
  return null;
}

function tickAutonomousConstruction(
  world: WorldState,
  dt: number,
  particles: Particle[],
  emitVisualParticles: boolean,
) {
  if (world.activeConstruction) {
    const ac = world.activeConstruction;
    const b = world.buildings.find((item) => item.id === ac.buildingId);
    let builder = world.villagers.find((v) => v.id === ac.builderId);
    if (!b) {
      world.activeConstruction = null;
      return;
    }
    if (!builder || builder.lifeStage === 'infant' || builder.banished) {
      builder =
        world.villagers.find((v) => !v.banished && v.lifeStage !== 'infant' && (v.homeIslandId ?? v.islandId) === b.islandId) ??
        world.villagers.find((v) => !v.banished && (v.lifeStage === 'adult' || v.lifeStage === 'elder'));
      if (!builder) return;
      ac.builderId = builder.id;
    }

    const matCheck = deliverMaterialsForStage(world, b, ac, syncCombinedFood);
    if (!matCheck.gateMet) {
      ac.progress = Math.min(ac.progress, Math.max(0, matCheck.nextGateRatio * ac.duration - 0.02));
      ac.pausedForMaterials = true;
      const carryingNeeded =
        builder.carriedResource &&
        (builder.carriedAmount ?? 0) > 0.05 &&
        matCheck.missing.includes(builder.carriedResource);
      if (carryingNeeded && builder.hunger >= 22) {
        builder.targetX = b.x;
        builder.targetY = b.y + 18;
        builder.autonomyReason = `Hauling ${builder.carriedResource} to ${b.name} (${ac.stage ?? 'foundation'}).`;
      } else {
        if (builder.state === 'building') builder.state = 'working';
        builder.autonomyReason = `Awaiting ${matCheck.missing.join(', ')} at ${b.name} (${ac.stage ?? 'foundation'}).`;
      }
      return;
    }
    ac.pausedForMaterials = false;

    if (builder.hunger < 24 || builder.warmth < 20) {
      if (builder.state === 'building') builder.state = 'resting';
      return;
    }

    builder.targetX = b.x;
    builder.targetY = b.y + 18;
    const dist = Math.hypot(builder.x - b.x, builder.y - b.y);
    if (dist <= 38) {
      builder.state = 'building';
      builder.autonomyReason = `${ac.isUpgrade ? 'Upgrading' : 'Building'} ${b.name} (${ac.stage ?? 'foundation'}).`;
      const cleverBoost = builder.traits.includes('clever_crafter') ? 1.3 : 1;
      const masonryMult = 1 + getSkillLevel(builder, 'masonry') * 0.08;
      const techBuildMult = getTechModifiers(world.unlockedTechIds).buildSpeedMult;
      ac.progress += dt * cleverBoost * masonryMult * (ac.isUpgrade ? techBuildMult : 1);
      b.constructionStage = getConstructionStageForRatio(ac.progress / Math.max(0.1, ac.duration), b.unlocked);
      ac.stage = b.constructionStage;
      gainSkillXp(world, builder, 'masonry', dt * 1.1);

      if (emitVisualParticles && Math.random() < dt * 2.2) {
        spawnParticle(particles, {
          kind: 'sparkle',
          x: b.x + (Math.random() * 20 - 10),
          y: b.y - 10,
          vx: (Math.random() - 0.5) * 14,
          vy: -14,
          maxLife: 0.7,
          size: 2,
          alpha: 0.9,
          phase: 0,
          color: '#FBBF24',
        });
      }

      if (ac.progress >= ac.duration) {
        b.unlocked = true;
        b.constructionStage = 'complete';
        b.pausedForMaterials = false;
        b.level = Math.min(b.maxLevel, Math.max(1, b.level + 1));
        b.disrepair = 0;
        b.hp = b.maxHp;
        addVillageResource(world, b.islandId, 'hearthlight', 6);
        grantKnowledge(world, 6, particles, builder);
        advanceKnowledge(builder, 'construction', 8);
        recordPositiveContribution(world, builder, 'build', null, 5);
        recordNpcMemory(builder, {
          day: world.environment.dayCount,
          timeOfDay: world.environment.timeOfDay,
          kind: 'construction',
          summary: `${ac.isUpgrade ? 'Upgraded' : 'Completed'} ${b.name} on ${ISLAND_DEFS[b.islandId].name}.`,
          actorIds: [],
          importance: 7,
          sentiment: 'positive',
        });

        if (!ac.isUpgrade && b.type === 'pasture') {
          spawnPastureLivestock(world, b);
        }
        if (!ac.isUpgrade && b.type === 'dock') {
          world.islands[b.islandId].dockBuilt = true;
          spawnDockBoat(world, b, 'fishing_skiff');
          if (getTechUnlocked(world, 'sail_navigation')) {
            spawnDockBoat(world, b, 'cargo_merchant');
          }
        }
        if (b.type === 'barracks' && getTechUnlocked(world, 'iron_statecraft')) {
          const hasGalley = world.boats.some((bt) => bt.homeIslandId === b.islandId && bt.kind === 'war_galley');
          if (!hasGalley) spawnDockBoat(world, b, 'war_galley');
        }

        addChronicle(
          world,
          `${builder.name.split(' ')[0]} ${ac.isUpgrade ? `upgraded ${b.name} to Lv.${b.level}` : `completed ${b.name}`} on ${ISLAND_DEFS[b.islandId].name}.`,
          'build',
          { islandId: b.islandId, participantIds: [builder.id] },
        );
        builder.thoughtBubble = 'Built!';
        builder.thoughtTimer = 3.2;
        builder.state = 'working';
        builder.decisionCooldown = 1;
        world.activeConstruction = null;
        if (world.suggestedBuildingId === b.id) world.suggestedBuildingId = null;
      }
    }
    return;
  }

  // Progressive Sky-Bridge Construction: villagers gather timber & stone and build plank-by-plank
  for (const br of world.bridges) {
    if (br.built) continue;
    if (!getTechUnlocked(world, br.requiredTechId)) continue;
    const builder = world.villagers.find(
      (v) => canVillagerWork(world, v) && (world.islands[br.fromIsland].discovered || world.islands[br.toIsland].discovered),
    );
    if (!builder) continue;
    const payIsle = builder.homeIslandId ?? builder.islandId;
    const payRes = getVillageRes(world, payIsle);

    if (br.progress === 0) {
      if (payRes.timber >= br.costTimber && payRes.stone >= br.costStone) {
        spendVillageResources(world, payIsle, { timber: br.costTimber, stone: br.costStone });
        br.progress = 0.04;
        addChronicle(world, `${builder.name.split(' ')[0]} began lashing the ${br.name}!`, 'voyage');
      } else {
        continue;
      }
    }

    if (br.progress > 0 && !br.built) {
      const anchorX = builder.islandId === br.toIsland ? br.x2 : br.x1;
      const anchorY = builder.islandId === br.toIsland ? br.y2 : br.y1;
      builder.targetX = anchorX;
      builder.targetY = anchorY;
      const d = Math.hypot(builder.x - anchorX, builder.y - anchorY);
      if (d <= 64) {
        builder.state = 'building';
        builder.autonomyReason = `Lashing planks on ${br.name} (${Math.round(br.progress * 100)}%).`;
        br.progress = Math.min(1, br.progress + dt * 0.11);
      } else {
        br.progress = Math.min(1, br.progress + dt * 0.03);
      }

      if (br.progress >= 1) {
        br.built = true;
        br.progress = 1;
        discoverIsland(world, br.fromIsland, builder.name.split(' ')[0]);
        discoverIsland(world, br.toIsland, builder.name.split(' ')[0]);
        world.islands[br.toIsland].settledDay ??= world.environment.dayCount;
        builder.thoughtBubble = 'Bridge linked!';
        builder.thoughtTimer = 3.6;
        addChronicle(
          world,
          `${builder.name.split(' ')[0]} completed the ${br.name}, linking ${ISLAND_DEFS[br.fromIsland].name} to ${ISLAND_DEFS[br.toIsland].name}!`,
          'voyage',
        );
      }
      return;
    }
  }

  // Progressive Sky-Cableway Construction once cliff_cableways is unlocked
  for (const cb of world.cableways) {
    if (cb.built) continue;
    if (!getTechUnlocked(world, cb.requiredTechId)) continue;
    const builder = world.villagers.find(
      (v) => canVillagerWork(world, v) && (world.islands[cb.fromIsland].discovered || world.islands[cb.toIsland].discovered),
    );
    if (!builder) continue;
    const payIsle = builder.homeIslandId ?? builder.islandId;
    const payRes = getVillageRes(world, payIsle);

    if (cb.progress === 0) {
      if (payRes.timber >= cb.costTimber && payRes.stone >= cb.costStone && payRes.iron >= cb.costIron) {
        spendVillageResources(world, payIsle, { timber: cb.costTimber, stone: cb.costStone, iron: cb.costIron });
        cb.progress = 0.05;
        addChronicle(world, `${builder.name.split(' ')[0]} began rigging the ${cb.name} sky-cable!`, 'voyage');
      } else {
        continue;
      }
    }

    if (cb.progress > 0 && !cb.built) {
      const anchorX = builder.islandId === cb.toIsland ? cb.x2 : cb.x1;
      const anchorY = builder.islandId === cb.toIsland ? cb.y2 : cb.y1;
      builder.targetX = anchorX;
      builder.targetY = anchorY;
      const d = Math.hypot(builder.x - anchorX, builder.y - anchorY);
      if (d <= 72) {
        builder.state = 'building';
        builder.autonomyReason = `Tensioning cable lines on ${cb.name} (${Math.round(cb.progress * 100)}%).`;
        cb.progress = Math.min(1, cb.progress + dt * 0.12);
      } else {
        cb.progress = Math.min(1, cb.progress + dt * 0.035);
      }
      if (cb.progress >= 1) {
        cb.built = true;
        cb.progress = 1;
        discoverIsland(world, cb.fromIsland, builder.name.split(' ')[0]);
        discoverIsland(world, cb.toIsland, builder.name.split(' ')[0]);
        builder.thoughtBubble = 'Cableway ready!';
        builder.thoughtTimer = 3.4;
        addChronicle(
          world,
          `${builder.name.split(' ')[0]} strung the ${cb.name} gondola between ${ISLAND_DEFS[cb.fromIsland].name} & ${ISLAND_DEFS[cb.toIsland].name}!`,
          'voyage',
        );
      }
      return;
    }
  }

  world.autoBuildTimer -= dt;
  if (world.autoBuildTimer > 0) return;
  world.autoBuildTimer = 6.5;

  const builders = world.villagers.filter((v) => canVillagerWork(world, v));
  if (builders.length === 0) return;

  // Resume any unfinished placed building for player/controlled villages
  const unfinished = world.buildings.find((b) => !b.unlocked && b.cultureId !== 'ashen_raider');
  if (unfinished) {
    const builder =
      builders.find((v) => (v.homeIslandId ?? v.islandId) === unfinished.islandId) ??
      builders.find((v) => v.islandId === unfinished.islandId) ??
      builders[0];
    const buildSpeed = getTechModifiers(world.unlockedTechIds).buildSpeedMult;
    world.activeConstruction = {
      buildingId: unfinished.id,
      builderId: builder.id,
      progress: 0,
      duration: Number(((unfinished.type === 'bonfire' || unfinished.type === 'lean_to' ? 4.2 : 6.8) / buildSpeed).toFixed(2)),
      isUpgrade: false,
    };
    return;
  }

  // Check if player suggested an existing building upgrade first
  if (world.suggestedBuildingId) {
    const b = world.buildings.find((item) => item.id === world.suggestedBuildingId);
    if (b && b.cultureId !== 'ashen_raider' && b.level < b.maxLevel) {
      const cost = getUpgradeCost(b);
      if (hasResourcesFor(getVillageRes(world, b.islandId), cost)) {
        spendVillageResources(world, b.islandId, cost);
        const builder =
          builders.find((v) => (v.homeIslandId ?? v.islandId) === b.islandId) ??
          builders[Math.floor(Math.random() * builders.length)];
        world.activeConstruction = {
          buildingId: b.id,
          builderId: builder.id,
          progress: 0,
          duration: 6 + b.level * 2.5,
          isUpgrade: b.unlocked,
        };
        return;
      }
    }
  }

  const nextPlan = pickNextAutonomousBuilding(world);
  if (nextPlan) {
    const bp = BUILDING_BLUEPRINTS[nextPlan.type];
    const cost = getBuildCost(bp);
    if (!hasFoundationResources(getVillageRes(world, nextPlan.islandId), cost)) return;

    if (nextPlan.suggestionId) {
      world.placedSuggestions = world.placedSuggestions.filter((s) => s.id !== nextPlan.suggestionId);
    }

    const building = createBuildingInstance(
      world,
      nextPlan.type,
      nextPlan.islandId,
      nextPlan.x,
      nextPlan.y,
      nextPlan.cropType ?? 'turnip',
      nextPlan.livestockKind ?? 'sheep',
    );
    initStagedBuildingMaterials(building, cost);
    world.buildings.push(building);

    const builder =
      builders.find((v) => (v.homeIslandId ?? v.islandId) === nextPlan.islandId) ??
      builders.find((v) => v.islandId === nextPlan.islandId) ??
      builders[Math.floor(Math.random() * builders.length)];
    const buildSpeed = getTechModifiers(world.unlockedTechIds).buildSpeedMult;
    const baseDur = nextPlan.type === 'bonfire' || nextPlan.type === 'lean_to' ? 4.2 : 7.5;
    world.activeConstruction = {
      buildingId: building.id,
      builderId: builder.id,
      progress: 0,
      duration: Number((baseDur / buildSpeed).toFixed(2)),
      isUpgrade: false,
      stage: 'foundation',
      pausedForMaterials: false,
    };
    return;
  }

  // Autonomous Upgrading: once food & housing are stable, reasoning builders upgrade structures
  const ownedIsles = new Set(getOwnedBuildIslands(world));
  const upgradable = world.buildings.filter(
    (b) =>
      b.unlocked &&
      ownedIsles.has(b.islandId) &&
      b.cultureId !== 'ashen_raider' &&
      b.level < b.maxLevel &&
      world.islands[b.islandId]?.discovered,
  );
  for (const b of upgradable) {
    const cost = getUpgradeCost(b);
    if (hasResourcesFor(getVillageRes(world, b.islandId), cost)) {
      spendVillageResources(world, b.islandId, cost);
      const builder = builders.find((v) => (v.homeIslandId ?? v.islandId) === b.islandId) ?? builders[0];
      world.activeConstruction = {
        buildingId: b.id,
        builderId: builder.id,
        progress: 0,
        duration: 6.5 + b.level * 2.2,
        isUpgrade: true,
      };
      return;
    }
  }
}

function assignTargetForTask(world: WorldState, v: VillagerEntity, task: TaskType) {
  const sameIsland = (x: number, y: number, islId: IslandId): boolean => {
    if (islId !== v.islandId) {
      const reach = checkTargetReachability(world, v.islandId, v.x, v.y, x, y, ARCHIPELAGO_LANDMARKS);
      if (!reach.reachable) return false;
      if (!findBridgeStep(world, v.islandId, islId)) {
        const dock = world.buildings.find((b) => b.islandId === v.islandId && b.type === 'dock' && b.unlocked);
        if (dock) {
          v.targetX = dock.x;
          v.targetY = dock.y;
          return true;
        }
        return false;
      }
    }
    v.targetX = x;
    v.targetY = y;
    return true;
  };

  if (task === 'forage') {
    const node =
      world.wildNodes.find(
        (n) =>
          n.islandId === v.islandId &&
          n.amount > 0.05 &&
          (n.kind === 'berry_bush' || n.kind === 'flint_pile' || n.kind === 'branch_pile'),
      ) ??
      world.wildNodes.find((n) => world.islands[n.islandId].discovered && n.amount > 0.05 && n.kind === 'berry_bush');
    if (node) {
      sameIsland(node.x + (Math.random() * 14 - 7), node.y + (Math.random() * 14 - 7), node.islandId);
      return;
    }
  } else if (task === 'gather_stone') {
    const node =
      world.wildNodes.find((n) => n.islandId === v.islandId && n.amount > 0.1 && (n.kind === 'stone_boulder' || n.kind === 'flint_pile')) ??
      world.wildNodes.find((n) => world.islands[n.islandId].discovered && n.amount > 0.1 && (n.kind === 'stone_boulder' || n.kind === 'flint_pile'));
    if (node) {
      sameIsland(node.x + (Math.random() * 16 - 8), node.y + (Math.random() * 16 - 8), node.islandId);
      return;
    }
  } else if (task === 'chop') {
    const node =
      world.wildNodes.find((n) => n.islandId === v.islandId && n.amount > 0.1 && (n.kind === 'tree' || n.kind === 'branch_pile')) ??
      world.wildNodes.find((n) => world.islands[n.islandId].discovered && n.amount > 0.1 && n.kind === 'tree');
    if (node) {
      sameIsland(node.x + (Math.random() * 16 - 8), node.y + (Math.random() * 16 - 8), node.islandId);
      return;
    }
  } else if (task === 'farm') {
    const farm =
      world.buildings.find((b) => b.type === 'farm_plot' && b.unlocked && b.islandId === v.islandId) ??
      world.buildings.find((b) => b.type === 'farm_plot' && b.unlocked);
    if (farm) {
      sameIsland(farm.x + (Math.random() * 18 - 9), farm.y + (Math.random() * 12 - 6), farm.islandId);
      return;
    }
  } else if (task === 'pasture') {
    const pen =
      world.buildings.find((b) => b.type === 'pasture' && b.unlocked && b.islandId === v.islandId) ??
      world.buildings.find((b) => b.type === 'pasture' && b.unlocked);
    if (pen) {
      sameIsland(pen.x + (Math.random() * 20 - 10), pen.y + (Math.random() * 14 - 7), pen.islandId);
      return;
    }
  } else if (task === 'hunt') {
    const prey =
      world.wildHerds.find((h) => h.islandId === v.islandId && h.hp > 0) ??
      world.wildHerds.find((h) => world.islands[h.islandId].discovered && h.hp > 0);
    if (prey) {
      sameIsland(prey.x, prey.y, prey.islandId);
      return;
    }
  } else if (task === 'quarry' || task === 'smelt' || task === 'bake' || task === 'study' || task === 'guard' || task === 'fish') {
    const typeMap: Record<string, BuildingType> = {
      quarry: 'quarry',
      smelt: 'smeltery',
      bake: 'bakery',
      study: 'library',
      guard: hasBuildingType(world, 'watchtower') ? 'watchtower' : 'barracks',
      fish: 'dock',
    };
    const b =
      world.buildings.find((item) => item.type === typeMap[task] && item.unlocked && item.islandId === v.islandId) ??
      world.buildings.find((item) => item.type === typeMap[task] && item.unlocked);
    if (b) {
      sameIsland(b.x + (Math.random() * 14 - 7), b.y + 16, b.islandId);
      return;
    }
  } else if (task === 'explore') {
    const localRuin = world.exploreRuins.find((r) => r.islandId === v.islandId && r.cooldownTimer <= 0);
    if (localRuin) {
      v.targetX = localRuin.x;
      v.targetY = localRuin.y + 12;
      return;
    }
    const pad = world.buildings.find((b) => b.islandId === v.islandId && b.type === 'glider_pad' && b.unlocked);
    if (pad) {
      v.targetX = pad.x;
      v.targetY = pad.y;
      return;
    }
    const cb = world.cableways.find((c) => c.built && (c.fromIsland === v.islandId || c.toIsland === v.islandId));
    if (cb) {
      v.targetX = cb.fromIsland === v.islandId ? cb.x1 : cb.x2;
      v.targetY = cb.fromIsland === v.islandId ? cb.y1 : cb.y2;
      return;
    }
    const dock = world.buildings.find((b) => b.islandId === v.islandId && b.type === 'dock' && b.unlocked);
    if (dock) {
      v.targetX = dock.x;
      v.targetY = dock.y;
      return;
    }
    const br = world.bridges.find((item) => item.built && (item.fromIsland === v.islandId || item.toIsland === v.islandId));
    if (br) {
      const targetIsle = br.fromIsland === v.islandId ? br.toIsland : br.fromIsland;
      v.targetX = ISLAND_DEFS[targetIsle].centerX;
      v.targetY = ISLAND_DEFS[targetIsle].centerY;
      return;
    }
  }

  const isl = ISLAND_DEFS[v.islandId];
  v.targetX = isl.centerX + (Math.random() * 90 - 45);
  v.targetY = isl.centerY + (Math.random() * 65 - 32);
}

const CONCEPT_REACTION_LINES: Record<string, { bubble: string; dialogue: string; memory: string }> = {
  berry_bush: {
    bubble: 'Sweet berries!',
    dialogue: 'I tasted soft red berries growing on leafy twigs—sweet and filling!',
    memory: 'Discovered wild edible berries in the meadow brush.',
  },
  flint_pile: {
    bubble: 'Sharp sparking rock!',
    dialogue: 'When I struck two grey stones together, bright golden sparks flew!',
    memory: 'Noticed flint chips throw hot sparks when struck.',
  },
  branch_pile: {
    bubble: 'Dry kindling!',
    dialogue: 'Snapped dry fallen branches—they are light, strong, and catch sparks easily.',
    memory: 'Examined fallen branches and tested their strength.',
  },
  spring: {
    bubble: 'Cool clear water!',
    dialogue: 'Dipped my fingers into the bubbling meadow spring—cool, clear, and refreshing!',
    memory: 'Found fresh spring water pooling in the mossy stones.',
  },
  tree: {
    bubble: 'Towering wood!',
    dialogue: 'Pressed my hands against rough bark reaching toward the sky—solid timber!',
    memory: 'Studied tall meadow trees swaying in the breeze.',
  },
  wildlife: {
    bubble: 'Furry creature!',
    dialogue: 'Watched a quick wild creature dart across the grass in awe!',
    memory: 'Observed wild animals roaming across the island.',
  },
  horizon: {
    bubble: 'Island in the sky!',
    dialogue: 'Peered over the cliff rim—our meadow floats above an endless blue sky-sea!',
    memory: 'Discovered the floating island horizon and distant mist.',
  },
  embers: {
    bubble: 'Warm dancing flame!',
    dialogue: 'Held my palms beside the crackling orange embers—warmth chases away the dark!',
    memory: 'Marveled at the heat and light of shared embers.',
  },
  copper_vein: {
    bubble: 'Gleaming green stone!',
    dialogue: 'Found heavy green-streaked rock inside the cliff face!',
    memory: 'Spotted gleaming copper ore veins.',
  },
  iron_vein: {
    bubble: 'Heavy dark iron!',
    dialogue: 'Touched dense dark-blue iron ore veining the high crags!',
    memory: 'Identified dark iron ore veins for strong blades & cables.',
  },
  ruin: {
    bubble: 'Ancient carvings!',
    dialogue: 'Traced ancient star-glyphs etched into moss-grown obelisks!',
    memory: 'Uncovered forgotten ruins left by ancient sky-farers.',
  },
  glacier: {
    bubble: 'Crystalline frost!',
    dialogue: 'Felt crisp alpine ice crystals shimmering at the summit spire!',
    memory: 'Marvelled at high-altitude alpine snow & crystal peaks.',
  },
  volcano: {
    bubble: 'Glowing basalt!',
    dialogue: 'Heat rises from fissures inside the Ashen Bastion caldera!',
    memory: 'Observed glowing volcanic rock along the Bastion cliffs.',
  },
};

function assignCognitiveExplorationTarget(world: WorldState, v: VillagerEntity) {
  const isl = ISLAND_DEFS[v.islandId];
  const observed = new Set(v.cognition.observedConcepts);

  interface SpotCand {
    concept: string;
    x: number;
    y: number;
    label: string;
  }
  const candidates: SpotCand[] = [];

  for (const node of world.wildNodes) {
    if (node.islandId !== v.islandId || node.amount <= 0) continue;
    if (!observed.has(node.kind)) {
      candidates.push({
        concept: node.kind,
        x: node.x,
        y: node.y,
        label: node.kind.replace('_', ' '),
      });
    }
  }
  if (isl.hasSpring && isl.springOffset && !observed.has('spring')) {
    candidates.push({
      concept: 'spring',
      x: isl.centerX + isl.springOffset.dx,
      y: isl.centerY + isl.springOffset.dy,
      label: 'fresh spring',
    });
  }
  const herd = world.wildHerds.find((h) => h.islandId === v.islandId && h.hp > 0);
  if (herd && !observed.has('wildlife')) {
    candidates.push({
      concept: 'wildlife',
      x: herd.x,
      y: herd.y,
      label: `wild ${herd.kind}`,
    });
  }
  const fire = getIslandBonfire(world, v.islandId);
  if (fire && !observed.has('embers')) {
    candidates.push({ concept: 'embers', x: fire.x, y: fire.y + 18, label: 'crackling embers' });
  }
  if (!observed.has('horizon')) {
    const ang = Math.random() * Math.PI * 2;
    candidates.push({
      concept: 'horizon',
      x: isl.centerX + Math.cos(ang) * (isl.radiusX - 58),
      y: isl.centerY + Math.sin(ang) * (isl.radiusY - 52),
      label: 'cliff edge horizon',
    });
  }

  let pick: SpotCand | null = null;
  if (candidates.length > 0) {
    pick = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    const anyNode = world.wildNodes.filter((n) => n.islandId === v.islandId && n.amount > 0);
    if (anyNode.length > 0 && Math.random() < 0.7) {
      const n = anyNode[Math.floor(Math.random() * anyNode.length)];
      pick = { concept: n.kind, x: n.x, y: n.y, label: n.kind.replace('_', ' ') };
    } else {
      const ang = Math.random() * Math.PI * 2;
      const r = 0.35 + Math.random() * 0.48;
      pick = {
        concept: 'horizon',
        x: isl.centerX + Math.cos(ang) * (isl.radiusX - 45) * r,
        y: isl.centerY + Math.sin(ang) * (isl.radiusY - 40) * r,
        label: 'uncharted meadow clearing',
      };
    }
  }

  v.cognition.focusObject = pick.concept;
  v.activeTask = 'explore';
  v.state = 'exploring';
  v.targetX = pick.x + (Math.random() * 24 - 12);
  v.targetY = pick.y + (Math.random() * 20 - 10);
  v.autonomyReason =
    v.cognition.stage === 'awakening'
      ? `Wandering like a child toward ${pick.label} in curiosity.`
      : `Inspecting ${pick.label} to learn how the world works.`;
}

function learnConcept(
  world: WorldState,
  v: VillagerEntity,
  concept: string,
  particles: Particle[],
  sharedFrom?: string,
) {
  const prevStage = v.cognition.stage;
  const isNew = !v.cognition.observedConcepts.includes(concept);
  if (isNew) {
    v.cognition.observedConcepts.push(concept);
  }
  const gain = isNew ? (sharedFrom ? 9 : 15) : 3.5;
  v.cognition.awareness = Math.min(100, v.cognition.awareness + gain * (0.85 + v.curiosity * 0.4));
  v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);

  const info = CONCEPT_REACTION_LINES[concept];
  if (info && isNew) {
    v.thoughtBubble = sharedFrom ? `Learned from ${sharedFrom}!` : info.bubble;
    v.thoughtTimer = 4.2;
    v.currentDialogue = info.dialogue;
    recordNpcMemory(v, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: 'discovery',
      summary: sharedFrom ? `Learned about ${concept.replace('_', ' ')} from ${sharedFrom}.` : info.memory,
      actorIds: [],
      importance: 7,
      sentiment: 'positive',
    });
  } else {
    v.thoughtBubble = 'Hmm... interesting!';
    v.thoughtTimer = 2.6;
  }

  const domainMap: Record<string, import('./types').KnowledgeDomainId> = {
    berry_bush: 'foraging',
    branch_pile: 'woodcraft',
    tree: 'woodcraft',
    flint_pile: 'toolmaking',
    stone_boulder: 'stonecraft',
    copper_vein: 'stonecraft',
    iron_vein: 'toolmaking',
    embers: 'firecraft',
    volcano: 'firecraft',
    spring: 'healing',
    wildlife: 'foraging',
    horizon: 'sailing',
    glacier: 'sailing',
    ruin: 'social_customs',
  };
  const domainId = domainMap[concept] ?? 'foraging';
  advanceKnowledge(v, domainId, isNew ? (sharedFrom ? 5.5 : 8.5) : 1.6);

  grantKnowledge(world, isNew ? 3.5 : 0.8, particles, v);
  spawnParticle(particles, {
    kind: 'sparkle',
    x: v.x,
    y: v.y - 12,
    vx: 0,
    vy: -12,
    maxLife: 1.0,
    size: 2.1,
    alpha: 0.95,
    phase: 0,
    color: '#A8D8EA',
  });

  if (prevStage !== v.cognition.stage) {
    if (v.cognition.stage === 'experimenting') {
      addChronicle(
        world,
        `${v.name.split(' ')[0]}'s mind awakened to toolmaking and shelter—ready to test sparks and branches!`,
        'tech',
      );
    } else if (v.cognition.stage === 'reasoning') {
      addChronicle(
        world,
        `${v.name.split(' ')[0]} reached full Reasoning maturity, able to farm, craft, and teach others.`,
        'tech',
      );
    } else if (v.cognition.stage === 'enlightened') {
      addChronicle(world, `${v.name.split(' ')[0]} became an Enlightened thinker of the archipelago!`, 'tech');
    }
  }
}

function decideVillagerBehavior(world: WorldState, v: VillagerEntity) {
  if (
    world.activeConstruction &&
    world.activeConstruction.builderId === v.id &&
    !world.activeConstruction.pausedForMaterials &&
    v.hunger >= 24 &&
    v.warmth >= 20
  ) {
    return;
  }

  const decision = evaluateVillagerDecision(world, v);
  v.decisionTrace = decision.trace;

  if (decision.selectedAction === 'eat_comfort' && world.comforts[v.favoriteComfort] >= 1) {
    world.comforts[v.favoriteComfort] -= 1;
    v.hunger = Math.min(100, v.hunger + 44);
    v.hp = Math.min(v.maxHp, v.hp + 10);
    v.mood = Math.min(100, v.mood + 9);
    v.state = 'eating';
    v.autonomyReason = decision.autonomyReason;
    v.thoughtBubble = `Warm ${v.favoriteComfort}!`;
    v.thoughtTimer = 3;
    advanceKnowledge(v, 'cooking', 1.2);
    recordNpcMemory(v, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: 'survival',
      summary: `Enjoyed ${COMFORT_LABELS[v.favoriteComfort].toLowerCase()} beside the hearth.`,
      actorIds: [],
      importance: 4,
      sentiment: 'positive',
    });
    return;
  }

  if (decision.selectedAction === 'eat_stockpile') {
    const foodRes = consumeFoodUnits(world, v.homeIslandId ?? v.islandId, 1);
    if (foodRes.ok) {
      v.hunger = Math.min(100, v.hunger + foodRes.hungerGain);
      v.mood = Math.max(5, Math.min(100, v.mood + foodRes.moodBonus));
      v.hp = Math.min(v.maxHp, v.hp + 4);
      v.state = 'eating';
      v.autonomyReason = decision.autonomyReason;
      return;
    }
  }

  v.state = decision.activityState;
  v.activeTask = decision.task;
  v.targetX = decision.targetX;
  v.targetY = decision.targetY;
  v.autonomyReason = decision.autonomyReason;
  if (decision.focusConcept) {
    v.cognition.focusObject = decision.focusConcept;
  }
}

function tickBoats(world: WorldState, dt: number, particles: Particle[], emitVisualParticles: boolean) {
  const weather = world.environment.weather;
  for (let bi = world.boats.length - 1; bi >= 0; bi--) {
    const boat = world.boats[bi];
    const homeDef = ISLAND_DEFS[boat.homeIslandId];

    // Storms lightly batter open-sea boats
    if (boat.state === 'sailing' && (weather === 'rain' || weather === 'mist')) {
      boat.hp = Math.max(0, boat.hp - dt * 1.4);
      if (boat.hp <= 0) {
        addChronicle(world, `${boat.name} was dashed against sky-reefs in heavy mist!`, 'ruin');
        for (const pid of [...boat.passengerIds]) {
          const pv = world.villagers.find((v) => v.id === pid);
          if (pv) {
            pv.voyageBoatId = null;
            killVillager(world, pv.id, 'shipwreck', particles);
          }
        }
        world.boats.splice(bi, 1);
        continue;
      }
    } else if (boat.state === 'docked') {
      boat.hp = Math.min(boat.maxHp, boat.hp + dt * 4);
    }

    boat.tripTimer -= dt;
    const dx = boat.targetX - boat.x;
    const dy = boat.targetY - boat.y;
    const dist = Math.hypot(dx, dy);

    if (boat.kind === 'migrant_skiff') {
      if (tickMigrantBoatLifecycle(world, boat, dt, world.boats, bi)) {
        continue;
      }
      if (boat.state === 'docked') continue;
    }

    if (dist > 6) {
      const boatSpeedMult = boat.cultureId === 'mist_mariner' ? 1 : getTechModifiers(world.unlockedTechIds).boatSpeedMult;
      const spd =
        (boat.kind === 'fishing_skiff'
          ? 24
          : boat.kind === 'migrant_skiff'
            ? 28
            : boat.kind === 'cargo_merchant'
              ? 32
              : 36) * boatSpeedMult;
      boat.x += (dx / dist) * spd * dt;
      boat.y += (dy / dist) * spd * dt;
      boat.yaw = Math.atan2(-(boat.y - (boat.y - dy)), dx);

      // Move passengers cleanly with ship deck
      for (const pid of boat.passengerIds) {
        const pv = world.villagers.find((v) => v.id === pid);
        if (pv) {
          pv.x = boat.x;
          pv.y = boat.y;
          pv.state = 'sailing';
        }
      }

      if (emitVisualParticles && Math.random() < dt * 1.8) {
        spawnParticle(particles, {
          kind: 'splash',
          x: boat.x,
          y: boat.y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          maxLife: 0.7,
          size: 1.8,
          alpha: 0.5,
          phase: 0,
          color: '#E0F2FE',
        });
      }
    } else if (boat.tripTimer <= 0) {
      if (boat.kind === 'fishing_skiff') {
        if (boat.cultureId !== 'mist_mariner') {
          addVillageResource(world, boat.homeIslandId, 'fish', 1.4);
          grantKnowledge(world, 0.4, particles);
        }
        const ang = Math.random() * Math.PI * 2;
        boat.targetX = homeDef.dockSpot.seaX + Math.cos(ang) * 75;
        boat.targetY = homeDef.dockSpot.seaY + Math.sin(ang) * 55;
        boat.tripTimer = 8 + Math.random() * 6;
      } else if (boat.kind === 'cargo_merchant') {
        // Shuttle between discovered docks
        const targetIslands = ISLAND_ORDER.filter(
          (id) =>
            id !== boat.targetIslandId &&
            world.islands[id].discovered &&
            world.islands[id].dockBuilt &&
            (id !== 'mistatoll' || world.diplomacy.mist_mariner.status !== 'war'),
        );
        const nextIsle = targetIslands[Math.floor(Math.random() * targetIslands.length)] ?? boat.homeIslandId;
        if (boat.targetIslandId === 'coppercrag' && world.islands.coppercrag.discovered) {
          addVillageResource(world, boat.homeIslandId, 'copper', 2);
          addVillageResource(world, boat.homeIslandId, 'iron', 1);
        } else if (boat.targetIslandId === 'mistatoll' && world.diplomacy.mist_mariner.status !== 'war') {
          addVillageResource(world, boat.homeIslandId, 'fish', 2);
          addVillageResource(world, boat.homeIslandId, 'hearthlight', 2);
          world.diplomacy.mist_mariner.trust = Math.min(100, world.diplomacy.mist_mariner.trust + 3);
        } else if (boat.targetIslandId === 'sunterrace') {
          addVillageResource(world, boat.homeIslandId, 'grain', 2);
          addVillageResource(world, boat.homeIslandId, 'wool', 1);
        } else {
          addVillageResource(world, boat.homeIslandId, 'timber', 1.5);
        }
        syncCombinedFood(world);
        boat.targetIslandId = nextIsle;
        boat.targetX = ISLAND_DEFS[nextIsle].dockSpot.seaX;
        boat.targetY = ISLAND_DEFS[nextIsle].dockSpot.seaY;
        boat.state = 'sailing';
        boat.tripTimer = 10;
      } else if (boat.kind === 'war_galley') {
        if (boat.cultureId === 'mist_mariner' && world.diplomacy.mist_mariner.status === 'war') {
          if (boat.state === 'raiding') {
            // Land raiders on Cradle Isle!
            const targetDef = ISLAND_DEFS[boat.targetIslandId];
            for (let r = 0; r < 2; r++) {
              world.raiders.push({
                id: `raid_${Date.now()}_${r}`,
                name: `Mist Raider ${r + 1}`,
                bioDescription: 'Hostile Mist-Mariner sea raider.',
                cultureId: 'mist_mariner',
                islandId: boat.targetIslandId,
                homeIslandId: 'mistatoll',
                isStranger: true,
                cloakColor: '#376C78',
                hairColor: '#2E2622',
                skinTone: '#D19A74',
                hairStyle: r % 4,
                lifeStage: 'adult',
                ageDays: 18,
                isChief: false,
                traits: ['brave_hunter'],
                partnerId: null,
                parentIds: null,
                childrenIds: [],
                homeBuildingId: null,
                hp: 65,
                maxHp: 65,
                warmth: 90,
                mood: 60,
                energy: 95,
                hunger: 90,
                affectionXp: 0,
                affectionLevel: 0,
                gearTier: 2,
                weaponType: 'bronze_blade',
                curiosity: 0.2,
                bravery: 0.9,
                voyageBoatId: null,
                killCount: 0,
                favoriteComfort: 'tea',
                activeWish: 'chat',
                wishFulfilledToday: false,
                currentDialogue: 'Keep your ships clear of our mist!',
                lastMemory: 'Landed with the Mist Galley.',
                relationships: {},
                hangOutTargetId: null,
                socialCooldown: 0,
                suggestedTask: null,
                activeTask: 'guard',
                state: 'fighting',
                autonomyReason: 'Raiding rival stores!',
                thoughtBubble: 'Raid!',
                thoughtTimer: 3,
                x: targetDef.dockSpot.x - 15,
                y: targetDef.dockSpot.y + r * 14,
                targetX: targetDef.centerX,
                targetY: targetDef.centerY,
                facing: -1,
                animPhase: 0,
                bounceScale: 1,
                decisionCooldown: 1,
                birthCooldownDays: 99,
                attackCooldown: 0,
                stats: rollUnitStats(['brave_hunter'], true),
                skills: rollStarterSkills('adult'),
                skillXp: {},
                rtsOrder: null,
                drafted: false,
                cognition: {
                  stage: 'reasoning',
                  awareness: 65,
                  observedConcepts: ['berry_bush', 'wild_fauna', 'sky_rim'],
                  socialCount: 2,
                  focusObject: 'Mist Galley',
                },
              });
            }
            addChronicle(world, `A Mist-Mariner War Galley landed raiders on ${targetDef.name}!`, 'war');
            boat.state = 'returning';
            boat.targetIslandId = 'mistatoll';
            boat.targetX = ISLAND_DEFS.mistatoll.dockSpot.seaX;
            boat.targetY = ISLAND_DEFS.mistatoll.dockSpot.seaY;
            boat.tripTimer = 18;
          } else {
            boat.state = 'docked';
            boat.tripTimer = 20;
          }
        } else {
          // Player exploration / patrol galley
          if (boat.passengerIds.length > 0 && !world.islands[boat.targetIslandId].discovered) {
            const exp = world.villagers.find((v) => v.id === boat.passengerIds[0]);
            discoverIsland(world, boat.targetIslandId, exp?.name.split(' ')[0]);
            for (const pid of [...boat.passengerIds]) {
              const pv = world.villagers.find((v) => v.id === pid);
              if (pv) {
                pv.voyageBoatId = null;
                pv.islandId = boat.targetIslandId;
                pv.x = ISLAND_DEFS[boat.targetIslandId].dockSpot.x;
                pv.y = ISLAND_DEFS[boat.targetIslandId].dockSpot.y;
                pv.state = 'working';
              }
            }
            boat.passengerIds = [];
          }
          boat.state = 'docked';
          boat.targetX = homeDef.dockSpot.seaX;
          boat.targetY = homeDef.dockSpot.seaY;
          boat.tripTimer = 15;
        }
      }
    }
  }
}

function tickFarmingAndPastures(world: WorldState, dt: number) {
  const season = world.environment.season;
  const isWinter = season === 'winter' || world.environment.weather === 'snow';
  const isRain = world.environment.weather === 'rain';

  for (const b of world.buildings) {
    if (!b.unlocked || b.type !== 'farm_plot' || !b.cropState) continue;
    const cs = b.cropState;
    const seasonMult =
      isWinter
        ? cs.cropType === 'turnip'
          ? 0.45
          : 0.1
        : season === 'summer' || season === 'spring'
          ? 1.15
          : 1.0;
    const waterMult = (cs.irrigated ? 1.32 : 1.0) * (isRain ? 1.25 : 1.0);
    const workerNear = world.villagers.some(
      (v) => v.activeTask === 'farm' && Math.hypot(v.x - b.x, v.y - b.y) < 35,
    );
    const rate = 0.015 * cs.fertility * seasonMult * waterMult * (workerNear ? 1.55 : 0.65) * (1 + (b.level - 1) * 0.25);
    cs.growth = Math.min(1, cs.growth + rate * dt);

    if (cs.growth >= 1 && workerNear) {
      cs.growth = 0.12;
      const qty = 3 + b.level;
      if (cs.cropType === 'turnip' || cs.cropType === 'wheat') {
        addVillageResource(world, b.islandId, 'grain', qty);
      } else if (cs.cropType === 'flax') {
        addVillageResource(world, b.islandId, 'wool', Math.ceil(qty * 0.7));
      } else if (cs.cropType === 'herbs') {
        addVillageResource(world, b.islandId, 'herbs', qty);
        world.comforts.tea = Math.min(25, world.comforts.tea + 1);
      } else if (cs.cropType === 'orchard') {
        addVillageResource(world, b.islandId, 'berries', qty);
        world.comforts.honey = Math.min(25, world.comforts.honey + 1);
      }
      syncCombinedFood(world);
    }
  }

  for (const st of world.livestock) {
    if (st.pauseTimer > 0) {
      st.pauseTimer -= dt;
    } else {
      const pasture = world.buildings.find((b) => b.id === st.pastureId);
      const cx = pasture?.x ?? st.x;
      const cy = pasture?.y ?? st.y;
      const d = Math.hypot(st.targetX - st.x, st.targetY - st.y);
      if (d < 3) {
        st.pauseTimer = 2 + Math.random() * 4;
        st.targetX = cx + (Math.random() * 26 - 13);
        st.targetY = cy + (Math.random() * 18 - 9);
      } else {
        const step = Math.min(d, 10 * dt);
        const nx = st.x + ((st.targetX - st.x) / d) * step;
        const ny = st.y + ((st.targetY - st.y) / d) * step;
        st.facing = st.targetX >= st.x ? 1 : -1;
        if (classifyMainWorldTerrain(world, nx, ny) !== 'deep_water') {
          st.x = nx;
          st.y = ny;
        } else {
          st.targetX = cx;
          st.targetY = cy;
          st.pauseTimer = 1;
        }
      }
    }

    st.yieldTimer -= dt;
    if (st.yieldTimer <= 0) {
      st.yieldTimer = 22 + Math.random() * 10;
      if (st.kind === 'sheep') {
        addVillageResource(world, st.islandId, 'wool', 1.4);
        addVillageResource(world, st.islandId, 'meat', 0.4);
      } else if (st.kind === 'pig') {
        addVillageResource(world, st.islandId, 'meat', 1.5);
      } else {
        addVillageResource(world, st.islandId, 'meat', 1.0);
      }
      syncCombinedFood(world);
    }
  }
}

function tickWildHerdsAndHunting(world: WorldState, dt: number, particles: Particle[]) {
  for (let i = world.wildHerds.length - 1; i >= 0; i--) {
    const h = world.wildHerds[i];
    if (h.hp <= 0) {
      world.wildHerds.splice(i, 1);
      continue;
    }

    // Check hunter attacks near this animal
    const attacker = world.villagers.find(
      (v) =>
        (v.activeTask === 'hunt' || v.state === 'hunting') &&
        v.islandId === h.islandId &&
        Math.hypot(v.x - h.x, v.y - h.y) < (v.weaponType === 'bow' ? 42 : 20),
    );
    if (attacker && attacker.attackCooldown <= 0) {
      const baseDmg =
        attacker.weaponType === 'iron_blade'
          ? 28
          : attacker.weaponType === 'bronze_blade'
            ? 22
            : attacker.weaponType === 'bow'
              ? 18
              : attacker.weaponType === 'flint_spear'
                ? 14
                : 7;
      const atkStats = getTraitStats(attacker);
      const techMods = getTechModifiers(world.unlockedTechIds);
      const skillBonus =
        attacker.weaponType === 'bow'
          ? getSkillLevel(attacker, 'archery') * 1.8
          : getSkillLevel(attacker, 'blade_mastery') * 1.6;
      const dmg = Math.round((baseDmg + skillBonus + (attacker.stats?.strength ?? 8) * 0.4) * atkStats.attackPowerMult * techMods.attackMult);
      if (attacker.weaponType === 'bow') {
        spawnProjectile(world, 'arrow', attacker.islandId, attacker.x, attacker.y, h.islandId, h.x, h.y);
        gainSkillXp(world, attacker, 'archery', 2.2);
      } else {
        gainSkillXp(world, attacker, 'blade_mastery', 2.2);
      }
      h.hp -= dmg;
      attacker.attackCooldown = 1.35;
      grantKnowledge(world, 0.8, particles);

      if (h.hp <= 0) {
        const meatGain = h.kind === 'boar' ? 7 : h.kind === 'deer' ? 5 : 2;
        const hideGain = h.kind === 'boar' ? 3 : h.kind === 'deer' ? 2 : 1;
        const creditIsle = attacker.homeIslandId ?? attacker.islandId;
        addVillageResource(world, creditIsle, 'meat', meatGain);
        addVillageResource(world, creditIsle, 'hides', hideGain);
        syncCombinedFood(world);
        attacker.killCount += 1;
        attacker.thoughtBubble = `Hunted ${h.kind}!`;
        attacker.thoughtTimer = 3;
        world.wildHerds.splice(i, 1);
        continue;
      }

      if (h.kind === 'boar') {
        h.aggroTargetId = attacker.id;
      } else {
        const dx = h.x - attacker.x;
        const dy = h.y - attacker.y;
        const d = Math.hypot(dx, dy) || 1;
        h.targetX = h.x + (dx / d) * 65;
        h.targetY = h.y + (dy / d) * 45;
        h.pauseTimer = 0;
      }
    }

    if (!h.stuckState) {
      h.stuckState = { lastX: h.x, lastY: h.y, timer: 0, detourSign: 1 };
    }
    ensureWildAnimalState(h);

    // Aggro boar counter-attack!
    if (h.kind === 'boar' && h.aggroTargetId) {
      const preyV = world.villagers.find((v) => v.id === h.aggroTargetId && v.islandId === h.islandId);
      if (!preyV) {
        h.aggroTargetId = null;
        h.behaviorState = 'wandering';
      } else {
        h.behaviorState = 'fighting';
        const d = Math.hypot(preyV.x - h.x, preyV.y - h.y);
        if (d < 16) {
          if (Math.random() < dt * 0.9) {
            const died = applyCombatStrike(world, null, preyV, 14, 0.36, 'boar', particles);
            if (!died && !preyV.thoughtBubble) {
              preyV.thoughtBubble = 'Boar gored me!';
              preyV.thoughtTimer = 2.6;
            }
            if (died) {
              h.aggroTargetId = null;
              h.behaviorState = 'wandering';
            }
          }
        } else if (d < 95) {
          const step = steerEntity(world, h.islandId, h.x, h.y, preyV.x, preyV.y, 24 * dt, false, h.stuckState, dt, h.id);
          if (classifyMainWorldTerrain(world, step.x, step.y) !== 'deep_water') {
            h.x = step.x;
            h.y = step.y;
            h.facing = step.facing;
          }
          if (step.wasStuckReset) {
            h.aggroTargetId = null;
            h.behaviorState = 'wandering';
          }
          continue;
        } else {
          h.aggroTargetId = null;
          h.behaviorState = 'wandering';
        }
      }
    }

    // Autonomous Animal Needs (hunger, thirst, shallow-shore drinking, grazing, resting, reactivity, reproduction)
    stepWildAnimalBehavior(world, h, dt, (w, islId, x, y, tx, ty, stepDist, stuck, dtSec, id) =>
      steerEntity(w, islId, x, y, tx, ty, stepDist, false, stuck, dtSec, id),
    );
  }
}

function spawnProjectile(
  world: WorldState,
  kind: ProjectileFx['kind'],
  fromIsland: IslandId,
  fromX: number,
  fromY: number,
  toIsland: IslandId,
  toX: number,
  toY: number,
) {
  if (world.projectiles.length >= 24) world.projectiles.shift();
  world.projectiles.push({
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    fromX,
    fromY,
    fromElev: ISLAND_DEFS[fromIsland].elevationY + 2.5,
    toX,
    toY,
    toElev: ISLAND_DEFS[toIsland].elevationY + 1.4,
    progress: 0,
    duration: 0.45,
  });
}

function tickProjectiles(world: WorldState, dt: number) {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const p = world.projectiles[i];
    p.progress += dt / Math.max(0.15, p.duration);
    if (p.progress >= 1) {
      world.projectiles.splice(i, 1);
    }
  }
}

function tickCableways(world: WorldState, dt: number, particles: Particle[]) {
  for (const cb of world.cableways) {
    if (!cb.built) continue;
    cb.gondolaT += cb.gondolaDir * dt * 0.14;
    if (cb.gondolaT >= 1) {
      cb.gondolaT = 1;
      cb.gondolaDir = -1;
      // Disembark passengers at island 2
      for (const pid of [...cb.passengerIds]) {
        const pv = world.villagers.find((v) => v.id === pid);
        if (pv) {
          pv.transitCableId = null;
          pv.islandId = cb.toIsland;
          pv.x = cb.x2;
          pv.y = cb.y2;
          pv.targetX = ISLAND_DEFS[cb.toIsland].centerX;
          pv.targetY = ISLAND_DEFS[cb.toIsland].centerY;
          pv.state = 'exploring';
          discoverIsland(world, cb.toIsland, pv.name.split(' ')[0]);
        }
      }
      cb.passengerIds = [];
    } else if (cb.gondolaT <= 0) {
      cb.gondolaT = 0;
      cb.gondolaDir = 1;
      for (const pid of [...cb.passengerIds]) {
        const pv = world.villagers.find((v) => v.id === pid);
        if (pv) {
          pv.transitCableId = null;
          pv.islandId = cb.fromIsland;
          pv.x = cb.x1;
          pv.y = cb.y1;
          pv.targetX = ISLAND_DEFS[cb.fromIsland].centerX;
          pv.targetY = ISLAND_DEFS[cb.fromIsland].centerY;
          pv.state = 'exploring';
          discoverIsland(world, cb.fromIsland, pv.name.split(' ')[0]);
        }
      }
      cb.passengerIds = [];
    }

    // Move onboard riders along cable line
    const gx = cb.x1 + (cb.x2 - cb.x1) * cb.gondolaT;
    const gy = cb.y1 + (cb.y2 - cb.y1) * cb.gondolaT;
    for (const pid of cb.passengerIds) {
      const pv = world.villagers.find((v) => v.id === pid);
      if (pv) {
        pv.x = gx;
        pv.y = gy;
        pv.state = 'gondola';
      }
    }

    // Embark nearby waiting villagers when gondola arrives at station 1 or 2
    if (cb.passengerIds.length < 2 && (cb.gondolaT <= 0.06 || cb.gondolaT >= 0.94)) {
      const atFirst = cb.gondolaT <= 0.06;
      const stationIsland = atFirst ? cb.fromIsland : cb.toIsland;
      const destIsland = atFirst ? cb.toIsland : cb.fromIsland;
      const sx = atFirst ? cb.x1 : cb.x2;
      const sy = atFirst ? cb.y1 : cb.y2;

      const rider = world.villagers.find(
        (v) =>
          v.islandId === stationIsland &&
          !v.voyageBoatId &&
          !v.transitGliderId &&
          !v.transitCableId &&
          canVillagerWork(world, v) &&
          Math.hypot(v.x - sx, v.y - sy) < 62 &&
          (v.activeTask === 'explore' || !world.islands[destIsland].discovered || Math.random() < 0.35),
      );
      if (rider) {
        cb.passengerIds.push(rider.id);
        rider.transitCableId = cb.id;
        rider.state = 'gondola';
        rider.thoughtBubble = `Gondola to ${ISLAND_DEFS[destIsland].name.split(' ')[0]}!`;
        rider.thoughtTimer = 3.2;
        grantKnowledge(world, 0.8, particles);
      }
    }
  }
}

function tickGliders(world: WorldState, dt: number, particles: Particle[], emitVisualParticles: boolean) {
  for (let i = world.gliders.length - 1; i >= 0; i--) {
    const g = world.gliders[i];
    g.progress += dt * 0.16;
    const t = Math.min(1, g.progress);
    g.x = g.startX + (g.endX - g.startX) * t;
    g.y = g.startY + (g.endY - g.startY) * t;
    g.altitudeBoost = Math.sin(t * Math.PI) * 9.5;
    g.yaw = Math.atan2(-(g.endY - g.startY), g.endX - g.startX);

    const pilot = world.villagers.find((v) => v.id === g.villagerId);
    if (pilot) {
      pilot.x = g.x;
      pilot.y = g.y;
      pilot.state = 'gliding';
    }

    if (emitVisualParticles && Math.random() < dt * 2.5) {
      spawnParticle(particles, {
        kind: 'leaf',
        x: g.x,
        y: g.y,
        vx: (Math.random() - 0.5) * 6,
        vy: 6,
        maxLife: 0.7,
        size: 1.6,
        alpha: 0.5,
        phase: 0,
        color: '#E0F2FE',
      });
    }

    if (t >= 1) {
      if (pilot) {
        pilot.transitGliderId = null;
        pilot.islandId = g.toIsland;
        pilot.x = g.endX;
        pilot.y = g.endY;
        pilot.targetX = ISLAND_DEFS[g.toIsland].centerX;
        pilot.targetY = ISLAND_DEFS[g.toIsland].centerY;
        pilot.state = 'exploring';
        pilot.thoughtBubble = 'Touched down!';
        pilot.thoughtTimer = 3.2;
        discoverIsland(world, g.toIsland, pilot.name.split(' ')[0]);
        grantKnowledge(world, 3.0, particles);
      }
      world.gliders.splice(i, 1);
    }
  }

  // Launch villagers near built glider pads across sky gaps
  if (world.gliders.length < 3 && getTechUnlocked(world, 'wind_gliders')) {
    for (const pad of world.buildings) {
      if (!pad.unlocked || pad.type !== 'glider_pad') continue;
      const launcher = world.villagers.find(
        (v) =>
          v.islandId === pad.islandId &&
          !v.voyageBoatId &&
          !v.transitGliderId &&
          !v.transitCableId &&
          canVillagerWork(world, v) &&
          (v.activeTask === 'explore' || v.curiosity > 0.62) &&
          Math.hypot(v.x - pad.x, v.y - pad.y) < 55,
      );
      if (!launcher) continue;

      const candidates = ISLAND_ORDER.filter((id) => id !== pad.islandId);
      const undisc = candidates.filter((id) => !world.islands[id].discovered);
      const pool = undisc.length > 0 ? undisc : candidates;
      const destId = pool[Math.floor(Math.random() * pool.length)];
      if (!destId) continue;
      const destDef = ISLAND_DEFS[destId];

      const gliderId = `glider_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      world.gliders.push({
        id: gliderId,
        villagerId: launcher.id,
        fromIsland: pad.islandId,
        toIsland: destId,
        startX: pad.x,
        startY: pad.y,
        endX: destDef.centerX + (Math.random() * 80 - 40),
        endY: destDef.centerY + (Math.random() * 60 - 30),
        progress: 0,
        x: pad.x,
        y: pad.y,
        altitudeBoost: 0,
        yaw: Math.atan2(-(destDef.centerY - pad.y), destDef.centerX - pad.x),
        wingColor: CULTURES[launcher.cultureId]?.sailColor ?? '#FAF6EE',
      });
      launcher.transitGliderId = gliderId;
      launcher.state = 'gliding';
      launcher.thoughtBubble = `Gliding to ${destDef.name.split(' ')[0]}!`;
      launcher.thoughtTimer = 3.5;
      addChronicle(
        world,
        `${launcher.name.split(' ')[0]} launched a Wind-Glider from ${ISLAND_DEFS[pad.islandId].name} toward ${destDef.name}!`,
        'voyage',
      );
      break;
    }
  }
}

function tickExploreRuins(world: WorldState, dt: number, particles: Particle[]) {
  for (const ruin of world.exploreRuins) {
    if (ruin.cooldownTimer > 0) {
      ruin.cooldownTimer = Math.max(0, ruin.cooldownTimer - dt);
      continue;
    }

    const explorer = world.villagers.find(
      (v) =>
        v.islandId === ruin.islandId &&
        canVillagerWork(world, v) &&
        Math.hypot(v.x - ruin.x, v.y - ruin.y) < 38,
    );
    if (!explorer) continue;

    ruin.exploredCount += 1;
    ruin.cooldownTimer = 95;
    discoverIsland(world, ruin.islandId, explorer.name.split(' ')[0]);
    learnConcept(world, explorer, 'ruin', particles);
    grantKnowledge(world, 10, particles, explorer);
    const creditIsle = explorer.homeIslandId ?? explorer.islandId;
    addVillageResource(world, creditIsle, 'hearthlight', 8);

    if (ruin.kind === 'sun_obelisk') {
      addVillageResource(world, creditIsle, 'grain', 12);
      world.comforts.honey = Math.min(25, world.comforts.honey + 3);
    } else if (ruin.kind === 'star_observatory') {
      addVillageResource(world, creditIsle, 'herbs', 10);
      addVillageResource(world, creditIsle, 'hearthlight', 6);
    } else if (ruin.kind === 'cedar_totem') {
      addVillageResource(world, creditIsle, 'timber', 14);
      world.comforts.tea = Math.min(25, world.comforts.tea + 3);
    } else if (ruin.kind === 'frost_shrine') {
      addVillageResource(world, creditIsle, 'iron', 8);
      addVillageResource(world, creditIsle, 'copper', 8);
    } else if (ruin.kind === 'ashen_vault') {
      addVillageResource(world, creditIsle, 'iron', 16);
      addVillageResource(world, creditIsle, 'bronze', 10);
    }
    syncCombinedFood(world);

    explorer.thoughtBubble = 'Ancient relic!';
    explorer.thoughtTimer = 4.0;
    advanceKnowledge(explorer, 'sailing', 4.5);
    recordNpcMemory(explorer, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: 'discovery',
      summary: `Explored ${ruin.name} on ${ISLAND_DEFS[ruin.islandId].name}.`,
      actorIds: [],
      importance: 8,
      sentiment: 'positive',
    });
    addChronicle(
      world,
      `${explorer.name.split(' ')[0]} explored ${ruin.name} on ${ISLAND_DEFS[ruin.islandId].name} (${ruin.lootLabel})!`,
      'voyage',
    );

    // Guarded ruin skirmish if enemies are absent
    if (ruin.guardianThreat && world.raiders.filter((r) => r.islandId === ruin.islandId).length === 0) {
      world.raiders.push({
        ...makeNativeClanVillager(
          `ruin_guard_${Date.now()}`,
          'Stone-Sentinel',
          ruin.islandId,
          'ashen_raider',
          '#5C4D4A',
          '#252020',
          '#C29B7B',
          0,
          0,
          'guard',
        ),
        isNativeClan: false,
        isStranger: true,
        x: ruin.x + 22,
        y: ruin.y + 18,
        targetX: explorer.x,
        targetY: explorer.y,
        hp: 75,
        maxHp: 75,
        gearTier: 3,
        weaponType: 'bronze_blade',
        state: 'fighting',
        autonomyReason: `Defending ${ruin.name}.`,
      });
    }
  }
}

function tickDiplomacyAndWar(world: WorldState, dt: number, particles: Particle[]) {
  const mist = world.diplomacy.mist_mariner;
  if (mist.status !== 'unknown') {
    if (mist.trust >= 65) mist.status = 'peaceful';
    else if (mist.trust >= 34) mist.status = 'wary';
    else if (mist.trust >= 16) mist.status = 'tense';
    else mist.status = 'war';

    if (mist.status === 'wary' && Math.random() < dt * 0.012) {
      mist.trust = Math.max(0, mist.trust - 1);
    }

    if (mist.status === 'war') {
      mist.raidTimer -= dt;
      if (mist.raidTimer <= 0 && world.raiders.length < 5 && world.villagers.length > 0) {
        mist.raidTimer = 55;
        const galley = world.boats.find((b) => b.cultureId === 'mist_mariner' && b.kind === 'war_galley');
        const targetIsle: IslandId = world.islands.sunterrace.discovered ? 'sunterrace' : 'cradle';
        if (!galley) {
          world.boats.push({
            id: `boat_mist_war_${Date.now()}`,
            name: 'Mist-Clan Longship',
            kind: 'war_galley',
            cultureId: 'mist_mariner',
            homeIslandId: 'mistatoll',
            targetIslandId: targetIsle,
            x: ISLAND_DEFS.mistatoll.dockSpot.seaX,
            y: ISLAND_DEFS.mistatoll.dockSpot.seaY,
            targetX: ISLAND_DEFS[targetIsle].dockSpot.seaX,
            targetY: ISLAND_DEFS[targetIsle].dockSpot.seaY,
            yaw: Math.PI,
            hp: 200,
            maxHp: 200,
            state: 'raiding',
            cargoText: 'Boarding Crew',
            passengerIds: [],
            tripTimer: 6,
          });
        } else if (galley.state === 'docked') {
          galley.state = 'raiding';
          galley.targetIslandId = targetIsle;
          galley.targetX = ISLAND_DEFS[targetIsle].dockSpot.seaX;
          galley.targetY = ISLAND_DEFS[targetIsle].dockSpot.seaY;
          galley.tripTimer = 6;
        }
      }
    }
  }

  // Watchtower arrow defense & Raider combat (Mist raiders + Ashen Bastion defenders)
  for (let ri = world.raiders.length - 1; ri >= 0; ri--) {
    const r = world.raiders[ri];
    if (r.hp <= 0) {
      world.raiders.splice(ri, 1);
      continue;
    }

    // Watchtower arrow volleys with visual ProjectileFx
    const techMods = getTechModifiers(world.unlockedTechIds);
    for (const tw of world.buildings) {
      if (
        tw.type === 'watchtower' &&
        tw.unlocked &&
        tw.islandId === r.islandId &&
        tw.cultureId !== 'ashen_raider' &&
        Math.hypot(tw.x - r.x, tw.y - r.y) < 135
      ) {
        r.hp -= dt * (6.5 + tw.level * 3) * techMods.attackMult;
        if (Math.random() < dt * 1.1) {
          spawnProjectile(world, 'arrow', tw.islandId, tw.x, tw.y, r.islandId, r.x, r.y);
        }
      }
    }

    // Ashen Bastion tower shoots intruders on embervault
    if (r.islandId === 'embervault') {
      const intruder = world.villagers.find((v) => v.islandId === 'embervault');
      const bastTower = world.buildings.find((b) => b.id === 'ember_watchtower' && b.unlocked);
      if (intruder && bastTower && Math.random() < dt * 0.55 && Math.hypot(bastTower.x - intruder.x, bastTower.y - intruder.y) < 170) {
        spawnProjectile(world, 'ember_bolt', 'embervault', bastTower.x, bastTower.y, 'embervault', intruder.x, intruder.y);
        applyCombatStrike(world, null, intruder, 8, 0.25, 'combat', particles);
      }
    }

    // Target nearest defender or intruder on same island, or march toward Cradle in shared_siege!
    const targetV = world.villagers
      .filter((v) => v.islandId === r.islandId && v.lifeStage !== 'infant')
      .sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0];

    if (!r.stuckState) {
      r.stuckState = { lastX: r.x, lastY: r.y, timer: 0, detourSign: 1 };
    }

    if (targetV) {
      const dist = Math.hypot(targetV.x - r.x, targetV.y - r.y);
      const attackRange = targetV.weaponType === 'bow' ? 28 : 15;
      if (dist > 14) {
        const step = steerEntity(world, r.islandId, r.x, r.y, targetV.x, targetV.y, 23 * dt, false, r.stuckState, dt, r.id);
        r.x = step.x;
        r.y = step.y;
        r.islandId = step.islandId;
        r.facing = step.facing;
      }
      if (dist <= 15 && r.attackCooldown <= 0) {
        r.attackCooldown = 1.6;
        const rDmg = 11 + (r.stats?.strength ?? 8) * 0.45;
        applyCombatStrike(world, r, targetV, rDmg, 0.36, 'combat', particles);
      }
      if (dist <= attackRange && targetV.hp > 0 && targetV.attackCooldown <= 0) {
        targetV.attackCooldown = 1.3;
        if (targetV.weaponType === 'bow') {
          spawnProjectile(world, 'arrow', targetV.islandId, targetV.x, targetV.y, r.islandId, r.x, r.y);
          gainSkillXp(world, targetV, 'archery', 2.4);
        } else {
          gainSkillXp(world, targetV, 'blade_mastery', 2.4);
        }
        gainSkillXp(world, targetV, 'tactics', 1.2);
        const baseVDmg =
          targetV.weaponType === 'iron_blade'
            ? 26
            : targetV.weaponType === 'bronze_blade'
              ? 20
              : targetV.weaponType === 'bow'
                ? 16
                : targetV.weaponType === 'flint_spear'
                  ? 13
                  : 7;
        const tStats = getTraitStats(targetV);
        const skillDmg =
          targetV.weaponType === 'bow'
            ? getSkillLevel(targetV, 'archery') * 1.8
            : getSkillLevel(targetV, 'blade_mastery') * 1.8;
        const finalDmg = (baseVDmg + skillDmg + (targetV.stats?.strength ?? 8) * 0.4) * tStats.attackPowerMult * techMods.attackMult;
        applyCombatStrike(world, targetV, r, finalDmg, 0.28, 'combat', particles);
        if (r.hp <= 0) {
          targetV.killCount += 1;
        }
      }
    } else if (world.gameMode === 'shared_siege' && r.islandId !== 'cradle') {
      const cradle = ISLAND_DEFS.cradle;
      const step = steerEntity(world, r.islandId, r.x, r.y, cradle.centerX, cradle.centerY, 24 * dt, false, r.stuckState, dt, r.id);
      r.x = step.x;
      r.y = step.y;
      r.islandId = step.islandId;
      r.facing = step.facing;
    } else if (r.islandId === 'embervault') {
      const d = Math.hypot(r.targetX - r.x, r.targetY - r.y);
      if (d < 10) {
        const ev = ISLAND_DEFS.embervault;
        r.targetX = ev.centerX + (Math.random() * 240 - 120);
        r.targetY = ev.centerY + (Math.random() * 180 - 90);
      } else {
        const step = steerEntity(world, 'embervault', r.x, r.y, r.targetX, r.targetY, 18 * dt, false, r.stuckState, dt, r.id);
        r.x = step.x;
        r.y = step.y;
        r.facing = step.facing;
        if (step.wasStuckReset || step.hitWaterEdge) {
          const ev = ISLAND_DEFS.embervault;
          r.targetX = ev.centerX + (Math.random() * 200 - 100);
          r.targetY = ev.centerY + (Math.random() * 160 - 80);
        }
      }
    }

    if (r.attackCooldown > 0) r.attackCooldown -= dt;

    if (r.hp <= 0) {
      const homeSpoilsIsle = world.localHomeIslandId ?? 'cradle';
      if (world.gameMode === 'shared_siege') {
        world.siege.totalKills += 1;
        addVillageResource(world, 'cradle', 'timber', 2);
        addVillageResource(world, 'cradle', 'stone', 1);
        addVillageResource(world, 'cradle', 'iron', 1);
        addVillageResource(world, 'cradle', 'hearthlight', 2);
        addChronicle(world, `Defenders felled ${r.name} (+Siege spoils)!`, 'war');
      } else if (r.islandId === 'embervault') {
        addVillageResource(world, homeSpoilsIsle, 'iron', 12);
        addVillageResource(world, homeSpoilsIsle, 'hearthlight', 6);
        addChronicle(world, `Vanguard defeated ${r.name} at Ashen Bastion (+12 Iron spoils)!`, 'war');
      } else {
        addChronicle(world, `Island defenders repelled ${r.name} on ${ISLAND_DEFS[r.islandId].name}.`, 'war');
      }
      world.raiders.splice(ri, 1);
    }
  }
}

function evaluateVillageTrajectory(world: WorldState) {
  if (world.villagers.length === 0) {
    world.prosperityScore = 0;
    world.villageTrajectory = 'ruined';
    world.trajectoryReasons = ['All inhabitants were lost.'];
    return;
  }

  const avgMood = world.villagers.reduce((s, v) => s + v.mood, 0) / world.villagers.length;
  const avgHp = world.villagers.reduce((s, v) => s + v.hp, 0) / world.villagers.length;
  const avgHunger = world.villagers.reduce((s, v) => s + v.hunger, 0) / world.villagers.length;
  const avgWarmth = world.villagers.reduce((s, v) => s + v.warmth, 0) / world.villagers.length;

  let score = Math.round(avgMood * 0.28 + avgHp * 0.24 + avgHunger * 0.22 + avgWarmth * 0.16 + Math.min(10, world.unlockedTechIds.length * 0.7));
  const reasons: string[] = [];

  const homeId = world.localHomeIslandId ?? 'cradle';
  const homePop = Math.max(1, world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === homeId).length);
  if (getVillageRes(world, homeId).food < homePop * 2) {
    score -= 14;
    reasons.push('Food stores running critically low.');
  }
  if (world.environment.season === 'winter' && !hasBuildingType(world, 'bonfire')) {
    score -= 18;
    reasons.push('Winter frost threatens unheated villagers!');
  }
  if (world.diplomacy.mist_mariner.status === 'war') {
    score -= 10;
    reasons.push('At war with the Mist Mariners.');
  }
  if (reasons.length === 0) {
    reasons.push(
      world.unlockedTechIds.length >= 6
        ? 'Thriving archipelago trade, farms & hearths.'
        : 'Founders finding their footing beside the embers.',
    );
  }

  world.prosperityScore = Math.max(0, Math.min(100, score));
  world.trajectoryReasons = reasons;
  world.villageTrajectory =
    world.prosperityScore >= 72
      ? 'flourishing'
      : world.prosperityScore >= 48
        ? 'steady'
        : world.prosperityScore >= 26
          ? 'strained'
          : 'ruin_risk';
}

function evaluateEra(world: WorldState) {
  const techs = world.unlockedTechIds.length;
  const discoveredCount = Object.values(world.islands).filter((i) => i.discovered).length;
  let era: VillageEra = 1;
  if (techs >= 3 && hasBuildingType(world, 'cottage')) era = 2;
  if (techs >= 7 && (discoveredCount >= 3 || hasBuildingType(world, 'dock'))) era = 3;
  if (techs >= 12 && (hasBuildingType(world, 'barracks') || hasBuildingType(world, 'smeltery'))) era = 4;

  if (era > world.era) {
    world.era = era;
    addChronicle(world, `Archipelago advanced to ${ERA_LABELS[era].name}!`, 'era');
  }
}

function unlockCustomForIsland(
  world: WorldState,
  culture: VillageCultureProfile,
  customId: VillageCustomId,
) {
  if (culture.customs.includes(customId)) return;
  culture.customs.push(customId);
  culture.traditionLevel = culture.customs.length;
  const islName = ISLAND_DEFS[culture.islandId].name;
  const meta = VILLAGE_CUSTOM_META[customId];
  if (culture.islandId === 'cradle') {
    if (culture.traditionLevel >= 4) {
      culture.ethosTitle = 'Hearthlight Chroniclers';
      culture.motto = 'Kindred around nightly embers sharing loaf, story, and starlight.';
    } else if (culture.traditionLevel >= 2) {
      culture.ethosTitle = 'Kindred Ember Circle';
      culture.motto = 'Bonded each twilight beside crackling stones and open sky.';
    } else {
      culture.ethosTitle = 'Ember-Bound Folk';
      culture.motto = 'Learning together beside their first warm hearth.';
    }
  } else if (culture.islandId === 'sunterrace') {
    culture.ethosTitle = culture.traditionLevel >= 2 ? 'Terrace Harvest Keepers' : 'Sun-Loam Settlers';
    culture.motto = 'Stepped terraces singing with orchards, grain, and evening songs.';
  }
  addChronicle(world, `${islName} birthed a new cultural tradition: ${meta.name}! (${meta.bonusLabel})`, 'bond');
}

function tickVillageCulturesAndBonfireRituals(
  world: WorldState,
  dt: number,
  particles: Particle[],
  emitVisualParticles: boolean,
) {
  const t = world.environment.timeOfDay;
  const isDuskRitual = t >= 0.72 && t <= 0.89;
  const allFolks = [...world.villagers, ...world.clanVillagers];

  for (const islandId of ISLAND_ORDER) {
    const culture = world.villageCultures[islandId];
    const fire = world.buildings.find((b) => b.islandId === islandId && b.type === 'bonfire' && b.unlocked);
    if (!culture || !fire) continue;

    const gathered = allFolks.filter(
      (v) => v.islandId === islandId && Math.hypot(v.x - fire.x, v.y - fire.y) < 92,
    );

    if (isDuskRitual && gathered.length >= 2) {
      culture.ritualPoints += dt * (1.2 + gathered.length * 0.45);
      for (const member of gathered) {
        member.mood = Math.min(100, member.mood + dt * 2.2);
        member.warmth = Math.min(100, member.warmth + dt * 5);
        if (emitVisualParticles && Math.random() < dt * 0.35) {
          spawnParticle(particles, {
            kind: 'firefly',
            x: fire.x + (Math.random() * 48 - 24),
            y: fire.y - 8 + (Math.random() * 24 - 12),
            vx: (Math.random() - 0.5) * 6,
            vy: -8 - Math.random() * 6,
            maxLife: 1.4,
            size: 2,
            alpha: 0.9,
            phase: Math.random() * 6,
            color: '#FDE68A',
          });
        }
      }

      // Record nightly ritual & spark mutual social bonds once per evening
      if (culture.lastRitualDay !== world.environment.dayCount) {
        culture.lastRitualDay = world.environment.dayCount;
        culture.nightlyGatherings += 1;
        for (let i = 0; i < gathered.length; i++) {
          const a = gathered[i];
          if (a.thoughtTimer <= 0) {
            a.thoughtBubble = 'Evening fire!';
            a.thoughtTimer = 3.2;
          }
        }
        processBonfireSocialCircle(world, islandId, gathered);
        grantKnowledge(world, 1.8, particles);
      }

      // Check organic custom evolution triggers
      if (culture.nightlyGatherings >= 1) {
        unlockCustomForIsland(world, culture, 'nightly_hearth_circle');
      }
      if (culture.nightlyGatherings >= 2 || culture.ritualPoints >= 28) {
        unlockCustomForIsland(world, culture, 'ember_storytelling');
      }
      if (hasBuildingType(world, 'farm_plot', islandId) || hasBuildingType(world, 'bakery', islandId)) {
        unlockCustomForIsland(world, culture, 'harvest_feast_table');
      }
      if (hasBuildingType(world, 'pasture', islandId)) {
        unlockCustomForIsland(world, culture, 'pasture_shepherd_tune');
      }
      if (hasBuildingType(world, 'smeltery', islandId) || hasBuildingType(world, 'quarry', islandId)) {
        unlockCustomForIsland(world, culture, 'forge_drum_rhythm');
      }
      if (hasBuildingType(world, 'dock', islandId) && culture.nightlyGatherings >= 2) {
        unlockCustomForIsland(world, culture, 'sea_lantern_vigil');
      }
      if (gathered.some((g) => g.cognition.observedConcepts.includes('horizon')) && culture.ritualPoints >= 22) {
        unlockCustomForIsland(world, culture, 'cliff_lookout_chant');
      }
      if (gathered.some((g) => g.cognition.observedConcepts.includes('berry_bush')) && culture.ritualPoints >= 16) {
        unlockCustomForIsland(world, culture, 'dawn_forage_song');
      }
    }
  }
}

function tickClanVillagers(world: WorldState, dt: number) {
  const t = world.environment.timeOfDay;
  const isDuskRitual = t >= 0.72 && t <= 0.89;
  const isNight = t < 0.21 || t > 0.89;

  for (const cv of world.clanVillagers) {
    cv.animPhase += dt * (cv.state === 'walking' ? 6.2 : 2.5);
    if (cv.edgeAckCooldown && cv.edgeAckCooldown > 0) cv.edgeAckCooldown = Math.max(0, cv.edgeAckCooldown - dt);
    if (cv.thoughtTimer > 0) {
      cv.thoughtTimer -= dt;
      if (cv.thoughtTimer <= 0) cv.thoughtBubble = null;
    }
    if (!cv.stuckState) {
      cv.stuckState = { lastX: cv.x, lastY: cv.y, timer: 0, detourSign: 1 };
    }

    const isl = ISLAND_DEFS[cv.islandId];
    const fire = world.buildings.find((b) => b.islandId === cv.islandId && b.type === 'bonfire' && b.unlocked);
    const aiHomeId = cv.homeIslandId ?? cv.islandId;
    const aiRes = getVillageRes(world, aiHomeId);

    cv.decisionCooldown -= dt;
    if (cv.decisionCooldown <= 0) {
      cv.decisionCooldown = 4.5 + Math.random() * 5.5;
      if (isDuskRitual && fire) {
        const ang = (cv.animPhase + cv.x * 0.02) % (Math.PI * 2);
        cv.state = 'socializing';
        cv.targetX = fire.x + Math.cos(ang) * 52;
        cv.targetY = fire.y + Math.sin(ang) * 42;
        cv.autonomyReason = `Sitting around ${fire.name} for nightly ${CULTURES[cv.cultureId].name} songs.`;
        if (Math.random() < 0.35 && !cv.thoughtBubble) {
          cv.thoughtBubble = 'Firelight song!';
          cv.thoughtTimer = 3.0;
        }
      } else if (isNight && fire) {
        cv.state = 'sleeping';
        cv.targetX = fire.x + (Math.random() * 54 - 27);
        cv.targetY = fire.y + (Math.random() * 44 - 22);
      } else {
        cv.state = 'walking';
        if (aiRes.food < 12) {
          const berry = world.wildNodes.find((n) => n.islandId === cv.islandId && n.kind === 'berry_bush' && n.amount > 0.2);
          cv.targetX = berry ? berry.x : isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.56);
          cv.targetY = berry ? berry.y : isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.54);
          cv.autonomyReason = `Foraging food for ${isl.name}.`;
        } else {
          cv.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.56);
          cv.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.54);
          cv.autonomyReason = `Tending ${CULTURES[cv.cultureId].name} village life on ${isl.name}.`;
        }
      }
    }

    const d = Math.hypot(cv.targetX - cv.x, cv.targetY - cv.y);
    if (d > 8) {
      const step = steerEntity(world, cv.islandId, cv.x, cv.y, cv.targetX, cv.targetY, 26 * dt, false, cv.stuckState, dt, cv.id);
      cv.x = step.x;
      cv.y = step.y;
      cv.facing = step.facing;
      if ((step.hitEdge || step.hitWaterEdge || step.wasStuckReset) && (!cv.edgeAckCooldown || cv.edgeAckCooldown <= 0)) {
        cv.edgeAckCooldown = 2.5;
        if (step.hitEdge) {
          cv.thoughtBubble = 'High cliff!';
          cv.thoughtTimer = 2.0;
        }
        cv.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.45);
        cv.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.45);
      }
    } else if (cv.state === 'walking') {
      cv.state = 'working';
    }

    // Autonomous AI village resource production while awake & working
    if (cv.state === 'working' && aiHomeId === cv.islandId) {
      if (aiRes.food < 14) {
        addVillageResource(world, aiHomeId, 'berries', 0.18 * dt);
      } else {
        addVillageResource(world, aiHomeId, 'timber', 0.16 * dt);
        addVillageResource(world, aiHomeId, 'stone', 0.12 * dt);
        if (hasBuildingType(world, 'farm_plot', aiHomeId)) {
          addVillageResource(world, aiHomeId, 'grain', 0.14 * dt);
        }
      }
    }
  }
}

function tickSkillTeaching(world: WorldState, dt: number, particles: Particle[]) {
  const techMods = getTechModifiers(world.unlockedTechIds);
  const allStudents = world.villagers;
  for (const teacher of world.villagers) {
    if (teacher.teachCooldown && teacher.teachCooldown > 0) {
      teacher.teachCooldown = Math.max(0, teacher.teachCooldown - dt);
    }
    if (teacher.lifeStage === 'infant' || teacher.lifeStage === 'child') continue;
    if (teacher.teachCooldown && teacher.teachCooldown > 0) continue;
    if (teacher.voyageBoatId || teacher.transitGliderId || teacher.transitCableId) continue;

    // Find best skill teacher knows (>= 1)
    let bestSkill: SkillId | null = null;
    let bestLv = 0;
    for (const sid of ALL_SKILL_IDS) {
      const lv = getSkillLevel(teacher, sid);
      if (lv > bestLv) {
        bestLv = lv;
        bestSkill = sid;
      }
    }
    if (!bestSkill || bestLv < 1) continue;

    const student = allStudents.find(
      (s) =>
        s.id !== teacher.id &&
        s.islandId === teacher.islandId &&
        s.lifeStage !== 'infant' &&
        getSkillLevel(s, bestSkill!) < bestLv &&
        Math.hypot(s.x - teacher.x, s.y - teacher.y) < 58,
    );
    if (!student) continue;

    const teacherStats = getTraitStats(teacher);
    const prevLv = getSkillLevel(student, bestSkill);
    const xpGain = 15 * techMods.teachRateMult * teacherStats.teachRateMult;
    gainSkillXp(world, student, bestSkill, xpGain);
    teacher.teachCooldown = 14;
    if (!teacher.thoughtBubble) {
      teacher.thoughtBubble = `Taught ${SKILL_META[bestSkill].label}!`;
      teacher.thoughtTimer = 2.6;
    }
    if (getSkillLevel(student, bestSkill) > prevLv) {
      recordPositiveContribution(world, teacher, 'teach', student, 3);
      addChronicle(
        world,
        `${teacher.name.split(' ')[0]} mentored ${student.name.split(' ')[0]} in ${SKILL_META[bestSkill].label}!`,
        'tech',
      );
    }
    spawnParticle(particles, {
      kind: 'sparkle',
      x: student.x,
      y: student.y - 11,
      vx: 0,
      vy: -9,
      maxLife: 0.9,
      size: 2,
      alpha: 0.9,
      phase: 0,
      color: '#93C5FD',
    });
  }
}

function tickAutonomousAiVillages(world: WorldState, dt: number) {
  if (Math.random() > dt * 0.08) return;
  const aiIslands: IslandId[] = ['timbercrown', 'coppercrag', 'sunterrace', 'starbloom', 'mistatoll'];

  for (const islandId of aiIslands) {
    // Only manage unowned AI settlements (not currently owned by a human player or containing player villagers)
    if (world.islandOwners?.[islandId]) continue;
    if (world.villagers.some((v) => v.homeIslandId === islandId)) continue;
    const locals = world.clanVillagers.filter((cv) => (cv.homeIslandId ?? cv.islandId) === islandId);
    if (locals.length === 0) continue;

    const res = getVillageRes(world, islandId);
    const pop = locals.length;
    const beds = getHousingBedsForIsland(world, islandId);
    const hasType = (t: BuildingType) => world.buildings.some((b) => b.islandId === islandId && b.type === t && b.unlocked);
    const countType = (t: BuildingType) => world.buildings.filter((b) => b.islandId === islandId && b.type === t && b.unlocked).length;

    // Periodic modest food consumption for AI villages
    if (res.food >= pop * 0.6 && Math.random() < 0.25) {
      consumeFoodUnits(world, islandId, Math.max(0.5, pop * 0.3));
    }

    // Basic-needs-first build order for autonomous AI villages:
    // 1) Bonfire -> 2) Farm Plot (if food < pop*6) -> 3) Lean-to / Cottage (if pop >= beds) -> 4) Craft/Harbor/Defense
    let nextType: BuildingType | null = null;
    if (!hasType('bonfire')) {
      nextType = 'bonfire';
    } else if (res.food < Math.max(10, pop * 6) && countType('farm_plot') < 2) {
      nextType = 'farm_plot';
    } else if (villageNeedsHousing(pop, beds) || countType('lean_to') + countType('cottage') === 0) {
      nextType = countType('lean_to') === 0 && res.stone < 8 ? 'lean_to' : 'cottage';
    } else if (islandId === 'timbercrown') {
      if (!hasType('woodshop')) nextType = 'woodshop';
      else if (!hasType('watchtower')) nextType = 'watchtower';
    } else if (islandId === 'coppercrag') {
      if (!hasType('quarry')) nextType = 'quarry';
      else if (!hasType('smeltery')) nextType = 'smeltery';
    } else if (islandId === 'mistatoll') {
      if (!hasType('dock')) nextType = 'dock';
    } else {
      if (!hasType('farm_plot')) nextType = 'farm_plot';
      else if (!hasType('library')) nextType = 'library';
    }

    if (nextType) {
      const bp = BUILDING_BLUEPRINTS[nextType];
      const cost = getBuildCost(bp);
      if (hasResourcesFor(res, cost)) {
        const site = findValidSiteOnIsland(world, islandId);
        if (site) {
          spendVillageResources(world, islandId, cost);
          const cultureId = world.islands[islandId]?.owningCultureId ?? ISLAND_DEFS[islandId].defaultCultureId;
          const b = createBuildingInstance(world, nextType, islandId, site.x, site.y);
          b.cultureId = cultureId;
          b.unlocked = true;
          b.constructionStage = 'complete';
          b.pausedForMaterials = false;
          b.level = 1;
          world.buildings.push(b);
          if (nextType === 'dock') {
            world.islands[islandId].dockBuilt = true;
          }
          addChronicle(
            world,
            `${CULTURES[cultureId].name} villagers raised a ${b.name} on ${ISLAND_DEFS[islandId].name}.`,
            'build',
          );
          break;
        }
      }
    }

    // Strict population growth gating for AI villages too (beds + food surplus)
    if (pop < beds && pop < 7 && res.food >= pop * 6 + 6 && Math.random() < 0.06) {
      const cultureId = world.islands[islandId]?.owningCultureId ?? ISLAND_DEFS[islandId].defaultCultureId;
      const cand = generateCandidate('traveler', world.environment.dayCount, new Set(locals.map((l) => l.name)));
      const newNative = makeNativeClanVillager(
        `clan_ai_${islandId}_${Date.now()}`,
        cand.name,
        islandId,
        cultureId,
        CULTURES[cultureId].bannerColor,
        cand.hairColor,
        cand.skinTone,
        0,
        0,
        'forage',
      );
      world.clanVillagers.push(newNative);
      upsertLineage(world, newNative);
    }
  }
}

function tickForeignPerimeterAndParley(world: WorldState, _dt: number) {
  if (world.gameMode === 'shared_siege') return;
  const allLocals = [...world.villagers, ...world.clanVillagers];

  for (const v of world.villagers) {
    const homeId = v.homeIslandId ?? v.islandId;
    if (v.islandId === homeId) {
      if (v.visitStatus && v.visitStatus !== 'home') {
        v.visitStatus = 'home';
        v.visitTargetIslandId = null;
        v.parleyPartnerId = null;
      }
      continue;
    }

    // Check if villager belongs to this island's owner or if this island is foreign territory
    const sameOwner =
      Boolean(v.ownerPlayerId) &&
      Boolean(world.islandOwners?.[v.islandId]) &&
      world.islandOwners?.[v.islandId] === v.ownerPlayerId;
    if (sameOwner) {
      v.visitStatus = 'admitted';
      continue;
    }

    const isl = ISLAND_DEFS[v.islandId];
    const policy = world.villagePolicies?.[v.islandId]?.borderPolicy ?? 'parley';
    const targetCulture = world.islands[v.islandId]?.owningCultureId ?? isl.defaultCultureId;
    const dipTrust = world.diplomacy?.[targetCulture]?.trust ?? 50;

    if (policy === 'open_trade' || (policy === 'allied' && dipTrust >= 50)) {
      v.visitStatus = 'admitted';
      continue;
    }

    if (v.visitStatus === 'admitted' && v.visitTargetIslandId === v.islandId) {
      continue;
    }

    const nd = islandNormalizedDist(isl, v.x, v.y);
    // Prevent outsiders from entering inner core (nd < 0.66) without admission
    if (nd < 0.66) {
      const rdx = v.x - isl.centerX;
      const rdy = v.y - isl.centerY;
      const dist = Math.hypot(rdx, rdy) || 1;
      const pushScale = 0.72 / Math.max(0.08, nd);
      v.x = isl.centerX + (rdx / dist) * (dist * pushScale);
      v.y = isl.centerY + (rdy / dist) * (dist * pushScale);
    }

    if (v.visitStatus === 'denied') {
      const homeDef = ISLAND_DEFS[homeId];
      v.targetX = homeDef.centerX;
      v.targetY = homeDef.centerY;
      v.autonomyReason = `Denied entry at ${isl.name} perimeter; returning home.`;
      continue;
    }

    v.visitTargetIslandId = v.islandId;
    const localResident = allLocals.find(
      (other) =>
        other.id !== v.id &&
        other.islandId === v.islandId &&
        (other.homeIslandId ?? other.islandId) === v.islandId &&
        other.lifeStage !== 'infant',
    );

    if (localResident) {
      const distToLocal = Math.hypot(localResident.x - v.x, localResident.y - v.y);
      if (distToLocal > 55) {
        v.visitStatus = 'at_perimeter';
        // Hold outside perimeter while beckoning a local resident to parley
        const ang = Math.atan2(v.y - isl.centerY, v.x - isl.centerX);
        v.targetX = isl.centerX + Math.cos(ang) * (isl.radiusX * 0.74);
        v.targetY = isl.centerY + Math.sin(ang) * (isl.radiusY * 0.74);
        v.autonomyReason = `Waiting outside ${isl.name} perimeter to parley with locals.`;
        if (!v.thoughtBubble) {
          v.thoughtBubble = 'Hail, neighbors!';
          v.thoughtTimer = 2.8;
        }
        // Nudge local villager toward perimeter to greet visitor
        if (localResident.state !== 'fighting' && localResident.state !== 'sleeping') {
          localResident.targetX = v.x;
          localResident.targetY = v.y;
          localResident.state = 'socializing';
        }
      } else {
        v.visitStatus = 'parleying';
        v.parleyPartnerId = localResident.id;
        const relScore = v.relationships[localResident.id] ?? 36;
        const warmBonus = v.traits.includes('warmhearted') || localResident.traits.includes('warmhearted') ? 10 : 0;
        const trustCheck = relScore + warmBonus + (dipTrust - 45) * 0.4;
        const allowed =
          policy === 'closed'
            ? trustCheck >= 85
            : trustCheck >= 28 && world.diplomacy?.[targetCulture]?.status !== 'war';

        if (allowed) {
          v.visitStatus = 'admitted';
          processDirectSocialShift(world, v, localResident, 8, 'parley');
          v.thoughtBubble = 'Admitted!';
          v.thoughtTimer = 3.0;
          localResident.thoughtBubble = 'Welcome in!';
          localResident.thoughtTimer = 2.6;
          v.autonomyReason = `Parleyed with ${localResident.name.split(' ')[0]} and entered ${isl.name}.`;
          addChronicle(
            world,
            `${v.name.split(' ')[0]} greeted ${localResident.name.split(' ')[0]} outside ${isl.name} and was admitted.`,
            'bond',
            { islandId: isl.id, participantIds: [v.id, localResident.id] },
          );
        } else {
          v.visitStatus = 'denied';
          v.thoughtBubble = 'Turned away...';
          v.thoughtTimer = 3.2;
          localResident.thoughtBubble = 'Borders closed!';
          localResident.thoughtTimer = 2.8;
          const homeDef = ISLAND_DEFS[homeId];
          v.targetX = homeDef.centerX;
          v.targetY = homeDef.centerY;
          v.autonomyReason = `${isl.name} border policy denied entry.`;
          emitWorldEvent(world, {
            category: 'migration',
            significance: 'minor',
            summary: `${localResident.name.split(' ')[0]} turned ${v.name.split(' ')[0]} away at ${isl.name} border.`,
            islandId: isl.id,
            participantIds: [v.id, localResident.id],
          });
        }
      }
    } else {
      // Uninhabited frontier island admits explorers freely
      v.visitStatus = 'admitted';
    }
  }
}

function spawnSiegeRaider(
  world: WorldState,
  name: string,
  islandId: IslandId,
  x: number,
  y: number,
  wave: number,
) {
  const isl = ISLAND_DEFS[islandId];
  const traits = wave >= 3 ? ['hard_skin', 'brave_hunter'] : ['brave_hunter'];
  const hp = 58 + wave * 12;
  world.raiders.push({
    ...makeNativeClanVillager(
      `siege_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      islandId,
      'ashen_raider',
      '#7C2D12',
      '#1C1917',
      '#C49B7B',
      0,
      0,
      'guard',
    ),
    isNativeClan: false,
    isStranger: true,
    traits,
    stats: rollUnitStats(traits, true),
    skills: rollStarterSkills('adult', true),
    skillXp: {},
    rtsOrder: null,
    drafted: false,
    x,
    y,
    targetX: ISLAND_DEFS.cradle.centerX,
    targetY: ISLAND_DEFS.cradle.centerY,
    hp,
    maxHp: hp,
    gearTier: wave >= 3 ? 3 : 2,
    weaponType: wave >= 4 ? 'iron_blade' : wave >= 2 ? 'bronze_blade' : 'flint_spear',
    state: 'fighting',
    autonomyReason: `Storming ${isl.name} in Siege Wave ${wave}!`,
    thoughtBubble: `Wave ${wave}!`,
    thoughtTimer: 3.5,
  });
}

function tickSharedSiege(world: WorldState, dt: number, particles: Particle[]) {
  if (world.gameMode !== 'shared_siege' || world.villagers.length === 0) return;
  if (!world.siege) {
    world.siege = {
      wave: 0,
      nextWaveTimer: 35,
      activeFronts: [],
      totalKills: 0,
      warningText: null,
      lastWaveDay: 0,
    };
  }

  // Update activeFronts dynamically from live raiders
  const liveFronts = Array.from(new Set(world.raiders.map((r) => r.islandId)));
  world.siege.activeFronts = liveFronts;

  if (world.raiders.length >= 14) return;
  world.siege.nextWaveTimer -= dt;
  if (world.siege.nextWaveTimer <= 10 && world.siege.nextWaveTimer > 0 && world.raiders.length === 0) {
    world.siege.warningText = `Wave ${world.siege.wave + 1} approaching multiple fronts in ${Math.ceil(world.siege.nextWaveTimer)}s!`;
  }

  if (world.siege.nextWaveTimer <= 0) {
    world.siege.wave += 1;
    const wave = world.siege.wave;
    world.siege.nextWaveTimer = Math.max(34, 68 - wave * 3);
    world.siege.lastWaveDay = world.environment.dayCount;

    const cradle = ISLAND_DEFS.cradle;
    const sun = ISLAND_DEFS.sunterrace;
    const timber = ISLAND_DEFS.timbercrown;

    // Front 1: Sea galley landing on Cradle southern shore
    spawnSiegeRaider(
      world,
      `Sea-Raider W${wave}-A`,
      'cradle',
      cradle.dockSpot.x + (Math.random() * 26 - 13),
      cradle.dockSpot.y - 10,
      wave,
    );
    if (wave >= 2) {
      spawnSiegeRaider(
        world,
        `Sea-Raider W${wave}-B`,
        'cradle',
        cradle.dockSpot.x + 24,
        cradle.dockSpot.y - 18,
        wave,
      );
    }

    // Front 2: Eastern bridge approach from Sunterrace
    spawnSiegeRaider(
      world,
      `Bridge-Vanguard W${wave}`,
      'sunterrace',
      sun.centerX - sun.radiusX * 0.45,
      sun.centerY,
      wave,
    );

    // Front 3 (wave >= 2): Western bridge / glider raid from Timbercrown
    if (wave >= 2) {
      spawnSiegeRaider(
        world,
        `Timber-Flanker W${wave}`,
        'timbercrown',
        timber.centerX + timber.radiusX * 0.4,
        timber.centerY,
        wave,
      );
    }

    // Front 4 (wave >= 4): Airborne glider drop right onto northern Cradle rim
    if (wave >= 4) {
      spawnSiegeRaider(
        world,
        `Sky-Dropper W${wave}`,
        'cradle',
        cradle.centerX + (Math.random() * 120 - 60),
        cradle.centerY - cradle.radiusY * 0.65,
        wave,
      );
    }

    const fronts: IslandId[] = wave >= 2 ? ['cradle', 'sunterrace', 'timbercrown'] : ['cradle', 'sunterrace'];
    world.siege.activeFronts = fronts;
    world.siege.warningText = `Siege Wave ${wave} attacking across ${fronts.length} fronts!`;
    addChronicle(
      world,
      `Siege Wave ${wave} struck across ${fronts.map((id) => ISLAND_DEFS[id].name).join(' & ')}!`,
      'war',
    );
    spawnParticle(particles, {
      kind: 'sparkle',
      x: cradle.centerX,
      y: cradle.centerY,
      vx: 0,
      vy: -14,
      maxLife: 1.2,
      size: 3,
      alpha: 0.9,
      phase: 0,
      color: '#EF4444',
    });
  }
}

function executeRtsOrder(
  world: WorldState,
  v: VillagerEntity,
  dt: number,
  particles: Particle[],
): boolean {
  const order = v.rtsOrder;
  if (!order) return false;

  if (order.kind === 'hold') {
    v.state = 'working';
    v.targetX = v.x;
    v.targetY = v.y;
    v.autonomyReason = 'Holding position (RTS order).';
    // Auto-engage raiders within melee/bow range while holding
    const nearbyR = world.raiders.find((r) => r.islandId === v.islandId && Math.hypot(r.x - v.x, r.y - v.y) < (v.weaponType === 'bow' ? 52 : 24));
    if (nearbyR) v.state = 'fighting';
    return true;
  }

  if (order.kind === 'attack') {
    const rTarget = world.raiders.find((r) => r.id === order.targetId && r.hp > 0);
    const hTarget = !rTarget ? world.wildHerds.find((h) => h.id === order.targetId && h.hp > 0) : null;
    const tgt = rTarget ?? hTarget;
    if (!tgt) {
      v.rtsOrder = null;
      return false;
    }
    v.activeTask = rTarget ? 'guard' : 'hunt';
    v.state = rTarget ? 'fighting' : 'hunting';
    v.targetX = tgt.x;
    v.targetY = tgt.y;
    v.autonomyReason = `RTS Attack: engaging ${rTarget ? rTarget.name : (hTarget?.kind ?? 'target')}.`;
    if (rTarget && v.islandId === rTarget.islandId && Math.hypot(v.x - rTarget.x, v.y - rTarget.y) <= (v.weaponType === 'bow' ? 42 : 17)) {
      if (v.attackCooldown <= 0) {
        v.attackCooldown = 1.25;
        if (v.weaponType === 'bow') {
          spawnProjectile(world, 'arrow', v.islandId, v.x, v.y, rTarget.islandId, rTarget.x, rTarget.y);
          gainSkillXp(world, v, 'archery', 2.4);
        } else {
          gainSkillXp(world, v, 'blade_mastery', 2.4);
        }
        const techMods = getTechModifiers(world.unlockedTechIds);
        const tStats = getTraitStats(v);
        const baseVDmg =
          v.weaponType === 'iron_blade' ? 28 : v.weaponType === 'bronze_blade' ? 21 : v.weaponType === 'bow' ? 17 : v.weaponType === 'flint_spear' ? 14 : 8;
        const skillDmg = v.weaponType === 'bow' ? getSkillLevel(v, 'archery') * 1.8 : getSkillLevel(v, 'blade_mastery') * 1.8;
        const finalDmg = (baseVDmg + skillDmg + (v.stats?.strength ?? 8) * 0.45) * tStats.attackPowerMult * techMods.attackMult;
        applyCombatStrike(world, v, rTarget, finalDmg, 0.3, 'combat', particles);
        if (rTarget.hp <= 0) {
          v.killCount += 1;
          v.rtsOrder = null;
        }
      }
    }
    return true;
  }

  if (order.kind === 'gather') {
    const node = world.wildNodes.find((n) => n.id === order.targetId && n.amount > 0.05);
    if (!node) {
      v.rtsOrder = null;
      return false;
    }
    const task: TaskType =
      node.kind === 'tree' || node.kind === 'branch_pile'
        ? 'chop'
        : node.kind === 'stone_boulder' || node.kind === 'flint_pile'
          ? 'gather_stone'
          : node.kind === 'copper_vein' || node.kind === 'iron_vein'
            ? 'quarry'
            : 'forage';
    v.activeTask = task;
    v.targetX = node.x;
    v.targetY = node.y;
    const d = Math.hypot(v.x - node.x, v.y - node.y);
    v.state = d <= 24 ? 'working' : 'walking';
    v.autonomyReason = `RTS Gather: ${node.kind.replace('_', ' ')}.`;
    if (d <= 26) {
      const stats = getTraitStats(v);
      const techMods = getTechModifiers(world.unlockedTechIds);
      const rate = 0.34 * stats.workSpeed * stats.gatherYieldMult * techMods.gatherMult * dt;
      const take = harvestWildNode(node, rate * 1.5);
      const creditIsle = v.homeIslandId ?? v.islandId;
      if (node.kind === 'tree' || node.kind === 'branch_pile') {
        addVillageResource(world, creditIsle, 'timber', take);
        gainSkillXp(world, v, 'woodcraft', dt * 1.5);
      } else if (node.kind === 'stone_boulder' || node.kind === 'flint_pile') {
        addVillageResource(world, creditIsle, 'stone', take);
        gainSkillXp(world, v, 'stonecraft', dt * 1.5);
      } else if (node.kind === 'copper_vein') {
        addVillageResource(world, creditIsle, 'copper', take * 0.85);
        addVillageResource(world, creditIsle, 'stone', take * 0.35);
        gainSkillXp(world, v, 'metallurgy', dt * 1.4);
      } else if (node.kind === 'iron_vein') {
        addVillageResource(world, creditIsle, 'iron', take * 0.75);
        addVillageResource(world, creditIsle, 'stone', take * 0.35);
        gainSkillXp(world, v, 'metallurgy', dt * 1.5);
      } else {
        addVillageResource(world, creditIsle, 'berries', take);
        gainSkillXp(world, v, 'foraging', dt * 1.5);
      }
      syncCombinedFood(world);
      grantKnowledge(world, dt * 0.65, particles, v);
    }
    return true;
  }

  if (order.kind === 'build') {
    const b = world.buildings.find((item) => item.id === order.targetId && !item.unlocked);
    if (!b) {
      v.rtsOrder = null;
      return false;
    }
    v.targetX = b.x;
    v.targetY = b.y + 16;
    v.state = Math.hypot(v.x - b.x, v.y - b.y) <= 38 ? 'building' : 'walking';
    v.autonomyReason = `RTS Build: ${b.name}.`;
    if (!world.activeConstruction || world.activeConstruction.buildingId === b.id) {
      if (!world.activeConstruction) {
        const buildSpeed = getTechModifiers(world.unlockedTechIds).buildSpeedMult;
        world.activeConstruction = {
          buildingId: b.id,
          builderId: v.id,
          progress: 0,
          duration: Number((6.5 / buildSpeed).toFixed(2)),
          isUpgrade: false,
        };
      } else {
        world.activeConstruction.builderId = v.id;
      }
    }
    return true;
  }

  // move
  v.targetX = order.x;
  v.targetY = order.y;
  const dist = Math.hypot(v.x - order.x, v.y - order.y);
  v.state = dist > 10 ? 'walking' : 'working';
  v.autonomyReason = `RTS Move (${ISLAND_DEFS[order.islandId].name}).`;
  if (dist <= 10 && v.islandId === order.islandId) {
    v.rtsOrder = null;
  }
  return true;
}

export function stepSimulation(
  world: WorldState,
  rawDt: number,
  particles: Particle[] = [],
  emitVisualParticles: boolean = true,
) {
  const dt = Math.min(rawDt, 0.05) * (world.settings.simSpeed === 0 ? 0 : world.settings.simSpeed);
  world.lastTickTimestamp = Date.now();
  if (dt <= 0) return;

  // 1. Time & Seasons
  const prevTime = world.environment.timeOfDay;
  if (world.environment.timeMode !== 'locked') {
    world.environment.timeOfDay = (prevTime + dt / world.environment.cycleSpeedSeconds) % 1;
    if (world.environment.timeOfDay < prevTime) {
      world.environment.dayCount += 1;
      handleNewDayEvents(world);
    }
  }

  if (world.environment.weatherMode !== 'manual') {
    world.environment.weatherTimer -= dt;
    if (world.environment.weatherTimer <= 0) {
      const weights = SEASON_META[world.environment.season].weatherWeights;
      world.environment.weather = weights[Math.floor(Math.random() * weights.length)];
      world.environment.weatherTimer = 60 + Math.random() * 60;
    }
  }

  // 2. Living flora regrowth only (mineral & stone nodes are strictly finite)
  tickWildNodeRegrowth(world, dt);

  // 3. Autonomous Building, Tech, Cableways, Gliders, Ruins, Projectiles, Siege & Teaching
  tickAutonomousConstruction(world, dt, particles, emitVisualParticles);
  tickFarmingAndPastures(world, dt);
  tickWildHerdsAndHunting(world, dt, particles);
  tickBoats(world, dt, particles, emitVisualParticles);
  tickCableways(world, dt, particles);
  tickGliders(world, dt, particles, emitVisualParticles);
  tickExploreRuins(world, dt, particles);
  tickProjectiles(world, dt);
  tickDiplomacyAndWar(world, dt, particles);
  tickClanVillagers(world, dt);
  tickAutonomousAiVillages(world, dt);
  tickForeignPerimeterAndParley(world, dt);
  tickVillageCulturesAndBonfireRituals(world, dt, particles, emitVisualParticles);
  tickSkillTeaching(world, dt, particles);
  tickSharedSiege(world, dt, particles);
  tickGovernance(world, dt);

  // 4. Gate arrivals via physical migrant skiff (strictly gated by per-island beds AND food surplus!)
  const hasQueued = world.pendingArrivals.some((a) => a.kind === 'traveler');
  const arrivalIsle: IslandId = getOwnedBuildIslands(world)[0] ?? world.localHomeIslandId ?? 'cradle';
  const arrPop = world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === arrivalIsle).length;
  const arrBeds = getHousingBedsForIsland(world, arrivalIsle);
  const arrFood = getVillageRes(world, arrivalIsle).food;
  if (!hasQueued && arrPop > 0 && arrPop < arrBeds && arrPop < 24 && arrFood >= arrPop * 6 + 6) {
    world.nextTravelerTimer -= dt;
    if (world.nextTravelerTimer <= 0) {
      world.nextTravelerTimer = 300 + Math.random() * 160;
      const names = new Set(world.villagers.map((v) => v.name));
      const traveler = generateCandidate('traveler', world.environment.dayCount, names);
      traveler.islandId = arrivalIsle;
      const greeter = getGreetingVillagerForIsland(world, arrivalIsle);
      if (greeter) {
        traveler.greeterId = greeter.id;
        traveler.greeterName = greeter.name;
      } else {
        evaluateTravelerDecision(world, traveler, null);
      }
      dispatchMigrantBoat(world, arrivalIsle, traveler);
    }
  }

  for (const arr of world.pendingArrivals) {
    if (arr.kind === 'traveler' && arr.boatPhase !== 'approaching' && arr.decisionVerdict === 'talking') {
      arr.deliberationTimer -= dt;
      if (arr.deliberationTimer <= 0) {
        const greeter = arr.greeterId ? world.villagers.find((v) => v.id === arr.greeterId) ?? null : null;
        evaluateTravelerDecision(world, arr, greeter);
      }
    }
  }

  if (world.pendingArrivals.length > 0) {
    const first = world.pendingArrivals[0];
    if (first.kind === 'birth' || (first.boatPhase !== 'approaching' && first.decisionVerdict !== 'talking')) {
      world.autoWelcomeTimer -= dt;
      if (world.autoWelcomeTimer <= 0) {
        const targetIsle = first.islandId ?? arrivalIsle;
        const pop = world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === targetIsle).length;
        const beds = getHousingBedsForIsland(world, targetIsle);
        const foodOk = first.kind === 'birth' || getVillageRes(world, targetIsle).food >= pop * 6 + 6;
        const accept = (first.kind === 'birth' || first.decisionVerdict === 'recommend_welcome') && pop < beds && foodOk;
        resolveArrival(world, first.id, accept, particles);
        world.autoWelcomeTimer = 18;
      }
    }
  }

  // 5. Villager survival, cognition, warmth, combat, exploration & tasks
  const t = world.environment.timeOfDay;
  const isNight = t < 0.22 || t > 0.89;
  const isWinter = world.environment.season === 'winter' || world.environment.weather === 'snow';
  const isRain = world.environment.weather === 'rain';

  for (let vi = world.villagers.length - 1; vi >= 0; vi--) {
    const v = world.villagers[vi];
    const stats = getTraitStats(v);
    v.animPhase += dt * (v.state === 'walking' || v.state === 'exploring' ? 6.8 : 2.6);
    v.bounceScale += (1 - v.bounceScale) * Math.min(1, dt * 10);
    if (v.socialCooldown > 0) v.socialCooldown -= dt;
    if (v.pairChatCooldowns) {
      for (const pid of Object.keys(v.pairChatCooldowns)) {
        v.pairChatCooldowns[pid] -= dt;
        if (v.pairChatCooldowns[pid] <= 0) delete v.pairChatCooldowns[pid];
      }
    }
    if (!v.stuckState) {
      v.stuckState = { lastX: v.x, lastY: v.y, timer: 0, detourSign: 1 };
    }
    if (v.attackCooldown > 0) v.attackCooldown -= dt;
    if (v.edgeAckCooldown && v.edgeAckCooldown > 0) v.edgeAckCooldown = Math.max(0, v.edgeAckCooldown - dt);
    if (v.thoughtTimer > 0) {
      v.thoughtTimer -= dt;
      if (v.thoughtTimer <= 0) v.thoughtBubble = null;
    }

    if (v.voyageBoatId || v.transitGliderId || v.transitCableId) {
      // Passenger traveling via ship, wind-glider, or sky-cableway gondola
      continue;
    }

    updateVillagerEquipment(world, v);

    // Warmth & exposure
    const fire = getIslandBonfire(world, v.islandId);
    const nearFire = fire ? Math.hypot(v.x - fire.x, v.y - fire.y) < 110 : false;
    const insideHome = v.state === 'sleeping' && hasBuildingType(world, 'cottage', v.islandId);
    const woolResist = v.gearTier >= 2 ? 0.35 : v.gearTier === 1 ? 0.65 : 1.0;
    const techMods = getTechModifiers(world.unlockedTechIds);
    const homeId = v.homeIslandId ?? v.islandId;
    const homeRes = getVillageRes(world, homeId);

    // Infant protection: adults & fires keep babies warm, fed, and safe from vanishing
    const hasCaretaker = world.villagers.some((c) => c.id !== v.id && c.lifeStage !== 'infant');
    if (v.lifeStage === 'infant' && hasCaretaker) {
      v.warmth = Math.max(72, Math.min(100, v.warmth + dt * 6));
      v.hunger = Math.max(64, Math.min(100, v.hunger + dt * 2.5));
      v.hp = Math.min(v.maxHp, v.hp + dt * 2.0);
    } else {
      if (nearFire || insideHome) {
        v.warmth = Math.min(100, v.warmth + dt * 10);
      } else if (isWinter || (isNight && isRain)) {
        const chill = (isWinter ? 1.45 : 0.7) * woolResist * (v.traits.includes('resilient') ? 0.5 : 1);
        v.warmth = Math.max(0, v.warmth - dt * chill);
      } else {
        v.warmth = Math.min(100, v.warmth + dt * 1.4);
      }

      // Starvation & freezing mortality!
      v.hunger = Math.max(0, v.hunger - dt * 0.32);
      if (v.hunger <= 0) {
        v.hp -= dt * 2.2;
        if (v.hp <= 0) {
          killVillager(world, v.id, 'starvation', particles);
          continue;
        }
      } else if (v.warmth <= 0) {
        v.hp -= dt * 2.6;
        if (v.hp <= 0) {
          killVillager(world, v.id, 'freezing', particles);
          continue;
        }
      } else if (v.hunger > 45 && v.warmth > 40 && v.hp < v.maxHp) {
        const herbBoost = homeRes.herbs >= 1 ? 1.5 : 1;
        v.hp = Math.min(v.maxHp, v.hp + dt * 0.9 * herbBoost * stats.healRateMult * techMods.healRateMult);
      }
    }

    // Active bleeding tick & herbal clotting
    if (v.stats && v.stats.bleedStack > 0 && v.stats.bleedTimer > 0) {
      const nearSpring =
        ISLAND_DEFS[v.islandId].hasSpring && ISLAND_DEFS[v.islandId].springOffset
          ? Math.hypot(
              v.x - (ISLAND_DEFS[v.islandId].centerX + ISLAND_DEFS[v.islandId].springOffset!.dx),
              v.y - (ISLAND_DEFS[v.islandId].centerY + ISLAND_DEFS[v.islandId].springOffset!.dy),
            ) < 75
          : false;
      const clotRate =
        1 +
        (nearFire || nearSpring ? 0.65 : 0) +
        getSkillLevel(v, 'herbalism') * 0.25 +
        (v.traits.includes('swift_recovery') ? 0.6 : 0);
      v.stats.bleedTimer = Math.max(0, v.stats.bleedTimer - dt * clotRate);
      const bleedDmg = v.stats.bleedStack * 1.05 * stats.bleedChanceMult * dt;
      v.hp = Math.max(0, v.hp - bleedDmg);
      if (emitVisualParticles && Math.random() < dt * 1.4) {
        spawnParticle(particles, {
          kind: 'blood',
          x: v.x,
          y: v.y - 4,
          vx: (Math.random() - 0.5) * 4,
          vy: -3,
          maxLife: 0.6,
          size: 1.5,
          alpha: 0.8,
          phase: 0,
          color: '#EF4444',
        });
      }
      if (v.hp <= 0) {
        killVillager(world, v.id, 'combat', particles);
        continue;
      }
      if (v.stats.bleedTimer <= 0) {
        v.stats.bleedStack = 0;
      }
    }

    if (v.state === 'sleeping' || v.state === 'resting') {
      v.energy = Math.min(100, v.energy + dt * 5.2);
      v.mood = Math.min(100, v.mood + dt * 1.2);
    } else {
      v.energy = Math.max(0, v.energy - dt * 0.58 * stats.energyDrain);
    }

    // RTS Orders (Sovereign Sandbox & Shared Siege)
    const hasActiveRtsOrder =
      (world.gameMode === 'sovereign_sandbox' || world.gameMode === 'shared_siege') &&
      Boolean(v.rtsOrder) &&
      executeRtsOrder(world, v, dt, particles);

    // Movement across large islands + obstacle stuck avoidance + cliff-edge acknowledgement
    const agiBonus = 1 + ((v.stats?.agility ?? 8) - 8) * 0.025;
    const baseSpeed = v.lifeStage === 'infant' ? 14 : 34;
    const speed =
      baseSpeed *
      stats.moveSpeedMult *
      techMods.moveSpeedMult *
      agiBonus *
      (v.lifeStage === 'elder' ? 0.8 : 1);
    const dist = Math.hypot(v.targetX - v.x, v.targetY - v.y);
    if (dist > 8) {
      const step = steerEntity(world, v.islandId, v.x, v.y, v.targetX, v.targetY, speed * dt, false, v.stuckState, dt, v.id);
      v.x = step.x;
      v.y = step.y;
      v.islandId = step.islandId;
      v.facing = step.facing;
      if (step.wasStuckReset) {
        const isl = ISLAND_DEFS[v.islandId];
        v.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.52);
        v.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.52);
        if (step.navBlockedReason) {
          v.autonomyReason = `Replanning: ${step.navBlockedReason}`;
        }
        if (v.rtsOrder && v.rtsOrder.kind === 'move' && v.rtsOrder.islandId !== v.islandId) {
          v.rtsOrder = null;
        }
        v.decisionCooldown = Math.min(v.decisionCooldown, 1.0);
      }
      if (step.hitEdge && (!v.edgeAckCooldown || v.edgeAckCooldown <= 0)) {
        v.edgeAckCooldown = 2.4;
        if (!v.cognition.observedConcepts.includes('horizon')) {
          learnConcept(world, v, 'horizon', particles);
        } else {
          v.thoughtBubble = 'Sky-sea rim!';
          v.thoughtTimer = 2.0;
        }
        const isl = ISLAND_DEFS[v.islandId];
        v.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.52);
        v.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.52);
      }
      if (!world.islands[v.islandId].discovered) {
        discoverIsland(world, v.islandId, v.name.split(' ')[0]);
      }
    } else if (v.state === 'walking') {
      if (v.decisionTrace?.chosenAction === 'haul_to_stockpile') {
        if ((v.carriedAmount ?? 0) > 0.01) {
          const activeSite =
            world.activeConstruction &&
            world.buildings.find(
              (b) =>
                b.id === world.activeConstruction?.buildingId &&
                !b.unlocked &&
                b.islandId === v.islandId &&
                Math.hypot(v.x - b.x, v.y - b.y) <= 48 &&
                (b.requiredMaterials?.[v.carriedResource!] ?? 0) > (b.deliveredMaterials?.[v.carriedResource!] ?? 0),
            );
          if (activeSite && v.carriedResource) {
            if (!activeSite.deliveredMaterials) activeSite.deliveredMaterials = {};
            const need = (activeSite.requiredMaterials?.[v.carriedResource] ?? 0) - (activeSite.deliveredMaterials[v.carriedResource] ?? 0);
            const give = Math.min(need, v.carriedAmount ?? 0);
            if (give > 0) {
              activeSite.deliveredMaterials[v.carriedResource] = Number(((activeSite.deliveredMaterials[v.carriedResource] ?? 0) + give).toFixed(2));
              v.carriedAmount = Math.max(0, Number(((v.carriedAmount ?? 0) - give).toFixed(2)));
              if (v.carriedAmount <= 0.01) {
                v.carriedAmount = 0;
                v.carriedResource = null;
              }
            }
            if ((v.carriedAmount ?? 0) > 0.01) {
              depositCarriedToVillage(world, v, addVillageResource, syncCombinedFood);
            }
            v.thoughtBubble = 'Delivered!';
            v.thoughtTimer = 2.0;
          } else if (depositCarriedToVillage(world, v, addVillageResource, syncCombinedFood)) {
            v.thoughtBubble = 'Stored!';
            v.thoughtTimer = 2.0;
          }
        }
        v.state = 'resting';
        v.decisionCooldown = Math.min(v.decisionCooldown, 0.25);
      } else {
        v.state = 'working';
      }
    } else if (v.state === 'exploring') {
      v.state = 'inspecting';
      const concept = v.cognition.focusObject ?? 'horizon';
      learnConcept(world, v, concept, particles);
      v.decisionCooldown = Math.min(v.decisionCooldown, 2.8);
    }

    // Passive cognitive curiosity & CALM social concept sharing (pair-cooldown + state-gated)
    if (v.state === 'inspecting' || v.state === 'exploring') {
      v.cognition.awareness = Math.min(100, v.cognition.awareness + dt * (v.state === 'inspecting' ? 2.6 : 0.9));
      v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);
    }
    const busyStates = v.state === 'fighting' || v.state === 'hunting' || v.state === 'sleeping' || v.state === 'building';
    if (!v.banished && v.socialCooldown <= 0 && !busyStates && v.hunger >= 30) {
      const peer = [...world.villagers, ...world.clanVillagers].find(
        (other) =>
          other.id !== v.id &&
          !other.banished &&
          other.islandId === v.islandId &&
          other.state !== 'fighting' &&
          other.state !== 'hunting' &&
          other.state !== 'sleeping' &&
          ((other.homeIslandId ?? other.islandId) === (v.homeIslandId ?? v.islandId) ||
            v.visitStatus === 'admitted' ||
            other.visitStatus === 'admitted') &&
          (!v.pairChatCooldowns || (v.pairChatCooldowns[other.id] ?? 0) <= 0) &&
          Math.hypot(other.x - v.x, other.y - v.y) < 36,
      );
      if (peer) {
        processSocialEncounter(world, v, peer, (target, concept, peerFirst) => {
          learnConcept(world, target, concept, particles, peerFirst);
        });
        spreadIncidentRumor(world, v, peer);
        spreadIncidentRumor(world, peer, v);
      }
    }

    // Task Execution & Knowledge generation (routed into villager's home village stockpile!)
    if (
      !v.banished &&
      !hasActiveRtsOrder &&
      (v.state === 'working' || (v.state === 'exploring' && canVillagerWork(world, v))) &&
      canVillagerWork(world, v)
    ) {
      const yieldMult = stats.gatherYieldMult * techMods.gatherMult;
      const rate = 0.25 * stats.workSpeed * yieldMult * (0.75 + (v.mood / 100) * 0.35);
      if (v.activeTask === 'forage') {
        const nearbyNode = world.wildNodes.find(
          (n) =>
            n.islandId === v.islandId &&
            n.amount > 0.02 &&
            (n.kind === 'berry_bush' || n.kind === 'flint_pile' || n.kind === 'branch_pile') &&
            Math.hypot(n.x - v.x, n.y - v.y) < 48,
        );
        if (nearbyNode) {
          const take = harvestWildNode(nearbyNode, rate * (1.35 + getSkillLevel(v, 'foraging') * 0.08) * dt);
          if (take > 0) {
            const resKey =
              nearbyNode.kind === 'berry_bush' ? 'berries' : nearbyNode.kind === 'flint_pile' ? 'stone' : 'timber';
            addToVillagerInventory(world, v, resKey, take, addVillageResource);
            gainSkillXp(world, v, 'foraging', dt * 1.15);
            advanceKnowledge(v, 'foraging', dt * 0.75);
            grantKnowledge(world, dt * 0.95, particles, v);
            if ((v.carriedAmount ?? 0) >= getCarryCap(v) - 0.05 || nearbyNode.amount <= 0.02) {
              v.decisionCooldown = Math.min(v.decisionCooldown, 0.2);
            }
          }
        } else {
          const nextNode = world.wildNodes.find(
            (n) =>
              n.islandId === v.islandId &&
              n.amount > 0.05 &&
              (n.kind === 'berry_bush' || n.kind === 'flint_pile' || n.kind === 'branch_pile'),
          );
          if (nextNode) {
            v.targetX = nextNode.x;
            v.targetY = nextNode.y;
            v.state = 'walking';
          } else {
            v.decisionCooldown = 0;
          }
        }
      } else if (v.activeTask === 'gather_stone') {
        const nearbyNode = world.wildNodes.find(
          (n) =>
            n.islandId === v.islandId &&
            n.amount > 0.02 &&
            (n.kind === 'stone_boulder' || n.kind === 'flint_pile') &&
            Math.hypot(n.x - v.x, n.y - v.y) < 48,
        );
        const stoneBonus = 1 + getSkillLevel(v, 'stonecraft') * 0.1;
        if (nearbyNode) {
          const take = harvestWildNode(nearbyNode, rate * 1.45 * stoneBonus * dt);
          if (take > 0) {
            addToVillagerInventory(world, v, 'stone', take, addVillageResource);
            gainSkillXp(world, v, 'stonecraft', dt * 1.35);
            advanceKnowledge(v, 'stonecraft', dt * 0.8);
            if (nearbyNode.kind === 'flint_pile') advanceKnowledge(v, 'toolmaking', dt * 0.4);
            grantKnowledge(world, dt * 0.85, particles, v);
            if ((v.carriedAmount ?? 0) >= getCarryCap(v) - 0.05 || nearbyNode.amount <= 0.02) {
              v.decisionCooldown = Math.min(v.decisionCooldown, 0.2);
            }
          }
        } else {
          const nextNode = world.wildNodes.find(
            (n) => n.islandId === v.islandId && n.amount > 0.05 && (n.kind === 'stone_boulder' || n.kind === 'flint_pile'),
          );
          if (nextNode) {
            v.targetX = nextNode.x;
            v.targetY = nextNode.y;
            v.state = 'walking';
          } else {
            v.decisionCooldown = 0;
          }
        }
      } else if (v.activeTask === 'chop') {
        const woodBoost = (hasBuildingType(world, 'woodshop', homeId) ? 1.35 : 1) * (1 + getSkillLevel(v, 'woodcraft') * 0.09);
        const treeNode = world.wildNodes.find(
          (n) =>
            n.islandId === v.islandId &&
            n.amount > 0.02 &&
            (n.kind === 'tree' || n.kind === 'branch_pile') &&
            Math.hypot(n.x - v.x, n.y - v.y) < 48,
        );
        if (treeNode) {
          const take = harvestWildNode(treeNode, rate * 1.3 * woodBoost * dt);
          if (take > 0) {
            addToVillagerInventory(world, v, 'timber', take, addVillageResource);
            gainSkillXp(world, v, 'woodcraft', dt * 1.2);
            advanceKnowledge(v, 'woodcraft', dt * 0.75);
            grantKnowledge(world, dt * 0.65, particles, v);
            if ((v.carriedAmount ?? 0) >= getCarryCap(v) - 0.05 || treeNode.amount <= 0.02) {
              v.decisionCooldown = Math.min(v.decisionCooldown, 0.2);
            }
          }
        } else {
          const nextTree = world.wildNodes.find(
            (n) => n.islandId === v.islandId && n.amount > 0.05 && (n.kind === 'tree' || n.kind === 'branch_pile'),
          );
          if (nextTree) {
            v.targetX = nextTree.x;
            v.targetY = nextTree.y;
            v.state = 'walking';
          } else {
            v.decisionCooldown = 0;
          }
        }
      } else if (v.activeTask === 'quarry') {
        const crag = v.islandId === 'coppercrag' || v.islandId === 'frostpeak';
        const quarryBonus = 1 + getSkillLevel(v, 'stonecraft') * 0.1;
        addVillageResource(world, homeId, 'stone', rate * 1.15 * quarryBonus * dt);
        if (crag || getTechUnlocked(world, 'bronze_smelting')) {
          addVillageResource(world, homeId, 'copper', rate * (crag ? 0.55 : 0.18) * dt);
        }
        if (crag || getTechUnlocked(world, 'iron_statecraft')) {
          addVillageResource(world, homeId, 'iron', rate * (crag ? 0.35 : 0.08) * dt);
        }
        gainSkillXp(world, v, 'stonecraft', dt * 1.1);
        advanceKnowledge(v, 'stonecraft', dt * 0.75);
        grantKnowledge(world, dt * 0.7, particles, v);
      } else if (v.activeTask === 'farm') {
        gainSkillXp(world, v, 'farming', dt * 1.1);
        advanceKnowledge(v, 'foraging', dt * 0.7);
        grantKnowledge(world, dt * 0.55, particles, v);
      } else if (v.activeTask === 'pasture') {
        gainSkillXp(world, v, 'husbandry', dt * 1.1);
        advanceKnowledge(v, 'foraging', dt * 0.55);
        grantKnowledge(world, dt * 0.5, particles, v);
      } else if (v.activeTask === 'bake' && homeRes.grain >= 0.2) {
        const bakeAmt = Math.min(homeRes.grain, 0.22 * dt);
        spendVillageResources(world, homeId, { grain: bakeAmt });
        world.comforts.bread = Math.min(25, world.comforts.bread + bakeAmt * 0.55);
        addVillageResource(world, homeId, 'hearthlight', 0.25 * dt);
        syncCombinedFood(world);
        gainSkillXp(world, v, 'herbalism', dt * 0.7);
        advanceKnowledge(v, 'cooking', dt * 0.9);
        advanceKnowledge(v, 'firecraft', dt * 0.35);
        grantKnowledge(world, dt * 0.5, particles, v);
      } else if (v.activeTask === 'study') {
        v.cognition.awareness = Math.min(100, v.cognition.awareness + dt * 1.8);
        v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);
        advanceKnowledge(v, 'social_customs', dt * 0.8);
        advanceKnowledge(v, 'healing', dt * 0.35);
        grantKnowledge(world, dt * 1.85, particles, v);
        addVillageResource(world, homeId, 'hearthlight', 0.22 * dt);
      } else if (v.activeTask === 'smelt') {
        if (homeRes.copper >= 0.2) {
          const take = Math.min(homeRes.copper, 0.2 * dt);
          spendVillageResources(world, homeId, { copper: take });
          addVillageResource(world, homeId, 'bronze', take * (0.85 + getSkillLevel(v, 'metallurgy') * 0.05));
        }
        gainSkillXp(world, v, 'metallurgy', dt * 1.25);
        advanceKnowledge(v, 'toolmaking', dt * 0.85);
        advanceKnowledge(v, 'firecraft', dt * 0.45);
        grantKnowledge(world, dt * 0.85, particles, v);
      } else if (v.activeTask === 'fish') {
        addVillageResource(world, homeId, 'fish', rate * (0.9 + getSkillLevel(v, 'seamanship') * 0.08) * dt);
        syncCombinedFood(world);
        gainSkillXp(world, v, 'seamanship', dt * 1.1);
        advanceKnowledge(v, 'sailing', dt * 0.8);
        grantKnowledge(world, dt * 0.55, particles, v);
      } else if (v.activeTask === 'explore') {
        const undisc = ISLAND_ORDER.filter((id) => !world.islands[id].discovered);
        const dockBoat = world.boats.find(
          (b) =>
            b.cultureId !== 'mist_mariner' &&
            b.homeIslandId === v.islandId &&
            b.state === 'docked' &&
            (b.kind === 'cargo_merchant' || b.kind === 'war_galley'),
        );
        if (dockBoat && undisc.length > 0 && Math.hypot(v.x - dockBoat.x, v.y - dockBoat.y) < 120) {
          const targetIsle = undisc[0];
          dockBoat.targetIslandId = targetIsle;
          dockBoat.targetX = ISLAND_DEFS[targetIsle].dockSpot.seaX;
          dockBoat.targetY = ISLAND_DEFS[targetIsle].dockSpot.seaY;
          dockBoat.state = 'sailing';
          dockBoat.passengerIds = [v.id];
          dockBoat.tripTimer = 10;
          v.voyageBoatId = dockBoat.id;
          v.state = 'sailing';
          v.thoughtBubble = `Sailing to ${ISLAND_DEFS[targetIsle].name.split(' ')[0]}!`;
          v.thoughtTimer = 3.5;
        }
        gainSkillXp(world, v, 'seamanship', dt * 0.65);
        advanceKnowledge(v, 'sailing', dt * 0.65);
        grantKnowledge(world, dt * 0.7, particles, v);
      }
      if (nearFire) advanceKnowledge(v, 'firecraft', dt * 0.15);
    }

    if (!hasActiveRtsOrder) {
      v.decisionCooldown -= dt;
      if (v.decisionCooldown <= 0) {
        const isResting = v.state === 'resting';
        v.decisionCooldown =
          v.cognition.stage === 'awakening'
            ? 3.0 + Math.random() * 2.0
            : isResting
              ? 2.2 + Math.random() * 1.8
              : 4.5 + Math.random() * 4.0;
        decideVillagerBehavior(world, v);
      }
    }
  }

  // 6. Cat wander across large Cradle meadow with cliff-edge acknowledgement
  if (world.catPauseTimer > 0) {
    world.catPauseTimer -= dt;
  } else {
    const d = Math.hypot(world.catTargetX - world.catX, world.catTargetY - world.catY);
    if (d < 6) {
      world.catPauseTimer = 3 + Math.random() * 5;
      const c = ISLAND_DEFS.cradle;
      world.catTargetX = c.centerX + (Math.random() * 320 - 160);
      world.catTargetY = c.centerY + (Math.random() * 220 - 110);
    } else {
      const step = steerEntity(world, 'cradle', world.catX, world.catY, world.catTargetX, world.catTargetY, 22 * dt);
      world.catX = step.x;
      world.catY = step.y;
      world.catFacing = step.facing;
      if (step.hitEdge || step.hitWaterEdge) {
        world.catPauseTimer = 1.4;
        const c = ISLAND_DEFS.cradle;
        world.catTargetX = c.centerX + (Math.random() * 240 - 120);
        world.catTargetY = c.centerY + (Math.random() * 160 - 80);
      }
    }
  }

  evaluateEra(world);
  evaluateVillageTrajectory(world);

  if (emitVisualParticles) {
    updateParticles(world, dt, particles);
  }
}

function handleNewDayEvents(world: WorldState) {
  world.environment.seasonDay += 1;
  if (world.environment.seasonDay > 5) {
    world.environment.seasonDay = 1;
    const order: SeasonType[] = ['spring', 'summer', 'autumn', 'winter'];
    const nextIdx = (order.indexOf(world.environment.season) + 1) % order.length;
    world.environment.season = order[nextIdx];
    addChronicle(world, `${SEASON_META[world.environment.season].label} arrived across the sky-sea.`, 'festival');
  }

  // Decay rolling daily resource flow tracker smoothly each dawn
  if (world.resourceFlows) {
    for (const id of ISLAND_ORDER) {
      const fl = world.resourceFlows[id];
      if (!fl) continue;
      fl.foodIn = Number((fl.foodIn * 0.35).toFixed(2));
      fl.foodOut = Number((fl.foodOut * 0.35).toFixed(2));
      fl.timberIn = Number((fl.timberIn * 0.35).toFixed(2));
      fl.timberOut = Number((fl.timberOut * 0.35).toFixed(2));
      fl.stoneIn = Number((fl.stoneIn * 0.35).toFixed(2));
      fl.stoneOut = Number((fl.stoneOut * 0.35).toFixed(2));
      fl.oreIn = Number((fl.oreIn * 0.35).toFixed(2));
      fl.oreOut = Number((fl.oreOut * 0.35).toFixed(2));
    }
  }

  // Strict per-island Birth Gating: BOTH beds > pop AND food >= pop*6 + 6!
  if (world.pendingArrivals.length === 0) {
    for (const homeId of getOwnedBuildIslands(world)) {
      const islandFolks = world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === homeId);
      const pop = islandFolks.length;
      const beds = getHousingBedsForIsland(world, homeId);
      const res = getVillageRes(world, homeId);
      if (pop >= beds || pop >= 18 || res.food < pop * 6 + 6) continue;

      const couple = islandFolks.find(
        (v) =>
          v.lifeStage === 'adult' &&
          v.partnerId &&
          v.birthCooldownDays <= 0 &&
          v.mood >= 65 &&
          v.hunger >= 55,
      );
      if (couple && Math.random() < 0.28) {
        const partner = world.villagers.find((p) => p.id === couple.partnerId);
        if (partner) {
          couple.birthCooldownDays = 8;
          partner.birthCooldownDays = 8;
          const names = new Set(world.villagers.map((item) => item.name));
          const baby = generateCandidate('birth', world.environment.dayCount, names, [
            { id: couple.id, name: couple.name, traits: couple.traits },
            { id: partner.id, name: partner.name, traits: partner.traits },
          ]);
          baby.islandId = homeId;
          world.pendingArrivals.push(baby);
          break;
        }
      }
    }
  }

  // Aging, Partnership Formation & Elder Mortality
  for (let i = world.villagers.length - 1; i >= 0; i--) {
    const v = world.villagers[i];
    v.ageDays += 1;
    v.wishFulfilledToday = false;
    v.activeWish = pickRandomWish();
    if (v.birthCooldownDays > 0) v.birthCooldownDays -= 1;

    if (v.lifeStage === 'infant' && v.ageDays >= 3) {
      v.lifeStage = 'child';
      if (Object.keys(v.skills ?? {}).length === 0) {
        v.skills = rollStarterSkills('child', false);
      }
      upsertLineage(world, v);
      addChronicle(world, `${v.name.split(' ')[0]} grew from infancy into a curious child!`, 'birth');
    } else if (v.lifeStage === 'child' && v.ageDays >= 8) {
      v.lifeStage = 'adult';
      upsertLineage(world, v);
      addChronicle(world, `${v.name.split(' ')[0]} came of age as a full adult of ${ISLAND_DEFS[v.homeIslandId ?? v.islandId].name}.`, 'birth');
    } else if (v.lifeStage === 'adult' && v.ageDays >= 30) {
      v.lifeStage = 'elder';
      v.hairColor = '#B9B5AE';
      upsertLineage(world, v);
    } else if (v.lifeStage === 'elder' && v.ageDays >= 46 && Math.random() < 0.22) {
      killVillager(world, v.id, 'old_age', []);
      continue;
    }

    // Organic partner pairing between friendly unrelated single adults in the same village
    if (v.lifeStage === 'adult' && !v.partnerId) {
      const candidate = world.villagers.find(
        (u) =>
          u.id !== v.id &&
          u.lifeStage === 'adult' &&
          !u.partnerId &&
          (u.homeIslandId ?? u.islandId) === (v.homeIslandId ?? v.islandId) &&
          (!v.parentIds || !v.parentIds.includes(u.id)) &&
          (!u.parentIds || !u.parentIds.includes(v.id)) &&
          (v.relationships[u.id] ?? 0) >= 65,
      );
      if (candidate) {
        v.partnerId = candidate.id;
        candidate.partnerId = v.id;
        processDirectSocialShift(world, v, candidate, 14, 'hangout');
        upsertLineage(world, v);
        upsertLineage(world, candidate);
        addChronicle(
          world,
          `${v.name.split(' ')[0]} and ${candidate.name.split(' ')[0]} formed a life bond!`,
          'bond',
          { islandId: v.homeIslandId ?? v.islandId, participantIds: [v.id, candidate.id] },
        );
      }
    }
  }

  // Auto-elect Chief once 3+ adults exist
  if (!world.chiefId && world.villagers.length >= 3) {
    const cand = world.villagers.find((v) => v.lifeStage === 'adult' || v.lifeStage === 'elder');
    if (cand) {
      cand.isChief = true;
      world.chiefId = cand.id;
      addChronicle(world, `${cand.name} was chosen as Island Chief.`, 'chief');
    }
  }
}

function updateParticles(world: WorldState, dt: number, particles: Particle[]) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.phase += dt * 4;
  }

  // Bonfire smoke & sparks
  for (const b of world.buildings) {
    if (b.type === 'bonfire' && b.unlocked && Math.random() < dt * 2.2) {
      spawnParticle(particles, {
        kind: 'smoke',
        x: b.x + (Math.random() * 6 - 3),
        y: b.y - 6,
        vx: 2,
        vy: -12,
        maxLife: 1.5,
        size: 2.2,
        alpha: 0.45,
        phase: Math.random() * 6,
        color: '#D6CEC4',
      });
    }
  }

  // Rain & Snow
  const weather = world.environment.weather;
  if (weather === 'rain' || weather === 'snow') {
    const spawnCount = weather === 'rain' ? 3 : 2;
    for (let s = 0; s < spawnCount; s++) {
      spawnParticle(particles, {
        kind: weather === 'rain' ? 'rain' : 'snow',
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        vx: weather === 'rain' ? -15 : (Math.random() - 0.5) * 14,
        vy: weather === 'rain' ? 140 : 32,
        maxLife: weather === 'rain' ? 0.9 : 2.1,
        size: weather === 'rain' ? 1 : 1.8,
        alpha: 0.65,
        phase: Math.random() * 6,
        color: weather === 'rain' ? '#93C5FD' : '#F8FAFC',
      });
    }
  }
}

// ============================================================================
// GOD SUGGESTIONS, COMMENTS & ARRIVAL DELIBERATION
// ============================================================================

function evaluateTravelerDecision(
  world: WorldState,
  candidate: ArrivalCandidate,
  greeter: VillagerEntity | null,
): 'recommend_welcome' | 'recommend_decline' {
  let score = 0;
  if (candidate.attitude === 'warm' || candidate.attitude === 'humble') score += 2;
  else if (candidate.attitude === 'boisterous') score += 1;
  else if (candidate.attitude === 'restless') score -= 2;
  else score -= 1;

  for (const tid of candidate.traits) {
    const t = TRAITS[tid];
    if (t?.polarity === 'positive') score += 1;
    else if (t?.polarity === 'negative') score -= 1;
  }

  if (greeter?.traits.includes('cautious_homebody')) score -= 1;
  if (greeter?.traits.includes('warmhearted')) score += 1;
  if (candidate.godSuggestion === 'welcome') score += 2;
  if (candidate.godSuggestion === 'decline') score -= 2;

  const verdict = score >= 0 ? 'recommend_welcome' : 'recommend_decline';
  candidate.decisionVerdict = verdict;
  candidate.decisionReason =
    verdict === 'recommend_welcome'
      ? `${greeter ? greeter.name.split(' ')[0] : 'The clan'} welcomed ${candidate.name.split(' ')[0]}'s spirit.`
      : `${greeter ? greeter.name.split(' ')[0] : 'Scouts'} stayed wary of ${candidate.name.split(' ')[0]}'s manner.`;
  return verdict;
}

function resolveArrival(world: WorldState, arrivalId: string, accept: boolean, particles: Particle[]) {
  const idx = world.pendingArrivals.findIndex((a) => a.id === arrivalId);
  if (idx === -1) return;
  const cand = world.pendingArrivals[idx];
  world.pendingArrivals.splice(idx, 1);

  const homeId: IslandId = cand.islandId ?? world.localHomeIslandId ?? 'cradle';
  const homeDef = ISLAND_DEFS[homeId];
  const migrantBoat = cand.boatId ? world.boats.find((b) => b.id === cand.boatId) : undefined;

  if (!accept) {
    cand.boatPhase = 'departing';
    if (migrantBoat) {
      sendMigrantBoatAway(migrantBoat, cand.name.split(' ')[0]);
    }
    emitWorldEvent(world, {
      category: 'migration',
      significance: 'notable',
      summary: `${cand.name} re-boarded their skiff and sailed away from ${homeDef.name}.`,
      islandId: homeId,
      participantIds: cand.greeterId ? [cand.greeterId] : [],
    });
    addChronicle(world, `${cand.name} parted peacefully by skiff from ${homeDef.name}.`, 'arrival', {
      islandId: homeId,
      participantIds: cand.greeterId ? [cand.greeterId] : [],
    });
    return;
  }

  const isBirth = cand.kind === 'birth';
  const unitStats = rollUnitStats(cand.traits, false);
  const unitSkills = isBirth ? {} : rollStarterSkills(cand.lifeStage, false);
  const hpMod = cand.traits.reduce((sum, tid) => sum + (TRAITS[tid]?.hpMaxMod ?? 0), 0);
  const maxHp = Math.max(70, 100 + (unitStats.endurance - 8) * 4 + hpMod);
  const landing = isBirth
    ? { x: homeDef.centerX + (Math.random() * 48 - 24), y: homeDef.centerY + (Math.random() * 36 - 18) }
    : getMigrantLandingPoint(homeId);
  const sx = landing.x;
  const sy = landing.y;
  const villager: VillagerEntity = {
    id: `vil_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: cand.name,
    bioDescription: cand.bioDescription,
    cultureId: world.islands[homeId]?.owningCultureId ?? 'hearthfolk',
    islandId: homeId,
    homeIslandId: homeId,
    ownerPlayerId: world.islandOwners?.[homeId] ?? null,
    visitStatus: 'home',
    cloakColor: cand.cloakColor,
    hairColor: cand.hairColor,
    skinTone: cand.skinTone,
    hairStyle: cand.hairStyle,
    lifeStage: cand.lifeStage,
    ageDays: isBirth ? 0 : 16,
    isChief: false,
    traits: cand.traits,
    stats: unitStats,
    skills: unitSkills,
    skillXp: {},
    rtsOrder: null,
    drafted: false,
    teachCooldown: 0,
    partnerId: null,
    parentIds: cand.parentIds,
    childrenIds: [],
    homeBuildingId: null,
    hp: maxHp,
    maxHp,
    warmth: 88,
    mood: 84,
    energy: 90,
    hunger: 82,
    affectionXp: 15,
    affectionLevel: 1,
    gearTier: getTechUnlocked(world, 'woven_shelter') ? 1 : 0,
    weaponType: 'none',
    curiosity: cand.traits.includes('curious_scout') ? 0.85 : 0.5,
    bravery: cand.traits.includes('brave_hunter') ? 0.8 : 0.5,
    voyageBoatId: null,
    killCount: 0,
    cognition:
      isBirth
        ? { stage: 'awakening', awareness: 0, observedConcepts: [], socialCount: 0, focusObject: 'embers' }
        : {
            stage: 'awakening',
            awareness: 12,
            observedConcepts: [],
            socialCount: 0,
            focusObject: 'berry_bush',
          },
    favoriteComfort: cand.favoriteComfort,
    activeWish: pickRandomWish(),
    wishFulfilledToday: false,
    currentDialogue: isBirth ? 'Soft curious blinking beside the warm embers.' : `Let me explore ${homeDef.name} and meet your people first!`,
    lastMemory: isBirth ? 'Born beside the warm hearth.' : `Disembarked onto ${homeDef.name} pier.`,
    relationships: {},
    hangOutTargetId: null,
    socialCooldown: 12,
    pairChatCooldowns: {},
    suggestedTask: null,
    activeTask: 'explore',
    state: isBirth ? 'sleeping' : 'exploring',
    autonomyReason: isBirth ? 'Taking in warmth and light like a newborn.' : `Walking up from ${homeDef.name} pier to meet villagers.`,
    thoughtBubble: isBirth ? 'Ooh...' : 'Landfall!',
    thoughtTimer: 3.5,
    x: sx,
    y: sy,
    targetX: homeDef.centerX,
    targetY: homeDef.centerY,
    facing: 1,
    animPhase: 0,
    bounceScale: 1,
    decisionCooldown: 2,
    birthCooldownDays: 0,
    attackCooldown: 0,
    edgeAckCooldown: 0,
    stuckState: { lastX: sx, lastY: sy, timer: 0, detourSign: 1 },
    personality: buildNpcPersonality(
      `vil_arr_${cand.id}`,
      cand.traits,
      cand.traits.includes('curious_scout') ? 0.85 : 0.5,
      cand.traits.includes('brave_hunter') ? 0.8 : 0.5,
      false,
    ),
    knowledge: createKnowledgeProfile(isBirth ? 'infant' : 'awakening'),
    memories: [
      {
        id: `mem_arr_${cand.id}`,
        day: world.environment.dayCount,
        timeOfDay: world.environment.timeOfDay,
        kind: isBirth ? 'social' : 'discovery',
        summary: isBirth ? `Born beside the warm hearth on ${homeDef.name}.` : `Disembarked from skiff at ${homeDef.name} shore.`,
        actorIds: cand.parentIds ? [...cand.parentIds] : [],
        importance: 8,
        sentiment: 'positive',
      },
    ],
    carriedResource: null,
    carriedAmount: 0,
    carryCapacity: 6,
    reputation: 10,
    banished: false,
  };
  world.villagers.push(villager);

  if (migrantBoat) {
    sendMigrantBoatAway(migrantBoat);
  }
  if (!isBirth && cand.greeterId) {
    const greeter = world.villagers.find((v) => v.id === cand.greeterId);
    if (greeter) {
      processSocialEncounter(world, villager, greeter, (target, concept, peerFirst) => {
        learnConcept(world, target, concept, particles, peerFirst);
      });
    }
  }
  if (isBirth && cand.parentIds) {
    for (const pid of cand.parentIds) {
      const par = world.villagers.find((u) => u.id === pid);
      if (par) {
        if (!par.childrenIds.includes(villager.id)) par.childrenIds.push(villager.id);
        upsertLineage(world, par);
      } else if (world.lineage?.[pid]) {
        if (!world.lineage[pid].childrenIds.includes(villager.id)) {
          world.lineage[pid].childrenIds.push(villager.id);
        }
      }
    }
  }
  upsertLineage(world, villager);
  addChronicle(
    world,
    cand.kind === 'birth' ? `Baby ${cand.name} was born on ${homeDef.name}!` : `${cand.name} disembarked at ${homeDef.name} pier and joined the village!`,
    cand.kind === 'birth' ? 'birth' : 'arrival',
    {
      islandId: homeId,
      participantIds: [villager.id, ...(cand.greeterId ? [cand.greeterId] : [])],
    },
  );
  spawnParticle(particles, {
    kind: 'heart',
    x: villager.x,
    y: villager.y - 12,
    vx: 0,
    vy: -12,
    maxLife: 1.2,
    size: 2.5,
    alpha: 1,
    phase: 0,
    color: '#F43F5E',
  });
}

export function suggestGateDecision(
  world: WorldState,
  arrivalId: string,
  lean: 'welcome' | 'decline' | 'neutral',
): { ok: boolean; message: string } {
  const arr = world.pendingArrivals.find((a) => a.id === arrivalId);
  if (!arr) return { ok: false, message: 'No traveler waiting.' };
  arr.godSuggestion = lean;
  const greeter = arr.greeterId ? world.villagers.find((v) => v.id === arr.greeterId) ?? null : null;
  if (arr.decisionVerdict !== 'talking') evaluateTravelerDecision(world, arr, greeter);
  return {
    ok: true,
    message: lean === 'neutral' ? 'Withdrew divine suggestion.' : `Whispered ${lean} suggestion to villagers.`,
  };
}

export function letVillagerDecideArrival(
  world: WorldState,
  arrivalId: string,
  particles: Particle[],
): { ok: boolean; message: string } {
  const arr = world.pendingArrivals.find((a) => a.id === arrivalId);
  if (!arr) return { ok: false, message: 'No arrival waiting.' };
  const homeId: IslandId = arr.islandId ?? world.localHomeIslandId ?? 'cradle';
  const pop = world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === homeId).length;
  const beds = getHousingBedsForIsland(world, homeId);
  if (arr.kind === 'birth') {
    resolveArrival(world, arrivalId, pop < beds, particles);
    return { ok: true, message: pop < beds ? `Celebrated ${arr.name}'s birth!` : `Insufficient shelter beds on ${ISLAND_DEFS[homeId].name}.` };
  }
  const greeter = arr.greeterId ? world.villagers.find((v) => v.id === arr.greeterId) ?? null : null;
  const verdict = evaluateTravelerDecision(world, arr, greeter);
  const foodOk = getVillageRes(world, homeId).food >= pop * 6 + 6;
  const accept = verdict === 'recommend_welcome' && pop < beds && foodOk;
  resolveArrival(world, arrivalId, accept, particles);
  return {
    ok: true,
    message: accept ? `Villagers welcomed ${arr.name}!` : `Villagers declined ${arr.name} (housing/food cap or caution).`,
  };
}

export function chatWithVillager(world: WorldState, villagerId: string, particles: Particle[]): string | null {
  const v = [...world.villagers, ...world.clanVillagers].find((item) => item.id === villagerId);
  if (!v) return null;
  const season = SEASON_META[world.environment.season].label.toLowerCase();
  const lines = [
    `The ${season} wind carries salt and pine across ${ISLAND_DEFS[v.islandId].name}.`,
    `Our knowledge grows around the embers—${v.autonomyReason.toLowerCase()}`,
    v.warmth < 45 ? 'Brr, I need a wool cloak or bonfire soon.' : 'The sky-sea looks calm from the cliff rim.',
  ];
  v.currentDialogue = lines[Math.floor(Math.random() * lines.length)];
  v.mood = Math.min(100, v.mood + 5);
  v.affectionXp += 4;
  v.affectionLevel = Math.min(5, 1 + Math.floor(v.affectionXp / 25));
  v.cognition.socialCount += 1;
  spawnParticle(particles, {
    kind: 'sparkle',
    x: v.x,
    y: v.y - 12,
    vx: 0,
    vy: -10,
    maxLife: 1,
    size: 2,
    alpha: 0.9,
    phase: 0,
    color: '#FDE047',
  });
  return v.currentDialogue;
}

export function speakGodComment(
  world: WorldState,
  villagerId: string,
  kind: GodCommentKind,
  particles: Particle[],
): { ok: boolean; note: string } {
  const v = [...world.villagers, ...world.clanVillagers].find((item) => item.id === villagerId);
  if (!v) return { ok: false, note: 'No inhabitant selected.' };
  v.bounceScale = 1.18;

  if (kind === 'praise') {
    v.mood = Math.min(100, v.mood + 7);
    v.thoughtBubble = 'Kind sky!';
    v.thoughtTimer = 3;
    spawnParticle(particles, {
      kind: 'heart',
      x: v.x,
      y: v.y - 12,
      vx: 0,
      vy: -12,
      maxLife: 1.1,
      size: 2.2,
      alpha: 1,
      phase: 0,
      color: '#F43F5E',
    });
    return { ok: true, note: `Praised ${v.name.split(' ')[0]} gently.` };
  }
  if (kind === 'encourage_explore') {
    v.curiosity = Math.min(1, v.curiosity + 0.14);
    v.cognition.awareness = Math.min(100, v.cognition.awareness + 4);
    v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);
    v.thoughtBubble = 'Let me look!';
    v.thoughtTimer = 3;
    assignCognitiveExplorationTarget(world, v);
    v.decisionCooldown = 4.5;
    return { ok: true, note: `Nudged ${v.name.split(' ')[0]}'s curiosity to explore nearby wonders.` };
  }
  if (kind === 'remind_eat') {
    v.thoughtBubble = 'Better eat!';
    v.thoughtTimer = 2.8;
    v.decisionCooldown = 0.4;
    return { ok: true, note: `Reminded ${v.name.split(' ')[0]} to check food stores.` };
  }
  v.thoughtBubble = 'Rest by fire!';
  v.thoughtTimer = 2.8;
  v.decisionCooldown = 0.4;
  return { ok: true, note: `Suggested ${v.name.split(' ')[0]} rest beside the hearth.` };
}

export function suggestVillagerRole(
  world: WorldState,
  villagerId: string,
  task: TaskType | null,
): { accepted: boolean; message: string } {
  const v = [...world.villagers, ...world.clanVillagers].find((item) => item.id === villagerId);
  if (!v) return { accepted: false, message: 'No villager selected.' };

  // Sovereign Sandbox & Shared Siege: immediate tactical control
  if (world.gameMode === 'sovereign_sandbox' || world.gameMode === 'shared_siege') {
    if (task) {
      v.cognition.awareness = Math.max(v.cognition.awareness, 55);
      v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);
      v.cognition.socialCount = Math.max(v.cognition.socialCount, 2);
      v.rtsOrder = null;
      v.suggestedTask = task;
      v.activeTask = task;
      assignTargetForTask(world, v, task);
      v.state = task === 'hunt' ? 'hunting' : task === 'explore' ? 'exploring' : 'walking';
      v.autonomyReason = `${TASK_BY_ID[task].verb} (RTS Command).`;
      v.thoughtBubble = `${TASK_BY_ID[task].label}!`;
      v.thoughtTimer = 2.6;
      v.decisionCooldown = 8;
      return { accepted: true, message: `Commanded ${v.name.split(' ')[0]} to ${TASK_BY_ID[task].label}.` };
    }
    v.suggestedTask = null;
    v.rtsOrder = null;
    v.decisionCooldown = 0.5;
    return { accepted: true, message: `${v.name.split(' ')[0]} freed to follow autonomy.` };
  }

  if (v.isNativeClan) {
    return { accepted: false, message: `${v.name.split(' ')[0]} follows their native clan elders.` };
  }
  if (task && task !== 'explore' && !canVillagerWork(world, v)) {
    return {
      accepted: false,
      message: `${v.name.split(' ')[0]} needs ${Math.max(0, 2 - v.cognition.observedConcepts.length)} more wonders & ${Math.max(0, 1 - v.cognition.socialCount)} more social chats first!`,
    };
  }
  if (task && !getTaskAvailable(world, task, v.homeIslandId ?? v.islandId)) {
    return { accepted: false, message: 'Requires an unlocked discovery & structure in this village first.' };
  }
  v.suggestedTask = task;
  v.decisionCooldown = 0.5;
  return {
    accepted: true,
    message: task
      ? `Suggested ${TASK_BY_ID[task].label} to ${v.name.split(' ')[0]}.`
      : `${v.name.split(' ')[0]} will follow their own judgment.`,
  };
}

export function sendVillagerToHangOut(world: WorldState, villagerId: string, targetId: string): string {
  const all = [...world.villagers, ...world.clanVillagers];
  const v = all.find((i) => i.id === villagerId);
  const t = all.find((i) => i.id === targetId);
  if (!v || !t) return 'Neighbor unavailable.';
  v.targetX = t.x;
  v.targetY = t.y;
  v.state = 'socializing';
  v.hangOutTargetId = t.id;
  processDirectSocialShift(world, v, t, 2, 'hangout');
  return `Suggested ${v.name.split(' ')[0]} visit ${t.name.split(' ')[0]}.`;
}

export function suggestChief(world: WorldState, villagerId: string): { ok: boolean; reason: string } {
  const v = world.villagers.find((i) => i.id === villagerId);
  if (!v || (v.lifeStage !== 'adult' && v.lifeStage !== 'elder')) {
    return { ok: false, reason: 'Only adults or elders can bear the Chief sash.' };
  }
  for (const item of world.villagers) item.isChief = item.id === v.id;
  world.chiefId = v.id;
  addChronicle(world, `${v.name} became Chief of the archipelago.`, 'chief');
  return { ok: true, reason: `${v.name} accepted the Chief sash.` };
}

export function setChiefFocus(world: WorldState, focus: ChiefFocus) {
  world.chiefFocus = focus;
}

export function suggestBuildingSpot(
  world: WorldState,
  buildingType: BuildingType,
  islandId: IslandId,
  x: number,
  y: number,
  cropType?: CropType,
  livestockKind?: LivestockKind,
): { ok: boolean; message: string } {
  const isl = ISLAND_DEFS[islandId];
  const bp = BUILDING_BLUEPRINTS[buildingType];

  if (!isPointInsideIsland(isl, x, y, 22)) {
    return { ok: false, message: 'Click inside the island plateau to place structure.' };
  }

  // Sovereign Sandbox: instant construction for free!
  if (world.gameMode === 'sovereign_sandbox') {
    const b = createBuildingInstance(world, buildingType, islandId, Math.round(x), Math.round(y), cropType ?? 'turnip', livestockKind ?? 'sheep');
    b.unlocked = true;
    b.constructionStage = 'complete';
    b.pausedForMaterials = false;
    b.level = 1;
    world.buildings.push(b);
    world.islands[islandId].discovered = true;
    world.islands[islandId].settledDay ??= world.environment.dayCount;
    if (buildingType === 'pasture') spawnPastureLivestock(world, b);
    if (buildingType === 'dock') {
      world.islands[islandId].dockBuilt = true;
      spawnDockBoat(world, b, 'fishing_skiff');
    }
    addChronicle(world, `Sovereign decreed ${b.name} upon ${isl.name}.`, 'build');
    return { ok: true, message: `Placed ${b.name} instantaneously on ${isl.name}!` };
  }

  // Shared Siege: pay resource cost to stake building directly onto island for builders to raise
  if (world.gameMode === 'shared_siege') {
    if (!getTechUnlocked(world, bp.requiredTechId)) {
      return { ok: false, message: `Requires ${TECH_BY_ID[bp.requiredTechId]?.name ?? 'technology'} first.` };
    }
    const cost = getBuildCost(bp);
    const siegeRes = getVillageRes(world, 'cradle');
    if (!hasResourcesFor(siegeRes, cost)) {
      return { ok: false, message: `Need more materials to raise ${bp.name}.` };
    }
    spendVillageResources(world, 'cradle', cost);
    const b = createBuildingInstance(world, buildingType, islandId, Math.round(x), Math.round(y), cropType ?? 'turnip', livestockKind ?? 'sheep');
    b.deliveredMaterials = { ...cost };
    world.buildings.push(b);
    addChronicle(world, `Defenders staked ${b.name} on ${isl.name}.`, 'build');
    return { ok: true, message: `Staked ${b.name} on ${isl.name} — builders moving to construct!` };
  }

  if (!world.islands[islandId]?.discovered) {
    return { ok: false, message: 'Villagers have not explored that island yet (send scouts or build a sky-bridge).' };
  }
  if (!getTechUnlocked(world, bp.requiredTechId)) {
    return {
      ok: false,
      message: `Suggested ${bp.name} stake placed — awaits ${TECH_BY_ID[bp.requiredTechId]?.name ?? 'discovery'}.`,
    };
  }
  const sug: PlacedSuggestion = {
    id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    buildingType,
    islandId,
    x: Math.round(x),
    y: Math.round(y),
    cropType,
    livestockKind,
    createdAtDay: world.environment.dayCount,
    acceptedByVillagers: true,
  };
  world.placedSuggestions.push(sug);
  if (world.placedSuggestions.length > 6) world.placedSuggestions.shift();
  return {
    ok: true,
    message: `Suggested ${bp.name} on ${isl.name}. Builders will start once materials allow.`,
  };
}

export function suggestBuildingProject(world: WorldState, buildingId: string): { ok: boolean; message: string } {
  const b = world.buildings.find((item) => item.id === buildingId);
  if (!b) return { ok: false, message: 'Structure not found.' };
  if (b.level >= b.maxLevel) return { ok: false, message: `${b.name} is already at highest tier.` };
  if (world.gameMode === 'sovereign_sandbox') {
    b.unlocked = true;
    b.level = Math.min(b.maxLevel, b.level + 1);
    b.disrepair = 0;
    b.hp = b.maxHp;
    addChronicle(world, `Sovereign elevated ${b.name} to Lv.${b.level}.`, 'build');
    return { ok: true, message: `Upgraded ${b.name} to Lv.${b.level}!` };
  }
  world.suggestedBuildingId = b.id;
  return { ok: true, message: `Suggested upgrading ${b.name} when materials allow.` };
}

export function suggestActiveTech(world: WorldState, techId: string): { ok: boolean; message: string } {
  const frontier = getAvailableFrontierTechs(world.unlockedTechIds);
  const found = frontier.find((t) => t.id === techId);
  if (!found) return { ok: false, message: 'Wait until prerequisites are discovered.' };
  world.activeTechId = found.id;
  return { ok: true, message: `Suggested studying ${found.name} around the bonfire & library.` };
}

export function suggestDiplomacyAction(
  world: WorldState,
  cultureId: CultureId,
  action: 'envoy' | 'gift',
  sourceIslandId?: IslandId,
): { ok: boolean; message: string } {
  const dip = world.diplomacy[cultureId];
  if (!dip) return { ok: false, message: 'Unknown culture.' };
  if (cultureId !== 'mist_mariner' && world.gameMode !== 'sovereign_sandbox') {
    return { ok: false, message: 'Already peaceful allies.' };
  }
  const srcIsle = sourceIslandId ?? world.localHomeIslandId ?? 'cradle';
  const srcRes = getVillageRes(world, srcIsle);
  if (action === 'gift') {
    if (world.gameMode !== 'sovereign_sandbox') {
      if (srcRes.timber < 10 && srcRes.grain < 6) {
        return { ok: false, message: 'Need at least 10 Timber or 6 Grain to offer a trade gift.' };
      }
      if (srcRes.timber >= 10) spendVillageResources(world, srcIsle, { timber: 10 });
      else spendVillageResources(world, srcIsle, { grain: 6 });
      syncCombinedFood(world);
    }
    dip.trust = Math.min(100, dip.trust + 18);
    dip.lastEnvoyDay = world.environment.dayCount;
    addChronicle(world, `Sent a peace gift across the sky-sea to the ${CULTURES[cultureId].name} (+Trust).`, 'voyage');
    return { ok: true, message: `Dispatched peace gift to ${CULTURES[cultureId].name}.` };
  }
  if (world.gameMode !== 'sovereign_sandbox' && world.environment.dayCount - dip.lastEnvoyDay < 1) {
    return { ok: false, message: 'An envoy already parleyed today.' };
  }
  dip.lastEnvoyDay = world.environment.dayCount;
  dip.trust = Math.min(100, dip.trust + 11);
  addChronicle(world, `Island envoy met ${CULTURES[cultureId].name} elders for parley (+Trust).`, 'voyage');
  return { ok: true, message: `Envoy parley improved ${CULTURES[cultureId].name} relations.` };
}

function getActorHomeIsland(world: WorldState, actorPlayerId?: string): IslandId {
  if (actorPlayerId) {
    const found = PLAYER_VILLAGE_ISLANDS.find((id) => world.islandOwners?.[id] === actorPlayerId);
    if (found) return found;
  }
  return world.localHomeIslandId ?? 'cradle';
}

export function applyWorldCommand(
  world: WorldState,
  cmd: WorldCommand,
  particles: Particle[],
  actorPlayerId?: string,
): { ok: boolean; message: string } {
  const actorHome = getActorHomeIsland(world, actorPlayerId);

  switch (cmd.kind) {
    case 'set_speed':
      world.settings.simSpeed = cmd.speed;
      return { ok: true, message: cmd.speed === 0 ? 'Simulation paused.' : `Simulation speed ${cmd.speed}x.` };
    case 'assign_task': {
      const target = [...world.villagers, ...world.clanVillagers].find((i) => i.id === cmd.villagerId);
      if (!target) return { ok: false, message: 'Inhabitant not found.' };
      if (!canControlVillager(world, target, actorPlayerId)) {
        return { ok: false, message: 'You only command villagers belonging to your own village.' };
      }
      const r = suggestVillagerRole(world, cmd.villagerId, cmd.task);
      return { ok: r.accepted, message: r.message };
    }
    case 'move_villager': {
      const all = [...world.villagers, ...world.clanVillagers];
      const v = all.find((i) => i.id === cmd.villagerId);
      if (!v) return { ok: false, message: 'Inhabitant not found.' };
      if (!canControlVillager(world, v, actorPlayerId)) {
        return { ok: false, message: 'Cannot order inhabitants of another village.' };
      }
      const isl = ISLAND_DEFS[cmd.islandId];
      if (!isPointInsideIsland(isl, cmd.x, cmd.y, 12)) {
        return { ok: false, message: 'Click inside an island plateau to move.' };
      }
      if (v.islandId !== cmd.islandId && world.gameMode === 'sovereign_sandbox') {
        v.islandId = cmd.islandId;
        v.x = cmd.x;
        v.y = cmd.y;
      } else {
        const reach = checkTargetReachability(world, v.islandId, v.x, v.y, cmd.x, cmd.y, ARCHIPELAGO_LANDMARKS);
        if (!reach.reachable) {
          return { ok: false, message: reach.reason ?? 'Destination unreachable across deep water or cliffs.' };
        }
      }
      v.targetX = cmd.x;
      v.targetY = cmd.y;
      if (v.stuckState) {
        v.stuckState.waypoints = undefined;
        v.stuckState.navBlockedReason = null;
      }
      v.state = 'walking';
      v.thoughtBubble = 'On my way!';
      v.thoughtTimer = 2.4;
      v.decisionCooldown = 12;
      return { ok: true, message: `Moved ${v.name.split(' ')[0]} across ${isl.name}.` };
    }
    case 'god_comment': {
      const r = speakGodComment(world, cmd.villagerId, cmd.comment, particles);
      return { ok: r.ok, message: r.note };
    }
    case 'chat_villager': {
      const line = chatWithVillager(world, cmd.villagerId, particles);
      return line ? { ok: true, message: line } : { ok: false, message: 'Inhabitant not found.' };
    }
    case 'hang_out': {
      const v = world.villagers.find((i) => i.id === cmd.villagerId);
      if (v && !canControlVillager(world, v, actorPlayerId)) {
        return { ok: false, message: 'Cannot order another village’s inhabitants.' };
      }
      const msg = sendVillagerToHangOut(world, cmd.villagerId, cmd.targetId);
      return { ok: true, message: msg };
    }
    case 'set_chief': {
      const v = world.villagers.find((i) => i.id === cmd.villagerId);
      if (!v || !canControlVillager(world, v, actorPlayerId)) {
        return { ok: false, message: 'Select an adult in your own village as Chief.' };
      }
      const r = suggestChief(world, cmd.villagerId);
      return { ok: r.ok, message: r.reason };
    }
    case 'set_chief_focus':
      setChiefFocus(world, cmd.focus);
      return { ok: true, message: `Chief Focus set to ${cmd.focus}.` };
    case 'place_building':
      if (!canControlIsland(world, cmd.islandId, actorPlayerId)) {
        return { ok: false, message: `You only build within your own village (${ISLAND_DEFS[actorHome].name}).` };
      }
      return suggestBuildingSpot(world, cmd.buildingType, cmd.islandId, cmd.x, cmd.y, cmd.cropType, cmd.livestockKind);
    case 'upgrade_building': {
      const b = world.buildings.find((item) => item.id === cmd.buildingId);
      if (!b) return { ok: false, message: 'Structure not found.' };
      if (!canControlIsland(world, b.islandId, actorPlayerId)) {
        return { ok: false, message: 'Cannot upgrade structures in another village.' };
      }
      return suggestBuildingProject(world, cmd.buildingId);
    }
    case 'select_tech':
      return suggestActiveTech(world, cmd.techId);
    case 'diplomacy': {
      if (cmd.action === 'trust_delta') {
        const dip = world.diplomacy[cmd.cultureId];
        if (!dip) return { ok: false, message: 'Culture not found.' };
        dip.trust = Math.max(0, Math.min(100, dip.trust + (cmd.delta ?? 0)));
        if (dip.trust >= 65) dip.status = 'peaceful';
        else if (dip.trust >= 34) dip.status = 'wary';
        else if (dip.trust >= 16) dip.status = 'tense';
        else dip.status = 'war';
        return { ok: true, message: `${CULTURES[cmd.cultureId].name} trust adjusted to ${dip.trust}% (${dip.status}).` };
      }
      return suggestDiplomacyAction(world, cmd.cultureId, cmd.action, actorHome);
    }
    case 'set_village_policy': {
      if (!canControlIsland(world, cmd.islandId, actorPlayerId)) {
        return { ok: false, message: 'You can only set policies for your own village.' };
      }
      if (!world.villagePolicies) world.villagePolicies = {} as Record<IslandId, VillagePolicy>;
      const cur = world.villagePolicies[cmd.islandId] ?? { rationMode: 'normal', borderPolicy: 'parley' };
      world.villagePolicies[cmd.islandId] = {
        rationMode: cmd.rationMode ?? cur.rationMode,
        borderPolicy: cmd.borderPolicy ?? cur.borderPolicy,
      };
      return {
        ok: true,
        message: `${ISLAND_DEFS[cmd.islandId].name} policy: ${world.villagePolicies[cmd.islandId].rationMode} rations, ${world.villagePolicies[cmd.islandId].borderPolicy.replace('_', ' ')} borders.`,
      };
    }
    case 'send_caravan': {
      if (!canControlIsland(world, cmd.fromIslandId, actorPlayerId)) {
        return { ok: false, message: 'You can only dispatch caravans from your own village.' };
      }
      if (cmd.fromIslandId === cmd.toIslandId) {
        return { ok: false, message: 'Choose a different destination island.' };
      }
      const amt = Math.max(1, Math.round(cmd.amount));
      const srcRes = getVillageRes(world, cmd.fromIslandId);
      if ((srcRes[cmd.resource] ?? 0) < amt) {
        return { ok: false, message: `Insufficient ${cmd.resource} in ${ISLAND_DEFS[cmd.fromIslandId].name}.` };
      }
      spendVillageResources(world, cmd.fromIslandId, { [cmd.resource]: amt });
      addVillageResource(world, cmd.toIslandId, cmd.resource, amt);
      const destCulture = world.islands[cmd.toIslandId]?.owningCultureId ?? ISLAND_DEFS[cmd.toIslandId].defaultCultureId;
      if (world.diplomacy?.[destCulture]) {
        world.diplomacy[destCulture].trust = Math.min(100, world.diplomacy[destCulture].trust + 8);
      }
      addChronicle(
        world,
        `Supply caravan delivered ${amt} ${cmd.resource} from ${ISLAND_DEFS[cmd.fromIslandId].name} to ${ISLAND_DEFS[cmd.toIslandId].name}.`,
        'voyage',
      );
      return {
        ok: true,
        message: `Delivered ${amt} ${cmd.resource} to ${ISLAND_DEFS[cmd.toIslandId].name}!`,
      };
    }
    case 'resolve_arrival': {
      if (typeof cmd.accept === 'boolean') {
        resolveArrival(world, cmd.arrivalId, cmd.accept, particles);
        return { ok: true, message: cmd.accept ? 'Welcomed arrival!' : 'Declined traveler.' };
      }
      return letVillagerDecideArrival(world, cmd.arrivalId, particles);
    }
    case 'suggest_gate':
      return suggestGateDecision(world, cmd.arrivalId, cmd.lean);
    case 'sovereign_weather':
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
      world.environment.weather = cmd.weather;
      world.environment.weatherMode = 'manual';
      return { ok: true, message: `Skies shifted to ${cmd.weather}.` };
    case 'sovereign_time':
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
      world.environment.timeOfDay = Math.max(0, Math.min(0.99, cmd.timeOfDay));
      return { ok: true, message: 'Set sky sun & moon phase.' };
    case 'sovereign_season':
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
      world.environment.season = cmd.season;
      return { ok: true, message: `Season turned to ${SEASON_META[cmd.season].label}.` };
    case 'sovereign_festival':
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
      world.environment.festivalActive = !world.environment.festivalActive;
      for (const v of world.villagers) {
        if (canControlVillager(world, v, actorPlayerId)) v.mood = Math.min(100, v.mood + 18);
      }
      addChronicle(world, world.environment.festivalActive ? 'Lantern Festival lit across the archipelago!' : 'Lantern Festival drew softly to a close.', 'festival');
      return { ok: true, message: world.environment.festivalActive ? 'Festival ignited!' : 'Festival ended.' };
    case 'sovereign_grant_resources':
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
      addVillageResource(world, actorHome, 'berries', 40);
      addVillageResource(world, actorHome, 'grain', 40);
      addVillageResource(world, actorHome, 'timber', 60);
      addVillageResource(world, actorHome, 'stone', 50);
      addVillageResource(world, actorHome, 'copper', 25);
      addVillageResource(world, actorHome, 'bronze', 20);
      addVillageResource(world, actorHome, 'iron', 20);
      addVillageResource(world, actorHome, 'wool', 25);
      addVillageResource(world, actorHome, 'hearthlight', 30);
      syncCombinedFood(world);
      return { ok: true, message: `Granted bounty to ${ISLAND_DEFS[actorHome].name} (+60 Timber, +50 Stone, Food & Ores).` };
    case 'sovereign_spawn_villager': {
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
      if (!canControlIsland(world, cmd.islandId, actorPlayerId)) {
        return { ok: false, message: `You can only summon villagers into your own village (${ISLAND_DEFS[actorHome].name}).` };
      }
      const names = new Set(world.villagers.map((v) => v.name));
      const cand = generateCandidate('traveler', world.environment.dayCount, names);
      const isl = ISLAND_DEFS[cmd.islandId];
      const nv = makeFounder(
        `vil_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        cand.name,
        cand.cloakColor,
        cand.hairColor,
        cand.skinTone,
        cand.hairStyle,
        cand.traits,
        0,
        0,
      );
      nv.islandId = cmd.islandId;
      nv.homeIslandId = cmd.islandId;
      nv.ownerPlayerId = world.islandOwners?.[cmd.islandId] ?? actorPlayerId ?? null;
      nv.cultureId = world.islands[cmd.islandId]?.owningCultureId ?? 'hearthfolk';
      nv.x = isl.centerX + (Math.random() * 60 - 30);
      nv.y = isl.centerY + (Math.random() * 44 - 22);
      nv.targetX = isl.centerX;
      nv.targetY = isl.centerY;
      nv.cognition = { stage: 'reasoning', awareness: 65, observedConcepts: ['berry_bush', 'spring', 'embers'], socialCount: 2, focusObject: null };
      nv.stuckState = { lastX: nv.x, lastY: nv.y, timer: 0, detourSign: 1 };
      world.villagers.push(nv);
      upsertLineage(world, nv);
      addChronicle(world, `Sovereign summoned ${nv.name} onto ${isl.name}.`, 'arrival');
      return { ok: true, message: `Summoned ${nv.name} onto ${isl.name}.` };
    }
    case 'sovereign_build_bridge': {
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
      const br = world.bridges.find((b) => b.id === cmd.bridgeId);
      if (!br) return { ok: false, message: 'Bridge not found.' };
      br.built = true;
      br.progress = 1;
      discoverIsland(world, br.fromIsland, 'Sovereign');
      discoverIsland(world, br.toIsland, 'Sovereign');
      addChronicle(world, `Sovereign raised the ${br.name}!`, 'voyage');
      return { ok: true, message: `${br.name} completed!` };
    }
    case 'sovereign_build_cableway': {
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
      const cb = world.cableways.find((c) => c.id === cmd.cableId);
      if (!cb) return { ok: false, message: 'Cableway not found.' };
      cb.built = true;
      cb.progress = 1;
      discoverIsland(world, cb.fromIsland, 'Sovereign');
      discoverIsland(world, cb.toIsland, 'Sovereign');
      addChronicle(world, `Sovereign strung the ${cb.name} sky-gondola!`, 'voyage');
      return { ok: true, message: `${cb.name} completed!` };
    }
    case 'sovereign_uplift_villager': {
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
      const v = [...world.villagers, ...world.clanVillagers].find((i) => i.id === cmd.villagerId);
      if (!v) return { ok: false, message: 'Inhabitant not found.' };
      if (!canControlVillager(world, v, actorPlayerId)) {
        return { ok: false, message: 'Cannot uplift another village’s unit.' };
      }
      v.hp = v.maxHp;
      v.hunger = 100;
      v.warmth = 100;
      v.energy = 100;
      v.mood = 100;
      v.cognition = {
        stage: 'enlightened',
        awareness: 100,
        observedConcepts: ['berry_bush', 'flint_pile', 'branch_pile', 'spring', 'embers', 'horizon', 'ruin'],
        socialCount: 6,
        focusObject: null,
      };
      v.thoughtBubble = 'Enlightened!';
      v.thoughtTimer = 3.2;
      return { ok: true, message: `Uplifted ${v.name.split(' ')[0]}'s mind & vitality.` };
    }
    case 'sovereign_unlock_all_tech':
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
      world.unlockedTechIds = TECH_TREE.map((t) => t.id);
      world.activeTechId = null;
      addChronicle(world, 'Sovereign unlocked all archipelago discoveries!', 'tech');
      return { ok: true, message: 'All cultural technologies unlocked!' };
    case 'rts_order_units': {
      if (world.gameMode !== 'sovereign_sandbox' && world.gameMode !== 'shared_siege') {
        return { ok: false, message: 'Direct RTS orders are active in Sovereign Sandbox & Shared Siege.' };
      }
      const ids = new Set(cmd.villagerIds);
      let count = 0;
      const spreadCount = Math.max(1, ids.size);
      let idx = 0;
      for (const v of world.villagers) {
        if (!ids.has(v.id) || v.lifeStage === 'infant') continue;
        if (!canControlVillager(world, v, actorPlayerId)) continue;
        if (!cmd.order) {
          v.rtsOrder = null;
          v.decisionCooldown = 0.2;
          count += 1;
          continue;
        }
        const offsetAng = (idx / spreadCount) * Math.PI * 2;
        const offsetR = spreadCount > 1 && cmd.order.kind === 'move' ? 14 : 0;
        const ox = cmd.order.x + Math.cos(offsetAng) * offsetR;
        const oy = cmd.order.y + Math.sin(offsetAng) * offsetR;
        if (v.islandId !== cmd.order.islandId && world.gameMode === 'sovereign_sandbox') {
          v.islandId = cmd.order.islandId;
          v.x = ox;
          v.y = oy;
        } else if (cmd.order.kind === 'move') {
          const reach = checkTargetReachability(world, v.islandId, v.x, v.y, ox, oy, ARCHIPELAGO_LANDMARKS);
          if (!reach.reachable) {
            v.thoughtBubble = 'No route!';
            v.thoughtTimer = 2.2;
            continue;
          }
        }
        v.rtsOrder = { ...cmd.order, x: ox, y: oy };
        v.targetX = ox;
        v.targetY = oy;
        if (v.stuckState) {
          v.stuckState.waypoints = undefined;
        }
        v.state = cmd.order.kind === 'attack' ? 'fighting' : cmd.order.kind === 'hold' ? 'working' : 'walking';
        v.thoughtBubble =
          cmd.order.kind === 'attack'
            ? 'Attack!'
            : cmd.order.kind === 'gather'
              ? 'Gathering!'
              : cmd.order.kind === 'build'
                ? 'Building!'
                : cmd.order.kind === 'hold'
                  ? 'Holding!'
                  : 'Moving!';
        v.thoughtTimer = 2.2;
        idx += 1;
        count += 1;
      }
      if (count === 0) return { ok: false, message: 'Select one or more non-infant units from your village first.' };
      return {
        ok: true,
        message: cmd.order
          ? `Ordered ${count} unit${count > 1 ? 's' : ''} (${cmd.order.kind}).`
          : `Cleared RTS orders for ${count} unit${count > 1 ? 's' : ''}.`,
      };
    }
    case 'sovereign_draft_toggle': {
      const ids = new Set(cmd.villagerIds);
      let count = 0;
      for (const v of world.villagers) {
        if (!ids.has(v.id) || v.lifeStage === 'infant') continue;
        if (!canControlVillager(world, v, actorPlayerId)) continue;
        v.drafted = typeof cmd.drafted === 'boolean' ? cmd.drafted : !v.drafted;
        if (v.drafted) {
          v.activeTask = 'guard';
          v.thoughtBubble = 'Arms ready!';
          v.thoughtTimer = 2.4;
        }
        updateVillagerEquipment(world, v);
        count += 1;
      }
      return count > 0
        ? { ok: true, message: `Updated combat draft status for ${count} unit${count > 1 ? 's' : ''}.` }
        : { ok: false, message: 'No eligible units selected in your village.' };
    }
    case 'dev_action': {
      const targetIsle: IslandId = cmd.islandId ?? actorHome;
      const isl = ISLAND_DEFS[targetIsle];
      switch (cmd.action) {
        case 'grant_resources': {
          const amt = cmd.amount ?? 50;
          addVillageResource(world, targetIsle, 'berries', amt);
          addVillageResource(world, targetIsle, 'grain', amt);
          addVillageResource(world, targetIsle, 'timber', amt);
          addVillageResource(world, targetIsle, 'stone', amt);
          addVillageResource(world, targetIsle, 'copper', Math.round(amt * 0.5));
          addVillageResource(world, targetIsle, 'bronze', Math.round(amt * 0.4));
          addVillageResource(world, targetIsle, 'iron', Math.round(amt * 0.4));
          addVillageResource(world, targetIsle, 'herbs', Math.round(amt * 0.3));
          addVillageResource(world, targetIsle, 'hearthlight', Math.round(amt * 0.5));
          syncCombinedFood(world);
          return { ok: true, message: `[Dev] Granted +${amt} resources to ${isl.name}.` };
        }
        case 'spawn_villager': {
          const names = new Set(world.villagers.map((v) => v.name));
          const cand = generateCandidate('traveler', world.environment.dayCount, names);
          const nv = makeFounder(
            `vil_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            cand.name,
            cand.cloakColor,
            cand.hairColor,
            cand.skinTone,
            cand.hairStyle,
            cand.traits,
            0,
            0,
          );
          nv.islandId = targetIsle;
          nv.homeIslandId = targetIsle;
          nv.ownerPlayerId = world.islandOwners?.[targetIsle] ?? null;
          nv.cultureId = world.islands[targetIsle]?.owningCultureId ?? 'hearthfolk';
          nv.x = isl.centerX + (Math.random() * 56 - 28);
          nv.y = isl.centerY + (Math.random() * 44 - 22);
          nv.targetX = nv.x;
          nv.targetY = nv.y;
          nv.cognition = { stage: 'reasoning', awareness: 70, observedConcepts: ['berry_bush', 'embers', 'horizon'], socialCount: 2, focusObject: null };
          nv.stuckState = { lastX: nv.x, lastY: nv.y, timer: 0, detourSign: 1 };
          world.villagers.push(nv);
          upsertLineage(world, nv);
          return { ok: true, message: `[Dev] Spawned ${nv.name} on ${isl.name}.` };
        }
        case 'spawn_raider': {
          spawnSiegeRaider(
            world,
            `Dev Raider ${world.raiders.length + 1}`,
            targetIsle,
            isl.centerX + (Math.random() * 90 - 45),
            isl.centerY + (Math.random() * 70 - 35),
            Math.max(1, world.siege?.wave ?? 1),
          );
          return { ok: true, message: `[Dev] Spawned Raider on ${isl.name}.` };
        }
        case 'spawn_animal': {
          const kind = (cmd.entityKind === 'boar' || cmd.entityKind === 'rabbit' ? cmd.entityKind : 'deer') as 'deer' | 'boar' | 'rabbit';
          const baseScale = kind === 'boar' ? 1.15 : kind === 'deer' ? 1.25 : 0.78;
          const maxHp = kind === 'boar' ? 48 : kind === 'deer' ? 32 : 12;
          const ax = isl.centerX + (Math.random() * 80 - 40);
          const ay = isl.centerY + (Math.random() * 60 - 30);
          world.wildHerds.push({
            id: `dev_herd_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            kind,
            islandId: targetIsle,
            x: ax,
            y: ay,
            targetX: isl.centerX,
            targetY: isl.centerY,
            facing: 1,
            pauseTimer: 1,
            hp: maxHp,
            maxHp,
            aggroTargetId: null,
            color: kind === 'boar' ? '#584439' : kind === 'deer' ? '#9C6D46' : '#C9C0B5',
            scale: Number((baseScale * (0.86 + Math.random() * 0.34)).toFixed(2)),
            stuckState: { lastX: ax, lastY: ay, timer: 0, detourSign: 1 },
          });
          return { ok: true, message: `[Dev] Spawned wild ${kind} on ${isl.name}.` };
        }
        case 'spawn_stone': {
          world.wildNodes.push({
            id: `dev_stone_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            islandId: targetIsle,
            kind: 'stone_boulder',
            x: isl.centerX + (Math.random() * isl.radiusX * 0.8 - isl.radiusX * 0.4),
            y: isl.centerY + (Math.random() * isl.radiusY * 0.7 - isl.radiusY * 0.35),
            amount: 24,
            maxAmount: 24,
            scale: 1.05,
          });
          return { ok: true, message: `[Dev] Spawned stone boulder on ${isl.name}.` };
        }
        case 'spawn_tree': {
          world.wildNodes.push({
            id: `dev_tree_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            islandId: targetIsle,
            kind: 'tree',
            variant: targetIsle === 'timbercrown' ? 'cedar' : 'oak',
            x: isl.centerX + (Math.random() * isl.radiusX * 0.8 - isl.radiusX * 0.4),
            y: isl.centerY + (Math.random() * isl.radiusY * 0.7 - isl.radiusY * 0.35),
            amount: 24,
            maxAmount: 24,
            scale: 1.15,
          });
          return { ok: true, message: `[Dev] Spawned tree on ${isl.name}.` };
        }
        case 'trigger_siege': {
          if (!world.siege) {
            world.siege = { wave: 0, nextWaveTimer: 1, activeFronts: [], totalKills: 0, warningText: null, lastWaveDay: 0 };
          }
          world.siege.nextWaveTimer = 0.05;
          tickSharedSiege(world, 0.1, particles);
          if (world.gameMode !== 'shared_siege') {
            world.siege.wave += 1;
            spawnSiegeRaider(world, `Raid Vanguard`, 'cradle', ISLAND_DEFS.cradle.dockSpot.x, ISLAND_DEFS.cradle.dockSpot.y, world.siege.wave);
            spawnSiegeRaider(world, `Bridge Raider`, 'sunterrace', ISLAND_DEFS.sunterrace.centerX - 60, ISLAND_DEFS.sunterrace.centerY, world.siege.wave);
          }
          return { ok: true, message: `[Dev] Triggered multi-front Siege Wave ${world.siege.wave}!` };
        }
        case 'advance_day': {
          world.environment.dayCount += 1;
          handleNewDayEvents(world);
          return { ok: true, message: `[Dev] Advanced to Day ${world.environment.dayCount}.` };
        }
        case 'unlock_next_tech': {
          const frontier = getAvailableFrontierTechs(world.unlockedTechIds);
          const next = (world.activeTechId && TECH_BY_ID[world.activeTechId]) || frontier[0];
          if (!next) return { ok: false, message: 'All technologies already unlocked.' };
          if (!world.unlockedTechIds.includes(next.id)) world.unlockedTechIds.push(next.id);
          const nextFrontier = getAvailableFrontierTechs(world.unlockedTechIds);
          world.activeTechId = nextFrontier[0]?.id ?? null;
          return { ok: true, message: `[Dev] Unlocked ${next.name}!` };
        }
        case 'unlock_all_tech': {
          world.unlockedTechIds = TECH_TREE.map((t) => t.id);
          world.activeTechId = null;
          return { ok: true, message: '[Dev] Unlocked every technology.' };
        }
        case 'finish_builds': {
          for (const b of world.buildings) {
            if (!b.unlocked && b.cultureId !== 'ashen_raider') {
              b.unlocked = true;
              b.constructionStage = 'complete';
              b.pausedForMaterials = false;
              b.level = Math.max(1, b.level);
            }
          }
          world.activeConstruction = null;
          return { ok: true, message: '[Dev] Completed all active & staked constructions.' };
        }
        case 'heal_all': {
          for (const v of world.villagers) {
            v.hp = v.maxHp;
            v.hunger = 100;
            v.warmth = 100;
            v.energy = 100;
            v.mood = 100;
            if (v.stats) {
              v.stats.bleedStack = 0;
              v.stats.bleedTimer = 0;
            }
          }
          return { ok: true, message: '[Dev] Healed all villagers & cured bleeding.' };
        }
        case 'reroll_traits': {
          const tgt = (cmd.villagerId && world.villagers.find((v) => v.id === cmd.villagerId)) || world.villagers[0];
          if (!tgt) return { ok: false, message: 'No villager available.' };
          if (cmd.traitId && TRAITS[cmd.traitId]) {
            if (!tgt.traits.includes(cmd.traitId)) {
              tgt.traits = [cmd.traitId, ...tgt.traits.slice(0, 2)];
            }
          } else {
            tgt.traits = rollBalancedTraits();
          }
          tgt.stats = rollUnitStats(tgt.traits, false);
          tgt.bioDescription = buildBioFromTraits(tgt.traits, false);
          upsertLineage(world, tgt);
          return { ok: true, message: `[Dev] Updated traits for ${tgt.name.split(' ')[0]}.` };
        }
        case 'grant_skill_xp': {
          const tgt = (cmd.villagerId && world.villagers.find((v) => v.id === cmd.villagerId)) || world.villagers[0];
          if (!tgt) return { ok: false, message: 'No villager available.' };
          const skillId = cmd.skillId ?? 'blade_mastery';
          gainSkillXp(world, tgt, skillId, cmd.amount ?? 30);
          return { ok: true, message: `[Dev] Granted ${SKILL_META[skillId].label} XP to ${tgt.name.split(' ')[0]}.` };
        }
        default:
          return { ok: false, message: 'Unknown dev tool action.' };
      }
    }
    default:
      return { ok: false, message: 'Unsupported command.' };
  }
}

export function applyOfflineProgress(world: WorldState, elapsedSeconds: number): string | null {
  if (elapsedSeconds < 20 || world.villagers.length === 0) return null;
  const simSec = Math.min(elapsedSeconds, 1800);
  const homeId = world.localHomeIslandId ?? 'cradle';
  const pop = Math.max(1, world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === homeId).length);
  addVillageResource(world, homeId, 'berries', Math.round(pop * (simSec / 90)));
  addVillageResource(world, homeId, 'timber', Math.round(pop * (simSec / 110)));
  syncCombinedFood(world);
  return `While away (${Math.round(simSec / 60)}m), inhabitants gathered supplies around the hearth.`;
}

function buildAspirations(world: WorldState): AspirationItem[] {
  const ruinsExplored = world.exploreRuins.filter((r) => r.exploredCount > 0).length;
  const list: { id: string; title: string; check: () => boolean; reward: number }[] = [
    {
      id: 'asp_fire',
      title: 'Spark the first Bonfire on Cradle Isle',
      check: () => hasBuildingType(world, 'bonfire', 'cradle'),
      reward: 10,
    },
    {
      id: 'asp_crops',
      title: 'Cultivate a field and herd livestock in a pasture',
      check: () => hasBuildingType(world, 'farm_plot') && hasBuildingType(world, 'pasture'),
      reward: 16,
    },
    {
      id: 'asp_ruins',
      title: 'Chart 4 islands & uncover 2 Ancient Ruins',
      check: () => Object.values(world.islands).filter((i) => i.discovered).length >= 4 && ruinsExplored >= 2,
      reward: 24,
    },
    {
      id: 'asp_bastion',
      title: 'Smelt Bronze, build Wind-Gliders or Cableways & explore 6+ islands',
      check: () =>
        getTechUnlocked(world, 'bronze_smelting') &&
        Object.values(world.islands).filter((i) => i.discovered).length >= 6,
      reward: 38,
    },
  ];
  return list.map((a) => ({
    id: a.id,
    title: a.title,
    rewardHearthlight: a.reward,
    completed: a.check(),
  }));
}

export function createHudSnapshot(world: WorldState, viewerIslandId?: IslandId): HudSnapshot {
  syncCombinedFood(world);
  const homeId = viewerIslandId ?? world.localHomeIslandId ?? 'cradle';
  const vResCopy = {} as Record<IslandId, VillageResources>;
  const vPolCopy = {} as Record<IslandId, VillagePolicy>;
  const vFlowCopy = {} as Record<IslandId, ResourceFlowStats>;
  for (const id of ISLAND_ORDER) {
    vResCopy[id] = { ...getVillageRes(world, id) };
    vPolCopy[id] = { ...(world.villagePolicies?.[id] ?? { rationMode: 'normal', borderPolicy: 'parley' }) };
    vFlowCopy[id] = { ...(world.resourceFlows?.[id] ?? makeEmptyFlow()) };
  }
  const homePop = world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === homeId).length;
  return {
    gameMode: world.gameMode,
    worldSeed: world.worldSeed,
    era: world.era,
    localHomeIslandId: homeId,
    islandOwners: { ...(world.islandOwners ?? {}) } as Record<IslandId, string | null>,
    resources: { ...getVillageRes(world, homeId) },
    villageResources: vResCopy,
    villagePolicies: vPolCopy,
    resourceFlows: vFlowCopy,
    lineage: { ...(world.lineage ?? {}) },
    comforts: { ...world.comforts },
    knowledgeXp: world.knowledgeXp,
    unlockedTechIds: [...world.unlockedTechIds],
    activeTechId: world.activeTechId,
    islands: { ...world.islands },
    villageCultures: { ...world.villageCultures },
    bridges: world.bridges.map((b) => ({ ...b })),
    cableways: world.cableways.map((c) => ({ ...c })),
    gliders: world.gliders.map((g) => ({ ...g })),
    exploreRuins: world.exploreRuins.map((r) => ({ ...r })),
    villagers: world.villagers.map((v) => ({ ...v })),
    clanVillagers: world.clanVillagers.map((cv) => ({ ...cv })),
    raiders: world.raiders.map((r) => ({ ...r })),
    buildings: world.buildings.map((b) => ({ ...b })),
    placedSuggestions: world.placedSuggestions.map((s) => ({ ...s })),
    livestock: world.livestock.map((l) => ({ ...l })),
    wildHerds: world.wildHerds.map((h) => ({ ...h })),
    boats: world.boats.map((b) => ({ ...b })),
    memorials: world.memorials.map((m) => ({ ...m })),
    diplomacy: { ...world.diplomacy },
    pendingArrivals: world.pendingArrivals.map((a) => ({ ...a })),
    chronicle: world.chronicle.slice(0, 24),
    eventLog: (world.eventLog ?? []).slice(0, 120),
    communityRules: (world.communityRules ?? []).map((r) => ({ ...r })),
    disputes: (world.disputes ?? []).map((d) => ({ ...d, votes: [...d.votes] })),
    aspirations: buildAspirations(world),
    chiefId: world.chiefId,
    chiefFocus: world.chiefFocus,
    environment: { ...world.environment },
    totalHousingBeds: getHousingBedsForIsland(world, homeId),
    populationCount: homePop,
    activeConstruction: world.activeConstruction ? { ...world.activeConstruction } : null,
    suggestedBuildingId: world.suggestedBuildingId,
    prosperityScore: world.prosperityScore,
    villageTrajectory: world.villageTrajectory,
    trajectoryReasons: [...world.trajectoryReasons],
    ruinDaysCount: world.ruinDaysCount,
    departedCount: world.departedCount,
    deathCount: world.deathCount,
    siege: world.siege
      ? { ...world.siege, activeFronts: [...world.siege.activeFronts] }
      : { wave: 0, nextWaveTimer: 45, activeFronts: [], totalKills: 0, warningText: null, lastWaveDay: 0 },
  };
}

// Keep unused TECH_TREE reference clean if imported for future helpers
export { TECH_TREE };
