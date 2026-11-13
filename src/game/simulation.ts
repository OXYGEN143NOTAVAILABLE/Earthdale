import {
  buildBioFromTraits,
  COMFORT_LABELS,
  CURRENT_WORLD_VERSION,
  ERA_LABELS,
  generateCandidate,
  getIslandAtPoint,
  getUpgradeCost,
  INITIAL_SKY_BRIDGES,
  islandCoastWobble,
  ISLAND_DEFS,
  ISLAND_ORDER,
  isPointInsideIsland,
  pickFavoriteComfort,
  pickRandomWish,
  SEASON_META,
  TASK_BY_ID,
  TASKS,
  TRAITS,
  TRAVELER_ATTITUDE_META,
  WISH_LABELS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './catalog';
import {
  BUILDING_BLUEPRINTS,
  CROP_META,
  CULTURES,
  getAvailableFrontierTechs,
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
  BuildingEntity,
  BuildingType,
  ChiefFocus,
  ChronicleEntry,
  CognitiveStage,
  ComfortItem,
  CropType,
  CultureId,
  DeathCause,
  GameMode,
  GodCommentKind,
  HudSnapshot,
  IslandDef,
  IslandId,
  LivestockEntity,
  LivestockKind,
  Particle,
  PlacedSuggestion,
  SeasonType,
  SkyBridgeEntity,
  TaskType,
  VillageCultureProfile,
  VillageCustomId,
  VillageEra,
  VillageResources,
  VillageTrajectory,
  VillagerEntity,
  WildHerdEntity,
  WildNodeEntity,
  WorldCommand,
  WorldState,
} from './types';

const STORAGE_KEY = 'hearthglen_village_save_v6';
const LEGACY_STORAGE_KEYS = [
  'hearthglen_village_save_v5',
  'hearthglen_village_save_v4',
  'hearthglen_village_save_v3',
  'hearthglen_village_save_v2',
];
const PARTICLE_POOL_SIZE = 260;

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
  pool: Particle[],
  opts: Omit<Particle, 'active' | 'life'> & { life?: number },
) {
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
    world.buildings.find((b) => b.type === 'bonfire' && b.unlocked) ??
    null
  );
}

export function getTotalFood(res: VillageResources): number {
  return res.berries + res.grain + res.meat + res.fish;
}

function syncCombinedFood(world: WorldState) {
  world.resources.food = Math.max(0, getTotalFood(world.resources));
}

function consumeFoodUnits(world: WorldState, amount: number): boolean {
  syncCombinedFood(world);
  if (world.resources.food < amount) return false;
  let rem = amount;
  const order: ('berries' | 'grain' | 'meat' | 'fish')[] = ['berries', 'fish', 'grain', 'meat'];
  for (const key of order) {
    if (rem <= 0) break;
    const take = Math.min(world.resources[key], rem);
    world.resources[key] -= take;
    rem -= take;
  }
  syncCombinedFood(world);
  return true;
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
  const direct = isBridgePassable(world, from, to);
  if (direct) return direct;
  // BFS up to 3 hops across built sky-bridges
  const queue: { id: IslandId; firstBridge: SkyBridgeEntity | null }[] = [{ id: from, firstBridge: null }];
  const visited = new Set<IslandId>([from]);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.id === to) return curr.firstBridge;
    for (const br of world.bridges) {
      if (!br.built) continue;
      const nextId = br.fromIsland === curr.id ? br.toIsland : br.toIsland === curr.id ? br.fromIsland : null;
      if (nextId && !visited.has(nextId)) {
        visited.add(nextId);
        queue.push({ id: nextId, firstBridge: curr.firstBridge ?? br });
      }
    }
  }
  return null;
}

function islandNormalizedDist(island: IslandDef, wx: number, wy: number): number {
  const dx = (wx - island.centerX) / Math.max(20, island.radiusX);
  const dy = (wy - island.centerY) / Math.max(20, island.radiusY);
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(island, ang);
  return Math.hypot(dx, dy) / Math.max(0.4, wobble);
}

function isOnBuiltBridge(world: WorldState, x: number, y: number): SkyBridgeEntity | null {
  for (const br of world.bridges) {
    if (!br.built) continue;
    const vx = br.x2 - br.x1;
    const vy = br.y2 - br.y1;
    const len2 = vx * vx + vy * vy;
    if (len2 < 1) continue;
    const t = Math.max(0, Math.min(1, ((x - br.x1) * vx + (y - br.y1) * vy) / len2));
    const px = br.x1 + t * vx;
    const py = br.y1 + t * vy;
    if (Math.hypot(x - px, y - py) <= 28) return br;
  }
  return null;
}

function clampToWalkableSurface(
  world: WorldState,
  currentIslandId: IslandId,
  nx: number,
  ny: number,
): { x: number; y: number; islandId: IslandId; hitEdge: boolean } {
  const onBridge = isOnBuiltBridge(world, nx, ny);
  const insideAny = getIslandAtPoint(nx, ny, onBridge ? 0 : 26);
  if (insideAny) {
    return { x: nx, y: ny, islandId: insideAny.id, hitEdge: false };
  }
  if (onBridge) {
    return { x: nx, y: ny, islandId: currentIslandId, hitEdge: false };
  }
  // Clamp back inside current island rim
  const isl = ISLAND_DEFS[currentIslandId];
  const rx = Math.max(30, isl.radiusX - 30);
  const ry = Math.max(30, isl.radiusY - 30);
  const dx = nx - isl.centerX;
  const dy = ny - isl.centerY;
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(isl, ang);
  const norm = Math.hypot(dx / rx, dy / ry) / Math.max(0.4, wobble);
  if (norm > 1) {
    return {
      x: isl.centerX + dx / norm,
      y: isl.centerY + dy / norm,
      islandId: currentIslandId,
      hitEdge: true,
    };
  }
  return { x: nx, y: ny, islandId: currentIslandId, hitEdge: false };
}

function steerEntity(
  world: WorldState,
  islandId: IslandId,
  x: number,
  y: number,
  tx: number,
  ty: number,
  stepDist: number,
): { x: number; y: number; islandId: IslandId; facing: 1 | -1; hitEdge: boolean } {
  const destIsland = getIslandAtPoint(tx, ty, 6)?.id ?? islandId;
  let navX = tx;
  let navY = ty;
  let crossingBridge = false;

  if (destIsland !== islandId) {
    const br = findBridgeStep(world, islandId, destIsland);
    if (br) {
      crossingBridge = true;
      const fromIs1 = br.fromIsland === islandId;
      const enterX = fromIs1 ? br.x1 : br.x2;
      const enterY = fromIs1 ? br.y1 : br.y2;
      const exitX = fromIs1 ? br.x2 : br.x1;
      const exitY = fromIs1 ? br.y2 : br.y1;
      const onThisBridge = isOnBuiltBridge(world, x, y)?.id === br.id;
      if (!onThisBridge && Math.hypot(x - enterX, y - enterY) > 18) {
        navX = enterX;
        navY = enterY;
      } else {
        navX = exitX;
        navY = exitY;
      }
    } else {
      // Cannot walk without a bridge; stay on island edge facing destination
      const isl = ISLAND_DEFS[islandId];
      navX = isl.dockSpot.x;
      navY = isl.dockSpot.y;
    }
  }

  const dx = navX - x;
  const dy = navY - y;
  const d = Math.hypot(dx, dy);
  if (d < 0.01) return { x, y, islandId, facing: 1, hitEdge: false };
  const move = Math.min(d, stepDist);
  let nx = x + (dx / d) * move;
  let ny = y + (dy / d) * move;

  // Obstacle avoidance around buildings on same island
  for (const b of world.buildings) {
    if (!b.unlocked && world.activeConstruction?.buildingId !== b.id) continue;
    if (b.type === 'farm_plot' || b.type === 'pasture' || b.type === 'dock') continue;
    const fp = BUILDING_BLUEPRINTS[b.type]?.footprint ?? { rx: 16, ry: 14 };
    const padX = fp.rx + 2;
    const padY = fp.ry + 2;
    const bdx = nx - b.x;
    const bdy = ny - b.y;
    if (Math.abs(bdx) < padX && Math.abs(bdy) < padY) {
      const ox = padX - Math.abs(bdx);
      const oy = padY - Math.abs(bdy);
      if (ox < oy) nx = bdx >= 0 ? b.x + padX : b.x - padX;
      else ny = bdy >= 0 ? b.y + padY : b.y - padY;
    }
  }

  // Soft cliff-rim acknowledgement when not crossing a built bridge
  let edgeDetected = false;
  if (!crossingBridge && !isOnBuiltBridge(world, nx, ny)) {
    const isl = ISLAND_DEFS[islandId];
    const nd = islandNormalizedDist(isl, nx, ny);
    if (nd >= 0.87) {
      edgeDetected = true;
      // Steer smoothly back inward along a coastal arc instead of sticking against the edge
      const toCenterX = isl.centerX - nx;
      const toCenterY = isl.centerY - ny;
      const cd = Math.hypot(toCenterX, toCenterY) || 1;
      nx = x + (toCenterX / cd) * move * 0.65;
      ny = y + (toCenterY / cd) * move * 0.65;
    }
  }

  const clamped = clampToWalkableSurface(world, islandId, nx, ny);
  return {
    x: clamped.x,
    y: clamped.y,
    islandId: clamped.islandId,
    facing: dx >= 0 ? 1 : -1,
    hitEdge: edgeDetected || clamped.hitEdge,
  };
}

function addChronicle(world: WorldState, text: string, kind: ChronicleEntry['kind']) {
  world.chronicle.unshift({
    id: `chr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    day: world.environment.dayCount,
    text,
    kind,
  });
  if (world.chronicle.length > 42) {
    world.chronicle.length = 42;
  }
}

export function getTraitStats(v: VillagerEntity) {
  let workSpeed = 1;
  let moodDrift = 0;
  let energyDrain = 1;
  let obedience = 0.65;
  let rainSensitive = false;
  let nightLoving = false;
  let morningGrumpy = false;
  let curiosityMod = 0;
  let braveryMod = 0;

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
  };
}

export function getTotalHousingBeds(world: WorldState): number {
  const beds = world.buildings
    .filter((b) => b.unlocked && b.cultureId !== 'mist_mariner')
    .reduce(
      (sum, b) =>
        sum +
        (b.housingCapacity > 0
          ? b.housingCapacity + Math.max(0, b.level - 1) * 2
          : 0),
      0,
    );
  // 2 founders can sleep beside the embers or lean-to even with 0 beds
  return Math.max(2, beds);
}

function buildInitialWildNodes(): WildNodeEntity[] {
  const nodes: WildNodeEntity[] = [];
  let idx = 0;
  const addNode = (
    islandId: IslandId,
    kind: WildNodeEntity['kind'],
    dx: number,
    dy: number,
    amount: number,
    variant?: WildNodeEntity['variant'],
    scale = 1,
  ) => {
    const isl = ISLAND_DEFS[islandId];
    const x = isl.centerX + dx;
    const y = isl.centerY + dy;
    nodes.push({
      id: `node_${idx++}`,
      islandId,
      kind,
      x,
      y,
      amount,
      maxAmount: amount,
      variant,
      scale,
    });
  };

  // Cradle Isle: expansive meadow berries, branches, flint & scattered pines/oaks
  addNode('cradle', 'berry_bush', -180, 95, 34);
  addNode('cradle', 'berry_bush', 145, -145, 34);
  addNode('cradle', 'berry_bush', 210, 140, 32);
  addNode('cradle', 'berry_bush', -310, -45, 30);
  addNode('cradle', 'branch_pile', -260, 125, 42);
  addNode('cradle', 'branch_pile', 110, 210, 42);
  addNode('cradle', 'flint_pile', -105, -215, 38);
  addNode('cradle', 'flint_pile', 280, -40, 36);
  for (const [dx, dy, v, s] of [
    [-390, -155, 'pine', 1.12],
    [-345, 175, 'oak', 1.05],
    [-195, 270, 'pine', 1.0],
    [325, -225, 'oak', 1.1],
    [375, 185, 'pine', 1.02],
    [-30, -295, 'oak', 1.04],
    [-465, 25, 'pine', 1.08],
    [430, -55, 'oak', 0.98],
  ] as [number, number, 'pine' | 'oak', number][]) {
    addNode('cradle', 'tree', dx, dy, 65, v, s);
  }

  // Timbercrown Ridge: deep cedar wilderness, wild berries & stone/flint
  addNode('timbercrown', 'berry_bush', -160, 125, 34);
  addNode('timbercrown', 'berry_bush', 190, -90, 32);
  addNode('timbercrown', 'branch_pile', 165, 145, 52);
  addNode('timbercrown', 'flint_pile', -220, -145, 48);
  for (const [dx, dy, v, s] of [
    [-345, -125, 'cedar', 1.2],
    [-265, 200, 'pine', 1.12],
    [-65, -255, 'cedar', 1.18],
    [275, -175, 'pine', 1.1],
    [335, 105, 'cedar', 1.15],
    [85, 225, 'pine', 1.04],
    [-395, 45, 'cedar', 1.12],
    [-165, -45, 'pine', 1.05],
  ] as [number, number, 'cedar' | 'pine', number][]) {
    addNode('timbercrown', 'tree', dx, dy, 85, v, s);
  }

  // Sun-Terrace Isle: fertile wild meadow & apple trees
  addNode('sunterrace', 'berry_bush', -195, -125, 36);
  addNode('sunterrace', 'berry_bush', 210, 105, 36);
  addNode('sunterrace', 'branch_pile', -265, 150, 44);
  addNode('sunterrace', 'flint_pile', 140, -195, 36);
  for (const [dx, dy, v, s] of [
    [-375, -165, 'orchard', 1.1],
    [-340, 180, 'oak', 1.06],
    [295, -205, 'orchard', 1.12],
    [365, 155, 'orchard', 1.05],
    [45, 275, 'oak', 1.02],
    [-85, -255, 'orchard', 1.0],
  ] as [number, number, 'orchard' | 'oak', number][]) {
    addNode('sunterrace', 'tree', dx, dy, 70, v, s);
  }

  // Copper-Crag Spire: rich copper & iron veins
  addNode('coppercrag', 'copper_vein', -190, -100, 110);
  addNode('coppercrag', 'copper_vein', 180, -125, 110);
  addNode('coppercrag', 'iron_vein', -35, 165, 110);
  addNode('coppercrag', 'iron_vein', 220, 95, 110);
  addNode('coppercrag', 'flint_pile', -265, 80, 75);
  for (const [dx, dy, v, s] of [
    [-335, -155, 'pine', 0.96],
    [325, -165, 'pine', 0.94],
    [110, 215, 'pine', 0.92],
  ] as [number, number, 'pine', number][]) {
    addNode('coppercrag', 'tree', dx, dy, 50, v, s);
  }

  // Outer Mist Atoll: coastal oaks/pines & flint
  addNode('mistatoll', 'berry_bush', -115, 155, 30);
  addNode('mistatoll', 'flint_pile', 165, -145, 42);
  for (const [dx, dy, v, s] of [
    [265, -125, 'oak', 1.05],
    [285, 145, 'oak', 1.0],
    [-205, -210, 'pine', 0.98],
  ] as [number, number, 'oak' | 'pine', number][]) {
    addNode('mistatoll', 'tree', dx, dy, 55, v, s);
  }

  return nodes;
}

function buildInitialWildHerds(): WildHerdEntity[] {
  const herds: WildHerdEntity[] = [];
  const spawn = (
    id: string,
    kind: WildHerdEntity['kind'],
    islandId: IslandId,
    dx: number,
    dy: number,
    color: string,
  ) => {
    const isl = ISLAND_DEFS[islandId];
    const hp = kind === 'boar' ? 58 : kind === 'deer' ? 32 : 14;
    herds.push({
      id,
      kind,
      islandId,
      x: isl.centerX + dx,
      y: isl.centerY + dy,
      targetX: isl.centerX + dx + 45,
      targetY: isl.centerY + dy,
      facing: 1,
      pauseTimer: Math.random() * 2,
      hp,
      maxHp: hp,
      aggroTargetId: null,
      color,
    });
  };

  // Cradle Isle: rabbits & deer roaming the wide meadow
  spawn('wild_r1', 'rabbit', 'cradle', -170, 140, '#E5DDD0');
  spawn('wild_r2', 'rabbit', 'cradle', 210, -85, '#C8B094');
  spawn('wild_r4', 'rabbit', 'cradle', 95, 220, '#DDD2C2');
  spawn('wild_d1', 'deer', 'cradle', -290, -110, '#A67249');
  spawn('wild_d5', 'deer', 'cradle', 295, 110, '#9E683E');

  // Timbercrown Ridge: deer & dangerous wild boars
  spawn('wild_d2', 'deer', 'timbercrown', -145, -95, '#9E683E');
  spawn('wild_d3', 'deer', 'timbercrown', 175, 115, '#A67249');
  spawn('wild_b1', 'boar', 'timbercrown', 55, -165, '#5E463A');
  spawn('wild_b2', 'boar', 'timbercrown', -210, 135, '#4D382E');

  // Sun-Terrace Isle: rabbits & deer
  spawn('wild_r3', 'rabbit', 'sunterrace', 105, -135, '#D4C7B8');
  spawn('wild_d4', 'deer', 'sunterrace', -165, 85, '#B07B52');
  spawn('wild_d6', 'deer', 'sunterrace', 240, 160, '#A67249');

  // Copper-Crag: mountain boar
  spawn('wild_b3', 'boar', 'coppercrag', 95, -45, '#56433B');

  return herds;
}

function canVillagerWork(world: WorldState, v: VillagerEntity): boolean {
  if (v.lifeStage === 'infant' || v.lifeStage === 'child') return false;
  if (world.gameMode === 'sovereign_sandbox') return true;
  return (
    v.cognition.awareness >= 45 &&
    v.cognition.observedConcepts.length >= 3 &&
    v.cognition.socialCount >= 2
  );
}

function cognitiveStageFromAwareness(awareness: number): CognitiveStage {
  if (awareness >= 96) return 'enlightened';
  if (awareness >= 72) return 'reasoning';
  if (awareness >= 45) return 'experimenting';
  if (awareness >= 20) return 'observing';
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
  return {
    id,
    name,
    bioDescription: buildBioFromTraits(traits, false),
    cultureId: 'hearthfolk',
    islandId: 'cradle',
    cloakColor,
    hairColor,
    skinTone,
    hairStyle,
    lifeStage: 'adult',
    ageDays: 14,
    isChief: false,
    traits,
    partnerId: null,
    parentIds: null,
    childrenIds: [],
    homeBuildingId: null,
    hp: 100,
    maxHp: 100,
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
    currentDialogue: 'Everything is brand new—soft grass, bright sky, strange stones. Let me look closer and talk with kin!',
    lastMemory: 'Opened eyes bare-handed like a newborn under an endless sky.',
    relationships: {},
    hangOutTargetId: null,
    socialCooldown: 0,
    suggestedTask: null,
    activeTask: 'explore',
    state: 'exploring',
    autonomyReason: 'Waking in wonder—exploring nearby berries, stones & chatting before knowing work.',
    thoughtBubble: 'What is this world?',
    thoughtTimer: 5.5,
    x: cradle.centerX + dx,
    y: cradle.centerY + dy,
    targetX: cradle.centerX + dx * 4,
    targetY: cradle.centerY + dy * 4,
    facing: 1,
    animPhase: Math.random() * 6,
    bounceScale: 1,
    decisionCooldown: 3.5,
    birthCooldownDays: 0,
    attackCooldown: 0,
    edgeAckCooldown: 0,
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
  return {
    id,
    name,
    bioDescription: `Born and raised among the ${CULTURES[cultureId].name} of ${isl.name}.`,
    cultureId,
    islandId,
    isNativeClan: true,
    cloakColor,
    hairColor,
    skinTone,
    hairStyle: Math.floor(Math.random() * 4),
    lifeStage: 'adult',
    ageDays: 19,
    isChief: false,
    traits: cultureId === 'sylvan' ? ['curious_scout', 'swift_footed'] : cultureId === 'cragforge' ? ['clever_crafter', 'resilient'] : ['brave_hunter', 'warmhearted'],
    partnerId: null,
    parentIds: null,
    childrenIds: [],
    homeBuildingId: null,
    hp: 110,
    maxHp: 110,
    warmth: 92,
    mood: 82,
    energy: 92,
    hunger: 85,
    affectionXp: 15,
    affectionLevel: 1,
    gearTier: cultureId === 'cragforge' ? 3 : 2,
    weaponType: cultureId === 'sylvan' ? 'bow' : cultureId === 'cragforge' ? 'bronze_blade' : 'flint_spear',
    curiosity: 0.55,
    bravery: 0.72,
    voyageBoatId: null,
    killCount: 0,
    cognition: {
      stage: 'reasoning',
      awareness: 78,
      observedConcepts: ['berry_bush', 'branch_pile', 'flint_pile', 'spring', 'embers'],
      socialCount: 6,
      focusObject: null,
    },
    favoriteComfort: pickFavoriteComfort(),
    activeWish: 'chat',
    wishFulfilledToday: false,
    currentDialogue: `Welcome under the sky-clouds! Our ${CULTURES[cultureId].name} hearth burns steady on ${isl.name}.`,
    lastMemory: `Tending local traditions on ${isl.name}.`,
    relationships: {},
    hangOutTargetId: null,
    socialCooldown: 2,
    suggestedTask: null,
    activeTask: task,
    state: 'working',
    autonomyReason: `Tending ${CULTURES[cultureId].name} duties on ${isl.name}.`,
    thoughtBubble: null,
    thoughtTimer: 0,
    x: isl.centerX + dx,
    y: isl.centerY + dy,
    targetX: isl.centerX + dx * 0.5,
    targetY: isl.centerY + dy * 0.5,
    facing: 1,
    animPhase: Math.random() * 6,
    bounceScale: 1,
    decisionCooldown: 3 + Math.random() * 4,
    birthCooldownDays: 99,
    attackCooldown: 0,
    edgeAckCooldown: 0,
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
  };
}

function buildNativeOutposts(): {
  buildings: BuildingEntity[];
  boats: BoatEntity[];
  clanVillagers: VillagerEntity[];
} {
  const mist = ISLAND_DEFS.mistatoll;
  const tc = ISLAND_DEFS.timbercrown;
  const cc = ISLAND_DEFS.coppercrag;

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
    makeNativeClanVillager('syl_2', 'LindenMoss', 'timbercrown', 'sylvan', '#6B9962', '#8B5A34', '#F2D0B6', 54, -22, 'hunt'),
    makeNativeClanVillager('syl_3', 'Bramble Pine', 'timbercrown', 'sylvan', '#487654', '#3A281E', '#D7A37E', -88, -32, 'forage'),
    makeNativeClanVillager('crag_1', 'Durnan Flint', 'coppercrag', 'cragforge', '#9D5B36', '#2D2420', '#D9A582', -38, 12, 'smelt'),
    makeNativeClanVillager('crag_2', 'Sera Slate', 'coppercrag', 'cragforge', '#5B6A7A', '#7E3E2A', '#EBC3A4', 65, 22, 'quarry'),
    makeNativeClanVillager('crag_3', 'Torin Brass', 'coppercrag', 'cragforge', '#B86E3E', '#40342E', '#DFAD89', -75, -55, 'guard'),
    makeNativeClanVillager('mist_1', 'Kael Tide', 'mistatoll', 'mist_mariner', '#3D7E8A', '#24292E', '#D59C78', -25, 18, 'fish'),
    makeNativeClanVillager('mist_2', 'Nera Drift', 'mistatoll', 'mist_mariner', '#4C9BA6', '#563D2D', '#E8BEA0', 48, -14, 'forage'),
    makeNativeClanVillager('mist_3', 'Orin Reef', 'mistatoll', 'mist_mariner', '#376C78', '#332C28', '#C98F6A', -70, 52, 'guard'),
  ];

  return { buildings, boats, clanVillagers };
}

export function createInitialWorld(gameMode: GameMode = 'whisper_solo'): WorldState {
  const adam = makeFounder(
    'founder_adam',
    'Adam Ash',
    '#8A6A4E',
    '#4A3525',
    '#E6BA9A',
    0,
    ['curious_scout', 'clever_crafter'],
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
    ['green_thumb', 'warmhearted'],
    18,
    -6,
  );
  adam.relationships[eve.id] = 68;
  eve.relationships[adam.id] = 68;
  adam.partnerId = eve.id;
  eve.partnerId = adam.id;

  const outpost = buildNativeOutposts();

  return {
    version: CURRENT_WORLD_VERSION,
    gameMode,
    era: 1,
    resources: {
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
    },
    comforts: { bread: 0, tea: 0, honey: 0 },
    knowledgeXp: 0,
    unlockedTechIds: [],
    activeTechId: 'fire_making',
    islands: {
      cradle: { id: 'cradle', discovered: true, owningCultureId: 'hearthfolk', dockBuilt: true, settledDay: 1 },
      timbercrown: { id: 'timbercrown', discovered: false, owningCultureId: 'sylvan', dockBuilt: false, settledDay: 1 },
      sunterrace: { id: 'sunterrace', discovered: false, owningCultureId: 'hearthfolk', dockBuilt: false, settledDay: null },
      coppercrag: { id: 'coppercrag', discovered: false, owningCultureId: 'cragforge', dockBuilt: true, settledDay: 1 },
      mistatoll: { id: 'mistatoll', discovered: false, owningCultureId: 'mist_mariner', dockBuilt: true, settledDay: 1 },
    },
    villageCultures: buildInitialVillageCultures(),
    bridges: INITIAL_SKY_BRIDGES.map((b) => ({ ...b })),
    wildNodes: buildInitialWildNodes(),
    villagers: [adam, eve],
    clanVillagers: [...outpost.clanVillagers],
    raiders: [],
    buildings: [...outpost.buildings],
    placedSuggestions: [],
    livestock: [],
    wildHerds: buildInitialWildHerds(),
    boats: [...outpost.boats],
    memorials: [],
    diplomacy: {
      hearthfolk: { cultureId: 'hearthfolk', trust: 100, status: 'peaceful', grievances: [], lastEnvoyDay: 1, raidTimer: 0 },
      sylvan: { cultureId: 'sylvan', trust: 74, status: 'peaceful', grievances: [], lastEnvoyDay: 1, raidTimer: 0 },
      cragforge: { cultureId: 'cragforge', trust: 68, status: 'peaceful', grievances: [], lastEnvoyDay: 1, raidTimer: 0 },
      mist_mariner: {
        cultureId: 'mist_mariner',
        trust: 38,
        status: 'wary',
        grievances: ['Wary of uncharted sails near their misty reef'],
        lastEnvoyDay: 0,
        raidTimer: 45,
      },
    },
    pendingArrivals: [],
    chronicle: [
      {
        id: 'chr_init_1',
        day: 1,
        text:
          gameMode === 'sovereign_sandbox'
            ? 'Sovereign Sandbox opened over the floating archipelago—every island, village, climate force, and inhabitant answers your hand.'
            : 'Adam and Eve awakened bare-handed on Cradle Isle—exploring nature and talking together before learning shelter and work.',
        kind: 'era',
      },
    ],
    completedAspirations: [],
    chiefId: null,
    chiefFocus: 'balanced',
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
    nextTravelerTimer: 165,
    activeConstruction: null,
    suggestedBuildingId: null,
    autoBuildTimer: 7,
    autoWelcomeTimer: 18,
    prosperityScore: 55,
    villageTrajectory: 'steady',
    trajectoryReasons: ['Founders exploring natural berries, flint, and social ties before building.'],
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
}

export function normalizeWorldState(raw: WorldState): WorldState {
  const base = createInitialWorld(raw.gameMode ?? 'whisper_solo');
  const merged: WorldState = {
    ...base,
    ...raw,
    gameMode: raw.gameMode ?? 'whisper_solo',
    resources: { ...base.resources, ...(raw.resources ?? {}) },
    comforts: { ...base.comforts, ...(raw.comforts ?? {}) },
    islands: { ...base.islands, ...(raw.islands ?? {}) },
    villageCultures: { ...base.villageCultures, ...(raw.villageCultures ?? {}) },
    diplomacy: { ...base.diplomacy, ...(raw.diplomacy ?? {}) },
    environment: { ...base.environment, ...(raw.environment ?? {}) },
    clanVillagers: Array.isArray(raw.clanVillagers) && raw.clanVillagers.length > 0 ? raw.clanVillagers : base.clanVillagers,
    settings: {
      fpsCap: raw.settings?.fpsCap ?? 60,
      simSpeed: (raw.settings?.simSpeed ?? 1) as 0 | 1 | 2 | 3,
      muted: raw.settings?.muted ?? true,
      volume: raw.settings?.volume ?? 0.45,
      autoProgress: raw.settings?.autoProgress ?? true,
    },
  };
  for (const v of [...merged.villagers, ...merged.clanVillagers]) {
    if (!v.cognition) {
      v.cognition = {
        stage: 'reasoning',
        awareness: 75,
        observedConcepts: ['berry_bush', 'branch_pile', 'flint_pile', 'spring'],
        socialCount: 3,
        focusObject: null,
      };
    } else if (typeof v.cognition.socialCount !== 'number') {
      v.cognition.socialCount = v.cognition.awareness >= 45 ? 3 : 0;
    }
  }
  syncCombinedFood(merged);
  return merged;
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

export function getTaskAvailable(world: WorldState, task: TaskType): boolean {
  const meta = TASK_BY_ID[task];
  if (!meta) return false;
  if (meta.requiredTechId && !getTechUnlocked(world, meta.requiredTechId)) return false;
  if (task === 'farm' && !hasBuildingType(world, 'farm_plot')) return false;
  if (task === 'pasture' && !hasBuildingType(world, 'pasture')) return false;
  if (task === 'quarry' && !hasBuildingType(world, 'quarry')) return false;
  if (task === 'fish' && !hasBuildingType(world, 'dock', 'cradle') && !hasBuildingType(world, 'dock', 'sunterrace')) {
    return false;
  }
  if (task === 'bake' && !hasBuildingType(world, 'bakery')) return false;
  if (task === 'study' && !hasBuildingType(world, 'library')) return false;
  if (task === 'smelt' && !hasBuildingType(world, 'smeltery')) return false;
  if (task === 'guard' && !hasBuildingType(world, 'watchtower') && !hasBuildingType(world, 'barracks')) return false;
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

function spendResources(res: VillageResources, cost: Partial<VillageResources>) {
  for (const [k, v] of Object.entries(cost)) {
    if (typeof v === 'number') {
      res[k as keyof VillageResources] = Math.max(0, (res[k as keyof VillageResources] ?? 0) - v);
    }
  }
}

function findValidSiteOnIsland(world: WorldState, islandId: IslandId): { x: number; y: number } | null {
  const isl = ISLAND_DEFS[islandId];
  for (let attempt = 0; attempt < 42; attempt++) {
    const ang = (attempt * 2.39996) % (Math.PI * 2);
    const rFactor = 0.14 + ((attempt % 7) / 7) * 0.62;
    const x = Math.round(isl.centerX + Math.cos(ang) * (isl.radiusX - 85) * rFactor);
    const y = Math.round(isl.centerY + Math.sin(ang) * (isl.radiusY - 75) * rFactor);
    if (!isPointInsideIsland(isl, x, y, 45)) continue;
    const tooClose = world.buildings.some((b) => Math.hypot(b.x - x, b.y - y) < 76);
    if (tooClose) continue;
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
  return {
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
}

function spawnPastureLivestock(world: WorldState, pasture: BuildingEntity) {
  const kind: LivestockKind = pasture.livestockKind ?? 'sheep';
  const count = kind === 'fowl' ? 4 : 3;
  const baseColor = LIVESTOCK_META[kind].color;
  for (let i = 0; i < count; i++) {
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

function grantKnowledge(world: WorldState, amount: number, particles: Particle[]) {
  if (world.villagers.length === 0) return;
  const libs = world.buildings.filter((b) => b.type === 'library' && b.unlocked);
  const libBonus = 1 + libs.reduce((acc, b) => acc + b.level * 0.65, 0);
  const bonfires = world.buildings.filter((b) => b.type === 'bonfire' && b.unlocked);
  const fireBonus = bonfires.length > 0 ? 1.2 : 1.0;
  const enlightenedBoost = world.villagers.some((v) => v.cognition.stage === 'enlightened') ? 1.35 : 1.0;

  world.knowledgeXp += amount * libBonus * fireBonus * enlightenedBoost;

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
    addChronicle(world, `Cultural Discovery: ${activeNode.name} — ${activeNode.unlocksLabel}!`, 'tech');

    const firstV = world.villagers[0];
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

function updateVillagerEquipment(world: WorldState, v: VillagerEntity) {
  if (v.lifeStage === 'infant') return;
  // Armor / Clothing Tiers
  let targetGear = v.gearTier;
  if (getTechUnlocked(world, 'iron_statecraft') && world.resources.iron >= 2 && (v.bravery > 0.65 || v.activeTask === 'guard')) {
    targetGear = 3;
  } else if (getTechUnlocked(world, 'bronze_smelting') && world.resources.bronze >= 2 && v.bravery > 0.6) {
    targetGear = Math.max(targetGear, 3) as 0 | 1 | 2 | 3;
  } else if (getTechUnlocked(world, 'animal_husbandry') && world.resources.wool >= 1) {
    targetGear = Math.max(targetGear, 2) as 0 | 1 | 2 | 3;
  } else if (getTechUnlocked(world, 'woven_shelter')) {
    targetGear = Math.max(targetGear, 1) as 0 | 1 | 2 | 3;
  }
  v.gearTier = targetGear;

  // Weapons
  if (getTechUnlocked(world, 'iron_statecraft') && world.resources.iron >= 1 && (v.activeTask === 'guard' || v.bravery > 0.7)) {
    v.weaponType = 'iron_blade';
  } else if (getTechUnlocked(world, 'bronze_smelting') && world.resources.bronze >= 1 && (v.activeTask === 'guard' || v.activeTask === 'hunt')) {
    v.weaponType = 'bronze_blade';
  } else if (getTechUnlocked(world, 'archery_watch') && (v.activeTask === 'hunt' || v.activeTask === 'guard')) {
    v.weaponType = 'bow';
  } else if (getTechUnlocked(world, 'flint_spears') && (v.activeTask === 'hunt' || v.bravery > 0.58)) {
    v.weaponType = 'flint_spear';
  }
}

function pickNextAutonomousBuilding(world: WorldState): {
  type: BuildingType;
  islandId: IslandId;
  x: number;
  y: number;
  cropType?: CropType;
  livestockKind?: LivestockKind;
  suggestionId?: string;
} | null {
  // 1. Honor player's click-placed suggestions first if tech & resources ready
  for (const sug of world.placedSuggestions) {
    const bp = BUILDING_BLUEPRINTS[sug.buildingType];
    if (!bp) continue;
    if (!getTechUnlocked(world, bp.requiredTechId)) continue;
    if (!hasResourcesFor(world.resources, getBuildCost(bp))) continue;
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

  // 2. Otherwise evaluate survival & cultural priority order across discovered islands
  const discoveredIds = ISLAND_ORDER.filter((id) => id !== 'mistatoll' && world.islands[id]?.discovered);
  const primaryIsle: IslandId = 'cradle';

  const countPlayerType = (t: BuildingType) =>
    world.buildings.filter((b) => b.cultureId !== 'mist_mariner' && b.type === t && b.unlocked).length;

  const priorities: { type: BuildingType; islandId: IslandId; cropType?: CropType; livestockKind?: LivestockKind }[] = [];

  if (countPlayerType('bonfire') === 0) {
    priorities.push({ type: 'bonfire', islandId: primaryIsle });
  }
  if (countPlayerType('lean_to') === 0 && countPlayerType('cottage') === 0) {
    priorities.push({ type: 'lean_to', islandId: primaryIsle });
  }
  if (countPlayerType('farm_plot') < 2) {
    const targetIsle = discoveredIds.includes('sunterrace') ? 'sunterrace' : primaryIsle;
    priorities.push({
      type: 'farm_plot',
      islandId: targetIsle,
      cropType: countPlayerType('farm_plot') === 0 ? 'turnip' : 'wheat',
    });
  }
  if (countPlayerType('cottage') < Math.ceil(world.villagers.length / 3)) {
    priorities.push({ type: 'cottage', islandId: discoveredIds[Math.floor(Math.random() * discoveredIds.length)] ?? primaryIsle });
  }
  if (countPlayerType('woodshop') === 0) {
    priorities.push({ type: 'woodshop', islandId: discoveredIds.includes('timbercrown') ? 'timbercrown' : primaryIsle });
  }
  if (countPlayerType('pasture') < 2) {
    const kind: LivestockKind = countPlayerType('pasture') === 0 ? 'sheep' : 'pig';
    priorities.push({
      type: 'pasture',
      islandId: discoveredIds.includes('sunterrace') ? 'sunterrace' : primaryIsle,
      livestockKind: kind,
    });
  }
  if (countPlayerType('quarry') < 2) {
    const targetIsle = discoveredIds.includes('coppercrag') ? 'coppercrag' : primaryIsle;
    priorities.push({ type: 'quarry', islandId: targetIsle });
  }
  if (countPlayerType('dock') === 0) {
    priorities.push({ type: 'dock', islandId: primaryIsle });
  }
  if (countPlayerType('bakery') === 0) {
    priorities.push({ type: 'bakery', islandId: primaryIsle });
  }
  if (countPlayerType('library') === 0) {
    priorities.push({ type: 'library', islandId: primaryIsle });
  }
  if (countPlayerType('watchtower') === 0) {
    priorities.push({ type: 'watchtower', islandId: primaryIsle });
  }
  if (countPlayerType('smeltery') === 0) {
    priorities.push({ type: 'smeltery', islandId: discoveredIds.includes('coppercrag') ? 'coppercrag' : primaryIsle });
  }
  if (countPlayerType('barracks') === 0) {
    priorities.push({ type: 'barracks', islandId: primaryIsle });
  }

  for (const cand of priorities) {
    const bp = BUILDING_BLUEPRINTS[cand.type];
    if (!getTechUnlocked(world, bp.requiredTechId)) continue;
    if (!hasResourcesFor(world.resources, getBuildCost(bp))) continue;
    const site = findValidSiteOnIsland(world, cand.islandId);
    if (!site) continue;
    return {
      ...cand,
      x: site.x,
      y: site.y,
    };
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
    if (!builder || builder.lifeStage === 'infant') {
      builder = world.villagers.find((v) => v.lifeStage === 'adult' || v.lifeStage === 'elder');
      if (!builder) return;
      ac.builderId = builder.id;
    }

    builder.targetX = b.x;
    builder.targetY = b.y + 18;
    const dist = Math.hypot(builder.x - b.x, builder.y - b.y);
    if (dist <= 38) {
      builder.state = 'building';
      builder.autonomyReason = `${ac.isUpgrade ? 'Upgrading' : 'Building'} ${b.name}.`;
      const cleverBoost = builder.traits.includes('clever_crafter') ? 1.3 : 1;
      ac.progress += dt * cleverBoost;

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
        b.level = Math.min(b.maxLevel, Math.max(1, b.level + 1));
        b.disrepair = 0;
        b.hp = b.maxHp;
        world.resources.hearthlight += 6;
        grantKnowledge(world, 6, particles);

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

    if (br.progress === 0) {
      if (world.resources.timber >= br.costTimber && world.resources.stone >= br.costStone) {
        world.resources.timber -= br.costTimber;
        world.resources.stone -= br.costStone;
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

  world.autoBuildTimer -= dt;
  if (world.autoBuildTimer > 0) return;
  world.autoBuildTimer = 6.5;

  // Cognitive readiness: villagers do not build until minds reach both exploration + social maturity
  const builders = world.villagers.filter((v) => canVillagerWork(world, v));
  if (builders.length === 0) return;

  // Check if player suggested an existing building upgrade first
  if (world.suggestedBuildingId) {
    const b = world.buildings.find((item) => item.id === world.suggestedBuildingId);
    if (b && b.cultureId !== 'mist_mariner' && b.level < b.maxLevel) {
      const cost = getUpgradeCost(b);
      if (hasResourcesFor(world.resources, cost)) {
        spendResources(world.resources, cost);
        const builder = builders[Math.floor(Math.random() * builders.length)];
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
  if (!nextPlan) return;

  const bp = BUILDING_BLUEPRINTS[nextPlan.type];
  const cost = getBuildCost(bp);
  if (!hasResourcesFor(world.resources, cost)) return;
  spendResources(world.resources, cost);

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
  world.buildings.push(building);

  const builder =
    builders.find((v) => v.islandId === nextPlan.islandId) ??
    builders[Math.floor(Math.random() * builders.length)];
  world.activeConstruction = {
    buildingId: building.id,
    builderId: builder.id,
    progress: 0,
    duration: nextPlan.type === 'bonfire' || nextPlan.type === 'lean_to' ? 4.5 : 8,
    isUpgrade: false,
  };
}

function pickAutonomousTask(world: WorldState, v: VillagerEntity): TaskType {
  syncCombinedFood(world);
  const pop = Math.max(1, world.villagers.length);
  const atWar = world.diplomacy.mist_mariner.status === 'war' || world.raiders.length > 0;

  if (atWar && (v.bravery > 0.58 || v.traits.includes('brave_hunter')) && getTaskAvailable(world, 'guard')) {
    return 'guard';
  }

  // Survival hunger check
  if (world.resources.food < pop * 6) {
    const foodChoices: TaskType[] = ['forage'];
    if (getTaskAvailable(world, 'farm')) foodChoices.push('farm', 'farm');
    if (getTaskAvailable(world, 'hunt')) foodChoices.push('hunt');
    if (getTaskAvailable(world, 'fish')) foodChoices.push('fish');
    if (getTaskAvailable(world, 'pasture')) foodChoices.push('pasture');
    return foodChoices[Math.floor(Math.random() * foodChoices.length)];
  }

  // Curious explorers scout undiscovered islands
  const undiscovered = ISLAND_ORDER.filter((id) => !world.islands[id].discovered);
  if (
    undiscovered.length > 0 &&
    (v.curiosity > 0.65 || v.activeWish === 'explore' || world.chiefFocus === 'explore') &&
    (getTechUnlocked(world, 'rope_bridges') || getTechUnlocked(world, 'dugout_docks')) &&
    Math.random() < 0.35
  ) {
    return 'explore';
  }

  const pool: TaskType[] = ['forage', 'chop'];
  if (getTaskAvailable(world, 'farm')) pool.push('farm', 'farm');
  if (getTaskAvailable(world, 'hunt') && (v.bravery > 0.45 || world.chiefFocus === 'harvest')) pool.push('hunt');
  if (getTaskAvailable(world, 'pasture')) pool.push('pasture');
  if (getTaskAvailable(world, 'quarry')) pool.push('quarry', ...(world.chiefFocus === 'craft' ? (['quarry'] as TaskType[]) : []));
  if (getTaskAvailable(world, 'fish')) pool.push('fish');
  if (getTaskAvailable(world, 'bake') && world.resources.grain >= 2) pool.push('bake');
  if (getTaskAvailable(world, 'study')) pool.push('study', ...(world.chiefFocus === 'craft' ? (['study'] as TaskType[]) : []));
  if (getTaskAvailable(world, 'smelt') && (world.resources.copper >= 1 || world.resources.iron >= 1)) pool.push('smelt');
  if (getTaskAvailable(world, 'guard') && world.chiefFocus === 'defense') pool.push('guard');

  return pool[Math.floor(Math.random() * pool.length)];
}

function assignTargetForTask(world: WorldState, v: VillagerEntity, task: TaskType) {
  const sameIsland = (x: number, y: number, islId: IslandId) => {
    v.targetX = x;
    v.targetY = y;
    // If no bridge and target is another island, dock or stay on island
    if (islId !== v.islandId && !findBridgeStep(world, v.islandId, islId)) {
      const dock = world.buildings.find((b) => b.islandId === v.islandId && b.type === 'dock' && b.unlocked);
      if (dock) {
        v.targetX = dock.x;
        v.targetY = dock.y;
      }
    }
  };

  if (task === 'forage') {
    const node =
      world.wildNodes.find((n) => n.islandId === v.islandId && n.amount > 0 && (n.kind === 'berry_bush' || n.kind === 'flint_pile')) ??
      world.wildNodes.find((n) => world.islands[n.islandId].discovered && n.amount > 0 && n.kind === 'berry_bush');
    if (node) {
      sameIsland(node.x + (Math.random() * 14 - 7), node.y + (Math.random() * 14 - 7), node.islandId);
      return;
    }
  } else if (task === 'chop') {
    const node =
      world.wildNodes.find((n) => n.islandId === v.islandId && n.amount > 0 && (n.kind === 'branch_pile' || n.kind === 'tree')) ??
      world.wildNodes.find((n) => world.islands[n.islandId].discovered && n.amount > 0 && n.kind === 'tree');
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
    // Head to a dock or sky-bridge anchor to explore undiscovered islands
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
    v.lastMemory = sharedFrom ? `Learned about ${concept.replace('_', ' ')} from ${sharedFrom}.` : info.memory;
  } else {
    v.thoughtBubble = 'Hmm... interesting!';
    v.thoughtTimer = 2.6;
  }

  grantKnowledge(world, isNew ? 3.5 : 0.8, particles);
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
  if (v.lifeStage === 'infant') {
    const isl = ISLAND_DEFS[v.islandId];
    const fire = getIslandBonfire(world, v.islandId);
    v.state = 'sleeping';
    v.targetX = (fire?.x ?? isl.centerX) + (Math.random() * 24 - 12);
    v.targetY = (fire?.y ?? isl.centerY) + 18;
    v.autonomyReason = 'Babbling softly and watching light beside the hearth.';
    return;
  }

  if (world.activeConstruction && world.activeConstruction.builderId === v.id) {
    return;
  }

  const t = world.environment.timeOfDay;
  const isNight = t < 0.21 || t > 0.83;
  const isColdSeason = world.environment.season === 'winter' || world.environment.weather === 'snow';
  const fire = getIslandBonfire(world, v.islandId);
  const home = world.buildings.find(
    (b) => b.unlocked && b.islandId === v.islandId && (b.type === 'cottage' || b.type === 'lean_to'),
  );

  // Seek warmth urgently if freezing
  if (v.warmth < 32 || (isColdSeason && v.warmth < 52 && fire)) {
    v.state = 'resting';
    v.targetX = (fire?.x ?? home?.x ?? ISLAND_DEFS[v.islandId].centerX) + (Math.random() * 20 - 10);
    v.targetY = (fire?.y ?? home?.y ?? ISLAND_DEFS[v.islandId].centerY) + 16;
    v.autonomyReason = fire ? 'Warming cold hands beside the Bonfire.' : 'Huddling for warmth against the frost.';
    return;
  }

  // Nightly Bonfire Bonding Ritual (dusk evening circle!)
  const isDuskRitual = t >= 0.72 && t <= 0.89;
  if (isDuskRitual && fire) {
    const ang = (v.animPhase * 1.7 + (v.x + v.y) * 0.01) % (Math.PI * 2);
    const rad = 46 + (v.hairStyle % 3) * 10;
    v.state = 'socializing';
    v.targetX = fire.x + Math.cos(ang) * rad;
    v.targetY = fire.y + Math.sin(ang) * rad * 0.82;
    v.autonomyReason = `Gathering by ${fire.name} for nightly stories & cultural bonding.`;
    return;
  }

  // Sleep at night after bonfire circle
  if (isNight && !v.traits.includes('resilient') && v.energy < 65) {
    v.state = 'sleeping';
    if (home) {
      v.targetX = home.x;
      v.targetY = home.y + 18;
      v.autonomyReason = `Sleeping warmly inside ${home.name}.`;
    } else if (fire) {
      v.targetX = fire.x + (Math.random() * 24 - 12);
      v.targetY = fire.y + 18;
      v.autonomyReason = 'Dozing beside the open Bonfire.';
    } else {
      v.targetX = ISLAND_DEFS[v.islandId].centerX + (Math.random() * 34 - 17);
      v.targetY = ISLAND_DEFS[v.islandId].centerY + 18;
      v.autonomyReason = 'Resting beneath open stars.';
    }
    return;
  }

  // Eat when hungry (or pluck wild berries if awakening and hungry)
  if (v.hunger < 45) {
    if (world.comforts[v.favoriteComfort] >= 1) {
      world.comforts[v.favoriteComfort] -= 1;
      v.hunger = Math.min(100, v.hunger + 44);
      v.hp = Math.min(v.maxHp, v.hp + 10);
      v.mood = Math.min(100, v.mood + 9);
      v.state = 'eating';
      v.autonomyReason = `Savoring ${COMFORT_LABELS[v.favoriteComfort].toLowerCase()}.`;
      v.thoughtBubble = `Warm ${v.favoriteComfort}!`;
      v.thoughtTimer = 3;
      return;
    }
    if (consumeFoodUnits(world, 1)) {
      v.hunger = Math.min(100, v.hunger + 34);
      v.hp = Math.min(v.maxHp, v.hp + 4);
      v.state = 'eating';
      v.autonomyReason = 'Eating from the island food stores.';
      return;
    }
    if (v.hunger < 26) {
      v.activeTask = 'forage';
      assignTargetForTask(world, v, 'forage');
      v.state = 'walking';
      v.autonomyReason = 'Instinctively hunting for sweet wild berries to ease hunger.';
      return;
    }
  }

  // Children explore, play, and develop their minds before adulthood
  if (v.lifeStage === 'child') {
    if (Math.random() < 0.65) {
      assignCognitiveExplorationTarget(world, v);
    } else {
      const isl = ISLAND_DEFS[v.islandId];
      v.state = 'playing';
      v.targetX = (fire?.x ?? isl.centerX) + (Math.random() * 90 - 45);
      v.targetY = (fire?.y ?? isl.centerY) + (Math.random() * 70 - 35);
      v.autonomyReason = 'Playing among wildflowers & skipping pebbles.';
    }
    return;
  }

  // Raiders threatening this island -> brave adults fight!
  const nearbyRaider = world.raiders.find((r) => r.islandId === v.islandId && r.hp > 0);
  if (nearbyRaider && (v.bravery > 0.5 || v.weaponType !== 'none' || v.activeTask === 'guard')) {
    v.state = 'fighting';
    v.targetX = nearbyRaider.x;
    v.targetY = nearbyRaider.y;
    v.autonomyReason = `Defending ${ISLAND_DEFS[v.islandId].name} from ${nearbyRaider.name.split(' ')[0]}!`;
    return;
  }

  // COGNITIVE GATE (Exploration + Social stages before Work unless Sovereign assigned a role)
  if (!canVillagerWork(world, v)) {
    const needsSocial = v.cognition.socialCount < 2;
    const peer = world.villagers.find(
      (other) => other.id !== v.id && other.islandId === v.islandId && other.lifeStage !== 'infant',
    );
    if (needsSocial && peer && (v.cognition.observedConcepts.length >= 2 || Math.random() < 0.45)) {
      v.state = 'socializing';
      v.activeTask = 'explore';
      v.targetX = peer.x + (Math.random() * 18 - 9);
      v.targetY = peer.y + (Math.random() * 18 - 9);
      v.autonomyReason = `Walking over to greet & learn with ${peer.name.split(' ')[0]} (${v.cognition.socialCount}/2 chats).`;
      return;
    }
    assignCognitiveExplorationTarget(world, v);
    return;
  }

  // Pick task (suggested or autonomous)
  const stats = getTraitStats(v);
  let chosenTask: TaskType;
  if (v.suggestedTask && getTaskAvailable(world, v.suggestedTask)) {
    const acceptChance = Math.max(0.18, Math.min(0.95, stats.obedience + (v.mood > 70 ? 0.1 : -0.15)));
    if (Math.random() <= acceptChance) {
      chosenTask = v.suggestedTask;
      v.autonomyReason = `${TASK_BY_ID[chosenTask].verb} (suggested).`;
    } else {
      chosenTask = pickAutonomousTask(world, v);
      v.autonomyReason = `Chose to ${TASK_BY_ID[chosenTask].label.toLowerCase()} instead.`;
    }
  } else {
    chosenTask = pickAutonomousTask(world, v);
    v.autonomyReason = `${TASK_BY_ID[chosenTask].verb}.`;
  }

  v.activeTask = chosenTask;
  assignTargetForTask(world, v, chosenTask);
  const dist = Math.hypot(v.x - v.targetX, v.y - v.targetY);
  v.state = chosenTask === 'hunt' ? 'hunting' : chosenTask === 'explore' ? 'exploring' : dist > 10 ? 'walking' : 'working';
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

    if (dist > 6) {
      const spd = boat.kind === 'fishing_skiff' ? 24 : boat.kind === 'cargo_merchant' ? 32 : 36;
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
          world.resources.fish += 1.4;
          syncCombinedFood(world);
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
          world.resources.copper += 2;
          world.resources.iron += 1;
        } else if (boat.targetIslandId === 'mistatoll' && world.diplomacy.mist_mariner.status !== 'war') {
          world.resources.fish += 2;
          world.resources.hearthlight += 2;
          world.diplomacy.mist_mariner.trust = Math.min(100, world.diplomacy.mist_mariner.trust + 3);
        } else if (boat.targetIslandId === 'sunterrace') {
          world.resources.grain += 2;
          world.resources.wool += 1;
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
        world.resources.grain += qty;
      } else if (cs.cropType === 'flax') {
        world.resources.wool += Math.ceil(qty * 0.7); // plant fiber equivalent for sails/cloaks
      } else if (cs.cropType === 'herbs') {
        world.resources.herbs += qty;
        world.comforts.tea = Math.min(25, world.comforts.tea + 1);
      } else if (cs.cropType === 'orchard') {
        world.resources.berries += qty;
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
        st.facing = st.targetX >= st.x ? 1 : -1;
        st.x += ((st.targetX - st.x) / d) * step;
        st.y += ((st.targetY - st.y) / d) * step;
      }
    }

    st.yieldTimer -= dt;
    if (st.yieldTimer <= 0) {
      st.yieldTimer = 22 + Math.random() * 10;
      if (st.kind === 'sheep') {
        world.resources.wool += 1.4;
        world.resources.meat += 0.4;
      } else if (st.kind === 'pig') {
        world.resources.meat += 1.5;
      } else {
        world.resources.meat += 1.0;
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
      const dmg =
        attacker.weaponType === 'iron_blade'
          ? 28
          : attacker.weaponType === 'bronze_blade'
            ? 22
            : attacker.weaponType === 'bow'
              ? 18
              : attacker.weaponType === 'flint_spear'
                ? 14
                : 6;
      h.hp -= dmg;
      attacker.attackCooldown = 1.4;
      grantKnowledge(world, 0.8, particles);

      if (h.hp <= 0) {
        const meatGain = h.kind === 'boar' ? 7 : h.kind === 'deer' ? 5 : 2;
        const hideGain = h.kind === 'boar' ? 3 : h.kind === 'deer' ? 2 : 1;
        world.resources.meat += meatGain;
        world.resources.hides += hideGain;
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
        // Deer & rabbits flee away from hunter
        const dx = h.x - attacker.x;
        const dy = h.y - attacker.y;
        const d = Math.hypot(dx, dy) || 1;
        h.targetX = h.x + (dx / d) * 65;
        h.targetY = h.y + (dy / d) * 45;
        h.pauseTimer = 0;
      }
    }

    // Aggro boar counter-attack!
    if (h.kind === 'boar' && h.aggroTargetId) {
      const preyV = world.villagers.find((v) => v.id === h.aggroTargetId && v.islandId === h.islandId);
      if (!preyV) {
        h.aggroTargetId = null;
      } else {
        const d = Math.hypot(preyV.x - h.x, preyV.y - h.y);
        if (d < 16) {
          if (Math.random() < dt * 0.9) {
            const armorMit = preyV.gearTier * 2.5;
            const dmg = Math.max(4, 14 - armorMit);
            preyV.hp = Math.max(0, preyV.hp - dmg);
            preyV.thoughtBubble = 'Boar gored me!';
            preyV.thoughtTimer = 2.6;
            if (preyV.hp <= 0) {
              killVillager(world, preyV.id, 'boar', particles);
              h.aggroTargetId = null;
            }
          }
        } else if (d < 95) {
          const step = steerEntity(world, h.islandId, h.x, h.y, preyV.x, preyV.y, 24 * dt);
          h.x = step.x;
          h.y = step.y;
          h.facing = step.facing;
          continue;
        } else {
          h.aggroTargetId = null;
        }
      }
    }

    // Normal roam with cliff-edge acknowledgement
    if (h.pauseTimer > 0) {
      h.pauseTimer -= dt;
    } else {
      const dist = Math.hypot(h.targetX - h.x, h.targetY - h.y);
      if (dist < 6) {
        h.pauseTimer = 2 + Math.random() * 4;
        const isl = ISLAND_DEFS[h.islandId];
        h.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.64);
        h.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.62);
      } else {
        const spd = h.kind === 'rabbit' ? 14 : h.kind === 'deer' ? 18 : 13;
        const step = steerEntity(world, h.islandId, h.x, h.y, h.targetX, h.targetY, spd * dt);
        h.x = step.x;
        h.y = step.y;
        h.facing = step.facing;
        if (step.hitEdge) {
          h.pauseTimer = 0.8;
          const isl = ISLAND_DEFS[h.islandId];
          h.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.55);
          h.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.55);
        }
      }
    }
  }
}

function tickDiplomacyAndWar(world: WorldState, dt: number, particles: Particle[]) {
  const mist = world.diplomacy.mist_mariner;
  if (mist.status === 'unknown') return;

  // Update status bands
  if (mist.trust >= 65) mist.status = 'peaceful';
  else if (mist.trust >= 34) mist.status = 'wary';
  else if (mist.trust >= 16) mist.status = 'tense';
  else mist.status = 'war';

  // Wary friction if war galleys or many islands settled near Mist Atoll without envoys
  if (mist.status === 'wary' && Math.random() < dt * 0.012) {
    mist.trust = Math.max(0, mist.trust - 1);
  }

  // Hostile Mist-Mariner war galleys dispatch raiders
  if (mist.status === 'war') {
    mist.raidTimer -= dt;
    if (mist.raidTimer <= 0 && world.raiders.length < 4 && world.villagers.length > 0) {
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

  // Watchtower arrow defense & Raider combat
  for (let ri = world.raiders.length - 1; ri >= 0; ri--) {
    const r = world.raiders[ri];
    if (r.hp <= 0) {
      world.raiders.splice(ri, 1);
      continue;
    }

    // Watchtower arrow volleys
    for (const tw of world.buildings) {
      if (tw.type === 'watchtower' && tw.unlocked && tw.islandId === r.islandId && Math.hypot(tw.x - r.x, tw.y - r.y) < 120) {
        r.hp -= dt * (6 + tw.level * 3);
      }
    }

    // Target nearest defender or building
    const targetV = world.villagers
      .filter((v) => v.islandId === r.islandId)
      .sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0];

    if (targetV) {
      const dist = Math.hypot(targetV.x - r.x, targetV.y - r.y);
      if (dist > 14) {
        const step = steerEntity(world, r.islandId, r.x, r.y, targetV.x, targetV.y, 21 * dt);
        r.x = step.x;
        r.y = step.y;
        r.facing = step.facing;
      } else {
        // Mutual melee
        if (r.attackCooldown <= 0) {
          r.attackCooldown = 1.6;
          const armorMit = targetV.gearTier * 2.5;
          targetV.hp = Math.max(0, targetV.hp - Math.max(4, 12 - armorMit));
          if (targetV.hp <= 0) {
            killVillager(world, targetV.id, 'combat', particles);
          }
        }
        if (targetV.hp > 0 && targetV.attackCooldown <= 0) {
          targetV.attackCooldown = 1.4;
          const vDmg =
            targetV.weaponType === 'iron_blade'
              ? 24
              : targetV.weaponType === 'bronze_blade'
                ? 18
                : targetV.weaponType === 'bow'
                  ? 14
                  : targetV.weaponType === 'flint_spear'
                    ? 11
                    : 5;
          r.hp -= vDmg;
        }
      }
    }
    if (r.attackCooldown > 0) r.attackCooldown -= dt;

    if (r.hp <= 0) {
      addChronicle(world, `Island defenders repelled ${r.name} on ${ISLAND_DEFS[r.islandId].name}.`, 'war');
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

  if (world.resources.food < world.villagers.length * 2) {
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
          for (let j = i + 1; j < gathered.length; j++) {
            const b = gathered[j];
            a.relationships[b.id] = Math.min(100, (a.relationships[b.id] ?? 30) + 5);
            b.relationships[a.id] = Math.min(100, (b.relationships[a.id] ?? 30) + 5);
          }
        }
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

    const isl = ISLAND_DEFS[cv.islandId];
    const fire = world.buildings.find((b) => b.islandId === cv.islandId && b.type === 'bonfire' && b.unlocked);

    cv.decisionCooldown -= dt;
    if (cv.decisionCooldown <= 0) {
      cv.decisionCooldown = 4 + Math.random() * 5;
      if (isDuskRitual && fire) {
        const ang = (cv.animPhase + cv.x * 0.02) % (Math.PI * 2);
        cv.state = 'socializing';
        cv.targetX = fire.x + Math.cos(ang) * 52;
        cv.targetY = fire.y + Math.sin(ang) * 42;
        cv.autonomyReason = `Sitting around ${fire.name} for nightly ${CULTURES[cv.cultureId].name} songs.`;
        if (Math.random() < 0.35) {
          cv.thoughtBubble = 'Firelight song!';
          cv.thoughtTimer = 3.0;
        }
      } else if (isNight && fire) {
        cv.state = 'sleeping';
        cv.targetX = fire.x + (Math.random() * 54 - 27);
        cv.targetY = fire.y + (Math.random() * 44 - 22);
      } else {
        cv.state = 'walking';
        cv.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.56);
        cv.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.54);
        cv.autonomyReason = `Tending ${CULTURES[cv.cultureId].name} village life on ${isl.name}.`;
      }
    }

    const d = Math.hypot(cv.targetX - cv.x, cv.targetY - cv.y);
    if (d > 8) {
      const step = steerEntity(world, cv.islandId, cv.x, cv.y, cv.targetX, cv.targetY, 26 * dt);
      cv.x = step.x;
      cv.y = step.y;
      cv.facing = step.facing;
      if (step.hitEdge && (!cv.edgeAckCooldown || cv.edgeAckCooldown <= 0)) {
        cv.edgeAckCooldown = 2.5;
        cv.thoughtBubble = 'High cliff!';
        cv.thoughtTimer = 2.0;
        cv.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.45);
        cv.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.45);
      }
    } else if (cv.state === 'walking') {
      cv.state = 'working';
    }
  }
}

export function stepSimulation(
  world: WorldState,
  rawDt: number,
  particles: Particle[],
  emitVisualParticles: boolean,
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

  // 2. Wild node slow natural regrowth
  for (const node of world.wildNodes) {
    if (node.amount < node.maxAmount) {
      node.amount = Math.min(node.maxAmount, node.amount + dt * 0.14);
    }
  }

  // 3. Autonomous Building, Tech, Native Villages & Cultural Bonfire Rituals
  tickAutonomousConstruction(world, dt, particles, emitVisualParticles);
  tickFarmingAndPastures(world, dt);
  tickWildHerdsAndHunting(world, dt, particles);
  tickBoats(world, dt, particles, emitVisualParticles);
  tickDiplomacyAndWar(world, dt, particles);
  tickClanVillagers(world, dt);
  tickVillageCulturesAndBonfireRituals(world, dt, particles, emitVisualParticles);

  // 4. Gate arrivals (rare travelers)
  const hasQueued = world.pendingArrivals.some((a) => a.kind === 'traveler');
  if (!hasQueued && world.villagers.length > 0 && world.villagers.length < 22) {
    world.nextTravelerTimer -= dt;
    if (world.nextTravelerTimer <= 0) {
      world.nextTravelerTimer = 220 + Math.random() * 140;
      const names = new Set(world.villagers.map((v) => v.name));
      const traveler = generateCandidate('traveler', world.environment.dayCount, names);
      const greeter = world.villagers.find((v) => v.lifeStage === 'adult' || v.lifeStage === 'elder') ?? null;
      if (greeter) {
        traveler.greeterId = greeter.id;
        traveler.greeterName = greeter.name;
      } else {
        evaluateTravelerDecision(world, traveler, null);
      }
      world.pendingArrivals.push(traveler);
    }
  }

  for (const arr of world.pendingArrivals) {
    if (arr.kind === 'traveler' && arr.decisionVerdict === 'talking') {
      arr.deliberationTimer -= dt;
      if (arr.deliberationTimer <= 0) {
        const greeter = arr.greeterId ? world.villagers.find((v) => v.id === arr.greeterId) ?? null : null;
        evaluateTravelerDecision(world, arr, greeter);
      }
    }
  }

  if (world.pendingArrivals.length > 0) {
    const first = world.pendingArrivals[0];
    if (first.kind === 'birth' || first.decisionVerdict !== 'talking') {
      world.autoWelcomeTimer -= dt;
      if (world.autoWelcomeTimer <= 0) {
        const accept = first.kind === 'birth' || first.decisionVerdict === 'recommend_welcome';
        const beds = getTotalHousingBeds(world);
        resolveArrival(world, first.id, accept && world.villagers.length < beds, particles);
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
    if (v.attackCooldown > 0) v.attackCooldown -= dt;
    if (v.edgeAckCooldown && v.edgeAckCooldown > 0) v.edgeAckCooldown = Math.max(0, v.edgeAckCooldown - dt);
    if (v.thoughtTimer > 0) {
      v.thoughtTimer -= dt;
      if (v.thoughtTimer <= 0) v.thoughtBubble = null;
    }

    if (v.voyageBoatId) {
      // Passenger sailing safely inside boat tick
      continue;
    }

    updateVillagerEquipment(world, v);

    // Warmth & exposure
    const fire = getIslandBonfire(world, v.islandId);
    const nearFire = fire ? Math.hypot(v.x - fire.x, v.y - fire.y) < 110 : false;
    const insideHome = v.state === 'sleeping' && hasBuildingType(world, 'cottage', v.islandId);
    const woolResist = v.gearTier >= 2 ? 0.35 : v.gearTier === 1 ? 0.65 : 1.0;

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
      const herbBoost = world.resources.herbs >= 1 ? 1.5 : 1;
      v.hp = Math.min(v.maxHp, v.hp + dt * 0.9 * herbBoost);
    }

    if (v.state === 'sleeping' || v.state === 'resting') {
      v.energy = Math.min(100, v.energy + dt * 5.2);
      v.mood = Math.min(100, v.mood + dt * 1.2);
    } else {
      v.energy = Math.max(0, v.energy - dt * 0.58 * stats.energyDrain);
    }

    // Movement across large islands (swift & natural) + cliff-edge acknowledgement
    const speed = (v.traits.includes('swift_footed') ? 44 : 34) * (v.lifeStage === 'elder' ? 0.8 : 1);
    const dist = Math.hypot(v.targetX - v.x, v.targetY - v.y);
    if (dist > 8) {
      const step = steerEntity(world, v.islandId, v.x, v.y, v.targetX, v.targetY, speed * dt);
      v.x = step.x;
      v.y = step.y;
      v.islandId = step.islandId;
      v.facing = step.facing;
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
      v.state = 'working';
    } else if (v.state === 'exploring') {
      // Arrived at object of curiosity — inspect closely like a newborn/explorer!
      v.state = 'inspecting';
      const concept = v.cognition.focusObject ?? 'horizon';
      learnConcept(world, v, concept, particles);
      v.decisionCooldown = Math.min(v.decisionCooldown, 2.8);
    }

    // Passive cognitive curiosity & social concept sharing + social interaction counter
    if (v.state === 'inspecting' || v.state === 'exploring') {
      v.cognition.awareness = Math.min(100, v.cognition.awareness + dt * (v.state === 'inspecting' ? 2.4 : 0.8));
      v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);
    }
    if (v.socialCooldown <= 0) {
      const peer = [...world.villagers, ...world.clanVillagers].find(
        (other) =>
          other.id !== v.id &&
          other.islandId === v.islandId &&
          Math.hypot(other.x - v.x, other.y - v.y) < 52,
      );
      if (peer) {
        v.socialCooldown = 10;
        v.cognition.socialCount += 1;
        peer.cognition.socialCount += 1;
        v.relationships[peer.id] = Math.min(100, (v.relationships[peer.id] ?? 32) + 3);
        peer.relationships[v.id] = Math.min(100, (peer.relationships[v.id] ?? 32) + 3);
        const novel = v.cognition.observedConcepts.find((c) => !peer.cognition.observedConcepts.includes(c));
        if (novel) {
          learnConcept(world, peer, novel, particles, v.name.split(' ')[0]);
        } else if (!v.thoughtBubble) {
          v.thoughtBubble = v.cognition.socialCount < 2 ? 'Hello, friend!' : 'Good chat!';
          v.thoughtTimer = 2.4;
        }
      }
    }

    // Task Execution & Knowledge generation (only after passing Cognitive exploration + social gates!)
    if (
      (v.state === 'working' || (v.state === 'exploring' && canVillagerWork(world, v))) &&
      canVillagerWork(world, v)
    ) {
      const rate = 0.24 * stats.workSpeed * (0.75 + (v.mood / 100) * 0.35);
      if (v.activeTask === 'forage') {
        const node = world.wildNodes.find(
          (n) => n.islandId === v.islandId && n.amount > 0.2 && (n.kind === 'berry_bush' || n.kind === 'flint_pile'),
        );
        if (node && Math.hypot(node.x - v.x, node.y - v.y) < 42) {
          const take = Math.min(node.amount, rate * 1.3 * dt);
          node.amount -= take;
          if (node.kind === 'berry_bush') {
            world.resources.berries += take;
          } else {
            world.resources.stone += take * 0.8;
          }
          syncCombinedFood(world);
          grantKnowledge(world, dt * 0.95, particles);
        } else {
          world.resources.berries += rate * 0.35 * dt;
          world.resources.stone += rate * 0.15 * dt;
          syncCombinedFood(world);
          grantKnowledge(world, dt * 0.65, particles);
        }
      } else if (v.activeTask === 'chop') {
        const woodBoost = hasBuildingType(world, 'woodshop') ? 1.35 : 1;
        world.resources.timber += rate * 1.15 * woodBoost * dt;
        grantKnowledge(world, dt * 0.65, particles);
      } else if (v.activeTask === 'quarry') {
        const crag = v.islandId === 'coppercrag';
        world.resources.stone += rate * 1.1 * dt;
        if (crag || getTechUnlocked(world, 'bronze_smelting')) {
          world.resources.copper += rate * (crag ? 0.55 : 0.18) * dt;
        }
        if (crag || getTechUnlocked(world, 'iron_statecraft')) {
          world.resources.iron += rate * (crag ? 0.35 : 0.08) * dt;
        }
        grantKnowledge(world, dt * 0.7, particles);
      } else if (v.activeTask === 'bake' && world.resources.grain >= 0.2) {
        const bakeAmt = Math.min(world.resources.grain, 0.22 * dt);
        world.resources.grain -= bakeAmt;
        world.comforts.bread = Math.min(25, world.comforts.bread + bakeAmt * 0.55);
        world.resources.hearthlight += 0.25 * dt;
        syncCombinedFood(world);
        grantKnowledge(world, dt * 0.5, particles);
      } else if (v.activeTask === 'study') {
        v.cognition.awareness = Math.min(100, v.cognition.awareness + dt * 1.8);
        v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);
        grantKnowledge(world, dt * 1.85, particles);
        world.resources.hearthlight += 0.22 * dt;
      } else if (v.activeTask === 'smelt') {
        if (world.resources.copper >= 0.2) {
          const take = Math.min(world.resources.copper, 0.2 * dt);
          world.resources.copper -= take;
          world.resources.bronze += take * 0.85;
        }
        grantKnowledge(world, dt * 0.85, particles);
      } else if (v.activeTask === 'fish') {
        world.resources.fish += rate * 0.9 * dt;
        syncCombinedFood(world);
        grantKnowledge(world, dt * 0.55, particles);
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
        grantKnowledge(world, dt * 0.7, particles);
      }
    }

    v.decisionCooldown -= dt;
    if (v.decisionCooldown <= 0) {
      v.decisionCooldown = v.cognition.stage === 'awakening' ? 3.5 + Math.random() * 2.5 : 5 + Math.random() * 5;
      decideVillagerBehavior(world, v);
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
      if (step.hitEdge) {
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

  // Births when couples are well-fed, housed, and flourishing
  const beds = getTotalHousingBeds(world);
  if (world.villagers.length < beds && world.villagers.length < 18 && world.pendingArrivals.length === 0) {
    const couple = world.villagers.find(
      (v) =>
        v.lifeStage === 'adult' &&
        v.partnerId &&
        v.birthCooldownDays <= 0 &&
        v.mood >= 65 &&
        v.hunger >= 55 &&
        world.resources.food >= world.villagers.length * 4,
    );
    if (couple && Math.random() < 0.35) {
      const partner = world.villagers.find((p) => p.id === couple.partnerId);
      if (partner) {
        couple.birthCooldownDays = 4;
        partner.birthCooldownDays = 4;
        const names = new Set(world.villagers.map((item) => item.name));
        const baby = generateCandidate('birth', world.environment.dayCount, names, [
          { id: couple.id, name: couple.name, traits: couple.traits },
          { id: partner.id, name: partner.name, traits: partner.traits },
        ]);
        world.pendingArrivals.push(baby);
      }
    }
  }

  // Aging & Elder Mortality
  for (let i = world.villagers.length - 1; i >= 0; i--) {
    const v = world.villagers[i];
    v.ageDays += 1;
    v.wishFulfilledToday = false;
    v.activeWish = pickRandomWish();
    if (v.birthCooldownDays > 0) v.birthCooldownDays -= 1;

    if (v.lifeStage === 'infant' && v.ageDays >= 3) {
      v.lifeStage = 'child';
    } else if (v.lifeStage === 'child' && v.ageDays >= 8) {
      v.lifeStage = 'adult';
    } else if (v.lifeStage === 'adult' && v.ageDays >= 30) {
      v.lifeStage = 'elder';
      v.hairColor = '#B9B5AE';
    } else if (v.lifeStage === 'elder' && v.ageDays >= 46 && Math.random() < 0.22) {
      killVillager(world, v.id, 'old_age', []);
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

  if (!accept) {
    addChronicle(world, `${cand.name} parted peacefully from Cradle Isle.`, 'arrival');
    return;
  }

  const cradle = ISLAND_DEFS.cradle;
  const villager: VillagerEntity = {
    id: `vil_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: cand.name,
    bioDescription: cand.bioDescription,
    cultureId: 'hearthfolk',
    islandId: 'cradle',
    cloakColor: cand.cloakColor,
    hairColor: cand.hairColor,
    skinTone: cand.skinTone,
    hairStyle: cand.hairStyle,
    lifeStage: cand.lifeStage,
    ageDays: cand.kind === 'birth' ? 0 : 16,
    isChief: false,
    traits: cand.traits,
    partnerId: null,
    parentIds: cand.parentIds,
    childrenIds: [],
    homeBuildingId: null,
    hp: 100,
    maxHp: 100,
    warmth: 85,
    mood: 82,
    energy: 88,
    hunger: 80,
    affectionXp: 15,
    affectionLevel: 1,
    gearTier: getTechUnlocked(world, 'woven_shelter') ? 1 : 0,
    weaponType: 'none',
    curiosity: cand.traits.includes('curious_scout') ? 0.85 : 0.5,
    bravery: cand.traits.includes('brave_hunter') ? 0.8 : 0.5,
    voyageBoatId: null,
    killCount: 0,
    cognition:
      cand.kind === 'birth'
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
    currentDialogue: cand.kind === 'birth' ? 'Soft curious blinking beside the warm embers.' : 'Let me explore these cliffs and meet your people first!',
    lastMemory: cand.kind === 'birth' ? 'Born beside the warm hearth.' : 'Stepped ashore curious to learn Hearthglen customs.',
    relationships: {},
    hangOutTargetId: null,
    socialCooldown: 0,
    suggestedTask: null,
    activeTask: 'explore',
    state: cand.kind === 'birth' ? 'sleeping' : 'exploring',
    autonomyReason: cand.kind === 'birth' ? 'Taking in warmth and light like a newborn.' : 'Exploring Cradle Isle and chatting with locals before work.',
    thoughtBubble: cand.kind === 'birth' ? 'Ooh...' : 'New land!',
    thoughtTimer: 3.5,
    x: cradle.centerX + (Math.random() * 48 - 24),
    y: cradle.centerY + (Math.random() * 36 - 18),
    targetX: cradle.centerX,
    targetY: cradle.centerY,
    facing: 1,
    animPhase: 0,
    bounceScale: 1,
    decisionCooldown: 2,
    birthCooldownDays: 0,
    attackCooldown: 0,
    edgeAckCooldown: 0,
  };
  world.villagers.push(villager);
  addChronicle(
    world,
    cand.kind === 'birth' ? `Baby ${cand.name} was born!` : `${cand.name} joined Hearthglen!`,
    cand.kind === 'birth' ? 'birth' : 'arrival',
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
  if (arr.kind === 'birth') {
    resolveArrival(world, arrivalId, true, particles);
    return { ok: true, message: `Celebrated ${arr.name}'s birth!` };
  }
  const greeter = arr.greeterId ? world.villagers.find((v) => v.id === arr.greeterId) ?? null : null;
  const verdict = evaluateTravelerDecision(world, arr, greeter);
  const beds = getTotalHousingBeds(world);
  const accept = verdict === 'recommend_welcome' && world.villagers.length < beds;
  resolveArrival(world, arrivalId, accept, particles);
  return {
    ok: true,
    message: accept ? `Villagers welcomed ${arr.name}!` : `Villagers declined ${arr.name}.`,
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

  // Sovereign Sandbox: immediate full control
  if (world.gameMode === 'sovereign_sandbox') {
    if (task) {
      v.cognition.awareness = Math.max(v.cognition.awareness, 55);
      v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);
      v.cognition.socialCount = Math.max(v.cognition.socialCount, 2);
      v.suggestedTask = task;
      v.activeTask = task;
      assignTargetForTask(world, v, task);
      v.state = task === 'hunt' ? 'hunting' : task === 'explore' ? 'exploring' : 'walking';
      v.autonomyReason = `${TASK_BY_ID[task].verb} (Sovereign Decree).`;
      v.thoughtBubble = `${TASK_BY_ID[task].label}!`;
      v.thoughtTimer = 2.6;
      v.decisionCooldown = 8;
      return { accepted: true, message: `Commanded ${v.name.split(' ')[0]} to ${TASK_BY_ID[task].label}.` };
    }
    v.suggestedTask = null;
    v.decisionCooldown = 0.5;
    return { accepted: true, message: `${v.name.split(' ')[0]} freed to follow autonomy.` };
  }

  if (v.isNativeClan) {
    return { accepted: false, message: `${v.name.split(' ')[0]} follows their native clan elders.` };
  }
  if (task && task !== 'explore' && !canVillagerWork(world, v)) {
    return {
      accepted: false,
      message: `${v.name.split(' ')[0]} needs ${Math.max(0, 3 - v.cognition.observedConcepts.length)} more wonders & ${Math.max(0, 2 - v.cognition.socialCount)} more social chats first!`,
    };
  }
  if (task && !getTaskAvailable(world, task)) {
    return { accepted: false, message: 'Requires an unlocked discovery & structure first.' };
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
  v.relationships[t.id] = Math.min(100, (v.relationships[t.id] ?? 30) + 4);
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
): { ok: boolean; message: string } {
  const dip = world.diplomacy[cultureId];
  if (!dip) return { ok: false, message: 'Unknown culture.' };
  if (cultureId !== 'mist_mariner' && world.gameMode !== 'sovereign_sandbox') {
    return { ok: false, message: 'Already peaceful allies.' };
  }
  if (action === 'gift') {
    if (world.gameMode !== 'sovereign_sandbox') {
      if (world.resources.timber < 10 && world.resources.grain < 6) {
        return { ok: false, message: 'Need at least 10 Timber or 6 Grain to offer a trade gift.' };
      }
      if (world.resources.timber >= 10) world.resources.timber -= 10;
      else world.resources.grain -= 6;
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

export function applyWorldCommand(
  world: WorldState,
  cmd: WorldCommand,
  particles: Particle[],
): { ok: boolean; message: string } {
  switch (cmd.kind) {
    case 'set_speed':
      world.settings.simSpeed = cmd.speed;
      return { ok: true, message: cmd.speed === 0 ? 'Simulation paused.' : `Simulation speed ${cmd.speed}x.` };
    case 'assign_task': {
      const r = suggestVillagerRole(world, cmd.villagerId, cmd.task);
      return { ok: r.accepted, message: r.message };
    }
    case 'move_villager': {
      const all = [...world.villagers, ...world.clanVillagers];
      const v = all.find((i) => i.id === cmd.villagerId);
      if (!v) return { ok: false, message: 'Inhabitant not found.' };
      const isl = ISLAND_DEFS[cmd.islandId];
      if (!isPointInsideIsland(isl, cmd.x, cmd.y, 12)) {
        return { ok: false, message: 'Click inside an island plateau to move.' };
      }
      if (v.islandId !== cmd.islandId && world.gameMode === 'sovereign_sandbox') {
        v.islandId = cmd.islandId;
        v.x = cmd.x;
        v.y = cmd.y;
      }
      v.targetX = cmd.x;
      v.targetY = cmd.y;
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
      const msg = sendVillagerToHangOut(world, cmd.villagerId, cmd.targetId);
      return { ok: true, message: msg };
    }
    case 'set_chief': {
      const r = suggestChief(world, cmd.villagerId);
      return { ok: r.ok, message: r.reason };
    }
    case 'set_chief_focus':
      setChiefFocus(world, cmd.focus);
      return { ok: true, message: `Chief Focus set to ${cmd.focus}.` };
    case 'place_building':
      return suggestBuildingSpot(world, cmd.buildingType, cmd.islandId, cmd.x, cmd.y, cmd.cropType, cmd.livestockKind);
    case 'upgrade_building':
      return suggestBuildingProject(world, cmd.buildingId);
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
      return suggestDiplomacyAction(world, cmd.cultureId, cmd.action);
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
      for (const v of world.villagers) v.mood = Math.min(100, v.mood + 18);
      addChronicle(world, world.environment.festivalActive ? 'Lantern Festival lit across the archipelago!' : 'Lantern Festival drew softly to a close.', 'festival');
      return { ok: true, message: world.environment.festivalActive ? 'Festival ignited!' : 'Festival ended.' };
    case 'sovereign_grant_resources':
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
      world.resources.berries += 40;
      world.resources.grain += 40;
      world.resources.timber += 60;
      world.resources.stone += 50;
      world.resources.copper += 25;
      world.resources.bronze += 20;
      world.resources.iron += 20;
      world.resources.wool += 25;
      world.resources.hearthlight += 30;
      syncCombinedFood(world);
      return { ok: true, message: 'Granted archipelago bounty (+60 Timber, +50 Stone, Food & Ores).' };
    case 'sovereign_spawn_villager': {
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
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
      nv.cultureId = world.islands[cmd.islandId]?.owningCultureId ?? 'hearthfolk';
      nv.x = isl.centerX + (Math.random() * 60 - 30);
      nv.y = isl.centerY + (Math.random() * 44 - 22);
      nv.targetX = isl.centerX;
      nv.targetY = isl.centerY;
      nv.cognition = { stage: 'reasoning', awareness: 65, observedConcepts: ['berry_bush', 'spring', 'embers'], socialCount: 2, focusObject: null };
      world.villagers.push(nv);
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
    case 'sovereign_uplift_villager': {
      if (world.gameMode !== 'sovereign_sandbox') return { ok: false, message: 'Requires Sovereign Sandbox mode.' };
      const v = [...world.villagers, ...world.clanVillagers].find((i) => i.id === cmd.villagerId);
      if (!v) return { ok: false, message: 'Inhabitant not found.' };
      v.hp = v.maxHp;
      v.hunger = 100;
      v.warmth = 100;
      v.energy = 100;
      v.mood = 100;
      v.cognition = {
        stage: 'enlightened',
        awareness: 100,
        observedConcepts: ['berry_bush', 'flint_pile', 'branch_pile', 'spring', 'embers', 'horizon'],
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
    default:
      return { ok: false, message: 'Unsupported command.' };
  }
}

export function applyOfflineProgress(world: WorldState, elapsedSeconds: number): string | null {
  if (elapsedSeconds < 20 || world.villagers.length === 0) return null;
  const simSec = Math.min(elapsedSeconds, 1800);
  const pop = world.villagers.length;
  world.resources.berries += Math.round(pop * (simSec / 90));
  world.resources.timber += Math.round(pop * (simSec / 110));
  syncCombinedFood(world);
  return `While away (${Math.round(simSec / 60)}m), inhabitants gathered supplies around the hearth.`;
}

function buildAspirations(world: WorldState): AspirationItem[] {
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
      id: 'asp_discover',
      title: 'Explorers chart or link 3 floating islands',
      check: () => Object.values(world.islands).filter((i) => i.discovered).length >= 3,
      reward: 22,
    },
    {
      id: 'asp_bronze',
      title: 'Smelt Bronze & explore all 5 islands',
      check: () =>
        getTechUnlocked(world, 'bronze_smelting') &&
        Object.values(world.islands).every((i) => i.discovered),
      reward: 35,
    },
  ];
  return list.map((a) => ({
    id: a.id,
    title: a.title,
    rewardHearthlight: a.reward,
    completed: a.check(),
  }));
}

export function createHudSnapshot(world: WorldState): HudSnapshot {
  syncCombinedFood(world);
  return {
    gameMode: world.gameMode,
    era: world.era,
    resources: { ...world.resources },
    comforts: { ...world.comforts },
    knowledgeXp: world.knowledgeXp,
    unlockedTechIds: [...world.unlockedTechIds],
    activeTechId: world.activeTechId,
    islands: { ...world.islands },
    villageCultures: { ...world.villageCultures },
    bridges: world.bridges.map((b) => ({ ...b })),
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
    aspirations: buildAspirations(world),
    chiefId: world.chiefId,
    chiefFocus: world.chiefFocus,
    environment: { ...world.environment },
    totalHousingBeds: getTotalHousingBeds(world),
    populationCount: world.villagers.length,
    activeConstruction: world.activeConstruction ? { ...world.activeConstruction } : null,
    suggestedBuildingId: world.suggestedBuildingId,
    prosperityScore: world.prosperityScore,
    villageTrajectory: world.villageTrajectory,
    trajectoryReasons: [...world.trajectoryReasons],
    ruinDaysCount: world.ruinDaysCount,
    departedCount: world.departedCount,
    deathCount: world.deathCount,
  };
}

// Keep unused TECH_TREE reference clean if imported for future helpers
export { TECH_TREE };
