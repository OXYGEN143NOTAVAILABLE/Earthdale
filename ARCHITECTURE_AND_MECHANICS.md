# Hearthglen — Living Architecture & Game Mechanics Guide

> **Maintenance Rule:** This document is the living technical specification for **Hearthglen**. Update the relevant sections immediately whenever any game rule, data schema, AI heuristic, multiplayer rule, camera control, or rendering pipeline changes.

---

## 1. High-Level Architecture

Hearthglen is a 3D floating-archipelago colony simulation and RTS built with **React 19 + TypeScript + Tailwind CSS v4 + Three.js** and backed by an **Express + WebSocket (`ws`)** server (`server.ts`) on port `3000`.

### Core Module Map

| Layer | File | Responsibility |
| :--- | :--- | :--- |
| **Multiplayer Server** | `server.ts` | Hosts Express + Vite middleware (dev) / static SPA (prod) and authoritative WebSocket rooms (`/ws`) at ~8–10 Hz. Assigns distinct home islands per player (`assignPlayerVillageInWorld`) and passes `actorPlayerId` to `applyWorldCommand`. |
| **Domain Types** | `src/game/types.ts` | Canonical TypeScript interfaces for `WorldState`, `HudSnapshot`, `VillagerEntity`, `BuildingEntity`, `VillageResources`, `ResourceFlowStats`, `VillagePolicy`, `LineageRecord`, `EntityStuckState`, `RoomPlayerPresence`, `WorldCommand`, and WebSocket messages. |
| **World Catalog & Traits** | `src/game/catalog.ts` | World dimensions (`4600 × 3100`), 8 distinct floating island definitions (`ISLAND_DEFS`), `PLAYER_VILLAGE_ISLANDS`, `getSocialTier`, unit traits & stats (`TRAITS`, `rollUnitStats`), skills (`SKILL_META`), genetic trait inheritance (`inheritBabyTraits`), and geometric helpers (`isPointInsideIsland`, `getIslandRimPoint`). |
| **Tech, Blueprints & Cultures** | `src/game/techAndCultures.ts` | 4-branch technology tree (`TECH_TREE`), building blueprints (`BUILDING_BLUEPRINTS`), crop/livestock metadata, culture profiles (`CULTURES`), and village custom definitions (`VILLAGE_CUSTOM_META`). |
| **Simulation Engine** | `src/game/simulation.ts` | Pure simulation tick (`stepSimulation`), per-island resource & flow accounting, Basic-Needs-First AI, population/shelter/food gating, perimeter parley & social tier rules, stuck-recovery steering (`steerEntity`), lineage archiving (`upsertLineage`), offline catch-up, and command handler (`applyWorldCommand`). |
| **Multiplayer Client** | `src/game/multiplayerClient.ts` | Browser WebSocket wrapper handling room creation, room joining, command dispatch, and cursor/focus presence updates. |
| **3D Terrain & Water** | `src/game/lowPolyWorld.ts` | Procedural terrain elevation (`groundHeightAtSim`), rivers, waterfalls, hot springs, plateau edge tapering, and floating island rock geometry. |
| **3D Models** | `src/game/lowPolyModels.ts` | Stylized low-poly 3D builders for villagers, infants, raiders, livestock, wild herds, boats, gliders, trees, boulders, ore veins, and structures. |
| **3D Renderer** | `src/game/lowPolyRenderer.ts` | Three.js `PerspectiveCamera` (`near = 0.25`, `far = 1650`), lighting, sky shader, water plane, entity animation interpolation, raycast hit-testing, and debug collision wireframes. |
| **Audio Engine** | `src/game/audio.ts` | Procedural Web Audio chimes, ambient wind/rain, and feedback tones. |
| **Root Application** | `src/App.tsx` | Lifecycle orchestration, Three.js mount, continuous WASD/Arrow + mouse/wheel camera controller, RTS box-selection, hotkeys, and per-player HUD snapshot syncing. |
| **UI Components** | `src/components/*.tsx` | `TitleScreen`, `TopBar`, `BottomControlDock`, `RealmLedger` (6 tabs: Build, Resources, Tech, Islands, Cultures, Lineage), `NpcInspector`, `AnimalInspector`, `ValleyMapDrawer`, `ClimateDrawer`, `DevToolsDrawer`, `ArrivalPrompt`, `PauseModal`. |

---

## 2. Game Modes & Village Ownership Model

Hearthglen supports three modes (`GameMode`), all sharing the 8-island floating archipelago where all islands are visually observable from above:

1. **`whisper_solo` (Default / Gentle God Mode)**
   - The solo player guides **one home village** (`world.localHomeIslandId`, defaulting to `'cradle'` / Cradle Isle) through gentle suggestions, divine encouragement, and placement stakes.
   - All other settled islands (`sunterrace`, `timbercrown`, `starbloom`, `coppercrag`, `mistatoll`, `ashenbastion`, `frostspire`) are controlled by autonomous AI NPC villages/clans with their own stockpiles, buildings, and population caps.
   - All villages start from basic founding conditions rather than pre-built metropolises and build up organically.

2. **`sovereign_sandbox` (RTS & Direct Control Mode)**
   - Players still own and command their **assigned village** (Cradle Isle in solo; a distinct assigned island per player in multiplayer).
   - Supports RTS box selection (`Shift+Left Drag` or `Box Select` toggle), combat drafting, `Hold Position`, `Move Here`, and right-click contextual orders (`Move`, `Attack`, `Gather`, `Build`) filtered strictly to `canControlVillager(world, v, actorPlayerId)`.
   - Unclaimed islands continue evolving independently as AI NPC villages.

3. **`shared_siege` (Co-Op Multi-Front Defense)**
   - In `shared_siege`, all connected players share command over the **Cradle Isle** homeland defense (`canControlVillager` allows shared command) while hostile sea/bastion raiding waves strike from multiple fronts.

### Multiplayer Island Assignment (`assignPlayerVillageInWorld`)
- In `server.ts`, the host receives `'cradle'` (or the first available settleable island), and each joining player is automatically assigned the next unclaimed settleable island in `PLAYER_VILLAGE_ISLANDS`:
  `['cradle', 'sunterrace', 'timbercrown', 'starbloom', 'coppercrag', 'mistatoll']`.
- Claiming an island promotes native residents on that island to the player's village (or spawns 2 founding villagers + starter food/timber/stone if uninhabited).
- Every `WorldCommand` executes through `applyWorldCommand(world, cmd, particles, actorPlayerId)`, rejecting attempts to build, upgrade, set policies, send caravans, or order units belonging to another player or an AI island.

---

## 3. Accurate Resource & Flow Economy

### Per-Island Stockpiles
- Every island maintains its own isolated stockpile in `world.villageResources[islandId]` (plus `world.villagePolicies[islandId]` and `world.resourceFlows[islandId]`).
- **Food Invariant (`syncCombinedFood`)**: `res.food` is always recomputed identically as:
  $$\text{food} = \text{berries} + \text{grain} + \text{meat} + \text{fish}$$
  Preventing drift between individual food stores and top-bar food totals.
- `HudSnapshot.resources` mirrors `world.villageResources[viewerHomeIslandId]` for the active player's village.

### Production, Consumption & Rolling Daily Flows
- Gains flow through `addVillageResource(world, islandId, key, amount)` and expenditures flow through `spendVillageResources(world, islandId, cost)`, both recording in `world.resourceFlows[islandId]` (`foodIn/foodOut`, `timberIn/timberOut`, `stoneIn/stoneOut`, `oreIn/oreOut`).
- Villager meals draw through `consumeFoodUnits(world, islandId, baseAmount)` prioritizing `grain -> berries -> fish -> meat`, scaled by the village's `rationMode`:
  - **`conserve`**: `0.5×` food cost, `+25` hunger, `-2` mood.
  - **`normal`**: `1.0×` food cost, `+34` hunger, `+1` mood.
  - **`feast`**: `1.5×` food cost, `+42` hunger, `+6` mood.
- **Supply / Gift Caravans (`send_caravan`)**: Players can transfer exact stockpiled materials from their home village to any other island, building diplomatic culture trust (`+8`).

---

## 4. Population Control & Birth / Arrival Gating

To eliminate unexplained population spikes, every island's population is strictly capped against **both** local shelter capacity and local food reserves:

- **Per-Island Shelter (`getHousingBedsForIsland`)**:
  - `lean_to`: `+2` beds (`+1` per upgrade level above 1)
  - `cottage`: `+3` beds (`+2` per upgrade level above 1)
- **Strict Growth Preconditions**:
  1. **Shelter headroom**: `getVillagePopulation(world, islandId) < getHousingBedsForIsland(world, islandId)`
  2. **Food surplus buffer**: `getVillageRes(world, islandId).food >= pop * 6 + 6`
  3. **Couple cooldowns**: Partners require bond `>= 72`, `birthCooldownDays = 8` (and adults aged under `60`), capping household size safely.
  4. **Traveler cadence**: `nextTravelerTimer = 300 + rand * 160` seconds, and arrivals still respect home island bed/food capacity before joining.

---

## 5. Basic-Needs-First Automated Village AI

Both autonomous player villages (`whisper_solo` / free-will mode) and AI NPC villages follow `pickNextAutonomousBuilding` and `pickAutonomousTask` in strict survival priority:

1. **Tier 1 — Hearth & Food Security**
   - Ensure a `bonfire` exists (`fire`).
   - If `res.food < Math.max(8, pop * 6)` or no `farm_plot` exists yet, prioritize foraging (`forage`), hunting (`hunt`), fishing (`fish`), farming (`farm`), or constructing a `farm_plot` before any non-essential project.
2. **Tier 2 — Housing / Shelter Before Industry**
   - Compute available headroom (`beds - pop`). Whenever `pop >= beds` or `beds - pop < 1`, prioritize building or upgrading `lean_to` / `cottage` ahead of workshops, quarries, libraries, or smelteries.
3. **Tier 3 — Crafts, Defense, Trade & Exploration**
   - Only when `food >= pop * 6` AND `beds > pop` do villages expand into `workshop`, `herbalist`, `lumber_camp`, `quarry`, `smeltery`, `watchtower`, `library`, `granary`, `pasture`, `dock`, or inter-island expeditions.

---

## 6. Social Relationships & Outside-First Border Mechanics

### 7-Tier Relationship Scale (`getSocialTier`)
| Score Range | Tier ID | Display Label |
| :--- | :--- | :--- |
| `< 15` | `rival` | Rival |
| `15 – 27` | `stranger` | Stranger |
| `28 – 44` | `acquaintance` | Acquaintance |
| `45 – 61` | `guest` | Guest |
| `62 – 77` | `friend` | Friend |
| `78 – 89` | `confidant` | Confidant |
| `90+` | `bonded` | Bonded Kin |

### Outside-First Foreign Perimeter Protocol (`tickForeignPerimeterAndParley`)
- When any villager arrives on a foreign island (`v.islandId !== v.homeIslandId`), unless owned by the same player or in `shared_siege`, they cannot walk straight into the village core:
  1. **`at_perimeter`**: Halts in the outer ring (`nd ~ 0.66..0.74`) and emits a warm amber selection ring.
  2. **`parleying`**: A local resident approaches the perimeter to greet and evaluate:
     - Host island's `borderPolicy` (`closed`, `parley`, `open_trade`, `allied`)
     - Inter-culture `diplomacy.trust`
     - Personal social relationship score (`getSocialTier`)
  3. **`admitted` or `denied`**:
     - `closed` (or war status) denies entry and instructs them to depart back home.
     - `allied` or `open_trade` with high trust admits directly after greeting.
     - `parley` evaluates trust + interpersonal bond; admitted guests may interact/trade peacefully.

### Calm Social Throttling
- Passive proximity conversations no longer fire continuously whenever units pass near each other:
  - Minimum `socialCooldown = 42 + rand * 22` seconds globally per villager.
  - Per-pair cooldown `pairChatCooldowns[peerId] = 75` seconds.
  - Proximity radius `36` units; suppressed during `fighting`, `hunting`, `building`, `sleeping`, or `hunger < 30`.

---

## 7. Pathfinding & Stuck-Avoidance (`steerEntity`)

Every moving agent (`villagers`, `clanVillagers`, `raiders`, `wildHerds`) navigates via `steerEntity(entity, tx, ty, speed, dt, obstacles, stuckState)`:
- Detects low displacement (`< 1.8` world units over `0.85s`) in `stuckState`.
- Rotates the heading vector by `±75°` detour around obstacles (`buildings`, `trees`, `boulders`, `ore veins`), alternating `detourSign` (`+1` / `-1`) if blocked again, and gently nudges outward from tight obstacle overlaps so villagers do not freeze against trees or huts.

---

## 8. Camera Movement, Zoom & Controls

### Camera Bounds (`lowPolyRenderer.ts` & `App.tsx`)
- **Zoom range**: `0.06` (archipelago-wide macro overview) to `3.2` (close ground-level detail inspection).
- **Orbit Radius**: `max(5.5, 48.2 / zoom)` with Three.js `PerspectiveCamera` near plane at `0.25` (no near-clipping when zoomed in tightly).
- **Pitch range**: `0.22` rad (low dramatic horizon angle) to `1.38` rad (near top-down tactical view).

### Input Bindings
| Input | Action |
| :--- | :--- |
| **`W A S D` / Arrow Keys** (+ `Shift` 2×) | Continuous camera-relative horizontal panning across the archipelago |
| **Mouse Wheel** or **`+` / `-`** or Dock buttons | Smooth multiplicative zoom (`0.06` to `3.2`) |
| **Right-Click Drag / Middle-Click Drag** or **`Q` / `E`** | Orbit camera yaw and pitch |
| **Left-Click Drag** | Pan world |
| **`[` / `]`** or **`Tab` / `Shift+Tab`** | Cycle through your village's residents |
| **`X`** | Return selected villager to `Free Will` |
| **`0` / `Home`** | Reset camera focus to your assigned home village |
| **`Space`** | Pause / Resume simulation speed |
| **`B` / `L`**, **`G`**, **`C`** | Toggle Realm Ledger, Archipelago Map, Sky & Season Almanac |
| **`T` / `P` / `F` / `Shift+E`** | Talk / Praise / Remind Meal / Encourage Explore |
| **`Shift+Left Drag`** (Sovereign / Siege) | RTS box marquee selection of owned units |
| **Right-Click** (Sovereign / Siege) | Contextual Move / Attack / Gather / Build order |

---

## 9. Generational Family Lineage Tree

- `world.lineage: Record<string, LineageRecord>` records every villager from birth/founding onward via `upsertLineage(world, villager, deathCause)`.
- When a villager dies (`killVillager`), their `LineageRecord` persists permanently with `alive: false`, `deathDay`, `deathCause`, `parents`, `partnerId`, `childrenIds`, `traits`, and `generation`.
- Parents maintain `childrenIds`, and children record `parentIds` and `generation = max(parent1.gen, parent2.gen) + 1`.
- Inspect the complete family tree anytime in **Realm Ledger → Lineage**, filterable between **All Realm** and your **Home Village**.
