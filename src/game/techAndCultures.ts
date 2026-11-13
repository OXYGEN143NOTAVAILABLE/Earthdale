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
};

export const TECH_BRANCH_LABELS: Record<TechBranch, string> = {
  hearth_shelter: 'Hearth & Shelter',
  botany_pastures: 'Botany & Pastures',
  maritime_bridges: 'Maritime & Bridges',
  metallurgy_war: 'Metallurgy & Defense',
};

export const TECH_TREE: TechNode[] = [
  // Branch 1: Hearth & Shelter
  {
    id: 'fire_making',
    name: 'Spark & Hearth',
    branch: 'hearth_shelter',
    era: 1,
    costXp: 14,
    prereqs: [],
    summary: 'Rubbing cedar kindling and flint sparks yields the village Bonfire—warding off night cold and sparking cultural lore.',
    unlocksLabel: 'Bonfire · Night Warmth',
  },
  {
    id: 'woven_shelter',
    name: 'Woven Lean-Tos',
    branch: 'hearth_shelter',
    era: 1,
    costXp: 24,
    prereqs: ['fire_making'],
    summary: 'Bent saplings, bark shingles, and hides shelter sleepers from rain and winter frost.',
    unlocksLabel: 'Lean-To Shelter · Dyed Tunics',
  },
  {
    id: 'timber_joinery',
    name: 'Timber Joinery',
    branch: 'hearth_shelter',
    era: 2,
    costXp: 48,
    prereqs: ['woven_shelter'],
    summary: 'Mortise-and-tenon carpentry unlocks framed cottages and cedar woodshops.',
    unlocksLabel: 'Timber Cottage · Woodshop',
  },
  {
    id: 'masonry_bakery',
    name: 'Masonry & Clay Ovens',
    branch: 'hearth_shelter',
    era: 2,
    costXp: 76,
    prereqs: ['timber_joinery'],
    summary: 'Dressed quarry stone shapes lasting stone quarries and hearth ovens for warm bread.',
    unlocksLabel: 'Stone Quarry · Bakery',
  },
  {
    id: 'scholarship',
    name: 'Scriptorium & Lore',
    branch: 'hearth_shelter',
    era: 3,
    costXp: 115,
    prereqs: ['masonry_bakery'],
    summary: 'Birch-bark folios preserve inventions, speeding every future cultural discovery.',
    unlocksLabel: 'Archipelago Library · +65% Knowledge',
  },

  // Branch 2: Botany & Pastures
  {
    id: 'wild_botany',
    name: 'Seed Lore',
    branch: 'botany_pastures',
    era: 1,
    costXp: 20,
    prereqs: ['fire_making'],
    summary: 'Saving wild turnip tubers and wild wheat ears beside watered loam.',
    unlocksLabel: 'Crop Plots (Turnips & Wheat)',
  },
  {
    id: 'animal_husbandry',
    name: 'Animal Husbandry',
    branch: 'botany_pastures',
    era: 2,
    costXp: 54,
    prereqs: ['wild_botany'],
    summary: 'Split-rail pastures tame highland sheep, pigs, and fowl for wool, milk, and steady meat.',
    unlocksLabel: 'Pastures · Wool Winter Cloaks',
  },
  {
    id: 'flax_herbalism',
    name: 'Flax & Herbalism',
    branch: 'botany_pastures',
    era: 3,
    costXp: 88,
    prereqs: ['animal_husbandry'],
    summary: 'Cultivates blue flax fibers and healing chamomile herbs for sails, tunics, and recovery.',
    unlocksLabel: 'Flax & Herb Crops · Faster Healing',
  },
  {
    id: 'orchard_grafting',
    name: 'Orchard Grafting',
    branch: 'botany_pastures',
    era: 3,
    costXp: 120,
    prereqs: ['flax_herbalism'],
    summary: 'Apple & fruit orchard terraces flourish across Sun-Terrace Isle.',
    unlocksLabel: 'Orchard Terraces · Era IV Readiness',
  },

  // Branch 3: Maritime & Bridges
  {
    id: 'rope_bridges',
    name: 'Rope & Plank Spans',
    branch: 'maritime_bridges',
    era: 2,
    costXp: 44,
    prereqs: ['woven_shelter'],
    summary: 'Woven hemp cables and cedar planks link neighboring floating cliffs.',
    unlocksLabel: 'Sky-Bridges to Ridge & Terrace',
  },
  {
    id: 'dugout_docks',
    name: 'Coastal Piers & Skiffs',
    branch: 'maritime_bridges',
    era: 2,
    costXp: 68,
    prereqs: ['timber_joinery'],
    summary: 'Stilted wooden piers launch agile Fishing Skiffs across coastal reefs.',
    unlocksLabel: 'Island Docks · Fishing Skiffs',
  },
  {
    id: 'sail_navigation',
    name: 'Lateen Sails & Trade',
    branch: 'maritime_bridges',
    era: 3,
    costXp: 105,
    prereqs: ['dugout_docks', 'flax_herbalism'],
    summary: 'Woven flax sails carry heavy Merchant Cargo Ships and explorers to distant misty atolls.',
    unlocksLabel: 'Merchant Cargo Ships · Ocean Crossing',
  },
  {
    id: 'sky_causeways',
    name: 'High-Arch Causeways',
    branch: 'maritime_bridges',
    era: 4,
    costXp: 145,
    prereqs: ['rope_bridges', 'masonry_bakery'],
    summary: 'Stone-arched high bridges span dizzying chasms to Copper-Crag Spire.',
    unlocksLabel: 'High-Tier Copper-Crag Sky-Bridge',
  },

  // Branch 4: Metallurgy & Defense
  {
    id: 'flint_spears',
    name: 'Flint Spears & Hidecraft',
    branch: 'metallurgy_war',
    era: 1,
    costXp: 28,
    prereqs: ['fire_making'],
    summary: 'Knapped flint spearheads enable real hunting of deer and wild boars for meat and hides.',
    unlocksLabel: 'Flint Spears · Big-Game Hunting',
  },
  {
    id: 'archery_watch',
    name: 'Yew Bows & Watchtowers',
    branch: 'metallurgy_war',
    era: 2,
    costXp: 72,
    prereqs: ['flint_spears', 'timber_joinery'],
    summary: 'Curved bows and timber watchtowers guard coasts against wary neighbors or wild boars.',
    unlocksLabel: 'Hunting Bows · Watchtowers',
  },
  {
    id: 'bronze_smelting',
    name: 'Copper & Bronze Smelting',
    branch: 'metallurgy_war',
    era: 3,
    costXp: 118,
    prereqs: ['archery_watch', 'masonry_bakery'],
    summary: 'Charcoal bellows smelt island copper into gleaming bronze tools, blades, and armor.',
    unlocksLabel: 'Smeltery · Bronze Gear & Blades',
  },
  {
    id: 'iron_statecraft',
    name: 'Iron Forging & Galleys',
    branch: 'metallurgy_war',
    era: 4,
    costXp: 165,
    prereqs: ['bronze_smelting', 'sail_navigation'],
    summary: 'Forges iron-plated shields, Garrison Barracks, and armored Transport & War Galleys.',
    unlocksLabel: 'Barracks · War Galleys · Iron Armor',
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

