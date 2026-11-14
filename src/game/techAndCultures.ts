import type {
  BuildingType,
  CropType,
  CultureDefinition,
  CultureId,
  LivestockKind,
  TechBranch,
  TechNode,
  VillageResources,
} from './types';

export const CULTURES: Record<CultureId, CultureDefinition> = {
  hearthfolk: {
    id: 'hearthfolk',
    name: 'Hearthfolk',
    bannerColor: '#D69635',
    accentColor: '#C2664B',
    roofColor: '#B2513B',
    sailColor: '#EFE4CE',
    archStyle: 'timber_thatch',
    summary: 'Warm timber-and-thatch builders devoted to hearth fires, loaves, and neighborly trust.',
    bonusLabel: '+15% Hearthlight & Farm Harmony',
  },
  sylvan: {
    id: 'sylvan',
    name: 'Cedarwood Sylvans',
    bannerColor: '#5B9A6E',
    accentColor: '#8FB573',
    roofColor: '#487654',
    sailColor: '#CFE2C4',
    archStyle: 'sylvan_stilt',
    summary: 'Highland foresters crafting mossy cedar stilt-halls, bows, and orchard groves.',
    bonusLabel: '+20% Timber & Bow Hunting',
  },
  cragforge: {
    id: 'cragforge',
    name: 'Cragforge Smiths',
    bannerColor: '#C97A42',
    accentColor: '#5B6A7A',
    roofColor: '#4A5564',
    sailColor: '#D8C7B2',
    archStyle: 'crag_bastion',
    summary: 'Stepped stone masons and copper-bronze founders atop high windy crags.',
    bonusLabel: '+25% Ore Smelting & Fortifications',
  },
  mist_mariner: {
    id: 'mist_mariner',
    name: 'Mist Mariners',
    bannerColor: '#4C9BA6',
    accentColor: '#E5AF47',
    roofColor: '#376C78',
    sailColor: '#559EAA',
    archStyle: 'mariner_driftwood',
    summary: 'Wary outer-sea navigators with crescent-prow galleys and driftwood piers.',
    bonusLabel: '+25% Sea Speed & Deep-Net Fishing',
  },
  ashen_raider: {
    id: 'ashen_raider',
    name: 'Ashen Bastion',
    bannerColor: '#B84A3E',
    accentColor: '#F59E0B',
    roofColor: '#542B27',
    sailColor: '#7E322D',
    archStyle: 'crag_bastion',
    summary: 'Volcanic fortress clan hoarding iron & relics atop Ashen Bastion—ripe for battle expeditions.',
    bonusLabel: 'Rich Iron Spoils & Fierce Garrison',
  },
};

export const TECH_BRANCH_LABELS: Record<TechBranch, string> = {
  hearth_shelter: 'Hearth & Shelter',
  botany_pastures: 'Botany & Pastures',
  maritime_bridges: 'Maritime, Gliders & Spans',
  metallurgy_war: 'Metallurgy & Defense',
};

export const TECH_TREE: TechNode[] = [
  // Branch 1: Hearth & Shelter
  {
    id: 'fire_making',
    name: 'Spark & Hearth',
    branch: 'hearth_shelter',
    era: 1,
    costXp: 12,
    prereqs: [],
    summary: 'Rubbing cedar kindling and flint sparks yields the village Bonfire—warding off night cold and sparking cultural lore.',
    unlocksLabel: 'Bonfire · Night Warmth',
    effectSummary: '+20% Warmth recovery · Unlocks Bonfires & Nightly Fire Circles',
  },
  {
    id: 'woven_shelter',
    name: 'Woven Lean-Tos',
    branch: 'hearth_shelter',
    era: 1,
    costXp: 22,
    prereqs: ['fire_making'],
    summary: 'Bent saplings, bark shingles, and hides shelter sleepers from rain and winter frost.',
    unlocksLabel: 'Lean-To Shelter · Dyed Tunics',
    effectSummary: '+10% Build Speed · +5% Bleed Resistance (tunic padding)',
  },
  {
    id: 'timber_joinery',
    name: 'Timber Joinery',
    branch: 'hearth_shelter',
    era: 2,
    costXp: 46,
    prereqs: ['woven_shelter'],
    summary: 'Mortise-and-tenon carpentry unlocks framed cottages and cedar woodshops.',
    unlocksLabel: 'Timber Cottage · Woodshop',
    effectSummary: '+20% Timber Yield · +15% Build Speed',
  },
  {
    id: 'masonry_bakery',
    name: 'Masonry & Clay Ovens',
    branch: 'hearth_shelter',
    era: 2,
    costXp: 72,
    prereqs: ['timber_joinery'],
    summary: 'Dressed quarry stone shapes lasting stone quarries and hearth ovens for warm bread.',
    unlocksLabel: 'Stone Quarry · Bakery',
    effectSummary: '+25% Stone Yield · +15% Building Durability',
  },
  {
    id: 'scholarship',
    name: 'Scriptorium & Lore',
    branch: 'hearth_shelter',
    era: 3,
    costXp: 110,
    prereqs: ['masonry_bakery'],
    summary: 'Birch-bark folios preserve inventions, speeding every future cultural discovery and teaching.',
    unlocksLabel: 'Archipelago Library · +65% Knowledge',
    effectSummary: '+35% Knowledge XP · +45% Skill Teaching Rate',
  },

  // Branch 2: Botany & Pastures
  {
    id: 'wild_botany',
    name: 'Seed Lore',
    branch: 'botany_pastures',
    era: 1,
    costXp: 18,
    prereqs: ['fire_making'],
    summary: 'Saving wild turnip tubers and wild wheat ears beside watered loam.',
    unlocksLabel: 'Crop Plots (Turnips & Wheat)',
    effectSummary: '+15% Forage Yield · Unlocks Cultivated Fields',
  },
  {
    id: 'animal_husbandry',
    name: 'Animal Husbandry',
    branch: 'botany_pastures',
    era: 2,
    costXp: 52,
    prereqs: ['wild_botany'],
    summary: 'Split-rail pastures tame highland sheep, pigs, and fowl for wool, milk, and steady meat.',
    unlocksLabel: 'Pastures · Wool Winter Cloaks',
    effectSummary: '+20% Crop & Pasture Yield · Unlocks Wool Winter Gear',
  },
  {
    id: 'flax_herbalism',
    name: 'Flax & Herbalism',
    branch: 'botany_pastures',
    era: 3,
    costXp: 84,
    prereqs: ['animal_husbandry'],
    summary: 'Cultivates blue flax fibers and healing chamomile herbs for sails, tunics, and wound salves.',
    unlocksLabel: 'Flax & Herb Crops · Faster Healing',
    effectSummary: '+35% Natural Heal Rate · +15% Bleed Resistance (salves)',
  },
  {
    id: 'orchard_grafting',
    name: 'Orchard Grafting',
    branch: 'botany_pastures',
    era: 3,
    costXp: 115,
    prereqs: ['flax_herbalism'],
    summary: 'Apple & fruit orchard terraces flourish across fertile river valleys.',
    unlocksLabel: 'Orchard Terraces · Era IV Readiness',
    effectSummary: '+25% Harvest & Orchard Yield · +10% Mood Drift',
  },

  // Branch 3: Maritime, Gliders & Bridges
  {
    id: 'rope_bridges',
    name: 'Rope & Plank Spans',
    branch: 'maritime_bridges',
    era: 2,
    costXp: 42,
    prereqs: ['woven_shelter'],
    summary: 'Woven hemp cables and cedar planks link neighboring floating cliffs.',
    unlocksLabel: 'Sky-Bridges to Timbercrown, Terrace & Starbloom',
    effectSummary: '+10% Move Speed · Unlocks Tier-1 Sky-Bridges',
  },
  {
    id: 'dugout_docks',
    name: 'Coastal Piers & Skiffs',
    branch: 'maritime_bridges',
    era: 2,
    costXp: 64,
    prereqs: ['timber_joinery'],
    summary: 'Stilted wooden piers launch agile Fishing Skiffs to reach unbridged islands.',
    unlocksLabel: 'Island Docks · Fishing Skiffs',
    effectSummary: '+25% Fish Catch · Unlocks Sea Transit to Unbridged Isles',
  },
  {
    id: 'wind_gliders',
    name: 'Canvas Wind-Gliders',
    branch: 'maritime_bridges',
    era: 2,
    costXp: 76,
    prereqs: ['rope_bridges', 'timber_joinery'],
    summary: 'Bamboo frames and stretched flax wings let scouts ride cliff updrafts between floating islands.',
    unlocksLabel: 'Glider Launch Pad · Airborne Crossing',
    effectSummary: '+20% Explorer Speed · Unlocks Wind-Glider Pads',
  },
  {
    id: 'sail_navigation',
    name: 'Lateen Sails & Trade',
    branch: 'maritime_bridges',
    era: 3,
    costXp: 102,
    prereqs: ['dugout_docks', 'flax_herbalism'],
    summary: 'Woven flax sails carry heavy Merchant Cargo Ships and explorers to distant misty atolls.',
    unlocksLabel: 'Merchant Cargo Ships · Ocean Crossing',
    effectSummary: '+25% Boat Speed · Unlocks Deep-Sea Cargo Voyages',
  },
  {
    id: 'cliff_cableways',
    name: 'Cliff Sky-Cableways',
    branch: 'maritime_bridges',
    era: 3,
    costXp: 120,
    prereqs: ['wind_gliders', 'masonry_bakery'],
    summary: 'Tensioned iron-and-hemp cable lines hoist suspended gondolas up sheer alpine spires and volcanic fortresses.',
    unlocksLabel: 'Sky-Gondola Cableways to Frostpeak & Bastion',
    effectSummary: 'Unlocks High-Cliff Gondola Cableways',
  },
  {
    id: 'sky_causeways',
    name: 'High-Arch Causeways',
    branch: 'maritime_bridges',
    era: 4,
    costXp: 140,
    prereqs: ['rope_bridges', 'masonry_bakery'],
    summary: 'Stone-arched high bridges span dizzying chasms to Copper-Crag & Ashen Bastion.',
    unlocksLabel: 'High-Tier Stone Viaducts',
    effectSummary: '+15% Build Speed · Unlocks Tier-2 Stone Viaducts',
  },

  // Branch 4: Metallurgy & Defense
  {
    id: 'flint_spears',
    name: 'Flint Spears & Hidecraft',
    branch: 'metallurgy_war',
    era: 1,
    costXp: 26,
    prereqs: ['fire_making'],
    summary: 'Knapped flint spearheads enable real hunting of deer and wild boars for meat and hides.',
    unlocksLabel: 'Flint Spears · Big-Game Hunting',
    effectSummary: '+20% Attack Power · +20% Stone Gathering',
  },
  {
    id: 'archery_watch',
    name: 'Yew Bows & Watchtowers',
    branch: 'metallurgy_war',
    era: 2,
    costXp: 68,
    prereqs: ['flint_spears', 'timber_joinery'],
    summary: 'Curved bows and timber watchtowers guard coasts against wary neighbors or wild boars.',
    unlocksLabel: 'Hunting Bows · Watchtowers',
    effectSummary: '+15% Attack Power · Unlocks Watchtowers & Bow Volley',
  },
  {
    id: 'bronze_smelting',
    name: 'Copper & Bronze Smelting',
    branch: 'metallurgy_war',
    era: 3,
    costXp: 112,
    prereqs: ['archery_watch', 'masonry_bakery'],
    summary: 'Charcoal bellows smelt island copper into gleaming bronze tools, blades, and armor.',
    unlocksLabel: 'Smeltery · Bronze Gear & Blades',
    effectSummary: '+25% Ore Yield · +2 Armor · +15% Attack Power',
  },
  {
    id: 'iron_statecraft',
    name: 'Iron Forging & Galleys',
    branch: 'metallurgy_war',
    era: 4,
    costXp: 158,
    prereqs: ['bronze_smelting', 'sail_navigation'],
    summary: 'Forges iron-plated shields, Garrison Barracks, and armored Transport & War Galleys.',
    unlocksLabel: 'Barracks · War Galleys · Iron Armor',
    effectSummary: '+4 Armor · +15% Bleed Resistance · +20% Attack Power',
  },
];

export const TECH_BY_ID: Record<string, TechNode> = Object.fromEntries(
  TECH_TREE.map((t) => [t.id, t]),
);

export interface BuildingBlueprint {
  type: BuildingType;
  name: string;
  category: 'shelter' | 'food' | 'craft' | 'maritime' | 'defense';
  requiredTechId: string;
  maxLevel: number;
  housingCapacity: number;
  footprint: { rx: number; ry: number };
  baseCost: Partial<VillageResources>;
  description: string;
  benefitDescription: string;
}

export const BUILDING_BLUEPRINTS: Record<BuildingType, BuildingBlueprint> = {
  bonfire: {
    type: 'bonfire',
    name: 'Cultural Bonfire',
    category: 'shelter',
    requiredTechId: 'fire_making',
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 14, ry: 14 },
    baseCost: { timber: 6, stone: 4 },
    description: 'Glowing stone hearth pit where villagers warm up and trade stories.',
    benefitDescription: 'Radiates warmth, heals cold & gathers knowledge',
  },
  lean_to: {
    type: 'lean_to',
    name: 'Hide Lean-To',
    category: 'shelter',
    requiredTechId: 'woven_shelter',
    maxLevel: 2,
    housingCapacity: 2,
    footprint: { rx: 16, ry: 13 },
    baseCost: { timber: 10, hides: 2 },
    description: 'Simple timber-and-hide tent shielding two founders from night frost.',
    benefitDescription: '+2 beds & basic rain/snow shelter',
  },
  cottage: {
    type: 'cottage',
    name: 'Timber Cottage',
    category: 'shelter',
    requiredTechId: 'timber_joinery',
    maxLevel: 4,
    housingCapacity: 3,
    footprint: { rx: 20, ry: 16 },
    baseCost: { timber: 22, stone: 12 },
    description: 'Framed home styled in the owning island culture’s distinct architecture.',
    benefitDescription: '+3 beds (+2/lvl), cozy warmth & rest',
  },
  woodshop: {
    type: 'woodshop',
    name: 'Carpenter Yard',
    category: 'craft',
    requiredTechId: 'timber_joinery',
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 18, ry: 14 },
    baseCost: { timber: 18, stone: 8 },
    description: 'Sawhorses, grindstone, and plank racks boosting woodworking.',
    benefitDescription: '+30% Timber output per level',
  },
  quarry: {
    type: 'quarry',
    name: 'Stone & Ore Quarry',
    category: 'craft',
    requiredTechId: 'masonry_bakery',
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 20, ry: 16 },
    baseCost: { timber: 20, stone: 6 },
    description: 'Timber-shored pit with ore carts extracting stone, copper, and iron.',
    benefitDescription: 'Unlocks Stone & Metal mining',
  },
  farm_plot: {
    type: 'farm_plot',
    name: 'Cultivated Field',
    category: 'food',
    requiredTechId: 'wild_botany',
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 22, ry: 15 },
    baseCost: { timber: 12, stone: 4 },
    description: 'Tilled soil beds growing Turnips, Wheat, Flax, Herbs, or Orchards.',
    benefitDescription: 'Steady multi-stage crops (+water bonus)',
  },
  pasture: {
    type: 'pasture',
    name: 'Livestock Pasture',
    category: 'food',
    requiredTechId: 'animal_husbandry',
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 24, ry: 17 },
    baseCost: { timber: 18, grain: 6 },
    description: 'Fenced meadow pen raising Sheep (wool), Pigs (meat), or Fowl.',
    benefitDescription: 'Wool for winter cloaks, Meat & Eggs',
  },
  bakery: {
    type: 'bakery',
    name: 'Stone Bakery',
    category: 'food',
    requiredTechId: 'masonry_bakery',
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 18, ry: 15 },
    baseCost: { timber: 22, stone: 18 },
    description: 'Domed clay oven turning wheat grain into nourishing Warm Bread.',
    benefitDescription: 'Bakes Warm Bread & boosts morale',
  },
  library: {
    type: 'library',
    name: 'Culture Library',
    category: 'craft',
    requiredTechId: 'scholarship',
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 19, ry: 16 },
    baseCost: { timber: 28, stone: 24, hearthlight: 10 },
    description: 'Lantern-lit hall of folios where scholars accelerate discoveries.',
    benefitDescription: '+65% Knowledge XP per level',
  },
  smeltery: {
    type: 'smeltery',
    name: 'Bronze & Iron Forge',
    category: 'craft',
    requiredTechId: 'bronze_smelting',
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 19, ry: 15 },
    baseCost: { timber: 24, stone: 26, copper: 8 },
    description: 'Bellows furnace casting bronze & iron weapons, tools, and armor.',
    benefitDescription: 'Crafts Bronze/Iron & equips gear tiers',
  },
  dock: {
    type: 'dock',
    name: 'Harbor Dockyard',
    category: 'maritime',
    requiredTechId: 'dugout_docks',
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 20, ry: 14 },
    baseCost: { timber: 24, stone: 10 },
    description: 'Coastal slipway building Fishing Skiffs, Cargo Ships & War Galleys.',
    benefitDescription: 'Launches fleet & links island sea trade',
  },
  glider_pad: {
    type: 'glider_pad',
    name: 'Wind-Glider Cliff Ramp',
    category: 'maritime',
    requiredTechId: 'wind_gliders',
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 18, ry: 15 },
    baseCost: { timber: 22, wool: 6 },
    description: 'Elevated timber launch ramp and windsock dispatching villagers on soaring canvas gliders.',
    benefitDescription: 'Airborne island travel & rapid scouting',
  },
  watchtower: {
    type: 'watchtower',
    name: 'Archery Watchtower',
    category: 'defense',
    requiredTechId: 'archery_watch',
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 15, ry: 15 },
    baseCost: { timber: 22, stone: 18 },
    description: 'Elevated lookout post alerting kin and firing warning volleys at raiders.',
    benefitDescription: 'Defends coast & spots approaching ships',
  },
  barracks: {
    type: 'barracks',
    name: 'Garrison Barracks',
    category: 'defense',
    requiredTechId: 'iron_statecraft',
    maxLevel: 3,
    housingCapacity: 2,
    footprint: { rx: 20, ry: 16 },
    baseCost: { timber: 28, stone: 26, bronze: 8 },
    description: 'Training yard drilling island guards with shields, spears, and iron mail.',
    benefitDescription: '+2 beds, equips soldiers & launches War Galleys',
  },
};

export const CROP_META: Record<
  CropType,
  { label: string; requiredTechId: string; seasonBonus: string; yieldKind: 'grain' | 'herbs' | 'berries' | 'wool' }
> = {
  turnip: {
    label: 'Hard Turnips',
    requiredTechId: 'wild_botany',
    seasonBonus: 'Frost-hardy into early winter',
    yieldKind: 'grain',
  },
  wheat: {
    label: 'Golden Wheat',
    requiredTechId: 'wild_botany',
    seasonBonus: 'Flourishes in Summer & Autumn',
    yieldKind: 'grain',
  },
  flax: {
    label: 'Blue Flax',
    requiredTechId: 'flax_herbalism',
    seasonBonus: 'Weaves cloth & ship sails',
    yieldKind: 'wool',
  },
  herbs: {
    label: 'Medicinal Herbs',
    requiredTechId: 'flax_herbalism',
    seasonBonus: 'Heals wounds & brews soothing tea',
    yieldKind: 'herbs',
  },
  orchard: {
    label: 'Apple Orchard',
    requiredTechId: 'orchard_grafting',
    seasonBonus: 'Sweet autumn harvest & honey',
    yieldKind: 'berries',
  },
};

export const LIVESTOCK_META: Record<
  LivestockKind,
  { label: string; summary: string; color: string }
> = {
  sheep: { label: 'Highland Sheep', summary: 'Yields warm Wool for winter cloaks & Milk.', color: '#F0ECE1' },
  pig: { label: 'Spotted Pigs', summary: 'Hearty pasture stock yielding rich Meat.', color: '#E3A89C' },
  fowl: { label: 'Meadow Fowl', summary: 'Fast-laying hens providing eggs & meat.', color: '#D69F4E' },
};

export function getUnlockedTechIdsCount(unlocked: string[]): number {
  return unlocked.length;
}

export function getAvailableFrontierTechs(unlocked: string[]): TechNode[] {
  const set = new Set(unlocked);
  return TECH_TREE.filter((node) => !set.has(node.id) && node.prereqs.every((p) => set.has(p)));
}

export function getBlueprintsList(): BuildingBlueprint[] {
  return Object.values(BUILDING_BLUEPRINTS);
}

export interface TechModifiers {
  gatherMult: number;
  stoneMult: number;
  timberMult: number;
  oreMult: number;
  cropMult: number;
  fishMult: number;
  healRateMult: number;
  warmthRegenMult: number;
  bleedResistBonus: number;
  attackMult: number;
  armorBonus: number;
  buildSpeedMult: number;
  teachRateMult: number;
  knowledgeMult: number;
  moveSpeedMult: number;
  boatSpeedMult: number;
}

export function getTechModifiers(unlockedTechIds: string[]): TechModifiers {
  const s = new Set(unlockedTechIds);
  return {
    gatherMult: 1 + (s.has('wild_botany') ? 0.15 : 0) + (s.has('orchard_grafting') ? 0.1 : 0),
    stoneMult: 1 + (s.has('flint_spears') ? 0.2 : 0) + (s.has('masonry_bakery') ? 0.25 : 0),
    timberMult: 1 + (s.has('timber_joinery') ? 0.2 : 0),
    oreMult: 1 + (s.has('bronze_smelting') ? 0.25 : 0),
    cropMult: 1 + (s.has('animal_husbandry') ? 0.2 : 0) + (s.has('orchard_grafting') ? 0.25 : 0),
    fishMult: 1 + (s.has('dugout_docks') ? 0.25 : 0),
    healRateMult: 1 + (s.has('flax_herbalism') ? 0.35 : 0),
    warmthRegenMult: 1 + (s.has('fire_making') ? 0.2 : 0),
    bleedResistBonus: (s.has('woven_shelter') ? 0.05 : 0) + (s.has('flax_herbalism') ? 0.15 : 0) + (s.has('iron_statecraft') ? 0.15 : 0),
    attackMult: 1 + (s.has('flint_spears') ? 0.2 : 0) + (s.has('archery_watch') ? 0.15 : 0) + (s.has('bronze_smelting') ? 0.15 : 0) + (s.has('iron_statecraft') ? 0.2 : 0),
    armorBonus: (s.has('bronze_smelting') ? 2 : 0) + (s.has('iron_statecraft') ? 4 : 0),
    buildSpeedMult: 1 + (s.has('woven_shelter') ? 0.1 : 0) + (s.has('timber_joinery') ? 0.15 : 0) + (s.has('sky_causeways') ? 0.15 : 0),
    teachRateMult: 1 + (s.has('scholarship') ? 0.45 : 0),
    knowledgeMult: 1 + (s.has('scholarship') ? 0.35 : 0),
    moveSpeedMult: 1 + (s.has('rope_bridges') ? 0.1 : 0) + (s.has('wind_gliders') ? 0.1 : 0),
    boatSpeedMult: 1 + (s.has('sail_navigation') ? 0.25 : 0),
  };
}

export interface VillageCustomMeta {
  id: import('./types').VillageCustomId;
  name: string;
  summary: string;
  bonusLabel: string;
}

export const VILLAGE_CUSTOM_META: Record<import('./types').VillageCustomId, VillageCustomMeta> = {
  nightly_hearth_circle: {
    id: 'nightly_hearth_circle',
    name: 'Nightly Hearth Circle',
    summary: 'Villagers gather beside the bonfire each dusk to warm hands, trade stories, and strengthen neighborly bonds.',
    bonusLabel: '+Mood & +Relationship Bonds each night',
  },
  ember_storytelling: {
    id: 'ember_storytelling',
    name: 'Ember Storytelling',
    summary: 'Elders pass natural discoveries and island memories aloud around the fire after sunset.',
    bonusLabel: '+25% Knowledge & Cognitive sharing by fire',
  },
  cliff_lookout_chant: {
    id: 'cliff_lookout_chant',
    name: 'Cliff Lookout Chant',
    summary: 'Scouts call out across high cliff rims at dusk, keeping watch over bridges and distant sails.',
    bonusLabel: '+Curiosity & +15% Exploration insight',
  },
  dawn_forage_song: {
    id: 'dawn_forage_song',
    name: 'Dawn Foragers’ Hum',
    summary: 'Morning gatherers hum rhythmically while picking berries, twigs, and flint.',
    bonusLabel: '+12% Forage & Timber gathering',
  },
  harvest_feast_table: {
    id: 'harvest_feast_table',
    name: 'Shared Feast Table',
    summary: 'Tended gardens and baked loaves are shared together by moonlight before sleep.',
    bonusLabel: '+Warmth & slower hunger drain',
  },
  pasture_shepherd_tune: {
    id: 'pasture_shepherd_tune',
    name: 'Shepherd Flute Tune',
    summary: 'Pipe melodies calm highland sheep and pigs beside wooden pasture rails.',
    bonusLabel: '+Wool & Livestock yield',
  },
  forge_drum_rhythm: {
    id: 'forge_drum_rhythm',
    name: 'Anvil & Drum Cadence',
    summary: 'Hammer blows echo in steady cadence across basalt cliffs and quarries.',
    bonusLabel: '+Copper, Bronze & Iron smelting rate',
  },
  sea_lantern_vigil: {
    id: 'sea_lantern_vigil',
    name: 'Sky-Sea Lantern Vigil',
    summary: 'Mariners light coastal pier lanterns at twilight to guide skiffs safely through cloud mist.',
    bonusLabel: '+Boat durability & +Fish catch',
  },
};

