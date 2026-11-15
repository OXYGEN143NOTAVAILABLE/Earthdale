import { ISLAND_DEFS } from './catalog';
import { emitWorldEvent } from './eventBus';
import type { ArrivalCandidate, BoatEntity, IslandId, VillagerEntity, WorldState } from './types';

/**
 * Spawns a physical migrant skiff approaching the target island's harbor from across the sky-sea,
 * attaching it to the pending ArrivalCandidate rather than spawning castaways out of thin air.
 */
export function dispatchMigrantBoat(
  world: WorldState,
  islandId: IslandId,
  traveler: ArrivalCandidate,
): BoatEntity {
  const isl = ISLAND_DEFS[islandId];
  const seaX = isl.dockSpot.seaX;
  const seaY = isl.dockSpot.seaY;
  // Offset vector outward from island center so boat arrives from open sky-sea
  const outX = seaX - isl.centerX;
  const outY = seaY - isl.centerY;
  const len = Math.hypot(outX, outY) || 1;
  const startX = Math.round(seaX + (outX / len) * 240);
  const startY = Math.round(seaY + (outY / len) * 200);

  const boat: BoatEntity = {
    id: `boat_mig_${traveler.id}`,
    name: `${traveler.name.split(' ')[0]}'s Skiff`,
    kind: 'migrant_skiff',
    cultureId: world.islands[islandId]?.owningCultureId ?? 'hearthfolk',
    homeIslandId: islandId,
    targetIslandId: islandId,
    x: startX,
    y: startY,
    targetX: seaX,
    targetY: seaY,
    yaw: Math.atan2(-(seaY - startY), seaX - startX),
    hp: 110,
    maxHp: 110,
    state: 'sailing',
    cargoText: `Passenger: ${traveler.name}`,
    passengerIds: [],
    tripTimer: 12,
    arrivalId: traveler.id,
  };

  traveler.boatId = boat.id;
  traveler.boatPhase = 'approaching';
  world.boats.push(boat);
  world.pendingArrivals.push(traveler);

  emitWorldEvent(world, {
    category: 'migration',
    significance: 'notable',
    summary: `A migrant skiff carrying ${traveler.name} was sighted sailing toward ${isl.name}.`,
    islandId,
    participantIds: traveler.greeterId ? [traveler.greeterId] : [],
  });

  return boat;
}

/**
 * Advances approaching/docked/returning migrant boats and routes shore greeters
 * to meet docked newcomers before villager deliberation resolves.
 */
export function tickMigrantBoatLifecycle(
  world: WorldState,
  boat: BoatEntity,
  dt: number,
  worldBoats: BoatEntity[],
  boatIndex: number,
): boolean {
  if (boat.kind !== 'migrant_skiff') return false;

  const arrival = boat.arrivalId
    ? world.pendingArrivals.find((a) => a.id === boat.arrivalId)
    : undefined;

  const dist = Math.hypot(boat.targetX - boat.x, boat.targetY - boat.y);

  if (boat.state === 'returning') {
    if (dist <= 14 || boat.tripTimer <= -8) {
      if (boat.passengerIds.length > 0) {
        for (const pid of boat.passengerIds) {
          const idx = world.villagers.findIndex((v) => v.id === pid);
          if (idx !== -1) {
            world.villagers[idx].voyageBoatId = null;
            world.villagers.splice(idx, 1);
            world.departedCount += 1;
          }
        }
      }
      worldBoats.splice(boatIndex, 1);
      return true;
    }
    return false;
  }

  // Arrived at harbor! Transition to docked -> disembarked and beckon greeter
  if (boat.state === 'sailing' && dist <= 12) {
    boat.state = 'docked';
    boat.tripTimer = 18;
    if (arrival) {
      arrival.boatPhase = 'disembarked';
      const isl = ISLAND_DEFS[arrival.islandId ?? boat.targetIslandId];
      if (arrival.greeterId) {
        const greeter = world.villagers.find((v) => v.id === arrival.greeterId);
        if (greeter && greeter.state !== 'fighting' && greeter.state !== 'sleeping') {
          greeter.targetX = isl.dockSpot.x;
          greeter.targetY = isl.dockSpot.y;
          greeter.state = 'socializing';
          greeter.autonomyReason = `Meeting ${arrival.name.split(' ')[0]}'s skiff at ${isl.name} pier.`;
          greeter.thoughtBubble = 'Ahoy!';
          greeter.thoughtTimer = 2.6;
        }
      }
      emitWorldEvent(world, {
        category: 'migration',
        significance: 'minor',
        summary: `${arrival.name}'s skiff docked at ${isl.name} shore.`,
        islandId: isl.id,
        participantIds: arrival.greeterId ? [arrival.greeterId] : [],
      });
    }
    return true;
  }

  // Clean up stray docked migrant skiff if its arrival already resolved
  if (!arrival && boat.state === 'docked' && boat.tripTimer <= 0) {
    sendMigrantBoatAway(boat);
  }
  // Suppress unused dt warning if needed
  void dt;
  return false;
}

export function sendMigrantBoatAway(boat: BoatEntity, passengerName?: string): void {
  const isl = ISLAND_DEFS[boat.targetIslandId ?? boat.homeIslandId];
  const outX = boat.x - isl.centerX;
  const outY = boat.y - isl.centerY;
  const len = Math.hypot(outX, outY) || 1;
  boat.state = 'returning';
  boat.targetX = Math.round(isl.dockSpot.seaX + (outX / len) * 280);
  boat.targetY = Math.round(isl.dockSpot.seaY + (outY / len) * 240);
  boat.tripTimer = 16;
  if (passengerName) {
    boat.cargoText = `Departing with ${passengerName}`;
  }
}

export function getMigrantLandingPoint(islandId: IslandId): { x: number; y: number } {
  const isl = ISLAND_DEFS[islandId];
  return {
    x: isl.dockSpot.x + (Math.random() * 14 - 7),
    y: isl.dockSpot.y + (Math.random() * 14 - 7),
  };
}

export function getGreetingVillagerForIsland(world: WorldState, islandId: IslandId): VillagerEntity | null {
  return (
    world.villagers.find(
      (v) =>
        (v.homeIslandId ?? v.islandId) === islandId &&
        (v.lifeStage === 'adult' || v.lifeStage === 'elder'),
    ) ?? null
  );
}
