import { ISLAND_DEFS } from './catalog';
import { emitWorldEvent } from './eventBus';
import { getKnowledgeLevel } from './knowledge';
import type {
  BuildingEntity,
  ConstructionProject,
  ConstructionStage,
  IslandId,
  VillageResources,
  VillagerEntity,
  WildNodeEntity,
  WorldState,
} from './types';

export function isFiniteMineralNode(kind: WildNodeEntity['kind']): boolean {
  return (
    kind === 'stone_boulder' ||
    kind === 'flint_pile' ||
    kind === 'copper_vein' ||
    kind === 'iron_vein' ||
    kind === 'branch_pile'
  );
}

/**
 * Living flora (berry bushes & trees) regrows slowly ONLY if not stripped bare (> 0.05).
 * Mineral & stone nodes are strictly finite and never regenerate.
 */
export function tickWildNodeRegrowth(world: WorldState, dt: number) {
  for (const node of world.wildNodes) {
    if (node.amount <= 0) {
      node.amount = 0;
      continue;
    }
    if (isFiniteMineralNode(node.kind)) continue;
    if (node.amount > 0.05 && node.amount < node.maxAmount) {
      node.amount = Math.min(node.maxAmount, node.amount + dt * 0.015);
    }
  }
}

/**
 * Safely harvests from a finite or living node without ever allowing negative amounts.
 */
export function harvestWildNode(node: WildNodeEntity, requestedTake: number): number {
  if (requestedTake <= 0 || node.amount <= 0) return 0;
  const take = Math.min(node.amount, requestedTake);
  node.amount = Math.max(0, Number((node.amount - take).toFixed(4)));
  return take;
}

export function getCarryCap(v: VillagerEntity): number {
  return Math.max(1, v.carryCapacity ?? 6);
}

export function addToVillagerInventory(
  world: WorldState,
  v: VillagerEntity,
  resource: keyof VillageResources,
  amount: number,
  addResFn: (world: WorldState, islandId: IslandId, key: keyof VillageResources, amt: number) => void,
): number {
  if (amount <= 0) return 0;
  const cap = getCarryCap(v);
  if (v.carriedResource && v.carriedResource !== resource && (v.carriedAmount ?? 0) > 0) {
    // Auto-deposit previous mismatched pocket item if trivial, otherwise leave for haul
    if ((v.carriedAmount ?? 0) < 0.75) {
      addResFn(world, v.homeIslandId ?? v.islandId, v.carriedResource, v.carriedAmount ?? 0);
      v.carriedResource = null;
      v.carriedAmount = 0;
    } else {
      return 0;
    }
  }
  const current = v.carriedAmount ?? 0;
  const room = Math.max(0, cap - current);
  if (room <= 0) return 0;
  const added = Math.min(room, amount);
  v.carriedResource = resource;
  v.carriedAmount = Number((current + added).toFixed(3));
  return added;
}

export function depositCarriedToVillage(
  world: WorldState,
  v: VillagerEntity,
  addResFn: (world: WorldState, islandId: IslandId, key: keyof VillageResources, amt: number) => void,
  syncFoodFn: (world: WorldState) => void,
): { resource: keyof VillageResources; amount: number } | null {
  const resKey = v.carriedResource;
  const amt = v.carriedAmount ?? 0;
  if (!resKey || amt <= 0.01) {
    v.carriedResource = null;
    v.carriedAmount = 0;
    return null;
  }
  const homeId = v.homeIslandId ?? v.islandId;
  addResFn(world, homeId, resKey, amt);
  syncFoodFn(world);
  v.carriedResource = null;
  v.carriedAmount = 0;
  return { resource: resKey, amount: amt };
}

export function getStockpileDepositPoint(world: WorldState, islandId: IslandId): { x: number; y: number } {
  const fire = world.buildings.find((b) => b.islandId === islandId && b.type === 'bonfire' && b.unlocked);
  if (fire) return { x: fire.x, y: fire.y + 18 };
  const store = world.buildings.find(
    (b) =>
      b.islandId === islandId &&
      b.unlocked &&
      (b.type === 'woodshop' || b.type === 'quarry' || b.type === 'cottage' || b.type === 'lean_to'),
  );
  if (store) return { x: store.x, y: store.y + 18 };
  const isl = ISLAND_DEFS[islandId];
  return { x: isl.centerX, y: isl.centerY + 12 };
}

export function getConstructionStageForRatio(ratio: number, unlocked: boolean): ConstructionStage {
  if (unlocked || ratio >= 1) return 'complete';
  if (ratio < 0.25) return 'foundation';
  if (ratio < 0.5) return 'framework';
  if (ratio < 0.75) return 'walls';
  return 'roof';
}

function getNextStageGateRatio(currentStage: ConstructionStage): number {
  switch (currentStage) {
    case 'foundation':
      return 0.25;
    case 'framework':
      return 0.5;
    case 'walls':
      return 0.75;
    case 'roof':
    case 'complete':
    default:
      return 1;
  }
}

export function initStagedBuildingMaterials(
  b: BuildingEntity,
  cost: Partial<Record<keyof VillageResources, number>>,
) {
  b.constructionStage = b.unlocked ? 'complete' : 'foundation';
  b.requiredMaterials = { ...cost };
  b.deliveredMaterials = {};
  for (const k of Object.keys(cost) as (keyof VillageResources)[]) {
    if ((cost[k] ?? 0) > 0) {
      b.deliveredMaterials[k] = 0;
    }
  }
  b.pausedForMaterials = false;
}

/**
 * Ensures materials for the current construction stage are physically delivered onto the site
 * from nearby carried inventory or village stockpile. Never deducts resources below 0.
 * If required stage materials are missing, pauses construction cleanly before advancing past the gate.
 */
export function deliverMaterialsForStage(
  world: WorldState,
  b: BuildingEntity,
  ac: ConstructionProject,
  syncFoodFn: (world: WorldState) => void,
): { gateMet: boolean; nextGateRatio: number; missing: string[] } {
  const ratio = ac.progress / Math.max(0.1, ac.duration);
  const currentStage = getConstructionStageForRatio(ratio, b.unlocked);
  b.constructionStage = currentStage;
  ac.stage = currentStage;

  // Upgrades or legacy sites without requiredMaterials proceed cleanly
  if (ac.isUpgrade || !b.requiredMaterials || Object.keys(b.requiredMaterials).length === 0) {
    ac.pausedForMaterials = false;
    b.pausedForMaterials = false;
    return { gateMet: true, nextGateRatio: 1, missing: [] };
  }

  if (!b.deliveredMaterials) b.deliveredMaterials = {};
  const nextGateRatio = getNextStageGateRatio(currentStage);
  const res = world.villageResources?.[b.islandId] ?? world.resources;
  const reqEntries = Object.entries(b.requiredMaterials) as [keyof VillageResources, number][];

  // 1. Accept direct material delivery from nearby carrying villagers (within 48u of site)
  for (const v of world.villagers) {
    if (v.islandId !== b.islandId || !v.carriedResource || (v.carriedAmount ?? 0) <= 0.01) continue;
    if (Math.hypot(v.x - b.x, v.y - b.y) > 48) continue;
    const key = v.carriedResource;
    const reqTotal = b.requiredMaterials[key] ?? 0;
    const delivered = b.deliveredMaterials[key] ?? 0;
    if (reqTotal > delivered) {
      const need = reqTotal - delivered;
      const take = Math.min(need, v.carriedAmount ?? 0);
      b.deliveredMaterials[key] = Number((delivered + take).toFixed(2));
      v.carriedAmount = Number(((v.carriedAmount ?? 0) - take).toFixed(2));
      if (v.carriedAmount <= 0.01) {
        v.carriedAmount = 0;
        v.carriedResource = null;
      }
    }
  }

  // 2. Check & pull required cumulative materials for the current stage gate from island stockpile
  const missing: string[] = [];
  for (const [key, totalReq] of reqEntries) {
    if (!totalReq || totalReq <= 0) continue;
    const gateNeed = Math.min(totalReq, Math.ceil(totalReq * nextGateRatio));
    const currentDeliv = b.deliveredMaterials[key] ?? 0;
    if (currentDeliv < gateNeed) {
      const shortfall = gateNeed - currentDeliv;
      const available = Math.max(0, res[key] ?? 0);
      const transfer = Math.min(shortfall, available);
      if (transfer > 0.001) {
        res[key] = Math.max(0, Number((available - transfer).toFixed(2)));
        b.deliveredMaterials[key] = Number((currentDeliv + transfer).toFixed(2));
        if (b.islandId === world.localHomeIslandId) {
          world.resources[key] = res[key];
        }
        syncFoodFn(world);
      }
      if ((b.deliveredMaterials[key] ?? 0) + 0.01 < gateNeed) {
        missing.push(key);
      }
    }
  }

  if (missing.length > 0) {
    const wasPaused = Boolean(b.pausedForMaterials);
    ac.pausedForMaterials = true;
    b.pausedForMaterials = true;
    if (!wasPaused) {
      emitWorldEvent(world, {
        category: 'construction',
        significance: 'minor',
        summary: `${b.name} construction paused at ${currentStage} awaiting ${missing.join(', ')}.`,
        islandId: b.islandId,
        participantIds: [ac.builderId],
      });
    }
    return { gateMet: false, nextGateRatio, missing };
  }

  ac.pausedForMaterials = false;
  b.pausedForMaterials = false;
  return { gateMet: true, nextGateRatio, missing: [] };
}

export function hasFoundationResources(
  res: VillageResources,
  cost: Partial<Record<keyof VillageResources, number>>,
): boolean {
  for (const [k, v] of Object.entries(cost)) {
    if (typeof v === 'number' && v > 0) {
      const gateNeed = Math.min(v, Math.ceil(v * 0.25));
      if ((res[k as keyof VillageResources] ?? 0) < gateNeed) return false;
    }
  }
  return true;
}

/**
 * Fix for 2-villager extra cottage bug: villages ONLY build housing when beds < pop.
 */
export function villageNeedsHousing(pop: number, beds: number): boolean {
  return beds < pop;
}

/**
 * Cottage requires Timber Joinery tech + construction knowledge (>= 8 or beyond awakening) in whisper_solo.
 */
export function canBuildCottage(world: WorldState, islandId: IslandId): boolean {
  if (!world.unlockedTechIds.includes('timber_joinery')) return false;
  if (world.gameMode !== 'whisper_solo') return true;
  return world.villagers.some(
    (v) =>
      (v.homeIslandId ?? v.islandId) === islandId &&
      v.lifeStage !== 'infant' &&
      (getKnowledgeLevel(v, 'construction') >= 8 || v.cognition.stage !== 'awakening'),
  );
}
