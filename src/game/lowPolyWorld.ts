import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ISLAND_DEFS,
  ISLAND_ORDER,
  WORLD_HEIGHT,
  WORLD_SCALE,
  WORLD_WIDTH,
  getIslandAtPoint,
  islandCoastWobble,
  mulberry32,
} from './catalog';
import type { IslandDef, SeasonType, SkyBridgeEntity, WeatherType, WorldLandmark } from './types';

export function toWorldX(wx: number): number {
  return (wx - WORLD_WIDTH * 0.5) * WORLD_SCALE;
}

export function toWorldZ(wy: number): number {
  return (wy - WORLD_HEIGHT * 0.5) * WORLD_SCALE;
}

export function toSimX(x3: number): number {
  return x3 / WORLD_SCALE + WORLD_WIDTH * 0.5;
}

export function toSimY(z3: number): number {
  return z3 / WORLD_SCALE + WORLD_HEIGHT * 0.5;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function wrapAngleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function hash2(ix: number, iy: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2(x: number, y: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (valueNoise2(x * freq, y * freq) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.04;
  }
  return norm > 0 ? sum / norm : 0;
}

function ridgedFbm2(x: number, y: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const v = 1 - Math.abs(valueNoise2(x * freq, y * freq) * 2 - 1);
    sum += amp * v * v;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Computes normalized radial distance inside an island silhouette (0 = center, 1 = shoreline rim).
 */
export function islandNormalizedDist(def: IslandDef, wx: number, wy: number): number {
  const dx = (wx - def.centerX) / def.radiusX;
  const dy = (wy - def.centerY) / def.radiusY;
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(def, ang);
  return Math.hypot(dx, dy) / wobble;
}

function distToSegmentWithT(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { dist: number; t: number; len: number } {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-4) return { dist: Math.hypot(wx, wy), t: 0, len: 0 };
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  return {
    dist: Math.hypot(px - (ax + t * vx), py - (ay + t * vy)),
    t,
    len: Math.sqrt(len2),
  };
}

export function riverDepthAtSim(
  def: IslandDef,
  wx: number,
  wy: number,
): { inRiver: boolean; depth: number; bankFactor: number; mouthFactor: number } {
  if (!def.rivers || def.rivers.length === 0) {
    return { inRiver: false, depth: 0, bankFactor: 0, mouthFactor: 0 };
  }
  let maxDepth = 0;
  let maxBank = 0;
  let bestMouth = 0;

  for (const r of def.rivers) {
    const segCount = Math.max(1, r.points.length - 1);
    for (let i = 0; i < segCount; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const { dist, t } = distToSegmentWithT(
        wx,
        wy,
        def.centerX + a.dx,
        def.centerY + a.dy,
        def.centerX + b.dx,
        def.centerY + b.dy,
      );
      const u = (i + t) / segCount; // 0 = headwater, 1 = coastal mouth
      const mouthBoost = smoothstep(0.66, 1.0, u);
      const halfW = r.width * (0.48 + mouthBoost * 0.42);
      const valleyW = halfW * 2.35;
      if (dist < valleyW) {
        const valley = (1 - smoothstep(halfW * 0.55, valleyW, dist)) * 0.26;
        const channel = (1 - smoothstep(halfW * 0.25, halfW * 1.18, dist)) * (0.58 + mouthBoost * 0.16);
        const totalCarve = Math.max(valley, channel);
        if (totalCarve > maxDepth) {
          maxDepth = totalCarve;
          bestMouth = mouthBoost;
        }
        if (valley > maxBank) {
          maxBank = valley;
        }
      }
    }
  }
  return {
    inRiver: maxDepth > 0.34,
    depth: maxDepth,
    bankFactor: maxBank,
    mouthFactor: bestMouth,
  };
}

export function pondDepthAtSim(def: IslandDef, wx: number, wy: number): { inPond: boolean; depth: number } {
  if (!def.ponds || def.ponds.length === 0) return { inPond: false, depth: 0 };
  let maxDepth = 0;
  for (const pond of def.ponds) {
    const px = def.centerX + pond.dx;
    const py = def.centerY + pond.dy;
    const norm = Math.hypot((wx - px) / Math.max(12, pond.rx), (wy - py) / Math.max(12, pond.ry));
    if (norm < 1.55) {
      const carve = (1 - smoothstep(0.32, 1.55, norm)) * 0.78;
      if (carve > maxDepth) maxDepth = carve;
    }
  }
  return { inPond: maxDepth > 0.32, depth: maxDepth };
}

function getShoreSlopeFactor(def: IslandDef, ang: number): number {
  let coveWeight = 0;
  if (def.coveAngles) {
    for (let i = 0; i < def.coveAngles.length; i++) {
      const diff = Math.abs(wrapAngleDiff(ang, def.coveAngles[i]));
      if (diff < 0.62) {
        coveWeight = Math.max(coveWeight, Math.exp(-(diff * diff) / 0.085));
      }
    }
  }

  // Dock angle always eases softly toward shoreline cove even on steep islands
  if (def.dockAngleRad !== undefined) {
    const dockDiff = Math.abs(wrapAngleDiff(ang, def.dockAngleRad));
    if (dockDiff < 0.45) {
      coveWeight = Math.max(coveWeight, Math.exp(-(dockDiff * dockDiff) / 0.065));
    }
  }

  // Gentle low-coast beaches on basin / multi_river / atoll / ruins islands; sheer bluffs elsewhere
  if (def.terrainStyle === 'basin' || def.terrainStyle === 'multi_river' || def.terrainStyle === 'atoll') {
    const headlandWave = Math.sin(ang * 3 + (def.coastRotRad ?? 0)) * 0.5 + 0.5;
    return Math.min(1, Math.max(coveWeight, 0.58 + (1 - headlandWave) * 0.34));
  }
  if (def.terrainStyle === 'ruins') {
    return Math.min(1, Math.max(coveWeight, 0.46));
  }
  return coveWeight;
}

/**
 * Computes natural terrain height BEFORE river, pond, and spring carving so water channels conform to ground slopes.
 */
function islandBasePlateauHeightAtSim(def: IslandDef, wx: number, wy: number, nd: number): number {
  const lx = (wx - def.centerX) / def.radiusX;
  const ly = (wy - def.centerY) / def.radiusY;
  const ang = Math.atan2(ly, lx);
  const seedOff = ((def.coastSeed ?? 1) % 500) * 0.13;

  const organicNoise = fbm2(wx * 0.0044 + seedOff, wy * 0.0044 - seedOff * 0.7, 3);
  const detailRoll = fbm2(wx * 0.011 - seedOff * 0.4, wy * 0.011 + seedOff * 0.9, 2) * 0.16;
  const clearingFlat = smoothstep(0.15, 0.46, nd);

  const rAngle = def.ridgeAngle ?? 0;
  const rCos = Math.cos(rAngle);
  const rSin = Math.sin(rAngle);
  const rxCoord = lx * rCos + ly * rSin;
  const ryCoord = -lx * rSin + ly * rCos;

  let relief = (organicNoise * 0.42 + detailRoll) * (0.2 + 0.8 * clearingFlat) * (1 - nd * 0.34);

  if (def.id === 'cradle') {
    const gentleBackHill = smoothstep(0.45, -0.58, ryCoord) * 0.82 * clearingFlat;
    const sideKnoll = smoothstep(0.48, 0.12, Math.hypot(rxCoord + 0.52, ryCoord + 0.08)) * 0.44;
    relief += gentleBackHill + sideKnoll;
  } else if (def.id === 'timbercrown') {
    const gorgeAng = def.waterfallAngle ?? 0.72;
    const angDiff = Math.abs(wrapAngleDiff(ang, gorgeAng));
    const gorgeCut = nd > 0.34 ? smoothstep(0.28, 0.05, angDiff) * 1.38 : 0;
    const highEscarpment = smoothstep(0.24, -0.56, ryCoord) * 1.45;
    relief += highEscarpment - gorgeCut + organicNoise * 0.25 * clearingFlat;
  } else if (def.id === 'sunterrace') {
    const valleySlope = smoothstep(-0.62, 0.58, ryCoord) * 0.65 * clearingFlat;
    relief += valleySlope + organicNoise * 0.26 * clearingFlat;
  } else if (def.id === 'coppercrag') {
    const westSpire = smoothstep(0.5, 0.12, Math.hypot(rxCoord + 0.38, ryCoord + 0.18)) * 3.4;
    const northRidge = smoothstep(0.45, 0.1, Math.hypot(rxCoord - 0.28, ryCoord + 0.32)) * 2.85;
    const basin = smoothstep(0.38, 0.1, Math.hypot(rxCoord, ryCoord - 0.08)) * -0.92;
    const cragRidges = ridgedFbm2(wx * 0.0085 + seedOff, wy * 0.0085, 3) * 0.85 * clearingFlat;
    relief += westSpire + northRidge + basin + cragRidges;
  } else if (def.id === 'mistatoll') {
    const lOff = def.lagoonOffset ?? { lx: -0.14, ly: 0 };
    const awayAng = Math.atan2(lOff.ly, lOff.lx) + Math.PI;
    const crescentFactor = smoothstep(-0.35, 0.75, Math.cos(ang - awayAng));
    const horseshoe = smoothstep(0.34, 0.72, nd) * crescentFactor * 1.65;
    const lagoonDip = smoothstep(0.42, 0.14, Math.hypot(lx - lOff.lx, ly - lOff.ly)) * 1.05;
    relief += horseshoe - lagoonDip;
  } else if (def.id === 'starbloom') {
    const centerArena = smoothstep(0.32, 0.08, nd) * -0.28;
    const highKnoll = smoothstep(0.45, 0.12, Math.hypot(rxCoord - 0.32, ryCoord + 0.36)) * 1.15;
    relief += centerArena + highKnoll;
  } else if (def.id === 'embervault') {
    const tOff = def.trenchOffset ?? { lx: -0.34, ly: 0.22 };
    const coneRim = Math.exp(-Math.pow((nd - 0.42) / 0.22, 2)) * 3.25;
    const citadelPlate = smoothstep(0.32, 0.14, Math.hypot(rxCoord - 0.05, ryCoord + 0.08)) * 1.28;
    const lavaTrench = smoothstep(0.24, 0.06, Math.hypot(lx - tOff.lx, ly - tOff.ly)) * -4.9;
    const basaltRidges = ridgedFbm2(wx * 0.009 + seedOff, wy * 0.009, 3) * 0.84 * clearingFlat;
    relief += coneRim + citadelPlate + lavaTrench + basaltRidges;
  } else if (def.id === 'frostpeak') {
    const summitPeak = smoothstep(0.58, 0.06, Math.hypot(rxCoord + 0.2, ryCoord + 0.2)) * 5.5;
    const eastPeak = smoothstep(0.48, 0.1, Math.hypot(rxCoord - 0.34, ryCoord - 0.08)) * 3.7;
    const southSpur = smoothstep(0.42, 0.12, Math.hypot(rxCoord + 0.1, ryCoord - 0.35)) * 2.05;
    const glacierShelf = smoothstep(0.18, -0.05, ryCoord) * 1.05;
    const alpineCrests = ridgedFbm2(wx * 0.0075 + seedOff, wy * 0.0075, 3) * 0.92 * clearingFlat;
    relief += summitPeak + eastPeak + southSpur + glacierShelf + alpineCrests;
  }

  let h = def.elevationY + relief;

  // Natural coastal beach / cove taper dipping seamlessly below sky-sea plane (y = 0)
  const shoreSlope = getShoreSlopeFactor(def, ang);
  if (shoreSlope > 0.05) {
    const beachStart = 0.72;
    const beachT = smoothstep(beachStart, 1.03, nd);
    if (beachT > 0) {
      const targetShoreY = -0.38;
      // Pulls beaches, bays, and sheltered dock coves naturally into the sea water
      h = h * (1 - beachT * shoreSlope) + targetShoreY * (beachT * shoreSlope);
    }
  }

  // On steep cliffside islands without a beach slope, taper edge lip cleanly just past 0.95
  if (shoreSlope <= 0.05 && nd > 0.93) {
    const rimT = smoothstep(0.93, 1.03, nd);
    h -= rimT * 0.85;
  }

  return h;
}

/**
 * Sculpted island plateau, organic beaches/coves, river valleys, ponds, and alpine peaks.
 * Coastal coves & estuaries smoothly dip below y = 0 so terrain integrates seamlessly with sky-sea water.
 */
export function islandTerrainHeightAtSim(def: IslandDef, wx: number, wy: number, nd: number): number {
  let h = islandBasePlateauHeightAtSim(def, wx, wy, nd);

  const riverSample = riverDepthAtSim(def, wx, wy);
  if (riverSample.depth > 0) {
    h -= riverSample.depth;
    // Low coastal estuaries blend naturally into sea level below y = 0
    const isWaterfallDrop =
      def.hasWaterfall &&
      def.waterfallAngle !== undefined &&
      Math.abs(wrapAngleDiff(Math.atan2((wy - def.centerY) / def.radiusY, (wx - def.centerX) / def.radiusX), def.waterfallAngle)) < 0.28;
    if (!isWaterfallDrop && riverSample.mouthFactor > 0.25 && riverSample.inRiver) {
      const estuaryDip = riverSample.mouthFactor * 0.55;
      h = Math.min(h, Math.max(-0.42, h - estuaryDip));
    }
  }

  const pondSample = pondDepthAtSim(def, wx, wy);
  if (pondSample.depth > 0) {
    h -= pondSample.depth;
  }

  if (def.hasSpring && def.springOffset) {
    const sx = def.centerX + def.springOffset.dx;
    const sy = def.centerY + def.springOffset.dy;
    const sd = Math.hypot(wx - sx, wy - sy);
    if (sd < 44) {
      h -= (1 - smoothstep(14, 44, sd)) * 0.44;
    }
  }

  // Guarantee central hearth clearing & dock land pad remain comfortably above waterline
  const centerProtect = 1 - smoothstep(0.14, 0.24, nd);
  if (centerProtect > 0.05) {
    h = Math.max(h, Math.max(0.45, def.elevationY * 0.72) * centerProtect);
  }
  const dockDist = Math.hypot(wx - def.dockSpot.x, wy - def.dockSpot.y);
  if (dockDist < 42) {
    const dockT = 1 - smoothstep(18, 42, dockDist);
    h = Math.max(h, 0.36 * dockT);
  }

  return Math.max(-0.48, h);
}

/**
 * Estimates terrain surface slope in world-space vertical / horizontal units.
 */
export function terrainSlopeAtSim(wx: number, wy: number): number {
  const eps = 16;
  const h = groundHeightAtSim(wx, wy);
  const hx = groundHeightAtSim(wx + eps, wy);
  const hz = groundHeightAtSim(wx, wy + eps);
  return Math.hypot((hx - h) / (eps * WORLD_SCALE), (hz - h) / (eps * WORLD_SCALE));
}

/**
 * Exact 3D surface height at any sim coordinate (wx, wy), checking floating islands and built sky-bridges.
 */
export function groundHeightAtSim(
  wx: number,
  wy: number,
  bridges?: SkyBridgeEntity[],
): number {
  if (bridges) {
    for (const br of bridges) {
      if (!br.built) continue;
      const vx = br.x2 - br.x1;
      const vy = br.y2 - br.y1;
      const len2 = vx * vx + vy * vy;
      if (len2 < 1) continue;
      const t = ((wx - br.x1) * vx + (wy - br.y1) * vy) / len2;
      if (t >= -0.05 && t <= 1.05) {
        const ct = Math.max(0, Math.min(1, t));
        const px = br.x1 + ct * vx;
        const py = br.y1 + ct * vy;
        if (Math.hypot(wx - px, wy - py) <= 22) {
          const yA = groundHeightAtSim(br.x1, br.y1);
          const yB = groundHeightAtSim(br.x2, br.y2);
          const arch = Math.sin(ct * Math.PI) * (br.tier === 2 ? 1.85 : 0.95);
          return yA + (yB - yA) * ct + arch + 0.14;
        }
      }
    }
  }

  for (const id of ISLAND_ORDER) {
    const def = ISLAND_DEFS[id];
    const nd = islandNormalizedDist(def, wx, wy);
    if (nd <= 1.03) {
      return islandTerrainHeightAtSim(def, wx, wy, nd);
    }
  }

  return 0.0;
}

/**
 * Builds one floating island mesh with natural submerged beaches/coves seamlessly intersecting y = 0 sea water,
 * plus stratified rocky cliff walls and keel spire underneath.
 */
export function buildFloatingIslandGeometry(
  def: IslandDef,
  season: SeasonType,
  weather: WeatherType,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const snow = (weather === 'snow' || season === 'winter') && def.biome !== 'volcanic';
  const autumn = season === 'autumn' && !snow;

  const rx3 = def.radiusX * WORLD_SCALE;
  const rz3 = def.radiusY * WORLD_SCALE;

  let grassMossHex = 0x3e6625;
  let grassMidHex = 0x618d2e;
  let grassSunlitHex = 0x8fb840;
  let pathDirtHex = 0xc2a66e;
  let rimRockHex = 0x736c60;
  let cliffFaceHex = 0x5f574d;
  let underRockHex = 0x4b443e;
  let sandHex = 0xd6c394;
  let wetSandHex = 0xa99268;
  let seabedHex = 0x75aba7;

  if (def.biome === 'volcanic') {
    grassMossHex = 0x383231;
    grassMidHex = 0x4c4441;
    grassSunlitHex = 0x685449;
    pathDirtHex = 0x4a3b34;
    rimRockHex = 0x3a3231;
    cliffFaceHex = 0x2c2424;
    underRockHex = 0x1e191a;
    sandHex = 0x634b42;
    wetSandHex = 0x463631;
    seabedHex = 0x383436;
  } else if (def.biome === 'frost' || snow) {
    grassMossHex = def.biome === 'frost' ? 0xb4cadb : 0xc6d6e2;
    grassMidHex = 0xdbe6ef;
    grassSunlitHex = 0xf4f8fc;
    pathDirtHex = 0x9aa8b4;
    rimRockHex = 0x6b7b8b;
    cliffFaceHex = 0x556474;
    underRockHex = 0x424f5c;
    sandHex = 0xcfdce5;
    wetSandHex = 0x9ab0bf;
    seabedHex = 0x759cb2;
  } else if (def.biome === 'pine') {
    grassMossHex = autumn ? 0x5f5a2d : 0x2f5422;
    grassMidHex = autumn ? 0x8c7b38 : 0x4b772b;
    grassSunlitHex = autumn ? 0xb69542 : 0x749e33;
    pathDirtHex = 0xa88f62;
    rimRockHex = 0x696359;
    cliffFaceHex = 0x565048;
  } else if (def.biome === 'terrace') {
    grassMossHex = autumn ? 0x7a6930 : 0x487627;
    grassMidHex = autumn ? 0xa98d3c : 0x6f9e34;
    grassSunlitHex = autumn ? 0xd2ad4d : 0x99c344;
    pathDirtHex = 0xb99d66;
    cliffFaceHex = 0x7f6c54;
  } else if (def.biome === 'crag') {
    grassMossHex = 0x55564b;
    grassMidHex = 0x6d6e5f;
    grassSunlitHex = 0x8b8774;
    pathDirtHex = 0x7a6f5d;
    rimRockHex = 0x625950;
    cliffFaceHex = 0x4c443e;
    underRockHex = 0x3b3430;
  } else if (def.biome === 'mist_atoll') {
    grassMossHex = 0x3a6a4b;
    grassMidHex = 0x538858;
    grassSunlitHex = 0x76aa61;
    pathDirtHex = 0xb8a87e;
    rimRockHex = 0x687278;
    cliffFaceHex = 0x586268;
    sandHex = 0xdfd0a4;
  } else if (def.biome === 'ruins') {
    grassMossHex = autumn ? 0x6f6231 : 0x3c6b39;
    grassMidHex = autumn ? 0x9d8642 : 0x589146;
    grassSunlitHex = autumn ? 0xc8a350 : 0x84b64e;
    pathDirtHex = 0xb3a384;
    rimRockHex = 0x8e8a7f;
    cliffFaceHex = 0x747066;
    underRockHex = 0x59554d;
  } else if (autumn) {
    grassMossHex = 0x6e602b;
    grassMidHex = 0x9c8b39;
    grassSunlitHex = 0xc99c4a;
    pathDirtHex = 0x9d7e54;
  }

  const cMoss = new THREE.Color(grassMossHex);
  const cMid = new THREE.Color(grassMidHex);
  const cSunlit = new THREE.Color(grassSunlitHex);
  const cDirt = new THREE.Color(pathDirtHex);
  const cRim = new THREE.Color(rimRockHex);
  const cCliff = new THREE.Color(cliffFaceHex);
  const cUnder = new THREE.Color(underRockHex);
  const cSand = new THREE.Color(sandHex);
  const cWetSand = new THREE.Color(wetSandHex);
  const cSeabed = new THREE.Color(seabedHex);
  const cRiverBed = new THREE.Color(0x527a82);
  const cEmber = new THREE.Color(0xd95626);
  const tmpCol = new THREE.Color();

  // 1. High-Res Sculpted Top Cap Grid with Smooth Interpolated Normals
  const rings = 46;
  const segs = 104;
  const topPos: number[] = [];
  const topCol: number[] = [];
  const topUv: number[] = [];
  const topIdx: number[] = [];

  const cx = toWorldX(def.centerX);
  const cz = toWorldZ(def.centerY);

  const sampleTopColor = (wx: number, wy: number, h: number) => {
    const eps = 15;
    const nd = islandNormalizedDist(def, wx, wy);
    const hx = groundHeightAtSim(wx + eps, wy);
    const hz = groundHeightAtSim(wx, wy + eps);
    const slope = Math.hypot((hx - h) / (eps * WORLD_SCALE), (hz - h) / (eps * WORLD_SCALE));
    const riv = riverDepthAtSim(def, wx, wy);
    const pond = pondDepthAtSim(def, wx, wy);

    if (def.biome === 'volcanic' && h < 0.08) {
      tmpCol.copy(cEmber).lerp(cSeabed, 0.3);
    } else if (h < -0.04) {
      tmpCol.copy(cSeabed);
    } else if (h < 0.16) {
      tmpCol.copy(cWetSand).lerp(cSand, smoothstep(-0.04, 0.16, h));
    } else if (riv.inRiver || pond.inPond) {
      tmpCol.copy(cRiverBed).lerp(cWetSand, 0.28);
    } else if (riv.bankFactor > 0.12 || pond.depth > 0.12) {
      tmpCol.copy(cWetSand).lerp(cMoss, 0.62);
    } else if (slope > 0.36) {
      tmpCol.copy(cCliff).lerp(cRim, 0.36);
    } else if (h < 0.34 && (nd > 0.64 || def.biome === 'mist_atoll')) {
      tmpCol.copy(cSand).lerp(cMid, smoothstep(0.24, 0.36, h) * 0.45);
    } else {
      const fbmPatch = fbm2(wx * 0.0085 + 3.1, wy * 0.0085 - 5.4, 3) * 0.5 + 0.5;
      const clearingGlow = 1 - smoothstep(0.18, 0.72, nd);
      const sunMix = Math.max(0, Math.min(1, fbmPatch * 0.6 + clearingGlow * 0.42));

      if (sunMix < 0.46) {
        tmpCol.copy(cMoss).lerp(cMid, sunMix / 0.46);
      } else {
        tmpCol.copy(cMid).lerp(cSunlit, (sunMix - 0.46) / 0.54);
      }

      // Soft warm hearth clearing tint around central settlement ground
      const plazaMix = (1 - smoothstep(0.08, 0.18, nd)) * 0.75;
      if (plazaMix > 0.01) {
        tmpCol.lerp(cDirt, plazaMix);
      }

      const forestShade = smoothstep(0.62, 0.9, nd) * 0.32;
      if (forestShade > 0.01) {
        tmpCol.lerp(cMoss, forestShade);
      }

      if (def.biome === 'crag' && h > def.elevationY + 2.0) {
        tmpCol.lerp(cCliff, 0.58);
      } else if (def.biome === 'frost' && h > def.elevationY + 2.1) {
        tmpCol.lerp(cSunlit, 0.8);
      }
    }
  };

  const centerH = groundHeightAtSim(def.centerX, def.centerY);
  topPos.push(cx, centerH, cz);
  topUv.push(cx * 0.055, cz * 0.055);
  sampleTopColor(def.centerX, def.centerY, centerH);
  topCol.push(tmpCol.r, tmpCol.g, tmpCol.b);

  const outerEdgePts: { x3: number; y3: number; z3: number; col: THREE.Color }[] = [];

  for (let r = 1; r <= rings; r++) {
    const f = (r / rings) * 1.015;
    for (let s = 0; s < segs; s++) {
      const ang = (s / segs) * Math.PI * 2;
      const wobble = islandCoastWobble(def, ang);
      const x3 = cx + Math.cos(ang) * rx3 * f * wobble;
      const z3 = cz + Math.sin(ang) * rz3 * f * wobble;
      const sx = toSimX(x3);
      const sy = toSimY(z3);
      const y3 = islandTerrainHeightAtSim(def, sx, sy, islandNormalizedDist(def, sx, sy));
      topPos.push(x3, y3, z3);
      topUv.push(x3 * 0.055, z3 * 0.055);

      sampleTopColor(sx, sy, y3);
      topCol.push(tmpCol.r, tmpCol.g, tmpCol.b);

      if (r === rings) {
        outerEdgePts.push({ x3, y3, z3, col: tmpCol.clone() });
      }
    }
  }

  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs;
    topIdx.push(0, 1 + next, 1 + s);
  }
  for (let r = 1; r < rings; r++) {
    const row0 = 1 + (r - 1) * segs;
    const row1 = 1 + r * segs;
    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs;
      const a = row0 + s;
      const b = row0 + next;
      const c = row1 + s;
      const d = row1 + next;
      topIdx.push(a, b, c, b, d, c);
    }
  }

  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(topPos, 3));
  topGeo.setAttribute('color', new THREE.Float32BufferAttribute(topCol, 3));
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
  topGeo.setIndex(topIdx);
  topGeo.computeVertexNormals();
  const topNonIdx = topGeo.toNonIndexed();
  topGeo.dispose();
  parts.push(topNonIdx);

  // 2. Stratified Cliff & Submerged Underwater Seabed Skirt (exact edge continuity with outerEdgePts)
  const underPos: number[] = [];
  const underCol: number[] = [];
  const underUv: number[] = [];
  const underIdx: number[] = [];

  const cliffDepth = def.elevationY > 3.5 ? 10.6 : 5.6;
  const skirtRings: [number, number, THREE.Color][] = [
    [1.015, 0, cRim],
    [0.95, Math.min(-1.4, def.elevationY - 2.3), cCliff],
    [0.64, Math.min(-3.4, def.elevationY - cliffDepth * 0.62), cUnder],
    [0.24, Math.min(-5.2, def.elevationY - cliffDepth), cUnder],
  ];

  for (let r = 0; r < skirtRings.length; r++) {
    const [radScale, yBase, col] = skirtRings[r];
    for (let s = 0; s < segs; s++) {
      if (r === 0) {
        const edge = outerEdgePts[s];
        underPos.push(edge.x3, edge.y3, edge.z3);
        underUv.push(edge.x3 * 0.04, edge.y3 * 0.04);
        underCol.push(edge.col.r, edge.col.g, edge.col.b);
      } else {
        const ang = (s / segs) * Math.PI * 2;
        const wobble = islandCoastWobble(def, ang);
        const cragJitter = Math.sin(s * 2.9 + r * 2.1) * 0.07;
        const x3 = cx + Math.cos(ang) * rx3 * (radScale + cragJitter) * wobble;
        const z3 = cz + Math.sin(ang) * rz3 * (radScale + cragJitter) * wobble;
        const edgeY = outerEdgePts[s].y3;
        const y3 = Math.min(edgeY - r * 0.65, yBase + Math.cos(s * 3.3 + r) * 0.42);
        underPos.push(x3, y3, z3);
        underUv.push(x3 * 0.04, y3 * 0.04);
        underCol.push(col.r, col.g, col.b);
      }
    }
  }
  const tipIdx = underPos.length / 3;
  underPos.push(cx, Math.min(-6.8, def.elevationY - cliffDepth - 2.4), cz);
  underUv.push(cx * 0.04, 0);
  underCol.push(cUnder.r * 0.78, cUnder.g * 0.78, cUnder.b * 0.78);

  for (let r = 0; r < skirtRings.length - 1; r++) {
    const r0 = r * segs;
    const r1 = (r + 1) * segs;
    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs;
      underIdx.push(r0 + s, r0 + next, r1 + s, r0 + next, r1 + next, r1 + s);
    }
  }
  const lastRing = (skirtRings.length - 1) * segs;
  for (let s = 0; s < segs; s++) {
    const next = (s + 1) % segs;
    underIdx.push(lastRing + s, lastRing + next, tipIdx);
  }

  const underGeo = new THREE.BufferGeometry();
  underGeo.setAttribute('position', new THREE.Float32BufferAttribute(underPos, 3));
  underGeo.setAttribute('color', new THREE.Float32BufferAttribute(underCol, 3));
  underGeo.setAttribute('uv', new THREE.Float32BufferAttribute(underUv, 2));
  underGeo.setIndex(underIdx);
  const underNonIdx = underGeo.toNonIndexed();
  underGeo.dispose();
  underNonIdx.computeVertexNormals();
  parts.push(underNonIdx);

  // 3. Underside rock keel formations for high sky-islands
  if (def.elevationY > 2.0) {
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + ((def.coastSeed ?? 3) % 7) * 0.4;
      const rDist = 0.44;
      const sx = cx + Math.cos(ang) * rx3 * rDist;
      const sz = cz + Math.sin(ang) * rz3 * rDist;
      const hStal = 3.2 + (i % 2) * 1.4;
      const cone = new THREE.ConeGeometry(1.6 + (i % 2) * 0.45, hStal, 5);
      cone.rotateX(Math.PI);
      cone.translate(sx, Math.min(-3.6, def.elevationY - cliffDepth * 0.62 - hStal * 0.4), sz);
      const coneNonIdx = cone.toNonIndexed();
      cone.dispose();
      coneNonIdx.computeVertexNormals();
      const count = coneNonIdx.getAttribute('position').count;
      const cols = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) {
        cols[k * 3] = cUnder.r * 0.85;
        cols[k * 3 + 1] = cUnder.g * 0.85;
        cols[k * 3 + 2] = cUnder.b * 0.85;
      }
      coneNonIdx.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      if (!coneNonIdx.getAttribute('uv')) {
        coneNonIdx.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      parts.push(coneNonIdx);
    }
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged ?? new THREE.BufferGeometry();
}

export function buildSkySeaGeometry(): THREE.BufferGeometry {
  const geom = new THREE.PlaneGeometry(980, 740, 84, 64);
  geom.rotateX(-Math.PI / 2);
  return geom;
}

export function buildWaterfallGeometry(def: IslandDef): THREE.BufferGeometry {
  const ang = def.waterfallAngle ?? 1.2;
  const wobble = islandCoastWobble(def, ang);
  const rx3 = def.radiusX * WORLD_SCALE * 0.94 * wobble;
  const rz3 = def.radiusY * WORLD_SCALE * 0.94 * wobble;
  const topX = toWorldX(def.centerX) + Math.cos(ang) * rx3;
  const topZ = toWorldZ(def.centerY) + Math.sin(ang) * rz3;
  const rimSimX = toSimX(topX);
  const rimSimY = toSimY(topZ);
  const topY = Math.max(0.55, groundHeightAtSim(rimSimX, rimSimY) - 0.08);
  const botX = topX + Math.cos(ang) * 1.95;
  const botZ = topZ + Math.sin(ang) * 1.95;

  const ribbon = new THREE.PlaneGeometry(1.9, topY + 0.35, 3, 10);
  const pos = ribbon.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(0x7cc7da);
  const cFoam = new THREE.Color(0xe6f7fc);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const t = 1 - (ly + (topY + 0.35) * 0.5) / (topY + 0.35);
    const px = topX + (botX - topX) * t + Math.sin(ang + Math.PI / 2) * lx;
    const pz = topZ + (botZ - topZ) * t - Math.cos(ang + Math.PI / 2) * lx;
    const py = topY * (1 - t);
    pos.setXYZ(i, px, py, pz);

    const foamMix = smoothstep(0.62, 1.0, t);
    tmp.copy(cTop).lerp(cFoam, foamMix * 0.85);
    cols[i * 3] = tmp.r;
    cols[i * 3 + 1] = tmp.g;
    cols[i * 3 + 2] = tmp.b;
  }
  ribbon.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  ribbon.computeVertexNormals();
  const ribbonNonIdx = ribbon.toNonIndexed();
  ribbon.dispose();

  // Subtle sea-level plunge foam ring where waterfall meets ocean
  const splash = new THREE.CircleGeometry(1.75, 14);
  splash.rotateX(-Math.PI / 2);
  splash.translate(botX, 0.035, botZ);
  const sPos = splash.getAttribute('position');
  const sCols = new Float32Array(sPos.count * 3);
  for (let k = 0; k < sPos.count; k++) {
    sCols[k * 3] = cFoam.r;
    sCols[k * 3 + 1] = cFoam.g;
    sCols[k * 3 + 2] = cFoam.b;
  }
  splash.setAttribute('color', new THREE.BufferAttribute(sCols, 3));
  const splashNonIdx = splash.toNonIndexed();
  splash.dispose();

  const merged = mergeGeometries([ribbonNonIdx, splashNonIdx], false);
  ribbonNonIdx.dispose();
  splashNonIdx.dispose();
  return merged ?? new THREE.BufferGeometry();
}

export function buildIslandRiversGeometry(def: IslandDef): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const cRiver = new THREE.Color(0x5eb2c9);
  const cEstuary = new THREE.Color(0xbcecf5);
  const tmp = new THREE.Color();

  if (def.rivers && def.rivers.length > 0) {
    for (const r of def.rivers) {
      const baseHalfW = r.width * WORLD_SCALE * 0.44;
      const bankProbeSim = Math.max(20, r.width * 0.78);
      const segCount = Math.max(1, r.points.length - 1);
      let runningY = Infinity;

      for (let i = 0; i < segCount; i++) {
        const a = r.points[i];
        const b = r.points[i + 1];
        const subSteps = 8;
        for (let s = 0; s < subSteps; s++) {
          const t0 = s / subSteps;
          const t1 = (s + 1) / subSteps;
          const u0 = (i + t0) / segCount;
          const u1 = (i + t1) / segCount;

          const sx0 = def.centerX + a.dx + (b.dx - a.dx) * t0;
          const sy0 = def.centerY + a.dy + (b.dy - a.dy) * t0;
          const sx1 = def.centerX + a.dx + (b.dx - a.dx) * t1;
          const sy1 = def.centerY + a.dy + (b.dy - a.dy) * t1;

          const nd0 = islandNormalizedDist(def, sx0, sy0);
          const nd1 = islandNormalizedDist(def, sx1, sy1);
          if (nd0 > 1.03 && nd1 > 1.03) continue;

          const x0 = toWorldX(sx0);
          const z0 = toWorldZ(sy0);
          const x1 = toWorldX(sx1);
          const z1 = toWorldZ(sy1);
          const dx = x1 - x0;
          const dz = z1 - z0;
          const len = Math.hypot(dx, dz) || 1;
          const hw0 = baseHalfW * (1 + smoothstep(0.66, 1.0, u0) * 0.62);
          const hw1 = baseHalfW * (1 + smoothstep(0.66, 1.0, u1) * 0.62);
          const nx0 = (-dz / len) * hw0;
          const nz0 = (dx / len) * hw0;
          const nx1 = (-dz / len) * hw1;
          const nz1 = (dx / len) * hw1;

          const simDx = sx1 - sx0;
          const simDy = sy1 - sy0;
          const simLen = Math.hypot(simDx, simDy) || 1;
          const simNx = (-simDy / simLen) * bankProbeSim;
          const simNy = (simDx / simLen) * bankProbeSim;

          const sampleWaterY = (sx: number, sy: number, u: number) => {
            const bed = groundHeightAtSim(sx, sy);
            const bankL = groundHeightAtSim(sx - simNx, sy - simNy);
            const bankR = groundHeightAtSim(sx + simNx, sy + simNy);
            const bankFloor = Math.min(bankL, bankR);
            const rawY = Math.max(bed + 0.14, Math.min(bed + 0.36, bankFloor - 0.04));
            const mouthFade = smoothstep(0.76, 0.99, u);
            return Math.max(0.025, rawY * (1 - mouthFade) + 0.025 * mouthFade);
          };

          const y0 = Math.min(runningY, sampleWaterY(sx0, sy0, u0));
          const y1 = Math.min(y0, sampleWaterY(sx1, sy1, u1));
          runningY = y1;

          const g = new THREE.BufferGeometry();
          const verts = new Float32Array([
            x0 - nx0, y0, z0 - nz0,
            x0 + nx0, y0, z0 + nz0,
            x1 - nx1, y1, z1 - nz1,
            x0 + nx0, y0, z0 + nz0,
            x1 + nx1, y1, z1 + nz1,
            x1 - nx1, y1, z1 - nz1,
          ]);
          const uvs = new Float32Array([
            0, t0,
            1, t0,
            0, t1,
            1, t0,
            1, t1,
            0, t1,
          ]);
          const f0 = smoothstep(0.75, 1.0, u0) * 0.55;
          const f1 = smoothstep(0.75, 1.0, u1) * 0.55;
          tmp.copy(cRiver).lerp(cEstuary, f0);
          const r0 = tmp.r, g0 = tmp.g, b0 = tmp.b;
          tmp.copy(cRiver).lerp(cEstuary, f1);
          const r1 = tmp.r, g1 = tmp.g, b1 = tmp.b;
          const cols = new Float32Array([
            r0, g0, b0,
            r0, g0, b0,
            r1, g1, b1,
            r0, g0, b0,
            r1, g1, b1,
            r1, g1, b1,
          ]);
          g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
          g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
          g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
          g.computeVertexNormals();
          parts.push(g);
        }
      }
    }
  }

  // Calm inland pond water planes recessed smoothly inside carved pond basins
  if (def.ponds && def.ponds.length > 0) {
    for (const pond of def.ponds) {
      const px = def.centerX + pond.dx;
      const py = def.centerY + pond.dy;
      const centerBed = groundHeightAtSim(px, py);
      const rimH = Math.min(
        groundHeightAtSim(px + pond.rx * 1.15, py),
        groundHeightAtSim(px - pond.rx * 1.15, py),
        groundHeightAtSim(px, py + pond.ry * 1.15),
        groundHeightAtSim(px, py - pond.ry * 1.15),
      );
      const waterY = Math.max(centerBed + 0.22, rimH - 0.14);
      const disc = new THREE.CircleGeometry(1, 20);
      disc.rotateX(-Math.PI / 2);
      disc.scale(pond.rx * WORLD_SCALE * 0.92, 1, pond.ry * WORLD_SCALE * 0.92);
      disc.translate(toWorldX(px), waterY, toWorldZ(py));
      const dNonIdx = disc.toNonIndexed();
      disc.dispose();
      const count = dNonIdx.getAttribute('position').count;
      const cols = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) {
        cols[k * 3] = cRiver.r;
        cols[k * 3 + 1] = cRiver.g;
        cols[k * 3 + 2] = cRiver.b;
      }
      dNonIdx.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      parts.push(dNonIdx);
    }
  }

  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged ?? null;
}

export interface ScatterPoint {
  islandId: string;
  x3: number;
  y3: number;
  z3: number;
  scale: number;
  rotY: number;
  colorIndex: number;
}

export function buildArchipelagoFoliageScatter(): {
  grassTufts: ScatterPoint[];
  wildflowers: ScatterPoint[];
  ferns: ScatterPoint[];
} {
  const grassTufts: ScatterPoint[] = [];
  const wildflowers: ScatterPoint[] = [];
  const ferns: ScatterPoint[] = [];

  for (const id of ISLAND_ORDER) {
    const def = ISLAND_DEFS[id];
    const samples =
      def.biome === 'volcanic'
        ? 160
        : def.biome === 'crag' || def.biome === 'frost'
          ? 380
          : def.biome === 'mist_atoll'
            ? 560
            : 1220;

    for (let i = 0; i < samples; i++) {
      const ang = (i * 2.399963) % (Math.PI * 2);
      const r = Math.sqrt((i + 0.5) / samples) * 0.89;
      const wobble = islandCoastWobble(def, ang);
      const wx = def.centerX + Math.cos(ang) * def.radiusX * r * wobble;
      const wy = def.centerY + Math.sin(ang) * def.radiusY * r * wobble;
      const nd = islandNormalizedDist(def, wx, wy);
      if (nd > 0.88) continue;

      if (Math.hypot(wx - def.centerX, wy - def.centerY) < 42) continue;

      if (def.hasSpring && def.springOffset) {
        const sd = Math.hypot(wx - (def.centerX + def.springOffset.dx), wy - (def.centerY + def.springOffset.dy));
        if (sd < 44) continue;
      }
      if (riverDepthAtSim(def, wx, wy).depth > 0.14) continue;
      if (pondDepthAtSim(def, wx, wy).depth > 0.14) continue;

      const y3 = groundHeightAtSim(wx, wy);
      if (y3 < 0.28) continue;
      if (def.biome === 'volcanic' && y3 < def.elevationY - 0.35) continue;

      if (terrainSlopeAtSim(wx, wy) > 0.42) continue;

      const noisePatch = fbm2(wx * 0.012, wy * 0.012, 2);
      const colorBucket =
        nd > 0.58 || noisePatch < -0.15
          ? (i % 2 === 0 ? 2 : 4)
          : noisePatch > 0.2
            ? 1
            : (i % 3);

      const pt: ScatterPoint = {
        islandId: id,
        x3: toWorldX(wx),
        y3: y3 - 0.02,
        z3: toWorldZ(wy),
        scale: 0.74 + ((i * 13) % 7) * 0.065,
        rotY: (i * 1.73) % (Math.PI * 2),
        colorIndex: colorBucket,
      };

      const isFlowerSpot =
        def.biome !== 'crag' &&
        def.biome !== 'volcanic' &&
        def.biome !== 'frost' &&
        (i % 7 === 0 || (i % 13 === 0 && nd > 0.35));

      if (isFlowerSpot) {
        wildflowers.push(pt);
      } else if (
        (i % 8 === 0 && (def.biome === 'pine' || def.biome === 'mist_atoll' || def.biome === 'ruins' || nd > 0.56))
      ) {
        ferns.push(pt);
      } else {
        grassTufts.push(pt);
      }
    }
  }

  return { grassTufts, wildflowers, ferns };
}

function resolveValidLandmarkSpot(
  def: IslandDef,
  tx: number,
  ty: number,
  allowWetRim = false,
): { x: number; y: number } {
  const isOk = (wx: number, wy: number) => {
    const nd = islandNormalizedDist(def, wx, wy);
    if (nd > 0.90) return false;
    const h = islandTerrainHeightAtSim(def, wx, wy, nd);
    if (h < (allowWetRim ? 0.06 : 0.28)) return false;
    if (def.biome === 'volcanic' && h < def.elevationY - 0.35) return false;
    if (def.hasSpring && def.springOffset) {
      const sd = Math.hypot(wx - (def.centerX + def.springOffset.dx), wy - (def.centerY + def.springOffset.dy));
      if (sd < (allowWetRim ? 22 : 42)) return false;
    }
    if (pondDepthAtSim(def, wx, wy).inPond) return false;
    const riv = riverDepthAtSim(def, wx, wy);
    if (riv.inRiver || (!allowWetRim && riv.depth > 0.16)) return false;
    if (terrainSlopeAtSim(wx, wy) > 0.44) return false;
    return true;
  };
  if (isOk(tx, ty)) return { x: tx, y: ty };
  const baseAng = Math.atan2(ty - def.centerY, tx - def.centerX);
  const baseR = Math.hypot((tx - def.centerX) / def.radiusX, (ty - def.centerY) / def.radiusY);
  for (let step = 1; step <= 18; step++) {
    const sign = step % 2 === 0 ? 1 : -1;
    const ang = baseAng + sign * Math.ceil(step / 2) * 0.24;
    const rad = Math.min(0.84, Math.max(0.28, baseR * 0.94));
    const wobble = islandCoastWobble(def, ang);
    const cx = Math.round(def.centerX + Math.cos(ang) * def.radiusX * rad * wobble);
    const cy = Math.round(def.centerY + Math.sin(ang) * def.radiusY * rad * wobble);
    if (isOk(cx, cy)) return { x: cx, y: cy };
  }
  return { x: tx, y: ty };
}

export function buildArchipelagoLandmarks(): WorldLandmark[] {
  const list: WorldLandmark[] = [];
  let idx = 0;

  const add = (
    islandId: WorldLandmark['islandId'],
    kind: WorldLandmark['kind'],
    x: number,
    y: number,
    scale = 1,
    rotY = 0,
  ) => {
    if (islandId !== 'sea') {
      const def = ISLAND_DEFS[islandId];
      const pos = resolveValidLandmarkSpot(def, x, y, kind === 'reed_clump' || kind === 'driftwood');
      list.push({ id: `lm_${idx++}`, islandId, kind, x: pos.x, y: pos.y, scale, rotY });
      return;
    }
    list.push({ id: `lm_${idx++}`, islandId, kind, x, y, scale, rotY });
  };

  for (const id of ISLAND_ORDER) {
    const def = ISLAND_DEFS[id];
    const rng = mulberry32((def.coastSeed ?? 1) + 77);

    // Reeds beside natural springs & ponds
    if (def.hasSpring && def.springOffset) {
      const rAng = rng() * Math.PI * 2;
      add(
        id,
        'reed_clump',
        Math.round(def.centerX + def.springOffset.dx + Math.cos(rAng) * 34),
        Math.round(def.centerY + def.springOffset.dy + Math.sin(rAng) * 28),
        1.02,
        rng() * Math.PI * 2,
      );
    }

    if (def.ponds && def.ponds.length > 0) {
      for (const pond of def.ponds) {
        for (let p = 0; p < 2; p++) {
          const pAng = rng() * Math.PI * 2;
          add(
            id,
            'reed_clump',
            Math.round(def.centerX + pond.dx + Math.cos(pAng) * (pond.rx + 12)),
            Math.round(def.centerY + pond.dy + Math.sin(pAng) * (pond.ry + 12)),
            0.95 + rng() * 0.25,
            rng() * Math.PI * 2,
          );
        }
      }
    }

    // Driftwood along sandy coastal coves
    if (def.coveAngles && def.coveAngles.length > 0 && def.biome !== 'volcanic') {
      const coveAng = def.coveAngles[Math.floor(rng() * def.coveAngles.length)] + (rng() - 0.5) * 0.22;
      const rimWob = islandCoastWobble(def, coveAng);
      add(
        id,
        'driftwood',
        Math.round(def.centerX + Math.cos(coveAng) * def.radiusX * rimWob * 0.86),
        Math.round(def.centerY + Math.sin(coveAng) * def.radiusY * rimWob * 0.86),
        0.95 + rng() * 0.2,
        coveAng + Math.PI * 0.5,
      );
    }

    // Forest stumps near outer tree groves on woodland islands
    if (def.biome === 'meadow' || def.biome === 'pine' || def.biome === 'terrace' || def.biome === 'ruins') {
      const stumpCount = def.biome === 'meadow' ? 3 : 2;
      for (let s = 0; s < stumpCount; s++) {
        const sAng = (s / stumpCount) * Math.PI * 2 + rng() * 1.4;
        const sRad = 0.42 + rng() * 0.22;
        const wob = islandCoastWobble(def, sAng);
        add(
          id,
          'stump',
          Math.round(def.centerX + Math.cos(sAng) * def.radiusX * sRad * wob),
          Math.round(def.centerY + Math.sin(sAng) * def.radiusY * sRad * wob),
          0.95 + rng() * 0.18,
          rng() * Math.PI * 2,
        );
      }
    }

    // Scenic ruins / alpine spires strictly tailored to lore & glacier islands
    if (id === 'starbloom') {
      const ang = rng() * Math.PI * 2;
      add(id, 'ruin_cairn', Math.round(def.centerX + Math.cos(ang) * 230), Math.round(def.centerY + Math.sin(ang) * 180), 1.15, rng() * Math.PI);
      add(id, 'crystal_spire', Math.round(def.centerX - Math.cos(ang) * 240), Math.round(def.centerY - Math.sin(ang) * 185), 1.2, rng() * Math.PI);
    } else if (id === 'frostpeak') {
      const ang = rng() * Math.PI * 2;
      add(id, 'crystal_spire', Math.round(def.centerX + Math.cos(ang) * 210), Math.round(def.centerY + Math.sin(ang) * 170), 1.35, rng() * Math.PI);
    }
  }

  // Seeded sea stacks / floating sky-islets scattered across open sky-sea channels
  const seaRng = mulberry32((ISLAND_DEFS.cradle.coastSeed ?? 104729) + 991);
  let seaAttempts = 0;
  let seaPlaced = 0;
  while (seaPlaced < 10 && seaAttempts < 180) {
    seaAttempts++;
    const sx = Math.round(360 + seaRng() * (WORLD_WIDTH - 720));
    const sy = Math.round(320 + seaRng() * (WORLD_HEIGHT - 640));
    if (getIslandAtPoint(sx, sy, -220) !== null) continue;
    add('sea', 'sky_islet', sx, sy, 1.0 + seaRng() * 0.3, seaRng() * Math.PI * 2);
    seaPlaced++;
  }

  return list;
}
