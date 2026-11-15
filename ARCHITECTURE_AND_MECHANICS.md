# Hearthglen / Earthdale — Living Architecture & Game Mechanics Guide

> **Maintenance Rule:** This document is the living technical specification for **Hearthglen**. Update the relevant sections whenever any game rule, data schema, AI heuristic, multiplayer rule, camera control, or rendering pipeline changes.

---

## 1. High-Level Architecture

Hearthglen is a 3D floating-archipelago colony simulation and RTS built with **React 19 + TypeScript + Tailwind CSS v4 + Three.js** and backed by an **Express + WebSocket (`ws`)** server (`server.ts`) on port `3000`.

### Core Module Map

| Layer | File | Responsibility |
| :--- | :--- | :--- |
| **Multiplayer Server** | `server.ts` | Hosts Express + Vite middleware (dev) / static SPA (prod) and authoritative WebSocket rooms (`/ws`) at ~8–10 Hz. Assigns distinct home islands per player (`assignPlayerVillageInWorld`), delegates command validation to `applyMultiplayerWorldCommand`, and steps rooms via `stepMultiplayerWorld`. |
| **Multiplayer Sync & Lock** | `src/game/multiplayerSync.ts` | Enforces the `1×` synchronized multiplayer clock (`MULTIPLAYER_LOCKED_SPEED = 1`), rejects `set_speed` commands server-side, sub-steps 10 Hz server frames in `<= 0.05s` increments for true `1.0×` progression, and sanitizes client snapshots while preserving local FPS/audio preferences. |
| **Domain Types** | `src/game/types.ts` | Canonical interfaces for `WorldState`, `HudSnapshot`, `VillagerEntity`, `NpcPersonality`, `KnowledgeDomainId`, `NpcMemoryEntry`, `NpcDecisionTrace`, `WorldEvent`, `CommunityRule`, `VillageIncident`, `DisputeCase`, `BuildingEntity` (`ConstructionStage`), `WildHerdEntity`, `RoomPlayerPresence`, `WorldCommand`, and WebSocket messages. |
| **World Catalog & Traits** | `src/game/catalog.ts` | World dimensions (`7600 × 5200`, `WORLD_SCALE = 0.085`), seeded procedural archipelago generator (`generateSeededArchipelago`, `applyArchipelagoSeed`, `mulberry32`), organic coastline coves (`islandCoastWobble`), `PLAYER_VILLAGE_ISLANDS`, `getSocialTier`, unit traits & stats (`TRAITS`, `rollUnitStats`), skills (`SKILL_META`), genetic trait inheritance (`inheritBabyTraits`), and island geometry helpers. |
| **Tech, Blueprints & Cultures** | `src/game/techAndCultures.ts` | 4-branch technology tree (`TECH_TREE`), building blueprints (`BUILDING_BLUEPRINTS`), crop/livestock metadata, culture profiles (`CULTURES`), and village custom definitions (`VILLAGE_CUSTOM_META`). |
| **Navigation & Terrain** | `src/game/navigation.ts` | Main-world terrain classifier (`classifyMainWorldTerrain`: `'land'`, `'shallow_water'`, `'deep_water'`, `'bridge'`) driven by true terrain height, coastal beaches, spline river valleys/estuaries, inland ponds, and springs; clearance-weighted grid A* pathfinder (with `WeakMap` obstacle-signature path invalidation, shoulder-padded LOS smoothing, deep-water avoidance, and built sky-bridge support); cross-island reachability checks (`checkTargetReachability`); and entity separation forces + open-land stuck recovery. |
| **NPC Personality & Knowledge** | `src/game/personality.ts`, `src/game/knowledge.ts` | Deterministic 6-axis `NpcPersonality` (`curiosity`, `sociability`, `empathy`, `discipline`, `courage`, `honesty`), 10 gradual `KnowledgeDomainId` mastery streams (`foraging`, `stonecraft`, `woodcraft`, `firecraft`, `toolmaking`, `shelter`, `healing`, `social_customs`, `sailing`, `cooking`), and importance-ranked bounded memory streams (`<= 24` entries). |
| **NPC Brain & Explainable AI** | `src/game/npcBrain.ts` | Utility-based decision engine (`evaluateVillagerDecision`) inspired by *The Sims* and *Generative Agents* (Park et al., 2023): pre-action world-state validation, decision hysteresis, candidate scoring, and structured `NpcDecisionTrace` inspection data. |
| **Social Simulation & Event Bus** | `src/game/social.ts`, `src/game/eventBus.ts` | Centralized deduplicated `WorldEvent` log (`<= 200` confirmed outcomes), stranger-first introductions, gradual relationship progression, mood/personality-driven quarrels, shared campfire knowledge circles, and social memory recording. |
| **Finite Economy & Construction** | `src/game/economy.ts` | Finite resource node harvesting (`harvestWildNode`), villager carry inventory (`addToVillagerInventory`, `depositCarriedToVillage`), 5-stage physical construction (`foundation -> framework -> walls -> roof -> complete`), material delivery validation, and population-gated shelter checks (`shouldIslandBuildHouse`). |
| **Wildlife AI & Boat Migration** | `src/game/wildlife.ts`, `src/game/migration.ts` | Multi-state animal AI (`wandering`, `grazing`, `drinking` at shallow water, `resting`, `fleeing`, `fighting`, `mating`) obeying deep-water boundaries, plus physical migrant skiff arrivals (`tickMigrantBoatLifecycle`), shoreline disembarkation, and declined/banished departures. |
| **Governance, Rules & Banishment** | `src/game/governance.ts` | Witnessed-only misconduct observation (`WITNESS_RANGE = 140`), secondhand rumors, emergent `CommunityRule` adoption, individual weighted council dispute votes (`DisputeCase`), and physical dock-skiff exile (`executePhysicalBanishment`, `boardBanishmentSkiff`). |
| **Simulation Engine** | `src/game/simulation.ts` | Main simulation orchestrator (`stepSimulation`), per-island stockpile/flow accounting, legacy save migration (`normalizeWorldState`), offline catch-up, `createHudSnapshot`, and `applyWorldCommand`. |
| **Multiplayer Client** | `src/game/multiplayerClient.ts` | Browser WebSocket wrapper handling room creation, room joining, command dispatch, and cursor/focus presence updates. |
| **3D World, Models & Renderer** | `src/game/lowPolyWorld.ts`, `src/game/lowPolyModels.ts`, `src/game/lowPolyRenderer.ts` | Seeded organic floating-island meshes (`groundHeightAtSim`, `rings=46, segs=104`, smooth top-cap normals + matte turf texture + seamless underwater sandy coves & seabed skirts), widening spline river estuaries, inland pond basins, cliff waterfalls with sea-level plunge foam, gnarled ancient broadleaf oaks, feathery conifers, multi-variant village buildings, matte-clay chibi rigs with 6 common everyday clothing styles, stowed/drawn weapons, articulated building/action/weapon/animal animations, seed-reactive scene rebuilds, and raycast hit-testing. |
| **Audio Engine** | `src/game/audio.ts` | Procedural Web Audio chimes, ambient wind/rain, and feedback tones. |
| **Simulation Sandbox** | `src/game/sandbox.ts`, `src/game/sandbox.test.ts` | Deterministic flat-terrain simulation lab (`?sandbox=1`) for inspecting and testing Scenarios `A–I`. |
| **Root Application** | `src/App.tsx` | Lifecycle orchestration, Three.js mount, continuous WASD/Arrow + mouse/wheel camera controller, RTS box-selection, hotkeys, `?sandbox=1` / `?autostart=1` URL launch, and per-player HUD snapshot syncing. |
| **UI Components** | `src/components/*.tsx` | `TitleScreen`, `SandboxView`, `TopBar`, `BottomControlDock`, `RealmLedger` (7 tabs: Build, Resources, Tech, Islands, Cultures, Lineage, **Social Log**), `NpcInspector` (Overview, **Brain**, **Knowledge**), `AnimalInspector`, `ValleyMapDrawer`, `ClimateDrawer`, `DevToolsDrawer`, `ArrivalPrompt`, `PauseModal`. |

---

## 2. Game Modes, Multiplayer Lock & Village Ownership

1. **`whisper_solo` (Gentle God Mode)** — Guide one home village (`world.localHomeIslandId`, defaulting to `'cradle'`) via suggestions, divine encouragement, and placement stakes while other islands run autonomously.
2. **`sovereign_sandbox` (RTS & Direct Control)** — Own and command your assigned island with RTS marquee box selection, combat drafting, `Hold Position`, `Move Here`, and contextual right-click orders (`canControlVillager`).
3. **`shared_siege` (Co-Op Multi-Front Defense)** — Connected players share command of Cradle Isle's defenders against multi-front raiding waves.

### Multiplayer Clock Lock & Synchronization (`multiplayerSync.ts`, `server.ts`)
- **Zero Speedup Controls in Co-Op**: When connected to a multiplayer room (`mpRoomCode` set):
  - `TopBar` omits the `0×–3×` `Game Speed` buttons and displays a read-only `1× Synced` badge.
  - `PauseModal` omits `Paused / 1x / 2x / 3x` buttons and displays a read-only `1× Synchronized Clock` notice.
  - `App.tsx` blocks `Space` pause/speed shortcuts and `handleChangeSimSpeed`, forces `effectiveSpeed = 1` in the client animation loop, and runs `sanitizeSyncedWorldState`.
  - `server.ts` enforces `simSpeed = 1` on room creation and every tick, rejects `set_speed` commands via `applyMultiplayerWorldCommand`, and sub-steps 10 Hz frames (`<= 0.05s` per slice) so multiplayer advances at true `1.0×` real-time pace.
- **Authoritative Execution**: Only the server executes `stepSimulation` in multiplayer rooms; clients never independently run NPC decisions, preventing duplicate `WorldEvent` records or desynced positions/construction states.

---

## 3. NPC Intelligence, Learning & Explainability

- **Cognitive Awakening**: Founders in `whisper_solo` awaken near `0` awareness and `0` across all 10 knowledge domains (`knowledge.ts`), gradually observing flora, flint, spring water, wildlife, embers, and horizons before unlocking adult work (`canVillagerWork`).
- **Personality (`personality.ts`)**: Six continuous `[0, 1]` axes (`curiosity`, `sociability`, `empathy`, `discipline`, `courage`, `honesty`) shape needs weights, social chemistry, rule obedience, and council votes.
- **Memory Stream (`NpcMemoryEntry`)**: Bounded to `24` entries per villager; retention prioritizes high-importance and recent survival, social, discovery, construction, and governance events.
- **Explainable Brain (`npcBrain.ts` & `NpcInspector` Brain/Knowledge Tabs)**:
  - Pre-action validation verifies target reachability (`checkTargetReachability`), resource availability, tech unlocks, and carry state before an action can win utility scoring.
  - Decision hysteresis (`HYSTERESIS_BONUS`) stabilizes ongoing work to prevent rapid task thrashing.
  - `NpcInspector` exposes the live `Decision Trace` (chosen action, score breakdown, why alternatives lost, blocked reasons), `Personality Axes`, `Memories`, and all `10 Knowledge Domains`.

---

## 4. Social Simulation & Earthdale Social Log

- **Confirmed Events (`eventBus.ts`)**: `emitWorldEvent` records only verified simulation transitions across `'social' | 'relationship' | 'build' | 'resource' | 'migration' | 'wildlife' | 'rule' | 'discovery'`, deduplicates within a short time window, and caps the log at `200` entries.
- **Gradual Progression (`social.ts`)**: Non-partner strangers introduce themselves (`introduced: true`) before progressing through `Stranger -> Acquaintance -> Guest -> Friend -> Confidant -> Bonded Kin`; low mood and clashing personalities can trigger quarrels and negative sentiments.
- **Realm Ledger → Social Log**: Filterable by event category (`All`, `Social`, `Relations`, `Builds`, `Economy`, `Migration`, `Rules`, `Wildlife`) and villager, plus a live `Community Rules & Councils` panel.

---

## 5. Finite Resources, Carry Haulage & Staged Construction

- **Finite Nodes & Living Regrowth**: Stone boulders, flint piles, and copper/iron veins are strictly finite (`amount >= 0`, `harvestWildNode`), while living berry bushes and trees regrow slowly after depletion.
- **Carry Capacity & Haulage (`economy.ts`)**: Villagers harvest into personal inventory (`carriedResource`, `carriedAmount`, `carryCapacity`) and haul supplies back to village stockpiles or directly to an active construction site.
- **5-Stage Construction**: Unbuilt structures progress visibly through `foundation -> framework -> walls -> roof -> complete`, pausing cleanly (`pausedForMaterials`) if required materials have not been delivered.
- **Population-Gated Housing (`shouldIslandBuildHouse`)**: Villages do not spam extra houses while open shelter beds (`beds - pop >= 1`) already cover current residents; advanced cottages remain gated behind `timber_joinery`.

---

## 6. Navigation, Deep Water, Wildlife & Physical Migration

- **World Gen, Water Integration, Pathfinding & Terrain Validation (`catalog.ts`, `lowPolyWorld.ts`, `navigation.ts`, `simulation.ts`, `ValleyMapDrawer.tsx`)**: Every new world rolls a fresh `worldSeed` (synced across multiplayer rooms & saves) driving `generateSeededArchipelago(worldSeed)` with zero fixed layout: islands scatter across non-overlapping rings with randomized scales, coastline phases, ridge orientations, sheltered cove notches (`coveAngles`), dock orientations, curved spline rivers (`rivers`), inland ponds (`ponds`), bridges, and cableways. Low/medium coasts slope smoothly beneath `y = 0` into wet sand & underwater seabed vertices (`getShoreSlopeFactor`) while river channels widen into sea-level estuaries (`buildIslandRiversGeometry`) and cliffside streams spill over waterfalls with plunge foam. Artificial terrace wall/staircase blocks and decorative stone circles are removed so terrain flows naturally. `buildInitialWildNodes()`, `buildArchipelagoLandmarks()`, ruins, herds, and outposts place resources/props procedurally per `worldSeed` and validate every spot against `'land'` terrain, ponds, rivers, slopes, springs, docks, and central clearings. Main-world steering (`steerMainWorldEntity`) tracks obstacle grid signatures via a `WeakMap` to invalidate cached waypoints immediately when buildings or resource nodes change, favors open lanes with neighbor-clearance penalties, smooths waypoints via shoulder-padded LOS checks, crosses rivers via shallow gravel fords, and recovers wedged entities toward the nearest walkable `'land'` cell. Cross-island walks fail validation unless a bridge, dock, glider pad, or cableway connects the islands.
- **Clothing, Architectural Variety & Articulated Animations (`lowPolyModels.ts`, `lowPolyRenderer.ts`)**: Everyday villagers wear 6 deterministic common clothing styles (belted tunics, work aprons, buttoned vests, shawls, flared skirts, satchel scarves) plus task headgear (`straw sunhat`, `baker toque`, `cloth kerchief`), reserving full plate armor (`isSoldierArmor`) for active guards, drafted defenders, and Tier-3 combatants. Weapons remain stowed (`stowedWeaponGroup`) while civilians walk or work and switch to drawn (`weaponGroup`) animations for bow aiming/release, spear two-handed thrusts, and sword slashes. Buildings spawn deterministic architectural silhouettes with animated construction tremors, bellows/saws/embers, and fountain ripples, while livestock and wild herds articulate heads (`+X` forward, `-Z` graze pitch), ears, tails, and four leg pivots per `behaviorState`.
- **Wildlife AI (`wildlife.ts`)**: Wild deer, boars, and rabbits cycle through `wandering`, `grazing`, `drinking` (seeking shallow water when thirsty), `resting`, `fleeing` (when threatened), `fighting` (boar retaliation), and `mating`, bounded away from deep water and inspectable in `AnimalInspector`.
- **Boat Migration (`migration.ts`)**: Incoming travelers arrive via physical `migrant_skiff` boats (`approaching -> docked -> disembarked -> returning`), walk onto the pier, and either join the village upon acceptance (or autonomous decision) or physically re-board and sail away when declined.

---

## 7. Governance, Reputation, Rules & Physical Banishment

- **Standing & Witnessed Misconduct (`governance.ts`)**: Villagers track `reputation` (`-100..+100`), `offenseCount`, and `contributionCount`. Misconduct incidents are observed **only** by the victim and witnesses within `WITNESS_RANGE` (`140u`); distant villagers remain unaware until told secondhand rumors (`rumorIncidentIds`).
- **Emergent Community Rules & Weighted Council Votes**: Repeated offenses trigger community rule adoption (e.g., `no_theft`, `fair_share`, `no_assault`, `protect_kin`, `shared_duty`). Open `DisputeCase` votes weigh firsthand witness certainty vs. rumor, personal bonds/partner loyalty, personality traits, and Chief influence (`1.5×`).
- **Physical Banishment**: Single minor offenses do not auto-banish, and close allies can sway a council toward reconciliation. Approved banishment assigns `'depart_banished'`, routing the villager to `getPierApproachPoint` (`0.89` dock vector inside the `< 0.94` walkable land rim) to board a departing skiff (`boardBanishmentSkiff`), physically removing them when the vessel leaves while preserving grief/resentment memories and recording the event in the Social Log.

---

## 8. Research Inspiration, Design Trade-Offs & Known Limitations

- **Research Foundations**:
  - *The Sims* autonomy & sentiment systems: multi-need utility scoring, hysteresis against task oscillation, relationship stages, and lasting event sentiments.
  - *Generative Agents* (Park et al., 2023): continuous observation, importance-ranked memory streams, social rumor spread, and plan-before-act validation — implemented deterministically without per-tick LLM calls so 8 islands simulate cleanly at 60 FPS and in headless tests.
- **Known Limitations**:
  - **Co-Op Room Persistence**: Multiplayer rooms live in server memory (`server.ts`) for live sessions; restarting the Node server clears active room state (solo worlds persist in `localStorage` and JSON export/import).
  - **Offline Catch-Up Model**: Solo browser background catch-up (`applyOfflineProgress`) uses a lightweight proportional resource summary for up to 30 minutes rather than fast-forwarding full individual villager cognition.
  - **Large-Scale Pathfinding Cache**: Main-world `checkTargetReachability` runs bounded grid A* (`48u` step on island bounds), while `steerMainWorldEntity` caches per-entity waypoint lists per obstacle-signature; very high villager counts (`50+`) moving simultaneously across cluttered terrain could still benefit from shared island flow-fields in future work.

---

## 9. Verification Suite

Run all pure simulation & integration tests via:
```bash
npx --yes tsx --test src/game/*.test.ts
```
Covers:
- `sandbox.test.ts` (Scenarios A–I + determinism)
- `navigation.test.ts` (terrain classification, A*, deep-water blocking, river fords, separation)
- `npcBrain.test.ts` (personality, 24-cap memories, awakening learning, pre-action validation, hysteresis, v9 save migration)
- `social.test.ts` (event bus deduplication, gradual introductions, quarrels, bonfire circles)
- `economy.test.ts` (finite depletion, carry haulage, staged construction, bed-gated housing)
- `wildlifeAndMigration.test.ts` (animal needs/drinking/fleeing, boat arrival/disembark/departure)
- `governance.test.ts` (witness-only observation, rumors, non-unanimous council votes, Scenario I physical banishment)
- `multiplayerSync.test.ts` (Scenario J: `1×` clock lock, sub-stepped 10 Hz ticks, cross-client state sync without duplicate events)
- `integration.test.ts` (Milestone 9: 10-minute / 600s main-world stability run, legacy v9 save migration, cross-island validation & simultaneous build queuing)
