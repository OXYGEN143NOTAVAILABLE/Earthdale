import { ISLAND_DEFS, isPointInsideIsland } from './catalog';
import { emitWorldEvent } from './eventBus';
import { buildArchipelagoLandmarks } from './lowPolyWorld';
import { classifyMainWorldTerrain, steerMainWorldEntity } from './navigation';
import type { EntityStuckState, IslandId, WildHerdEntity, WorldState } from './types';

const ARCHIPELAGO_LANDMARKS = buildArchipelagoLandmarks();

export function ensureWildAnimalState(h: WildHerdEntity): void {
  if (typeof h.hunger !== 'number') h.hunger = 76;
  if (typeof h.thirst !== 'number') h.thirst = 76;
  if (typeof h.energy !== 'number') h.energy = 86;
  if (typeof h.reproCooldown !== 'number') h.reproCooldown = 40;
  if (!h.behaviorState) h.behaviorState = 'wandering';
  if (!h.stuckState) h.stuckState = { lastX: h.x, lastY: h.y, timer: 0, detourSign: 1 };
}

/**
 * Locates a safe shallow-water or shoreline drink point on the island,
 * never returning deep water.
 */
export function findShallowWaterDrinkPoint(
  world: WorldState,
  islandId: IslandId,
  fromX: number,
  fromY: number,
): { x: number; y: number } | null {
  const isl = ISLAND_DEFS[islandId];
  const candidates: { x: number; y: number }[] = [];

  if (isl.hasSpring && isl.springOffset) {
    const sx = isl.centerX + isl.springOffset.dx;
    const sy = isl.centerY + isl.springOffset.dy;
    const ringOffsets: [number, number][] = [
      [18, 0],
      [-18, 0],
      [0, 18],
      [0, -18],
      [14, 14],
    ];
    for (const [ox, oy] of ringOffsets) {
      const px = sx + ox;
      const py = sy + oy;
      const t = classifyMainWorldTerrain(world, px, py);
      if (t !== 'deep_water') {
        candidates.push({ x: px, y: py });
      }
    }
  }

  if (isl.rivers) {
    for (const r of isl.rivers) {
      for (const wp of r.points) {
        const px = isl.centerX + wp.dx + 14;
        const py = isl.centerY + wp.dy;
        const t = classifyMainWorldTerrain(world, px, py);
        if (t !== 'deep_water' && isPointInsideIsland(isl, px, py, 24)) {
          candidates.push({ x: px, y: py });
        }
      }
    }
  }

  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestDist = Math.hypot(best.x - fromX, best.y - fromY);
  for (let i = 1; i < candidates.length; i++) {
    const d = Math.hypot(candidates[i].x - fromX, candidates[i].y - fromY);
    if (d < bestDist) {
      best = candidates[i];
      bestDist = d;
    }
  }
  return best;
}

export function stepWildAnimalBehavior(
  world: WorldState,
  h: WildHerdEntity,
  dt: number,
  steerFn: (
    w: WorldState,
    islId: IslandId,
    x: number,
    y: number,
    tx: number,
    ty: number,
    stepDist: number,
    stuck: EntityStuckState | undefined,
    dtSec: number,
    id: string,
  ) => { x: number; y: number; facing: 1 | -1; hitEdge?: boolean; hitWaterEdge?: boolean; wasStuckReset?: boolean },
): void {
  ensureWildAnimalState(h);
  const isl = ISLAND_DEFS[h.islandId];

  // 1. Drain physiological needs gently
  h.hunger = Math.max(0, (h.hunger ?? 76) - dt * 0.45);
  h.thirst = Math.max(0, (h.thirst ?? 76) - dt * 0.55);
  if (h.reproCooldown && h.reproCooldown > 0) {
    h.reproCooldown = Math.max(0, h.reproCooldown - dt);
  }
  if (h.behaviorState === 'resting') {
    h.energy = Math.min(100, (h.energy ?? 80) + dt * 5.2);
  } else {
    const drain = h.behaviorState === 'fleeing' || h.behaviorState === 'fighting' ? 1.4 : 0.42;
    h.energy = Math.max(0, (h.energy ?? 85) - dt * drain);
  }

  // 2. Species reactivity: timid deer/rabbits flee nearby hunters, raiders, or fast approaching humans
  if (h.kind !== 'boar') {
    const fleeRadius = h.kind === 'rabbit' ? 78 : 96;
    const threat =
      world.villagers.find(
        (v) =>
          v.islandId === h.islandId &&
          Math.hypot(v.x - h.x, v.y - h.y) < fleeRadius &&
          (v.activeTask === 'hunt' || v.state === 'hunting' || v.state === 'fighting' || Math.hypot(v.x - h.x, v.y - h.y) < 38),
      ) ??
      world.raiders.find((r) => r.islandId === h.islandId && Math.hypot(r.x - h.x, r.y - h.y) < fleeRadius);
    if (threat) {
      h.behaviorState = 'fleeing';
      const dx = h.x - threat.x;
      const dy = h.y - threat.y;
      const d = Math.hypot(dx, dy) || 1;
      const fx = h.x + (dx / d) * 85;
      const fy = h.y + (dy / d) * 65;
      if (classifyMainWorldTerrain(world, fx, fy) !== 'deep_water' && isPointInsideIsland(isl, fx, fy, 26)) {
        h.targetX = fx;
        h.targetY = fy;
      } else {
        h.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.45);
        h.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.45);
      }
      h.pauseTimer = 0;
    } else if (h.behaviorState === 'fleeing' && Math.hypot(h.targetX - h.x, h.targetY - h.y) < 10) {
      h.behaviorState = 'wandering';
    }
  }

  // 3. State selection when not fleeing or fighting
  if (h.behaviorState !== 'fleeing' && h.behaviorState !== 'fighting') {
    if ((h.thirst ?? 76) < 42) {
      if (h.behaviorState !== 'drinking') {
        const drinkSpot = findShallowWaterDrinkPoint(world, h.islandId, h.x, h.y);
        if (drinkSpot) {
          h.behaviorState = 'drinking';
          h.targetX = drinkSpot.x;
          h.targetY = drinkSpot.y;
          h.pauseTimer = 0;
        }
      }
    } else if ((h.energy ?? 85) < 28) {
      h.behaviorState = 'resting';
      h.pauseTimer = Math.max(h.pauseTimer, 3.5);
    } else if ((h.hunger ?? 76) < 46 && h.behaviorState !== 'drinking') {
      if (h.behaviorState !== 'grazing') {
        const bush = world.wildNodes.find(
          (n) => n.islandId === h.islandId && n.amount > 0.2 && n.kind === 'berry_bush',
        );
        h.behaviorState = 'grazing';
        if (bush) {
          h.targetX = bush.x + (Math.random() * 18 - 9);
          h.targetY = bush.y + (Math.random() * 18 - 9);
        } else {
          h.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.5);
          h.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.5);
        }
        h.pauseTimer = 0;
      }
    } else if (h.behaviorState === 'drinking' && (h.thirst ?? 0) >= 92) {
      h.behaviorState = 'wandering';
    } else if (h.behaviorState === 'grazing' && (h.hunger ?? 0) >= 88) {
      h.behaviorState = 'wandering';
    } else if (h.behaviorState === 'resting' && (h.energy ?? 0) >= 84) {
      h.behaviorState = 'wandering';
    }
  }

  // 4. Reproduction when healthy, fed, hydrated, and calm near a same-species mate
  const islandHerdCount = world.wildHerds.filter((o) => o.islandId === h.islandId && o.hp > 0).length;
  if (
    (h.reproCooldown ?? 40) <= 0 &&
    (h.hunger ?? 0) >= 64 &&
    (h.thirst ?? 0) >= 58 &&
    h.hp >= h.maxHp * 0.8 &&
    h.behaviorState !== 'fleeing' &&
    h.behaviorState !== 'fighting' &&
    islandHerdCount < 6 &&
    world.wildHerds.length < 26
  ) {
    const mate = world.wildHerds.find(
      (o) =>
        o.id !== h.id &&
        o.kind === h.kind &&
        o.islandId === h.islandId &&
        o.hp >= o.maxHp * 0.7 &&
        (o.reproCooldown ?? 40) <= 0 &&
        Math.hypot(o.x - h.x, o.y - h.y) < 75,
    );
    if (mate) {
      h.reproCooldown = 95;
      mate.reproCooldown = 95;
      h.hunger = Math.max(35, (h.hunger ?? 70) - 18);
      mate.hunger = Math.max(35, (mate.hunger ?? 70) - 18);
      const childScale = Number(Math.max(0.58, (h.scale ?? 1) * 0.72).toFixed(2));
      const childHp = Math.max(8, Math.round(h.maxHp * 0.75));
      const rawCx = Math.round(h.x + (Math.random() * 14 - 7));
      const rawCy = Math.round(h.y + (Math.random() * 14 - 7));
      const spawnSafe =
        classifyMainWorldTerrain(world, rawCx, rawCy) !== 'deep_water' &&
        isPointInsideIsland(isl, rawCx, rawCy, 22);
      const bx = spawnSafe ? rawCx : Math.round(h.x);
      const by = spawnSafe ? rawCy : Math.round(h.y);
      world.wildHerds.push({
        id: `wild_baby_${h.kind}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: h.kind,
        islandId: h.islandId,
        x: bx,
        y: by,
        targetX: bx,
        targetY: by,
        facing: h.facing,
        pauseTimer: 2.5,
        hp: childHp,
        maxHp: childHp,
        aggroTargetId: null,
        color: h.color,
        scale: childScale,
        behaviorState: 'wandering',
        hunger: 75,
        thirst: 75,
        energy: 90,
        reproCooldown: 110,
      });
      emitWorldEvent(world, {
        category: 'wildlife',
        significance: 'minor',
        summary: `A young wild ${h.kind} was born on ${isl.name}.`,
        islandId: h.islandId,
      });
    }
  }

  // 5. Execute locomotion / pause behavior
  const dist = Math.hypot(h.targetX - h.x, h.targetY - h.y);
  if (h.behaviorState === 'resting') {
    h.pauseTimer = Math.max(0, h.pauseTimer - dt);
    return;
  }

  if (dist < 8) {
    if (h.behaviorState === 'drinking') {
      h.thirst = Math.min(100, (h.thirst ?? 40) + dt * 20);
      h.energy = Math.min(100, (h.energy ?? 75) + dt * 1.5);
      h.pauseTimer = 1.2;
      return;
    }
    if (h.behaviorState === 'grazing') {
      h.hunger = Math.min(100, (h.hunger ?? 45) + dt * 16);
      h.pauseTimer = 1.2;
      return;
    }
    if (h.pauseTimer > 0) {
      h.pauseTimer -= dt;
      return;
    }
    h.pauseTimer = 1.6 + Math.random() * 3.2;
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.62);
      const ty = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.60);
      if (classifyMainWorldTerrain(world, tx, ty) !== 'deep_water' && isPointInsideIsland(isl, tx, ty, 24)) {
        h.targetX = tx;
        h.targetY = ty;
        break;
      }
    }
    return;
  }

  const baseSpd = h.kind === 'rabbit' ? 14 : h.kind === 'deer' ? 18 : 13;
  const spd = h.behaviorState === 'fleeing' ? baseSpd * 1.65 : baseSpd;
  const step = steerFn(world, h.islandId, h.x, h.y, h.targetX, h.targetY, spd * dt, h.stuckState, dt, h.id);
  // Extra strict deep-water guard for wild animals
  if (classifyMainWorldTerrain(world, step.x, step.y) !== 'deep_water') {
    h.x = step.x;
    h.y = step.y;
    h.facing = step.facing;
  }
  if (step.hitEdge || step.hitWaterEdge || step.wasStuckReset) {
    // Allow drinking beside shallow water edges without resetting drink goal prematurely
    if (h.behaviorState === 'drinking' && step.hitWaterEdge) {
      h.targetX = h.x;
      h.targetY = h.y;
      h.thirst = Math.min(100, (h.thirst ?? 40) + dt * 18);
      return;
    }
    h.pauseTimer = 0.6;
    h.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.45);
    h.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.45);
  }
}

export function stepSimpleWildSteer(
  world: WorldState,
  islandId: IslandId,
  x: number,
  y: number,
  tx: number,
  ty: number,
  stepDist: number,
  stuck: EntityStuckState | undefined,
  dt: number,
  id: string,
) {
  return steerMainWorldEntity(world, islandId, x, y, tx, ty, stepDist, false, stuck, dt, ARCHIPELAGO_LANDMARKS, id);
}
