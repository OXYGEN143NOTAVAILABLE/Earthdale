import { applyArchipelagoSeed } from './catalog';
import { ensureGovernanceArrays } from './governance';
import { applyWorldCommand, stepSimulation } from './simulation';
import type { Particle, SettingsState, WorldCommand, WorldState } from './types';

export const MULTIPLAYER_LOCKED_SPEED = 1 as const;

export function enforceMultiplayerClock(world: WorldState): WorldState {
  if (!world.settings) {
    world.settings = {
      fpsCap: 60,
      simSpeed: MULTIPLAYER_LOCKED_SPEED,
      muted: true,
      volume: 0.45,
      autoProgress: true,
    };
  } else {
    world.settings.simSpeed = MULTIPLAYER_LOCKED_SPEED;
  }
  return world;
}

/**
 * Authoritative multiplayer command handler.
 * Rejects any attempt to pause or accelerate the shared room clock and preserves
 * `simSpeed === 1` after every command.
 */
export function applyMultiplayerWorldCommand(
  world: WorldState,
  cmd: WorldCommand,
  particles: Particle[] = [],
  actorPlayerId?: string,
): { ok: boolean; message: string } {
  enforceMultiplayerClock(world);
  if (cmd.kind === 'set_speed') {
    return {
      ok: false,
      message: 'Simulation pace is locked at 1× in multiplayer.',
    };
  }
  const result = applyWorldCommand(world, cmd, particles, actorPlayerId);
  enforceMultiplayerClock(world);
  return result;
}

/**
 * Steps the authoritative multiplayer world in <= 0.05s sub-steps so a 10 Hz
 * server loop runs at true 1.0× real-time progression instead of clamping dt
 * to a single 0.05s slice per 120ms tick.
 */
export function stepMultiplayerWorld(
  world: WorldState,
  elapsedSeconds: number,
  particles: Particle[] = [],
): void {
  enforceMultiplayerClock(world);
  let remaining = Math.min(0.25, Math.max(0, elapsedSeconds));
  while (remaining > 0.0005) {
    const slice = Math.min(0.05, remaining);
    stepSimulation(world, slice, particles, false);
    remaining -= slice;
  }
  enforceMultiplayerClock(world);
}

/**
 * Applies lightweight client-side normalization to a server-broadcast WorldState
 * snapshot without re-running full save migration every 120ms.
 * Preserves local audio & FPS preferences while locking simSpeed to 1×.
 */
export function sanitizeSyncedWorldState(
  incoming: WorldState,
  localSettings: SettingsState,
): WorldState {
  if (typeof incoming.worldSeed === 'number' && incoming.worldSeed > 0) {
    applyArchipelagoSeed(incoming.worldSeed);
  }
  if (!Array.isArray(incoming.eventLog)) incoming.eventLog = [];
  if (!Array.isArray(incoming.wildHerds)) incoming.wildHerds = [];
  ensureGovernanceArrays(incoming);
  incoming.settings = {
    fpsCap: localSettings.fpsCap,
    simSpeed: MULTIPLAYER_LOCKED_SPEED,
    muted: localSettings.muted,
    volume: localSettings.volume,
    autoProgress: incoming.settings?.autoProgress ?? true,
  };
  return incoming;
}
