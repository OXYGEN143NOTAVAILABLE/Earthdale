import { BUILDING_BLUEPRINTS, TECH_BY_ID } from './techAndCultures';
import type {
  ArrivalCandidate,
  BuildingEntity,
  ChiefFocus,
  ComfortItem,
  IslandDef,
  IslandId,
  LifeStage,
  SeasonType,
  SkyBridgeEntity,
  SkyCablewayEntity,
  TaskType,
  TimePreset,
  TraitDefinition,
  TravelerAttitude,
  VillageEra,
  VillageResources,
  VillagerWishType,
  WeatherType,
} from './types';

export const WORLD_WIDTH = 7600;
export const WORLD_HEIGHT = 5200;
export const WORLD_SCALE = 0.085; // 7600x5200 -> 646x442 3D world units
export const CURRENT_WORLD_VERSION = 7;

export function islandCoastWobble(def: IslandDef, angleRad: number): number {
  return (
    1 +
    Math.sin(angleRad * 5 + def.centerX * 0.01) * 0.06 +
    Math.cos(angleRad * 3 - def.centerY * 0.01) * 0.04
  );
}

export function getIslandRimPoint(
  def: IslandDef,
  angleRad: number,
  radiusFraction = 0.96,
): { x: number; y: number } {
  const wobble = islandCoastWobble(def, angleRad) * radiusFraction;
  return {
    x: Math.round(def.centerX + Math.cos(angleRad) * def.radiusX * wobble),
    y: Math.round(def.centerY + Math.sin(angleRad) * def.radiusY * wobble),
  };
}

function createDockSpot(def: Omit<IslandDef, 'dockSpot'>, angleRad: number): IslandDef['dockSpot'] {
  const wobble =
    1 +
    Math.sin(angleRad * 5 + def.centerX * 0.01) * 0.06 +
    Math.cos(angleRad * 3 - def.centerY * 0.01) * 0.04;
  const rx = def.radiusX * wobble;
  const ry = def.radiusY * wobble;
  return {
    x: Math.round(def.centerX + Math.cos(angleRad) * rx * 0.95),
    y: Math.round(def.centerY + Math.sin(angleRad) * ry * 0.95),
    seaX: Math.round(def.centerX + Math.cos(angleRad) * (rx + 170)),
    seaY: Math.round(def.centerY + Math.sin(angleRad) * (ry + 170)),
  };
}

function makeIsland(
  spec: Omit<IslandDef, 'dockSpot'>,
  dockAngleRad: number,
): IslandDef {
  return {
    ...spec,
    dockSpot: createDockSpot(spec, dockAngleRad),
  };
}

export const ISLAND_DEFS: Record<IslandId, IslandDef> = {
  cradle: makeIsland(
    {
      id: 'cradle',
      name: 'Cradle Isle',
      subtitle: 'Sunlit meadow basin with mossy spring, wild berries, flint & rising northern bluff.',
      biome: 'meadow',
      roleTag: 'homeland',
      centerX: 2950,
      centerY: 2780,
      radiusX: 780,
      radiusY: 530,
      elevationY: 0.75,
      defaultCultureId: 'hearthfolk',
      hasSpring: true,
      springOffset: { dx: -245, dy: -145 },
      hasWaterfall: false,
      oreRichness: 'stone',
      soilQuality: 0.95,
    },
    0.18,
  ),
  timbercrown: makeIsland(
    {
      id: 'timbercrown',
      name: 'Timbercrown Ridge',
      subtitle: 'Highland stepped cedar plateau & granite escarpment home to the Cedarwood Sylvans.',
      biome: 'pine',
      roleTag: 'timber',
      centerX: 1420,
      centerY: 1820,
      radiusX: 720,
      radiusY: 490,
      elevationY: 5.6,
      defaultCultureId: 'sylvan',
      hasSpring: true,
      springOffset: { dx: 185, dy: 125 },
      hasWaterfall: true,
      waterfallAngle: 0.72,
      oreRichness: 'stone',
      soilQuality: 0.85,
    },
    2.82,
  ),
  sunterrace: makeIsland(
    {
      id: 'sunterrace',
      name: 'Sun-Terrace Isle',
      subtitle: 'Three stepped golden loam terraces built for lush crops, pastures & apple orchards.',
      biome: 'terrace',
      roleTag: 'harvest',
      centerX: 4560,
      centerY: 3600,
      radiusX: 800,
      radiusY: 540,
      elevationY: 1.0,
      defaultCultureId: 'hearthfolk',
      hasSpring: true,
      springOffset: { dx: -185, dy: 145 },
      hasWaterfall: false,
      oreRichness: 'none',
      soilQuality: 1.25,
    },
    -0.42,
  ),
  coppercrag: makeIsland(
    {
      id: 'coppercrag',
      name: 'Copper-Crag Spire',
      subtitle: 'Towering basalt caldera & mineral crags settled by the Cragforge Smiths.',
      biome: 'crag',
      roleTag: 'forge',
      centerX: 4180,
      centerY: 1340,
      radiusX: 690,
      radiusY: 470,
      elevationY: 6.6,
      defaultCultureId: 'cragforge',
      hasSpring: false,
      hasWaterfall: true,
      waterfallAngle: 1.56,
      oreRichness: 'rich_metals',
      soilQuality: 0.55,
    },
    1.57,
  ),
  mistatoll: makeIsland(
    {
      id: 'mistatoll',
      name: 'Outer Mist Atoll',
      subtitle: 'Crescent sea-cliff lagoon & mist harbor guarded by the Mist Mariners.',
      biome: 'mist_atoll',
      roleTag: 'harbor',
      centerX: 5960,
      centerY: 2660,
      radiusX: 660,
      radiusY: 475,
      elevationY: 0.65,
      defaultCultureId: 'mist_mariner',
      hasSpring: true,
      springOffset: { dx: 150, dy: -110 },
      hasWaterfall: false,
      oreRichness: 'stone',
      soilQuality: 0.8,
    },
    3.1,
  ),
  starbloom: makeIsland(
    {
      id: 'starbloom',
      name: 'Starbloom Ruins',
      subtitle: 'Jade-meadow exploration sanctuary dotted with ancient starlight obelisks, orchards & healing springs.',
      biome: 'ruins',
      roleTag: 'exploration',
      centerX: 1460,
      centerY: 3960,
      radiusX: 700,
      radiusY: 490,
      elevationY: 1.85,
      defaultCultureId: 'hearthfolk',
      hasSpring: true,
      springOffset: { dx: -140, dy: 90 },
      hasWaterfall: true,
      waterfallAngle: 2.35,
      oreRichness: 'stone',
      soilQuality: 1.15,
    },
    0.1,
  ),
  embervault: makeIsland(
    {
      id: 'embervault',
      name: 'Ashen Bastion',
      subtitle: 'Scorched volcanic fortress holding rich iron vaults—guarded by the hostile Ashen Bastion raiders.',
      biome: 'volcanic',
      roleTag: 'battle',
      centerX: 6140,
      centerY: 1080,
      radiusX: 720,
      radiusY: 500,
      elevationY: 4.4,
      defaultCultureId: 'ashen_raider',
      hasSpring: false,
      hasWaterfall: false,
      oreRichness: 'rich_metals',
      soilQuality: 0.45,
    },
    1.75,
  ),
  frostpeak: makeIsland(
    {
      id: 'frostpeak',
      name: 'Frostpeak Glacier',
      subtitle: 'High alpine spire of snow-laden cedars, deep iron veins, and a frozen Star-Shrine.',
      biome: 'frost',
      roleTag: 'alpine',
      centerX: 2320,
      centerY: 860,
      radiusX: 640,
      radiusY: 440,
      elevationY: 8.4,
      defaultCultureId: 'cragforge',
      hasSpring: true,
      springOffset: { dx: 120, dy: 80 },
      hasWaterfall: true,
      waterfallAngle: 1.95,
      oreRichness: 'rich_metals',
      soilQuality: 0.4,
    },
    1.22,
  ),
};

export const ISLAND_ORDER: IslandId[] = [
  'cradle',
  'timbercrown',
  'sunterrace',
  'coppercrag',
  'mistatoll',
  'starbloom',
  'embervault',
  'frostpeak',
];

function createBridgeSpec(
  id: string,
  name: string,
  fromIsland: IslandId,
  toIsland: IslandId,
  tier: 1 | 2,
  requiredTechId: string,
  costTimber: number,
  costStone: number,
): SkyBridgeEntity {
  const fromDef = ISLAND_DEFS[fromIsland];
  const toDef = ISLAND_DEFS[toIsland];
  const ang = Math.atan2(toDef.centerY - fromDef.centerY, toDef.centerX - fromDef.centerX);
  const p1 = getIslandRimPoint(fromDef, ang, 0.96);
  const p2 = getIslandRimPoint(toDef, ang + Math.PI, 0.96);
  return {
    id,
    name,
    fromIsland,
    toIsland,
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
    built: false,
    progress: 0,
    tier,
    requiredTechId,
    costTimber,
    costStone,
  };
}

function createCablewaySpec(
  id: string,
  name: string,
  fromIsland: IslandId,
  toIsland: IslandId,
  requiredTechId: string,
  costTimber: number,
  costStone: number,
  costIron: number,
): SkyCablewayEntity {
  const fromDef = ISLAND_DEFS[fromIsland];
  const toDef = ISLAND_DEFS[toIsland];
  const ang = Math.atan2(toDef.centerY - fromDef.centerY, toDef.centerX - fromDef.centerX);
  const p1 = getIslandRimPoint(fromDef, ang, 0.9);
  const p2 = getIslandRimPoint(toDef, ang + Math.PI, 0.9);
  return {
    id,
    name,
    fromIsland,
    toIsland,
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
    built: false,
    progress: 0,
    requiredTechId,
    costTimber,
    costStone,
    costIron,
    gondolaT: 0.15,
    gondolaDir: 1,
    passengerIds: [],
  };
}

export const INITIAL_SKY_BRIDGES: SkyBridgeEntity[] = [
  createBridgeSpec(
    'bridge_cradle_sun',
    'Sun-Terrace Causeway',
    'cradle',
    'sunterrace',
    1,
    'rope_bridges',
    26,
    10,
  ),
  createBridgeSpec(
    'bridge_cradle_timber',
    'Timbercrown Sky-Bridge',
    'cradle',
    'timbercrown',
    1,
    'rope_bridges',
    32,
    14,
  ),
  createBridgeSpec(
    'bridge_cradle_starbloom',
    'Starbloom Pilgrim Span',
    'cradle',
    'starbloom',
    1,
    'rope_bridges',
    28,
    14,
  ),
  createBridgeSpec(
    'bridge_timber_crag',
    'Copper-Crag High Arch',
    'timbercrown',
    'coppercrag',
    2,
    'sky_causeways',
    44,
    36,
  ),
  createBridgeSpec(
    'bridge_sun_crag',
    'Sun-Crag Stone Viaduct',
    'sunterrace',
    'coppercrag',
    2,
    'sky_causeways',
    46,
    38,
  ),
  createBridgeSpec(
    'bridge_sun_mist',
    'Outer Mist Reef Span',
    'sunterrace',
    'mistatoll',
    2,
    'sail_navigation',
    42,
    26,
  ),
  createBridgeSpec(
    'bridge_crag_ember',
    'Ashen Siege Causeway',
    'coppercrag',
    'embervault',
    2,
    'sky_causeways',
    52,
    46,
  ),
];

export const INITIAL_SKY_CABLEWAYS: SkyCablewayEntity[] = [
  createCablewaySpec(
    'cable_timber_frost',
    'Frostpeak Glacier Gondola',
    'timbercrown',
    'frostpeak',
    'cliff_cableways',
    34,
    26,
    4,
  ),
  createCablewaySpec(
    'cable_crag_frost',
    'High-Iron Alpine Line',
    'coppercrag',
    'frostpeak',
    'cliff_cableways',
    38,
    30,
    6,
  ),
  createCablewaySpec(
    'cable_starbloom_timber',
    'Cedar-Starlight Aerial Line',
    'starbloom',
    'timbercrown',
    'cliff_cableways',
    30,
    20,
    2,
  ),
  createCablewaySpec(
    'cable_mist_ember',
    'Bastion Cliff Zipline',
    'mistatoll',
    'embervault',
    'cliff_cableways',
    36,
    28,
    8,
  ),
];

export const TRAVELER_ATTITUDE_META: Record<
  TravelerAttitude,
  { label: string; toneColor: string; quotes: string[] }
> = {
  warm: {
    label: 'Warm & Earnest',
    toneColor: '#74C294',
    quotes: [
      'Your hearth smoke rose above the clouds—I bring willing hands and stories.',
      'Peace to your shore! May I share tonight’s fire and mend nets?',
    ],
  },
  humble: {
    label: 'Quiet & Humble',
    toneColor: '#A8D0E6',
    quotes: [
      'I ask only a dry corner beside the fire to tend tubers and carve wood.',
      'My skiff broke against the reef—I walk gently and keep my word.',
    ],
  },
  boisterous: {
    label: 'Lively & Bold',
    toneColor: '#E5AF47',
    quotes: [
      'What a view across the sky-sea! Give me a spear and point toward wild boars!',
      'Plenty of cheer where I sail—let us bake loaves and chart the mist!',
    ],
  },
  aloof: {
    label: 'Guarded & Aloof',
    toneColor: '#B8B0C8',
    quotes: [
      'I keep my own watch, though I pull an oar if the isle stays fair.',
      'Not one for chatter—just looking for honest work and dry wool.',
    ],
  },
  restless: {
    label: 'Restless Rover',
    toneColor: '#E38589',
    quotes: [
      'Can’t promise I stay past winter, unless your ships sail into the mist.',
      'I’ve seen three islands fall to frost—show me a stout hearth first.',
    ],
  },
};

export const ERA_LABELS: Record<VillageEra, { name: string; subtitle: string }> = {
  1: { name: 'Era I · Bare Awakening', subtitle: 'Wild berries, flint sparks, and the first shared bonfire.' },
  2: { name: 'Era II · Hearth & Pasture', subtitle: 'Timber cottages, cultivated crops, livestock, and sky-bridges.' },
  3: { name: 'Era III · Maritime Clans', subtitle: 'Wind-gliders, cableways, cargo sails, and outer-island ruins.' },
  4: { name: 'Era IV · Iron Archipelago', subtitle: 'High-arch causeways, orchards, war galleys, and siege realms.' },
};

export const SEASON_META: Record<
  SeasonType,
  { label: string; festivalName: string; weatherWeights: WeatherType[] }
> = {
  spring: {
    label: 'Spring',
    festivalName: 'First-Sprout Vigil',
    weatherWeights: ['clear', 'clear', 'rain', 'mist', 'breeze'],
  },
  summer: {
    label: 'Summer',
    festivalName: 'Sky-Sea Regatta',
    weatherWeights: ['clear', 'clear', 'clear', 'breeze', 'rain'],
  },
  autumn: {
    label: 'Autumn',
    festivalName: 'Harvest & Cider Feast',
    weatherWeights: ['breeze', 'breeze', 'clear', 'mist', 'rain'],
  },
  winter: {
    label: 'Winter',
    festivalName: 'Solstice Hearth Night',
    weatherWeights: ['snow', 'snow', 'clear', 'mist', 'clear'],
  },
};

export const COMFORT_LABELS: Record<ComfortItem, string> = {
  bread: 'Warm Bread',
  tea: 'Herbal Tea',
  honey: 'Meadow Honey',
};

export const WISH_LABELS: Record<VillagerWishType, string> = {
  tea: 'Craving healing herbal tea',
  bread: 'Hoping for warm baked bread',
  honey: 'Dreaming of orchard honey',
  hotspring: 'Wants to soak in a warm spring',
  chat: 'Hoping for fireside company',
  explore: 'Yearns to scout an outer island',
};

export const TRAITS: Record<string, TraitDefinition> = {
  curious_scout: {
    id: 'curious_scout',
    name: 'Horizon-Curious',
    polarity: 'positive',
    summary: 'Volunteers to cross bridges, glide cliffs, sail boats & uncover ruins.',
    workSpeedMult: 1.06,
    moodDrift: 0.2,
    energyDrainMult: 0.94,
    obedienceMod: 0.04,
    curiosityMod: 0.42,
  },
  green_thumb: {
    id: 'green_thumb',
    name: 'Seed Keeper',
    polarity: 'positive',
    summary: '+28% crop growth & pasture care.',
    workSpeedMult: 1.28,
    moodDrift: 0.35,
    energyDrainMult: 0.95,
    obedienceMod: 0.1,
  },
  brave_hunter: {
    id: 'brave_hunter',
    name: 'Stout-Hearted',
    polarity: 'positive',
    summary: 'Fearless against wild boars & Ashen Bastion raiders.',
    workSpeedMult: 1.12,
    moodDrift: 0.15,
    energyDrainMult: 0.92,
    obedienceMod: 0.06,
    braveryMod: 0.38,
  },
  warmhearted: {
    id: 'warmhearted',
    name: 'Warmhearted',
    polarity: 'positive',
    summary: 'Lifts neighbors’ spirits & builds trust with travelers.',
    workSpeedMult: 1.05,
    moodDrift: 0.5,
    energyDrainMult: 1.0,
    obedienceMod: 0.18,
    socialAura: 0.5,
  },
  clever_crafter: {
    id: 'clever_crafter',
    name: 'Clever Hands',
    polarity: 'positive',
    summary: '+25% building, smelting & carpentry speed.',
    workSpeedMult: 1.25,
    moodDrift: 0.2,
    energyDrainMult: 0.92,
    obedienceMod: 0.12,
  },
  resilient: {
    id: 'resilient',
    name: 'Frost-Hardy',
    polarity: 'positive',
    summary: 'Resists winter chill and rain fatigue.',
    workSpeedMult: 1.1,
    moodDrift: 0.2,
    energyDrainMult: 0.82,
    obedienceMod: 0.14,
  },
  swift_footed: {
    id: 'swift_footed',
    name: 'Fleet-Footed',
    polarity: 'positive',
    summary: 'Moves briskly across cliffs & sky-bridges.',
    workSpeedMult: 1.12,
    moodDrift: 0.15,
    energyDrainMult: 0.94,
    obedienceMod: 0.08,
    curiosityMod: 0.16,
  },
  cautious_homebody: {
    id: 'cautious_homebody',
    name: 'Homebound',
    polarity: 'negative',
    summary: 'Wary of strangers & avoids risky sea voyages.',
    workSpeedMult: 0.96,
    moodDrift: 0.05,
    energyDrainMult: 0.96,
    obedienceMod: 0.06,
    curiosityMod: -0.32,
  },
  rain_shy: {
    id: 'rain_shy',
    name: 'Chill-Prone',
    polarity: 'negative',
    summary: 'Loses warmth faster in rain or snow; seeks hearth.',
    workSpeedMult: 0.92,
    moodDrift: -0.25,
    energyDrainMult: 1.08,
    obedienceMod: -0.1,
    rainSensitive: true,
  },
  stubborn: {
    id: 'stubborn',
    name: 'Willful',
    polarity: 'negative',
    summary: 'Follows own judgment over divine whispers.',
    workSpeedMult: 1.04,
    moodDrift: -0.1,
    energyDrainMult: 1.0,
    obedienceMod: -0.34,
  },
  timid: {
    id: 'timid',
    name: 'Skittish',
    polarity: 'negative',
    summary: 'Flees boars & raiders unless defended by guards.',
    workSpeedMult: 0.92,
    moodDrift: -0.15,
    energyDrainMult: 1.05,
    obedienceMod: 0.1,
    braveryMod: -0.32,
  },
  melancholic: {
    id: 'melancholic',
    name: 'Wistful',
    polarity: 'negative',
    summary: 'Grieves deeply during winter or scarcity.',
    workSpeedMult: 0.94,
    moodDrift: -0.38,
    energyDrainMult: 1.02,
    obedienceMod: -0.06,
  },
};

export const POSITIVE_TRAIT_IDS = Object.values(TRAITS)
  .filter((t) => t.polarity === 'positive')
  .map((t) => t.id);

export const NEGATIVE_TRAIT_IDS = Object.values(TRAITS)
  .filter((t) => t.polarity === 'negative')
  .map((t) => t.id);

export interface TaskMeta {
  id: TaskType;
  key: string;
  label: string;
  verb: string;
  requiredTechId?: string;
}

export const TASKS: TaskMeta[] = [
  { id: 'forage', key: '1', label: 'Forage', verb: 'Gathering berries & flint' },
  { id: 'chop', key: '2', label: 'Woodcraft', verb: 'Cutting cedar & kindling' },
  { id: 'hunt', key: '3', label: 'Hunt', verb: 'Tracking wild game', requiredTechId: 'flint_spears' },
  { id: 'farm', key: '4', label: 'Farm', verb: 'Tending cultivated crops', requiredTechId: 'wild_botany' },
  { id: 'pasture', key: '5', label: 'Pasture', verb: 'Herding sheep & livestock', requiredTechId: 'animal_husbandry' },
  { id: 'quarry', key: '6', label: 'Quarry', verb: 'Mining stone & ore', requiredTechId: 'masonry_bakery' },
  { id: 'fish', key: '7', label: 'Fish', verb: 'Netting sky-sea fish', requiredTechId: 'dugout_docks' },
  { id: 'bake', key: '8', label: 'Bake', verb: 'Baking hearth loaves', requiredTechId: 'masonry_bakery' },
  { id: 'study', key: '9', label: 'Study', verb: 'Writing cultural lore', requiredTechId: 'scholarship' },
  { id: 'smelt', key: '0', label: 'Smelt', verb: 'Forging bronze & iron', requiredTechId: 'bronze_smelting' },
  { id: 'guard', key: 'G', label: 'Guard', verb: 'Patrolling watchtowers', requiredTechId: 'archery_watch' },
  { id: 'explore', key: 'E', label: 'Explore', verb: 'Scouting ruins & horizons', requiredTechId: 'rope_bridges' },
];

export const TASK_BY_ID: Record<TaskType, TaskMeta> = Object.fromEntries(
  TASKS.map((t) => [t.id, t]),
) as Record<TaskType, TaskMeta>;

export const CHIEF_FOCUSES: { id: ChiefFocus; label: string; summary: string }[] = [
  { id: 'balanced', label: 'Balanced Rhythm', summary: 'Organic mix of foraging, building, study & care.' },
  { id: 'harvest', label: 'Food & Pastures', summary: 'Prioritizes crops, hunting, fishing & wool.' },
  { id: 'craft', label: 'Craft & Metallurgy', summary: 'Prioritizes timber, stone, libraries & smithing.' },
  { id: 'explore', label: 'Explore & Sail', summary: 'Sends curious scouts across bridges, gliders, cableways & ships.' },
  { id: 'defense', label: 'Watch & Garrison', summary: 'Prioritizes weapons, armor, towers & bastion expeditions.' },
];

export const WEATHER_LABELS: Record<WeatherType, string> = {
  clear: 'Clear',
  rain: 'Rain',
  breeze: 'Breeze',
  snow: 'Snow',
  mist: 'Mist',
};

export const TIME_PRESET_VALUES: Record<TimePreset, { label: string; value: number }> = {
  dawn: { label: 'Dawn', value: 0.25 },
  day: { label: 'Day', value: 0.48 },
  golden: { label: 'Golden', value: 0.69 },
  dusk: { label: 'Dusk', value: 0.78 },
  night: { label: 'Night', value: 0.93 },
};

const CLOAK_PALETTES = [
  '#C26D4A',
  '#5A7D6C',
  '#5B7290',
  '#B88B4A',
  '#8C5E74',
  '#6E7F5E',
  '#A65C52',
  '#4F6D7A',
];

const HAIR_COLORS = ['#4A3525', '#7A5438', '#C48D52', '#2E2622', '#8B4A32', '#9A9792'];
const SKIN_TONES = ['#F4D5BD', '#E6BA9A', '#D19A74', '#B57952', '#FCE1CE'];

const FIRST_NAMES = [
  'Adam', 'Eve', 'Rowan', 'Clara', 'Finn', 'Iris', 'Bram', 'Nora',
  'Theo', 'Wren', 'Alder', 'Sylvie', 'Otis', 'Juniper', 'Cedric',
  'Hazel', 'Linden', 'Maeve', 'Jasper', 'Faye', 'Soren', 'Kael', 'Tamsin',
];

const LAST_NAMES = [
  'Ash', 'Moss', 'Briar', 'Brook', 'Thistle', 'Fern', 'Hollow', 'Finch',
  'Reed', 'Haven', 'Meadows', 'Lark', 'Clover', 'Crag', 'Gale',
];

const BIO_OPENERS = [
  'A steady soul shaped by wind and hearth smoke,',
  'First to trace constellations above the floating cliffs,',
  'Keeps smooth flint shards and dried chamomile in a satchel,',
  'Quietly observant, reading sea ripples for changing squalls,',
  'Carves tiny timber boats by night beside the embers,',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickRandomWish(): VillagerWishType {
  const wishes: VillagerWishType[] = ['tea', 'bread', 'honey', 'hotspring', 'chat', 'explore'];
  return pickRandom(wishes);
}

export function pickFavoriteComfort(): ComfortItem {
  return pickRandom(['bread', 'tea', 'honey']);
}

export function buildBioFromTraits(traitIds: string[], isChild = false): string {
  const pos = traitIds.map((id) => TRAITS[id]).find((t) => t?.polarity === 'positive');
  const neg = traitIds.map((id) => TRAITS[id]).find((t) => t?.polarity === 'negative');
  if (isChild) {
    return `Raised among the archipelago fires${pos ? `, showing a ${pos.name.toLowerCase()} spirit` : ''}${neg ? ` and ${neg.name.toLowerCase()} streak` : ''}.`;
  }
  const opener = pickRandom(BIO_OPENERS);
  const posText = pos ? `blessed as ${pos.name.toLowerCase()}` : 'handy by the camp';
  const negText = neg ? `though somewhat ${neg.name.toLowerCase()}` : 'and calm under open skies';
  return `${opener} ${posText}, ${negText}.`;
}

export function rollBalancedTraits(inheritedTraitId?: string): string[] {
  const chosen: string[] = [];
  if (inheritedTraitId && TRAITS[inheritedTraitId]) {
    chosen.push(inheritedTraitId);
  }
  const hasPos = chosen.some((id) => TRAITS[id]?.polarity === 'positive');
  const hasNeg = chosen.some((id) => TRAITS[id]?.polarity === 'negative');

  if (!hasPos) {
    const pool = POSITIVE_TRAIT_IDS.filter((id) => !chosen.includes(id));
    chosen.push(pickRandom(pool));
  }
  if (!hasNeg) {
    const pool = NEGATIVE_TRAIT_IDS.filter((id) => !chosen.includes(id));
    chosen.push(pickRandom(pool));
  }
  if (Math.random() < 0.45) {
    const extraPool = [...POSITIVE_TRAIT_IDS, ...NEGATIVE_TRAIT_IDS].filter((id) => !chosen.includes(id));
    if (extraPool.length > 0) chosen.push(pickRandom(extraPool));
  }
  return chosen;
}

export function generateCandidate(
  kind: 'traveler' | 'birth',
  day: number,
  existingNames: Set<string>,
  parents?: { id: string; name: string; traits: string[] }[],
): ArrivalCandidate {
  const poolFirst = FIRST_NAMES.slice(2);
  let name = `${pickRandom(poolFirst)} ${pickRandom(LAST_NAMES)}`;
  let guard = 0;
  while (existingNames.has(name) && guard < 20) {
    name = `${pickRandom(poolFirst)} ${pickRandom(LAST_NAMES)}`;
    guard++;
  }

  let inherited: string | undefined;
  if (kind === 'birth' && parents && parents.length > 0) {
    const combinedTraits = parents.flatMap((p) => p.traits);
    if (combinedTraits.length > 0) inherited = pickRandom(combinedTraits);
  }

  const traits = rollBalancedTraits(inherited);
  const lifeStage: LifeStage = kind === 'birth' ? 'infant' : Math.random() < 0.15 ? 'elder' : 'adult';
  const hairColor = lifeStage === 'elder' ? '#B9B5AE' : pickRandom(HAIR_COLORS);
  const attitudePool: TravelerAttitude[] = ['warm', 'humble', 'boisterous', 'aloof', 'restless'];
  const attitude: TravelerAttitude = kind === 'birth' ? 'warm' : pickRandom(attitudePool);
  const quotes = TRAVELER_ATTITUDE_META[attitude].quotes;

  return {
    id: `arr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    name,
    bioDescription:
      kind === 'birth'
        ? `Born beside the island hearth to ${parents?.map((p) => p.name.split(' ')[0]).join(' & ') ?? 'loving kin'}.`
        : buildBioFromTraits(traits, false),
    lifeStage,
    cloakColor: pickRandom(CLOAK_PALETTES),
    hairColor,
    skinTone: pickRandom(SKIN_TONES),
    hairStyle: Math.floor(Math.random() * 4),
    traits,
    attitude,
    greetingLine:
      kind === 'birth'
        ? 'Soft peaceful breathing beside the warm embers.'
        : pickRandom(quotes),
    greeterId: null,
    greeterName: null,
    deliberationTimer: kind === 'birth' ? 0 : 12,
    decisionVerdict: kind === 'birth' ? 'recommend_welcome' : 'talking',
    decisionReason: kind === 'birth' ? 'Every newborn is cherished in the archipelago.' : null,
    godSuggestion: 'neutral',
    favoriteComfort: pickFavoriteComfort(),
    parentIds: parents && parents.length === 2 ? [parents[0].id, parents[1].id] : null,
    parentNames: parents ? parents.map((p) => p.name.split(' ')[0]).join(' & ') : null,
    arrivedDay: day,
  };
}

export function getUpgradeCost(building: BuildingEntity): Partial<VillageResources> {
  const factor = building.unlocked ? Math.pow(1.8, building.level) : 1;
  const result: Partial<VillageResources> = {};
  for (const [k, v] of Object.entries(building.baseCost)) {
    if (typeof v === 'number') {
      result[k as keyof VillageResources] = Math.round(v * factor);
    }
  }
  return result;
}

export function isPointInsideIsland(island: IslandDef, wx: number, wy: number, margin = 18): boolean {
  const rx = Math.max(20, island.radiusX - margin);
  const ry = Math.max(20, island.radiusY - margin);
  const dx = (wx - island.centerX) / rx;
  const dy = (wy - island.centerY) / ry;
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(island, ang);
  return Math.hypot(dx, dy) / wobble <= 1;
}

export function getIslandAtPoint(wx: number, wy: number, margin = 0): IslandDef | null {
  for (const id of ISLAND_ORDER) {
    const def = ISLAND_DEFS[id];
    if (isPointInsideIsland(def, wx, wy, margin)) return def;
  }
  return null;
}

export function getBuildingRequiredTechName(b: BuildingEntity): string {
  const bp = BUILDING_BLUEPRINTS[b.type];
  return TECH_BY_ID[bp.requiredTechId]?.name ?? 'Discovery';
}

export const COGNITIVE_STAGE_META: Record<
  import('./types').CognitiveStage,
  { label: string; color: string; summary: string }
> = {
  awakening: {
    label: 'Awakening',
    color: '#A8D0E6',
    summary: 'Infant-like mind: touching berries, water & stones and socializing with peers before grasping work.',
  },
  observing: {
    label: 'Observing',
    color: '#FDE68A',
    summary: 'Connecting natural wonders through exploration and peer chatter—needs 3 wonders & 2 chats to work.',
  },
  experimenting: {
    label: 'Experimenting',
    color: '#8CE0AC',
    summary: 'Work tasks unlocked! Autonomous building, flint sparks, tools & island craft begin.',
  },
  reasoning: {
    label: 'Reasoning',
    color: '#E5AF47',
    summary: 'Capable of autonomous expansion, sailing, gliding, cableways & village planning.',
  },
  enlightened: {
    label: 'Enlightened',
    color: '#C4B5FD',
    summary: 'Deep archipelago thinker—accelerates discoveries, upgrades realms & inspires nearby minds.',
  },
};

export const CONCEPT_LABELS: Record<string, string> = {
  berry_bush: 'Wild Berries',
  branch_pile: 'Dry Kindling',
  flint_pile: 'Sharp Flint',
  tree: 'Living Timber',
  spring: 'Fresh Spring',
  wildlife: 'Wild Fauna',
  horizon: 'Sky-Sea Rim',
  embers: 'Hearth Fire',
  copper_vein: 'Copper Veins',
  iron_vein: 'Iron Ore Veins',
  ruin: 'Ancient Ruin',
  glacier: 'Alpine Snow',
  volcano: 'Volcanic Caldera',
};
