import { BUILDING_BLUEPRINTS, TECH_BY_ID } from './techAndCultures';
import type {
  ArrivalCandidate,
  BuildingEntity,
  ChiefFocus,
  ComfortItem,
  IslandDef,
  IslandId,
  IslandPondSpec,
  IslandRiverSpec,
  LifeStage,
  SeasonType,
  SkillId,
  SkyBridgeEntity,
  SkyCablewayEntity,
  SocialTier,
  TaskType,
  TimePreset,
  TraitDefinition,
  TravelerAttitude,
  UnitStats,
  VillageEra,
  VillageResources,
  VillagerWishType,
  WeatherType,
} from './types';

export const WORLD_WIDTH = 7600;
export const WORLD_HEIGHT = 5200;
export const WORLD_SCALE = 0.085; // 7600x5200 -> 646x442 3D world units
export const CURRENT_WORLD_VERSION = 9;
export const DEFAULT_WORLD_SEED = 104729;

export function mulberry32(seed: number): () => number {
  let a = (Math.floor(Math.abs(seed)) || 1) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrapAngleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export function islandCoastWobble(
  def: Pick<IslandDef, 'centerX' | 'centerY' | 'coastSeed' | 'coastRotRad' | 'coveAngles'>,
  angleRad: number,
): number {
  const rot = def.coastRotRad ?? 0;
  const a = angleRad - rot;
  const seedBase = def.coastSeed ?? Math.round(def.centerX * 13 + def.centerY * 17);
  const p1 = (seedBase % 997) * 0.017;
  const p2 = ((seedBase * 7) % 991) * 0.019;
  const p3 = ((seedBase * 13) % 983) * 0.023;
  const p4 = ((seedBase * 29) % 977) * 0.031;

  let wobble =
    1 +
    Math.sin(a * 2 + p1) * 0.068 +
    Math.cos(a * 3 - p2) * 0.056 +
    Math.sin(a * 5 + p3) * 0.036 +
    Math.cos(a * 7 - p4) * 0.018;

  if (def.coveAngles && def.coveAngles.length > 0) {
    for (let i = 0; i < def.coveAngles.length; i++) {
      const diff = Math.abs(wrapAngleDiff(angleRad, def.coveAngles[i]));
      if (diff < 0.44) {
        // Organic inward coastal bay / river-mouth estuary notch
        wobble -= Math.exp(-(diff * diff) / 0.036) * 0.135;
      }
    }
  }

  return Math.max(0.75, Math.min(1.24, wobble));
}

export function getIslandRimPoint(
  def: IslandDef,
  angleRad: number,
  radiusFraction = 0.94,
): { x: number; y: number } {
  const wobble = islandCoastWobble(def, angleRad) * radiusFraction;
  return {
    x: Math.round(def.centerX + Math.cos(angleRad) * def.radiusX * wobble),
    y: Math.round(def.centerY + Math.sin(angleRad) * def.radiusY * wobble),
  };
}

function createDockSpot(def: Omit<IslandDef, 'dockSpot'>, angleRad: number): IslandDef['dockSpot'] {
  const wobble = islandCoastWobble(def, angleRad);
  const rx = def.radiusX * wobble;
  const ry = def.radiusY * wobble;
  return {
    x: Math.round(def.centerX + Math.cos(angleRad) * rx * 0.87),
    y: Math.round(def.centerY + Math.sin(angleRad) * ry * 0.87),
    seaX: Math.round(def.centerX + Math.cos(angleRad) * (rx + 185)),
    seaY: Math.round(def.centerY + Math.sin(angleRad) * (ry + 185)),
  };
}

function buildSplineRiverPoints(
  radiusX: number,
  radiusY: number,
  wobbleAtAngle: (ang: number) => number,
  startDx: number,
  startDy: number,
  exitAngle: number,
  rng: () => number,
  bendSign: number,
  steps = 9,
): { dx: number; dy: number }[] {
  const rimWob = wobbleAtAngle(exitAngle);
  const endDx = Math.cos(exitAngle) * radiusX * rimWob * 1.07;
  const endDy = Math.sin(exitAngle) * radiusY * rimWob * 1.07;
  const chordX = endDx - startDx;
  const chordY = endDy - startDy;
  const chordLen = Math.hypot(chordX, chordY) || 1;
  const perpX = -chordY / chordLen;
  const perpY = chordX / chordLen;
  const meanderAmp = (0.14 + rng() * 0.14) * chordLen * bendSign;

  const pts: { dx: number; dy: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const envelope = Math.sin(t * Math.PI);
    const sWave = Math.sin(t * Math.PI * 1.65) * meanderAmp * envelope;
    let dx = startDx + chordX * t + perpX * sWave;
    let dy = startDy + chordY * t + perpY * sWave;
    // Keep central bonfire clearing dry unless starting near spring
    const dCenter = Math.hypot(dx, dy);
    const minCenterClear = 152;
    if (i > 0 && i < steps && dCenter < minCenterClear) {
      const pushAng = Math.atan2(dy || perpY, dx || perpX);
      dx = Math.cos(pushAng) * minCenterClear;
      dy = Math.sin(pushAng) * minCenterClear;
    }
    pts.push({ dx: Math.round(dx), dy: Math.round(dy) });
  }
  return pts;
}

interface IslandArchetypeTemplate {
  id: IslandId;
  name: string;
  subtitle: string;
  biome: IslandDef['biome'];
  terrainStyle: IslandDef['terrainStyle'];
  roleTag: IslandDef['roleTag'];
  baseRx: number;
  baseRy: number;
  baseElev: number;
  defaultCultureId: IslandDef['defaultCultureId'];
  hasSpring: boolean;
  hasWaterfall: boolean;
  riverCountRange: [number, number];
  ringBand: 'center' | 'inner' | 'outer';
  oreRichness: IslandDef['oreRichness'];
  soilQuality: number;
}

const ARCHIPELAGO_TEMPLATES: Record<IslandId, IslandArchetypeTemplate> = {
  cradle: {
    id: 'cradle',
    name: 'Cradle Isle',
    subtitle: 'Sunlit meadow basin with mossy spring, winding stream & sheltered coastal coves.',
    biome: 'meadow',
    terrainStyle: 'basin',
    roleTag: 'homeland',
    baseRx: 780,
    baseRy: 550,
    baseElev: 0.72,
    defaultCultureId: 'hearthfolk',
    hasSpring: true,
    hasWaterfall: false,
    riverCountRange: [1, 2],
    ringBand: 'center',
    oreRichness: 'stone',
    soilQuality: 0.95,
  },
  timbercrown: {
    id: 'timbercrown',
    name: 'Timbercrown Cliffside',
    subtitle: 'Steep cedar cliffside escarpment home to the Cedarwood Sylvans.',
    biome: 'pine',
    terrainStyle: 'cliffside',
    roleTag: 'timber',
    baseRx: 840,
    baseRy: 470,
    baseElev: 5.6,
    defaultCultureId: 'sylvan',
    hasSpring: true,
    hasWaterfall: true,
    riverCountRange: [1, 1],
    ringBand: 'inner',
    oreRichness: 'stone',
    soilQuality: 0.85,
  },
  sunterrace: {
    id: 'sunterrace',
    name: 'Sun-Terrace Rivers',
    subtitle: 'Expansive multi-river valley of fertile golden loam, coastal estuaries & cascades.',
    biome: 'terrace',
    terrainStyle: 'multi_river',
    roleTag: 'harvest',
    baseRx: 940,
    baseRy: 640,
    baseElev: 0.92,
    defaultCultureId: 'hearthfolk',
    hasSpring: true,
    hasWaterfall: false,
    riverCountRange: [2, 3],
    ringBand: 'inner',
    oreRichness: 'none',
    soilQuality: 1.32,
  },
  starbloom: {
    id: 'starbloom',
    name: 'Starbloom Ruins',
    subtitle: 'Jade-meadow exploration sanctuary with ancient ruins, rivers, orchards & spring coves.',
    biome: 'ruins',
    terrainStyle: 'ruins',
    roleTag: 'exploration',
    baseRx: 700,
    baseRy: 515,
    baseElev: 1.45,
    defaultCultureId: 'hearthfolk',
    hasSpring: true,
    hasWaterfall: true,
    riverCountRange: [1, 1],
    ringBand: 'inner',
    oreRichness: 'stone',
    soilQuality: 1.15,
  },
  coppercrag: {
    id: 'coppercrag',
    name: 'Copper-Crag Spire',
    subtitle: 'Steep basalt caldera & mineral crags settled by the Cragforge Smiths.',
    biome: 'crag',
    terrainStyle: 'caldera',
    roleTag: 'forge',
    baseRx: 620,
    baseRy: 460,
    baseElev: 6.4,
    defaultCultureId: 'cragforge',
    hasSpring: false,
    hasWaterfall: true,
    riverCountRange: [0, 0],
    ringBand: 'outer',
    oreRichness: 'rich_metals',
    soilQuality: 0.55,
  },
  mistatoll: {
    id: 'mistatoll',
    name: 'Outer Mist Atoll',
    subtitle: 'Crescent sea-cliff lagoon opening into tranquil turquoise shoals.',
    biome: 'mist_atoll',
    terrainStyle: 'atoll',
    roleTag: 'harbor',
    baseRx: 540,
    baseRy: 410,
    baseElev: 0.62,
    defaultCultureId: 'mist_mariner',
    hasSpring: true,
    hasWaterfall: false,
    riverCountRange: [0, 0],
    ringBand: 'outer',
    oreRichness: 'stone',
    soilQuality: 0.8,
  },
  embervault: {
    id: 'embervault',
    name: 'Ashen Bastion',
    subtitle: 'Unbridged volcanic fortress holding rich iron vaults—guarded by the hostile Ashen Bastion.',
    biome: 'volcanic',
    terrainStyle: 'volcanic',
    roleTag: 'battle',
    baseRx: 660,
    baseRy: 480,
    baseElev: 4.5,
    defaultCultureId: 'ashen_raider',
    hasSpring: false,
    hasWaterfall: false,
    riverCountRange: [0, 0],
    ringBand: 'outer',
    oreRichness: 'rich_metals',
    soilQuality: 0.45,
  },
  frostpeak: {
    id: 'frostpeak',
    name: 'Frostpeak Massif',
    subtitle: 'Towering unbridged alpine massif with snow ridges, mountain stream & iron veins.',
    biome: 'frost',
    terrainStyle: 'mountain',
    roleTag: 'alpine',
    baseRx: 780,
    baseRy: 560,
    baseElev: 8.2,
    defaultCultureId: 'cragforge',
    hasSpring: true,
    hasWaterfall: true,
    riverCountRange: [0, 1],
    ringBand: 'outer',
    oreRichness: 'rich_metals',
    soilQuality: 0.4,
  },
};

export const ISLAND_ORDER: IslandId[] = [
  'cradle',
  'timbercrown',
  'sunterrace',
  'coppercrag',
  'mistatoll',
  'starbloom',
  'embervault',
  'frostpeak',
];

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function generateSeededArchipelago(seed: number): Record<IslandId, IslandDef> {
  const rng = mulberry32(seed);
  const placed: Partial<Record<IslandId, { centerX: number; centerY: number; radiusX: number; radiusY: number }>> = {};

  const marginX = 760;
  const marginY = 660;

  // 1. Place Cradle Isle in a varied central sea region
  const cradleTpl = ARCHIPELAGO_TEMPLATES.cradle;
  const cradleRx = Math.round(cradleTpl.baseRx * (0.9 + rng() * 0.2));
  const cradleRy = Math.round(cradleTpl.baseRy * (0.9 + rng() * 0.2));
  const cradleCx = Math.round(2850 + rng() * 1900);
  const cradleCy = Math.round(2050 + rng() * 1100);
  placed.cradle = { centerX: cradleCx, centerY: cradleCy, radiusX: cradleRx, radiusY: cradleRy };

  const overlapsAny = (cx: number, cy: number, rx: number, ry: number, minGap: number): boolean => {
    if (cx - rx < marginX || cx + rx > WORLD_WIDTH - marginX) return true;
    if (cy - ry < marginY || cy + ry > WORLD_HEIGHT - marginY) return true;
    for (const p of Object.values(placed)) {
      if (!p) continue;
      const dx = cx - p.centerX;
      const dy = cy - p.centerY;
      const nx = dx / (rx + p.radiusX + minGap);
      const ny = dy / (ry + p.radiusY + minGap);
      if (nx * nx + ny * ny < 1.05) return true;
    }
    return false;
  };

  // 2. Place inner & outer islands in randomized sector angles without fixed coordinates
  const innerIds = shuffleWithRng<IslandId>(['timbercrown', 'sunterrace', 'starbloom'], rng);
  const outerIds = shuffleWithRng<IslandId>(['coppercrag', 'mistatoll', 'embervault', 'frostpeak'], rng);
  const baseInnerPhase = rng() * Math.PI * 2;
  const baseOuterPhase = rng() * Math.PI * 2;

  const placeRing = (ids: IslandId[], baseAngle: number, distMin: number, distMax: number) => {
    for (let idx = 0; idx < ids.length; idx++) {
      const id = ids[idx];
      const tpl = ARCHIPELAGO_TEMPLATES[id];
      const rx = Math.round(tpl.baseRx * (0.86 + rng() * 0.26));
      const ry = Math.round(tpl.baseRy * (0.86 + rng() * 0.26));
      let chosenX = cradleCx + 1500;
      let chosenY = cradleCy;
      let found = false;

      for (const gap of [300, 220, 150]) {
        for (let attempt = 0; attempt < 90; attempt++) {
          const sectorAng =
            baseAngle +
            (idx / ids.length) * Math.PI * 2 +
            (rng() - 0.5) * (attempt < 24 ? 0.85 : Math.PI * 1.4);
          const dist = distMin + rng() * (distMax - distMin);
          const cx = Math.round(cradleCx + Math.cos(sectorAng) * dist * 1.24);
          const cy = Math.round(cradleCy + Math.sin(sectorAng) * dist * 0.92);
          if (!overlapsAny(cx, cy, rx, ry, gap)) {
            chosenX = cx;
            chosenY = cy;
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (!found) {
        // Fallback wide scan across world interior
        for (let attempt = 0; attempt < 220; attempt++) {
          const cx = Math.round(marginX + rx + rng() * (WORLD_WIDTH - (marginX + rx) * 2));
          const cy = Math.round(marginY + ry + rng() * (WORLD_HEIGHT - (marginY + ry) * 2));
          if (!overlapsAny(cx, cy, rx, ry, 140)) {
            chosenX = cx;
            chosenY = cy;
            break;
          }
        }
      }

      placed[id] = { centerX: chosenX, centerY: chosenY, radiusX: rx, radiusY: ry };
    }
  };

  placeRing(innerIds, baseInnerPhase, 1380, 1850);
  placeRing(outerIds, baseOuterPhase, 2250, 3200);

  // 3. Populate procedural terrain shapes, rivers, ponds, coves & dock anchors for each island
  const defs = {} as Record<IslandId, IslandDef>;
  for (const id of ISLAND_ORDER) {
    const tpl = ARCHIPELAGO_TEMPLATES[id];
    const box = placed[id]!;
    const coastSeed = Math.floor(rng() * 1_000_000) + 1;
    const coastRotRad = Number((rng() * Math.PI * 2).toFixed(3));
    const ridgeAngle = Number((rng() * Math.PI * 2).toFixed(3));
    const elevationY = Number((tpl.baseElev * (0.88 + rng() * 0.24)).toFixed(2));

    // Spring placed clearly away from central clearing plaza
    let springOffset: { dx: number; dy: number } | undefined;
    if (tpl.hasSpring) {
      const sAng = rng() * Math.PI * 2;
      const sRad = 0.28 + rng() * 0.22;
      let sdx = Math.round(Math.cos(sAng) * box.radiusX * sRad);
      let sdy = Math.round(Math.sin(sAng) * box.radiusY * sRad);
      if (Math.hypot(sdx, sdy) < 175) {
        const push = 178 / Math.max(1, Math.hypot(sdx, sdy));
        sdx = Math.round(sdx * push);
        sdy = Math.round(sdy * push);
      }
      springOffset = { dx: sdx, dy: sdy };
    }

    // Dock faces toward Cradle (or open water if Cradle) inside a sheltered cove
    const rawToCradle =
      id === 'cradle'
        ? rng() * Math.PI * 2
        : Math.atan2(cradleCy - box.centerY, cradleCx - box.centerX);
    const dockAngleRad = rawToCradle + (rng() - 0.5) * 0.65;

    // Pick waterfall angle on cliffside/highland islands cleanly away from the dock cove
    let waterfallAngle: number | undefined;
    if (tpl.hasWaterfall) {
      waterfallAngle = dockAngleRad + (rng() > 0.5 ? 1 : -1) * (1.25 + rng() * 1.15);
    }

    // Build coastal cove angles (dock bay + river estuary mouths)
    const coveAngles: number[] = [dockAngleRad];
    const riverMouthAngles: number[] = [];
    const minRiv = tpl.riverCountRange[0];
    const maxRiv = tpl.riverCountRange[1];
    const riverCount = maxRiv > minRiv ? minRiv + Math.floor(rng() * (maxRiv - minRiv + 1)) : minRiv;

    for (let r = 0; r < riverCount; r++) {
      let mouthAng =
        r === 0 && waterfallAngle !== undefined && (id === 'timbercrown' || id === 'frostpeak')
          ? waterfallAngle
          : dockAngleRad + Math.PI * (0.45 + r * 0.62) + (rng() - 0.5) * 0.42;
      // Keep non-cliff river estuaries away from the dock pier itself
      if (Math.abs(wrapAngleDiff(mouthAng, dockAngleRad)) < 0.52) {
        mouthAng = dockAngleRad + (r % 2 === 0 ? 0.78 : -0.78);
      }
      riverMouthAngles.push(mouthAng);
      // Low/medium coast estuaries carve natural sandy bays where river meets sea
      if (!(tpl.hasWaterfall && waterfallAngle !== undefined && Math.abs(wrapAngleDiff(mouthAng, waterfallAngle)) < 0.25)) {
        coveAngles.push(mouthAng);
      }
    }

    // Mist Atoll lagoon opening & Embervault caldera fissure offsets (seeded)
    let lagoonOffset: { lx: number; ly: number } | undefined;
    let trenchOffset: { lx: number; ly: number } | undefined;
    if (id === 'mistatoll') {
      const lAng = dockAngleRad + (rng() - 0.5) * 0.5;
      lagoonOffset = {
        lx: Number((Math.cos(lAng) * 0.16).toFixed(3)),
        ly: Number((Math.sin(lAng) * 0.16).toFixed(3)),
      };
    } else if (id === 'embervault') {
      const tAng = rng() * Math.PI * 2;
      trenchOffset = {
        lx: Number((Math.cos(tAng) * 0.34).toFixed(3)),
        ly: Number((Math.sin(tAng) * 0.34).toFixed(3)),
      };
    }

    const partialDef: Omit<IslandDef, 'dockSpot'> = {
      id,
      name: tpl.name,
      subtitle: tpl.subtitle,
      biome: tpl.biome,
      terrainStyle: tpl.terrainStyle,
      roleTag: tpl.roleTag,
      centerX: box.centerX,
      centerY: box.centerY,
      radiusX: box.radiusX,
      radiusY: box.radiusY,
      elevationY,
      defaultCultureId: tpl.defaultCultureId,
      hasSpring: tpl.hasSpring,
      springOffset,
      hasWaterfall: tpl.hasWaterfall,
      waterfallAngle,
      coastSeed,
      coastRotRad,
      ridgeAngle,
      coveAngles,
      riverMouthAngles,
      dockAngleRad,
      lagoonOffset,
      trenchOffset,
      oreRichness: tpl.oreRichness,
      soilQuality: tpl.soilQuality,
    };

    const wobbleAt = (ang: number) => islandCoastWobble(partialDef, ang);

    // Generate smooth spline rivers starting at spring or highland headwaters -> coastal bay / waterfall
    const rivers: IslandRiverSpec[] = [];
    for (let r = 0; r < riverCount; r++) {
      const mouthAng = riverMouthAngles[r];
      let startDx: number;
      let startDy: number;
      if (r === 0 && springOffset) {
        startDx = springOffset.dx;
        startDy = springOffset.dy;
      } else {
        const headAng = mouthAng + Math.PI + (rng() - 0.5) * 0.7;
        const headR = 0.26 + rng() * 0.24;
        startDx = Math.round(Math.cos(headAng) * box.radiusX * headR);
        startDy = Math.round(Math.sin(headAng) * box.radiusY * headR);
      }
      const width = id === 'sunterrace' ? Math.round(48 + rng() * 14) : Math.round(38 + rng() * 12);
      const pts = buildSplineRiverPoints(
        box.radiusX,
        box.radiusY,
        wobbleAt,
        startDx,
        startDy,
        mouthAng,
        rng,
        r % 2 === 0 ? 1 : -1,
      );
      rivers.push({ width, points: pts });
    }
    if (rivers.length > 0) {
      partialDef.rivers = rivers;
    }

    // Small scenic inland ponds on lush meadow/terrace/ruins islands (outside central hearth clearing)
    const ponds: IslandPondSpec[] = [];
    if (id === 'cradle' || id === 'sunterrace' || id === 'starbloom') {
      const pondAng = dockAngleRad + Math.PI * (0.72 + rng() * 0.56);
      const pondR = 0.42 + rng() * 0.14;
      const pdx = Math.round(Math.cos(pondAng) * box.radiusX * pondR);
      const pdy = Math.round(Math.sin(pondAng) * box.radiusY * pondR);
      if (!springOffset || Math.hypot(pdx - springOffset.dx, pdy - springOffset.dy) > 160) {
        ponds.push({
          dx: pdx,
          dy: pdy,
          rx: Math.round(42 + rng() * 22),
          ry: Math.round(34 + rng() * 18),
        });
      }
    }
    if (ponds.length > 0) {
      partialDef.ponds = ponds;
    }

    defs[id] = {
      ...partialDef,
      dockSpot: createDockSpot(partialDef, dockAngleRad),
    };
  }

  return defs;
}

export const ISLAND_DEFS: Record<IslandId, IslandDef> = generateSeededArchipelago(DEFAULT_WORLD_SEED);

// Settleable islands assigned sequentially to players in standard multiplayer rooms
export const PLAYER_VILLAGE_ISLANDS: IslandId[] = [
  'cradle',
  'sunterrace',
  'timbercrown',
  'starbloom',
  'coppercrag',
  'mistatoll',
];

export function getSocialTier(score: number): { id: SocialTier; label: string; color: string } {
  if (score < 15) return { id: 'rival', label: 'Rival', color: '#E38589' };
  if (score < 28) return { id: 'stranger', label: 'Stranger', color: '#9EB1C2' };
  if (score < 45) return { id: 'acquaintance', label: 'Acquaintance', color: '#D8CEBA' };
  if (score < 62) return { id: 'guest', label: 'Guest', color: '#A8D8EA' };
  if (score < 78) return { id: 'friend', label: 'Friend', color: '#8CE0AC' };
  if (score < 90) return { id: 'confidant', label: 'Confidant', color: '#FDE68A' };
  return { id: 'bonded', label: 'Bonded Kin', color: '#F472B6' };
}

function createBridgeSpec(
  id: string,
  name: string,
  fromIsland: IslandId,
  toIsland: IslandId,
  tier: 1 | 2,
  requiredTechId: string,
  costTimber: number,
  costStone: number,
  defs: Record<IslandId, IslandDef> = ISLAND_DEFS,
): SkyBridgeEntity {
  const fromDef = defs[fromIsland];
  const toDef = defs[toIsland];
  const ang = Math.atan2(toDef.centerY - fromDef.centerY, toDef.centerX - fromDef.centerX);
  const p1 = getIslandRimPoint(fromDef, ang, 0.92);
  const p2 = getIslandRimPoint(toDef, ang + Math.PI, 0.92);
  return {
    id,
    name,
    fromIsland,
    toIsland,
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
    built: false,
    progress: 0,
    tier,
    requiredTechId,
    costTimber,
    costStone,
  };
}

function createCablewaySpec(
  id: string,
  name: string,
  fromIsland: IslandId,
  toIsland: IslandId,
  requiredTechId: string,
  costTimber: number,
  costStone: number,
  costIron: number,
  defs: Record<IslandId, IslandDef> = ISLAND_DEFS,
): SkyCablewayEntity {
  const fromDef = defs[fromIsland];
  const toDef = defs[toIsland];
  const ang = Math.atan2(toDef.centerY - fromDef.centerY, toDef.centerX - fromDef.centerX);
  const p1 = getIslandRimPoint(fromDef, ang, 0.88);
  const p2 = getIslandRimPoint(toDef, ang + Math.PI, 0.88);
  return {
    id,
    name,
    fromIsland,
    toIsland,
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
    built: false,
    progress: 0,
    requiredTechId,
    costTimber,
    costStone,
    costIron,
    gondolaT: 0.15,
    gondolaDir: 1,
    passengerIds: [],
  };
}

function buildSkyBridgesForDefs(defs: Record<IslandId, IslandDef>): SkyBridgeEntity[] {
  return [
    createBridgeSpec(
      'bridge_cradle_sun',
      'Sun-Terrace Causeway',
      'cradle',
      'sunterrace',
      1,
      'rope_bridges',
      26,
      12,
      defs,
    ),
    createBridgeSpec(
      'bridge_cradle_timber',
      'Timbercrown Sky-Bridge',
      'cradle',
      'timbercrown',
      1,
      'rope_bridges',
      32,
      16,
      defs,
    ),
    createBridgeSpec(
      'bridge_cradle_starbloom',
      'Starbloom Pilgrim Span',
      'cradle',
      'starbloom',
      1,
      'rope_bridges',
      28,
      14,
      defs,
    ),
    createBridgeSpec(
      'bridge_timber_crag',
      'Copper-Crag High Arch',
      'timbercrown',
      'coppercrag',
      2,
      'sky_causeways',
      44,
      36,
      defs,
    ),
  ];
}

function buildSkyCablewaysForDefs(defs: Record<IslandId, IslandDef>): SkyCablewayEntity[] {
  return [
    createCablewaySpec(
      'cable_timber_frost',
      'Frostpeak Glacier Gondola',
      'timbercrown',
      'frostpeak',
      'cliff_cableways',
      34,
      26,
      4,
      defs,
    ),
    createCablewaySpec(
      'cable_crag_frost',
      'High-Iron Alpine Line',
      'coppercrag',
      'frostpeak',
      'cliff_cableways',
      38,
      30,
      6,
      defs,
    ),
    createCablewaySpec(
      'cable_starbloom_timber',
      'Cedar-Starlight Aerial Line',
      'starbloom',
      'timbercrown',
      'cliff_cableways',
      30,
      20,
      2,
      defs,
    ),
    createCablewaySpec(
      'cable_mist_ember',
      'Bastion Cliff Zipline',
      'mistatoll',
      'embervault',
      'cliff_cableways',
      36,
      28,
      8,
      defs,
    ),
  ];
}

export const INITIAL_SKY_BRIDGES: SkyBridgeEntity[] = buildSkyBridgesForDefs(ISLAND_DEFS);
export const INITIAL_SKY_CABLEWAYS: SkyCablewayEntity[] = buildSkyCablewaysForDefs(ISLAND_DEFS);

let activeArchipelagoSeed = DEFAULT_WORLD_SEED;

export function getActiveArchipelagoSeed(): number {
  return activeArchipelagoSeed;
}

/**
 * Rebuilds the shared ISLAND_DEFS, INITIAL_SKY_BRIDGES, and INITIAL_SKY_CABLEWAYS in place
 * for the given deterministic worldSeed so all simulation, navigation, renderer, and 2D map views stay synced.
 */
export function applyArchipelagoSeed(seed: number): void {
  const normalizedSeed = Math.floor(Math.abs(seed)) || DEFAULT_WORLD_SEED;
  if (normalizedSeed === activeArchipelagoSeed) return;
  activeArchipelagoSeed = normalizedSeed;

  const generated = generateSeededArchipelago(normalizedSeed);
  for (const id of ISLAND_ORDER) {
    ISLAND_DEFS[id] = generated[id];
  }
  const nextBridges = buildSkyBridgesForDefs(ISLAND_DEFS);
  INITIAL_SKY_BRIDGES.splice(0, INITIAL_SKY_BRIDGES.length, ...nextBridges);
  const nextCables = buildSkyCablewaysForDefs(ISLAND_DEFS);
  INITIAL_SKY_CABLEWAYS.splice(0, INITIAL_SKY_CABLEWAYS.length, ...nextCables);
}

export const TRAVELER_ATTITUDE_META: Record<
  TravelerAttitude,
  { label: string; toneColor: string; quotes: string[] }
> = {
  warm: {
    label: 'Warm & Earnest',
    toneColor: '#74C294',
    quotes: [
      'Your hearth smoke rose above the clouds—I bring willing hands and stories.',
      'Peace to your shore! May I share tonight’s fire and mend nets?',
    ],
  },
  humble: {
    label: 'Quiet & Humble',
    toneColor: '#A8D0E6',
    quotes: [
      'I ask only a dry corner beside the fire to tend tubers and carve wood.',
      'My skiff broke against the reef—I walk gently and keep my word.',
    ],
  },
  boisterous: {
    label: 'Lively & Bold',
    toneColor: '#E5AF47',
    quotes: [
      'What a view across the sky-sea! Give me a spear and point toward wild boars!',
      'Plenty of cheer where I sail—let us bake loaves and chart the mist!',
    ],
  },
  aloof: {
    label: 'Guarded & Aloof',
    toneColor: '#B8B0C8',
    quotes: [
      'I keep my own watch, though I pull an oar if the isle stays fair.',
      'Not one for chatter—just looking for honest work and dry wool.',
    ],
  },
  restless: {
    label: 'Restless Rover',
    toneColor: '#E38589',
    quotes: [
      'Can’t promise I stay past winter, unless your ships sail into the mist.',
      'I’ve seen three islands fall to frost—show me a stout hearth first.',
    ],
  },
};

export const ERA_LABELS: Record<VillageEra, { name: string; subtitle: string }> = {
  1: { name: 'Era I · Bare Awakening', subtitle: 'Wild berries, flint sparks, and the first shared bonfire.' },
  2: { name: 'Era II · Hearth & Pasture', subtitle: 'Timber cottages, cultivated crops, livestock, and sky-bridges.' },
  3: { name: 'Era III · Maritime Clans', subtitle: 'Wind-gliders, cableways, cargo sails, and outer-island ruins.' },
  4: { name: 'Era IV · Iron Archipelago', subtitle: 'High-arch causeways, orchards, war galleys, and siege realms.' },
};

export const SEASON_META: Record<
  SeasonType,
  { label: string; festivalName: string; weatherWeights: WeatherType[] }
> = {
  spring: {
    label: 'Spring',
    festivalName: 'First-Sprout Vigil',
    weatherWeights: ['clear', 'clear', 'rain', 'mist', 'breeze'],
  },
  summer: {
    label: 'Summer',
    festivalName: 'Sky-Sea Regatta',
    weatherWeights: ['clear', 'clear', 'clear', 'breeze', 'rain'],
  },
  autumn: {
    label: 'Autumn',
    festivalName: 'Harvest & Cider Feast',
    weatherWeights: ['breeze', 'breeze', 'clear', 'mist', 'rain'],
  },
  winter: {
    label: 'Winter',
    festivalName: 'Solstice Hearth Night',
    weatherWeights: ['snow', 'snow', 'clear', 'mist', 'clear'],
  },
};

export const COMFORT_LABELS: Record<ComfortItem, string> = {
  bread: 'Warm Bread',
  tea: 'Herbal Tea',
  honey: 'Meadow Honey',
};

export const WISH_LABELS: Record<VillagerWishType, string> = {
  tea: 'Craving healing herbal tea',
  bread: 'Hoping for warm baked bread',
  honey: 'Dreaming of orchard honey',
  hotspring: 'Wants to soak in a warm spring',
  chat: 'Hoping for fireside company',
  explore: 'Yearns to scout an outer island',
};

export const TRAITS: Record<string, TraitDefinition> = {
  hard_skin: {
    id: 'hard_skin',
    name: 'Iron-Hide',
    polarity: 'positive',
    summary: 'Calloused thick skin: -65% chance to bleed, -18% physical damage taken, slightly slower stride (-5%).',
    workSpeedMult: 1.04,
    moodDrift: 0.05,
    energyDrainMult: 0.96,
    obedienceMod: 0.05,
    bleedChanceMult: 0.35,
    damageTakenMult: 0.82,
    hpMaxMod: 16,
    moveSpeedMult: 0.95,
  },
  glass_cannon: {
    id: 'glass_cannon',
    name: 'Edge-Striker',
    polarity: 'positive',
    summary: '+24% attack strike power, -12 max HP and +15% vulnerability when struck.',
    workSpeedMult: 1.05,
    moodDrift: 0,
    energyDrainMult: 1.04,
    obedienceMod: -0.02,
    attackPowerMult: 1.24,
    damageTakenMult: 1.15,
    hpMaxMod: -12,
  },
  calculated_mind: {
    id: 'calculated_mind',
    name: 'Calculated Mind',
    polarity: 'positive',
    summary: '+28% Knowledge XP & +35% faster skill teaching; slightly hesitant in melee (-8% attack).',
    workSpeedMult: 1.08,
    moodDrift: 0.1,
    energyDrainMult: 0.98,
    obedienceMod: 0.1,
    knowledgeMult: 1.28,
    teachRateMult: 1.35,
    attackPowerMult: 0.92,
  },
  pain_dampener: {
    id: 'pain_dampener',
    name: 'Pain-Dampener',
    polarity: 'positive',
    summary: 'Ignores minor wounds: -35% bleed tick severity and fights steadily at low HP.',
    workSpeedMult: 1.05,
    moodDrift: 0.1,
    energyDrainMult: 0.95,
    obedienceMod: 0.06,
    bleedChanceMult: 0.65,
    damageTakenMult: 0.9,
    braveryMod: 0.22,
  },
  danger_sense: {
    id: 'danger_sense',
    name: 'Sixth Warning',
    polarity: 'positive',
    summary: 'Anticipates ambushes: -14% incoming damage & spots raiders early.',
    workSpeedMult: 1.02,
    moodDrift: 0.05,
    energyDrainMult: 0.98,
    obedienceMod: 0.04,
    damageTakenMult: 0.86,
    curiosityMod: 0.14,
  },
  swift_recovery: {
    id: 'swift_recovery',
    name: 'Mending Blood',
    polarity: 'positive',
    summary: 'Wounds clot & heal 45% faster beside hearths and springs.',
    workSpeedMult: 1.0,
    moodDrift: 0.15,
    energyDrainMult: 0.94,
    obedienceMod: 0.08,
    healRateMult: 1.45,
    bleedChanceMult: 0.72,
  },
  lone_wolf: {
    id: 'lone_wolf',
    name: 'Lone Vanguard',
    polarity: 'positive',
    summary: '+16% gather & combat focus when away from crowds, slower social warmth.',
    workSpeedMult: 1.16,
    moodDrift: -0.05,
    energyDrainMult: 0.94,
    obedienceMod: -0.1,
    attackPowerMult: 1.12,
    socialAura: -0.15,
  },
  adaptation: {
    id: 'adaptation',
    name: 'Adaptive Grit',
    polarity: 'positive',
    summary: 'Learns skills & repairs structures 20% quicker through adversity.',
    workSpeedMult: 1.14,
    moodDrift: 0.1,
    energyDrainMult: 0.92,
    obedienceMod: 0.08,
    teachRateMult: 1.2,
    knowledgeMult: 1.15,
  },
  master_artisan: {
    id: 'master_artisan',
    name: 'Stonewright Eye',
    polarity: 'positive',
    summary: '+22% resource yield from stone, timber & ore nodes.',
    workSpeedMult: 1.14,
    moodDrift: 0.1,
    energyDrainMult: 0.96,
    obedienceMod: 0.1,
    gatherYieldMult: 1.22,
  },
  bloodline_vigor: {
    id: 'bloodline_vigor',
    name: 'Sturdy Lineage',
    polarity: 'positive',
    summary: '+22 max HP & steady endurance across long winters.',
    workSpeedMult: 1.04,
    moodDrift: 0.12,
    energyDrainMult: 0.88,
    obedienceMod: 0.08,
    hpMaxMod: 22,
  },
  curious_scout: {
    id: 'curious_scout',
    name: 'Horizon-Curious',
    polarity: 'positive',
    summary: 'Volunteers to cross bridges, glide cliffs, sail boats & uncover ruins.',
    workSpeedMult: 1.06,
    moodDrift: 0.2,
    energyDrainMult: 0.94,
    obedienceMod: 0.04,
    curiosityMod: 0.42,
    moveSpeedMult: 1.08,
  },
  green_thumb: {
    id: 'green_thumb',
    name: 'Seed Keeper',
    polarity: 'positive',
    summary: '+28% crop growth, herb care & foraging yield.',
    workSpeedMult: 1.24,
    moodDrift: 0.35,
    energyDrainMult: 0.95,
    obedienceMod: 0.1,
    gatherYieldMult: 1.18,
  },
  brave_hunter: {
    id: 'brave_hunter',
    name: 'Stout-Hearted',
    polarity: 'positive',
    summary: 'Fearless against wild boars & Ashen Bastion raiders (+14% strike power).',
    workSpeedMult: 1.1,
    moodDrift: 0.15,
    energyDrainMult: 0.92,
    obedienceMod: 0.06,
    braveryMod: 0.38,
    attackPowerMult: 1.14,
  },
  warmhearted: {
    id: 'warmhearted',
    name: 'Warmhearted',
    polarity: 'positive',
    summary: 'Lifts neighbors’ spirits, speeds skill teaching (+25%) & builds trust.',
    workSpeedMult: 1.05,
    moodDrift: 0.45,
    energyDrainMult: 1.0,
    obedienceMod: 0.18,
    socialAura: 0.5,
    teachRateMult: 1.25,
  },
  clever_crafter: {
    id: 'clever_crafter',
    name: 'Clever Hands',
    polarity: 'positive',
    summary: '+25% building, smelting & carpentry speed.',
    workSpeedMult: 1.25,
    moodDrift: 0.2,
    energyDrainMult: 0.92,
    obedienceMod: 0.12,
  },
  resilient: {
    id: 'resilient',
    name: 'Frost-Hardy',
    polarity: 'positive',
    summary: 'Resists winter chill and rain fatigue.',
    workSpeedMult: 1.1,
    moodDrift: 0.2,
    energyDrainMult: 0.82,
    obedienceMod: 0.14,
    hpMaxMod: 8,
  },
  swift_footed: {
    id: 'swift_footed',
    name: 'Fleet-Footed',
    polarity: 'positive',
    summary: 'Moves 16% faster across cliffs & sky-bridges.',
    workSpeedMult: 1.1,
    moodDrift: 0.15,
    energyDrainMult: 0.94,
    obedienceMod: 0.08,
    curiosityMod: 0.16,
    moveSpeedMult: 1.16,
  },
  hollow_boned: {
    id: 'hollow_boned',
    name: 'Thin-Skinned',
    polarity: 'negative',
    summary: 'Fragile frame: +45% bleeding chance & -12 max HP, moves lightly (+6%).',
    workSpeedMult: 0.98,
    moodDrift: -0.08,
    energyDrainMult: 1.05,
    obedienceMod: 0.04,
    bleedChanceMult: 1.45,
    hpMaxMod: -12,
    moveSpeedMult: 1.06,
  },
  slow_healer: {
    id: 'slow_healer',
    name: 'Slow Clotting',
    polarity: 'negative',
    summary: 'Recovers HP 30% slower after injuries or raids.',
    workSpeedMult: 0.96,
    moodDrift: -0.1,
    energyDrainMult: 1.04,
    obedienceMod: 0.02,
    healRateMult: 0.7,
    bleedChanceMult: 1.25,
  },
  curse_magnet: {
    id: 'curse_magnet',
    name: 'Jinxed Step',
    polarity: 'negative',
    summary: 'Draws extra trouble in skirmishes (+14% incoming damage), learns grit (+10% XP).',
    workSpeedMult: 0.95,
    moodDrift: -0.18,
    energyDrainMult: 1.06,
    obedienceMod: -0.05,
    damageTakenMult: 1.14,
    knowledgeMult: 1.1,
  },
  cautious_homebody: {
    id: 'cautious_homebody',
    name: 'Homebound',
    polarity: 'negative',
    summary: 'Wary of strangers & avoids risky sea voyages.',
    workSpeedMult: 0.96,
    moodDrift: 0.05,
    energyDrainMult: 0.96,
    obedienceMod: 0.06,
    curiosityMod: -0.32,
  },
  rain_shy: {
    id: 'rain_shy',
    name: 'Chill-Prone',
    polarity: 'negative',
    summary: 'Loses warmth faster in rain or snow; seeks hearth.',
    workSpeedMult: 0.92,
    moodDrift: -0.25,
    energyDrainMult: 1.08,
    obedienceMod: -0.1,
    rainSensitive: true,
  },
  stubborn: {
    id: 'stubborn',
    name: 'Willful',
    polarity: 'negative',
    summary: 'Follows own judgment over divine whispers.',
    workSpeedMult: 1.04,
    moodDrift: -0.1,
    energyDrainMult: 1.0,
    obedienceMod: -0.34,
  },
  timid: {
    id: 'timid',
    name: 'Skittish',
    polarity: 'negative',
    summary: 'Flees boars & raiders unless defended by guards.',
    workSpeedMult: 0.92,
    moodDrift: -0.15,
    energyDrainMult: 1.05,
    obedienceMod: 0.1,
    braveryMod: -0.32,
  },
  melancholic: {
    id: 'melancholic',
    name: 'Wistful',
    polarity: 'negative',
    summary: 'Grieves deeply during winter or scarcity.',
    workSpeedMult: 0.94,
    moodDrift: -0.38,
    energyDrainMult: 1.02,
    obedienceMod: -0.06,
  },
};

export const POSITIVE_TRAIT_IDS = Object.values(TRAITS)
  .filter((t) => t.polarity === 'positive')
  .map((t) => t.id);

export const NEGATIVE_TRAIT_IDS = Object.values(TRAITS)
  .filter((t) => t.polarity === 'negative')
  .map((t) => t.id);

export const SKILL_META: Record<SkillId, { label: string; category: 'craft' | 'harvest' | 'combat' | 'lore'; summary: string }> = {
  woodcraft: { label: 'Woodcraft', category: 'harvest', summary: 'Faster tree felling & +timber yield.' },
  stonecraft: { label: 'Stonecraft', category: 'harvest', summary: 'Faster boulder gathering & quarry yield.' },
  foraging: { label: 'Foraging', category: 'harvest', summary: 'Finds extra wild berries, twigs & herbs.' },
  herbalism: { label: 'Herbalism', category: 'lore', summary: 'Tends wounds, slows bleeding & brews tea.' },
  farming: { label: 'Farming', category: 'harvest', summary: 'Accelerates crop growth & harvest yields.' },
  husbandry: { label: 'Husbandry', category: 'harvest', summary: 'Calms pasture animals & boosts wool/meat.' },
  masonry: { label: 'Masonry', category: 'craft', summary: 'Speeds building construction & repairs.' },
  metallurgy: { label: 'Metallurgy', category: 'craft', summary: 'Improves smelting copper, bronze & iron.' },
  blade_mastery: { label: 'Blade Mastery', category: 'combat', summary: 'Raises spear & sword melee damage + bleed chance.' },
  archery: { label: 'Archery', category: 'combat', summary: 'Boosts bow damage, range & hunting precision.' },
  tactics: { label: 'Tactics', category: 'combat', summary: 'Reduces damage taken & steadies defense.' },
  seamanship: { label: 'Seamanship', category: 'lore', summary: 'Boosts fishing, sailing & glider navigation.' },
};

export const ALL_SKILL_IDS = Object.keys(SKILL_META) as SkillId[];

export function rollUnitStats(traits: string[], isRaider = false): UnitStats {
  const randStat = (base: number) => Math.max(4, Math.min(18, base + Math.floor(Math.random() * 6) - 2));
  let str = randStat(isRaider ? 10 : 8);
  let agi = randStat(8);
  let end = randStat(isRaider ? 10 : 8);
  let int = randStat(isRaider ? 7 : 9);
  let bleedResist = 0.08 + end * 0.015;

  for (const tid of traits) {
    if (tid === 'hard_skin') {
      end = Math.min(18, end + 3);
      agi = Math.max(4, agi - 1);
      bleedResist += 0.45;
    } else if (tid === 'glass_cannon') {
      str = Math.min(18, str + 3);
      end = Math.max(4, end - 2);
    } else if (tid === 'calculated_mind') {
      int = Math.min(18, int + 3);
    } else if (tid === 'swift_footed') {
      agi = Math.min(18, agi + 3);
    } else if (tid === 'hollow_boned') {
      end = Math.max(4, end - 2);
      bleedResist = Math.max(0, bleedResist - 0.12);
    } else if (tid === 'bloodline_vigor') {
      end = Math.min(18, end + 2);
      str = Math.min(18, str + 1);
    } else if (tid === 'swift_recovery' || tid === 'pain_dampener') {
      bleedResist += 0.22;
    }
  }

  return {
    strength: str,
    agility: agi,
    endurance: end,
    intellect: int,
    bleedResist: Math.max(0, Math.min(0.88, Number(bleedResist.toFixed(2)))),
    bleedStack: 0,
    bleedTimer: 0,
  };
}

export function rollStarterSkills(lifeStage: LifeStage, isRaider = false): Partial<Record<SkillId, number>> {
  if (lifeStage === 'infant') return {};
  const skills: Partial<Record<SkillId, number>> = {};
  const count = lifeStage === 'elder' ? 3 : 2;
  const pool: SkillId[] = isRaider
    ? ['blade_mastery', 'archery', 'tactics', 'stonecraft']
    : [...ALL_SKILL_IDS];
  for (let i = 0; i < count; i++) {
    const sk = pickRandom(pool);
    skills[sk] = Math.max(skills[sk] ?? 0, lifeStage === 'elder' ? 2 : 1);
  }
  return skills;
}

export function inheritBabyTraits(parents?: { id: string; name: string; traits: string[] }[]): string[] {
  if (!parents || parents.length === 0) return rollBalancedTraits();
  const parentPool = Array.from(new Set(parents.flatMap((p) => p.traits))).filter((id) => Boolean(TRAITS[id]));
  const chosen: string[] = [];
  if (parentPool.length > 0) {
    const first = pickRandom(parentPool);
    chosen.push(first);
    if (parentPool.length > 1 && Math.random() < 0.48) {
      const secondPool = parentPool.filter((id) => id !== first);
      if (secondPool.length > 0) chosen.push(pickRandom(secondPool));
    }
  }
  // Balance traits so babies aren't overloaded with only positives or only negatives
  const hasPos = chosen.some((id) => TRAITS[id]?.polarity === 'positive');
  const hasNeg = chosen.some((id) => TRAITS[id]?.polarity === 'negative');
  if (!hasPos) {
    const pool = POSITIVE_TRAIT_IDS.filter((id) => !chosen.includes(id));
    if (pool.length > 0) chosen.push(pickRandom(pool));
  }
  if (!hasNeg && (chosen.length < 3 || Math.random() < 0.7)) {
    const pool = NEGATIVE_TRAIT_IDS.filter((id) => !chosen.includes(id));
    if (pool.length > 0) chosen.push(pickRandom(pool));
  }
  return chosen.slice(0, 3);
}

export interface TaskMeta {
  id: TaskType;
  key: string;
  label: string;
  verb: string;
  requiredTechId?: string;
}

export const TASKS: TaskMeta[] = [
  { id: 'forage', key: '1', label: 'Forage', verb: 'Gathering berries & kindling' },
  { id: 'gather_stone', key: 'Q', label: 'Stone', verb: 'Gathering field stones & flint' },
  { id: 'chop', key: '2', label: 'Woodcraft', verb: 'Cutting cedar & timber' },
  { id: 'hunt', key: '3', label: 'Hunt', verb: 'Tracking wild game', requiredTechId: 'flint_spears' },
  { id: 'farm', key: '4', label: 'Farm', verb: 'Tending cultivated crops', requiredTechId: 'wild_botany' },
  { id: 'pasture', key: '5', label: 'Pasture', verb: 'Herding sheep & livestock', requiredTechId: 'animal_husbandry' },
  { id: 'quarry', key: '6', label: 'Quarry', verb: 'Mining stone & ore', requiredTechId: 'masonry_bakery' },
  { id: 'fish', key: '7', label: 'Fish', verb: 'Netting sky-sea fish', requiredTechId: 'dugout_docks' },
  { id: 'bake', key: '8', label: 'Bake', verb: 'Baking hearth loaves', requiredTechId: 'masonry_bakery' },
  { id: 'study', key: '9', label: 'Study', verb: 'Writing & teaching cultural lore', requiredTechId: 'scholarship' },
  { id: 'smelt', key: '0', label: 'Smelt', verb: 'Forging bronze & iron', requiredTechId: 'bronze_smelting' },
  { id: 'guard', key: 'G', label: 'Guard', verb: 'Patrolling watchtowers', requiredTechId: 'archery_watch' },
  { id: 'explore', key: 'E', label: 'Explore', verb: 'Scouting ruins & horizons', requiredTechId: 'rope_bridges' },
];

export const TASK_BY_ID: Record<TaskType, TaskMeta> = Object.fromEntries(
  TASKS.map((t) => [t.id, t]),
) as Record<TaskType, TaskMeta>;

export const CHIEF_FOCUSES: { id: ChiefFocus; label: string; summary: string }[] = [
  { id: 'balanced', label: 'Balanced Rhythm', summary: 'Organic mix of foraging, building, study & care.' },
  { id: 'harvest', label: 'Food & Pastures', summary: 'Prioritizes crops, hunting, fishing & wool.' },
  { id: 'craft', label: 'Craft & Metallurgy', summary: 'Prioritizes timber, stone, libraries & smithing.' },
  { id: 'explore', label: 'Explore & Sail', summary: 'Sends curious scouts across bridges, gliders, cableways & ships.' },
  { id: 'defense', label: 'Watch & Garrison', summary: 'Prioritizes weapons, armor, towers & bastion expeditions.' },
];

export const WEATHER_LABELS: Record<WeatherType, string> = {
  clear: 'Clear',
  rain: 'Rain',
  breeze: 'Breeze',
  snow: 'Snow',
  mist: 'Mist',
};

export const TIME_PRESET_VALUES: Record<TimePreset, { label: string; value: number }> = {
  dawn: { label: 'Dawn', value: 0.25 },
  day: { label: 'Day', value: 0.48 },
  golden: { label: 'Golden', value: 0.69 },
  dusk: { label: 'Dusk', value: 0.78 },
  night: { label: 'Night', value: 0.93 },
};

const CLOAK_PALETTES = [
  '#C26D4A',
  '#5A7D6C',
  '#5B7290',
  '#B88B4A',
  '#8C5E74',
  '#6E7F5E',
  '#A65C52',
  '#4F6D7A',
];

const HAIR_COLORS = ['#4A3525', '#7A5438', '#C48D52', '#2E2622', '#8B4A32', '#9A9792'];
const SKIN_TONES = ['#F4D5BD', '#E6BA9A', '#D19A74', '#B57952', '#FCE1CE'];

const FIRST_NAMES = [
  'Adam', 'Eve', 'Rowan', 'Clara', 'Finn', 'Iris', 'Bram', 'Nora',
  'Theo', 'Wren', 'Alder', 'Sylvie', 'Otis', 'Juniper', 'Cedric',
  'Hazel', 'Linden', 'Maeve', 'Jasper', 'Faye', 'Soren', 'Kael', 'Tamsin',
];

const LAST_NAMES = [
  'Ash', 'Moss', 'Briar', 'Brook', 'Thistle', 'Fern', 'Hollow', 'Finch',
  'Reed', 'Haven', 'Meadows', 'Lark', 'Clover', 'Crag', 'Gale',
];

const BIO_OPENERS = [
  'A steady soul shaped by wind and hearth smoke,',
  'First to trace constellations above the floating cliffs,',
  'Keeps smooth flint shards and dried chamomile in a satchel,',
  'Quietly observant, reading sea ripples for changing squalls,',
  'Carves tiny timber boats by night beside the embers,',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickRandomWish(): VillagerWishType {
  const wishes: VillagerWishType[] = ['tea', 'bread', 'honey', 'hotspring', 'chat', 'explore'];
  return pickRandom(wishes);
}

export function pickFavoriteComfort(): ComfortItem {
  return pickRandom(['bread', 'tea', 'honey']);
}

export function buildBioFromTraits(traitIds: string[], isChild = false): string {
  const pos = traitIds.map((id) => TRAITS[id]).find((t) => t?.polarity === 'positive');
  const neg = traitIds.map((id) => TRAITS[id]).find((t) => t?.polarity === 'negative');
  if (isChild) {
    return `Raised among the archipelago fires${pos ? `, showing a ${pos.name.toLowerCase()} spirit` : ''}${neg ? ` and ${neg.name.toLowerCase()} streak` : ''}.`;
  }
  const opener = pickRandom(BIO_OPENERS);
  const posText = pos ? `blessed as ${pos.name.toLowerCase()}` : 'handy by the camp';
  const negText = neg ? `though somewhat ${neg.name.toLowerCase()}` : 'and calm under open skies';
  return `${opener} ${posText}, ${negText}.`;
}

export function rollBalancedTraits(inheritedTraitId?: string): string[] {
  const chosen: string[] = [];
  if (inheritedTraitId && TRAITS[inheritedTraitId]) {
    chosen.push(inheritedTraitId);
  }
  const hasPos = chosen.some((id) => TRAITS[id]?.polarity === 'positive');
  const hasNeg = chosen.some((id) => TRAITS[id]?.polarity === 'negative');

  if (!hasPos) {
    const pool = POSITIVE_TRAIT_IDS.filter((id) => !chosen.includes(id));
    chosen.push(pickRandom(pool));
  }
  if (!hasNeg) {
    const pool = NEGATIVE_TRAIT_IDS.filter((id) => !chosen.includes(id));
    chosen.push(pickRandom(pool));
  }
  if (Math.random() < 0.45) {
    const extraPool = [...POSITIVE_TRAIT_IDS, ...NEGATIVE_TRAIT_IDS].filter((id) => !chosen.includes(id));
    if (extraPool.length > 0) chosen.push(pickRandom(extraPool));
  }
  return chosen;
}

export function generateCandidate(
  kind: 'traveler' | 'birth',
  day: number,
  existingNames: Set<string>,
  parents?: { id: string; name: string; traits: string[] }[],
): ArrivalCandidate {
  const poolFirst = FIRST_NAMES.slice(2);
  let name = `${pickRandom(poolFirst)} ${pickRandom(LAST_NAMES)}`;
  let guard = 0;
  while (existingNames.has(name) && guard < 20) {
    name = `${pickRandom(poolFirst)} ${pickRandom(LAST_NAMES)}`;
    guard++;
  }

  const traits =
    kind === 'birth' ? inheritBabyTraits(parents) : rollBalancedTraits();
  const lifeStage: LifeStage = kind === 'birth' ? 'infant' : Math.random() < 0.15 ? 'elder' : 'adult';
  const hairColor = lifeStage === 'elder' ? '#B9B5AE' : pickRandom(HAIR_COLORS);
  const attitudePool: TravelerAttitude[] = ['warm', 'humble', 'boisterous', 'aloof', 'restless'];
  const attitude: TravelerAttitude = kind === 'birth' ? 'warm' : pickRandom(attitudePool);
  const quotes = TRAVELER_ATTITUDE_META[attitude].quotes;

  return {
    id: `arr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    name,
    bioDescription:
      kind === 'birth'
        ? `Born beside the island hearth to ${parents?.map((p) => p.name.split(' ')[0]).join(' & ') ?? 'loving kin'}.`
        : buildBioFromTraits(traits, false),
    lifeStage,
    cloakColor: pickRandom(CLOAK_PALETTES),
    hairColor,
    skinTone: pickRandom(SKIN_TONES),
    hairStyle: Math.floor(Math.random() * 4),
    traits,
    attitude,
    greetingLine:
      kind === 'birth'
        ? 'Soft peaceful breathing beside the warm embers.'
        : pickRandom(quotes),
    greeterId: null,
    greeterName: null,
    deliberationTimer: kind === 'birth' ? 0 : 12,
    decisionVerdict: kind === 'birth' ? 'recommend_welcome' : 'talking',
    decisionReason: kind === 'birth' ? 'Every newborn is cherished in the archipelago.' : null,
    godSuggestion: 'neutral',
    favoriteComfort: pickFavoriteComfort(),
    parentIds: parents && parents.length === 2 ? [parents[0].id, parents[1].id] : null,
    parentNames: parents ? parents.map((p) => p.name.split(' ')[0]).join(' & ') : null,
    arrivedDay: day,
  };
}

export function getUpgradeCost(building: BuildingEntity): Partial<VillageResources> {
  const factor = building.unlocked ? Math.pow(1.8, building.level) : 1;
  const result: Partial<VillageResources> = {};
  for (const [k, v] of Object.entries(building.baseCost)) {
    if (typeof v === 'number') {
      result[k as keyof VillageResources] = Math.round(v * factor);
    }
  }
  return result;
}

export function isPointInsideIsland(island: IslandDef, wx: number, wy: number, margin = 18): boolean {
  const rx = Math.max(20, island.radiusX - margin);
  const ry = Math.max(20, island.radiusY - margin);
  const dx = (wx - island.centerX) / rx;
  const dy = (wy - island.centerY) / ry;
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(island, ang);
  return Math.hypot(dx, dy) / wobble <= 1;
}

export function getIslandAtPoint(wx: number, wy: number, margin = 0): IslandDef | null {
  for (const id of ISLAND_ORDER) {
    const def = ISLAND_DEFS[id];
    if (isPointInsideIsland(def, wx, wy, margin)) return def;
  }
  return null;
}

export function getBuildingRequiredTechName(b: BuildingEntity): string {
  const bp = BUILDING_BLUEPRINTS[b.type];
  return TECH_BY_ID[bp.requiredTechId]?.name ?? 'Discovery';
}

export const COGNITIVE_STAGE_META: Record<
  import('./types').CognitiveStage,
  { label: string; color: string; summary: string }
> = {
  awakening: {
    label: 'Awakening',
    color: '#A8D0E6',
    summary: 'Infant-like mind: touching berries, water & stones and socializing with peers before grasping work.',
  },
  observing: {
    label: 'Observing',
    color: '#FDE68A',
    summary: 'Connecting natural wonders through exploration and peer chatter—needs 3 wonders & 2 chats to work.',
  },
  experimenting: {
    label: 'Experimenting',
    color: '#8CE0AC',
    summary: 'Work tasks unlocked! Autonomous building, flint sparks, tools & island craft begin.',
  },
  reasoning: {
    label: 'Reasoning',
    color: '#E5AF47',
    summary: 'Capable of autonomous expansion, sailing, gliding, cableways & village planning.',
  },
  enlightened: {
    label: 'Enlightened',
    color: '#C4B5FD',
    summary: 'Deep archipelago thinker—accelerates discoveries, upgrades realms & inspires nearby minds.',
  },
};

export const CONCEPT_LABELS: Record<string, string> = {
  berry_bush: 'Wild Berries',
  branch_pile: 'Dry Kindling',
  flint_pile: 'Sharp Flint',
  stone_boulder: 'Mossy Boulders',
  tree: 'Living Timber',
  spring: 'Fresh Spring',
  wildlife: 'Wild Fauna',
  horizon: 'Sky-Sea Rim',
  embers: 'Hearth Fire',
  copper_vein: 'Copper Veins',
  iron_vein: 'Iron Ore Veins',
  ruin: 'Ancient Ruin',
  glacier: 'Alpine Snow',
  volcano: 'Volcanic Caldera',
};
