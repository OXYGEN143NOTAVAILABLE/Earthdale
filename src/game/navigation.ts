import { ISLAND_DEFS, ISLAND_ORDER, getIslandAtPoint, islandCoastWobble } from './catalog';
import { BUILDING_BLUEPRINTS } from './techAndCultures';
import type {
  EntityStuckState,
  IslandDef,
  IslandId,
  SkyBridgeEntity,
  SkyCablewayEntity,
  WorldLandmark,
  WorldState,
} from './types';

export type TerrainKind = 'land' | 'shallow_water' | 'deep_water' | 'bridge';

export const NAV_CELL_SIZE = 24;

export interface IslandNavGrid {
  islandId: IslandId;
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  cellSize: number;
  terrain: TerrainKind[];
  blocked: Uint8Array;
  signature: string;
}

export interface PathPlanResult {
  reachable: boolean;
  waypoints: { x: number; y: number }[];
  adjustedGoalX: number;
  adjustedGoalY: number;
  reason: string | null;
}

export interface SteerResult {
  x: number;
  y: number;
  islandId: IslandId;
  facing: 1 | -1;
  hitEdge: boolean;
  hitWaterEdge: boolean;
  terrainKind: TerrainKind;
  wasStuckReset: boolean;
  navBlockedReason: string | null;
}

const worldGridCache = new WeakMap<WorldState, Map<IslandId, IslandNavGrid>>();

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function islandNormalizedDistNav(def: IslandDef, wx: number, wy: number): number {
  const dx = (wx - def.centerX) / Math.max(20, def.radiusX);
  const dy = (wy - def.centerY) / Math.max(20, def.radiusY);
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(def, ang);
  return Math.hypot(dx, dy) / Math.max(0.4, wobble);
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

function segmentProjT(px: number, py: number, ax: number, ay: number, bx: number, by: number): { dist: number; t: number; len: number } {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-4) return { dist: Math.hypot(px - ax, py - ay), t: 0, len: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
  return {
    dist: Math.hypot(px - (ax + t * vx), py - (ay + t * vy)),
    t,
    len: Math.sqrt(len2),
  };
}

export function isOnBuiltBridgeNav(world: Pick<WorldState, 'bridges'>, x: number, y: number): SkyBridgeEntity | null {
  for (const br of world.bridges) {
    if (!br.built) continue;
    if (distToSegment(x, y, br.x1, br.y1, br.x2, br.y2) <= 28) return br;
  }
  return null;
}

export function findBridgeStepNav(world: Pick<WorldState, 'bridges'>, from: IslandId, to: IslandId): SkyBridgeEntity | null {
  if (from === to) return null;
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

export function findCablewayStepNav(world: Pick<WorldState, 'cableways'>, from: IslandId, to: IslandId): SkyCablewayEntity | null {
  return (
    world.cableways.find(
      (cb) =>
        cb.built &&
        ((cb.fromIsland === from && cb.toIsland === to) || (cb.fromIsland === to && cb.toIsland === from)),
    ) ?? null
  );
}

/**
 * Pure analytic river depth + natural shallow gravel ford lookup.
 * Shallow river edges and stone fords are wadeable (`shallow_water`), while deep central channels are `deep_water`.
 */
function sampleRiverTerrain(def: IslandDef, wx: number, wy: number): TerrainKind | null {
  if (!def.rivers || def.rivers.length === 0) return null;
  let maxDepth = 0;
  let atShallowFord = false;

  for (const r of def.rivers) {
    const halfW = r.width * 0.55;
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const { dist, t, len } = segmentProjT(
        wx,
        wy,
        def.centerX + a.dx,
        def.centerY + a.dy,
        def.centerX + b.dx,
        def.centerY + b.dy,
      );
      if (dist < halfW * 1.45) {
        const carve = (1 - smoothstep(halfW * 0.35, halfW * 1.45, dist)) * 0.68;
        if (carve > maxDepth) {
          maxDepth = carve;
          // Natural stone gravel fords across rivers ensure every island sector remains reachable on foot
          const nearFord =
            (len > 150 && (Math.abs(t - 0.32) < 0.11 || Math.abs(t - 0.72) < 0.11)) ||
            (len <= 150 && Math.abs(t - 0.5) < 0.18);
          atShallowFord = nearFord;
        }
      }
    }
  }

  if (maxDepth <= 0.18) return null;
  if (def.biome === 'terrace' && maxDepth >= 0.54 && !atShallowFord) {
    return 'deep_water';
  }
  return 'shallow_water';
}

/**
 * Pure terrain classifier at any simulation coordinate `(wx, wy)`.
 * Accounts for built sky-bridges, island plateau/cliff rims, springs, rivers, Mist Atoll lagoon, and Embervault trench.
 */
export function classifyMainWorldTerrain(
  world: Pick<WorldState, 'bridges'>,
  wx: number,
  wy: number,
): TerrainKind {
  if (isOnBuiltBridgeNav(world, wx, wy)) return 'bridge';

  const def = getIslandAtPoint(wx, wy, 10);
  if (!def) return 'deep_water';

  const nd = islandNormalizedDistNav(def, wx, wy);
  if (nd >= 0.94) return 'deep_water';

  if (def.hasSpring && def.springOffset) {
    const sx = def.centerX + def.springOffset.dx;
    const sy = def.centerY + def.springOffset.dy;
    const sd = Math.hypot(wx - sx, wy - sy);
    if (sd < 18) return 'deep_water';
    if (sd < 34) return 'shallow_water';
  }

  const riverKind = sampleRiverTerrain(def, wx, wy);
  if (riverKind) return riverKind;

  if (def.biome === 'mist_atoll') {
    const lx = (wx - def.centerX) / def.radiusX;
    const ly = (wy - def.centerY) / def.radiusY;
    const lagoonDip = smoothstep(0.44, 0.14, Math.hypot(lx + 0.14, ly)) * 0.62;
    const gentle = Math.sin(wx * 0.014 + wy * 0.011) * 0.28 + Math.cos(wx * 0.009 - wy * 0.015) * 0.22;
    const approxH = def.elevationY + gentle * (1 - nd * 0.52) - lagoonDip;
    if (approxH < 0.34) return 'deep_water';
    if (approxH < 0.54) return 'shallow_water';
  }

  if (def.biome === 'volcanic') {
    const lx = (wx - def.centerX) / def.radiusX;
    const ly = (wy - def.centerY) / def.radiusY;
    const trench = smoothstep(0.24, 0.06, Math.hypot(lx + 0.34, ly - 0.22)) * 1.55;
    if (trench > 0.72) return 'deep_water';
  }

  return 'land';
}

export function getTerrainSpeedMultiplier(kind: TerrainKind): number {
  if (kind === 'shallow_water') return 0.55;
  if (kind === 'deep_water') return 0;
  return 1.0;
}

function computeIslandObstacleSignature(
  world: WorldState,
  islandId: IslandId,
  landmarks: readonly WorldLandmark[],
): string {
  let bCount = 0;
  let bHash = 0;
  for (const b of world.buildings) {
    if (b.islandId !== islandId) continue;
    if (!b.unlocked && world.activeConstruction?.buildingId !== b.id) continue;
    bCount++;
    bHash = (bHash + Math.round(b.x) * 3 + Math.round(b.y) * 7) | 0;
  }
  let nCount = 0;
  for (const n of world.wildNodes) {
    if (n.islandId === islandId && n.amount > 0.1) nCount++;
  }
  let mCount = 0;
  for (const m of world.memorials) {
    if (m.islandId === islandId) mCount++;
  }
  return `${bCount}:${bHash}:${nCount}:${mCount}:${landmarks.length}`;
}

function markCircleBlocked(
  grid: IslandNavGrid,
  cx: number,
  cy: number,
  radius: number,
) {
  const minC = Math.max(0, Math.floor((cx - radius - grid.minX) / grid.cellSize));
  const maxC = Math.min(grid.cols - 1, Math.floor((cx + radius - grid.minX) / grid.cellSize));
  const minR = Math.max(0, Math.floor((cy - radius - grid.minY) / grid.cellSize));
  const maxR = Math.min(grid.rows - 1, Math.floor((cy + radius - grid.minY) / grid.cellSize));
  const r2 = radius * radius;
  for (let row = minR; row <= maxR; row++) {
    const py = grid.minY + (row + 0.5) * grid.cellSize;
    const dy = py - cy;
    for (let col = minC; col <= maxC; col++) {
      const px = grid.minX + (col + 0.5) * grid.cellSize;
      const dx = px - cx;
      if (dx * dx + dy * dy <= r2) {
        grid.blocked[row * grid.cols + col] = 1;
      }
    }
  }
}

function markEllipseBlocked(
  grid: IslandNavGrid,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) {
  const minC = Math.max(0, Math.floor((cx - rx - grid.minX) / grid.cellSize));
  const maxC = Math.min(grid.cols - 1, Math.floor((cx + rx - grid.minX) / grid.cellSize));
  const minR = Math.max(0, Math.floor((cy - ry - grid.minY) / grid.cellSize));
  const maxR = Math.min(grid.rows - 1, Math.floor((cy + ry - grid.minY) / grid.cellSize));
  for (let row = minR; row <= maxR; row++) {
    const py = grid.minY + (row + 0.5) * grid.cellSize;
    const ey = (py - cy) / rxOrOne(ry);
    for (let col = minC; col <= maxC; col++) {
      const px = grid.minX + (col + 0.5) * grid.cellSize;
      const ex = (px - cx) / rxOrOne(rx);
      if (ex * ex + ey * ey <= 1) {
        grid.blocked[row * grid.cols + col] = 1;
      }
    }
  }
}

function rxOrOne(v: number): number {
  return v > 1 ? v : 1;
}

export function getOrBuildIslandNavGrid(
  world: WorldState,
  islandId: IslandId,
  landmarks: readonly WorldLandmark[],
): IslandNavGrid {
  let cache = worldGridCache.get(world);
  if (!cache) {
    cache = new Map();
    worldGridCache.set(world, cache);
  }

  const sig = computeIslandObstacleSignature(world, islandId, landmarks);
  const existing = cache.get(islandId);
  if (existing && existing.signature === sig) {
    return existing;
  }

  const def = ISLAND_DEFS[islandId];
  const pad = 48;
  const minX = Math.floor(def.centerX - def.radiusX * 1.12 - pad);
  const minY = Math.floor(def.centerY - def.radiusY * 1.12 - pad);
  const width = Math.ceil((def.radiusX * 1.12 + pad) * 2);
  const height = Math.ceil((def.radiusY * 1.12 + pad) * 2);
  const cellSize = NAV_CELL_SIZE;
  const cols = Math.max(8, Math.ceil(width / cellSize));
  const rows = Math.max(8, Math.ceil(height / cellSize));
  const terrain = new Array<TerrainKind>(cols * rows);
  const blocked = new Uint8Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    const py = minY + (row + 0.5) * cellSize;
    for (let col = 0; col < cols; col++) {
      const px = minX + (col + 0.5) * cellSize;
      // Preserve base terrain grid without bridges so cross-island bridge approaches snap cleanly to shoreline
      const t = classifyIslandOnlyTerrain(def, px, py);
      terrain[row * cols + col] = t;
    }
  }

  const grid: IslandNavGrid = {
    islandId,
    minX,
    minY,
    cols,
    rows,
    cellSize,
    terrain,
    blocked,
    signature: sig,
  };

  for (const b of world.buildings) {
    if (b.islandId !== islandId) continue;
    if (!b.unlocked && world.activeConstruction?.buildingId !== b.id) continue;
    if (b.type === 'farm_plot' || b.type === 'pasture' || b.type === 'dock') continue;
    const fp = BUILDING_BLUEPRINTS[b.type]?.footprint ?? { rx: 16, ry: 14 };
    markEllipseBlocked(grid, b.x, b.y, fp.rx + 2, fp.ry + 2);
  }

  for (const n of world.wildNodes) {
    if (n.islandId !== islandId || n.amount <= 0.1) continue;
    const rad =
      n.kind === 'tree'
        ? (n.scale ?? 1) * 11
        : n.kind === 'copper_vein' || n.kind === 'iron_vein'
          ? 14
          : 8;
    markCircleBlocked(grid, n.x, n.y, rad);
  }

  for (const lm of landmarks) {
    if (lm.islandId !== islandId) continue;
    if (lm.kind === 'reed_clump' || lm.kind === 'sky_islet') continue;
    markCircleBlocked(grid, lm.x, lm.y, lm.scale * 14);
  }

  for (const ruin of world.exploreRuins) {
    if (ruin.islandId !== islandId) continue;
    markCircleBlocked(grid, ruin.x, ruin.y, 20);
  }

  for (const mem of world.memorials) {
    if (mem.islandId !== islandId) continue;
    markCircleBlocked(grid, mem.x, mem.y, 9);
  }

  cache.set(islandId, grid);
  return grid;
}

function classifyIslandOnlyTerrain(def: IslandDef, wx: number, wy: number): TerrainKind {
  const nd = islandNormalizedDistNav(def, wx, wy);
  if (nd >= 0.94) return 'deep_water';

  if (def.hasSpring && def.springOffset) {
    const sx = def.centerX + def.springOffset.dx;
    const sy = def.centerY + def.springOffset.dy;
    const sd = Math.hypot(wx - sx, wy - sy);
    if (sd < 18) return 'deep_water';
    if (sd < 34) return 'shallow_water';
  }

  const riverKind = sampleRiverTerrain(def, wx, wy);
  if (riverKind) return riverKind;

  if (def.biome === 'mist_atoll') {
    const lx = (wx - def.centerX) / def.radiusX;
    const ly = (wy - def.centerY) / def.radiusY;
    const lagoonDip = smoothstep(0.44, 0.14, Math.hypot(lx + 0.14, ly)) * 0.62;
    const gentle = Math.sin(wx * 0.014 + wy * 0.011) * 0.28 + Math.cos(wx * 0.009 - wy * 0.015) * 0.22;
    const approxH = def.elevationY + gentle * (1 - nd * 0.52) - lagoonDip;
    if (approxH < 0.34) return 'deep_water';
    if (approxH < 0.54) return 'shallow_water';
  }

  if (def.biome === 'volcanic') {
    const lx = (wx - def.centerX) / def.radiusX;
    const ly = (wy - def.centerY) / def.radiusY;
    const trench = smoothstep(0.24, 0.06, Math.hypot(lx + 0.34, ly - 0.22)) * 1.55;
    if (trench > 0.72) return 'deep_water';
  }

  return 'land';
}

function cellCenter(grid: IslandNavGrid, col: number, row: number): { x: number; y: number } {
  return {
    x: grid.minX + (col + 0.5) * grid.cellSize,
    y: grid.minY + (row + 0.5) * grid.cellSize,
  };
}

function isCellWalkable(grid: IslandNavGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  const idx = row * grid.cols + col;
  return grid.terrain[idx] !== 'deep_water' && grid.blocked[idx] === 0;
}

function findNearestWalkableCell(
  grid: IslandNavGrid,
  startCol: number,
  startRow: number,
  maxRadius: number,
  preferLand = false,
): { col: number; row: number } | null {
  const sc = Math.max(0, Math.min(grid.cols - 1, startCol));
  const sr = Math.max(0, Math.min(grid.rows - 1, startRow));
  if (isCellWalkable(grid, sc, sr)) {
    return { col: sc, row: sr };
  }

  type CellHit = { col: number; row: number; d2: number };
  let bestShallow: CellHit | undefined;
  let bestLand: CellHit | undefined;

  for (let rad = 1; rad <= maxRadius; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
        const c = sc + dc;
        const r = sr + dr;
        if (!isCellWalkable(grid, c, r)) continue;
        const d2 = dc * dc + dr * dr;
        const t = grid.terrain[r * grid.cols + c];
        if (t === 'land') {
          if (!bestLand || d2 < bestLand.d2) bestLand = { col: c, row: r, d2 };
        } else if (!bestShallow || d2 < bestShallow.d2) {
          bestShallow = { col: c, row: r, d2 };
        }
      }
    }
    if (bestLand !== undefined) return { col: bestLand.col, row: bestLand.row };
    if (!preferLand && bestShallow !== undefined) return { col: bestShallow.col, row: bestShallow.row };
  }

  return bestShallow !== undefined ? { col: bestShallow.col, row: bestShallow.row } : null;
}

function hasGridLineOfSight(
  grid: IslandNavGrid,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(dist / (grid.cellSize * 0.45)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = ax + (bx - ax) * t;
    const py = ay + (by - ay) * t;
    const col = Math.floor((px - grid.minX) / grid.cellSize);
    const row = Math.floor((py - grid.minY) / grid.cellSize);
    if (!isCellWalkable(grid, col, row)) return false;
  }
  return true;
}

function simplifyPath(
  grid: IslandNavGrid,
  startX: number,
  startY: number,
  rawPoints: { x: number; y: number }[],
): { x: number; y: number }[] {
  if (rawPoints.length <= 1) return rawPoints;
  const out: { x: number; y: number }[] = [];
  let anchorX = startX;
  let anchorY = startY;
  let idx = 0;

  while (idx < rawPoints.length) {
    let furthest = idx;
    for (let probe = rawPoints.length - 1; probe > idx; probe--) {
      if (hasGridLineOfSight(grid, anchorX, anchorY, rawPoints[probe].x, rawPoints[probe].y)) {
        furthest = probe;
        break;
      }
    }
    const chosen = rawPoints[furthest];
    out.push(chosen);
    anchorX = chosen.x;
    anchorY = chosen.y;
    idx = furthest + 1;
  }
  return out;
}

/**
 * Deterministic 8-directional A* across an island grid with diagonal corner-cutting protection,
 * terrain speed weighting, and obstacle-snapped goal selection.
 */
export function findIslandPath(
  world: WorldState,
  islandId: IslandId,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  landmarks: readonly WorldLandmark[] = [],
): PathPlanResult {
  const grid = getOrBuildIslandNavGrid(world, islandId, landmarks);
  const rawSc = Math.floor((startX - grid.minX) / grid.cellSize);
  const rawSr = Math.floor((startY - grid.minY) / grid.cellSize);
  const rawGc = Math.floor((goalX - grid.minX) / grid.cellSize);
  const rawGr = Math.floor((goalY - grid.minY) / grid.cellSize);

  const startCell = findNearestWalkableCell(grid, rawSc, rawSr, 6, false);
  if (!startCell) {
    return {
      reachable: false,
      waypoints: [],
      adjustedGoalX: startX,
      adjustedGoalY: startY,
      reason: 'Start position surrounded by impassable obstacles.',
    };
  }

  // Reject targets far out in deep sea off the island
  if (rawGc < -2 || rawGr < -2 || rawGc >= grid.cols + 2 || rawGr >= grid.rows + 2) {
    return {
      reachable: false,
      waypoints: [],
      adjustedGoalX: startX,
      adjustedGoalY: startY,
      reason: 'Destination lies beyond island shoreline.',
    };
  }

  const goalCell = findNearestWalkableCell(grid, rawGc, rawGr, 5, true);
  if (!goalCell) {
    return {
      reachable: false,
      waypoints: [],
      adjustedGoalX: startX,
      adjustedGoalY: startY,
      reason: 'Target lies inside deep water or enclosed cliff.',
    };
  }

  const goalPos =
    isCellWalkable(grid, rawGc, rawGr)
      ? { x: goalX, y: goalY }
      : cellCenter(grid, goalCell.col, goalCell.row);

  if (startCell.col === goalCell.col && startCell.row === goalCell.row) {
    return {
      reachable: true,
      waypoints: [goalPos],
      adjustedGoalX: goalPos.x,
      adjustedGoalY: goalPos.y,
      reason: null,
    };
  }

  const total = grid.cols * grid.rows;
  const startIdx = startCell.row * grid.cols + startCell.col;
  const goalIdx = goalCell.row * grid.cols + goalCell.col;

  const gScore = new Float32Array(total);
  gScore.fill(Infinity);
  gScore[startIdx] = 0;

  const cameFrom = new Int32Array(total);
  cameFrom.fill(-1);
  const closed = new Uint8Array(total);
  const inOpen = new Uint8Array(total);

  // Compact binary min-heap for deterministic fast A*
  const heapIdx: number[] = [startIdx];
  const heapF: number[] = [Math.hypot(goalCell.col - startCell.col, goalCell.row - startCell.row)];
  inOpen[startIdx] = 1;

  const pushHeap = (idx: number, f: number) => {
    heapIdx.push(idx);
    heapF.push(f);
    let pos = heapIdx.length - 1;
    while (pos > 0) {
      const parent = (pos - 1) >> 1;
      if (heapF[pos] < heapF[parent]) {
        const ti = heapIdx[parent];
        const tf = heapF[parent];
        heapIdx[parent] = heapIdx[pos];
        heapF[parent] = heapF[pos];
        heapIdx[pos] = ti;
        heapF[pos] = tf;
        pos = parent;
      } else break;
    }
  };

  const popHeap = (): number => {
    const top = heapIdx[0];
    const lastI = heapIdx.pop()!;
    const lastF = heapF.pop()!;
    if (heapIdx.length > 0) {
      heapIdx[0] = lastI;
      heapF[0] = lastF;
      let pos = 0;
      const n = heapIdx.length;
      while (true) {
        const left = pos * 2 + 1;
        const right = left + 1;
        let smallest = pos;
        if (left < n && heapF[left] < heapF[smallest]) smallest = left;
        if (right < n && heapF[right] < heapF[smallest]) smallest = right;
        if (smallest === pos) break;
        const ti = heapIdx[pos];
        const tf = heapF[pos];
        heapIdx[pos] = heapIdx[smallest];
        heapF[pos] = heapF[smallest];
        heapIdx[smallest] = ti;
        heapF[smallest] = tf;
        pos = smallest;
      }
    }
    return top;
  };

  const DIRS: [number, number, number][] = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.4142],
    [1, -1, 1.4142],
    [-1, 1, 1.4142],
    [-1, -1, 1.4142],
  ];

  let found = false;
  let iterations = 0;
  const maxIterations = total * 2;

  while (heapIdx.length > 0 && iterations++ < maxIterations) {
    const curr = popHeap();
    if (curr === goalIdx) {
      found = true;
      break;
    }
    if (closed[curr]) continue;
    closed[curr] = 1;

    const cc = curr % grid.cols;
    const cr = Math.floor(curr / grid.cols);

    for (const [dc, dr, stepCost] of DIRS) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (!isCellWalkable(grid, nc, nr)) continue;

      // Prevent diagonal corner cutting through blocked/deep-water cells
      if (dc !== 0 && dr !== 0) {
        if (!isCellWalkable(grid, cc + dc, cr) || !isCellWalkable(grid, cc, cr + dr)) continue;
      }

      const nIdx = nr * grid.cols + nc;
      if (closed[nIdx]) continue;

      const terrainPenalty = grid.terrain[nIdx] === 'shallow_water' ? 1.85 : 1.0;
      const tentativeG = gScore[curr] + stepCost * terrainPenalty;
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = curr;
        gScore[nIdx] = tentativeG;
        const h = Math.hypot(goalCell.col - nc, goalCell.row - nr);
        pushHeap(nIdx, tentativeG + h);
        inOpen[nIdx] = 1;
      }
    }
  }

  if (!found) {
    return {
      reachable: false,
      waypoints: [],
      adjustedGoalX: startX,
      adjustedGoalY: startY,
      reason: 'No walkable path around water or cliff barriers.',
    };
  }

  const rawPoints: { x: number; y: number }[] = [];
  let trace = goalIdx;
  while (trace !== -1 && trace !== startIdx) {
    const c = trace % grid.cols;
    const r = Math.floor(trace / grid.cols);
    rawPoints.push(trace === goalIdx ? goalPos : cellCenter(grid, c, r));
    trace = cameFrom[trace];
  }
  rawPoints.reverse();

  const simplified = simplifyPath(grid, startX, startY, rawPoints);
  return {
    reachable: true,
    waypoints: simplified.length > 0 ? simplified : [goalPos],
    adjustedGoalX: goalPos.x,
    adjustedGoalY: goalPos.y,
    reason: null,
  };
}

/**
 * Checks whether an entity on `fromIsland` can reach `targetX, targetY` either on the same island
 * (via A*) or across islands (via built Sky-Bridge, Sky-Cableway, Glider Pad, or Dock).
 */
export function checkTargetReachability(
  world: WorldState,
  fromIsland: IslandId,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  landmarks: readonly WorldLandmark[] = [],
): { reachable: boolean; reason: string | null } {
  const destDef = getIslandAtPoint(targetX, targetY, 6);
  const destIsland = destDef?.id ?? null;

  if (!destIsland) {
    if (isOnBuiltBridgeNav(world, targetX, targetY)) {
      return { reachable: true, reason: null };
    }
    return { reachable: false, reason: 'Target lies in deep sky-sea water.' };
  }

  if (destIsland !== fromIsland) {
    const br = findBridgeStepNav(world, fromIsland, destIsland);
    if (br) return { reachable: true, reason: null };
    const cb = findCablewayStepNav(world, fromIsland, destIsland);
    if (cb) return { reachable: true, reason: null };
    const hasGlider = world.buildings.some((b) => b.islandId === fromIsland && b.type === 'glider_pad' && b.unlocked);
    if (hasGlider) return { reachable: true, reason: null };
    const hasDock = world.buildings.some((b) => b.islandId === fromIsland && b.type === 'dock' && b.unlocked);
    if (hasDock) return { reachable: true, reason: null };
    return {
      reachable: false,
      reason: `No bridge, cableway, glider, or dock links ${ISLAND_DEFS[fromIsland].name} to ${ISLAND_DEFS[destIsland].name}.`,
    };
  }

  const plan = findIslandPath(world, fromIsland, fromX, fromY, targetX, targetY, landmarks);
  return { reachable: plan.reachable, reason: plan.reason };
}

function resolveRadialObstacle(
  nx: number,
  ny: number,
  ox: number,
  oy: number,
  minRadius: number,
  dirX: number,
  dirY: number,
  slideFactor = 0.25,
): { x: number; y: number } {
  const rdx = nx - ox;
  const rdy = ny - oy;
  const dist = Math.hypot(rdx, rdy);
  if (dist >= minRadius) return { x: nx, y: ny };
  if (dist < 0.01) {
    return { x: ox + minRadius, y: oy };
  }
  const ux = rdx / dist;
  const uy = rdy / dist;
  const push = minRadius - dist;
  const tx = -uy;
  const ty = ux;
  const sign = dirX * tx + dirY * ty >= 0 ? 1 : -1;
  return {
    x: nx + ux * push + tx * sign * push * slideFactor,
    y: ny + uy * push + ty * sign * push * slideFactor,
  };
}

export function clampMainWorldWalkable(
  world: WorldState,
  currentIslandId: IslandId,
  nx: number,
  ny: number,
): { x: number; y: number; islandId: IslandId; hitEdge: boolean } {
  const onBridge = isOnBuiltBridgeNav(world, nx, ny);
  if (onBridge) {
    const insideBridgeEnd = getIslandAtPoint(nx, ny, 0);
    return {
      x: nx,
      y: ny,
      islandId: insideBridgeEnd ? insideBridgeEnd.id : currentIslandId,
      hitEdge: false,
    };
  }

  const insideAny = getIslandAtPoint(nx, ny, 24);
  if (insideAny) {
    return { x: nx, y: ny, islandId: insideAny.id, hitEdge: false };
  }

  const isl = ISLAND_DEFS[currentIslandId];
  const rx = Math.max(30, isl.radiusX - 28);
  const ry = Math.max(30, isl.radiusY - 28);
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

/**
 * Full grid-A* + local collision separation + deep-water guard + stuck recovery for all walkers.
 */
export function steerMainWorldEntity(
  world: WorldState,
  islandId: IslandId,
  x: number,
  y: number,
  tx: number,
  ty: number,
  baseStepDist: number,
  ignoreSpring = false,
  stuckState?: EntityStuckState,
  dt = 0.05,
  landmarks: readonly WorldLandmark[] = [],
  selfId?: string,
): SteerResult {
  const currentTerrain = classifyMainWorldTerrain(world, x, y);
  const destDef = getIslandAtPoint(tx, ty, 6);
  const destIsland = destDef?.id ?? islandId;

  let navX = tx;
  let navY = ty;
  let crossingBridge = false;
  let navBlockedReason: string | null = null;

  if (destIsland !== islandId) {
    const br = findBridgeStepNav(world, islandId, destIsland);
    if (br) {
      crossingBridge = true;
      const fromIs1 = br.fromIsland === islandId;
      const enterX = fromIs1 ? br.x1 : br.x2;
      const enterY = fromIs1 ? br.y1 : br.y2;
      const exitX = fromIs1 ? br.x2 : br.x1;
      const exitY = fromIs1 ? br.y2 : br.y1;
      const onThisBridge = isOnBuiltBridgeNav(world, x, y)?.id === br.id;
      if (!onThisBridge && Math.hypot(x - enterX, y - enterY) > 28) {
        navX = enterX;
        navY = enterY;
      } else {
        navX = exitX;
        navY = exitY;
      }
    } else {
      const cb = findCablewayStepNav(world, islandId, destIsland);
      if (cb) {
        navX = cb.fromIsland === islandId ? cb.x1 : cb.x2;
        navY = cb.fromIsland === islandId ? cb.y1 : cb.y2;
      } else {
        const pad = world.buildings.find((b) => b.islandId === islandId && b.type === 'glider_pad' && b.unlocked);
        if (pad) {
          navX = pad.x;
          navY = pad.y;
        } else {
          const dock = world.buildings.find((b) => b.islandId === islandId && b.type === 'dock' && b.unlocked);
          if (dock) {
            navX = dock.x;
            navY = dock.y;
          } else {
            navBlockedReason = `Unreachable across sky-sea to ${ISLAND_DEFS[destIsland].name}.`;
            if (stuckState) stuckState.navBlockedReason = navBlockedReason;
            return {
              x,
              y,
              islandId,
              facing: tx >= x ? 1 : -1,
              hitEdge: true,
              hitWaterEdge: true,
              terrainKind: currentTerrain,
              wasStuckReset: true,
              navBlockedReason,
            };
          }
        }
      }
    }
  }

  // Consult cached/on-demand island A* when not actively walking on a bridge span
  const onBridgeAlready = Boolean(isOnBuiltBridgeNav(world, x, y));
  let activeWaypointX = navX;
  let activeWaypointY = navY;

  if (!onBridgeAlready && stuckState) {
    const goalChanged =
      stuckState.cachedGoalX === undefined ||
      stuckState.cachedGoalY === undefined ||
      stuckState.cachedIslandId !== islandId ||
      Math.hypot(navX - stuckState.cachedGoalX, navY - stuckState.cachedGoalY) > 22;

    if (goalChanged || !stuckState.waypoints || stuckState.waypoints.length === 0) {
      const plan = findIslandPath(world, islandId, x, y, navX, navY, landmarks);
      stuckState.cachedGoalX = navX;
      stuckState.cachedGoalY = navY;
      stuckState.cachedIslandId = islandId;
      if (!plan.reachable) {
        navBlockedReason = plan.reason;
        stuckState.navBlockedReason = plan.reason;
        stuckState.waypoints = undefined;
        return {
          x,
          y,
          islandId,
          facing: tx >= x ? 1 : -1,
          hitEdge: false,
          hitWaterEdge: true,
          terrainKind: currentTerrain,
          wasStuckReset: true,
          navBlockedReason: plan.reason,
        };
      }
      stuckState.waypoints = plan.waypoints;
      stuckState.navBlockedReason = null;
    }

    while (stuckState.waypoints.length > 1 && Math.hypot(stuckState.waypoints[0].x - x, stuckState.waypoints[0].y - y) < 16) {
      stuckState.waypoints.shift();
    }
    if (stuckState.waypoints.length > 0) {
      activeWaypointX = stuckState.waypoints[0].x;
      activeWaypointY = stuckState.waypoints[0].y;
    }
  }

  let dx = activeWaypointX - x;
  let dy = activeWaypointY - y;
  const d = Math.hypot(dx, dy);
  if (d < 0.01) {
    return {
      x,
      y,
      islandId,
      facing: 1,
      hitEdge: false,
      hitWaterEdge: false,
      terrainKind: currentTerrain,
      wasStuckReset: false,
      navBlockedReason: null,
    };
  }

  // Stuck detection & graceful replan (never random-teleport!)
  let wasStuckReset = false;
  if (stuckState) {
    const goalDist = Math.hypot(navX - x, navY - y);
    if (goalDist > 14) {
      stuckState.timer += dt;
      if (stuckState.timer >= 0.85) {
        const moved = Math.hypot(x - stuckState.lastX, y - stuckState.lastY);
        if (moved < 3.5) {
          stuckState.detourSign = stuckState.detourSign === 1 ? -1 : 1;
          stuckState.recoveryCount = (stuckState.recoveryCount ?? 0) + 1;
          // Force fresh A* waypoint computation
          stuckState.waypoints = undefined;
          stuckState.timer = 0;
          stuckState.lastX = x;
          stuckState.lastY = y;
          const ang = Math.atan2(dy, dx) + stuckState.detourSign * 1.15;
          dx = Math.cos(ang) * d;
          dy = Math.sin(ang) * d;
          if ((stuckState.recoveryCount ?? 0) >= 3) {
            stuckState.recoveryCount = 0;
            wasStuckReset = true;
            navBlockedReason = 'Path blocked by crowding or terrain barrier.';
            stuckState.navBlockedReason = navBlockedReason;
          }
        } else {
          stuckState.timer = 0;
          stuckState.recoveryCount = 0;
          stuckState.lastX = x;
          stuckState.lastY = y;
        }
      }
    } else {
      stuckState.timer = 0;
      stuckState.recoveryCount = 0;
      stuckState.lastX = x;
      stuckState.lastY = y;
    }
  }

  const dirX = dx / d;
  const dirY = dy / d;
  const speedMult = getTerrainSpeedMultiplier(currentTerrain) || 0.55;
  const move = Math.min(d, baseStepDist * speedMult);
  let nx = x + dirX * move;
  let ny = y + dirY * move;

  const onBridgeNow = Boolean(isOnBuiltBridgeNav(world, nx, ny));
  if (!onBridgeNow) {
    // 1. Buildings (elliptical push-out)
    for (const b of world.buildings) {
      if (b.islandId !== islandId) continue;
      if (!b.unlocked && world.activeConstruction?.buildingId !== b.id) continue;
      if (b.type === 'farm_plot' || b.type === 'pasture' || b.type === 'dock') continue;
      const fp = BUILDING_BLUEPRINTS[b.type]?.footprint ?? { rx: 16, ry: 14 };
      const padX = fp.rx + 7.5;
      const padY = fp.ry + 7.5;
      const ex = (nx - b.x) / padX;
      const ey = (ny - b.y) / padY;
      const eDist = Math.hypot(ex, ey);
      if (eDist < 1) {
        if (eDist < 0.01) {
          nx = b.x + padX;
        } else {
          const ux = ex / eDist;
          const uy = ey / eDist;
          const slideX = -uy;
          const slideY = ux;
          const sign = stuckState ? stuckState.detourSign : dirX * slideX + dirY * slideY >= 0 ? 1 : -1;
          nx = b.x + (ux + slideX * sign * 0.42) * padX;
          ny = b.y + (uy + slideY * sign * 0.42) * padY;
        }
      }
    }

    // 2. Wild trees, ores, bushes, piles
    for (const n of world.wildNodes) {
      if (n.islandId !== islandId || n.amount <= 0.1) continue;
      const rad =
        n.kind === 'tree'
          ? (n.scale ?? 1) * 16
          : n.kind === 'copper_vein' || n.kind === 'iron_vein'
            ? 22
            : 15;
      const res = resolveRadialObstacle(nx, ny, n.x, n.y, rad, dirX, dirY, 0.52);
      nx = res.x;
      ny = res.y;
    }

    // 3. Static world landmarks
    for (const lm of landmarks) {
      if (lm.islandId !== islandId) continue;
      if (lm.kind === 'reed_clump' || lm.kind === 'sky_islet') continue;
      const res = resolveRadialObstacle(nx, ny, lm.x, lm.y, lm.scale * 16, dirX, dirY, 0.48);
      nx = res.x;
      ny = res.y;
    }

    // 4. Ruins & Memorial stones
    for (const ruin of world.exploreRuins) {
      if (ruin.islandId !== islandId) continue;
      const res = resolveRadialObstacle(nx, ny, ruin.x, ruin.y, 24, dirX, dirY, 0.45);
      nx = res.x;
      ny = res.y;
    }
    for (const mem of world.memorials) {
      if (mem.islandId !== islandId) continue;
      const res = resolveRadialObstacle(nx, ny, mem.x, mem.y, 11, dirX, dirY, 0.35);
      nx = res.x;
      ny = res.y;
    }

    // 5. Deep water spring basin push-out
    const islDef = ISLAND_DEFS[islandId];
    if (!ignoreSpring && islDef.hasSpring && islDef.springOffset) {
      const sx = islDef.centerX + islDef.springOffset.dx;
      const sy = islDef.centerY + islDef.springOffset.dy;
      const res = resolveRadialObstacle(nx, ny, sx, sy, 22, dirX, dirY, 0.42);
      nx = res.x;
      ny = res.y;
    }

    // 6. Pairwise soft separation across villagers, clanVillagers, and raiders
    const peers = [...world.villagers, ...world.clanVillagers, ...world.raiders];
    for (const other of peers) {
      if (selfId && other.id === selfId) continue;
      if (other.islandId !== islandId || other.voyageBoatId || other.transitGliderId || other.transitCableId) continue;
      if (Math.abs(other.x - x) < 0.35 && Math.abs(other.y - y) < 0.35) continue;
      const od = Math.hypot(nx - other.x, ny - other.y);
      if (od > 0.2 && od < 11.5) {
        const push = (11.5 - od) * 0.45;
        nx += ((nx - other.x) / od) * push;
        ny += ((ny - other.y) / od) * push;
      }
    }
  }

  // Deep-water impassability enforcement when NOT crossing a built sky-bridge
  let hitWaterEdge = false;
  if (!crossingBridge && !isOnBuiltBridgeNav(world, nx, ny)) {
    const nextTerrain = classifyMainWorldTerrain(world, nx, ny);
    if (nextTerrain === 'deep_water') {
      hitWaterEdge = true;
      const tryX = classifyMainWorldTerrain(world, nx, y);
      const tryY = classifyMainWorldTerrain(world, x, ny);
      if (tryX !== 'deep_water') {
        ny = y;
      } else if (tryY !== 'deep_water') {
        nx = x;
      } else if (currentTerrain !== 'deep_water') {
        nx = x;
        ny = y;
      }
      if (stuckState) stuckState.waypoints = undefined;
    }
  }

  let edgeDetected = false;
  if (!crossingBridge && !isOnBuiltBridgeNav(world, nx, ny)) {
    const isl = ISLAND_DEFS[islandId];
    const nd = islandNormalizedDistNav(isl, nx, ny);
    if (nd >= 0.90) {
      edgeDetected = true;
      const toCenterX = isl.centerX - nx;
      const toCenterY = isl.centerY - ny;
      const cd = Math.hypot(toCenterX, toCenterY) || 1;
      nx = x + (toCenterX / cd) * move * 0.65;
      ny = y + (toCenterY / cd) * move * 0.65;
    }
  }

  const clamped = clampMainWorldWalkable(world, islandId, nx, ny);
  const finalTerrain = classifyMainWorldTerrain(world, clamped.x, clamped.y);
  if (stuckState) {
    stuckState.terrainKind = finalTerrain;
  }

  return {
    x: clamped.x,
    y: clamped.y,
    islandId: clamped.islandId,
    facing: dx >= 0 ? 1 : -1,
    hitEdge: edgeDetected || clamped.hitEdge,
    hitWaterEdge,
    terrainKind: finalTerrain,
    wasStuckReset,
    navBlockedReason,
  };
}
