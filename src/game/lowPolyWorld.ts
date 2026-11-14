import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ISLAND_DEFS,
  ISLAND_ORDER,
  WORLD_HEIGHT,
  WORLD_SCALE,
  WORLD_WIDTH,
  islandCoastWobble,
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

/**
 * Computes normalized radial distance inside an island ellipse (0 = center, 1 = cliff rim).
 */
export function islandNormalizedDist(def: IslandDef, wx: number, wy: number): number {
  const dx = (wx - def.centerX) / def.radiusX;
  const dy = (wy - def.centerY) / def.radiusY;
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(def, ang);
  return Math.hypot(dx, dy) / wobble;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-4) return Math.hypot(wx, wy);
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

export function riverDepthAtSim(def: IslandDef, wx: number, wy: number): { inRiver: boolean; depth: number } {
  if (!def.rivers || def.rivers.length === 0) return { inRiver: false, depth: 0 };
  let maxDepth = 0;
  for (const r of def.rivers) {
    const halfW = r.width * 0.55;
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const d = distToSegment(wx, wy, def.centerX + a.dx, def.centerY + a.dy, def.centerX + b.dx, def.centerY + b.dy);
      if (d < halfW * 1.45) {
        const carve = (1 - smoothstep(halfW * 0.35, halfW * 1.45, d)) * 0.68;
        if (carve > maxDepth) maxDepth = carve;
      }
    }
  }
  return { inRiver: maxDepth > 0.28, depth: maxDepth };
}

/**
 * Sculpted island plateau + stepped cliff height (excluding bridge spans).
 * Uses steep cliffs, multi-river valleys, calderas, ravines, and towering alpine mountains.
 */
export function islandTerrainHeightAtSim(def: IslandDef, wx: number, wy: number, nd: number): number {
  const lx = (wx - def.centerX) / def.radiusX; // -1..1
  const ly = (wy - def.centerY) / def.radiusY; // -1..1
  const gentleNoise =
    Math.sin(wx * 0.014 + wy * 0.011) * 0.28 +
    Math.cos(wx * 0.009 - wy * 0.015) * 0.22;
  const rimDrop = smoothstep(0.87, 1.03, nd) * 0.48;

  let relief = gentleNoise * (1 - nd * 0.52);

  if (def.id === 'cradle') {
    // Rising northern grassy bluff with crisp cliff step & gentle southern meadow knoll
    const bluffMask = smoothstep(-0.1, -0.3, ly) * smoothstep(0.78, 0.2, Math.abs(lx));
    relief += bluffMask * 1.95;
    const southKnob = smoothstep(0.46, 0.1, Math.hypot(lx - 0.36, ly - 0.36));
    relief += southKnob * 0.85;
    const westRidge = smoothstep(0.44, 0.12, Math.hypot(lx + 0.48, ly + 0.14));
    relief += westRidge * 0.78;
  } else if (def.id === 'timbercrown') {
    // Dramatic sheer multi-tiered cliffside shelves + deep waterfall gorge
    const tier1 = smoothstep(0.32, 0.22, ly + lx * 0.18) * 2.25;
    const tier2 = smoothstep(-0.04, -0.14, ly - lx * 0.12) * 2.55;
    const tier3 = smoothstep(-0.36, -0.45, ly + lx * 0.08) * 1.45;
    const gorgeAng = def.waterfallAngle ?? 0.72;
    const ang = Math.atan2(ly, lx);
    const angDiff = Math.abs(Math.atan2(Math.sin(ang - gorgeAng), Math.cos(ang - gorgeAng)));
    const gorgeCut = nd > 0.32 ? smoothstep(0.3, 0.05, angDiff) * 1.65 : 0;
    relief += tier1 + tier2 + tier3 - gorgeCut;
  } else if (def.id === 'sunterrace') {
    // Sprawling 3-terrace fertile valley cut by 3 river channels
    const slope = lx * 0.38 - ly * 0.62;
    const stepA = smoothstep(-0.28, -0.14, slope) * 1.15;
    const stepB = smoothstep(0.14, 0.28, slope) * 1.15;
    relief = gentleNoise * 0.28 + stepA + stepB;
  } else if (def.id === 'coppercrag') {
    // Twin jagged basalt caldera ridges surrounding an interior forge basin
    const westSpire = smoothstep(0.5, 0.12, Math.hypot(lx + 0.38, ly + 0.18)) * 3.55;
    const northRidge = smoothstep(0.45, 0.1, Math.hypot(lx - 0.28, ly + 0.32)) * 2.95;
    const basin = smoothstep(0.38, 0.1, Math.hypot(lx, ly - 0.08)) * -0.95;
    const cragJags = Math.abs(Math.sin(wx * 0.028) * Math.cos(wy * 0.026)) * 0.68;
    relief += westSpire + northRidge + basin + cragJags;
  } else if (def.id === 'mistatoll') {
    // Crescent rocky sea-cliffs cupping a sunken turquoise lagoon opening west
    const horseshoe = smoothstep(0.36, 0.68, nd) * smoothstep(-0.78, -0.22, lx) * 1.75;
    const lagoonDip = smoothstep(0.44, 0.14, Math.hypot(lx + 0.14, ly)) * 0.62;
    relief += horseshoe - lagoonDip;
  } else if (def.id === 'starbloom') {
    // Sunken central star-ruin amphitheater ringed by stepped jade cliff terraces
    const ringWall = Math.exp(-Math.pow((nd - 0.58) / 0.18, 2)) * 1.6;
    const centerArena = smoothstep(0.4, 0.12, nd) * -0.58;
    const northKnoll = smoothstep(0.45, 0.12, Math.hypot(lx - 0.28, ly + 0.32)) * 1.2;
    relief += ringWall + centerArena + northKnoll;
  } else if (def.id === 'embervault') {
    // Jagged volcanic caldera cone & glowing fortress plateau
    const coneRim = Math.exp(-Math.pow((nd - 0.42) / 0.22, 2)) * 3.35;
    const citadelPlate = smoothstep(0.32, 0.14, Math.hypot(lx - 0.05, ly + 0.08)) * 1.35;
    const lavaTrench = smoothstep(0.24, 0.06, Math.hypot(lx + 0.34, ly - 0.22)) * -1.55;
    const basaltSpikes = Math.abs(Math.sin(wx * 0.031) * Math.cos(wy * 0.025)) * 0.72;
    relief += coneRim + citadelPlate + lavaTrench + basaltSpikes;
  } else if (def.id === 'frostpeak') {
    // Towering alpine mountain massif with twin high peaks, high pass, and stepped snow shelf
    const summitPeak = smoothstep(0.58, 0.06, Math.hypot(lx + 0.2, ly + 0.2)) * 5.65;
    const eastPeak = smoothstep(0.48, 0.1, Math.hypot(lx - 0.34, ly - 0.08)) * 3.85;
    const southSpur = smoothstep(0.42, 0.12, Math.hypot(lx + 0.1, ly - 0.35)) * 2.15;
    const glacierShelf = smoothstep(0.18, -0.05, ly) * 1.05;
    const iceFacets = Math.abs(Math.sin(wx * 0.022 + wy * 0.018)) * 0.62;
    relief += summitPeak + eastPeak + southSpur + glacierShelf + iceFacets;
  }

  let h = def.elevationY + relief - rimDrop;

  // Carve multi-river channels cleanly into the plateau
  const riverSample = riverDepthAtSim(def, wx, wy);
  if (riverSample.depth > 0) {
    h -= riverSample.depth;
  }

  if (def.hasSpring && def.springOffset) {
    const sx = def.centerX + def.springOffset.dx;
    const sy = def.centerY + def.springOffset.dy;
    const sd = Math.hypot(wx - sx, wy - sy);
    if (sd < 40) {
      h -= (1 - smoothstep(14, 40, sd)) * 0.38;
    }
  }
  return Math.max(0.14, h);
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

  return 0.0; // Sky-sea water plane
}

/**
 * Builds one faceted floating island mesh: sculpted biomed top + stratified craggy underside spire & roots!
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

  let grassHex = 0x67a454;
  let grassLitHex = 0x7cb862;
  let rimRockHex = 0x7a7165;
  let cliffFaceHex = 0x675f55;
  let underRockHex = 0x524b44;
  let sandHex = 0xd6c39b;

  if (def.biome === 'volcanic') {
    grassHex = 0x4b4442;
    grassLitHex = 0x635249;
    rimRockHex = 0x3a3231;
    cliffFaceHex = 0x2c2424;
    underRockHex = 0x1e191a;
    sandHex = 0x9b3e24;
  } else if (def.biome === 'frost' || snow) {
    grassHex = def.biome === 'frost' ? 0xcce0ee : 0xd7e3ec;
    grassLitHex = 0xf2f7fb;
    rimRockHex = 0x6c7c8c;
    cliffFaceHex = 0x566675;
    underRockHex = 0x43515e;
    sandHex = 0xcfdce5;
  } else if (def.biome === 'pine') {
    grassHex = autumn ? 0x8d8849 : 0x4b7e48;
    grassLitHex = autumn ? 0xb4964c : 0x5f9656;
    rimRockHex = 0x6e685e;
    cliffFaceHex = 0x5b554d;
  } else if (def.biome === 'terrace') {
    grassHex = autumn ? 0xb39a48 : 0x75ad52;
    grassLitHex = autumn ? 0xd2ad4d : 0x8ec466;
    cliffFaceHex = 0x857058;
  } else if (def.biome === 'crag') {
    grassHex = 0x767469;
    grassLitHex = 0x8f887a;
    rimRockHex = 0x645b52;
    cliffFaceHex = 0x4e4640;
    underRockHex = 0x3d3632;
  } else if (def.biome === 'mist_atoll') {
    grassHex = 0x598e6b;
    grassLitHex = 0x6ea67c;
    rimRockHex = 0x687278;
    cliffFaceHex = 0x586268;
  } else if (def.biome === 'ruins') {
    grassHex = autumn ? 0x9f8b4e : 0x5b9b68;
    grassLitHex = autumn ? 0xc7a354 : 0x78bd7f;
    rimRockHex = 0x989488;
    cliffFaceHex = 0x7c786e;
    underRockHex = 0x5c5850;
  } else if (autumn) {
    grassHex = 0xa79c4b;
    grassLitHex = 0xc99c4a;
  }

  const cGrass = new THREE.Color(grassHex);
  const cGrassLit = new THREE.Color(grassLitHex);
  const cRim = new THREE.Color(rimRockHex);
  const cCliff = new THREE.Color(cliffFaceHex);
  const cUnder = new THREE.Color(underRockHex);
  const cSand = new THREE.Color(sandHex);
  const cRiverBed = new THREE.Color(0x526b6e);
  const cEmber = new THREE.Color(0xd95626);
  const tmpCol = new THREE.Color();

  // 1. Sculpted Top Cap Grid (higher resolution for crisp terraces, calderas & riverbeds)
  const rings = 26;
  const segs = 58;
  const topPos: number[] = [];
  const topCol: number[] = [];
  const topIdx: number[] = [];

  const cx = toWorldX(def.centerX);
  const cz = toWorldZ(def.centerY);

  const sampleTopColor = (wx: number, wy: number, h: number, rIndex: number) => {
    const eps = 15;
    const nd = islandNormalizedDist(def, wx, wy);
    const hx = groundHeightAtSim(wx + eps, wy);
    const hz = groundHeightAtSim(wx, wy + eps);
    const slope = Math.hypot((hx - h) / (eps * WORLD_SCALE), (hz - h) / (eps * WORLD_SCALE));
    const riv = riverDepthAtSim(def, wx, wy);

    if (rIndex >= rings - 1) {
      tmpCol.copy(cRim);
    } else if (def.biome === 'volcanic' && h < def.elevationY - 0.45) {
      // Glowing lava trench floor inside volcanic island
      tmpCol.copy(cEmber).lerp(cSand, 0.35);
    } else if (riv.inRiver) {
      tmpCol.copy(cRiverBed).lerp(cSand, 0.35);
    } else if (slope > 0.32) {
      // Exposed cliff strata or terrace riser wall!
      tmpCol.copy(cCliff).lerp(cRim, 0.35);
    } else if (def.biome === 'mist_atoll' && h < 0.44) {
      tmpCol.copy(cSand);
    } else {
      const mix = Math.sin(wx * 0.02 + wy * 0.015) * 0.5 + 0.5;
      tmpCol.copy(cGrass).lerp(cGrassLit, mix * 0.65 + (1 - nd) * 0.22);
      if (def.biome === 'crag' && h > def.elevationY + 2.1) {
        tmpCol.lerp(cCliff, 0.55);
      } else if (def.biome === 'frost' && h > def.elevationY + 2.2) {
        tmpCol.lerp(cGrassLit, 0.78);
      }
    }
  };

  const centerH = groundHeightAtSim(def.centerX, def.centerY);
  topPos.push(cx, centerH, cz);
  sampleTopColor(def.centerX, def.centerY, centerH, 0);
  topCol.push(tmpCol.r, tmpCol.g, tmpCol.b);

  for (let r = 1; r <= rings; r++) {
    const f = r / rings;
    for (let s = 0; s < segs; s++) {
      const ang = (s / segs) * Math.PI * 2;
      const wobble = islandCoastWobble(def, ang);
      const x3 = cx + Math.cos(ang) * rx3 * f * wobble;
      const z3 = cz + Math.sin(ang) * rz3 * f * wobble;
      const sx = toSimX(x3);
      const sy = toSimY(z3);
      const y3 = r === rings ? def.elevationY - 0.42 : groundHeightAtSim(sx, sy);
      topPos.push(x3, y3, z3);

      sampleTopColor(sx, sy, y3, r);
      topCol.push(tmpCol.r, tmpCol.g, tmpCol.b);
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
  topGeo.setIndex(topIdx);
  const topNonIdx = topGeo.toNonIndexed();
  topGeo.dispose();
  topNonIdx.computeVertexNormals();
  parts.push(topNonIdx);

  // 2. Stratified Floating Cliff Skirt & Craggy Underside Spire
  const underPos: number[] = [];
  const underCol: number[] = [];
  const underIdx: number[] = [];

  const cliffDepth = def.elevationY > 3.5 ? 10.6 : 5.8;
  const skirtRings: [number, number, THREE.Color][] = [
    [1.0, def.elevationY - 0.42, cRim],
    [0.93, def.elevationY - 2.1, cCliff],
    [0.64, def.elevationY - cliffDepth * 0.62, cUnder],
    [0.24, def.elevationY - cliffDepth, cUnder],
  ];

  for (let r = 0; r < skirtRings.length; r++) {
    const [radScale, yBase, col] = skirtRings[r];
    for (let s = 0; s < segs; s++) {
      const ang = (s / segs) * Math.PI * 2;
      const wobble = islandCoastWobble(def, ang);
      const cragJitter = r > 0 ? Math.sin(s * 2.9 + r * 2.1) * 0.1 : 0;
      const x3 = cx + Math.cos(ang) * rx3 * (radScale + cragJitter) * wobble;
      const z3 = cz + Math.sin(ang) * rz3 * (radScale + cragJitter) * wobble;
      const y3 = yBase + (r > 0 ? Math.cos(s * 3.3 + r) * 0.48 : 0);
      underPos.push(x3, y3, z3);
      underCol.push(col.r, col.g, col.b);
    }
  }
  const tipIdx = underPos.length / 3;
  underPos.push(cx, def.elevationY - cliffDepth - 2.4, cz);
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
  underGeo.setIndex(underIdx);
  const underNonIdx = underGeo.toNonIndexed();
  underGeo.dispose();
  underNonIdx.computeVertexNormals();
  parts.push(underNonIdx);

  // 3. Hanging underside rock stalactites for elevated sky-islands
  if (def.elevationY > 1.5) {
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + (def.centerX % 1);
      const rDist = 0.45;
      const sx = cx + Math.cos(ang) * rx3 * rDist;
      const sz = cz + Math.sin(ang) * rz3 * rDist;
      const hStal = 3.2 + (i % 2) * 1.4;
      const cone = new THREE.ConeGeometry(1.6 + (i % 2) * 0.45, hStal, 5);
      cone.rotateX(Math.PI);
      cone.translate(sx, def.elevationY - cliffDepth * 0.62 - hStal * 0.4, sz);
      const coneNonIdx = cone.toNonIndexed();
      cone.dispose();
      if (coneNonIdx.getAttribute('uv')) coneNonIdx.deleteAttribute('uv');
      coneNonIdx.computeVertexNormals();
      const count = coneNonIdx.getAttribute('position').count;
      const cols = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) {
        cols[k * 3] = cUnder.r * 0.85;
        cols[k * 3 + 1] = cUnder.g * 0.85;
        cols[k * 3 + 2] = cUnder.b * 0.85;
      }
      coneNonIdx.setAttribute('color', new THREE.BufferAttribute(cols, 3));
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
  const topY = def.elevationY - 0.18;
  const botX = topX + Math.cos(ang) * 1.75;
  const botZ = topZ + Math.sin(ang) * 1.75;

  const ribbon = new THREE.PlaneGeometry(1.85, topY + 0.35, 2, 8);
  const pos = ribbon.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const t = 1 - (ly + (topY + 0.35) * 0.5) / (topY + 0.35);
    const px = topX + (botX - topX) * t + Math.sin(ang + Math.PI / 2) * lx;
    const pz = topZ + (botZ - topZ) * t - Math.cos(ang + Math.PI / 2) * lx;
    const py = topY * (1 - t);
    pos.setXYZ(i, px, py, pz);
  }
  ribbon.computeVertexNormals();
  return ribbon;
}

export function buildIslandRiversGeometry(def: IslandDef): THREE.BufferGeometry | null {
  if (!def.rivers || def.rivers.length === 0) return null;
  const parts: THREE.BufferGeometry[] = [];
  for (const r of def.rivers) {
    const halfW = r.width * WORLD_SCALE * 0.42;
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const subSteps = 6;
      for (let s = 0; s < subSteps; s++) {
        const t0 = s / subSteps;
        const t1 = (s + 1) / subSteps;
        const sx0 = def.centerX + a.dx + (b.dx - a.dx) * t0;
        const sy0 = def.centerY + a.dy + (b.dy - a.dy) * t0;
        const sx1 = def.centerX + a.dx + (b.dx - a.dx) * t1;
        const sy1 = def.centerY + a.dy + (b.dy - a.dy) * t1;

        const x0 = toWorldX(sx0);
        const z0 = toWorldZ(sy0);
        const x1 = toWorldX(sx1);
        const z1 = toWorldZ(sy1);
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.hypot(dx, dz) || 1;
        const nx = (-dz / len) * halfW;
        const nz = (dx / len) * halfW;

        const y0 = groundHeightAtSim(sx0, sy0) + 0.34;
        const y1 = groundHeightAtSim(sx1, sy1) + 0.34;

        const g = new THREE.BufferGeometry();
        const verts = new Float32Array([
          x0 - nx, y0, z0 - nz,
          x0 + nx, y0, z0 + nz,
          x1 - nx, y1, z1 - nz,
          x0 + nx, y0, z0 + nz,
          x1 + nx, y1, z1 + nz,
          x1 - nx, y1, z1 - nz,
        ]);
        g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        g.computeVertexNormals();
        parts.push(g);
      }
    }
  }
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
        ? 140
        : def.biome === 'crag' || def.biome === 'frost'
          ? 280
          : 620;
    for (let i = 0; i < samples; i++) {
      const ang = (i * 2.39996) % (Math.PI * 2);
      const r = Math.sqrt((i + 0.5) / samples) * 0.87;
      const wx = def.centerX + Math.cos(ang) * def.radiusX * r;
      const wy = def.centerY + Math.sin(ang) * def.radiusY * r;
      const y3 = groundHeightAtSim(wx, wy);
      // Skip underwater sunken lagoon on Mist Atoll & lava trench on Embervault
      if (def.biome === 'mist_atoll' && y3 < 0.45) continue;
      if (def.biome === 'volcanic' && y3 < def.elevationY - 0.35) continue;

      const pt: ScatterPoint = {
        islandId: id,
        x3: toWorldX(wx),
        y3,
        z3: toWorldZ(wy),
        scale: 0.72 + ((i * 13) % 7) * 0.06,
        rotY: (i * 1.73) % (Math.PI * 2),
        colorIndex: i % 5,
      };
      if (i % 6 === 0 && def.biome !== 'crag' && def.biome !== 'volcanic' && def.biome !== 'frost') wildflowers.push(pt);
      else if (i % 7 === 0 && (def.biome === 'pine' || def.biome === 'mist_atoll' || def.biome === 'ruins')) ferns.push(pt);
      else grassTufts.push(pt);
    }
  }

  return { grassTufts, wildflowers, ferns };
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
    list.push({ id: `lm_${idx++}`, islandId, kind, x, y, scale, rotY });
  };

  // Cradle
  const cr = ISLAND_DEFS.cradle;
  add('cradle', 'cliff_boulder', cr.centerX - 420, cr.centerY - 310, 1.35, 0.4);
  add('cradle', 'cliff_boulder', cr.centerX + 380, cr.centerY - 330, 1.2, 1.2);
  add('cradle', 'monolith', cr.centerX - 310, cr.centerY - 220, 1.15, 0.25);
  add('cradle', 'reed_clump', cr.centerX + cr.springOffset!.dx + 38, cr.centerY + cr.springOffset!.dy + 16, 1.0, 0.7);
  add('cradle', 'driftwood', cr.centerX + 590, cr.centerY + 190, 1.0, 2.1);

  // Timbercrown
  const tc = ISLAND_DEFS.timbercrown;
  add('timbercrown', 'cliff_boulder', tc.centerX - 340, tc.centerY - 260, 1.5, 0.8);
  add('timbercrown', 'cliff_boulder', tc.centerX + 360, tc.centerY - 220, 1.3, 1.8);
  add('timbercrown', 'monolith', tc.centerX - 60, tc.centerY - 280, 1.25, 0.5);
  add('timbercrown', 'reed_clump', tc.centerX + tc.springOffset!.dx - 32, tc.centerY + tc.springOffset!.dy + 20, 1.0, 1.4);

  // Sun-Terrace
  const st = ISLAND_DEFS.sunterrace;
  add('sunterrace', 'ruin_cairn', st.centerX - 180, st.centerY - 120, 1.2, 0.3);
  add('sunterrace', 'ruin_cairn', st.centerX + 210, st.centerY + 95, 1.05, 1.4);
  add('sunterrace', 'cliff_boulder', st.centerX + 490, st.centerY - 290, 1.3, 0.9);
  add('sunterrace', 'reed_clump', st.centerX + st.springOffset!.dx + 36, st.centerY + st.springOffset!.dy - 12, 1.0, 2.2);

  // Copper-Crag
  const cc = ISLAND_DEFS.coppercrag;
  add('coppercrag', 'cliff_boulder', cc.centerX - 390, cc.centerY - 160, 1.65, 1.1);
  add('coppercrag', 'cliff_boulder', cc.centerX + 340, cc.centerY - 210, 1.5, 2.4);
  add('coppercrag', 'monolith', cc.centerX - 240, cc.centerY + 210, 1.35, 0.15);

  // Mist Atoll
  const ma = ISLAND_DEFS.mistatoll;
  add('mistatoll', 'driftwood', ma.centerX - 320, ma.centerY + 210, 1.1, 0.8);
  add('mistatoll', 'reed_clump', ma.centerX - 95, ma.centerY + 115, 1.15, 0.3);
  add('mistatoll', 'reed_clump', ma.centerX + 185, ma.centerY - 60, 1.05, 1.7);
  add('mistatoll', 'cliff_boulder', ma.centerX + 420, ma.centerY + 120, 1.4, 2.0);

  // Starbloom Ruins (Exploration Island)
  const sb = ISLAND_DEFS.starbloom;
  add('starbloom', 'ruin_cairn', sb.centerX - 240, sb.centerY - 170, 1.3, 0.4);
  add('starbloom', 'ruin_cairn', sb.centerX + 240, sb.centerY + 180, 1.2, 1.7);
  add('starbloom', 'crystal_spire', sb.centerX + 310, sb.centerY - 220, 1.25, 0.8);
  add('starbloom', 'reed_clump', sb.centerX + sb.springOffset!.dx + 32, sb.centerY + sb.springOffset!.dy + 16, 1.05, 1.1);

  // Ashen Bastion (Battle Island)
  const ev = ISLAND_DEFS.embervault;
  add('embervault', 'cliff_boulder', ev.centerX - 370, ev.centerY - 180, 1.7, 0.6);
  add('embervault', 'cliff_boulder', ev.centerX + 360, ev.centerY + 190, 1.6, 2.2);
  add('embervault', 'monolith', ev.centerX - 250, ev.centerY + 240, 1.4, 1.0);

  // Frostpeak Glacier (Alpine Island)
  const fp = ISLAND_DEFS.frostpeak;
  add('frostpeak', 'crystal_spire', fp.centerX - 210, fp.centerY - 190, 1.4, 0.5);
  add('frostpeak', 'cliff_boulder', fp.centerX + 310, fp.centerY + 120, 1.55, 1.5);
  add('frostpeak', 'monolith', fp.centerX - 330, fp.centerY + 180, 1.2, 0.9);

  // Floating Sky-Sea Rock Islets scattered between all 8 islands
  const seaIslets: [number, number, number][] = [
    [1400, 2900, 1.15],
    [2200, 1980, 1.0],
    [3640, 2320, 1.2],
    [5180, 2060, 1.08],
    [3250, 1180, 1.25],
    [5150, 1120, 1.18],
    [2120, 3680, 1.25],
    [5560, 3440, 1.05],
    [1020, 960, 1.22],
    [6820, 1860, 1.12],
  ];
  seaIslets.forEach(([sx, sy, sc], i) => {
    add('sea', 'sky_islet', sx, sy, sc, (i * 1.1) % (Math.PI * 2));
  });

  return list;
}
