import {
  COMFORT_LABELS,
  ISLAND_DEFS,
  ISLAND_ORDER,
  TASK_BY_ID,
} from './catalog';
import { getCarryCap, getStockpileDepositPoint } from './economy';
import { getPierApproachPoint } from './governance';
import { getKnowledgeLevel } from './knowledge';
import { buildArchipelagoLandmarks } from './lowPolyWorld';
import { checkTargetReachability } from './navigation';

const ARCHIPELAGO_LANDMARKS = buildArchipelagoLandmarks();
import { getNpcPersonality } from './personality';
import { BUILDING_BLUEPRINTS, TECH_BY_ID } from './techAndCultures';
import type {
  BuildingType,
  IslandId,
  NpcDecisionCandidate,
  NpcDecisionTrace,
  TaskType,
  VillagerActivityState,
  VillagerEntity,
  WorldState,
} from './types';

export interface ActionValidationResult {
  valid: boolean;
  label: string;
  blockedReason?: string;
  targetX?: number;
  targetY?: number;
  targetIslandId?: IslandId;
  task?: TaskType;
  focusConcept?: string;
  socialPeerId?: string;
  activityState?: VillagerActivityState;
  reason?: string;
}

export interface EvaluatedDecisionResult {
  trace: NpcDecisionTrace;
  selectedAction: string;
  activityState: VillagerActivityState;
  task: TaskType;
  targetX: number;
  targetY: number;
  autonomyReason: string;
  focusConcept?: string;
  socialPeerId?: string;
}

function getTechUnlocked(world: WorldState, techId: string): boolean {
  return world.unlockedTechIds.includes(techId);
}

function hasBuildingType(world: WorldState, type: BuildingType, islandId?: IslandId): boolean {
  return world.buildings.some(
    (b) => b.unlocked && b.type === type && (!islandId || b.islandId === islandId),
  );
}

function getBonfireOnIsland(world: WorldState, islandId: IslandId) {
  return world.buildings.find((b) => b.islandId === islandId && b.type === 'bonfire' && b.unlocked);
}

function getHomeOnIsland(world: WorldState, islandId: IslandId) {
  return world.buildings.find(
    (b) => b.unlocked && b.islandId === islandId && (b.type === 'cottage' || b.type === 'lean_to'),
  );
}

export function canVillagerWorkInBrain(world: WorldState, v: VillagerEntity): boolean {
  if (v.lifeStage === 'infant' || v.lifeStage === 'child') return false;
  if (world.gameMode === 'sovereign_sandbox' || world.gameMode === 'shared_siege') return true;
  return (
    v.cognition.awareness >= 30 &&
    v.cognition.observedConcepts.length >= 2 &&
    v.cognition.socialCount >= 1
  );
}

export function isTaskAvailableInBrain(world: WorldState, task: TaskType, islandId?: IslandId): boolean {
  const meta = TASK_BY_ID[task];
  if (!meta) return false;
  if (task === 'gather_stone' || task === 'forage' || task === 'chop') return true;
  if (meta.requiredTechId && !getTechUnlocked(world, meta.requiredTechId)) return false;
  if (task === 'farm' && !hasBuildingType(world, 'farm_plot', islandId)) return false;
  if (task === 'pasture' && !hasBuildingType(world, 'pasture', islandId)) return false;
  if (task === 'quarry' && !hasBuildingType(world, 'quarry', islandId)) return false;
  if (task === 'fish' && !hasBuildingType(world, 'dock', islandId)) return false;
  if (task === 'bake' && !hasBuildingType(world, 'bakery', islandId)) return false;
  if (task === 'study' && !hasBuildingType(world, 'library', islandId)) return false;
  if (task === 'smelt' && !hasBuildingType(world, 'smeltery', islandId)) return false;
  if (task === 'guard' && !hasBuildingType(world, 'watchtower', islandId) && !hasBuildingType(world, 'barracks', islandId)) {
    return false;
  }
  return true;
}

function isReachablePoint(world: WorldState, v: VillagerEntity, x: number, y: number, islId: IslandId): { ok: boolean; reason?: string } {
  if (islId === v.islandId) {
    const reach = checkTargetReachability(world, v.islandId, v.x, v.y, x, y, ARCHIPELAGO_LANDMARKS);
    return { ok: reach.reachable, reason: reach.reason ?? undefined };
  }
  const hasBridge = world.bridges.some(
    (b) => b.built && ((b.fromIsland === v.islandId && b.toIsland === islId) || (b.toIsland === v.islandId && b.fromIsland === islId)),
  );
  const hasCable = world.cableways.some(
    (c) => c.built && ((c.fromIsland === v.islandId && c.toIsland === islId) || (c.toIsland === v.islandId && c.fromIsland === islId)),
  );
  const hasDock = world.buildings.some((b) => b.islandId === v.islandId && b.type === 'dock' && b.unlocked);
  const hasGlider = world.buildings.some((b) => b.islandId === v.islandId && b.type === 'glider_pad' && b.unlocked);
  if (!hasBridge && !hasCable && !hasDock && !hasGlider) {
    return { ok: false, reason: `No bridge, dock, or cableway to ${ISLAND_DEFS[islId].name}` };
  }
  return { ok: true };
}

function pickExplorationSpot(world: WorldState, v: VillagerEntity): {
  concept: string;
  x: number;
  y: number;
  label: string;
} {
  const isl = ISLAND_DEFS[v.islandId];
  const observed = new Set(v.cognition.observedConcepts);
  const candidates: { concept: string; x: number; y: number; label: string }[] = [];

  for (const node of world.wildNodes) {
    if (node.islandId !== v.islandId || node.amount <= 0) continue;
    if (!observed.has(node.kind)) {
      const r = isReachablePoint(world, v, node.x, node.y, node.islandId);
      if (r.ok) {
        candidates.push({ concept: node.kind, x: node.x, y: node.y, label: node.kind.replace('_', ' ') });
      }
    }
  }
  if (isl.hasSpring && isl.springOffset && !observed.has('spring')) {
    const sx = isl.centerX + isl.springOffset.dx;
    const sy = isl.centerY + isl.springOffset.dy + 24;
    if (isReachablePoint(world, v, sx, sy, v.islandId).ok) {
      candidates.push({ concept: 'spring', x: sx, y: sy, label: 'fresh spring' });
    }
  }
  const herd = world.wildHerds.find((h) => h.islandId === v.islandId && h.hp > 0);
  if (herd && !observed.has('wildlife') && isReachablePoint(world, v, herd.x, herd.y, v.islandId).ok) {
    candidates.push({ concept: 'wildlife', x: herd.x, y: herd.y, label: `wild ${herd.kind}` });
  }
  const fire = getBonfireOnIsland(world, v.islandId);
  if (fire && !observed.has('embers')) {
    candidates.push({ concept: 'embers', x: fire.x, y: fire.y + 18, label: 'crackling embers' });
  }
  if (!observed.has('horizon')) {
    const ang = ((v.animPhase + v.x * 0.01) % (Math.PI * 2));
    candidates.push({
      concept: 'horizon',
      x: isl.centerX + Math.cos(ang) * (isl.radiusX - 62),
      y: isl.centerY + Math.sin(ang) * (isl.radiusY - 56),
      label: 'cliff edge horizon',
    });
  }

  if (candidates.length > 0) {
    return candidates[Math.floor((v.animPhase * 10 + candidates.length) % candidates.length) % candidates.length];
  }

  const anyNode = world.wildNodes.filter((n) => n.islandId === v.islandId && n.amount > 0);
  if (anyNode.length > 0) {
    const n = anyNode[Math.floor(Math.random() * anyNode.length)];
    if (isReachablePoint(world, v, n.x, n.y, n.islandId).ok) {
      return { concept: n.kind, x: n.x, y: n.y, label: n.kind.replace('_', ' ') };
    }
  }

  return {
    concept: 'horizon',
    x: isl.centerX + (Math.random() * 110 - 55),
    y: isl.centerY + (Math.random() * 80 - 40),
    label: 'meadow clearing',
  };
}

/**
 * Explicit pre-action validation gate: verifies that preconditions (stockpile, node presence,
 * reachability, life stage, and unlocked tech/structures) actually hold before execution.
 */
export function canExecuteVillagerAction(
  world: WorldState,
  v: VillagerEntity,
  action: string,
): ActionValidationResult {
  const isl = ISLAND_DEFS[v.islandId];
  const homeId = v.homeIslandId ?? v.islandId;
  const homeRes = world.villageResources?.[homeId] ?? world.resources;
  const fire = getBonfireOnIsland(world, v.islandId);
  const home = getHomeOnIsland(world, v.islandId);

  if (action === 'warm_up') {
    if (!fire && !home) {
      return {
        valid: true,
        label: 'Huddle for Warmth',
        targetX: isl.centerX,
        targetY: isl.centerY + 14,
        targetIslandId: v.islandId,
        activityState: 'resting',
        reason: 'Huddling near camp center to conserve warmth.',
      };
    }
    const tx = fire?.x ?? home?.x ?? isl.centerX;
    const ty = (fire?.y ?? home?.y ?? isl.centerY) + 16;
    const reach = isReachablePoint(world, v, tx, ty, v.islandId);
    if (!reach.ok) return { valid: false, label: 'Warm by Hearth', blockedReason: reach.reason };
    return {
      valid: true,
      label: 'Warm by Hearth',
      targetX: tx,
      targetY: ty,
      targetIslandId: v.islandId,
      activityState: 'resting',
      reason: fire ? `Warming cold hands beside ${fire.name}.` : `Sheltering inside ${home!.name}.`,
    };
  }

  if (action === 'eat_comfort') {
    if ((world.comforts?.[v.favoriteComfort] ?? 0) < 1) {
      return { valid: false, label: `Eat ${v.favoriteComfort}`, blockedReason: `No ${v.favoriteComfort} in comfort stock` };
    }
    return {
      valid: true,
      label: `Eat ${COMFORT_LABELS[v.favoriteComfort]}`,
      targetX: v.x,
      targetY: v.y,
      targetIslandId: v.islandId,
      activityState: 'eating',
      reason: `Savoring ${COMFORT_LABELS[v.favoriteComfort].toLowerCase()}.`,
    };
  }

  if (action === 'eat_stockpile') {
    if ((homeRes.food ?? 0) < 1) {
      return { valid: false, label: 'Eat from Stockpile', blockedReason: 'Village food stockpile is empty' };
    }
    return {
      valid: true,
      label: 'Eat from Stockpile',
      targetX: fire?.x ?? v.x,
      targetY: fire ? fire.y + 16 : v.y,
      targetIslandId: v.islandId,
      activityState: 'eating',
      reason: 'Eating from village food stores.',
    };
  }

  if (action === 'haul_to_stockpile') {
    if (!v.carriedResource || (v.carriedAmount ?? 0) <= 0.05) {
      return { valid: false, label: 'Haul Resources', blockedReason: 'Not carrying any harvested goods' };
    }
    const activeSite =
      world.activeConstruction &&
      world.buildings.find(
        (b) =>
          b.id === world.activeConstruction?.buildingId &&
          !b.unlocked &&
          b.islandId === v.islandId &&
          (b.requiredMaterials?.[v.carriedResource!] ?? 0) > (b.deliveredMaterials?.[v.carriedResource!] ?? 0),
      );
    const dest = activeSite
      ? { x: activeSite.x, y: activeSite.y + 18 }
      : getStockpileDepositPoint(world, homeId);
    const reach = isReachablePoint(world, v, dest.x, dest.y, homeId);
    if (!reach.ok) return { valid: false, label: 'Haul Resources', blockedReason: reach.reason };
    return {
      valid: true,
      label: activeSite ? `Deliver ${v.carriedResource} to ${activeSite.name}` : `Haul ${v.carriedResource} to Store`,
      targetX: dest.x,
      targetY: dest.y,
      targetIslandId: homeId,
      activityState: 'walking',
      reason: activeSite
        ? `Delivering ${Math.round((v.carriedAmount ?? 0) * 10) / 10} ${v.carriedResource} to ${activeSite.name}.`
        : `Hauling ${Math.round((v.carriedAmount ?? 0) * 10) / 10} ${v.carriedResource} to village stockpile.`,
    };
  }

  if (action === 'sleep') {
    const tx = home ? home.x : fire ? fire.x + 12 : isl.centerX;
    const ty = (home ? home.y : fire ? fire.y : isl.centerY) + 18;
    return {
      valid: true,
      label: home ? 'Sleep Indoors' : 'Rest by Fire',
      targetX: tx,
      targetY: ty,
      targetIslandId: v.islandId,
      activityState: 'sleeping',
      reason: home
        ? `Sleeping warmly inside ${home.name}.`
        : fire
          ? 'Dozing beside the open Bonfire.'
          : 'Resting beneath open stars.',
    };
  }

  if (action === 'bonfire_ritual') {
    if (!fire) {
      return { valid: false, label: 'Evening Hearth Circle', blockedReason: 'No Bonfire built on this island' };
    }
    const ang = ((v.animPhase * 1.7 + (v.x + v.y) * 0.01) % (Math.PI * 2));
    const rad = 46 + (v.hairStyle % 3) * 10;
    return {
      valid: true,
      label: 'Evening Hearth Circle',
      targetX: fire.x + Math.cos(ang) * rad,
      targetY: fire.y + Math.sin(ang) * rad * 0.82,
      targetIslandId: v.islandId,
      activityState: 'socializing',
      reason: `Gathering by ${fire.name} for nightly stories & cultural bonding.`,
    };
  }

  if (action === 'defend_island') {
    const raider = world.raiders.find((r) => r.islandId === v.islandId && r.hp > 0);
    if (!raider) {
      return { valid: false, label: 'Defend Village', blockedReason: 'No hostile threats on island' };
    }
    const reach = isReachablePoint(world, v, raider.x, raider.y, raider.islandId);
    if (!reach.ok) {
      return { valid: false, label: 'Defend Village', blockedReason: reach.reason };
    }
    return {
      valid: true,
      label: 'Defend Village',
      targetX: raider.x,
      targetY: raider.y,
      targetIslandId: raider.islandId,
      task: 'guard',
      activityState: 'fighting',
      reason: `Defending ${isl.name} from ${raider.name.split(' ')[0]}!`,
    };
  }

  if (action === 'socialize_learn') {
    const peer = world.villagers.find(
      (other) =>
        other.id !== v.id &&
        !other.banished &&
        other.islandId === v.islandId &&
        other.lifeStage !== 'infant',
    );
    if (!peer) {
      return { valid: false, label: 'Chat with Kin', blockedReason: 'No peers nearby on island' };
    }
    const reach = isReachablePoint(world, v, peer.x, peer.y, peer.islandId);
    if (!reach.ok) {
      return { valid: false, label: 'Chat with Kin', blockedReason: reach.reason };
    }
    return {
      valid: true,
      label: `Chat with ${peer.name.split(' ')[0]}`,
      targetX: peer.x,
      targetY: peer.y,
      targetIslandId: peer.islandId,
      socialPeerId: peer.id,
      activityState: 'socializing',
      reason:
        v.cognition.socialCount < 2
          ? `Walking over to greet & learn with ${peer.name.split(' ')[0]} (${v.cognition.socialCount}/2 chats).`
          : `Sharing discoveries & warmth with ${peer.name.split(' ')[0]}.`,
    };
  }

  if (action === 'explore_wonder') {
    const spot = pickExplorationSpot(world, v);
    const reach = isReachablePoint(world, v, spot.x, spot.y, v.islandId);
    if (!reach.ok) {
      return { valid: false, label: 'Explore Island', blockedReason: reach.reason };
    }
    return {
      valid: true,
      label: `Inspect ${spot.label}`,
      targetX: spot.x,
      targetY: spot.y,
      targetIslandId: v.islandId,
      task: 'explore',
      focusConcept: spot.concept,
      activityState: 'exploring',
      reason:
        v.cognition.stage === 'awakening'
          ? `Wandering like a child toward ${spot.label} in curiosity.`
          : `Inspecting ${spot.label} to learn how the world works.`,
    };
  }

  if (action === 'child_play') {
    if (v.lifeStage !== 'child') {
      return { valid: false, label: 'Play Outdoors', blockedReason: 'Only children play freely' };
    }
    const tx = (fire?.x ?? isl.centerX) + (Math.random() * 80 - 40);
    const ty = (fire?.y ?? isl.centerY) + (Math.random() * 64 - 32);
    return {
      valid: true,
      label: 'Play Outdoors',
      targetX: tx,
      targetY: ty,
      targetIslandId: v.islandId,
      activityState: 'playing',
      reason: 'Playing among wildflowers & skipping pebbles.',
    };
  }

  if (action.startsWith('task:')) {
    const task = action.slice(5) as TaskType;
    const meta = TASK_BY_ID[task];
    if (!meta) return { valid: false, label: action, blockedReason: 'Unknown task' };

    const isEmergencyForage = task === 'forage' && v.hunger < 26;
    if (!isEmergencyForage && !canVillagerWorkInBrain(world, v)) {
      return {
        valid: false,
        label: meta.label,
        blockedReason: 'Cognition still awakening (needs 2 wonders & 1 chat)',
      };
    }

    if (!isTaskAvailableInBrain(world, task, homeId)) {
      const reqTech = meta.requiredTechId ? TECH_BY_ID[meta.requiredTechId]?.name : undefined;
      return {
        valid: false,
        label: meta.label,
        blockedReason: reqTech ? `Requires ${reqTech} & workplace` : 'Required workplace not built',
      };
    }

    // Specific resource/target checks
    if (task === 'forage') {
      const node =
        world.wildNodes.find(
          (n) =>
            n.islandId === v.islandId &&
            n.amount > 0.05 &&
            (n.kind === 'berry_bush' || n.kind === 'flint_pile' || n.kind === 'branch_pile'),
        ) ??
        world.wildNodes.find(
          (n) => world.islands[n.islandId]?.discovered && n.amount > 0.05 && n.kind === 'berry_bush',
        );
      if (!node) {
        return { valid: false, label: meta.label, blockedReason: 'No berry bushes, flint, or branches left' };
      }
      const reach = isReachablePoint(world, v, node.x, node.y, node.islandId);
      if (!reach.ok) return { valid: false, label: meta.label, blockedReason: reach.reason };
      return {
        valid: true,
        label: meta.label,
        task,
        targetX: node.x,
        targetY: node.y,
        targetIslandId: node.islandId,
        activityState: Math.hypot(v.x - node.x, v.y - node.y) > 18 ? 'walking' : 'working',
        reason: `${meta.verb}.`,
      };
    }

    if (task === 'gather_stone') {
      const node =
        world.wildNodes.find((n) => n.islandId === v.islandId && n.amount > 0.1 && (n.kind === 'stone_boulder' || n.kind === 'flint_pile')) ??
        world.wildNodes.find((n) => world.islands[n.islandId]?.discovered && n.amount > 0.1 && (n.kind === 'stone_boulder' || n.kind === 'flint_pile'));
      if (!node) {
        return { valid: false, label: meta.label, blockedReason: 'No stone boulders or flint piles left' };
      }
      const reach = isReachablePoint(world, v, node.x, node.y, node.islandId);
      if (!reach.ok) return { valid: false, label: meta.label, blockedReason: reach.reason };
      return {
        valid: true,
        label: meta.label,
        task,
        targetX: node.x,
        targetY: node.y,
        targetIslandId: node.islandId,
        activityState: Math.hypot(v.x - node.x, v.y - node.y) > 18 ? 'walking' : 'working',
        reason: `${meta.verb}.`,
      };
    }

    if (task === 'chop') {
      const node =
        world.wildNodes.find((n) => n.islandId === v.islandId && n.amount > 0.1 && (n.kind === 'tree' || n.kind === 'branch_pile')) ??
        world.wildNodes.find((n) => world.islands[n.islandId]?.discovered && n.amount > 0.1 && n.kind === 'tree');
      if (!node) {
        return { valid: false, label: meta.label, blockedReason: 'No timber trees or branches available' };
      }
      const reach = isReachablePoint(world, v, node.x, node.y, node.islandId);
      if (!reach.ok) return { valid: false, label: meta.label, blockedReason: reach.reason };
      return {
        valid: true,
        label: meta.label,
        task,
        targetX: node.x,
        targetY: node.y,
        targetIslandId: node.islandId,
        activityState: Math.hypot(v.x - node.x, v.y - node.y) > 18 ? 'walking' : 'working',
        reason: `${meta.verb}.`,
      };
    }

    if (task === 'hunt') {
      const prey =
        world.wildHerds.find((h) => h.islandId === v.islandId && h.hp > 0) ??
        world.wildHerds.find((h) => world.islands[h.islandId]?.discovered && h.hp > 0);
      if (!prey) return { valid: false, label: meta.label, blockedReason: 'No wild game sighted' };
      const reach = isReachablePoint(world, v, prey.x, prey.y, prey.islandId);
      if (!reach.ok) return { valid: false, label: meta.label, blockedReason: reach.reason };
      return {
        valid: true,
        label: meta.label,
        task,
        targetX: prey.x,
        targetY: prey.y,
        targetIslandId: prey.islandId,
        activityState: 'hunting',
        reason: `Tracking wild ${prey.kind}.`,
      };
    }

    if (task === 'bake' && (homeRes.grain ?? 0) < 1) {
      return { valid: false, label: meta.label, blockedReason: 'Requires grain in village store' };
    }
    if (task === 'smelt' && (homeRes.copper ?? 0) < 1 && (homeRes.iron ?? 0) < 1) {
      return { valid: false, label: meta.label, blockedReason: 'Requires copper or iron ore' };
    }

    const typeMap: Partial<Record<TaskType, BuildingType>> = {
      farm: 'farm_plot',
      pasture: 'pasture',
      quarry: 'quarry',
      smelt: 'smeltery',
      bake: 'bakery',
      study: 'library',
      guard: hasBuildingType(world, 'watchtower', v.islandId) ? 'watchtower' : 'barracks',
      fish: 'dock',
    };
    const bType = typeMap[task];
    if (bType) {
      const b =
        world.buildings.find((item) => item.type === bType && item.unlocked && item.islandId === v.islandId) ??
        world.buildings.find((item) => item.type === bType && item.unlocked);
      if (!b) return { valid: false, label: meta.label, blockedReason: `No ${BUILDING_BLUEPRINTS[bType].name} built` };
      const reach = isReachablePoint(world, v, b.x, b.y + 16, b.islandId);
      if (!reach.ok) return { valid: false, label: meta.label, blockedReason: reach.reason };
      return {
        valid: true,
        label: meta.label,
        task,
        targetX: b.x,
        targetY: b.y + 16,
        targetIslandId: b.islandId,
        activityState: Math.hypot(v.x - b.x, v.y - (b.y + 16)) > 18 ? 'walking' : 'working',
        reason: `${meta.verb}.`,
      };
    }

    if (task === 'explore') {
      const localRuin = world.exploreRuins.find((r) => r.islandId === v.islandId && r.cooldownTimer <= 0);
      if (localRuin && isReachablePoint(world, v, localRuin.x, localRuin.y + 12, localRuin.islandId).ok) {
        return {
          valid: true,
          label: meta.label,
          task: 'explore',
          targetX: localRuin.x,
          targetY: localRuin.y + 12,
          targetIslandId: localRuin.islandId,
          activityState: 'exploring',
          reason: `Scouting ${localRuin.name}.`,
        };
      }
      const spot = pickExplorationSpot(world, v);
      return {
        valid: true,
        label: meta.label,
        task: 'explore',
        targetX: spot.x,
        targetY: spot.y,
        targetIslandId: v.islandId,
        activityState: 'exploring',
        reason: `Exploring toward ${spot.label}.`,
      };
    }
  }

  return { valid: false, label: action, blockedReason: 'Unsupported action' };
}

function getNextBuildResourceNeed(world: WorldState, homeId: IslandId): { needStone: boolean; needTimber: boolean } {
  const res = world.villageResources?.[homeId] ?? world.resources;
  if (world.activeConstruction) {
    const activeB = world.buildings.find(
      (b) => b.id === world.activeConstruction?.buildingId && !b.unlocked && b.islandId === homeId,
    );
    if (activeB?.requiredMaterials) {
      const remStone = Math.max(0, (activeB.requiredMaterials.stone ?? 0) - (activeB.deliveredMaterials?.stone ?? 0));
      const remTimber = Math.max(0, (activeB.requiredMaterials.timber ?? 0) - (activeB.deliveredMaterials?.timber ?? 0));
      if (remStone > (res.stone ?? 0) || remTimber > (res.timber ?? 0)) {
        return {
          needStone: remStone > (res.stone ?? 0),
          needTimber: remTimber > (res.timber ?? 0),
        };
      }
    }
  }
  const countType = (t: BuildingType) => world.buildings.filter((b) => b.islandId === homeId && b.type === t).length;
  const pop = Math.max(1, world.villagers.filter((u) => (u.homeIslandId ?? u.islandId) === homeId).length);
  const beds = world.buildings
    .filter((b) => b.islandId === homeId && b.unlocked)
    .reduce((s, b) => s + (b.housingCapacity ?? 0), 0);

  const checks: BuildingType[] =
    beds < pop || countType('lean_to') + countType('cottage') === 0
      ? ['bonfire', 'farm_plot', 'lean_to', 'cottage', 'woodshop', 'quarry', 'dock', 'watchtower', 'library', 'smeltery', 'bakery', 'barracks']
      : ['bonfire', 'farm_plot', 'lean_to', 'woodshop', 'quarry', 'cottage', 'dock', 'glider_pad', 'watchtower', 'library', 'smeltery', 'bakery', 'barracks'];

  for (const t of checks) {
    const bp = BUILDING_BLUEPRINTS[t];
    if (!bp || !getTechUnlocked(world, bp.requiredTechId)) continue;
    if (countType(t) === 0 || (t === 'farm_plot' && countType(t) < 2)) {
      return {
        needStone: (bp.baseCost.stone ?? 0) > (res.stone ?? 0),
        needTimber: (bp.baseCost.timber ?? 0) > (res.timber ?? 0),
      };
    }
  }
  return { needStone: false, needTimber: false };
}

export function evaluateVillagerDecision(world: WorldState, v: VillagerEntity): EvaluatedDecisionResult {
  const isl = ISLAND_DEFS[v.islandId];
  const homeId = v.homeIslandId ?? v.islandId;
  const homeRes = world.villageResources?.[homeId] ?? world.resources;
  const p = getNpcPersonality(v);
  const t = world.environment.timeOfDay;
  const isNight = t < 0.21 || t > 0.83;
  const isDuskRitual = t >= 0.72 && t <= 0.89;
  const isColdSeason = world.environment.season === 'winter' || world.environment.weather === 'snow';
  const pop = Math.max(1, world.villagers.filter((u) => (u.homeIslandId ?? u.islandId) === homeId).length);
  const prevAction = v.decisionTrace?.chosenAction ?? null;

  if (v.banished) {
    const pier = getPierApproachPoint(v.islandId);
    const reason = `Banished by ${isl.name} — heading to shore to board departing skiff.`;
    const trace: NpcDecisionTrace = {
      chosenAction: 'depart_banished',
      chosenLabel: 'Leave Island (Banished)',
      reason,
      goal: 'Walk to shore pier and sail away',
      validated: true,
      evaluatedAtDay: world.environment.dayCount,
      evaluatedAtTime: t,
      candidates: [
        { action: 'depart_banished', label: 'Leave Island (Banished)', score: 100, valid: true, reason },
      ],
    };
    return {
      trace,
      selectedAction: 'depart_banished',
      activityState: 'walking',
      task: v.activeTask,
      targetX: pier.x,
      targetY: pier.y,
      autonomyReason: reason,
    };
  }

  // Infants stay beside hearth safely
  if (v.lifeStage === 'infant') {
    const fire = getBonfireOnIsland(world, v.islandId);
    const tx = (fire?.x ?? isl.centerX) + (Math.random() * 18 - 9);
    const ty = (fire?.y ?? isl.centerY) + 18;
    const reason = 'Babbling softly and watching light beside the hearth.';
    const trace: NpcDecisionTrace = {
      chosenAction: 'infant_rest',
      chosenLabel: 'Stay Near Hearth',
      reason,
      goal: 'Rest under caretaker watch',
      validated: true,
      evaluatedAtDay: world.environment.dayCount,
      evaluatedAtTime: t,
      candidates: [
        { action: 'infant_rest', label: 'Stay Near Hearth', score: 100, valid: true, reason },
      ],
    };
    return {
      trace,
      selectedAction: 'infant_rest',
      activityState: 'sleeping',
      task: v.activeTask,
      targetX: tx,
      targetY: ty,
      autonomyReason: reason,
    };
  }

  const candidateSpecs: { action: string; baseScore: number; reason: string }[] = [];

  // 1. Warmth & Shelter survival utility
  const warmthDeficit = Math.max(0, (isColdSeason ? 55 : 35) - v.warmth);
  candidateSpecs.push({
    action: 'warm_up',
    baseScore: warmthDeficit > 0 ? 75 + warmthDeficit * 1.4 : 6,
    reason: warmthDeficit > 0 ? `Warmth low (${Math.round(v.warmth)}%)` : 'Adequately warm',
  });

  // 2. Hunger survival utility
  const hungerDeficit = Math.max(0, 50 - v.hunger);
  candidateSpecs.push({
    action: 'eat_comfort',
    baseScore: v.hunger < 48 ? 72 + hungerDeficit * 1.3 : 4,
    reason: v.hunger < 48 ? `Craves ${v.favoriteComfort} (hunger ${Math.round(v.hunger)}%)` : 'Not hungry',
  });
  candidateSpecs.push({
    action: 'eat_stockpile',
    baseScore: v.hunger < 46 ? 68 + hungerDeficit * 1.25 : 4,
    reason: v.hunger < 46 ? `Needs village food (hunger ${Math.round(v.hunger)}%)` : 'Not hungry',
  });

  // 3. Evening Bonfire Ritual & Night Sleep
  if (isDuskRitual) {
    candidateSpecs.push({
      action: 'bonfire_ritual',
      baseScore: 66 + p.sociability * 16 + p.empathy * 10,
      reason: 'Twilight hearth ritual fosters village bonds & culture',
    });
  }
  if (isNight && !v.traits.includes('resilient') && v.energy < 70) {
    candidateSpecs.push({
      action: 'sleep',
      baseScore: 64 + Math.max(0, 68 - v.energy) * 0.9,
      reason: `Nighttime fatigue (energy ${Math.round(v.energy)}%)`,
    });
  } else if (v.energy < 24) {
    candidateSpecs.push({
      action: 'sleep',
      baseScore: 76 + (24 - v.energy) * 1.2,
      reason: `Exhausted (energy ${Math.round(v.energy)}%)`,
    });
  }

  // 4. Defense against island raiders
  if (world.raiders.some((r) => r.islandId === v.islandId && r.hp > 0)) {
    const braveryScore = 44 + p.bravery * 46 - p.caution * 14 + (v.weaponType !== 'none' ? 16 : 0);
    candidateSpecs.push({
      action: 'defend_island',
      baseScore: braveryScore,
      reason: p.bravery >= 0.45 ? 'Protecting home island from raiders' : 'Reluctant defense urge',
    });
  }

  // 5. Childhood exploration & play
  if (v.lifeStage === 'child') {
    candidateSpecs.push({
      action: 'explore_wonder',
      baseScore: 52 + p.curiosity * 24,
      reason: 'Childhood curiosity about island wonders',
    });
    candidateSpecs.push({
      action: 'child_play',
      baseScore: 46 + p.sociability * 14,
      reason: 'Playful energy around camp',
    });
  }

  // 6. Cognitive awakening & social discovery (always evaluated so Inspector reveals why)
  const workReady = canVillagerWorkInBrain(world, v);
  const needsSocialGate = !workReady && v.cognition.socialCount < 2;
  candidateSpecs.push({
    action: 'socialize_learn',
    baseScore:
      (needsSocialGate ? 62 : 24) +
      p.sociability * 22 +
      p.empathy * 10 +
      (v.activeWish === 'chat' ? 10 : 0),
    reason: needsSocialGate
      ? `Awakening social bond (${v.cognition.socialCount}/2 chats)`
      : 'Social bonding & sharing discoveries',
  });

  candidateSpecs.push({
    action: 'explore_wonder',
    baseScore:
      (!workReady ? 58 : 22) +
      p.curiosity * 24 +
      (v.activeWish === 'explore' ? 10 : 0) +
      (world.chiefFocus === 'explore' ? 12 : 0),
    reason: !workReady
      ? `Awakening curiosity (${v.cognition.observedConcepts.length}/2 wonders)`
      : 'Curiosity & exploring uncharted island wonders',
  });

  // 6b. Haul carried inventory to stockpile or active build site
  const carriedAmt = v.carriedAmount ?? 0;
  if (v.carriedResource && carriedAmt > 0.05) {
    const cap = getCarryCap(v);
    const fullRatio = Math.min(1, carriedAmt / cap);
    const neededBySite =
      world.activeConstruction &&
      world.buildings.some(
        (b) =>
          b.id === world.activeConstruction?.buildingId &&
          !b.unlocked &&
          b.islandId === v.islandId &&
          (b.requiredMaterials?.[v.carriedResource!] ?? 0) > (b.deliveredMaterials?.[v.carriedResource!] ?? 0),
      );
    candidateSpecs.push({
      action: 'haul_to_stockpile',
      baseScore:
        fullRatio >= 0.85
          ? 92
          : (neededBySite ? 80 : 32) + fullRatio * 34,
      reason:
        fullRatio >= 0.85
          ? `Carry load full (${carriedAmt.toFixed(1)}/${cap} ${v.carriedResource})`
          : neededBySite
            ? `Build site awaits ${v.carriedResource}`
            : `Carrying ${carriedAmt.toFixed(1)} ${v.carriedResource}`,
    });
  }

  // 7. Productive Tasks
  const foodLow = (homeRes.food ?? 0) < pop * 6;
  const needBuild = getNextBuildResourceNeed(world, homeId);
  const tasksToConsider: TaskType[] = [
    'forage',
    'gather_stone',
    'chop',
    'farm',
    'pasture',
    'hunt',
    'fish',
    'quarry',
    'bake',
    'study',
    'smelt',
    'guard',
    'explore',
  ];

  for (const task of tasksToConsider) {
    const actionId = `task:${task}`;
    let score = 26 + p.industriousness * 22 + p.discipline * 8;

    // Personality & knowledge fit
    if (task === 'forage') {
      score += (foodLow ? 28 : 4) + (v.hunger < 26 ? 42 : 0) + getKnowledgeLevel(v, 'foraging') * 0.12;
    } else if (task === 'farm' || task === 'pasture') {
      score += (foodLow ? 30 : 12) + (world.chiefFocus === 'harvest' ? 14 : 0) + getKnowledgeLevel(v, 'foraging') * 0.14;
    } else if (task === 'fish') {
      score += (foodLow ? 22 : 8) + getKnowledgeLevel(v, 'sailing') * 0.14;
    } else if (task === 'hunt') {
      score += (foodLow ? 20 : 6) + p.bravery * 18 - p.caution * 10 + (world.chiefFocus === 'harvest' ? 10 : 0);
    } else if (task === 'chop') {
      score += (needBuild.needTimber ? 24 : 5) + getKnowledgeLevel(v, 'woodcraft') * 0.12;
    } else if (task === 'gather_stone' || task === 'quarry') {
      score += (needBuild.needStone ? 24 : 5) + (world.chiefFocus === 'craft' ? 12 : 0) + getKnowledgeLevel(v, 'stonecraft') * 0.12;
    } else if (task === 'study') {
      score += p.curiosity * 18 + (world.chiefFocus === 'craft' ? 12 : 0) + getKnowledgeLevel(v, 'social_customs') * 0.1;
    } else if (task === 'bake') {
      score += 14 + p.empathy * 10 + getKnowledgeLevel(v, 'cooking') * 0.14;
    } else if (task === 'smelt') {
      score += 14 + p.industriousness * 10 + getKnowledgeLevel(v, 'toolmaking') * 0.14;
    } else if (task === 'guard') {
      score += p.bravery * 16 + (world.chiefFocus === 'defense' ? 18 : 0);
    } else if (task === 'explore') {
      const undisc = ISLAND_ORDER.some((id) => !world.islands[id]?.discovered);
      score += p.curiosity * 20 + (undisc ? 12 : 0) + (world.chiefFocus === 'explore' ? 14 : 0);
    }

    // Player suggestion / command weight balanced by discipline vs stubbornness
    if (v.suggestedTask === task) {
      const followBonus = 24 + p.discipline * 16 - p.stubbornness * 14 + (v.mood > 70 ? 6 : -6);
      score += Math.max(6, followBonus);
    }

    // Short commitment hysteresis against thrashing
    if (prevAction === actionId && v.hunger > 35 && v.warmth > 35 && v.energy > 22) {
      score += 11;
    }

    candidateSpecs.push({
      action: actionId,
      baseScore: Number(score.toFixed(1)),
      reason:
        v.suggestedTask === task
          ? `Suggested role (${TASK_BY_ID[task].label})`
          : foodLow && (task === 'forage' || task === 'farm' || task === 'hunt' || task === 'fish')
            ? 'Village food stores low'
            : needBuild.needTimber && task === 'chop'
              ? 'Timber needed for next village structure'
              : needBuild.needStone && (task === 'gather_stone' || task === 'quarry')
                ? 'Stone needed for next village structure'
                : `${TASK_BY_ID[task].verb}`,
    });
  }

  // Evaluate & validate every candidate via canExecuteVillagerAction
  const evaluated: {
    candidate: NpcDecisionCandidate;
    validation: ActionValidationResult;
  }[] = [];

  for (const spec of candidateSpecs) {
    const val = canExecuteVillagerAction(world, v, spec.action);
    const finalScore = val.valid ? spec.baseScore : Math.min(spec.baseScore, -10);
    evaluated.push({
      candidate: {
        action: spec.action,
        label: val.label,
        score: Number(finalScore.toFixed(1)),
        valid: val.valid,
        blockedReason: val.blockedReason,
        reason: val.valid ? spec.reason : (val.blockedReason ?? spec.reason),
      },
      validation: val,
    });
  }

  // Keep highest-scored valid candidates first, followed by informative blocked ones
  evaluated.sort((a, b) => {
    if (a.candidate.valid !== b.candidate.valid) return a.candidate.valid ? -1 : 1;
    return b.candidate.score - a.candidate.score;
  });

  const winner = evaluated.find((e) => e.candidate.valid);
  const topCandidates = evaluated.slice(0, 6).map((e) => e.candidate);

  if (!winner) {
    const fallbackReason = 'Resting briefly while waiting for reachable island tasks.';
    const trace: NpcDecisionTrace = {
      chosenAction: 'idle_wait',
      chosenLabel: 'Wait at Camp',
      reason: fallbackReason,
      goal: 'Await reachable task',
      validated: true,
      evaluatedAtDay: world.environment.dayCount,
      evaluatedAtTime: t,
      candidates: topCandidates,
    };
    return {
      trace,
      selectedAction: 'idle_wait',
      activityState: 'resting',
      task: v.activeTask,
      targetX: isl.centerX,
      targetY: isl.centerY,
      autonomyReason: fallbackReason,
    };
  }

  const chosen = winner.validation;
  const chosenCand = winner.candidate;
  const finalReason = chosen.reason ?? chosenCand.reason;
  const trace: NpcDecisionTrace = {
    chosenAction: chosenCand.action,
    chosenLabel: chosenCand.label,
    reason: `${chosenCand.reason} (score ${chosenCand.score})`,
    goal: chosenCand.label,
    validated: true,
    evaluatedAtDay: world.environment.dayCount,
    evaluatedAtTime: t,
    candidates: topCandidates,
  };

  return {
    trace,
    selectedAction: chosenCand.action,
    activityState: chosen.activityState ?? 'walking',
    task: chosen.task ?? v.activeTask,
    targetX: chosen.targetX ?? isl.centerX,
    targetY: chosen.targetY ?? isl.centerY,
    autonomyReason: finalReason,
    focusConcept: chosen.focusConcept,
    socialPeerId: chosen.socialPeerId,
  };
}
