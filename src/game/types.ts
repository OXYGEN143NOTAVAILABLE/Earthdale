export type GamePhase = 'TITLE_MENU' | 'PLAYING' | 'PAUSED';

export type GameMode = 'whisper_solo' | 'sovereign_sandbox';

export type WeatherType = 'clear' | 'rain' | 'breeze' | 'snow' | 'mist';

export type SeasonType = 'spring' | 'summer' | 'autumn' | 'winter';

export type TimePreset = 'dawn' | 'day' | 'golden' | 'dusk' | 'night';

export type IslandId =
  | 'cradle'
  | 'timbercrown'
  | 'sunterrace'
  | 'coppercrag'
  | 'mistatoll'
  | 'starbloom'
  | 'embervault'
  | 'frostpeak';

export type CultureId = 'hearthfolk' | 'sylvan' | 'cragforge' | 'mist_mariner' | 'ashen_raider';

export type ArchStyle = 'timber_thatch' | 'sylvan_stilt' | 'crag_bastion' | 'mariner_driftwood';

export type IslandBiome = 'meadow' | 'pine' | 'terrace' | 'crag' | 'mist_atoll' | 'ruins' | 'volcanic' | 'frost';

export type VillageCustomId =
  | 'nightly_hearth_circle'
  | 'ember_storytelling'
  | 'cliff_lookout_chant'
  | 'dawn_forage_song'
  | 'harvest_feast_table'
  | 'pasture_shepherd_tune'
  | 'forge_drum_rhythm'
  | 'sea_lantern_vigil';

export interface VillageCultureProfile {
  islandId: IslandId;
  cultureId: CultureId;
  ethosTitle: string;
  motto: string;
  traditionLevel: number;
  ritualPoints: number;
  nightlyGatherings: number;
  customs: VillageCustomId[];
  lastRitualDay: number;
}

export type TaskType =
  | 'forage'
  | 'chop'
  | 'quarry'
  | 'farm'
  | 'pasture'
  | 'hunt'
  | 'fish'
  | 'bake'
  | 'study'
  | 'smelt'
  | 'guard'
  | 'explore';

export type LifeStage = 'infant' | 'child' | 'adult' | 'elder';

export type ComfortItem = 'bread' | 'tea' | 'honey';

export type VillagerWishType = 'tea' | 'bread' | 'honey' | 'hotspring' | 'chat' | 'explore';

export type CognitiveStage = 'awakening' | 'observing' | 'experimenting' | 'reasoning' | 'enlightened';

export interface VillagerCognition {
  stage: CognitiveStage;
  awareness: number; // 0..100 cognitive maturity
  observedConcepts: string[];
  socialCount: number;
  focusObject: string | null;
}

export type LandmarkKind =
  | 'cliff_boulder'
  | 'monolith'
  | 'reed_clump'
  | 'driftwood'
  | 'sky_islet'
  | 'ruin_cairn'
  | 'crystal_spire';

export interface WorldLandmark {
  id: string;
  islandId: IslandId | 'sea';
  kind: LandmarkKind;
  x: number;
  y: number;
  scale: number;
  rotY: number;
}

export type VillagerActivityState =
  | 'working'
  | 'walking'
  | 'building'
  | 'resting'
  | 'eating'
  | 'playing'
  | 'socializing'
  | 'sheltering'
  | 'sleeping'
  | 'soaking'
  | 'hunting'
  | 'exploring'
  | 'inspecting'
  | 'sailing'
  | 'gliding'
  | 'gondola'
  | 'fighting'
  | 'festival';

export type ChiefFocus = 'balanced' | 'harvest' | 'craft' | 'explore' | 'defense';

export type BuildingType =
  | 'bonfire'
  | 'lean_to'
  | 'cottage'
  | 'woodshop'
  | 'quarry'
  | 'farm_plot'
  | 'pasture'
  | 'bakery'
  | 'library'
  | 'smeltery'
  | 'dock'
  | 'glider_pad'
  | 'watchtower'
  | 'barracks';

export type CropType = 'turnip' | 'wheat' | 'flax' | 'herbs' | 'orchard';

export type LivestockKind = 'sheep' | 'pig' | 'fowl';

export type WildHerdKind = 'rabbit' | 'deer' | 'boar';

export type BoatKind = 'fishing_skiff' | 'cargo_merchant' | 'war_galley';

export type WeaponType = 'none' | 'flint_spear' | 'bow' | 'bronze_blade' | 'iron_blade';

export type GearTier = 0 | 1 | 2 | 3; // 0: bare wraps, 1: dyed tunic, 2: wool cloak, 3: bronze/iron armor

export type DiplomaticStatus = 'unknown' | 'peaceful' | 'wary' | 'tense' | 'war';

export type FpsCap = 15 | 30 | 60;

export type VillageEra = 1 | 2 | 3 | 4;

export type VillageTrajectory = 'flourishing' | 'steady' | 'strained' | 'ruin_risk' | 'ruined';

export type GodCommentKind = 'praise' | 'encourage_explore' | 'remind_eat' | 'remind_rest';

export type DeathCause = 'starvation' | 'freezing' | 'boar' | 'shipwreck' | 'combat' | 'old_age';

export type TechBranch =
  | 'hearth_shelter'
  | 'botany_pastures'
  | 'maritime_bridges'
  | 'metallurgy_war';

export interface VillageResources {
  food: number; // combined grain, berries, meat, fish
  berries: number;
  grain: number;
  meat: number;
  fish: number;
  timber: number;
  stone: number;
  copper: number;
  bronze: number;
  iron: number;
  wool: number;
  hides: number;
  herbs: number;
  hearthlight: number;
}

export interface ComfortStock {
  bread: number;
  tea: number;
  honey: number;
}

export interface TraitDefinition {
  id: string;
  name: string;
  polarity: 'positive' | 'negative';
  summary: string;
  workSpeedMult: number;
  moodDrift: number;
  energyDrainMult: number;
  obedienceMod: number;
  curiosityMod?: number;
  braveryMod?: number;
  rainSensitive?: boolean;
  nightLoving?: boolean;
  morningGrumpy?: boolean;
  socialAura?: number;
}

export interface CultureDefinition {
  id: CultureId;
  name: string;
  bannerColor: string;
  accentColor: string;
  roofColor: string;
  sailColor: string;
  archStyle: ArchStyle;
  summary: string;
  bonusLabel: string;
}

export interface TechNode {
  id: string;
  name: string;
  branch: TechBranch;
  era: VillageEra;
  costXp: number;
  prereqs: string[];
  summary: string;
  unlocksLabel: string;
}

export interface IslandDef {
  id: IslandId;
  name: string;
  subtitle: string;
  biome: IslandBiome;
  roleTag: 'homeland' | 'timber' | 'harvest' | 'forge' | 'harbor' | 'exploration' | 'battle' | 'alpine';
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  elevationY: number; // 3D Y plateau base above sky-sea (y=0)
  defaultCultureId: CultureId;
  hasSpring: boolean;
  springOffset?: { dx: number; dy: number };
  hasWaterfall: boolean;
  waterfallAngle?: number;
  dockSpot: { x: number; y: number; seaX: number; seaY: number };
  oreRichness: 'none' | 'stone' | 'rich_metals';
  soilQuality: number;
}

export interface IslandState {
  id: IslandId;
  discovered: boolean;
  owningCultureId: CultureId;
  dockBuilt: boolean;
  settledDay: number | null;
}

export interface SkyBridgeEntity {
  id: string;
  name: string;
  fromIsland: IslandId;
  toIsland: IslandId;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  built: boolean;
  progress: number;
  tier: 1 | 2;
  requiredTechId: string;
  costTimber: number;
  costStone: number;
}

export interface SkyCablewayEntity {
  id: string;
  name: string;
  fromIsland: IslandId;
  toIsland: IslandId;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  built: boolean;
  progress: number;
  requiredTechId: string;
  costTimber: number;
  costStone: number;
  costIron: number;
  gondolaT: number; // 0..1 along cable
  gondolaDir: 1 | -1;
  passengerIds: string[];
}

export interface AirGliderEntity {
  id: string;
  villagerId: string;
  fromIsland: IslandId;
  toIsland: IslandId;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number; // 0..1
  x: number;
  y: number;
  altitudeBoost: number;
  yaw: number;
  wingColor: string;
}

export interface ExploreRuinEntity {
  id: string;
  name: string;
  islandId: IslandId;
  kind: 'sun_obelisk' | 'star_observatory' | 'frost_shrine' | 'ashen_vault' | 'cedar_totem';
  x: number;
  y: number;
  exploredCount: number;
  cooldownTimer: number;
  lootLabel: string;
  guardianThreat: boolean;
}

export interface ProjectileFx {
  id: string;
  kind: 'arrow' | 'ember_bolt';
  fromX: number;
  fromY: number;
  fromElev: number;
  toX: number;
  toY: number;
  toElev: number;
  progress: number; // 0..1
  duration: number;
}

export interface WildNodeEntity {
  id: string;
  islandId: IslandId;
  kind: 'berry_bush' | 'flint_pile' | 'branch_pile' | 'copper_vein' | 'iron_vein' | 'tree';
  x: number;
  y: number;
  amount: number;
  maxAmount: number;
  variant?: 'pine' | 'oak' | 'orchard' | 'cedar';
  scale?: number;
}

export interface VillagerEntity {
  id: string;
  name: string;
  bioDescription: string;
  cultureId: CultureId;
  islandId: IslandId;
  isStranger?: boolean; // hostile or wary outsider clan member
  isNativeClan?: boolean; // native inhabitant belonging to another island village
  cloakColor: string;
  hairColor: string;
  skinTone: string;
  hairStyle: number;
  lifeStage: LifeStage;
  ageDays: number;
  isChief: boolean;
  traits: string[];
  partnerId: string | null;
  parentIds: [string, string] | null;
  childrenIds: string[];
  homeBuildingId: string | null;

  // Survival, combat & aesthetics
  hp: number;
  maxHp: number;
  warmth: number;
  mood: number;
  energy: number;
  hunger: number;
  affectionXp: number;
  affectionLevel: number;
  gearTier: GearTier;
  weaponType: WeaponType;
  curiosity: number; // 0..1 autonomous urge to explore & sail
  bravery: number; // 0..1 willingness to hunt boars & defend
  voyageBoatId: string | null;
  transitGliderId?: string | null;
  transitCableId?: string | null;
  killCount: number;
  cognition: VillagerCognition;

  favoriteComfort: ComfortItem;
  activeWish: VillagerWishType;
  wishFulfilledToday: boolean;
  currentDialogue: string;
  lastMemory: string;
  relationships: Record<string, number>;
  hangOutTargetId: string | null;
  socialCooldown: number;

  suggestedTask: TaskType | null;
  activeTask: TaskType;
  state: VillagerActivityState;
  autonomyReason: string;
  thoughtBubble: string | null;
  thoughtTimer: number;

  x: number;
  y: number;
  targetX: number;
  targetY: number;
  facing: 1 | -1;
  animPhase: number;
  bounceScale: number;
  decisionCooldown: number;
  birthCooldownDays: number;
  attackCooldown: number;
  edgeAckCooldown?: number;
}

export interface CropPlotState {
  cropType: CropType;
  growth: number; // 0..1 (stage 0..3)
  fertility: number; // 0..1
  irrigated: boolean;
}

export interface BuildingEntity {
  id: string;
  type: BuildingType;
  name: string;
  islandId: IslandId;
  cultureId: CultureId;
  description: string;
  level: number;
  maxLevel: number;
  x: number;
  y: number;
  unlocked: boolean;
  disrepair: number;
  hp: number;
  maxHp: number;
  housingCapacity: number;
  baseCost: Partial<VillageResources>;
  benefitDescription: string;
  cropState?: CropPlotState;
  livestockKind?: LivestockKind;
}

export interface ConstructionProject {
  buildingId: string;
  builderId: string;
  progress: number;
  duration: number;
  isUpgrade: boolean;
}

export interface PlacedSuggestion {
  id: string;
  buildingType: BuildingType;
  islandId: IslandId;
  x: number;
  y: number;
  cropType?: CropType;
  livestockKind?: LivestockKind;
  createdAtDay: number;
  acceptedByVillagers: boolean;
}

export interface LivestockEntity {
  id: string;
  kind: LivestockKind;
  islandId: IslandId;
  pastureId: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  facing: 1 | -1;
  pauseTimer: number;
  yieldTimer: number;
  color: string;
}

export interface WildHerdEntity {
  id: string;
  kind: WildHerdKind;
  islandId: IslandId;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  facing: 1 | -1;
  pauseTimer: number;
  hp: number;
  maxHp: number;
  aggroTargetId: string | null;
  color: string;
}

export interface BoatEntity {
  id: string;
  name: string;
  kind: BoatKind;
  cultureId: CultureId;
  homeIslandId: IslandId;
  targetIslandId: IslandId;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  yaw: number;
  hp: number;
  maxHp: number;
  state: 'docked' | 'sailing' | 'fishing' | 'raiding' | 'returning';
  cargoText: string;
  passengerIds: string[];
  tripTimer: number;
}

export interface MemorialStone {
  id: string;
  villagerName: string;
  islandId: IslandId;
  x: number;
  y: number;
  dayDied: number;
  cause: DeathCause;
  epitaph: string;
}

export interface CultureDiplomacy {
  cultureId: CultureId;
  trust: number; // 0..100
  status: DiplomaticStatus;
  grievances: string[];
  lastEnvoyDay: number;
  raidTimer: number;
}

export type TravelerAttitude = 'warm' | 'humble' | 'boisterous' | 'aloof' | 'restless';

export interface ArrivalCandidate {
  id: string;
  kind: 'traveler' | 'birth';
  name: string;
  bioDescription: string;
  lifeStage: LifeStage;
  cloakColor: string;
  hairColor: string;
  skinTone: string;
  hairStyle: number;
  traits: string[];
  attitude: TravelerAttitude;
  greetingLine: string;
  greeterId: string | null;
  greeterName: string | null;
  deliberationTimer: number;
  decisionVerdict: 'talking' | 'recommend_welcome' | 'recommend_decline';
  decisionReason: string | null;
  godSuggestion: 'neutral' | 'welcome' | 'decline';
  favoriteComfort: ComfortItem;
  parentIds: [string, string] | null;
  parentNames: string | null;
  arrivedDay: number;
}

export interface ChronicleEntry {
  id: string;
  day: number;
  text: string;
  kind: 'birth' | 'arrival' | 'chief' | 'build' | 'bond' | 'era' | 'festival' | 'ruin' | 'tech' | 'voyage' | 'war' | 'death';
}

export interface AspirationItem {
  id: string;
  title: string;
  rewardHearthlight: number;
  completed: boolean;
}

export interface EnvironmentState {
  timeOfDay: number;
  timeMode: 'cycle' | 'locked';
  cycleSpeedSeconds: number;
  weather: WeatherType;
  weatherMode: 'dynamic' | 'manual';
  weatherTimer: number;
  season: SeasonType;
  seasonDay: number;
  dayCount: number;
  festivalActive: boolean;
}

export interface SettingsState {
  fpsCap: FpsCap;
  simSpeed: 0 | 1 | 2 | 3;
  muted: boolean;
  volume: number;
  autoProgress: boolean;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number; // 0.09 (All Islands Overview) .. 1.55 (Detail)
  followVillagerId: string | null;
  focusIslandId: IslandId | 'all';
}

export interface Particle {
  active: boolean;
  kind: 'heart' | 'rain' | 'snow' | 'leaf' | 'smoke' | 'sparkle' | 'firefly' | 'steam' | 'lantern' | 'splash' | 'blood';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  alpha: number;
  phase: number;
  color: string;
}

export interface WorldState {
  version: number;
  gameMode: GameMode;
  era: VillageEra;
  resources: VillageResources;
  comforts: ComfortStock;
  knowledgeXp: number;
  unlockedTechIds: string[];
  activeTechId: string | null;

  islands: Record<IslandId, IslandState>;
  villageCultures: Record<IslandId, VillageCultureProfile>;
  bridges: SkyBridgeEntity[];
  cableways: SkyCablewayEntity[];
  gliders: AirGliderEntity[];
  exploreRuins: ExploreRuinEntity[];
  projectiles: ProjectileFx[];
  wildNodes: WildNodeEntity[];
  villagers: VillagerEntity[];
  clanVillagers: VillagerEntity[]; // Native inhabitants on outer villages
  raiders: VillagerEntity[]; // Hostile raiders & bastion defenders
  buildings: BuildingEntity[];
  placedSuggestions: PlacedSuggestion[];
  livestock: LivestockEntity[];
  wildHerds: WildHerdEntity[];
  boats: BoatEntity[];
  memorials: MemorialStone[];
  diplomacy: Record<CultureId, CultureDiplomacy>;

  pendingArrivals: ArrivalCandidate[];
  chronicle: ChronicleEntry[];
  completedAspirations: string[];
  chiefId: string | null;
  chiefFocus: ChiefFocus;
  environment: EnvironmentState;
  settings: SettingsState;
  lastTickTimestamp: number;
  nextTravelerTimer: number;
  activeConstruction: ConstructionProject | null;
  suggestedBuildingId: string | null;
  autoBuildTimer: number;
  autoWelcomeTimer: number;

  prosperityScore: number;
  villageTrajectory: VillageTrajectory;
  trajectoryReasons: string[];
  ruinDaysCount: number;
  departedCount: number;
  deathCount: number;
  catX: number;
  catY: number;
  catTargetX: number;
  catTargetY: number;
  catFacing: 1 | -1;
  catPauseTimer: number;
}

export interface HudSnapshot {
  gameMode: GameMode;
  era: VillageEra;
  resources: VillageResources;
  comforts: ComfortStock;
  knowledgeXp: number;
  unlockedTechIds: string[];
  activeTechId: string | null;
  islands: Record<IslandId, IslandState>;
  villageCultures: Record<IslandId, VillageCultureProfile>;
  bridges: SkyBridgeEntity[];
  cableways: SkyCablewayEntity[];
  gliders: AirGliderEntity[];
  exploreRuins: ExploreRuinEntity[];
  villagers: VillagerEntity[];
  clanVillagers: VillagerEntity[];
  raiders: VillagerEntity[];
  buildings: BuildingEntity[];
  placedSuggestions: PlacedSuggestion[];
  livestock: LivestockEntity[];
  wildHerds: WildHerdEntity[];
  boats: BoatEntity[];
  memorials: MemorialStone[];
  diplomacy: Record<CultureId, CultureDiplomacy>;
  pendingArrivals: ArrivalCandidate[];
  chronicle: ChronicleEntry[];
  aspirations: AspirationItem[];
  chiefId: string | null;
  chiefFocus: ChiefFocus;
  environment: EnvironmentState;
  totalHousingBeds: number;
  populationCount: number;
  activeConstruction: ConstructionProject | null;
  suggestedBuildingId: string | null;
  prosperityScore: number;
  villageTrajectory: VillageTrajectory;
  trajectoryReasons: string[];
  ruinDaysCount: number;
  departedCount: number;
  deathCount: number;
}

export interface RoomPlayerPresence {
  id: string;
  name: string;
  color: string;
  focusIslandId: IslandId | 'all';
  cursorSimX: number;
  cursorSimY: number;
  isHost: boolean;
}

export type WorldCommand =
  | { kind: 'set_speed'; speed: 0 | 1 | 2 | 3 }
  | { kind: 'assign_task'; villagerId: string; task: TaskType | null }
  | { kind: 'move_villager'; villagerId: string; islandId: IslandId; x: number; y: number }
  | { kind: 'god_comment'; villagerId: string; comment: GodCommentKind }
  | { kind: 'chat_villager'; villagerId: string }
  | { kind: 'hang_out'; villagerId: string; targetId: string }
  | { kind: 'set_chief'; villagerId: string }
  | { kind: 'set_chief_focus'; focus: ChiefFocus }
  | { kind: 'place_building'; buildingType: BuildingType; islandId: IslandId; x: number; y: number; cropType?: CropType; livestockKind?: LivestockKind }
  | { kind: 'upgrade_building'; buildingId: string }
  | { kind: 'select_tech'; techId: string }
  | { kind: 'diplomacy'; cultureId: CultureId; action: 'envoy' | 'gift' | 'trust_delta'; delta?: number }
  | { kind: 'resolve_arrival'; arrivalId: string; accept?: boolean }
  | { kind: 'suggest_gate'; arrivalId: string; lean: 'welcome' | 'decline' | 'neutral' }
  | { kind: 'sovereign_weather'; weather: WeatherType }
  | { kind: 'sovereign_time'; timeOfDay: number }
  | { kind: 'sovereign_season'; season: SeasonType }
  | { kind: 'sovereign_festival' }
  | { kind: 'sovereign_grant_resources' }
  | { kind: 'sovereign_spawn_villager'; islandId: IslandId }
  | { kind: 'sovereign_build_bridge'; bridgeId: string }
  | { kind: 'sovereign_build_cableway'; cableId: string }
  | { kind: 'sovereign_uplift_villager'; villagerId: string }
  | { kind: 'sovereign_unlock_all_tech' };

export type ClientWsMsg =
  | { type: 'create_room'; playerName: string; playerColor: string; gameMode: GameMode }
  | { type: 'join_room'; roomCode: string; playerName: string; playerColor: string }
  | { type: 'command'; cmd: WorldCommand }
  | { type: 'presence'; focusIslandId: IslandId | 'all'; cursorSimX: number; cursorSimY: number };

export type ServerWsMsg =
  | { type: 'room_joined'; roomCode: string; playerId: string; players: RoomPlayerPresence[]; world: WorldState }
  | { type: 'world_state'; world: WorldState; players: RoomPlayerPresence[] }
  | { type: 'players'; players: RoomPlayerPresence[] }
  | { type: 'toast'; message: string; ok: boolean }
  | { type: 'error'; message: string };

