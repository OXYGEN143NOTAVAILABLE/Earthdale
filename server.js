// server.ts
import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";

// src/game/techAndCultures.ts
var CULTURES = {
  hearthfolk: {
    id: "hearthfolk",
    name: "Hearthfolk",
    bannerColor: "#D69635",
    accentColor: "#C2664B",
    roofColor: "#B2513B",
    sailColor: "#EFE4CE",
    archStyle: "timber_thatch",
    summary: "Warm timber-and-thatch builders devoted to hearth fires, loaves, and neighborly trust.",
    bonusLabel: "+15% Hearthlight & Farm Harmony"
  },
  sylvan: {
    id: "sylvan",
    name: "Cedarwood Sylvans",
    bannerColor: "#5B9A6E",
    accentColor: "#8FB573",
    roofColor: "#487654",
    sailColor: "#CFE2C4",
    archStyle: "sylvan_stilt",
    summary: "Highland foresters crafting mossy cedar stilt-halls, bows, and orchard groves.",
    bonusLabel: "+20% Timber & Bow Hunting"
  },
  cragforge: {
    id: "cragforge",
    name: "Cragforge Smiths",
    bannerColor: "#C97A42",
    accentColor: "#5B6A7A",
    roofColor: "#4A5564",
    sailColor: "#D8C7B2",
    archStyle: "crag_bastion",
    summary: "Stepped stone masons and copper-bronze founders atop high windy crags.",
    bonusLabel: "+25% Ore Smelting & Fortifications"
  },
  mist_mariner: {
    id: "mist_mariner",
    name: "Mist Mariners",
    bannerColor: "#4C9BA6",
    accentColor: "#E5AF47",
    roofColor: "#376C78",
    sailColor: "#559EAA",
    archStyle: "mariner_driftwood",
    summary: "Wary outer-sea navigators with crescent-prow galleys and driftwood piers.",
    bonusLabel: "+25% Sea Speed & Deep-Net Fishing"
  },
  ashen_raider: {
    id: "ashen_raider",
    name: "Ashen Bastion",
    bannerColor: "#B84A3E",
    accentColor: "#F59E0B",
    roofColor: "#542B27",
    sailColor: "#7E322D",
    archStyle: "crag_bastion",
    summary: "Volcanic fortress clan hoarding iron & relics atop Ashen Bastion\u2014ripe for battle expeditions.",
    bonusLabel: "Rich Iron Spoils & Fierce Garrison"
  }
};
var TECH_TREE = [
  // Branch 1: Hearth & Shelter
  {
    id: "fire_making",
    name: "Spark & Hearth",
    branch: "hearth_shelter",
    era: 1,
    costXp: 12,
    prereqs: [],
    summary: "Rubbing cedar kindling and flint sparks yields the village Bonfire\u2014warding off night cold and sparking cultural lore.",
    unlocksLabel: "Bonfire \xB7 Night Warmth",
    effectSummary: "+20% Warmth recovery \xB7 Unlocks Bonfires & Nightly Fire Circles"
  },
  {
    id: "woven_shelter",
    name: "Woven Lean-Tos",
    branch: "hearth_shelter",
    era: 1,
    costXp: 22,
    prereqs: ["fire_making"],
    summary: "Bent saplings, bark shingles, and hides shelter sleepers from rain and winter frost.",
    unlocksLabel: "Lean-To Shelter \xB7 Dyed Tunics",
    effectSummary: "+10% Build Speed \xB7 +5% Bleed Resistance (tunic padding)"
  },
  {
    id: "timber_joinery",
    name: "Timber Joinery",
    branch: "hearth_shelter",
    era: 2,
    costXp: 46,
    prereqs: ["woven_shelter"],
    summary: "Mortise-and-tenon carpentry unlocks framed cottages and cedar woodshops.",
    unlocksLabel: "Timber Cottage \xB7 Woodshop",
    effectSummary: "+20% Timber Yield \xB7 +15% Build Speed"
  },
  {
    id: "masonry_bakery",
    name: "Masonry & Clay Ovens",
    branch: "hearth_shelter",
    era: 2,
    costXp: 72,
    prereqs: ["timber_joinery"],
    summary: "Dressed quarry stone shapes lasting stone quarries and hearth ovens for warm bread.",
    unlocksLabel: "Stone Quarry \xB7 Bakery",
    effectSummary: "+25% Stone Yield \xB7 +15% Building Durability"
  },
  {
    id: "scholarship",
    name: "Scriptorium & Lore",
    branch: "hearth_shelter",
    era: 3,
    costXp: 110,
    prereqs: ["masonry_bakery"],
    summary: "Birch-bark folios preserve inventions, speeding every future cultural discovery and teaching.",
    unlocksLabel: "Archipelago Library \xB7 +65% Knowledge",
    effectSummary: "+35% Knowledge XP \xB7 +45% Skill Teaching Rate"
  },
  // Branch 2: Botany & Pastures
  {
    id: "wild_botany",
    name: "Seed Lore",
    branch: "botany_pastures",
    era: 1,
    costXp: 18,
    prereqs: ["fire_making"],
    summary: "Saving wild turnip tubers and wild wheat ears beside watered loam.",
    unlocksLabel: "Crop Plots (Turnips & Wheat)",
    effectSummary: "+15% Forage Yield \xB7 Unlocks Cultivated Fields"
  },
  {
    id: "animal_husbandry",
    name: "Animal Husbandry",
    branch: "botany_pastures",
    era: 2,
    costXp: 52,
    prereqs: ["wild_botany"],
    summary: "Split-rail pastures tame highland sheep, pigs, and fowl for wool, milk, and steady meat.",
    unlocksLabel: "Pastures \xB7 Wool Winter Cloaks",
    effectSummary: "+20% Crop & Pasture Yield \xB7 Unlocks Wool Winter Gear"
  },
  {
    id: "flax_herbalism",
    name: "Flax & Herbalism",
    branch: "botany_pastures",
    era: 3,
    costXp: 84,
    prereqs: ["animal_husbandry"],
    summary: "Cultivates blue flax fibers and healing chamomile herbs for sails, tunics, and wound salves.",
    unlocksLabel: "Flax & Herb Crops \xB7 Faster Healing",
    effectSummary: "+35% Natural Heal Rate \xB7 +15% Bleed Resistance (salves)"
  },
  {
    id: "orchard_grafting",
    name: "Orchard Grafting",
    branch: "botany_pastures",
    era: 3,
    costXp: 115,
    prereqs: ["flax_herbalism"],
    summary: "Apple & fruit orchard terraces flourish across fertile river valleys.",
    unlocksLabel: "Orchard Terraces \xB7 Era IV Readiness",
    effectSummary: "+25% Harvest & Orchard Yield \xB7 +10% Mood Drift"
  },
  // Branch 3: Maritime, Gliders & Bridges
  {
    id: "rope_bridges",
    name: "Rope & Plank Spans",
    branch: "maritime_bridges",
    era: 2,
    costXp: 42,
    prereqs: ["woven_shelter"],
    summary: "Woven hemp cables and cedar planks link neighboring floating cliffs.",
    unlocksLabel: "Sky-Bridges to Timbercrown, Terrace & Starbloom",
    effectSummary: "+10% Move Speed \xB7 Unlocks Tier-1 Sky-Bridges"
  },
  {
    id: "dugout_docks",
    name: "Coastal Piers & Skiffs",
    branch: "maritime_bridges",
    era: 2,
    costXp: 64,
    prereqs: ["timber_joinery"],
    summary: "Stilted wooden piers launch agile Fishing Skiffs to reach unbridged islands.",
    unlocksLabel: "Island Docks \xB7 Fishing Skiffs",
    effectSummary: "+25% Fish Catch \xB7 Unlocks Sea Transit to Unbridged Isles"
  },
  {
    id: "wind_gliders",
    name: "Canvas Wind-Gliders",
    branch: "maritime_bridges",
    era: 2,
    costXp: 76,
    prereqs: ["rope_bridges", "timber_joinery"],
    summary: "Bamboo frames and stretched flax wings let scouts ride cliff updrafts between floating islands.",
    unlocksLabel: "Glider Launch Pad \xB7 Airborne Crossing",
    effectSummary: "+20% Explorer Speed \xB7 Unlocks Wind-Glider Pads"
  },
  {
    id: "sail_navigation",
    name: "Lateen Sails & Trade",
    branch: "maritime_bridges",
    era: 3,
    costXp: 102,
    prereqs: ["dugout_docks", "flax_herbalism"],
    summary: "Woven flax sails carry heavy Merchant Cargo Ships and explorers to distant misty atolls.",
    unlocksLabel: "Merchant Cargo Ships \xB7 Ocean Crossing",
    effectSummary: "+25% Boat Speed \xB7 Unlocks Deep-Sea Cargo Voyages"
  },
  {
    id: "cliff_cableways",
    name: "Cliff Sky-Cableways",
    branch: "maritime_bridges",
    era: 3,
    costXp: 120,
    prereqs: ["wind_gliders", "masonry_bakery"],
    summary: "Tensioned iron-and-hemp cable lines hoist suspended gondolas up sheer alpine spires and volcanic fortresses.",
    unlocksLabel: "Sky-Gondola Cableways to Frostpeak & Bastion",
    effectSummary: "Unlocks High-Cliff Gondola Cableways"
  },
  {
    id: "sky_causeways",
    name: "High-Arch Causeways",
    branch: "maritime_bridges",
    era: 4,
    costXp: 140,
    prereqs: ["rope_bridges", "masonry_bakery"],
    summary: "Stone-arched high bridges span dizzying chasms to Copper-Crag & Ashen Bastion.",
    unlocksLabel: "High-Tier Stone Viaducts",
    effectSummary: "+15% Build Speed \xB7 Unlocks Tier-2 Stone Viaducts"
  },
  // Branch 4: Metallurgy & Defense
  {
    id: "flint_spears",
    name: "Flint Spears & Hidecraft",
    branch: "metallurgy_war",
    era: 1,
    costXp: 26,
    prereqs: ["fire_making"],
    summary: "Knapped flint spearheads enable real hunting of deer and wild boars for meat and hides.",
    unlocksLabel: "Flint Spears \xB7 Big-Game Hunting",
    effectSummary: "+20% Attack Power \xB7 +20% Stone Gathering"
  },
  {
    id: "archery_watch",
    name: "Yew Bows & Watchtowers",
    branch: "metallurgy_war",
    era: 2,
    costXp: 68,
    prereqs: ["flint_spears", "timber_joinery"],
    summary: "Curved bows and timber watchtowers guard coasts against wary neighbors or wild boars.",
    unlocksLabel: "Hunting Bows \xB7 Watchtowers",
    effectSummary: "+15% Attack Power \xB7 Unlocks Watchtowers & Bow Volley"
  },
  {
    id: "bronze_smelting",
    name: "Copper & Bronze Smelting",
    branch: "metallurgy_war",
    era: 3,
    costXp: 112,
    prereqs: ["archery_watch", "masonry_bakery"],
    summary: "Charcoal bellows smelt island copper into gleaming bronze tools, blades, and armor.",
    unlocksLabel: "Smeltery \xB7 Bronze Gear & Blades",
    effectSummary: "+25% Ore Yield \xB7 +2 Armor \xB7 +15% Attack Power"
  },
  {
    id: "iron_statecraft",
    name: "Iron Forging & Galleys",
    branch: "metallurgy_war",
    era: 4,
    costXp: 158,
    prereqs: ["bronze_smelting", "sail_navigation"],
    summary: "Forges iron-plated shields, Garrison Barracks, and armored Transport & War Galleys.",
    unlocksLabel: "Barracks \xB7 War Galleys \xB7 Iron Armor",
    effectSummary: "+4 Armor \xB7 +15% Bleed Resistance \xB7 +20% Attack Power"
  }
];
var TECH_BY_ID = Object.fromEntries(
  TECH_TREE.map((t) => [t.id, t])
);
var BUILDING_BLUEPRINTS = {
  bonfire: {
    type: "bonfire",
    name: "Cultural Bonfire",
    category: "shelter",
    requiredTechId: "fire_making",
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 14, ry: 14 },
    baseCost: { timber: 6, stone: 4 },
    description: "Glowing stone hearth pit where villagers warm up and trade stories.",
    benefitDescription: "Radiates warmth, heals cold & gathers knowledge"
  },
  lean_to: {
    type: "lean_to",
    name: "Hide Lean-To",
    category: "shelter",
    requiredTechId: "woven_shelter",
    maxLevel: 2,
    housingCapacity: 2,
    footprint: { rx: 16, ry: 13 },
    baseCost: { timber: 10, hides: 2 },
    description: "Simple timber-and-hide tent shielding two founders from night frost.",
    benefitDescription: "+2 beds & basic rain/snow shelter"
  },
  cottage: {
    type: "cottage",
    name: "Timber Cottage",
    category: "shelter",
    requiredTechId: "timber_joinery",
    maxLevel: 4,
    housingCapacity: 3,
    footprint: { rx: 20, ry: 16 },
    baseCost: { timber: 22, stone: 12 },
    description: "Framed home styled in the owning island culture\u2019s distinct architecture.",
    benefitDescription: "+3 beds (+2/lvl), cozy warmth & rest"
  },
  woodshop: {
    type: "woodshop",
    name: "Carpenter Yard",
    category: "craft",
    requiredTechId: "timber_joinery",
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 18, ry: 14 },
    baseCost: { timber: 18, stone: 8 },
    description: "Sawhorses, grindstone, and plank racks boosting woodworking.",
    benefitDescription: "+30% Timber output per level"
  },
  quarry: {
    type: "quarry",
    name: "Stone & Ore Quarry",
    category: "craft",
    requiredTechId: "masonry_bakery",
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 20, ry: 16 },
    baseCost: { timber: 20, stone: 6 },
    description: "Timber-shored pit with ore carts extracting stone, copper, and iron.",
    benefitDescription: "Unlocks Stone & Metal mining"
  },
  farm_plot: {
    type: "farm_plot",
    name: "Cultivated Field",
    category: "food",
    requiredTechId: "wild_botany",
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 22, ry: 15 },
    baseCost: { timber: 12, stone: 4 },
    description: "Tilled soil beds growing Turnips, Wheat, Flax, Herbs, or Orchards.",
    benefitDescription: "Steady multi-stage crops (+water bonus)"
  },
  pasture: {
    type: "pasture",
    name: "Livestock Pasture",
    category: "food",
    requiredTechId: "animal_husbandry",
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 24, ry: 17 },
    baseCost: { timber: 18, grain: 6 },
    description: "Fenced meadow pen raising Sheep (wool), Pigs (meat), or Fowl.",
    benefitDescription: "Wool for winter cloaks, Meat & Eggs"
  },
  bakery: {
    type: "bakery",
    name: "Stone Bakery",
    category: "food",
    requiredTechId: "masonry_bakery",
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 18, ry: 15 },
    baseCost: { timber: 22, stone: 18 },
    description: "Domed clay oven turning wheat grain into nourishing Warm Bread.",
    benefitDescription: "Bakes Warm Bread & boosts morale"
  },
  library: {
    type: "library",
    name: "Culture Library",
    category: "craft",
    requiredTechId: "scholarship",
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 19, ry: 16 },
    baseCost: { timber: 28, stone: 24, hearthlight: 10 },
    description: "Lantern-lit hall of folios where scholars accelerate discoveries.",
    benefitDescription: "+65% Knowledge XP per level"
  },
  smeltery: {
    type: "smeltery",
    name: "Bronze & Iron Forge",
    category: "craft",
    requiredTechId: "bronze_smelting",
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 19, ry: 15 },
    baseCost: { timber: 24, stone: 26, copper: 8 },
    description: "Bellows furnace casting bronze & iron weapons, tools, and armor.",
    benefitDescription: "Crafts Bronze/Iron & equips gear tiers"
  },
  dock: {
    type: "dock",
    name: "Harbor Dockyard",
    category: "maritime",
    requiredTechId: "dugout_docks",
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 20, ry: 14 },
    baseCost: { timber: 24, stone: 10 },
    description: "Coastal slipway building Fishing Skiffs, Cargo Ships & War Galleys.",
    benefitDescription: "Launches fleet & links island sea trade"
  },
  glider_pad: {
    type: "glider_pad",
    name: "Wind-Glider Cliff Ramp",
    category: "maritime",
    requiredTechId: "wind_gliders",
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 18, ry: 15 },
    baseCost: { timber: 22, wool: 6 },
    description: "Elevated timber launch ramp and windsock dispatching villagers on soaring canvas gliders.",
    benefitDescription: "Airborne island travel & rapid scouting"
  },
  watchtower: {
    type: "watchtower",
    name: "Archery Watchtower",
    category: "defense",
    requiredTechId: "archery_watch",
    maxLevel: 3,
    housingCapacity: 0,
    footprint: { rx: 15, ry: 15 },
    baseCost: { timber: 22, stone: 18 },
    description: "Elevated lookout post alerting kin and firing warning volleys at raiders.",
    benefitDescription: "Defends coast & spots approaching ships"
  },
  barracks: {
    type: "barracks",
    name: "Garrison Barracks",
    category: "defense",
    requiredTechId: "iron_statecraft",
    maxLevel: 3,
    housingCapacity: 2,
    footprint: { rx: 20, ry: 16 },
    baseCost: { timber: 28, stone: 26, bronze: 8 },
    description: "Training yard drilling island guards with shields, spears, and iron mail.",
    benefitDescription: "+2 beds, equips soldiers & launches War Galleys"
  }
};
var CROP_META = {
  turnip: {
    label: "Hard Turnips",
    requiredTechId: "wild_botany",
    seasonBonus: "Frost-hardy into early winter",
    yieldKind: "grain"
  },
  wheat: {
    label: "Golden Wheat",
    requiredTechId: "wild_botany",
    seasonBonus: "Flourishes in Summer & Autumn",
    yieldKind: "grain"
  },
  flax: {
    label: "Blue Flax",
    requiredTechId: "flax_herbalism",
    seasonBonus: "Weaves cloth & ship sails",
    yieldKind: "wool"
  },
  herbs: {
    label: "Medicinal Herbs",
    requiredTechId: "flax_herbalism",
    seasonBonus: "Heals wounds & brews soothing tea",
    yieldKind: "herbs"
  },
  orchard: {
    label: "Apple Orchard",
    requiredTechId: "orchard_grafting",
    seasonBonus: "Sweet autumn harvest & honey",
    yieldKind: "berries"
  }
};
var LIVESTOCK_META = {
  sheep: { label: "Highland Sheep", summary: "Yields warm Wool for winter cloaks & Milk.", color: "#F0ECE1" },
  pig: { label: "Spotted Pigs", summary: "Hearty pasture stock yielding rich Meat.", color: "#E3A89C" },
  fowl: { label: "Meadow Fowl", summary: "Fast-laying hens providing eggs & meat.", color: "#D69F4E" }
};
function getAvailableFrontierTechs(unlocked) {
  const set = new Set(unlocked);
  return TECH_TREE.filter((node) => !set.has(node.id) && node.prereqs.every((p) => set.has(p)));
}
function getTechModifiers(unlockedTechIds) {
  const s = new Set(unlockedTechIds);
  return {
    gatherMult: 1 + (s.has("wild_botany") ? 0.15 : 0) + (s.has("orchard_grafting") ? 0.1 : 0),
    stoneMult: 1 + (s.has("flint_spears") ? 0.2 : 0) + (s.has("masonry_bakery") ? 0.25 : 0),
    timberMult: 1 + (s.has("timber_joinery") ? 0.2 : 0),
    oreMult: 1 + (s.has("bronze_smelting") ? 0.25 : 0),
    cropMult: 1 + (s.has("animal_husbandry") ? 0.2 : 0) + (s.has("orchard_grafting") ? 0.25 : 0),
    fishMult: 1 + (s.has("dugout_docks") ? 0.25 : 0),
    healRateMult: 1 + (s.has("flax_herbalism") ? 0.35 : 0),
    warmthRegenMult: 1 + (s.has("fire_making") ? 0.2 : 0),
    bleedResistBonus: (s.has("woven_shelter") ? 0.05 : 0) + (s.has("flax_herbalism") ? 0.15 : 0) + (s.has("iron_statecraft") ? 0.15 : 0),
    attackMult: 1 + (s.has("flint_spears") ? 0.2 : 0) + (s.has("archery_watch") ? 0.15 : 0) + (s.has("bronze_smelting") ? 0.15 : 0) + (s.has("iron_statecraft") ? 0.2 : 0),
    armorBonus: (s.has("bronze_smelting") ? 2 : 0) + (s.has("iron_statecraft") ? 4 : 0),
    buildSpeedMult: 1 + (s.has("woven_shelter") ? 0.1 : 0) + (s.has("timber_joinery") ? 0.15 : 0) + (s.has("sky_causeways") ? 0.15 : 0),
    teachRateMult: 1 + (s.has("scholarship") ? 0.45 : 0),
    knowledgeMult: 1 + (s.has("scholarship") ? 0.35 : 0),
    moveSpeedMult: 1 + (s.has("rope_bridges") ? 0.1 : 0) + (s.has("wind_gliders") ? 0.1 : 0),
    boatSpeedMult: 1 + (s.has("sail_navigation") ? 0.25 : 0)
  };
}
var VILLAGE_CUSTOM_META = {
  nightly_hearth_circle: {
    id: "nightly_hearth_circle",
    name: "Nightly Hearth Circle",
    summary: "Villagers gather beside the bonfire each dusk to warm hands, trade stories, and strengthen neighborly bonds.",
    bonusLabel: "+Mood & +Relationship Bonds each night"
  },
  ember_storytelling: {
    id: "ember_storytelling",
    name: "Ember Storytelling",
    summary: "Elders pass natural discoveries and island memories aloud around the fire after sunset.",
    bonusLabel: "+25% Knowledge & Cognitive sharing by fire"
  },
  cliff_lookout_chant: {
    id: "cliff_lookout_chant",
    name: "Cliff Lookout Chant",
    summary: "Scouts call out across high cliff rims at dusk, keeping watch over bridges and distant sails.",
    bonusLabel: "+Curiosity & +15% Exploration insight"
  },
  dawn_forage_song: {
    id: "dawn_forage_song",
    name: "Dawn Foragers\u2019 Hum",
    summary: "Morning gatherers hum rhythmically while picking berries, twigs, and flint.",
    bonusLabel: "+12% Forage & Timber gathering"
  },
  harvest_feast_table: {
    id: "harvest_feast_table",
    name: "Shared Feast Table",
    summary: "Tended gardens and baked loaves are shared together by moonlight before sleep.",
    bonusLabel: "+Warmth & slower hunger drain"
  },
  pasture_shepherd_tune: {
    id: "pasture_shepherd_tune",
    name: "Shepherd Flute Tune",
    summary: "Pipe melodies calm highland sheep and pigs beside wooden pasture rails.",
    bonusLabel: "+Wool & Livestock yield"
  },
  forge_drum_rhythm: {
    id: "forge_drum_rhythm",
    name: "Anvil & Drum Cadence",
    summary: "Hammer blows echo in steady cadence across basalt cliffs and quarries.",
    bonusLabel: "+Copper, Bronze & Iron smelting rate"
  },
  sea_lantern_vigil: {
    id: "sea_lantern_vigil",
    name: "Sky-Sea Lantern Vigil",
    summary: "Mariners light coastal pier lanterns at twilight to guide skiffs safely through cloud mist.",
    bonusLabel: "+Boat durability & +Fish catch"
  }
};

// src/game/catalog.ts
var WORLD_WIDTH = 7600;
var WORLD_HEIGHT = 5200;
var WORLD_SCALE = 0.085;
var CURRENT_WORLD_VERSION = 9;
var DEFAULT_WORLD_SEED = 104729;
function mulberry32(seed) {
  let a = (Math.floor(Math.abs(seed)) || 1) >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function wrapAngleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
function islandCoastWobble(def, angleRad) {
  const rot = def.coastRotRad ?? 0;
  const a = angleRad - rot;
  const seedBase = def.coastSeed ?? Math.round(def.centerX * 13 + def.centerY * 17);
  const p1 = seedBase % 997 * 0.017;
  const p2 = seedBase * 7 % 991 * 0.019;
  const p3 = seedBase * 13 % 983 * 0.023;
  const p4 = seedBase * 29 % 977 * 0.031;
  let wobble = 1 + Math.sin(a * 2 + p1) * 0.068 + Math.cos(a * 3 - p2) * 0.056 + Math.sin(a * 5 + p3) * 0.036 + Math.cos(a * 7 - p4) * 0.018;
  if (def.coveAngles && def.coveAngles.length > 0) {
    for (let i = 0; i < def.coveAngles.length; i++) {
      const diff = Math.abs(wrapAngleDiff(angleRad, def.coveAngles[i]));
      if (diff < 0.44) {
        wobble -= Math.exp(-(diff * diff) / 0.036) * 0.135;
      }
    }
  }
  return Math.max(0.75, Math.min(1.24, wobble));
}
function getIslandRimPoint(def, angleRad, radiusFraction = 0.94) {
  const wobble = islandCoastWobble(def, angleRad) * radiusFraction;
  return {
    x: Math.round(def.centerX + Math.cos(angleRad) * def.radiusX * wobble),
    y: Math.round(def.centerY + Math.sin(angleRad) * def.radiusY * wobble)
  };
}
function createDockSpot(def, angleRad) {
  const wobble = islandCoastWobble(def, angleRad);
  const rx = def.radiusX * wobble;
  const ry = def.radiusY * wobble;
  return {
    x: Math.round(def.centerX + Math.cos(angleRad) * rx * 0.87),
    y: Math.round(def.centerY + Math.sin(angleRad) * ry * 0.87),
    seaX: Math.round(def.centerX + Math.cos(angleRad) * (rx + 185)),
    seaY: Math.round(def.centerY + Math.sin(angleRad) * (ry + 185))
  };
}
function buildSplineRiverPoints(radiusX, radiusY, wobbleAtAngle, startDx, startDy, exitAngle, rng, bendSign, steps = 9) {
  const rimWob = wobbleAtAngle(exitAngle);
  const endDx = Math.cos(exitAngle) * radiusX * rimWob * 1.07;
  const endDy = Math.sin(exitAngle) * radiusY * rimWob * 1.07;
  const chordX = endDx - startDx;
  const chordY = endDy - startDy;
  const chordLen = Math.hypot(chordX, chordY) || 1;
  const perpX = -chordY / chordLen;
  const perpY = chordX / chordLen;
  const meanderAmp = (0.14 + rng() * 0.14) * chordLen * bendSign;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const envelope = Math.sin(t * Math.PI);
    const sWave = Math.sin(t * Math.PI * 1.65) * meanderAmp * envelope;
    let dx = startDx + chordX * t + perpX * sWave;
    let dy = startDy + chordY * t + perpY * sWave;
    const dCenter = Math.hypot(dx, dy);
    const minCenterClear = 152;
    if (i > 0 && i < steps && dCenter < minCenterClear) {
      const pushAng = Math.atan2(dy || perpY, dx || perpX);
      dx = Math.cos(pushAng) * minCenterClear;
      dy = Math.sin(pushAng) * minCenterClear;
    }
    pts.push({ dx: Math.round(dx), dy: Math.round(dy) });
  }
  return pts;
}
var ARCHIPELAGO_TEMPLATES = {
  cradle: {
    id: "cradle",
    name: "Cradle Isle",
    subtitle: "Sunlit meadow basin with mossy spring, winding stream & sheltered coastal coves.",
    biome: "meadow",
    terrainStyle: "basin",
    roleTag: "homeland",
    baseRx: 780,
    baseRy: 550,
    baseElev: 0.72,
    defaultCultureId: "hearthfolk",
    hasSpring: true,
    hasWaterfall: false,
    riverCountRange: [1, 2],
    ringBand: "center",
    oreRichness: "stone",
    soilQuality: 0.95
  },
  timbercrown: {
    id: "timbercrown",
    name: "Timbercrown Cliffside",
    subtitle: "Steep cedar cliffside escarpment home to the Cedarwood Sylvans.",
    biome: "pine",
    terrainStyle: "cliffside",
    roleTag: "timber",
    baseRx: 840,
    baseRy: 470,
    baseElev: 5.6,
    defaultCultureId: "sylvan",
    hasSpring: true,
    hasWaterfall: true,
    riverCountRange: [1, 1],
    ringBand: "inner",
    oreRichness: "stone",
    soilQuality: 0.85
  },
  sunterrace: {
    id: "sunterrace",
    name: "Sun-Terrace Rivers",
    subtitle: "Expansive multi-river valley of fertile golden loam, coastal estuaries & cascades.",
    biome: "terrace",
    terrainStyle: "multi_river",
    roleTag: "harvest",
    baseRx: 940,
    baseRy: 640,
    baseElev: 0.92,
    defaultCultureId: "hearthfolk",
    hasSpring: true,
    hasWaterfall: false,
    riverCountRange: [2, 3],
    ringBand: "inner",
    oreRichness: "none",
    soilQuality: 1.32
  },
  starbloom: {
    id: "starbloom",
    name: "Starbloom Ruins",
    subtitle: "Jade-meadow exploration sanctuary with ancient ruins, rivers, orchards & spring coves.",
    biome: "ruins",
    terrainStyle: "ruins",
    roleTag: "exploration",
    baseRx: 700,
    baseRy: 515,
    baseElev: 1.45,
    defaultCultureId: "hearthfolk",
    hasSpring: true,
    hasWaterfall: true,
    riverCountRange: [1, 1],
    ringBand: "inner",
    oreRichness: "stone",
    soilQuality: 1.15
  },
  coppercrag: {
    id: "coppercrag",
    name: "Copper-Crag Spire",
    subtitle: "Steep basalt caldera & mineral crags settled by the Cragforge Smiths.",
    biome: "crag",
    terrainStyle: "caldera",
    roleTag: "forge",
    baseRx: 620,
    baseRy: 460,
    baseElev: 6.4,
    defaultCultureId: "cragforge",
    hasSpring: false,
    hasWaterfall: true,
    riverCountRange: [0, 0],
    ringBand: "outer",
    oreRichness: "rich_metals",
    soilQuality: 0.55
  },
  mistatoll: {
    id: "mistatoll",
    name: "Outer Mist Atoll",
    subtitle: "Crescent sea-cliff lagoon opening into tranquil turquoise shoals.",
    biome: "mist_atoll",
    terrainStyle: "atoll",
    roleTag: "harbor",
    baseRx: 540,
    baseRy: 410,
    baseElev: 0.62,
    defaultCultureId: "mist_mariner",
    hasSpring: true,
    hasWaterfall: false,
    riverCountRange: [0, 0],
    ringBand: "outer",
    oreRichness: "stone",
    soilQuality: 0.8
  },
  embervault: {
    id: "embervault",
    name: "Ashen Bastion",
    subtitle: "Unbridged volcanic fortress holding rich iron vaults\u2014guarded by the hostile Ashen Bastion.",
    biome: "volcanic",
    terrainStyle: "volcanic",
    roleTag: "battle",
    baseRx: 660,
    baseRy: 480,
    baseElev: 4.5,
    defaultCultureId: "ashen_raider",
    hasSpring: false,
    hasWaterfall: false,
    riverCountRange: [0, 0],
    ringBand: "outer",
    oreRichness: "rich_metals",
    soilQuality: 0.45
  },
  frostpeak: {
    id: "frostpeak",
    name: "Frostpeak Massif",
    subtitle: "Towering unbridged alpine massif with snow ridges, mountain stream & iron veins.",
    biome: "frost",
    terrainStyle: "mountain",
    roleTag: "alpine",
    baseRx: 780,
    baseRy: 560,
    baseElev: 8.2,
    defaultCultureId: "cragforge",
    hasSpring: true,
    hasWaterfall: true,
    riverCountRange: [0, 1],
    ringBand: "outer",
    oreRichness: "rich_metals",
    soilQuality: 0.4
  }
};
var ISLAND_ORDER = [
  "cradle",
  "timbercrown",
  "sunterrace",
  "coppercrag",
  "mistatoll",
  "starbloom",
  "embervault",
  "frostpeak"
];
function shuffleWithRng(items, rng) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
function generateSeededArchipelago(seed) {
  const rng = mulberry32(seed);
  const placed = {};
  const marginX = 760;
  const marginY = 660;
  const cradleTpl = ARCHIPELAGO_TEMPLATES.cradle;
  const cradleRx = Math.round(cradleTpl.baseRx * (0.9 + rng() * 0.2));
  const cradleRy = Math.round(cradleTpl.baseRy * (0.9 + rng() * 0.2));
  const cradleCx = Math.round(2850 + rng() * 1900);
  const cradleCy = Math.round(2050 + rng() * 1100);
  placed.cradle = { centerX: cradleCx, centerY: cradleCy, radiusX: cradleRx, radiusY: cradleRy };
  const overlapsAny = (cx, cy, rx, ry, minGap) => {
    if (cx - rx < marginX || cx + rx > WORLD_WIDTH - marginX) return true;
    if (cy - ry < marginY || cy + ry > WORLD_HEIGHT - marginY) return true;
    for (const p of Object.values(placed)) {
      if (!p) continue;
      const dx = cx - p.centerX;
      const dy = cy - p.centerY;
      const nx = dx / (rx + p.radiusX + minGap);
      const ny = dy / (ry + p.radiusY + minGap);
      if (nx * nx + ny * ny < 1.05) return true;
    }
    return false;
  };
  const innerIds = shuffleWithRng(["timbercrown", "sunterrace", "starbloom"], rng);
  const outerIds = shuffleWithRng(["coppercrag", "mistatoll", "embervault", "frostpeak"], rng);
  const baseInnerPhase = rng() * Math.PI * 2;
  const baseOuterPhase = rng() * Math.PI * 2;
  const placeRing = (ids, baseAngle, distMin, distMax) => {
    for (let idx = 0; idx < ids.length; idx++) {
      const id = ids[idx];
      const tpl = ARCHIPELAGO_TEMPLATES[id];
      const rx = Math.round(tpl.baseRx * (0.86 + rng() * 0.26));
      const ry = Math.round(tpl.baseRy * (0.86 + rng() * 0.26));
      let chosenX = cradleCx + 1500;
      let chosenY = cradleCy;
      let found = false;
      for (const gap of [300, 220, 150]) {
        for (let attempt = 0; attempt < 90; attempt++) {
          const sectorAng = baseAngle + idx / ids.length * Math.PI * 2 + (rng() - 0.5) * (attempt < 24 ? 0.85 : Math.PI * 1.4);
          const dist = distMin + rng() * (distMax - distMin);
          const cx = Math.round(cradleCx + Math.cos(sectorAng) * dist * 1.24);
          const cy = Math.round(cradleCy + Math.sin(sectorAng) * dist * 0.92);
          if (!overlapsAny(cx, cy, rx, ry, gap)) {
            chosenX = cx;
            chosenY = cy;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        for (let attempt = 0; attempt < 220; attempt++) {
          const cx = Math.round(marginX + rx + rng() * (WORLD_WIDTH - (marginX + rx) * 2));
          const cy = Math.round(marginY + ry + rng() * (WORLD_HEIGHT - (marginY + ry) * 2));
          if (!overlapsAny(cx, cy, rx, ry, 140)) {
            chosenX = cx;
            chosenY = cy;
            break;
          }
        }
      }
      placed[id] = { centerX: chosenX, centerY: chosenY, radiusX: rx, radiusY: ry };
    }
  };
  placeRing(innerIds, baseInnerPhase, 1380, 1850);
  placeRing(outerIds, baseOuterPhase, 2250, 3200);
  const defs = {};
  for (const id of ISLAND_ORDER) {
    const tpl = ARCHIPELAGO_TEMPLATES[id];
    const box = placed[id];
    const coastSeed = Math.floor(rng() * 1e6) + 1;
    const coastRotRad = Number((rng() * Math.PI * 2).toFixed(3));
    const ridgeAngle = Number((rng() * Math.PI * 2).toFixed(3));
    const elevationY = Number((tpl.baseElev * (0.88 + rng() * 0.24)).toFixed(2));
    let springOffset;
    if (tpl.hasSpring) {
      const sAng = rng() * Math.PI * 2;
      const sRad = 0.28 + rng() * 0.22;
      let sdx = Math.round(Math.cos(sAng) * box.radiusX * sRad);
      let sdy = Math.round(Math.sin(sAng) * box.radiusY * sRad);
      if (Math.hypot(sdx, sdy) < 175) {
        const push = 178 / Math.max(1, Math.hypot(sdx, sdy));
        sdx = Math.round(sdx * push);
        sdy = Math.round(sdy * push);
      }
      springOffset = { dx: sdx, dy: sdy };
    }
    const rawToCradle = id === "cradle" ? rng() * Math.PI * 2 : Math.atan2(cradleCy - box.centerY, cradleCx - box.centerX);
    const dockAngleRad = rawToCradle + (rng() - 0.5) * 0.65;
    let waterfallAngle;
    if (tpl.hasWaterfall) {
      waterfallAngle = dockAngleRad + (rng() > 0.5 ? 1 : -1) * (1.25 + rng() * 1.15);
    }
    const coveAngles = [dockAngleRad];
    const riverMouthAngles = [];
    const minRiv = tpl.riverCountRange[0];
    const maxRiv = tpl.riverCountRange[1];
    const riverCount = maxRiv > minRiv ? minRiv + Math.floor(rng() * (maxRiv - minRiv + 1)) : minRiv;
    for (let r = 0; r < riverCount; r++) {
      let mouthAng = r === 0 && waterfallAngle !== void 0 && (id === "timbercrown" || id === "frostpeak") ? waterfallAngle : dockAngleRad + Math.PI * (0.45 + r * 0.62) + (rng() - 0.5) * 0.42;
      if (Math.abs(wrapAngleDiff(mouthAng, dockAngleRad)) < 0.52) {
        mouthAng = dockAngleRad + (r % 2 === 0 ? 0.78 : -0.78);
      }
      riverMouthAngles.push(mouthAng);
      if (!(tpl.hasWaterfall && waterfallAngle !== void 0 && Math.abs(wrapAngleDiff(mouthAng, waterfallAngle)) < 0.25)) {
        coveAngles.push(mouthAng);
      }
    }
    let lagoonOffset;
    let trenchOffset;
    if (id === "mistatoll") {
      const lAng = dockAngleRad + (rng() - 0.5) * 0.5;
      lagoonOffset = {
        lx: Number((Math.cos(lAng) * 0.16).toFixed(3)),
        ly: Number((Math.sin(lAng) * 0.16).toFixed(3))
      };
    } else if (id === "embervault") {
      const tAng = rng() * Math.PI * 2;
      trenchOffset = {
        lx: Number((Math.cos(tAng) * 0.34).toFixed(3)),
        ly: Number((Math.sin(tAng) * 0.34).toFixed(3))
      };
    }
    const partialDef = {
      id,
      name: tpl.name,
      subtitle: tpl.subtitle,
      biome: tpl.biome,
      terrainStyle: tpl.terrainStyle,
      roleTag: tpl.roleTag,
      centerX: box.centerX,
      centerY: box.centerY,
      radiusX: box.radiusX,
      radiusY: box.radiusY,
      elevationY,
      defaultCultureId: tpl.defaultCultureId,
      hasSpring: tpl.hasSpring,
      springOffset,
      hasWaterfall: tpl.hasWaterfall,
      waterfallAngle,
      coastSeed,
      coastRotRad,
      ridgeAngle,
      coveAngles,
      riverMouthAngles,
      dockAngleRad,
      lagoonOffset,
      trenchOffset,
      oreRichness: tpl.oreRichness,
      soilQuality: tpl.soilQuality
    };
    const wobbleAt = (ang) => islandCoastWobble(partialDef, ang);
    const rivers = [];
    for (let r = 0; r < riverCount; r++) {
      const mouthAng = riverMouthAngles[r];
      let startDx;
      let startDy;
      if (r === 0 && springOffset) {
        startDx = springOffset.dx;
        startDy = springOffset.dy;
      } else {
        const headAng = mouthAng + Math.PI + (rng() - 0.5) * 0.7;
        const headR = 0.26 + rng() * 0.24;
        startDx = Math.round(Math.cos(headAng) * box.radiusX * headR);
        startDy = Math.round(Math.sin(headAng) * box.radiusY * headR);
      }
      const width = id === "sunterrace" ? Math.round(48 + rng() * 14) : Math.round(38 + rng() * 12);
      const pts = buildSplineRiverPoints(
        box.radiusX,
        box.radiusY,
        wobbleAt,
        startDx,
        startDy,
        mouthAng,
        rng,
        r % 2 === 0 ? 1 : -1
      );
      rivers.push({ width, points: pts });
    }
    if (rivers.length > 0) {
      partialDef.rivers = rivers;
    }
    const ponds = [];
    if (id === "cradle" || id === "sunterrace" || id === "starbloom") {
      const pondAng = dockAngleRad + Math.PI * (0.72 + rng() * 0.56);
      const pondR = 0.42 + rng() * 0.14;
      const pdx = Math.round(Math.cos(pondAng) * box.radiusX * pondR);
      const pdy = Math.round(Math.sin(pondAng) * box.radiusY * pondR);
      if (!springOffset || Math.hypot(pdx - springOffset.dx, pdy - springOffset.dy) > 160) {
        ponds.push({
          dx: pdx,
          dy: pdy,
          rx: Math.round(42 + rng() * 22),
          ry: Math.round(34 + rng() * 18)
        });
      }
    }
    if (ponds.length > 0) {
      partialDef.ponds = ponds;
    }
    defs[id] = {
      ...partialDef,
      dockSpot: createDockSpot(partialDef, dockAngleRad)
    };
  }
  return defs;
}
var ISLAND_DEFS = generateSeededArchipelago(DEFAULT_WORLD_SEED);
var PLAYER_VILLAGE_ISLANDS = [
  "cradle",
  "sunterrace",
  "timbercrown",
  "starbloom",
  "coppercrag",
  "mistatoll"
];
function getSocialTier(score) {
  if (score < 15) return { id: "rival", label: "Rival", color: "#E38589" };
  if (score < 28) return { id: "stranger", label: "Stranger", color: "#9EB1C2" };
  if (score < 45) return { id: "acquaintance", label: "Acquaintance", color: "#D8CEBA" };
  if (score < 62) return { id: "guest", label: "Guest", color: "#A8D8EA" };
  if (score < 78) return { id: "friend", label: "Friend", color: "#8CE0AC" };
  if (score < 90) return { id: "confidant", label: "Confidant", color: "#FDE68A" };
  return { id: "bonded", label: "Bonded Kin", color: "#F472B6" };
}
function createBridgeSpec(id, name, fromIsland, toIsland, tier, requiredTechId, costTimber, costStone, defs = ISLAND_DEFS) {
  const fromDef = defs[fromIsland];
  const toDef = defs[toIsland];
  const ang = Math.atan2(toDef.centerY - fromDef.centerY, toDef.centerX - fromDef.centerX);
  const p1 = getIslandRimPoint(fromDef, ang, 0.92);
  const p2 = getIslandRimPoint(toDef, ang + Math.PI, 0.92);
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
    costStone
  };
}
function createCablewaySpec(id, name, fromIsland, toIsland, requiredTechId, costTimber, costStone, costIron, defs = ISLAND_DEFS) {
  const fromDef = defs[fromIsland];
  const toDef = defs[toIsland];
  const ang = Math.atan2(toDef.centerY - fromDef.centerY, toDef.centerX - fromDef.centerX);
  const p1 = getIslandRimPoint(fromDef, ang, 0.88);
  const p2 = getIslandRimPoint(toDef, ang + Math.PI, 0.88);
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
    passengerIds: []
  };
}
function buildSkyBridgesForDefs(defs) {
  return [
    createBridgeSpec(
      "bridge_cradle_sun",
      "Sun-Terrace Causeway",
      "cradle",
      "sunterrace",
      1,
      "rope_bridges",
      26,
      12,
      defs
    ),
    createBridgeSpec(
      "bridge_cradle_timber",
      "Timbercrown Sky-Bridge",
      "cradle",
      "timbercrown",
      1,
      "rope_bridges",
      32,
      16,
      defs
    ),
    createBridgeSpec(
      "bridge_cradle_starbloom",
      "Starbloom Pilgrim Span",
      "cradle",
      "starbloom",
      1,
      "rope_bridges",
      28,
      14,
      defs
    ),
    createBridgeSpec(
      "bridge_timber_crag",
      "Copper-Crag High Arch",
      "timbercrown",
      "coppercrag",
      2,
      "sky_causeways",
      44,
      36,
      defs
    )
  ];
}
function buildSkyCablewaysForDefs(defs) {
  return [
    createCablewaySpec(
      "cable_timber_frost",
      "Frostpeak Glacier Gondola",
      "timbercrown",
      "frostpeak",
      "cliff_cableways",
      34,
      26,
      4,
      defs
    ),
    createCablewaySpec(
      "cable_crag_frost",
      "High-Iron Alpine Line",
      "coppercrag",
      "frostpeak",
      "cliff_cableways",
      38,
      30,
      6,
      defs
    ),
    createCablewaySpec(
      "cable_starbloom_timber",
      "Cedar-Starlight Aerial Line",
      "starbloom",
      "timbercrown",
      "cliff_cableways",
      30,
      20,
      2,
      defs
    ),
    createCablewaySpec(
      "cable_mist_ember",
      "Bastion Cliff Zipline",
      "mistatoll",
      "embervault",
      "cliff_cableways",
      36,
      28,
      8,
      defs
    )
  ];
}
var INITIAL_SKY_BRIDGES = buildSkyBridgesForDefs(ISLAND_DEFS);
var INITIAL_SKY_CABLEWAYS = buildSkyCablewaysForDefs(ISLAND_DEFS);
var activeArchipelagoSeed = DEFAULT_WORLD_SEED;
function applyArchipelagoSeed(seed) {
  const normalizedSeed = Math.floor(Math.abs(seed)) || DEFAULT_WORLD_SEED;
  if (normalizedSeed === activeArchipelagoSeed) return;
  activeArchipelagoSeed = normalizedSeed;
  const generated = generateSeededArchipelago(normalizedSeed);
  for (const id of ISLAND_ORDER) {
    ISLAND_DEFS[id] = generated[id];
  }
  const nextBridges = buildSkyBridgesForDefs(ISLAND_DEFS);
  INITIAL_SKY_BRIDGES.splice(0, INITIAL_SKY_BRIDGES.length, ...nextBridges);
  const nextCables = buildSkyCablewaysForDefs(ISLAND_DEFS);
  INITIAL_SKY_CABLEWAYS.splice(0, INITIAL_SKY_CABLEWAYS.length, ...nextCables);
}
var TRAVELER_ATTITUDE_META = {
  warm: {
    label: "Warm & Earnest",
    toneColor: "#74C294",
    quotes: [
      "Your hearth smoke rose above the clouds\u2014I bring willing hands and stories.",
      "Peace to your shore! May I share tonight\u2019s fire and mend nets?"
    ]
  },
  humble: {
    label: "Quiet & Humble",
    toneColor: "#A8D0E6",
    quotes: [
      "I ask only a dry corner beside the fire to tend tubers and carve wood.",
      "My skiff broke against the reef\u2014I walk gently and keep my word."
    ]
  },
  boisterous: {
    label: "Lively & Bold",
    toneColor: "#E5AF47",
    quotes: [
      "What a view across the sky-sea! Give me a spear and point toward wild boars!",
      "Plenty of cheer where I sail\u2014let us bake loaves and chart the mist!"
    ]
  },
  aloof: {
    label: "Guarded & Aloof",
    toneColor: "#B8B0C8",
    quotes: [
      "I keep my own watch, though I pull an oar if the isle stays fair.",
      "Not one for chatter\u2014just looking for honest work and dry wool."
    ]
  },
  restless: {
    label: "Restless Rover",
    toneColor: "#E38589",
    quotes: [
      "Can\u2019t promise I stay past winter, unless your ships sail into the mist.",
      "I\u2019ve seen three islands fall to frost\u2014show me a stout hearth first."
    ]
  }
};
var ERA_LABELS = {
  1: { name: "Era I \xB7 Bare Awakening", subtitle: "Wild berries, flint sparks, and the first shared bonfire." },
  2: { name: "Era II \xB7 Hearth & Pasture", subtitle: "Timber cottages, cultivated crops, livestock, and sky-bridges." },
  3: { name: "Era III \xB7 Maritime Clans", subtitle: "Wind-gliders, cableways, cargo sails, and outer-island ruins." },
  4: { name: "Era IV \xB7 Iron Archipelago", subtitle: "High-arch causeways, orchards, war galleys, and siege realms." }
};
var SEASON_META = {
  spring: {
    label: "Spring",
    festivalName: "First-Sprout Vigil",
    weatherWeights: ["clear", "clear", "rain", "mist", "breeze"]
  },
  summer: {
    label: "Summer",
    festivalName: "Sky-Sea Regatta",
    weatherWeights: ["clear", "clear", "clear", "breeze", "rain"]
  },
  autumn: {
    label: "Autumn",
    festivalName: "Harvest & Cider Feast",
    weatherWeights: ["breeze", "breeze", "clear", "mist", "rain"]
  },
  winter: {
    label: "Winter",
    festivalName: "Solstice Hearth Night",
    weatherWeights: ["snow", "snow", "clear", "mist", "clear"]
  }
};
var COMFORT_LABELS = {
  bread: "Warm Bread",
  tea: "Herbal Tea",
  honey: "Meadow Honey"
};
var TRAITS = {
  hard_skin: {
    id: "hard_skin",
    name: "Iron-Hide",
    polarity: "positive",
    summary: "Calloused thick skin: -65% chance to bleed, -18% physical damage taken, slightly slower stride (-5%).",
    workSpeedMult: 1.04,
    moodDrift: 0.05,
    energyDrainMult: 0.96,
    obedienceMod: 0.05,
    bleedChanceMult: 0.35,
    damageTakenMult: 0.82,
    hpMaxMod: 16,
    moveSpeedMult: 0.95
  },
  glass_cannon: {
    id: "glass_cannon",
    name: "Edge-Striker",
    polarity: "positive",
    summary: "+24% attack strike power, -12 max HP and +15% vulnerability when struck.",
    workSpeedMult: 1.05,
    moodDrift: 0,
    energyDrainMult: 1.04,
    obedienceMod: -0.02,
    attackPowerMult: 1.24,
    damageTakenMult: 1.15,
    hpMaxMod: -12
  },
  calculated_mind: {
    id: "calculated_mind",
    name: "Calculated Mind",
    polarity: "positive",
    summary: "+28% Knowledge XP & +35% faster skill teaching; slightly hesitant in melee (-8% attack).",
    workSpeedMult: 1.08,
    moodDrift: 0.1,
    energyDrainMult: 0.98,
    obedienceMod: 0.1,
    knowledgeMult: 1.28,
    teachRateMult: 1.35,
    attackPowerMult: 0.92
  },
  pain_dampener: {
    id: "pain_dampener",
    name: "Pain-Dampener",
    polarity: "positive",
    summary: "Ignores minor wounds: -35% bleed tick severity and fights steadily at low HP.",
    workSpeedMult: 1.05,
    moodDrift: 0.1,
    energyDrainMult: 0.95,
    obedienceMod: 0.06,
    bleedChanceMult: 0.65,
    damageTakenMult: 0.9,
    braveryMod: 0.22
  },
  danger_sense: {
    id: "danger_sense",
    name: "Sixth Warning",
    polarity: "positive",
    summary: "Anticipates ambushes: -14% incoming damage & spots raiders early.",
    workSpeedMult: 1.02,
    moodDrift: 0.05,
    energyDrainMult: 0.98,
    obedienceMod: 0.04,
    damageTakenMult: 0.86,
    curiosityMod: 0.14
  },
  swift_recovery: {
    id: "swift_recovery",
    name: "Mending Blood",
    polarity: "positive",
    summary: "Wounds clot & heal 45% faster beside hearths and springs.",
    workSpeedMult: 1,
    moodDrift: 0.15,
    energyDrainMult: 0.94,
    obedienceMod: 0.08,
    healRateMult: 1.45,
    bleedChanceMult: 0.72
  },
  lone_wolf: {
    id: "lone_wolf",
    name: "Lone Vanguard",
    polarity: "positive",
    summary: "+16% gather & combat focus when away from crowds, slower social warmth.",
    workSpeedMult: 1.16,
    moodDrift: -0.05,
    energyDrainMult: 0.94,
    obedienceMod: -0.1,
    attackPowerMult: 1.12,
    socialAura: -0.15
  },
  adaptation: {
    id: "adaptation",
    name: "Adaptive Grit",
    polarity: "positive",
    summary: "Learns skills & repairs structures 20% quicker through adversity.",
    workSpeedMult: 1.14,
    moodDrift: 0.1,
    energyDrainMult: 0.92,
    obedienceMod: 0.08,
    teachRateMult: 1.2,
    knowledgeMult: 1.15
  },
  master_artisan: {
    id: "master_artisan",
    name: "Stonewright Eye",
    polarity: "positive",
    summary: "+22% resource yield from stone, timber & ore nodes.",
    workSpeedMult: 1.14,
    moodDrift: 0.1,
    energyDrainMult: 0.96,
    obedienceMod: 0.1,
    gatherYieldMult: 1.22
  },
  bloodline_vigor: {
    id: "bloodline_vigor",
    name: "Sturdy Lineage",
    polarity: "positive",
    summary: "+22 max HP & steady endurance across long winters.",
    workSpeedMult: 1.04,
    moodDrift: 0.12,
    energyDrainMult: 0.88,
    obedienceMod: 0.08,
    hpMaxMod: 22
  },
  curious_scout: {
    id: "curious_scout",
    name: "Horizon-Curious",
    polarity: "positive",
    summary: "Volunteers to cross bridges, glide cliffs, sail boats & uncover ruins.",
    workSpeedMult: 1.06,
    moodDrift: 0.2,
    energyDrainMult: 0.94,
    obedienceMod: 0.04,
    curiosityMod: 0.42,
    moveSpeedMult: 1.08
  },
  green_thumb: {
    id: "green_thumb",
    name: "Seed Keeper",
    polarity: "positive",
    summary: "+28% crop growth, herb care & foraging yield.",
    workSpeedMult: 1.24,
    moodDrift: 0.35,
    energyDrainMult: 0.95,
    obedienceMod: 0.1,
    gatherYieldMult: 1.18
  },
  brave_hunter: {
    id: "brave_hunter",
    name: "Stout-Hearted",
    polarity: "positive",
    summary: "Fearless against wild boars & Ashen Bastion raiders (+14% strike power).",
    workSpeedMult: 1.1,
    moodDrift: 0.15,
    energyDrainMult: 0.92,
    obedienceMod: 0.06,
    braveryMod: 0.38,
    attackPowerMult: 1.14
  },
  warmhearted: {
    id: "warmhearted",
    name: "Warmhearted",
    polarity: "positive",
    summary: "Lifts neighbors\u2019 spirits, speeds skill teaching (+25%) & builds trust.",
    workSpeedMult: 1.05,
    moodDrift: 0.45,
    energyDrainMult: 1,
    obedienceMod: 0.18,
    socialAura: 0.5,
    teachRateMult: 1.25
  },
  clever_crafter: {
    id: "clever_crafter",
    name: "Clever Hands",
    polarity: "positive",
    summary: "+25% building, smelting & carpentry speed.",
    workSpeedMult: 1.25,
    moodDrift: 0.2,
    energyDrainMult: 0.92,
    obedienceMod: 0.12
  },
  resilient: {
    id: "resilient",
    name: "Frost-Hardy",
    polarity: "positive",
    summary: "Resists winter chill and rain fatigue.",
    workSpeedMult: 1.1,
    moodDrift: 0.2,
    energyDrainMult: 0.82,
    obedienceMod: 0.14,
    hpMaxMod: 8
  },
  swift_footed: {
    id: "swift_footed",
    name: "Fleet-Footed",
    polarity: "positive",
    summary: "Moves 16% faster across cliffs & sky-bridges.",
    workSpeedMult: 1.1,
    moodDrift: 0.15,
    energyDrainMult: 0.94,
    obedienceMod: 0.08,
    curiosityMod: 0.16,
    moveSpeedMult: 1.16
  },
  hollow_boned: {
    id: "hollow_boned",
    name: "Thin-Skinned",
    polarity: "negative",
    summary: "Fragile frame: +45% bleeding chance & -12 max HP, moves lightly (+6%).",
    workSpeedMult: 0.98,
    moodDrift: -0.08,
    energyDrainMult: 1.05,
    obedienceMod: 0.04,
    bleedChanceMult: 1.45,
    hpMaxMod: -12,
    moveSpeedMult: 1.06
  },
  slow_healer: {
    id: "slow_healer",
    name: "Slow Clotting",
    polarity: "negative",
    summary: "Recovers HP 30% slower after injuries or raids.",
    workSpeedMult: 0.96,
    moodDrift: -0.1,
    energyDrainMult: 1.04,
    obedienceMod: 0.02,
    healRateMult: 0.7,
    bleedChanceMult: 1.25
  },
  curse_magnet: {
    id: "curse_magnet",
    name: "Jinxed Step",
    polarity: "negative",
    summary: "Draws extra trouble in skirmishes (+14% incoming damage), learns grit (+10% XP).",
    workSpeedMult: 0.95,
    moodDrift: -0.18,
    energyDrainMult: 1.06,
    obedienceMod: -0.05,
    damageTakenMult: 1.14,
    knowledgeMult: 1.1
  },
  cautious_homebody: {
    id: "cautious_homebody",
    name: "Homebound",
    polarity: "negative",
    summary: "Wary of strangers & avoids risky sea voyages.",
    workSpeedMult: 0.96,
    moodDrift: 0.05,
    energyDrainMult: 0.96,
    obedienceMod: 0.06,
    curiosityMod: -0.32
  },
  rain_shy: {
    id: "rain_shy",
    name: "Chill-Prone",
    polarity: "negative",
    summary: "Loses warmth faster in rain or snow; seeks hearth.",
    workSpeedMult: 0.92,
    moodDrift: -0.25,
    energyDrainMult: 1.08,
    obedienceMod: -0.1,
    rainSensitive: true
  },
  stubborn: {
    id: "stubborn",
    name: "Willful",
    polarity: "negative",
    summary: "Follows own judgment over divine whispers.",
    workSpeedMult: 1.04,
    moodDrift: -0.1,
    energyDrainMult: 1,
    obedienceMod: -0.34
  },
  timid: {
    id: "timid",
    name: "Skittish",
    polarity: "negative",
    summary: "Flees boars & raiders unless defended by guards.",
    workSpeedMult: 0.92,
    moodDrift: -0.15,
    energyDrainMult: 1.05,
    obedienceMod: 0.1,
    braveryMod: -0.32
  },
  melancholic: {
    id: "melancholic",
    name: "Wistful",
    polarity: "negative",
    summary: "Grieves deeply during winter or scarcity.",
    workSpeedMult: 0.94,
    moodDrift: -0.38,
    energyDrainMult: 1.02,
    obedienceMod: -0.06
  }
};
var POSITIVE_TRAIT_IDS = Object.values(TRAITS).filter((t) => t.polarity === "positive").map((t) => t.id);
var NEGATIVE_TRAIT_IDS = Object.values(TRAITS).filter((t) => t.polarity === "negative").map((t) => t.id);
var SKILL_META = {
  woodcraft: { label: "Woodcraft", category: "harvest", summary: "Faster tree felling & +timber yield." },
  stonecraft: { label: "Stonecraft", category: "harvest", summary: "Faster boulder gathering & quarry yield." },
  foraging: { label: "Foraging", category: "harvest", summary: "Finds extra wild berries, twigs & herbs." },
  herbalism: { label: "Herbalism", category: "lore", summary: "Tends wounds, slows bleeding & brews tea." },
  farming: { label: "Farming", category: "harvest", summary: "Accelerates crop growth & harvest yields." },
  husbandry: { label: "Husbandry", category: "harvest", summary: "Calms pasture animals & boosts wool/meat." },
  masonry: { label: "Masonry", category: "craft", summary: "Speeds building construction & repairs." },
  metallurgy: { label: "Metallurgy", category: "craft", summary: "Improves smelting copper, bronze & iron." },
  blade_mastery: { label: "Blade Mastery", category: "combat", summary: "Raises spear & sword melee damage + bleed chance." },
  archery: { label: "Archery", category: "combat", summary: "Boosts bow damage, range & hunting precision." },
  tactics: { label: "Tactics", category: "combat", summary: "Reduces damage taken & steadies defense." },
  seamanship: { label: "Seamanship", category: "lore", summary: "Boosts fishing, sailing & glider navigation." }
};
var ALL_SKILL_IDS = Object.keys(SKILL_META);
function rollUnitStats(traits, isRaider = false) {
  const randStat = (base) => Math.max(4, Math.min(18, base + Math.floor(Math.random() * 6) - 2));
  let str = randStat(isRaider ? 10 : 8);
  let agi = randStat(8);
  let end = randStat(isRaider ? 10 : 8);
  let int = randStat(isRaider ? 7 : 9);
  let bleedResist = 0.08 + end * 0.015;
  for (const tid of traits) {
    if (tid === "hard_skin") {
      end = Math.min(18, end + 3);
      agi = Math.max(4, agi - 1);
      bleedResist += 0.45;
    } else if (tid === "glass_cannon") {
      str = Math.min(18, str + 3);
      end = Math.max(4, end - 2);
    } else if (tid === "calculated_mind") {
      int = Math.min(18, int + 3);
    } else if (tid === "swift_footed") {
      agi = Math.min(18, agi + 3);
    } else if (tid === "hollow_boned") {
      end = Math.max(4, end - 2);
      bleedResist = Math.max(0, bleedResist - 0.12);
    } else if (tid === "bloodline_vigor") {
      end = Math.min(18, end + 2);
      str = Math.min(18, str + 1);
    } else if (tid === "swift_recovery" || tid === "pain_dampener") {
      bleedResist += 0.22;
    }
  }
  return {
    strength: str,
    agility: agi,
    endurance: end,
    intellect: int,
    bleedResist: Math.max(0, Math.min(0.88, Number(bleedResist.toFixed(2)))),
    bleedStack: 0,
    bleedTimer: 0
  };
}
function rollStarterSkills(lifeStage, isRaider = false) {
  if (lifeStage === "infant") return {};
  const skills = {};
  const count = lifeStage === "elder" ? 3 : 2;
  const pool = isRaider ? ["blade_mastery", "archery", "tactics", "stonecraft"] : [...ALL_SKILL_IDS];
  for (let i = 0; i < count; i++) {
    const sk = pickRandom(pool);
    skills[sk] = Math.max(skills[sk] ?? 0, lifeStage === "elder" ? 2 : 1);
  }
  return skills;
}
function inheritBabyTraits(parents) {
  if (!parents || parents.length === 0) return rollBalancedTraits();
  const parentPool = Array.from(new Set(parents.flatMap((p) => p.traits))).filter((id) => Boolean(TRAITS[id]));
  const chosen = [];
  if (parentPool.length > 0) {
    const first = pickRandom(parentPool);
    chosen.push(first);
    if (parentPool.length > 1 && Math.random() < 0.48) {
      const secondPool = parentPool.filter((id) => id !== first);
      if (secondPool.length > 0) chosen.push(pickRandom(secondPool));
    }
  }
  const hasPos = chosen.some((id) => TRAITS[id]?.polarity === "positive");
  const hasNeg = chosen.some((id) => TRAITS[id]?.polarity === "negative");
  if (!hasPos) {
    const pool = POSITIVE_TRAIT_IDS.filter((id) => !chosen.includes(id));
    if (pool.length > 0) chosen.push(pickRandom(pool));
  }
  if (!hasNeg && (chosen.length < 3 || Math.random() < 0.7)) {
    const pool = NEGATIVE_TRAIT_IDS.filter((id) => !chosen.includes(id));
    if (pool.length > 0) chosen.push(pickRandom(pool));
  }
  return chosen.slice(0, 3);
}
var TASKS = [
  { id: "forage", key: "1", label: "Forage", verb: "Gathering berries & kindling" },
  { id: "gather_stone", key: "Q", label: "Stone", verb: "Gathering field stones & flint" },
  { id: "chop", key: "2", label: "Woodcraft", verb: "Cutting cedar & timber" },
  { id: "hunt", key: "3", label: "Hunt", verb: "Tracking wild game", requiredTechId: "flint_spears" },
  { id: "farm", key: "4", label: "Farm", verb: "Tending cultivated crops", requiredTechId: "wild_botany" },
  { id: "pasture", key: "5", label: "Pasture", verb: "Herding sheep & livestock", requiredTechId: "animal_husbandry" },
  { id: "quarry", key: "6", label: "Quarry", verb: "Mining stone & ore", requiredTechId: "masonry_bakery" },
  { id: "fish", key: "7", label: "Fish", verb: "Netting sky-sea fish", requiredTechId: "dugout_docks" },
  { id: "bake", key: "8", label: "Bake", verb: "Baking hearth loaves", requiredTechId: "masonry_bakery" },
  { id: "study", key: "9", label: "Study", verb: "Writing & teaching cultural lore", requiredTechId: "scholarship" },
  { id: "smelt", key: "0", label: "Smelt", verb: "Forging bronze & iron", requiredTechId: "bronze_smelting" },
  { id: "guard", key: "G", label: "Guard", verb: "Patrolling watchtowers", requiredTechId: "archery_watch" },
  { id: "explore", key: "E", label: "Explore", verb: "Scouting ruins & horizons", requiredTechId: "rope_bridges" }
];
var TASK_BY_ID = Object.fromEntries(
  TASKS.map((t) => [t.id, t])
);
var CLOAK_PALETTES = [
  "#C26D4A",
  "#5A7D6C",
  "#5B7290",
  "#B88B4A",
  "#8C5E74",
  "#6E7F5E",
  "#A65C52",
  "#4F6D7A"
];
var HAIR_COLORS = ["#4A3525", "#7A5438", "#C48D52", "#2E2622", "#8B4A32", "#9A9792"];
var SKIN_TONES = ["#F4D5BD", "#E6BA9A", "#D19A74", "#B57952", "#FCE1CE"];
var FIRST_NAMES = [
  "Adam",
  "Eve",
  "Rowan",
  "Clara",
  "Finn",
  "Iris",
  "Bram",
  "Nora",
  "Theo",
  "Wren",
  "Alder",
  "Sylvie",
  "Otis",
  "Juniper",
  "Cedric",
  "Hazel",
  "Linden",
  "Maeve",
  "Jasper",
  "Faye",
  "Soren",
  "Kael",
  "Tamsin"
];
var LAST_NAMES = [
  "Ash",
  "Moss",
  "Briar",
  "Brook",
  "Thistle",
  "Fern",
  "Hollow",
  "Finch",
  "Reed",
  "Haven",
  "Meadows",
  "Lark",
  "Clover",
  "Crag",
  "Gale"
];
var BIO_OPENERS = [
  "A steady soul shaped by wind and hearth smoke,",
  "First to trace constellations above the floating cliffs,",
  "Keeps smooth flint shards and dried chamomile in a satchel,",
  "Quietly observant, reading sea ripples for changing squalls,",
  "Carves tiny timber boats by night beside the embers,"
];
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickRandomWish() {
  const wishes = ["tea", "bread", "honey", "hotspring", "chat", "explore"];
  return pickRandom(wishes);
}
function pickFavoriteComfort() {
  return pickRandom(["bread", "tea", "honey"]);
}
function buildBioFromTraits(traitIds, isChild = false) {
  const pos = traitIds.map((id) => TRAITS[id]).find((t) => t?.polarity === "positive");
  const neg = traitIds.map((id) => TRAITS[id]).find((t) => t?.polarity === "negative");
  if (isChild) {
    return `Raised among the archipelago fires${pos ? `, showing a ${pos.name.toLowerCase()} spirit` : ""}${neg ? ` and ${neg.name.toLowerCase()} streak` : ""}.`;
  }
  const opener = pickRandom(BIO_OPENERS);
  const posText = pos ? `blessed as ${pos.name.toLowerCase()}` : "handy by the camp";
  const negText = neg ? `though somewhat ${neg.name.toLowerCase()}` : "and calm under open skies";
  return `${opener} ${posText}, ${negText}.`;
}
function rollBalancedTraits(inheritedTraitId) {
  const chosen = [];
  if (inheritedTraitId && TRAITS[inheritedTraitId]) {
    chosen.push(inheritedTraitId);
  }
  const hasPos = chosen.some((id) => TRAITS[id]?.polarity === "positive");
  const hasNeg = chosen.some((id) => TRAITS[id]?.polarity === "negative");
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
function generateCandidate(kind, day, existingNames, parents) {
  const poolFirst = FIRST_NAMES.slice(2);
  let name = `${pickRandom(poolFirst)} ${pickRandom(LAST_NAMES)}`;
  let guard = 0;
  while (existingNames.has(name) && guard < 20) {
    name = `${pickRandom(poolFirst)} ${pickRandom(LAST_NAMES)}`;
    guard++;
  }
  const traits = kind === "birth" ? inheritBabyTraits(parents) : rollBalancedTraits();
  const lifeStage = kind === "birth" ? "infant" : Math.random() < 0.15 ? "elder" : "adult";
  const hairColor = lifeStage === "elder" ? "#B9B5AE" : pickRandom(HAIR_COLORS);
  const attitudePool = ["warm", "humble", "boisterous", "aloof", "restless"];
  const attitude = kind === "birth" ? "warm" : pickRandom(attitudePool);
  const quotes = TRAVELER_ATTITUDE_META[attitude].quotes;
  return {
    id: `arr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    name,
    bioDescription: kind === "birth" ? `Born beside the island hearth to ${parents?.map((p) => p.name.split(" ")[0]).join(" & ") ?? "loving kin"}.` : buildBioFromTraits(traits, false),
    lifeStage,
    cloakColor: pickRandom(CLOAK_PALETTES),
    hairColor,
    skinTone: pickRandom(SKIN_TONES),
    hairStyle: Math.floor(Math.random() * 4),
    traits,
    attitude,
    greetingLine: kind === "birth" ? "Soft peaceful breathing beside the warm embers." : pickRandom(quotes),
    greeterId: null,
    greeterName: null,
    deliberationTimer: kind === "birth" ? 0 : 12,
    decisionVerdict: kind === "birth" ? "recommend_welcome" : "talking",
    decisionReason: kind === "birth" ? "Every newborn is cherished in the archipelago." : null,
    godSuggestion: "neutral",
    favoriteComfort: pickFavoriteComfort(),
    parentIds: parents && parents.length === 2 ? [parents[0].id, parents[1].id] : null,
    parentNames: parents ? parents.map((p) => p.name.split(" ")[0]).join(" & ") : null,
    arrivedDay: day
  };
}
function getUpgradeCost(building) {
  const factor = building.unlocked ? Math.pow(1.8, building.level) : 1;
  const result = {};
  for (const [k, v] of Object.entries(building.baseCost)) {
    if (typeof v === "number") {
      result[k] = Math.round(v * factor);
    }
  }
  return result;
}
function isPointInsideIsland(island, wx, wy, margin = 18) {
  const rx = Math.max(20, island.radiusX - margin);
  const ry = Math.max(20, island.radiusY - margin);
  const dx = (wx - island.centerX) / rx;
  const dy = (wy - island.centerY) / ry;
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(island, ang);
  return Math.hypot(dx, dy) / wobble <= 1;
}
function getIslandAtPoint(wx, wy, margin = 0) {
  for (const id of ISLAND_ORDER) {
    const def = ISLAND_DEFS[id];
    if (isPointInsideIsland(def, wx, wy, margin)) return def;
  }
  return null;
}

// src/game/eventBus.ts
var MAX_WORLD_EVENTS = 200;
var eventSeq = 0;
function mapChronicleKindToEventCategory(kind) {
  switch (kind) {
    case "birth":
      return { category: "social", significance: "notable" };
    case "bond":
      return { category: "social", significance: "notable" };
    case "chief":
    case "governance":
      return { category: "rule", significance: "major" };
    case "arrival":
      return { category: "migration", significance: "notable" };
    case "voyage":
      return { category: "migration", significance: "notable" };
    case "build":
      return { category: "construction", significance: "notable" };
    case "era":
      return { category: "construction", significance: "major" };
    case "tech":
      return { category: "economy", significance: "notable" };
    case "festival":
      return { category: "social", significance: "notable" };
    case "war":
      return { category: "survival", significance: "major" };
    case "death":
      return { category: "survival", significance: "major" };
    case "ruin":
      return { category: "survival", significance: "major" };
    default:
      return { category: "social", significance: "minor" };
  }
}
function emitWorldEvent(world, input) {
  const summary = input.summary.trim();
  if (!summary) return null;
  if (!Array.isArray(world.eventLog)) {
    world.eventLog = [];
  }
  const day = input.day ?? world.environment?.dayCount ?? 1;
  const timeOfDay = input.timeOfDay ?? world.environment?.timeOfDay ?? 0.36;
  const islandId = input.islandId ?? world.localHomeIslandId ?? "cradle";
  const significance = input.significance ?? "minor";
  const dedupeWindow = input.dedupeWindow ?? 0.025;
  const recentDuplicate = world.eventLog.some(
    (ev2) => ev2.day === day && ev2.category === input.category && ev2.islandId === islandId && ev2.summary === summary && Math.abs(ev2.timeOfDay - timeOfDay) <= dedupeWindow
  );
  if (recentDuplicate) {
    return null;
  }
  eventSeq = (eventSeq + 1) % 1e5;
  const ev = {
    id: `ev_${day}_${eventSeq}_${Math.random().toString(36).slice(2, 6)}`,
    day,
    timeOfDay,
    category: input.category,
    significance,
    summary,
    islandId,
    participantIds: [...new Set((input.participantIds ?? []).filter(Boolean))],
    witnessIds: input.witnessIds ? [...new Set(input.witnessIds.filter(Boolean))] : void 0
  };
  world.eventLog.unshift(ev);
  if (world.eventLog.length > MAX_WORLD_EVENTS) {
    world.eventLog.length = MAX_WORLD_EVENTS;
  }
  return ev;
}

// src/game/personality.ts
function clamp01(val) {
  return Math.max(0.05, Math.min(0.98, Number(val.toFixed(2))));
}
function hashSeed(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
function derivePersonalityArchetype(p) {
  const candidates = [
    { label: "Pathfinder", score: p.curiosity * 1.15 + p.bravery * 0.45 - p.caution * 0.35 },
    { label: "Hearthkeeper", score: p.sociability * 0.8 + p.empathy * 0.9 + p.honesty * 0.4 },
    { label: "Master Builder", score: p.industriousness * 1.05 + p.discipline * 0.75 },
    { label: "Sentinel", score: p.bravery * 0.95 + p.discipline * 0.65 + p.caution * 0.25 },
    { label: "Pragmatist", score: p.caution * 0.85 + p.stubbornness * 0.55 + p.industriousness * 0.35 },
    { label: "Opportunist", score: p.greed * 1.15 + p.stubbornness * 0.4 - p.empathy * 0.3 }
  ];
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.label ?? "Settler";
}
function buildNpcPersonality(id, traits, baseCuriosity = 0.55, baseBravery = 0.55, isStranger = false) {
  const jitter = (salt, span = 0.16) => (hashSeed(`${id}:${salt}`) - 0.5) * span;
  let curiosity = baseCuriosity + jitter("cur", 0.14);
  let bravery = baseBravery + jitter("brv", 0.14);
  let sociability = 0.52 + jitter("soc");
  let industriousness = 0.56 + jitter("ind");
  let discipline = 0.52 + jitter("dis");
  let empathy = 0.54 + jitter("emp");
  let greed = (isStranger ? 0.42 : 0.24) + jitter("grd", 0.18);
  let stubbornness = 0.34 + jitter("stb", 0.2);
  let honesty = (isStranger ? 0.48 : 0.72) + jitter("hon", 0.18);
  let caution = 0.46 + jitter("cau");
  for (const tid of traits) {
    if (tid === "curious_scout") {
      curiosity += 0.24;
      caution -= 0.1;
    } else if (tid === "brave_hunter") {
      bravery += 0.25;
      caution -= 0.12;
    } else if (tid === "warmhearted") {
      sociability += 0.26;
      empathy += 0.26;
      honesty += 0.14;
      greed -= 0.12;
    } else if (tid === "clever_crafter" || tid === "master_artisan") {
      industriousness += 0.22;
      discipline += 0.16;
    } else if (tid === "green_thumb") {
      industriousness += 0.14;
      empathy += 0.1;
      caution += 0.08;
    } else if (tid === "calculated_mind") {
      discipline += 0.24;
      curiosity += 0.14;
      caution += 0.12;
    } else if (tid === "swift_footed") {
      curiosity += 0.14;
      caution -= 0.08;
    } else if (tid === "cautious_homebody") {
      caution += 0.28;
      curiosity -= 0.22;
      sociability -= 0.12;
    } else if (tid === "stubborn") {
      stubbornness += 0.34;
      discipline -= 0.14;
    } else if (tid === "timid") {
      bravery -= 0.28;
      caution += 0.24;
    } else if (tid === "melancholic") {
      sociability -= 0.16;
      empathy += 0.08;
    } else if (tid === "resilient" || tid === "hard_skin") {
      bravery += 0.12;
      discipline += 0.1;
    } else if (tid === "glass_cannon") {
      bravery += 0.14;
      caution -= 0.14;
    } else if (tid === "danger_sense") {
      caution += 0.22;
      discipline += 0.1;
    }
  }
  const axes = {
    curiosity: clamp01(curiosity),
    bravery: clamp01(bravery),
    sociability: clamp01(sociability),
    industriousness: clamp01(industriousness),
    discipline: clamp01(discipline),
    empathy: clamp01(empathy),
    greed: clamp01(greed),
    stubbornness: clamp01(stubbornness),
    honesty: clamp01(honesty),
    caution: clamp01(caution)
  };
  return {
    ...axes,
    archetype: derivePersonalityArchetype(axes)
  };
}
function getNpcPersonality(v) {
  if (!v.personality) {
    v.personality = buildNpcPersonality(v.id, v.traits ?? [], v.curiosity, v.bravery, Boolean(v.isStranger));
  }
  return v.personality;
}
var MAX_NPC_MEMORIES = 24;
function recordNpcMemory(v, params) {
  if (!Array.isArray(v.memories)) v.memories = [];
  const existingSame = v.memories.find(
    (m) => m.day === params.day && m.kind === params.kind && m.summary === params.summary
  );
  if (existingSame) {
    existingSame.timeOfDay = params.timeOfDay;
    existingSame.importance = Math.max(existingSame.importance, params.importance ?? 5);
    return existingSame;
  }
  const entry = {
    id: `mem_${params.day}_${Math.random().toString(36).slice(2, 7)}`,
    day: params.day,
    timeOfDay: Number(params.timeOfDay.toFixed(3)),
    kind: params.kind,
    summary: params.summary,
    actorIds: params.actorIds ? [...params.actorIds] : [],
    importance: Math.max(1, Math.min(10, Math.round(params.importance ?? 5))),
    sentiment: params.sentiment ?? "neutral"
  };
  v.memories.unshift(entry);
  v.lastMemory = entry.summary;
  if (v.memories.length > MAX_NPC_MEMORIES) {
    v.memories.sort((a, b) => {
      const scoreA = a.importance * 2 + a.day * 0.4 + a.timeOfDay * 0.2;
      const scoreB = b.importance * 2 + b.day * 0.4 + b.timeOfDay * 0.2;
      return scoreB - scoreA;
    });
    v.memories.length = MAX_NPC_MEMORIES;
    v.memories.sort((a, b) => b.day - a.day || b.timeOfDay - a.timeOfDay);
  }
  return entry;
}

// src/game/knowledge.ts
var KNOWLEDGE_DOMAINS = [
  { id: "foraging", label: "Foraging & Flora", shortLabel: "Foraging", color: "#8CE0AC", summary: "Identifying edible berries, herbs, and seasonal crops." },
  { id: "woodcraft", label: "Woodcraft", shortLabel: "Wood", color: "#B5895A", summary: "Gathering kindling, felling timber, and shaping poles." },
  { id: "stonecraft", label: "Stonecraft", shortLabel: "Stone", color: "#A8B5C4", summary: "Knapping flint, breaking boulders, and quarrying rock." },
  { id: "firecraft", label: "Firecraft", shortLabel: "Fire", color: "#F59E0B", summary: "Striking sparks, tending hearths, and sustaining warmth." },
  { id: "toolmaking", label: "Toolmaking", shortLabel: "Tools", color: "#E5AF47", summary: "Shaping flint spears, bows, and forged metal gear." },
  { id: "construction", label: "Construction", shortLabel: "Build", color: "#D98A6C", summary: "Staking shelters, framing roofs, and raising masonry." },
  { id: "cooking", label: "Cooking & Baking", shortLabel: "Cooking", color: "#FDE68A", summary: "Turning grain, meat, and herbs into nourishing meals." },
  { id: "healing", label: "Healing & Herbs", shortLabel: "Healing", color: "#65B386", summary: "Clotting wounds, steeping teas, and tending injuries." },
  { id: "social_customs", label: "Social Customs", shortLabel: "Customs", color: "#F472B6", summary: "Shared rituals, diplomacy, fairness, and cooperation." },
  { id: "sailing", label: "Seamanship & Sky", shortLabel: "Sailing", color: "#7CC6FE", summary: "Navigating sky-seas, fishing, gliders, and island routes." }
];
var ALL_KNOWLEDGE_DOMAIN_IDS = KNOWLEDGE_DOMAINS.map((d) => d.id);
function createKnowledgeProfile(mode) {
  const base = mode === "infant" ? 0 : mode === "awakening" ? 1.5 : mode === "child" ? 8 : mode === "native" ? 38 : mode === "veteran" ? 44 : 42;
  return {
    foraging: base,
    woodcraft: base,
    stonecraft: base,
    firecraft: mode === "awakening" ? 2 : base,
    toolmaking: mode === "awakening" ? 0 : base * 0.85,
    construction: mode === "awakening" ? 0 : base * 0.9,
    cooking: mode === "awakening" ? 0 : base * 0.8,
    healing: mode === "awakening" ? 0 : base * 0.75,
    social_customs: mode === "awakening" ? 2 : base * 0.95,
    sailing: mode === "awakening" ? 0 : base * 0.7
  };
}
function ensureVillagerKnowledge(v, legacyFallback = false) {
  if (!v.knowledge) {
    const stage = v.lifeStage ?? "adult";
    if (stage === "infant") {
      v.knowledge = createKnowledgeProfile("infant");
    } else if (v.isNativeClan || v.isStranger) {
      v.knowledge = createKnowledgeProfile("native");
    } else if (legacyFallback || (v.cognition?.awareness ?? 0) >= 35) {
      v.knowledge = createKnowledgeProfile("legacy");
    } else {
      v.knowledge = createKnowledgeProfile("awakening");
    }
  }
  return v.knowledge;
}
function getKnowledgeLevel(v, domain) {
  const k = ensureVillagerKnowledge(v);
  return Math.max(0, Math.min(100, k[domain] ?? 0));
}
function getKnowledgeRankLabel(score) {
  if (score >= 80) return "Master";
  if (score >= 55) return "Adept";
  if (score >= 30) return "Apprentice";
  if (score >= 10) return "Novice";
  return "Untaught";
}
function advanceKnowledge(v, domain, rawDelta) {
  const k = ensureVillagerKnowledge(v);
  const prev = k[domain] ?? 0;
  const p = getNpcPersonality(v);
  const intFactor = 0.8 + ((v.stats?.intellect ?? 9) - 8) * 0.04;
  const curiosityFactor = 0.8 + p.curiosity * 0.45;
  const delta = Math.max(0, rawDelta * intFactor * curiosityFactor);
  const next = Math.min(100, Number((prev + delta).toFixed(2)));
  k[domain] = next;
  const prevRank = getKnowledgeRankLabel(prev);
  const nextRank = getKnowledgeRankLabel(next);
  return {
    prev,
    next,
    crossedRank: prevRank !== nextRank ? nextRank : null
  };
}
function shareKnowledgeWithPeer(teacher, learner, domain) {
  const tk = ensureVillagerKnowledge(teacher);
  const lk = ensureVillagerKnowledge(learner);
  let chosenDomain = domain;
  if (!chosenDomain) {
    let bestGap = 3;
    for (const id of ALL_KNOWLEDGE_DOMAIN_IDS) {
      const gap2 = (tk[id] ?? 0) - (lk[id] ?? 0);
      if (gap2 > bestGap) {
        bestGap = gap2;
        chosenDomain = id;
      }
    }
  }
  if (!chosenDomain) return null;
  const gap = (tk[chosenDomain] ?? 0) - (lk[chosenDomain] ?? 0);
  if (gap <= 1.5) return null;
  const res = advanceKnowledge(learner, chosenDomain, Math.min(4.5, gap * 0.22));
  return {
    domain: chosenDomain,
    gained: Number((res.next - res.prev).toFixed(2))
  };
}

// src/game/social.ts
var STAGE_ORDER = {
  rival: 0,
  stranger: 1,
  acquaintance: 2,
  guest: 3,
  friend: 4,
  confidant: 5,
  bonded: 6
};
function clampScore(v) {
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
}
function getDefaultRelScore(a, b) {
  if (a.partnerId === b.id || b.partnerId === a.id) return 72;
  if (a.parentIds && a.parentIds.includes(b.id) || b.parentIds && b.parentIds.includes(a.id) || a.childrenIds.includes(b.id) || b.childrenIds.includes(a.id)) {
    return 64;
  }
  if (a.isStranger || b.isStranger) return 14;
  return 20;
}
function ensureSocialRecord(world, a, b) {
  if (!a.socialRecords) a.socialRecords = {};
  if (!a.relationships) a.relationships = {};
  const existing = a.socialRecords[b.id];
  if (existing) {
    a.relationships[b.id] = Math.round(existing.score);
    return existing;
  }
  const rawScore = typeof a.relationships[b.id] === "number" ? a.relationships[b.id] : getDefaultRelScore(a, b);
  const score = clampScore(rawScore);
  const tier = getSocialTier(score).id;
  const rec = {
    score,
    stage: tier,
    introduced: score >= 28 || a.partnerId === b.id || (a.parentIds?.includes(b.id) ?? false),
    conversations: score >= 45 ? 2 : score >= 28 ? 1 : 0,
    positiveEvents: score >= 45 ? 1 : 0,
    negativeEvents: score < 15 ? 1 : 0,
    lastDay: world.environment?.dayCount ?? 1
  };
  a.socialRecords[b.id] = rec;
  a.relationships[b.id] = Math.round(score);
  return rec;
}
function applySocialScoreChange(world, a, b, delta, interactionKind, options = {}) {
  const rec = ensureSocialRecord(world, a, b);
  const prevStage = rec.stage;
  if (options.markIntroduced) rec.introduced = true;
  if (options.countConversation) rec.conversations += 1;
  if (delta > 0) rec.positiveEvents += 1;
  else if (delta < 0) rec.negativeEvents += 1;
  rec.score = clampScore(rec.score + delta);
  rec.stage = getSocialTier(rec.score).id;
  rec.lastDay = world.environment?.dayCount ?? 1;
  rec.lastInteractionKind = interactionKind;
  a.relationships[b.id] = Math.round(rec.score);
  return { prevStage, nextStage: rec.stage, record: rec };
}
function stageMilestoneText(aFirst, bFirst, stage, islandName) {
  switch (stage) {
    case "acquaintance":
      return `${aFirst} and ${bFirst} grew familiar as acquaintances on ${islandName}.`;
    case "guest":
      return `${aFirst} and ${bFirst} began welcoming each other as trusted guests on ${islandName}.`;
    case "friend":
      return `${aFirst} and ${bFirst} became true friends on ${islandName}.`;
    case "confidant":
      return `${aFirst} and ${bFirst} became close confidants on ${islandName}.`;
    case "bonded":
      return `${aFirst} and ${bFirst} forged a deep lifelong bond on ${islandName}.`;
    case "rival":
      return `${aFirst} and ${bFirst} fell into bitter rivalry on ${islandName}.`;
    default:
      return `${aFirst} and ${bFirst} met on ${islandName}.`;
  }
}
function emitStageTransitionIfChanged(world, a, b, prevStage, nextStage, islandId) {
  if (prevStage === nextStage) return false;
  const improved = STAGE_ORDER[nextStage] > STAGE_ORDER[prevStage];
  const fellToRival = nextStage === "rival";
  if (!improved && !fellToRival) return false;
  const aFirst = a.name.split(" ")[0];
  const bFirst = b.name.split(" ")[0];
  const islandName = ISLAND_DEFS[islandId]?.name ?? "Hearthglen";
  const summary = stageMilestoneText(aFirst, bFirst, nextStage, islandName);
  emitWorldEvent(world, {
    category: "social",
    significance: nextStage === "friend" || nextStage === "confidant" || nextStage === "bonded" || fellToRival ? "notable" : "minor",
    summary,
    islandId,
    participantIds: [a.id, b.id]
  });
  const sentiment = fellToRival ? "negative" : "positive";
  const importance = nextStage === "friend" || nextStage === "confidant" || nextStage === "bonded" || fellToRival ? 7 : 6;
  recordNpcMemory(a, {
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    kind: fellToRival ? "conflict" : "social",
    summary: `Became ${getSocialTier(a.relationships[b.id] ?? 20).label.toLowerCase()} with ${bFirst}.`,
    actorIds: [b.id],
    importance,
    sentiment
  });
  recordNpcMemory(b, {
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    kind: fellToRival ? "conflict" : "social",
    summary: `Became ${getSocialTier(b.relationships[a.id] ?? 20).label.toLowerCase()} with ${aFirst}.`,
    actorIds: [a.id],
    importance,
    sentiment
  });
  return true;
}
function processSocialEncounter(world, a, b, onLearnConcept) {
  a.socialCooldown = 42 + Math.random() * 22;
  if (!a.pairChatCooldowns) a.pairChatCooldowns = {};
  if (!b.pairChatCooldowns) b.pairChatCooldowns = {};
  a.pairChatCooldowns[b.id] = 75;
  b.pairChatCooldowns[a.id] = 75;
  a.cognition.socialCount += 1;
  b.cognition.socialCount += 1;
  const recAB = ensureSocialRecord(world, a, b);
  const recBA = ensureSocialRecord(world, b, a);
  const pA = getNpcPersonality(a);
  const pB = getNpcPersonality(b);
  const aFirst = a.name.split(" ")[0];
  const bFirst = b.name.split(" ")[0];
  const islandId = a.islandId;
  const islandName = ISLAND_DEFS[islandId]?.name ?? "Hearthglen";
  if (!recAB.introduced || !recBA.introduced) {
    const warmthBonus = Math.round((pA.sociability + pB.sociability + pA.empathy + pB.empathy) * 0.65);
    const introGain = Math.max(3, Math.min(6, 3 + warmthBonus));
    const resAB2 = applySocialScoreChange(world, a, b, introGain, "greeting", {
      markIntroduced: true,
      countConversation: true
    });
    applySocialScoreChange(world, b, a, introGain, "greeting", {
      markIntroduced: true,
      countConversation: true
    });
    advanceKnowledge(a, "social_customs", 1.2);
    advanceKnowledge(b, "social_customs", 1.2);
    if (!a.thoughtBubble) {
      a.thoughtBubble = `Hello, ${bFirst}!`;
      a.thoughtTimer = 2.4;
    }
    if (!b.thoughtBubble) {
      b.thoughtBubble = `Nice to meet you, ${aFirst}!`;
      b.thoughtTimer = 2.4;
    }
    recordNpcMemory(a, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: "social",
      summary: `Introduced myself to ${bFirst} on ${islandName}.`,
      actorIds: [b.id],
      importance: 6,
      sentiment: "positive"
    });
    recordNpcMemory(b, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: "social",
      summary: `Introduced myself to ${aFirst} on ${islandName}.`,
      actorIds: [a.id],
      importance: 6,
      sentiment: "positive"
    });
    emitWorldEvent(world, {
      category: "social",
      significance: "minor",
      summary: `${aFirst} and ${bFirst} introduced themselves on ${islandName}.`,
      islandId,
      participantIds: [a.id, b.id]
    });
    const stageChanged2 = emitStageTransitionIfChanged(world, a, b, resAB2.prevStage, resAB2.nextStage, islandId);
    return {
      kind: "introduction",
      stageChanged: stageChanged2,
      newStage: resAB2.nextStage,
      sharedDomain: null,
      sharedConcept: null
    };
  }
  const avgMood = (a.mood + b.mood) * 0.5;
  const empathyWarmth = (pA.empathy + pB.empathy + pA.honesty + pB.honesty) * 0.25;
  const frictionRisk = (pA.stubbornness + pB.stubbornness) * 0.35 + (pA.greed + pB.greed) * 0.2 - empathyWarmth + (avgMood < 32 ? 0.35 : 0) + (a.isStranger || b.isStranger ? 0.25 : 0);
  if (frictionRisk > 0.58 && (avgMood < 48 || a.isStranger || b.isStranger)) {
    const drop = -4;
    const resAB2 = applySocialScoreChange(world, a, b, drop, "quarrel", { countConversation: true });
    applySocialScoreChange(world, b, a, drop, "quarrel", { countConversation: true });
    if (!a.thoughtBubble) {
      a.thoughtBubble = "Tense words...";
      a.thoughtTimer = 2.4;
    }
    recordNpcMemory(a, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: "conflict",
      summary: `Had a tense disagreement with ${bFirst}.`,
      actorIds: [b.id],
      importance: 6,
      sentiment: "negative"
    });
    recordNpcMemory(b, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: "conflict",
      summary: `Clashed briefly with ${aFirst}.`,
      actorIds: [a.id],
      importance: 6,
      sentiment: "negative"
    });
    emitWorldEvent(world, {
      category: "social",
      significance: "minor",
      summary: `${aFirst} and ${bFirst} exchanged sharp words on ${islandName}.`,
      islandId,
      participantIds: [a.id, b.id]
    });
    const stageChanged2 = emitStageTransitionIfChanged(world, a, b, resAB2.prevStage, resAB2.nextStage, islandId);
    return {
      kind: "quarrel",
      stageChanged: stageChanged2,
      newStage: resAB2.nextStage,
      sharedDomain: null,
      sharedConcept: null
    };
  }
  const affinityBoost = Math.max(3, Math.min(6, Math.round(3 + empathyWarmth * 2.5 + (avgMood >= 70 ? 1 : 0))));
  const resAB = applySocialScoreChange(world, a, b, affinityBoost, "chat", { countConversation: true });
  applySocialScoreChange(world, b, a, affinityBoost, "chat", { countConversation: true });
  advanceKnowledge(a, "social_customs", 1.4);
  advanceKnowledge(b, "social_customs", 1.4);
  const shared = shareKnowledgeWithPeer(a, b) ?? shareKnowledgeWithPeer(b, a);
  const novel = a.cognition.observedConcepts.find((c) => !b.cognition.observedConcepts.includes(c)) ?? null;
  if (novel && onLearnConcept) {
    onLearnConcept(b, novel, aFirst);
  } else if (!a.thoughtBubble) {
    a.thoughtBubble = shared ? `Shared ${shared.domain}!` : "Good talk!";
    a.thoughtTimer = 2.4;
  }
  recordNpcMemory(a, {
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    kind: "social",
    summary: shared ? `Shared ${shared.domain} craft with ${bFirst}.` : `Exchanged ideas with ${bFirst}.`,
    actorIds: [b.id],
    importance: 5,
    sentiment: "positive"
  });
  recordNpcMemory(b, {
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    kind: "social",
    summary: shared ? `Learned ${shared.domain} insights from ${aFirst}.` : `Spoke warmly with ${aFirst}.`,
    actorIds: [a.id],
    importance: 5,
    sentiment: "positive"
  });
  const stageChanged = emitStageTransitionIfChanged(world, a, b, resAB.prevStage, resAB.nextStage, islandId);
  return {
    kind: "conversation",
    stageChanged,
    newStage: resAB.nextStage,
    sharedDomain: shared ? shared.domain : null,
    sharedConcept: novel
  };
}
function processBonfireSocialCircle(world, islandId, gathered) {
  if (gathered.length < 2) return;
  for (let i = 0; i < gathered.length; i++) {
    const a = gathered[i];
    for (let j = i + 1; j < gathered.length; j++) {
      const b = gathered[j];
      const rec = ensureSocialRecord(world, a, b);
      const delta = rec.introduced ? 4 : 5;
      const resAB = applySocialScoreChange(world, a, b, delta, "ritual", {
        markIntroduced: true,
        countConversation: true
      });
      applySocialScoreChange(world, b, a, delta, "ritual", {
        markIntroduced: true,
        countConversation: true
      });
      emitStageTransitionIfChanged(world, a, b, resAB.prevStage, resAB.nextStage, islandId);
    }
  }
  const islandName = ISLAND_DEFS[islandId]?.name ?? "Hearthglen";
  emitWorldEvent(world, {
    category: "social",
    significance: "minor",
    summary: `${gathered.length} villagers gathered around the evening bonfire on ${islandName}.`,
    islandId,
    participantIds: gathered.map((m) => m.id)
  });
}
function processDirectSocialShift(world, a, b, delta, kind, eventSummary) {
  const resAB = applySocialScoreChange(world, a, b, delta, kind, {
    markIntroduced: delta >= 0,
    countConversation: kind === "hangout" || kind === "parley" || kind === "chat"
  });
  applySocialScoreChange(world, b, a, delta, kind, {
    markIntroduced: delta >= 0,
    countConversation: kind === "hangout" || kind === "parley" || kind === "chat"
  });
  if (eventSummary) {
    emitWorldEvent(world, {
      category: "social",
      significance: "minor",
      summary: eventSummary,
      islandId: a.islandId,
      participantIds: [a.id, b.id]
    });
  }
  emitStageTransitionIfChanged(world, a, b, resAB.prevStage, resAB.nextStage, a.islandId);
}

// src/game/governance.ts
var WITNESS_RANGE = 140;
var MAX_INCIDENTS = 60;
var MAX_DISPUTES = 24;
function getPierApproachPoint(islandId) {
  const isl = ISLAND_DEFS[islandId] ?? ISLAND_DEFS.cradle;
  return {
    x: Math.round(isl.centerX + (isl.dockSpot.x - isl.centerX) * 0.89),
    y: Math.round(isl.centerY + (isl.dockSpot.y - isl.centerY) * 0.89)
  };
}
function clampRep(val) {
  return Math.max(-100, Math.min(100, Math.round(val)));
}
function ensureGovernanceArrays(world) {
  if (!Array.isArray(world.communityRules)) world.communityRules = [];
  if (!Array.isArray(world.incidents)) world.incidents = [];
  if (!Array.isArray(world.disputes)) world.disputes = [];
}
function adjustVillagerReputation(world, villager, delta, reason) {
  const prev = villager.reputation ?? 15;
  const next = clampRep(prev + delta);
  villager.reputation = next;
  if (prev < 35 && next >= 35 && !villager.banished) {
    const islandId = villager.homeIslandId ?? villager.islandId;
    const islName = ISLAND_DEFS[islandId]?.name ?? "Hearthglen";
    emitWorldEvent(world, {
      category: "rule",
      significance: "notable",
      summary: `${villager.name.split(" ")[0]} gained the lasting trust of ${islName}${reason ? ` (${reason})` : ""}.`,
      islandId,
      participantIds: [villager.id]
    });
  }
  return next;
}
function recordPositiveContribution(world, actor, kind, beneficiary, points = 4) {
  if (actor.banished) return;
  actor.contributionCount = (actor.contributionCount ?? 0) + 1;
  const reasonMap = {
    help: "helping neighbors",
    teach: "teaching skills",
    build: "community construction",
    defend: "defending the island",
    share: "sharing provisions"
  };
  adjustVillagerReputation(world, actor, points, reasonMap[kind]);
  if (beneficiary && beneficiary.id !== actor.id) {
    applySocialScoreChange(world, beneficiary, actor, Math.max(2, Math.round(points * 0.75)), "gift", {
      markIntroduced: true
    });
    recordNpcMemory(beneficiary, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: "social",
      summary: `${actor.name.split(" ")[0]} helped me through ${reasonMap[kind]}.`,
      actorIds: [actor.id],
      importance: 6,
      sentiment: "positive"
    });
  }
}
var RULE_BLUEPRINTS = {
  no_theft: {
    title: "Respect Village Stores",
    description: "Pilfering from communal stockpiles or neighbors is forbidden and brings council censure.",
    severity: "formal"
  },
  fair_share: {
    title: "Fair Share in Hardship",
    description: "Provisions gathered on the island belong to the hearth circle before private hoarding.",
    severity: "informal"
  },
  no_assault: {
    title: "Peace Beside the Hearth",
    description: "Striking fellow villagers or turning brawls against kin incurs collective discipline.",
    severity: "formal"
  },
  protect_kin: {
    title: "Guard the Vulnerable",
    description: "Adults are expected to shelter youths and injured villagers during cold or raids.",
    severity: "informal"
  },
  shared_duty: {
    title: "Shared Hearth Duty",
    description: "Able-bodied villagers must contribute to shelter, food, or defense.",
    severity: "informal"
  }
};
function hasActiveCommunityRule(world, islandId, kind) {
  return Boolean(
    world.communityRules?.some((r) => r.islandId === islandId && r.kind === kind && r.enforced)
  );
}
function establishCommunityRule(world, islandId, kind, triggerReason) {
  ensureGovernanceArrays(world);
  if (hasActiveCommunityRule(world, islandId, kind)) return null;
  const bp = RULE_BLUEPRINTS[kind];
  const rule = {
    id: `rule_${islandId}_${kind}`,
    islandId,
    kind,
    title: bp.title,
    description: bp.description,
    establishedDay: world.environment.dayCount,
    triggerReason,
    severity: bp.severity,
    enforced: true
  };
  world.communityRules.push(rule);
  const islName = ISLAND_DEFS[islandId]?.name ?? "Hearthglen";
  const adults = world.villagers.filter(
    (v) => !v.banished && (v.homeIslandId ?? v.islandId) === islandId && (v.lifeStage === "adult" || v.lifeStage === "elder")
  );
  for (const adult of adults) {
    recordNpcMemory(adult, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: "rule",
      summary: `${islName} established community rule: ${bp.title}.`,
      actorIds: [],
      importance: 7,
      sentiment: "neutral"
    });
  }
  emitWorldEvent(world, {
    category: "rule",
    significance: "notable",
    summary: `${islName} adopted a community rule: "${bp.title}" (${triggerReason}).`,
    islandId,
    participantIds: adults.slice(0, 4).map((a) => a.id)
  });
  return rule;
}
function mapOffenseToRuleKind(kind) {
  switch (kind) {
    case "theft":
      return "no_theft";
    case "hoarding":
      return "fair_share";
    case "assault":
      return "no_assault";
    case "sabotage":
      return "shared_duty";
    default:
      return "no_theft";
  }
}
function evaluateRuleEmergence(world, islandId, recentOffense) {
  ensureGovernanceArrays(world);
  const targetRule = mapOffenseToRuleKind(recentOffense);
  if (hasActiveCommunityRule(world, islandId, targetRule)) return null;
  const islandAdults = world.villagers.filter(
    (v) => !v.banished && (v.homeIslandId ?? v.islandId) === islandId && (v.lifeStage === "adult" || v.lifeStage === "elder")
  );
  if (islandAdults.length < 3) return null;
  const matchingIncidents = (world.incidents ?? []).filter(
    (inc) => inc.islandId === islandId && mapOffenseToRuleKind(inc.kind) === targetRule
  );
  if (matchingIncidents.length < 2) return null;
  const reasonMap = {
    no_theft: "after repeated thefts from village stores",
    fair_share: "after repeated hoarding complaints",
    no_assault: "after repeated altercations",
    protect_kin: "to safeguard youths and elders",
    shared_duty: "after neglected community duties"
  };
  return establishCommunityRule(world, islandId, targetRule, reasonMap[targetRule]);
}
function recordMisconductIncident(world, perpetrator, kind, severity, summary, victim) {
  if (perpetrator.banished) return null;
  ensureGovernanceArrays(world);
  const islandId = perpetrator.islandId;
  const clampedSeverity = Math.max(1, Math.min(3, Math.round(severity)));
  const activeRuleBroken = hasActiveCommunityRule(world, islandId, mapOffenseToRuleKind(kind));
  const witnesses = world.villagers.filter((other) => {
    if (other.id === perpetrator.id || other.banished) return false;
    if (other.lifeStage === "infant") return false;
    if (victim && other.id === victim.id) return true;
    if (other.islandId !== islandId) return false;
    return Math.hypot(other.x - perpetrator.x, other.y - perpetrator.y) <= WITNESS_RANGE;
  });
  const witnessIds = witnesses.map((w) => w.id);
  const inc = {
    id: `inc_${world.environment.dayCount}_${Math.random().toString(36).slice(2, 7)}`,
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    islandId,
    perpetratorId: perpetrator.id,
    victimId: victim?.id ?? null,
    kind,
    severity: clampedSeverity,
    summary,
    witnessIds,
    rumorIds: [],
    addressed: false
  };
  world.incidents.unshift(inc);
  if (world.incidents.length > MAX_INCIDENTS) {
    world.incidents.length = MAX_INCIDENTS;
  }
  perpetrator.offenseCount = (perpetrator.offenseCount ?? 0) + 1;
  const repPenalty = -(6 * clampedSeverity + (activeRuleBroken ? 5 : 0));
  adjustVillagerReputation(world, perpetrator, repPenalty);
  const perpFirst = perpetrator.name.split(" ")[0];
  recordNpcMemory(perpetrator, {
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    kind: "conflict",
    summary: `Committed ${kind}: ${summary}`,
    actorIds: victim ? [victim.id] : [],
    importance: 7,
    sentiment: "negative"
  });
  for (const w of witnesses) {
    if (!Array.isArray(w.knownIncidentIds)) w.knownIncidentIds = [];
    if (!w.knownIncidentIds.includes(inc.id)) w.knownIncidentIds.push(inc.id);
    const trustDrop = -(7 * clampedSeverity + (victim?.id === w.id ? 6 : 0) + (activeRuleBroken ? 3 : 0));
    applySocialScoreChange(world, w, perpetrator, trustDrop, "quarrel", { markIntroduced: true });
    recordNpcMemory(w, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: "conflict",
      summary: victim?.id === w.id ? `Wronged by ${perpFirst} (${summary}).` : `Witnessed ${perpFirst} commit ${kind}: ${summary}`,
      actorIds: [perpetrator.id],
      importance: 7 + clampedSeverity,
      sentiment: "negative"
    });
  }
  emitWorldEvent(world, {
    category: "rule",
    significance: clampedSeverity >= 2 || activeRuleBroken ? "notable" : "minor",
    summary: witnessIds.length > 0 ? `${perpFirst} was caught (${kind}): ${summary} (${witnessIds.length} witness${witnessIds.length === 1 ? "" : "es"}).` : `${perpFirst} committed ${kind} unseen: ${summary}`,
    islandId,
    participantIds: victim ? [perpetrator.id, victim.id] : [perpetrator.id],
    witnessIds
  });
  evaluateRuleEmergence(world, islandId, kind);
  maybeOpenDisputeForPerpetrator(world, perpetrator, inc);
  return inc;
}
function spreadIncidentRumor(world, speaker, listener) {
  if (speaker.banished || listener.banished) return null;
  if (!speaker.knownIncidentIds || speaker.knownIncidentIds.length === 0) return null;
  ensureGovernanceArrays(world);
  for (const incId of speaker.knownIncidentIds) {
    const inc = world.incidents?.find((item) => item.id === incId);
    if (!inc || inc.perpetratorId === listener.id || inc.perpetratorId === speaker.id) continue;
    const listenerKnows = (listener.knownIncidentIds?.includes(inc.id) ?? false) || (listener.rumorIncidentIds?.includes(inc.id) ?? false);
    if (listenerKnows) continue;
    const perp = world.villagers.find((v) => v.id === inc.perpetratorId);
    if (!perp || perp.banished) continue;
    if (!Array.isArray(listener.rumorIncidentIds)) listener.rumorIncidentIds = [];
    listener.rumorIncidentIds.push(inc.id);
    if (!inc.rumorIds.includes(listener.id)) inc.rumorIds.push(listener.id);
    const listenerPersonality = getNpcPersonality(listener);
    const speakerTrust = listener.relationships[speaker.id] ?? 25;
    const rumorCredibility = Math.max(0.3, Math.min(1, speakerTrust / 65 * (1.1 - listenerPersonality.caution * 0.35)));
    const mildDrop = -Math.max(1, Math.round(inc.severity * 2.5 * rumorCredibility));
    applySocialScoreChange(world, listener, perp, mildDrop, "chat", { markIntroduced: false });
    recordNpcMemory(listener, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: "rule",
      summary: `Heard secondhand from ${speaker.name.split(" ")[0]} about ${perp.name.split(" ")[0]}'s ${inc.kind}.`,
      actorIds: [speaker.id, perp.id],
      importance: 5,
      sentiment: "negative"
    });
    return inc;
  }
  return null;
}
function maybeOpenDisputeForPerpetrator(world, accused, triggerIncident) {
  if (accused.banished) return null;
  ensureGovernanceArrays(world);
  const islandId = accused.homeIslandId ?? accused.islandId;
  const activeExisting = world.disputes.some(
    (d) => d.accusedId === accused.id && (d.status === "confrontation" || d.status === "deliberation")
  );
  if (activeExisting) return null;
  const islandAdults = world.villagers.filter(
    (v) => !v.banished && v.id !== accused.id && (v.homeIslandId ?? v.islandId) === islandId && (v.lifeStage === "adult" || v.lifeStage === "elder")
  );
  if (islandAdults.length < 2) return null;
  const offenses = accused.offenseCount ?? 0;
  const rep = accused.reputation ?? 15;
  const witnessedByAnyone = triggerIncident.witnessIds.length > 0;
  const warrantsCouncil = witnessedByAnyone && (offenses >= 2 || triggerIncident.severity >= 3 && rep <= -15);
  if (!warrantsCouncil) return null;
  const accuser = islandAdults.find((a) => a.isChief && (a.knownIncidentIds?.includes(triggerIncident.id) ?? false)) ?? islandAdults.find((a) => a.id === triggerIncident.victimId) ?? islandAdults.find((a) => triggerIncident.witnessIds.includes(a.id)) ?? islandAdults[0];
  const dispute = {
    id: `disp_${world.environment.dayCount}_${Math.random().toString(36).slice(2, 7)}`,
    islandId,
    accusedId: accused.id,
    accusedName: accused.name,
    accuserId: accuser.id,
    accuserName: accuser.name,
    reason: `Repeated ${triggerIncident.kind} (${offenses} recorded incident${offenses === 1 ? "" : "s"})`,
    openedDay: world.environment.dayCount,
    status: "confrontation",
    deliberationTimer: 8,
    votesForBanish: 0,
    votesAgainstBanish: 0,
    votes: []
  };
  world.disputes.unshift(dispute);
  if (world.disputes.length > MAX_DISPUTES) {
    world.disputes.length = MAX_DISPUTES;
  }
  accused.thoughtBubble = "Confronted!";
  accused.thoughtTimer = 3.2;
  accuser.thoughtBubble = "Hold council!";
  accuser.thoughtTimer = 3.2;
  emitWorldEvent(world, {
    category: "rule",
    significance: "notable",
    summary: `${accuser.name.split(" ")[0]} confronted ${accused.name.split(" ")[0]} and called a village council over ${dispute.reason}.`,
    islandId,
    participantIds: [accuser.id, accused.id],
    witnessIds: triggerIncident.witnessIds
  });
  return dispute;
}
function evaluateAndResolveDispute(world, dispute) {
  ensureGovernanceArrays(world);
  const accused = world.villagers.find((v) => v.id === dispute.accusedId);
  if (!accused || accused.banished) {
    dispute.status = "reconciled";
    dispute.resolvedDay = world.environment.dayCount;
    dispute.outcomeSummary = "Dispute closed before council vote.";
    return dispute;
  }
  const voters = world.villagers.filter(
    (v) => !v.banished && v.id !== accused.id && (v.homeIslandId ?? v.islandId) === dispute.islandId && (v.lifeStage === "adult" || v.lifeStage === "elder")
  );
  const accusedIncidents = (world.incidents ?? []).filter((inc) => inc.perpetratorId === accused.id);
  const accusedPersonality = getNpcPersonality(accused);
  const activeRuleCount = (world.communityRules ?? []).filter(
    (r) => r.islandId === dispute.islandId && r.enforced
  ).length;
  let votesForBanish = 0;
  let votesAgainstBanish = 0;
  let banishSupporters = 0;
  const votes = [];
  for (const voter of voters) {
    const vp = getNpcPersonality(voter);
    const rel = voter.relationships[accused.id] ?? ensureSocialRecord(world, voter, accused).score;
    const firsthandWitness = accusedIncidents.some((inc) => voter.knownIncidentIds?.includes(inc.id));
    const heardRumor = accusedIncidents.some((inc) => voter.rumorIncidentIds?.includes(inc.id));
    const chiefBonus = voter.isChief ? 1.5 : 1;
    let score = 0;
    if (firsthandWitness) score += 1.65;
    else if (heardRumor) score += 0.45 - vp.caution * 0.35;
    else score -= 0.75;
    if (voter.partnerId === accused.id || rel >= 58) {
      score -= 2.2;
    } else if (rel >= 42) {
      score -= 0.9;
    } else if (rel <= 16) {
      score += 0.85;
    }
    const offenses2 = accused.offenseCount ?? 0;
    if (offenses2 >= 3) score += 1.25;
    else if (offenses2 >= 2) score += 0.65;
    if ((accused.reputation ?? 15) <= -15) score += 0.7;
    if (activeRuleCount > 0) score += 0.4;
    score += vp.discipline * 0.95 + vp.honesty * 0.45 - vp.empathy * 1.15;
    if (accusedPersonality.honesty >= 0.65 && offenses2 <= 2) {
      score -= 0.65;
    }
    let decision;
    let reason;
    if (score >= 1.15 && (firsthandWitness || heardRumor) && (offenses2 >= 2 || (accused.reputation ?? 0) <= -20)) {
      decision = "banish";
      banishSupporters += 1;
      votesForBanish += chiefBonus;
      reason = firsthandWitness ? "Witnessed repeated rule-breaking; voted to banish." : "Convinced by pattern of misconduct; voted to banish.";
    } else if (rel >= 55 || voter.partnerId === accused.id || !firsthandWitness && !heardRumor) {
      decision = "defend";
      votesAgainstBanish += chiefBonus;
      reason = rel >= 55 ? "Spoke in defense of a friend." : "Withheld banishment without firsthand proof.";
    } else if (vp.empathy >= 0.55 || score < 0.25) {
      decision = "reconcile";
      votesAgainstBanish += chiefBonus;
      reason = "Urged atonement and reconciliation.";
    } else {
      decision = "warn";
      votesAgainstBanish += chiefBonus;
      reason = "Supported formal probation rather than exile.";
    }
    votes.push({
      voterId: voter.id,
      voterName: voter.name,
      decision,
      weight: chiefBonus,
      reason,
      firsthandWitness
    });
  }
  dispute.votes = votes;
  dispute.votesForBanish = Number(votesForBanish.toFixed(1));
  dispute.votesAgainstBanish = Number(votesAgainstBanish.toFixed(1));
  dispute.resolvedDay = world.environment.dayCount;
  const offenses = accused.offenseCount ?? 0;
  const approvedBanish = votesForBanish > votesAgainstBanish && banishSupporters >= 2 && (offenses >= 2 || (accused.reputation ?? 0) <= -20);
  const islName = ISLAND_DEFS[dispute.islandId]?.name ?? "Hearthglen";
  const accusedFirst = accused.name.split(" ")[0];
  if (approvedBanish) {
    dispute.status = "banished";
    dispute.outcomeSummary = `Council voted ${dispute.votesForBanish}\u2013${dispute.votesAgainstBanish} to banish ${accused.name}.`;
    executePhysicalBanishment(world, accused, dispute);
  } else {
    const majorityReconcile = votes.filter((v) => v.decision === "reconcile" || v.decision === "defend").length >= votes.filter((v) => v.decision === "warn").length;
    dispute.status = majorityReconcile ? "reconciled" : "restricted";
    dispute.outcomeSummary = majorityReconcile ? `Council chose reconciliation (${dispute.votesAgainstBanish}\u2013${dispute.votesForBanish} against exile); ${accusedFirst} pledged amends.` : `Council issued strict probation (${dispute.votesAgainstBanish}\u2013${dispute.votesForBanish} against exile) for ${accusedFirst}.`;
    if (majorityReconcile) {
      accused.reputation = clampRep((accused.reputation ?? 0) + 6);
      accused.mood = Math.min(100, accused.mood + 6);
      accused.thoughtBubble = "Forgiven...";
      accused.thoughtTimer = 3;
    } else {
      establishCommunityRule(world, dispute.islandId, "no_theft", `following council warning to ${accusedFirst}`);
      accused.thoughtBubble = "On probation";
      accused.thoughtTimer = 3;
    }
    for (const v of voters) {
      recordNpcMemory(v, {
        day: world.environment.dayCount,
        timeOfDay: world.environment.timeOfDay,
        kind: "rule",
        summary: dispute.outcomeSummary,
        actorIds: [accused.id],
        importance: 7,
        sentiment: "neutral"
      });
    }
    emitWorldEvent(world, {
      category: "rule",
      significance: "notable",
      summary: `${islName} ${dispute.outcomeSummary}`,
      islandId: dispute.islandId,
      participantIds: [accused.id, ...voters.slice(0, 3).map((v) => v.id)]
    });
  }
  for (const inc of accusedIncidents) {
    if (inc.islandId === dispute.islandId) inc.addressed = true;
  }
  return dispute;
}
function executePhysicalBanishment(world, accused, dispute) {
  const islandId = accused.homeIslandId ?? accused.islandId;
  const isl = ISLAND_DEFS[islandId] ?? ISLAND_DEFS.cradle;
  const pier = getPierApproachPoint(islandId);
  accused.banished = true;
  accused.isChief = false;
  if (world.chiefId === accused.id) world.chiefId = null;
  accused.rtsOrder = null;
  accused.drafted = false;
  accused.suggestedTask = null;
  accused.hangOutTargetId = null;
  accused.state = "walking";
  accused.targetX = pier.x;
  accused.targetY = pier.y;
  accused.autonomyReason = `Banished from ${isl.name} \u2014 walking to shore to board departing skiff.`;
  accused.thoughtBubble = "Exiled...";
  accused.thoughtTimer = 5;
  const accusedFirst = accused.name.split(" ")[0];
  for (const other of world.villagers) {
    if (other.id === accused.id) continue;
    const rel = other.relationships[accused.id] ?? 20;
    const isFriend = rel >= 55 || other.partnerId === accused.id;
    if (isFriend) {
      other.mood = Math.max(8, other.mood - 10);
      recordNpcMemory(other, {
        day: world.environment.dayCount,
        timeOfDay: world.environment.timeOfDay,
        kind: "rule",
        summary: `Saddened that the council banished ${accusedFirst} from ${isl.name}.`,
        actorIds: [accused.id],
        importance: 9,
        sentiment: "negative"
      });
    } else if ((other.homeIslandId ?? other.islandId) === islandId) {
      other.mood = Math.min(100, other.mood + 4);
      recordNpcMemory(other, {
        day: world.environment.dayCount,
        timeOfDay: world.environment.timeOfDay,
        kind: "rule",
        summary: `Joined ${isl.name} in banishing ${accusedFirst} for ${dispute.reason}.`,
        actorIds: [accused.id],
        importance: 8,
        sentiment: "neutral"
      });
    }
  }
  const accuser = world.villagers.find((v) => v.id === dispute.accuserId);
  if (accuser) {
    applySocialScoreChange(world, accused, accuser, -20, "quarrel", { markIntroduced: true });
  }
  recordNpcMemory(accused, {
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    kind: "rule",
    summary: `Banished from ${isl.name} by council vote (${dispute.reason}).`,
    actorIds: [dispute.accuserId],
    importance: 10,
    sentiment: "negative"
  });
  emitWorldEvent(world, {
    category: "rule",
    significance: "major",
    summary: `${isl.name} voted to banish ${accused.name} (${dispute.votesForBanish}\u2013${dispute.votesAgainstBanish}) for ${dispute.reason}.`,
    islandId,
    participantIds: [accused.id, dispute.accuserId]
  });
}
function boardBanishmentSkiff(world, v) {
  const islandId = v.islandId;
  const isl = ISLAND_DEFS[islandId] ?? ISLAND_DEFS.cradle;
  const outX = isl.dockSpot.seaX - isl.centerX;
  const outY = isl.dockSpot.seaY - isl.centerY;
  const len = Math.hypot(outX, outY) || 1;
  const destX = Math.round(isl.dockSpot.seaX + outX / len * 280);
  const destY = Math.round(isl.dockSpot.seaY + outY / len * 240);
  const boat = {
    id: `boat_exile_${v.id}_${world.environment.dayCount}`,
    name: `${v.name.split(" ")[0]}'s Exile Skiff`,
    kind: "migrant_skiff",
    cultureId: v.cultureId,
    homeIslandId: islandId,
    targetIslandId: islandId,
    x: isl.dockSpot.seaX,
    y: isl.dockSpot.seaY,
    targetX: destX,
    targetY: destY,
    yaw: Math.atan2(-(destY - isl.dockSpot.seaY), destX - isl.dockSpot.seaX),
    hp: 100,
    maxHp: 100,
    state: "returning",
    cargoText: `Departing (Banished): ${v.name}`,
    passengerIds: [v.id],
    tripTimer: 16,
    arrivalId: null
  };
  world.boats.push(boat);
  v.voyageBoatId = boat.id;
  v.state = "sailing";
  v.x = boat.x;
  v.y = boat.y;
  v.autonomyReason = `Sailing away into the sky-sea after banishment from ${isl.name}.`;
  emitWorldEvent(world, {
    category: "migration",
    significance: "major",
    summary: `${v.name} boarded a departing skiff and sailed away from ${isl.name} in exile.`,
    islandId,
    participantIds: [v.id]
  });
  return boat;
}
function tickGovernance(world, dt) {
  ensureGovernanceArrays(world);
  for (const dispute of world.disputes) {
    if (dispute.status === "confrontation") {
      dispute.deliberationTimer -= dt;
      if (dispute.deliberationTimer <= 3.5) {
        dispute.status = "deliberation";
      }
    } else if (dispute.status === "deliberation") {
      dispute.deliberationTimer -= dt;
      if (dispute.deliberationTimer <= 0) {
        evaluateAndResolveDispute(world, dispute);
      }
    }
  }
  for (const v of world.villagers) {
    if (!v.banished) continue;
    if (v.voyageBoatId) continue;
    const isl = ISLAND_DEFS[v.islandId] ?? ISLAND_DEFS.cradle;
    const pier = getPierApproachPoint(v.islandId);
    v.targetX = pier.x;
    v.targetY = pier.y;
    v.state = "walking";
    v.autonomyReason = `Banished \u2014 walking to ${isl.name} shore to depart by skiff.`;
    const distToDock = Math.hypot(v.x - pier.x, v.y - pier.y);
    if (distToDock <= 28) {
      boardBanishmentSkiff(world, v);
    }
  }
  if (world.villagers.length >= 3 && Math.random() < dt * 8e-3) {
    const candidate = world.villagers.find((v) => {
      if (v.banished || v.lifeStage === "infant" || v.lifeStage === "child") return false;
      const p = getNpcPersonality(v);
      return p.greed >= 0.68 && p.honesty <= 0.42 && (v.hunger < 44 || v.mood < 42);
    });
    if (candidate) {
      const sameIsleRecent = (world.incidents ?? []).some(
        (inc) => inc.perpetratorId === candidate.id && inc.day === world.environment.dayCount
      );
      if (!sameIsleRecent) {
        const nearbyPeer = world.villagers.find(
          (other) => other.id !== candidate.id && !other.banished && other.islandId === candidate.islandId && Math.hypot(other.x - candidate.x, other.y - candidate.y) <= WITNESS_RANGE
        );
        const foragingSkill = getKnowledgeLevel(candidate, "foraging");
        const kind = foragingSkill < 25 ? "theft" : "hoarding";
        recordMisconductIncident(
          world,
          candidate,
          kind,
          1,
          kind === "theft" ? "took extra rations from village stores without sharing" : "hid gathered provisions from the community storehouse",
          nearbyPeer ?? null
        );
      }
    }
  }
}

// src/game/lowPolyWorld.ts
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function wrapAngleDiff2(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
function hash2(ix, iy) {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
function valueNoise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm2(x, y, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (valueNoise2(x * freq, y * freq) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.04;
  }
  return norm > 0 ? sum / norm : 0;
}
function ridgedFbm2(x, y, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const v = 1 - Math.abs(valueNoise2(x * freq, y * freq) * 2 - 1);
    sum += amp * v * v;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return norm > 0 ? sum / norm : 0;
}
function islandNormalizedDist(def, wx, wy) {
  const dx = (wx - def.centerX) / def.radiusX;
  const dy = (wy - def.centerY) / def.radiusY;
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(def, ang);
  return Math.hypot(dx, dy) / wobble;
}
function distToSegmentWithT(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-4) return { dist: Math.hypot(wx, wy), t: 0, len: 0 };
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  return {
    dist: Math.hypot(px - (ax + t * vx), py - (ay + t * vy)),
    t,
    len: Math.sqrt(len2)
  };
}
function riverDepthAtSim(def, wx, wy) {
  if (!def.rivers || def.rivers.length === 0) {
    return { inRiver: false, depth: 0, bankFactor: 0, mouthFactor: 0 };
  }
  let maxDepth = 0;
  let maxBank = 0;
  let bestMouth = 0;
  for (const r of def.rivers) {
    const segCount = Math.max(1, r.points.length - 1);
    for (let i = 0; i < segCount; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const { dist, t } = distToSegmentWithT(
        wx,
        wy,
        def.centerX + a.dx,
        def.centerY + a.dy,
        def.centerX + b.dx,
        def.centerY + b.dy
      );
      const u = (i + t) / segCount;
      const mouthBoost = smoothstep(0.66, 1, u);
      const halfW = r.width * (0.48 + mouthBoost * 0.42);
      const valleyW = halfW * 2.35;
      if (dist < valleyW) {
        const valley = (1 - smoothstep(halfW * 0.55, valleyW, dist)) * 0.26;
        const channel = (1 - smoothstep(halfW * 0.25, halfW * 1.18, dist)) * (0.58 + mouthBoost * 0.16);
        const totalCarve = Math.max(valley, channel);
        if (totalCarve > maxDepth) {
          maxDepth = totalCarve;
          bestMouth = mouthBoost;
        }
        if (valley > maxBank) {
          maxBank = valley;
        }
      }
    }
  }
  return {
    inRiver: maxDepth > 0.34,
    depth: maxDepth,
    bankFactor: maxBank,
    mouthFactor: bestMouth
  };
}
function pondDepthAtSim(def, wx, wy) {
  if (!def.ponds || def.ponds.length === 0) return { inPond: false, depth: 0 };
  let maxDepth = 0;
  for (const pond of def.ponds) {
    const px = def.centerX + pond.dx;
    const py = def.centerY + pond.dy;
    const norm = Math.hypot((wx - px) / Math.max(12, pond.rx), (wy - py) / Math.max(12, pond.ry));
    if (norm < 1.55) {
      const carve = (1 - smoothstep(0.32, 1.55, norm)) * 0.78;
      if (carve > maxDepth) maxDepth = carve;
    }
  }
  return { inPond: maxDepth > 0.32, depth: maxDepth };
}
function getShoreSlopeFactor(def, ang) {
  let coveWeight = 0;
  if (def.coveAngles) {
    for (let i = 0; i < def.coveAngles.length; i++) {
      const diff = Math.abs(wrapAngleDiff2(ang, def.coveAngles[i]));
      if (diff < 0.62) {
        coveWeight = Math.max(coveWeight, Math.exp(-(diff * diff) / 0.085));
      }
    }
  }
  if (def.dockAngleRad !== void 0) {
    const dockDiff = Math.abs(wrapAngleDiff2(ang, def.dockAngleRad));
    if (dockDiff < 0.45) {
      coveWeight = Math.max(coveWeight, Math.exp(-(dockDiff * dockDiff) / 0.065));
    }
  }
  if (def.terrainStyle === "basin" || def.terrainStyle === "multi_river" || def.terrainStyle === "atoll") {
    const headlandWave = Math.sin(ang * 3 + (def.coastRotRad ?? 0)) * 0.5 + 0.5;
    return Math.min(1, Math.max(coveWeight, 0.58 + (1 - headlandWave) * 0.34));
  }
  if (def.terrainStyle === "ruins") {
    return Math.min(1, Math.max(coveWeight, 0.46));
  }
  return coveWeight;
}
function islandBasePlateauHeightAtSim(def, wx, wy, nd) {
  const lx = (wx - def.centerX) / def.radiusX;
  const ly = (wy - def.centerY) / def.radiusY;
  const ang = Math.atan2(ly, lx);
  const seedOff = (def.coastSeed ?? 1) % 500 * 0.13;
  const organicNoise = fbm2(wx * 44e-4 + seedOff, wy * 44e-4 - seedOff * 0.7, 3);
  const detailRoll = fbm2(wx * 0.011 - seedOff * 0.4, wy * 0.011 + seedOff * 0.9, 2) * 0.16;
  const clearingFlat = smoothstep(0.15, 0.46, nd);
  const rAngle = def.ridgeAngle ?? 0;
  const rCos = Math.cos(rAngle);
  const rSin = Math.sin(rAngle);
  const rxCoord = lx * rCos + ly * rSin;
  const ryCoord = -lx * rSin + ly * rCos;
  let relief = (organicNoise * 0.42 + detailRoll) * (0.2 + 0.8 * clearingFlat) * (1 - nd * 0.34);
  if (def.id === "cradle") {
    const gentleBackHill = smoothstep(0.45, -0.58, ryCoord) * 0.82 * clearingFlat;
    const sideKnoll = smoothstep(0.48, 0.12, Math.hypot(rxCoord + 0.52, ryCoord + 0.08)) * 0.44;
    relief += gentleBackHill + sideKnoll;
  } else if (def.id === "timbercrown") {
    const gorgeAng = def.waterfallAngle ?? 0.72;
    const angDiff = Math.abs(wrapAngleDiff2(ang, gorgeAng));
    const gorgeCut = nd > 0.34 ? smoothstep(0.28, 0.05, angDiff) * 1.38 : 0;
    const highEscarpment = smoothstep(0.24, -0.56, ryCoord) * 1.45;
    relief += highEscarpment - gorgeCut + organicNoise * 0.25 * clearingFlat;
  } else if (def.id === "sunterrace") {
    const valleySlope = smoothstep(-0.62, 0.58, ryCoord) * 0.65 * clearingFlat;
    relief += valleySlope + organicNoise * 0.26 * clearingFlat;
  } else if (def.id === "coppercrag") {
    const westSpire = smoothstep(0.5, 0.12, Math.hypot(rxCoord + 0.38, ryCoord + 0.18)) * 3.4;
    const northRidge = smoothstep(0.45, 0.1, Math.hypot(rxCoord - 0.28, ryCoord + 0.32)) * 2.85;
    const basin = smoothstep(0.38, 0.1, Math.hypot(rxCoord, ryCoord - 0.08)) * -0.92;
    const cragRidges = ridgedFbm2(wx * 85e-4 + seedOff, wy * 85e-4, 3) * 0.85 * clearingFlat;
    relief += westSpire + northRidge + basin + cragRidges;
  } else if (def.id === "mistatoll") {
    const lOff = def.lagoonOffset ?? { lx: -0.14, ly: 0 };
    const awayAng = Math.atan2(lOff.ly, lOff.lx) + Math.PI;
    const crescentFactor = smoothstep(-0.35, 0.75, Math.cos(ang - awayAng));
    const horseshoe = smoothstep(0.34, 0.72, nd) * crescentFactor * 1.65;
    const lagoonDip = smoothstep(0.42, 0.14, Math.hypot(lx - lOff.lx, ly - lOff.ly)) * 1.05;
    relief += horseshoe - lagoonDip;
  } else if (def.id === "starbloom") {
    const centerArena = smoothstep(0.32, 0.08, nd) * -0.28;
    const highKnoll = smoothstep(0.45, 0.12, Math.hypot(rxCoord - 0.32, ryCoord + 0.36)) * 1.15;
    relief += centerArena + highKnoll;
  } else if (def.id === "embervault") {
    const tOff = def.trenchOffset ?? { lx: -0.34, ly: 0.22 };
    const coneRim = Math.exp(-Math.pow((nd - 0.42) / 0.22, 2)) * 3.25;
    const citadelPlate = smoothstep(0.32, 0.14, Math.hypot(rxCoord - 0.05, ryCoord + 0.08)) * 1.28;
    const lavaTrench = smoothstep(0.24, 0.06, Math.hypot(lx - tOff.lx, ly - tOff.ly)) * -4.9;
    const basaltRidges = ridgedFbm2(wx * 9e-3 + seedOff, wy * 9e-3, 3) * 0.84 * clearingFlat;
    relief += coneRim + citadelPlate + lavaTrench + basaltRidges;
  } else if (def.id === "frostpeak") {
    const summitPeak = smoothstep(0.58, 0.06, Math.hypot(rxCoord + 0.2, ryCoord + 0.2)) * 5.5;
    const eastPeak = smoothstep(0.48, 0.1, Math.hypot(rxCoord - 0.34, ryCoord - 0.08)) * 3.7;
    const southSpur = smoothstep(0.42, 0.12, Math.hypot(rxCoord + 0.1, ryCoord - 0.35)) * 2.05;
    const glacierShelf = smoothstep(0.18, -0.05, ryCoord) * 1.05;
    const alpineCrests = ridgedFbm2(wx * 75e-4 + seedOff, wy * 75e-4, 3) * 0.92 * clearingFlat;
    relief += summitPeak + eastPeak + southSpur + glacierShelf + alpineCrests;
  }
  let h = def.elevationY + relief;
  const shoreSlope = getShoreSlopeFactor(def, ang);
  if (shoreSlope > 0.05) {
    const beachStart = 0.72;
    const beachT = smoothstep(beachStart, 1.03, nd);
    if (beachT > 0) {
      const targetShoreY = -0.38;
      h = h * (1 - beachT * shoreSlope) + targetShoreY * (beachT * shoreSlope);
    }
  }
  if (shoreSlope <= 0.05 && nd > 0.93) {
    const rimT = smoothstep(0.93, 1.03, nd);
    h -= rimT * 0.85;
  }
  return h;
}
function islandTerrainHeightAtSim(def, wx, wy, nd) {
  let h = islandBasePlateauHeightAtSim(def, wx, wy, nd);
  const riverSample = riverDepthAtSim(def, wx, wy);
  if (riverSample.depth > 0) {
    h -= riverSample.depth;
    const isWaterfallDrop = def.hasWaterfall && def.waterfallAngle !== void 0 && Math.abs(wrapAngleDiff2(Math.atan2((wy - def.centerY) / def.radiusY, (wx - def.centerX) / def.radiusX), def.waterfallAngle)) < 0.28;
    if (!isWaterfallDrop && riverSample.mouthFactor > 0.25 && riverSample.inRiver) {
      const estuaryDip = riverSample.mouthFactor * 0.55;
      h = Math.min(h, Math.max(-0.42, h - estuaryDip));
    }
  }
  const pondSample = pondDepthAtSim(def, wx, wy);
  if (pondSample.depth > 0) {
    h -= pondSample.depth;
  }
  if (def.hasSpring && def.springOffset) {
    const sx = def.centerX + def.springOffset.dx;
    const sy = def.centerY + def.springOffset.dy;
    const sd = Math.hypot(wx - sx, wy - sy);
    if (sd < 44) {
      h -= (1 - smoothstep(14, 44, sd)) * 0.44;
    }
  }
  const centerProtect = 1 - smoothstep(0.14, 0.24, nd);
  if (centerProtect > 0.05) {
    h = Math.max(h, Math.max(0.45, def.elevationY * 0.72) * centerProtect);
  }
  const dockDist = Math.hypot(wx - def.dockSpot.x, wy - def.dockSpot.y);
  if (dockDist < 42) {
    const dockT = 1 - smoothstep(18, 42, dockDist);
    h = Math.max(h, 0.36 * dockT);
  }
  return Math.max(-0.48, h);
}
function terrainSlopeAtSim(wx, wy) {
  const eps = 16;
  const h = groundHeightAtSim(wx, wy);
  const hx = groundHeightAtSim(wx + eps, wy);
  const hz = groundHeightAtSim(wx, wy + eps);
  return Math.hypot((hx - h) / (eps * WORLD_SCALE), (hz - h) / (eps * WORLD_SCALE));
}
function groundHeightAtSim(wx, wy, bridges) {
  if (bridges) {
    for (const br of bridges) {
      if (!br.built) continue;
      const vx = br.x2 - br.x1;
      const vy = br.y2 - br.y1;
      const len2 = vx * vx + vy * vy;
      if (len2 < 1) continue;
      const t = ((wx - br.x1) * vx + (wy - br.y1) * vy) / len2;
      if (t >= -0.05 && t <= 1.05) {
        const ct = Math.max(0, Math.min(1, t));
        const px = br.x1 + ct * vx;
        const py = br.y1 + ct * vy;
        if (Math.hypot(wx - px, wy - py) <= 22) {
          const yA = groundHeightAtSim(br.x1, br.y1);
          const yB = groundHeightAtSim(br.x2, br.y2);
          const arch = Math.sin(ct * Math.PI) * (br.tier === 2 ? 1.85 : 0.95);
          return yA + (yB - yA) * ct + arch + 0.14;
        }
      }
    }
  }
  for (const id of ISLAND_ORDER) {
    const def = ISLAND_DEFS[id];
    const nd = islandNormalizedDist(def, wx, wy);
    if (nd <= 1.03) {
      return islandTerrainHeightAtSim(def, wx, wy, nd);
    }
  }
  return 0;
}
function resolveValidLandmarkSpot(def, tx, ty, allowWetRim = false) {
  const isOk = (wx, wy) => {
    const nd = islandNormalizedDist(def, wx, wy);
    if (nd > 0.9) return false;
    const h = islandTerrainHeightAtSim(def, wx, wy, nd);
    if (h < (allowWetRim ? 0.06 : 0.28)) return false;
    if (def.biome === "volcanic" && h < def.elevationY - 0.35) return false;
    if (def.hasSpring && def.springOffset) {
      const sd = Math.hypot(wx - (def.centerX + def.springOffset.dx), wy - (def.centerY + def.springOffset.dy));
      if (sd < (allowWetRim ? 22 : 42)) return false;
    }
    if (pondDepthAtSim(def, wx, wy).inPond) return false;
    const riv = riverDepthAtSim(def, wx, wy);
    if (riv.inRiver || !allowWetRim && riv.depth > 0.16) return false;
    if (terrainSlopeAtSim(wx, wy) > 0.44) return false;
    return true;
  };
  if (isOk(tx, ty)) return { x: tx, y: ty };
  const baseAng = Math.atan2(ty - def.centerY, tx - def.centerX);
  const baseR = Math.hypot((tx - def.centerX) / def.radiusX, (ty - def.centerY) / def.radiusY);
  for (let step = 1; step <= 18; step++) {
    const sign = step % 2 === 0 ? 1 : -1;
    const ang = baseAng + sign * Math.ceil(step / 2) * 0.24;
    const rad = Math.min(0.84, Math.max(0.28, baseR * 0.94));
    const wobble = islandCoastWobble(def, ang);
    const cx = Math.round(def.centerX + Math.cos(ang) * def.radiusX * rad * wobble);
    const cy = Math.round(def.centerY + Math.sin(ang) * def.radiusY * rad * wobble);
    if (isOk(cx, cy)) return { x: cx, y: cy };
  }
  return { x: tx, y: ty };
}
function buildArchipelagoLandmarks() {
  const list = [];
  let idx = 0;
  const add = (islandId, kind, x, y, scale = 1, rotY = 0) => {
    if (islandId !== "sea") {
      const def = ISLAND_DEFS[islandId];
      const pos = resolveValidLandmarkSpot(def, x, y, kind === "reed_clump" || kind === "driftwood");
      list.push({ id: `lm_${idx++}`, islandId, kind, x: pos.x, y: pos.y, scale, rotY });
      return;
    }
    list.push({ id: `lm_${idx++}`, islandId, kind, x, y, scale, rotY });
  };
  for (const id of ISLAND_ORDER) {
    const def = ISLAND_DEFS[id];
    const rng = mulberry32((def.coastSeed ?? 1) + 77);
    if (def.hasSpring && def.springOffset) {
      const rAng = rng() * Math.PI * 2;
      add(
        id,
        "reed_clump",
        Math.round(def.centerX + def.springOffset.dx + Math.cos(rAng) * 34),
        Math.round(def.centerY + def.springOffset.dy + Math.sin(rAng) * 28),
        1.02,
        rng() * Math.PI * 2
      );
    }
    if (def.ponds && def.ponds.length > 0) {
      for (const pond of def.ponds) {
        for (let p = 0; p < 2; p++) {
          const pAng = rng() * Math.PI * 2;
          add(
            id,
            "reed_clump",
            Math.round(def.centerX + pond.dx + Math.cos(pAng) * (pond.rx + 12)),
            Math.round(def.centerY + pond.dy + Math.sin(pAng) * (pond.ry + 12)),
            0.95 + rng() * 0.25,
            rng() * Math.PI * 2
          );
        }
      }
    }
    if (def.coveAngles && def.coveAngles.length > 0 && def.biome !== "volcanic") {
      const coveAng = def.coveAngles[Math.floor(rng() * def.coveAngles.length)] + (rng() - 0.5) * 0.22;
      const rimWob = islandCoastWobble(def, coveAng);
      add(
        id,
        "driftwood",
        Math.round(def.centerX + Math.cos(coveAng) * def.radiusX * rimWob * 0.86),
        Math.round(def.centerY + Math.sin(coveAng) * def.radiusY * rimWob * 0.86),
        0.95 + rng() * 0.2,
        coveAng + Math.PI * 0.5
      );
    }
    if (def.biome === "meadow" || def.biome === "pine" || def.biome === "terrace" || def.biome === "ruins") {
      const stumpCount = def.biome === "meadow" ? 3 : 2;
      for (let s = 0; s < stumpCount; s++) {
        const sAng = s / stumpCount * Math.PI * 2 + rng() * 1.4;
        const sRad = 0.42 + rng() * 0.22;
        const wob = islandCoastWobble(def, sAng);
        add(
          id,
          "stump",
          Math.round(def.centerX + Math.cos(sAng) * def.radiusX * sRad * wob),
          Math.round(def.centerY + Math.sin(sAng) * def.radiusY * sRad * wob),
          0.95 + rng() * 0.18,
          rng() * Math.PI * 2
        );
      }
    }
    if (id === "starbloom") {
      const ang = rng() * Math.PI * 2;
      add(id, "ruin_cairn", Math.round(def.centerX + Math.cos(ang) * 230), Math.round(def.centerY + Math.sin(ang) * 180), 1.15, rng() * Math.PI);
      add(id, "crystal_spire", Math.round(def.centerX - Math.cos(ang) * 240), Math.round(def.centerY - Math.sin(ang) * 185), 1.2, rng() * Math.PI);
    } else if (id === "frostpeak") {
      const ang = rng() * Math.PI * 2;
      add(id, "crystal_spire", Math.round(def.centerX + Math.cos(ang) * 210), Math.round(def.centerY + Math.sin(ang) * 170), 1.35, rng() * Math.PI);
    }
  }
  const seaRng = mulberry32((ISLAND_DEFS.cradle.coastSeed ?? 104729) + 991);
  let seaAttempts = 0;
  let seaPlaced = 0;
  while (seaPlaced < 10 && seaAttempts < 180) {
    seaAttempts++;
    const sx = Math.round(360 + seaRng() * (WORLD_WIDTH - 720));
    const sy = Math.round(320 + seaRng() * (WORLD_HEIGHT - 640));
    if (getIslandAtPoint(sx, sy, -220) !== null) continue;
    add("sea", "sky_islet", sx, sy, 1 + seaRng() * 0.3, seaRng() * Math.PI * 2);
    seaPlaced++;
  }
  return list;
}

// src/game/economy.ts
function isFiniteMineralNode(kind) {
  return kind === "stone_boulder" || kind === "flint_pile" || kind === "copper_vein" || kind === "iron_vein" || kind === "branch_pile";
}
function tickWildNodeRegrowth(world, dt) {
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
function harvestWildNode(node, requestedTake) {
  if (requestedTake <= 0 || node.amount <= 0) return 0;
  const take = Math.min(node.amount, requestedTake);
  node.amount = Math.max(0, Number((node.amount - take).toFixed(4)));
  return take;
}
function getCarryCap(v) {
  return Math.max(1, v.carryCapacity ?? 6);
}
function addToVillagerInventory(world, v, resource, amount, addResFn) {
  if (amount <= 0) return 0;
  const cap = getCarryCap(v);
  if (v.carriedResource && v.carriedResource !== resource && (v.carriedAmount ?? 0) > 0) {
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
function depositCarriedToVillage(world, v, addResFn, syncFoodFn) {
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
function getStockpileDepositPoint(world, islandId) {
  const fire = world.buildings.find((b) => b.islandId === islandId && b.type === "bonfire" && b.unlocked);
  if (fire) return { x: fire.x, y: fire.y + 18 };
  const store = world.buildings.find(
    (b) => b.islandId === islandId && b.unlocked && (b.type === "woodshop" || b.type === "quarry" || b.type === "cottage" || b.type === "lean_to")
  );
  if (store) return { x: store.x, y: store.y + 18 };
  const isl = ISLAND_DEFS[islandId];
  return { x: isl.centerX, y: isl.centerY + 12 };
}
function getConstructionStageForRatio(ratio, unlocked) {
  if (unlocked || ratio >= 1) return "complete";
  if (ratio < 0.25) return "foundation";
  if (ratio < 0.5) return "framework";
  if (ratio < 0.75) return "walls";
  return "roof";
}
function getNextStageGateRatio(currentStage) {
  switch (currentStage) {
    case "foundation":
      return 0.25;
    case "framework":
      return 0.5;
    case "walls":
      return 0.75;
    case "roof":
    case "complete":
    default:
      return 1;
  }
}
function initStagedBuildingMaterials(b, cost) {
  b.constructionStage = b.unlocked ? "complete" : "foundation";
  b.requiredMaterials = { ...cost };
  b.deliveredMaterials = {};
  for (const k of Object.keys(cost)) {
    if ((cost[k] ?? 0) > 0) {
      b.deliveredMaterials[k] = 0;
    }
  }
  b.pausedForMaterials = false;
}
function deliverMaterialsForStage(world, b, ac, syncFoodFn) {
  const ratio = ac.progress / Math.max(0.1, ac.duration);
  const currentStage = getConstructionStageForRatio(ratio, b.unlocked);
  b.constructionStage = currentStage;
  ac.stage = currentStage;
  if (ac.isUpgrade || !b.requiredMaterials || Object.keys(b.requiredMaterials).length === 0) {
    ac.pausedForMaterials = false;
    b.pausedForMaterials = false;
    return { gateMet: true, nextGateRatio: 1, missing: [] };
  }
  if (!b.deliveredMaterials) b.deliveredMaterials = {};
  const nextGateRatio = getNextStageGateRatio(currentStage);
  const res = world.villageResources?.[b.islandId] ?? world.resources;
  const reqEntries = Object.entries(b.requiredMaterials);
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
  const missing = [];
  for (const [key, totalReq] of reqEntries) {
    if (!totalReq || totalReq <= 0) continue;
    const gateNeed = Math.min(totalReq, Math.ceil(totalReq * nextGateRatio));
    const currentDeliv = b.deliveredMaterials[key] ?? 0;
    if (currentDeliv < gateNeed) {
      const shortfall = gateNeed - currentDeliv;
      const available = Math.max(0, res[key] ?? 0);
      const transfer = Math.min(shortfall, available);
      if (transfer > 1e-3) {
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
        category: "construction",
        significance: "minor",
        summary: `${b.name} construction paused at ${currentStage} awaiting ${missing.join(", ")}.`,
        islandId: b.islandId,
        participantIds: [ac.builderId]
      });
    }
    return { gateMet: false, nextGateRatio, missing };
  }
  ac.pausedForMaterials = false;
  b.pausedForMaterials = false;
  return { gateMet: true, nextGateRatio, missing: [] };
}
function hasFoundationResources(res, cost) {
  for (const [k, v] of Object.entries(cost)) {
    if (typeof v === "number" && v > 0) {
      const gateNeed = Math.min(v, Math.ceil(v * 0.25));
      if ((res[k] ?? 0) < gateNeed) return false;
    }
  }
  return true;
}
function villageNeedsHousing(pop, beds) {
  return beds < pop;
}
function canBuildCottage(world, islandId) {
  if (!world.unlockedTechIds.includes("timber_joinery")) return false;
  if (world.gameMode !== "whisper_solo") return true;
  return world.villagers.some(
    (v) => (v.homeIslandId ?? v.islandId) === islandId && v.lifeStage !== "infant" && (getKnowledgeLevel(v, "construction") >= 8 || v.cognition.stage !== "awakening")
  );
}

// src/game/navigation.ts
var NAV_CELL_SIZE = 24;
var worldGridCache = /* @__PURE__ */ new WeakMap();
var stuckGridSigCache = /* @__PURE__ */ new WeakMap();
function smoothstep2(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function islandNormalizedDistNav(def, wx, wy) {
  const dx = (wx - def.centerX) / Math.max(20, def.radiusX);
  const dy = (wy - def.centerY) / Math.max(20, def.radiusY);
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(def, ang);
  return Math.hypot(dx, dy) / Math.max(0.4, wobble);
}
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-4) return Math.hypot(wx, wy);
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}
function segmentProjT(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-4) return { dist: Math.hypot(px - ax, py - ay), t: 0, len: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
  return {
    dist: Math.hypot(px - (ax + t * vx), py - (ay + t * vy)),
    t,
    len: Math.sqrt(len2)
  };
}
function isOnBuiltBridgeNav(world, x, y) {
  for (const br of world.bridges) {
    if (!br.built) continue;
    if (distToSegment(x, y, br.x1, br.y1, br.x2, br.y2) <= 28) return br;
  }
  return null;
}
function findBridgeStepNav(world, from, to) {
  if (from === to) return null;
  const queue = [{ id: from, firstBridge: null }];
  const visited = /* @__PURE__ */ new Set([from]);
  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr.id === to) return curr.firstBridge;
    for (const br of world.bridges) {
      if (!br.built) continue;
      const nextId = br.fromIsland === curr.id ? br.toIsland : br.toIsland === curr.id ? br.fromIsland : null;
      if (nextId && !visited.has(nextId)) {
        visited.add(nextId);
        queue.push({ id: nextId, firstBridge: curr.firstBridge ?? br });
      }
    }
  }
  return null;
}
function findCablewayStepNav(world, from, to) {
  return world.cableways.find(
    (cb) => cb.built && (cb.fromIsland === from && cb.toIsland === to || cb.fromIsland === to && cb.toIsland === from)
  ) ?? null;
}
function sampleRiverTerrain(def, wx, wy) {
  if (!def.rivers || def.rivers.length === 0) return null;
  let maxDepth = 0;
  let bestMouth = 0;
  let atShallowFord = false;
  for (const r of def.rivers) {
    const segCount = Math.max(1, r.points.length - 1);
    for (let i = 0; i < segCount; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const { dist, t, len } = segmentProjT(
        wx,
        wy,
        def.centerX + a.dx,
        def.centerY + a.dy,
        def.centerX + b.dx,
        def.centerY + b.dy
      );
      const u = (i + t) / segCount;
      const mouthBoost = smoothstep2(0.66, 1, u);
      const halfW = r.width * (0.48 + mouthBoost * 0.42);
      if (dist < halfW * 1.38) {
        const carve = (1 - smoothstep2(halfW * 0.32, halfW * 1.38, dist)) * (0.58 + mouthBoost * 0.16);
        if (carve > maxDepth) {
          maxDepth = carve;
          bestMouth = mouthBoost;
          const nearFord = len > 120 && (Math.abs(t - 0.32) < 0.14 || Math.abs(t - 0.72) < 0.14) || len <= 120 && Math.abs(t - 0.5) < 0.22 || u < 0.18;
          atShallowFord = nearFord;
        }
      }
    }
  }
  if (maxDepth <= 0.18) return null;
  if (!atShallowFord && (def.biome === "terrace" && maxDepth >= 0.54 || bestMouth > 0.78 && maxDepth >= 0.48)) {
    return "deep_water";
  }
  return "shallow_water";
}
function classifyMainWorldTerrain(world, wx, wy) {
  if (isOnBuiltBridgeNav(world, wx, wy)) return "bridge";
  const def = getIslandAtPoint(wx, wy, 10);
  if (!def) return "deep_water";
  return classifyIslandOnlyTerrain(def, wx, wy);
}
function getTerrainSpeedMultiplier(kind) {
  if (kind === "shallow_water") return 0.55;
  if (kind === "deep_water") return 0;
  return 1;
}
function computeIslandObstacleSignature(world, islandId, landmarks) {
  let bCount = 0;
  let bHash = 0;
  for (const b of world.buildings) {
    if (b.islandId !== islandId) continue;
    if (!b.unlocked && world.activeConstruction?.buildingId !== b.id) continue;
    bCount++;
    bHash = bHash + Math.round(b.x) * 3 + Math.round(b.y) * 7 | 0;
  }
  let nCount = 0;
  for (const n of world.wildNodes) {
    if (n.islandId === islandId && n.amount > 0.1) nCount++;
  }
  let mCount = 0;
  for (const m of world.memorials) {
    if (m.islandId === islandId) mCount++;
  }
  return `${bCount}:${bHash}:${nCount}:${mCount}:${landmarks.length}`;
}
function markCircleBlocked(grid, cx, cy, radius) {
  const minC = Math.max(0, Math.floor((cx - radius - grid.minX) / grid.cellSize));
  const maxC = Math.min(grid.cols - 1, Math.floor((cx + radius - grid.minX) / grid.cellSize));
  const minR = Math.max(0, Math.floor((cy - radius - grid.minY) / grid.cellSize));
  const maxR = Math.min(grid.rows - 1, Math.floor((cy + radius - grid.minY) / grid.cellSize));
  const r2 = radius * radius;
  for (let row = minR; row <= maxR; row++) {
    const py = grid.minY + (row + 0.5) * grid.cellSize;
    const dy = py - cy;
    for (let col = minC; col <= maxC; col++) {
      const px = grid.minX + (col + 0.5) * grid.cellSize;
      const dx = px - cx;
      if (dx * dx + dy * dy <= r2) {
        grid.blocked[row * grid.cols + col] = 1;
      }
    }
  }
}
function markEllipseBlocked(grid, cx, cy, rx, ry) {
  const minC = Math.max(0, Math.floor((cx - rx - grid.minX) / grid.cellSize));
  const maxC = Math.min(grid.cols - 1, Math.floor((cx + rx - grid.minX) / grid.cellSize));
  const minR = Math.max(0, Math.floor((cy - ry - grid.minY) / grid.cellSize));
  const maxR = Math.min(grid.rows - 1, Math.floor((cy + ry - grid.minY) / grid.cellSize));
  for (let row = minR; row <= maxR; row++) {
    const py = grid.minY + (row + 0.5) * grid.cellSize;
    const ey = (py - cy) / rxOrOne(ry);
    for (let col = minC; col <= maxC; col++) {
      const px = grid.minX + (col + 0.5) * grid.cellSize;
      const ex = (px - cx) / rxOrOne(rx);
      if (ex * ex + ey * ey <= 1) {
        grid.blocked[row * grid.cols + col] = 1;
      }
    }
  }
}
function rxOrOne(v) {
  return v > 1 ? v : 1;
}
function getOrBuildIslandNavGrid(world, islandId, landmarks) {
  let cache = worldGridCache.get(world);
  if (!cache) {
    cache = /* @__PURE__ */ new Map();
    worldGridCache.set(world, cache);
  }
  const sig = computeIslandObstacleSignature(world, islandId, landmarks);
  const existing = cache.get(islandId);
  if (existing && existing.signature === sig) {
    return existing;
  }
  const def = ISLAND_DEFS[islandId];
  const pad = 48;
  const minX = Math.floor(def.centerX - def.radiusX * 1.12 - pad);
  const minY = Math.floor(def.centerY - def.radiusY * 1.12 - pad);
  const width = Math.ceil((def.radiusX * 1.12 + pad) * 2);
  const height = Math.ceil((def.radiusY * 1.12 + pad) * 2);
  const cellSize = NAV_CELL_SIZE;
  const cols = Math.max(8, Math.ceil(width / cellSize));
  const rows = Math.max(8, Math.ceil(height / cellSize));
  const terrain = new Array(cols * rows);
  const blocked = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    const py = minY + (row + 0.5) * cellSize;
    for (let col = 0; col < cols; col++) {
      const px = minX + (col + 0.5) * cellSize;
      const t = classifyIslandOnlyTerrain(def, px, py);
      terrain[row * cols + col] = t;
    }
  }
  const grid = {
    islandId,
    minX,
    minY,
    cols,
    rows,
    cellSize,
    terrain,
    blocked,
    signature: sig
  };
  for (const b of world.buildings) {
    if (b.islandId !== islandId) continue;
    if (!b.unlocked && world.activeConstruction?.buildingId !== b.id) continue;
    if (b.type === "farm_plot" || b.type === "pasture" || b.type === "dock") continue;
    const fp = BUILDING_BLUEPRINTS[b.type]?.footprint ?? { rx: 16, ry: 14 };
    markEllipseBlocked(grid, b.x, b.y, fp.rx + 2, fp.ry + 2);
  }
  for (const n of world.wildNodes) {
    if (n.islandId !== islandId || n.amount <= 0.1) continue;
    const rad = n.kind === "tree" ? (n.scale ?? 1) * 11 : n.kind === "copper_vein" || n.kind === "iron_vein" ? 14 : 8;
    markCircleBlocked(grid, n.x, n.y, rad);
  }
  for (const lm of landmarks) {
    if (lm.islandId !== islandId) continue;
    if (lm.kind === "reed_clump" || lm.kind === "sky_islet") continue;
    markCircleBlocked(grid, lm.x, lm.y, lm.scale * 14);
  }
  for (const ruin of world.exploreRuins) {
    if (ruin.islandId !== islandId) continue;
    markCircleBlocked(grid, ruin.x, ruin.y, 20);
  }
  for (const mem of world.memorials) {
    if (mem.islandId !== islandId) continue;
    markCircleBlocked(grid, mem.x, mem.y, 9);
  }
  cache.set(islandId, grid);
  return grid;
}
function classifyIslandOnlyTerrain(def, wx, wy) {
  const nd = islandNormalizedDistNav(def, wx, wy);
  if (nd >= 0.96) return "deep_water";
  if (def.hasSpring && def.springOffset) {
    const sx = def.centerX + def.springOffset.dx;
    const sy = def.centerY + def.springOffset.dy;
    const sd = Math.hypot(wx - sx, wy - sy);
    if (sd < 18) return "deep_water";
    if (sd < 34) return "shallow_water";
  }
  const pond = pondDepthAtSim(def, wx, wy);
  if (pond.depth >= 0.42) return "deep_water";
  if (pond.depth > 0.16) return "shallow_water";
  const riverKind = sampleRiverTerrain(def, wx, wy);
  if (riverKind) return riverKind;
  if (def.biome === "mist_atoll") {
    const lx = (wx - def.centerX) / def.radiusX;
    const ly = (wy - def.centerY) / def.radiusY;
    const lOff = def.lagoonOffset ?? { lx: -0.14, ly: 0 };
    const lDist = Math.hypot(lx - lOff.lx, ly - lOff.ly);
    if (lDist < 0.16) return "deep_water";
    if (lDist < 0.25) return "shallow_water";
  }
  if (def.biome === "volcanic") {
    const lx = (wx - def.centerX) / def.radiusX;
    const ly = (wy - def.centerY) / def.radiusY;
    const tOff = def.trenchOffset ?? { lx: -0.34, ly: 0.22 };
    const trench = smoothstep2(0.24, 0.06, Math.hypot(lx - tOff.lx, ly - tOff.ly)) * 1.55;
    if (trench > 0.72) return "deep_water";
  }
  if (Math.hypot(wx - def.dockSpot.x, wy - def.dockSpot.y) <= 28) {
    return "land";
  }
  if (nd <= 0.15) {
    return "land";
  }
  const h = islandTerrainHeightAtSim(def, wx, wy, nd);
  if (h <= 0.02) return "deep_water";
  if (h <= 0.18) return "shallow_water";
  return "land";
}
function cellCenter(grid, col, row) {
  return {
    x: grid.minX + (col + 0.5) * grid.cellSize,
    y: grid.minY + (row + 0.5) * grid.cellSize
  };
}
function isCellWalkable(grid, col, row) {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  const idx = row * grid.cols + col;
  return grid.terrain[idx] !== "deep_water" && grid.blocked[idx] === 0;
}
function findNearestWalkableCell(grid, startCol, startRow, maxRadius, preferLand = false) {
  const sc = Math.max(0, Math.min(grid.cols - 1, startCol));
  const sr = Math.max(0, Math.min(grid.rows - 1, startRow));
  if (isCellWalkable(grid, sc, sr)) {
    return { col: sc, row: sr };
  }
  let bestShallow;
  let bestLand;
  for (let rad = 1; rad <= maxRadius; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
        const c = sc + dc;
        const r = sr + dr;
        if (!isCellWalkable(grid, c, r)) continue;
        const d2 = dc * dc + dr * dr;
        const t = grid.terrain[r * grid.cols + c];
        if (t === "land") {
          if (!bestLand || d2 < bestLand.d2) bestLand = { col: c, row: r, d2 };
        } else if (!bestShallow || d2 < bestShallow.d2) {
          bestShallow = { col: c, row: r, d2 };
        }
      }
    }
    if (bestLand !== void 0) return { col: bestLand.col, row: bestLand.row };
    if (!preferLand && bestShallow !== void 0) return { col: bestShallow.col, row: bestShallow.row };
  }
  return bestShallow !== void 0 ? { col: bestShallow.col, row: bestShallow.row } : null;
}
function hasGridLineOfSight(grid, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return true;
  const nx = -dy / dist;
  const ny = dx / dist;
  const margin = 5.5;
  const steps = Math.max(2, Math.ceil(dist / (grid.cellSize * 0.34)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = ax + dx * t;
    const py = ay + dy * t;
    const col = Math.floor((px - grid.minX) / grid.cellSize);
    const row = Math.floor((py - grid.minY) / grid.cellSize);
    if (!isCellWalkable(grid, col, row)) return false;
    for (const side of [-margin, margin]) {
      const sc = Math.floor((px + nx * side - grid.minX) / grid.cellSize);
      const sr = Math.floor((py + ny * side - grid.minY) / grid.cellSize);
      if (!isCellWalkable(grid, sc, sr)) return false;
    }
  }
  return true;
}
function simplifyPath(grid, startX, startY, rawPoints) {
  if (rawPoints.length <= 1) return rawPoints;
  const out = [];
  let anchorX = startX;
  let anchorY = startY;
  let idx = 0;
  while (idx < rawPoints.length) {
    let furthest = idx;
    for (let probe = rawPoints.length - 1; probe > idx; probe--) {
      if (hasGridLineOfSight(grid, anchorX, anchorY, rawPoints[probe].x, rawPoints[probe].y)) {
        furthest = probe;
        break;
      }
    }
    const chosen = rawPoints[furthest];
    out.push(chosen);
    anchorX = chosen.x;
    anchorY = chosen.y;
    idx = furthest + 1;
  }
  return out;
}
function findIslandPath(world, islandId, startX, startY, goalX, goalY, landmarks = []) {
  const grid = getOrBuildIslandNavGrid(world, islandId, landmarks);
  const rawSc = Math.floor((startX - grid.minX) / grid.cellSize);
  const rawSr = Math.floor((startY - grid.minY) / grid.cellSize);
  const rawGc = Math.floor((goalX - grid.minX) / grid.cellSize);
  const rawGr = Math.floor((goalY - grid.minY) / grid.cellSize);
  const startCell = findNearestWalkableCell(grid, rawSc, rawSr, 6, false);
  if (!startCell) {
    return {
      reachable: false,
      waypoints: [],
      adjustedGoalX: startX,
      adjustedGoalY: startY,
      reason: "Start position surrounded by impassable obstacles."
    };
  }
  if (rawGc < -2 || rawGr < -2 || rawGc >= grid.cols + 2 || rawGr >= grid.rows + 2) {
    return {
      reachable: false,
      waypoints: [],
      adjustedGoalX: startX,
      adjustedGoalY: startY,
      reason: "Destination lies beyond island shoreline."
    };
  }
  const goalCell = findNearestWalkableCell(grid, rawGc, rawGr, 5, true);
  if (!goalCell) {
    return {
      reachable: false,
      waypoints: [],
      adjustedGoalX: startX,
      adjustedGoalY: startY,
      reason: "Target lies inside deep water or enclosed cliff."
    };
  }
  const goalPos = isCellWalkable(grid, rawGc, rawGr) ? { x: goalX, y: goalY } : cellCenter(grid, goalCell.col, goalCell.row);
  if (startCell.col === goalCell.col && startCell.row === goalCell.row) {
    return {
      reachable: true,
      waypoints: [goalPos],
      adjustedGoalX: goalPos.x,
      adjustedGoalY: goalPos.y,
      reason: null
    };
  }
  const total = grid.cols * grid.rows;
  const startIdx = startCell.row * grid.cols + startCell.col;
  const goalIdx = goalCell.row * grid.cols + goalCell.col;
  const gScore = new Float32Array(total);
  gScore.fill(Infinity);
  gScore[startIdx] = 0;
  const cameFrom = new Int32Array(total);
  cameFrom.fill(-1);
  const closed = new Uint8Array(total);
  const inOpen = new Uint8Array(total);
  const heapIdx = [startIdx];
  const heapF = [Math.hypot(goalCell.col - startCell.col, goalCell.row - startCell.row)];
  inOpen[startIdx] = 1;
  const pushHeap = (idx, f) => {
    heapIdx.push(idx);
    heapF.push(f);
    let pos = heapIdx.length - 1;
    while (pos > 0) {
      const parent = pos - 1 >> 1;
      if (heapF[pos] < heapF[parent]) {
        const ti = heapIdx[parent];
        const tf = heapF[parent];
        heapIdx[parent] = heapIdx[pos];
        heapF[parent] = heapF[pos];
        heapIdx[pos] = ti;
        heapF[pos] = tf;
        pos = parent;
      } else break;
    }
  };
  const popHeap = () => {
    const top = heapIdx[0];
    const lastI = heapIdx.pop();
    const lastF = heapF.pop();
    if (heapIdx.length > 0) {
      heapIdx[0] = lastI;
      heapF[0] = lastF;
      let pos = 0;
      const n = heapIdx.length;
      while (true) {
        const left = pos * 2 + 1;
        const right = left + 1;
        let smallest = pos;
        if (left < n && heapF[left] < heapF[smallest]) smallest = left;
        if (right < n && heapF[right] < heapF[smallest]) smallest = right;
        if (smallest === pos) break;
        const ti = heapIdx[pos];
        const tf = heapF[pos];
        heapIdx[pos] = heapIdx[smallest];
        heapF[pos] = heapF[smallest];
        heapIdx[smallest] = ti;
        heapF[smallest] = tf;
        pos = smallest;
      }
    }
    return top;
  };
  const DIRS = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.4142],
    [1, -1, 1.4142],
    [-1, 1, 1.4142],
    [-1, -1, 1.4142]
  ];
  let found = false;
  let iterations = 0;
  const maxIterations = total * 2;
  while (heapIdx.length > 0 && iterations++ < maxIterations) {
    const curr = popHeap();
    if (curr === goalIdx) {
      found = true;
      break;
    }
    if (closed[curr]) continue;
    closed[curr] = 1;
    const cc = curr % grid.cols;
    const cr = Math.floor(curr / grid.cols);
    for (const [dc, dr, stepCost] of DIRS) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (!isCellWalkable(grid, nc, nr)) continue;
      if (dc !== 0 && dr !== 0) {
        if (!isCellWalkable(grid, cc + dc, cr) || !isCellWalkable(grid, cc, cr + dr)) continue;
      }
      const nIdx = nr * grid.cols + nc;
      if (closed[nIdx]) continue;
      const terrainPenalty = grid.terrain[nIdx] === "shallow_water" ? 1.85 : 1;
      let clearancePenalty = 0;
      if (!isCellWalkable(grid, nc + 1, nr) || !isCellWalkable(grid, nc - 1, nr) || !isCellWalkable(grid, nc, nr + 1) || !isCellWalkable(grid, nc, nr - 1)) {
        clearancePenalty = 0.32;
      }
      const tentativeG = gScore[curr] + stepCost * terrainPenalty + clearancePenalty;
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = curr;
        gScore[nIdx] = tentativeG;
        const h = Math.hypot(goalCell.col - nc, goalCell.row - nr);
        pushHeap(nIdx, tentativeG + h);
        inOpen[nIdx] = 1;
      }
    }
  }
  if (!found) {
    return {
      reachable: false,
      waypoints: [],
      adjustedGoalX: startX,
      adjustedGoalY: startY,
      reason: "No walkable path around water or cliff barriers."
    };
  }
  const rawPoints = [];
  let trace = goalIdx;
  while (trace !== -1 && trace !== startIdx) {
    const c = trace % grid.cols;
    const r = Math.floor(trace / grid.cols);
    rawPoints.push(trace === goalIdx ? goalPos : cellCenter(grid, c, r));
    trace = cameFrom[trace];
  }
  rawPoints.reverse();
  const simplified = simplifyPath(grid, startX, startY, rawPoints);
  return {
    reachable: true,
    waypoints: simplified.length > 0 ? simplified : [goalPos],
    adjustedGoalX: goalPos.x,
    adjustedGoalY: goalPos.y,
    reason: null
  };
}
function checkTargetReachability(world, fromIsland, fromX, fromY, targetX, targetY, landmarks = []) {
  const destDef = getIslandAtPoint(targetX, targetY, 6);
  const destIsland = destDef?.id ?? null;
  if (!destIsland) {
    if (isOnBuiltBridgeNav(world, targetX, targetY)) {
      return { reachable: true, reason: null };
    }
    return { reachable: false, reason: "Target lies in deep sky-sea water." };
  }
  if (destIsland !== fromIsland) {
    const br = findBridgeStepNav(world, fromIsland, destIsland);
    if (br) return { reachable: true, reason: null };
    const cb = findCablewayStepNav(world, fromIsland, destIsland);
    if (cb) return { reachable: true, reason: null };
    const hasGlider = world.buildings.some((b) => b.islandId === fromIsland && b.type === "glider_pad" && b.unlocked);
    if (hasGlider) return { reachable: true, reason: null };
    const hasDock = world.buildings.some((b) => b.islandId === fromIsland && b.type === "dock" && b.unlocked);
    if (hasDock) return { reachable: true, reason: null };
    return {
      reachable: false,
      reason: `No bridge, cableway, glider, or dock links ${ISLAND_DEFS[fromIsland].name} to ${ISLAND_DEFS[destIsland].name}.`
    };
  }
  const plan = findIslandPath(world, fromIsland, fromX, fromY, targetX, targetY, landmarks);
  return { reachable: plan.reachable, reason: plan.reason };
}
function resolveRadialObstacle(nx, ny, ox, oy, minRadius, dirX, dirY, slideFactor = 0.25) {
  const rdx = nx - ox;
  const rdy = ny - oy;
  const dist = Math.hypot(rdx, rdy);
  if (dist >= minRadius) return { x: nx, y: ny };
  if (dist < 0.01) {
    return { x: ox + minRadius, y: oy };
  }
  const ux = rdx / dist;
  const uy = rdy / dist;
  const push = minRadius - dist;
  const tx = -uy;
  const ty = ux;
  const sign = dirX * tx + dirY * ty >= 0 ? 1 : -1;
  return {
    x: nx + ux * push + tx * sign * push * slideFactor,
    y: ny + uy * push + ty * sign * push * slideFactor
  };
}
function clampMainWorldWalkable(world, currentIslandId, nx, ny) {
  const onBridge = isOnBuiltBridgeNav(world, nx, ny);
  if (onBridge) {
    const insideBridgeEnd = getIslandAtPoint(nx, ny, 0);
    return {
      x: nx,
      y: ny,
      islandId: insideBridgeEnd ? insideBridgeEnd.id : currentIslandId,
      hitEdge: false
    };
  }
  const insideAny = getIslandAtPoint(nx, ny, 24);
  if (insideAny) {
    return { x: nx, y: ny, islandId: insideAny.id, hitEdge: false };
  }
  const isl = ISLAND_DEFS[currentIslandId];
  const rx = Math.max(30, isl.radiusX - 28);
  const ry = Math.max(30, isl.radiusY - 28);
  const dx = nx - isl.centerX;
  const dy = ny - isl.centerY;
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(isl, ang);
  const norm = Math.hypot(dx / rx, dy / ry) / Math.max(0.4, wobble);
  if (norm > 1) {
    return {
      x: isl.centerX + dx / norm,
      y: isl.centerY + dy / norm,
      islandId: currentIslandId,
      hitEdge: true
    };
  }
  return { x: nx, y: ny, islandId: currentIslandId, hitEdge: false };
}
function steerMainWorldEntity(world, islandId, x, y, tx, ty, baseStepDist, ignoreSpring = false, stuckState, dt = 0.05, landmarks = [], selfId) {
  const currentTerrain = classifyMainWorldTerrain(world, x, y);
  const destDef = getIslandAtPoint(tx, ty, 6);
  const destIsland = destDef?.id ?? islandId;
  let navX = tx;
  let navY = ty;
  let crossingBridge = false;
  let navBlockedReason = null;
  if (destIsland !== islandId) {
    const br = findBridgeStepNav(world, islandId, destIsland);
    if (br) {
      crossingBridge = true;
      const fromIs1 = br.fromIsland === islandId;
      const enterX = fromIs1 ? br.x1 : br.x2;
      const enterY = fromIs1 ? br.y1 : br.y2;
      const exitX = fromIs1 ? br.x2 : br.x1;
      const exitY = fromIs1 ? br.y2 : br.y1;
      const onThisBridge = isOnBuiltBridgeNav(world, x, y)?.id === br.id;
      if (!onThisBridge && Math.hypot(x - enterX, y - enterY) > 28) {
        navX = enterX;
        navY = enterY;
      } else {
        navX = exitX;
        navY = exitY;
      }
    } else {
      const cb = findCablewayStepNav(world, islandId, destIsland);
      if (cb) {
        navX = cb.fromIsland === islandId ? cb.x1 : cb.x2;
        navY = cb.fromIsland === islandId ? cb.y1 : cb.y2;
      } else {
        const pad = world.buildings.find((b) => b.islandId === islandId && b.type === "glider_pad" && b.unlocked);
        if (pad) {
          navX = pad.x;
          navY = pad.y;
        } else {
          const dock = world.buildings.find((b) => b.islandId === islandId && b.type === "dock" && b.unlocked);
          if (dock) {
            navX = dock.x;
            navY = dock.y;
          } else {
            navBlockedReason = `Unreachable across sky-sea to ${ISLAND_DEFS[destIsland].name}.`;
            if (stuckState) stuckState.navBlockedReason = navBlockedReason;
            return {
              x,
              y,
              islandId,
              facing: tx >= x ? 1 : -1,
              hitEdge: true,
              hitWaterEdge: true,
              terrainKind: currentTerrain,
              wasStuckReset: true,
              navBlockedReason
            };
          }
        }
      }
    }
  }
  const onBridgeAlready = Boolean(isOnBuiltBridgeNav(world, x, y));
  let activeWaypointX = navX;
  let activeWaypointY = navY;
  let activeGrid = null;
  if (!onBridgeAlready && stuckState) {
    activeGrid = getOrBuildIslandNavGrid(world, islandId, landmarks);
    const prevSig = stuckGridSigCache.get(stuckState);
    const obstacleSigChanged = prevSig !== void 0 && prevSig !== activeGrid.signature;
    const goalChanged = stuckState.cachedGoalX === void 0 || stuckState.cachedGoalY === void 0 || stuckState.cachedIslandId !== islandId || Math.hypot(navX - stuckState.cachedGoalX, navY - stuckState.cachedGoalY) > 22;
    if (goalChanged || obstacleSigChanged || !stuckState.waypoints || stuckState.waypoints.length === 0) {
      const plan = findIslandPath(world, islandId, x, y, navX, navY, landmarks);
      stuckState.cachedGoalX = navX;
      stuckState.cachedGoalY = navY;
      stuckState.cachedIslandId = islandId;
      stuckGridSigCache.set(stuckState, activeGrid.signature);
      if (!plan.reachable) {
        navBlockedReason = plan.reason;
        stuckState.navBlockedReason = plan.reason;
        stuckState.waypoints = void 0;
        return {
          x,
          y,
          islandId,
          facing: tx >= x ? 1 : -1,
          hitEdge: false,
          hitWaterEdge: true,
          terrainKind: currentTerrain,
          wasStuckReset: true,
          navBlockedReason: plan.reason
        };
      }
      stuckState.waypoints = plan.waypoints;
      stuckState.navBlockedReason = null;
    }
    while (stuckState.waypoints.length > 1 && Math.hypot(stuckState.waypoints[0].x - x, stuckState.waypoints[0].y - y) < 16) {
      stuckState.waypoints.shift();
    }
    if (stuckState.waypoints.length > 0) {
      activeWaypointX = stuckState.waypoints[0].x;
      activeWaypointY = stuckState.waypoints[0].y;
    }
  }
  let dx = activeWaypointX - x;
  let dy = activeWaypointY - y;
  let d = Math.hypot(dx, dy);
  if (d < 0.01) {
    return {
      x,
      y,
      islandId,
      facing: 1,
      hitEdge: false,
      hitWaterEdge: false,
      terrainKind: currentTerrain,
      wasStuckReset: false,
      navBlockedReason: null
    };
  }
  let wasStuckReset = false;
  if (stuckState) {
    const goalDist = Math.hypot(navX - x, navY - y);
    if (goalDist > 18) {
      stuckState.timer += dt;
      if (stuckState.timer >= 0.65) {
        const moved = Math.hypot(x - stuckState.lastX, y - stuckState.lastY);
        if (moved < 4.5) {
          stuckState.detourSign = stuckState.detourSign === 1 ? -1 : 1;
          stuckState.recoveryCount = (stuckState.recoveryCount ?? 0) + 1;
          stuckState.waypoints = void 0;
          stuckState.timer = 0;
          stuckState.lastX = x;
          stuckState.lastY = y;
          if ((stuckState.recoveryCount ?? 0) === 2 && activeGrid) {
            const curCol = Math.floor((x - activeGrid.minX) / activeGrid.cellSize);
            const curRow = Math.floor((y - activeGrid.minY) / activeGrid.cellSize);
            const escapeCell = findNearestWalkableCell(activeGrid, curCol, curRow, 4, true);
            if (escapeCell) {
              const esc = cellCenter(activeGrid, escapeCell.col, escapeCell.row);
              const edx = esc.x - x;
              const edy = esc.y - y;
              if (Math.hypot(edx, edy) > 2) {
                dx = edx;
                dy = edy;
                d = Math.hypot(dx, dy);
              }
            }
          } else {
            const ang = Math.atan2(dy, dx) + stuckState.detourSign * 1.18;
            dx = Math.cos(ang) * d;
            dy = Math.sin(ang) * d;
          }
          if ((stuckState.recoveryCount ?? 0) >= 3) {
            stuckState.recoveryCount = 0;
            wasStuckReset = true;
            navBlockedReason = "Path blocked by crowding or terrain barrier.";
            stuckState.navBlockedReason = navBlockedReason;
          }
        } else {
          stuckState.timer = 0;
          stuckState.recoveryCount = 0;
          stuckState.lastX = x;
          stuckState.lastY = y;
        }
      }
    } else {
      stuckState.timer = 0;
      stuckState.recoveryCount = 0;
      stuckState.lastX = x;
      stuckState.lastY = y;
    }
  }
  const dirX = dx / d;
  const dirY = dy / d;
  const speedMult = getTerrainSpeedMultiplier(currentTerrain) || 0.55;
  const move = Math.min(d, baseStepDist * speedMult);
  let nx = x + dirX * move;
  let ny = y + dirY * move;
  const onBridgeNow = Boolean(isOnBuiltBridgeNav(world, nx, ny));
  if (!onBridgeNow) {
    for (const b of world.buildings) {
      if (b.islandId !== islandId) continue;
      if (!b.unlocked && world.activeConstruction?.buildingId !== b.id) continue;
      if (b.type === "farm_plot" || b.type === "pasture" || b.type === "dock") continue;
      const fp = BUILDING_BLUEPRINTS[b.type]?.footprint ?? { rx: 16, ry: 14 };
      const padX = fp.rx + 7.5;
      const padY = fp.ry + 7.5;
      const ex = (nx - b.x) / padX;
      const ey = (ny - b.y) / padY;
      const eDist = Math.hypot(ex, ey);
      if (eDist < 1) {
        if (eDist < 0.01) {
          nx = b.x + padX;
        } else {
          const ux = ex / eDist;
          const uy = ey / eDist;
          const slideX = -uy;
          const slideY = ux;
          const sign = stuckState ? stuckState.detourSign : dirX * slideX + dirY * slideY >= 0 ? 1 : -1;
          nx = b.x + (ux + slideX * sign * 0.42) * padX;
          ny = b.y + (uy + slideY * sign * 0.42) * padY;
        }
      }
    }
    for (const n of world.wildNodes) {
      if (n.islandId !== islandId || n.amount <= 0.1) continue;
      const rad = n.kind === "tree" ? (n.scale ?? 1) * 16 : n.kind === "copper_vein" || n.kind === "iron_vein" ? 22 : 15;
      const res = resolveRadialObstacle(nx, ny, n.x, n.y, rad, dirX, dirY, 0.52);
      nx = res.x;
      ny = res.y;
    }
    for (const lm of landmarks) {
      if (lm.islandId !== islandId) continue;
      if (lm.kind === "reed_clump" || lm.kind === "sky_islet") continue;
      const res = resolveRadialObstacle(nx, ny, lm.x, lm.y, lm.scale * 16, dirX, dirY, 0.48);
      nx = res.x;
      ny = res.y;
    }
    for (const ruin of world.exploreRuins) {
      if (ruin.islandId !== islandId) continue;
      const res = resolveRadialObstacle(nx, ny, ruin.x, ruin.y, 24, dirX, dirY, 0.45);
      nx = res.x;
      ny = res.y;
    }
    for (const mem of world.memorials) {
      if (mem.islandId !== islandId) continue;
      const res = resolveRadialObstacle(nx, ny, mem.x, mem.y, 11, dirX, dirY, 0.35);
      nx = res.x;
      ny = res.y;
    }
    const islDef = ISLAND_DEFS[islandId];
    if (!ignoreSpring && islDef.hasSpring && islDef.springOffset) {
      const sx = islDef.centerX + islDef.springOffset.dx;
      const sy = islDef.centerY + islDef.springOffset.dy;
      const res = resolveRadialObstacle(nx, ny, sx, sy, 22, dirX, dirY, 0.42);
      nx = res.x;
      ny = res.y;
    }
    const peers = [...world.villagers, ...world.clanVillagers, ...world.raiders];
    for (const other of peers) {
      if (selfId && other.id === selfId) continue;
      if (other.islandId !== islandId || other.voyageBoatId || other.transitGliderId || other.transitCableId) continue;
      if (Math.abs(other.x - x) < 0.35 && Math.abs(other.y - y) < 0.35) continue;
      const od = Math.hypot(nx - other.x, ny - other.y);
      if (od > 0.2 && od < 11.5) {
        const push = (11.5 - od) * 0.45;
        nx += (nx - other.x) / od * push;
        ny += (ny - other.y) / od * push;
      }
    }
  }
  let hitWaterEdge = false;
  if (!crossingBridge && !isOnBuiltBridgeNav(world, nx, ny)) {
    const nextTerrain = classifyMainWorldTerrain(world, nx, ny);
    if (nextTerrain === "deep_water") {
      hitWaterEdge = true;
      const tryX = classifyMainWorldTerrain(world, nx, y);
      const tryY = classifyMainWorldTerrain(world, x, ny);
      if (tryX !== "deep_water") {
        ny = y;
      } else if (tryY !== "deep_water") {
        nx = x;
      } else if (currentTerrain !== "deep_water") {
        nx = x;
        ny = y;
      }
      if (stuckState) stuckState.waypoints = void 0;
    }
  }
  let edgeDetected = false;
  if (!crossingBridge && !isOnBuiltBridgeNav(world, nx, ny)) {
    const isl = ISLAND_DEFS[islandId];
    const nd = islandNormalizedDistNav(isl, nx, ny);
    if (nd >= 0.9) {
      edgeDetected = true;
      const toCenterX = isl.centerX - nx;
      const toCenterY = isl.centerY - ny;
      const cd = Math.hypot(toCenterX, toCenterY) || 1;
      nx = x + toCenterX / cd * move * 0.65;
      ny = y + toCenterY / cd * move * 0.65;
    }
  }
  const clamped = clampMainWorldWalkable(world, islandId, nx, ny);
  const finalTerrain = classifyMainWorldTerrain(world, clamped.x, clamped.y);
  if (stuckState) {
    stuckState.terrainKind = finalTerrain;
  }
  return {
    x: clamped.x,
    y: clamped.y,
    islandId: clamped.islandId,
    facing: dx >= 0 ? 1 : -1,
    hitEdge: edgeDetected || clamped.hitEdge,
    hitWaterEdge,
    terrainKind: finalTerrain,
    wasStuckReset,
    navBlockedReason
  };
}

// src/game/migration.ts
function dispatchMigrantBoat(world, islandId, traveler) {
  const isl = ISLAND_DEFS[islandId];
  const seaX = isl.dockSpot.seaX;
  const seaY = isl.dockSpot.seaY;
  const outX = seaX - isl.centerX;
  const outY = seaY - isl.centerY;
  const len = Math.hypot(outX, outY) || 1;
  const startX = Math.round(seaX + outX / len * 240);
  const startY = Math.round(seaY + outY / len * 200);
  const boat = {
    id: `boat_mig_${traveler.id}`,
    name: `${traveler.name.split(" ")[0]}'s Skiff`,
    kind: "migrant_skiff",
    cultureId: world.islands[islandId]?.owningCultureId ?? "hearthfolk",
    homeIslandId: islandId,
    targetIslandId: islandId,
    x: startX,
    y: startY,
    targetX: seaX,
    targetY: seaY,
    yaw: Math.atan2(-(seaY - startY), seaX - startX),
    hp: 110,
    maxHp: 110,
    state: "sailing",
    cargoText: `Passenger: ${traveler.name}`,
    passengerIds: [],
    tripTimer: 12,
    arrivalId: traveler.id
  };
  traveler.boatId = boat.id;
  traveler.boatPhase = "approaching";
  world.boats.push(boat);
  world.pendingArrivals.push(traveler);
  emitWorldEvent(world, {
    category: "migration",
    significance: "notable",
    summary: `A migrant skiff carrying ${traveler.name} was sighted sailing toward ${isl.name}.`,
    islandId,
    participantIds: traveler.greeterId ? [traveler.greeterId] : []
  });
  return boat;
}
function tickMigrantBoatLifecycle(world, boat, dt, worldBoats, boatIndex) {
  if (boat.kind !== "migrant_skiff") return false;
  const arrival = boat.arrivalId ? world.pendingArrivals.find((a) => a.id === boat.arrivalId) : void 0;
  const dist = Math.hypot(boat.targetX - boat.x, boat.targetY - boat.y);
  if (boat.state === "returning") {
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
  if (boat.state === "sailing" && dist <= 12) {
    boat.state = "docked";
    boat.tripTimer = 18;
    if (arrival) {
      arrival.boatPhase = "disembarked";
      const isl = ISLAND_DEFS[arrival.islandId ?? boat.targetIslandId];
      if (arrival.greeterId) {
        const greeter = world.villagers.find((v) => v.id === arrival.greeterId);
        if (greeter && greeter.state !== "fighting" && greeter.state !== "sleeping") {
          greeter.targetX = isl.dockSpot.x;
          greeter.targetY = isl.dockSpot.y;
          greeter.state = "socializing";
          greeter.autonomyReason = `Meeting ${arrival.name.split(" ")[0]}'s skiff at ${isl.name} pier.`;
          greeter.thoughtBubble = "Ahoy!";
          greeter.thoughtTimer = 2.6;
        }
      }
      emitWorldEvent(world, {
        category: "migration",
        significance: "minor",
        summary: `${arrival.name}'s skiff docked at ${isl.name} shore.`,
        islandId: isl.id,
        participantIds: arrival.greeterId ? [arrival.greeterId] : []
      });
    }
    return true;
  }
  if (!arrival && boat.state === "docked" && boat.tripTimer <= 0) {
    sendMigrantBoatAway(boat);
  }
  void dt;
  return false;
}
function sendMigrantBoatAway(boat, passengerName) {
  const isl = ISLAND_DEFS[boat.targetIslandId ?? boat.homeIslandId];
  const outX = boat.x - isl.centerX;
  const outY = boat.y - isl.centerY;
  const len = Math.hypot(outX, outY) || 1;
  boat.state = "returning";
  boat.targetX = Math.round(isl.dockSpot.seaX + outX / len * 280);
  boat.targetY = Math.round(isl.dockSpot.seaY + outY / len * 240);
  boat.tripTimer = 16;
  if (passengerName) {
    boat.cargoText = `Departing with ${passengerName}`;
  }
}
function getMigrantLandingPoint(islandId) {
  const isl = ISLAND_DEFS[islandId];
  return {
    x: isl.dockSpot.x + (Math.random() * 14 - 7),
    y: isl.dockSpot.y + (Math.random() * 14 - 7)
  };
}
function getGreetingVillagerForIsland(world, islandId) {
  return world.villagers.find(
    (v) => (v.homeIslandId ?? v.islandId) === islandId && (v.lifeStage === "adult" || v.lifeStage === "elder")
  ) ?? null;
}

// src/game/npcBrain.ts
var ARCHIPELAGO_LANDMARKS = buildArchipelagoLandmarks();
function getTechUnlocked(world, techId) {
  return world.unlockedTechIds.includes(techId);
}
function hasBuildingType(world, type, islandId) {
  return world.buildings.some(
    (b) => b.unlocked && b.type === type && (!islandId || b.islandId === islandId)
  );
}
function getBonfireOnIsland(world, islandId) {
  return world.buildings.find((b) => b.islandId === islandId && b.type === "bonfire" && b.unlocked);
}
function getHomeOnIsland(world, islandId) {
  return world.buildings.find(
    (b) => b.unlocked && b.islandId === islandId && (b.type === "cottage" || b.type === "lean_to")
  );
}
function canVillagerWorkInBrain(world, v) {
  if (v.lifeStage === "infant" || v.lifeStage === "child") return false;
  if (world.gameMode === "sovereign_sandbox" || world.gameMode === "shared_siege") return true;
  return v.cognition.awareness >= 30 && v.cognition.observedConcepts.length >= 2 && v.cognition.socialCount >= 1;
}
function isTaskAvailableInBrain(world, task, islandId) {
  const meta = TASK_BY_ID[task];
  if (!meta) return false;
  if (task === "gather_stone" || task === "forage" || task === "chop") return true;
  if (meta.requiredTechId && !getTechUnlocked(world, meta.requiredTechId)) return false;
  if (task === "farm" && !hasBuildingType(world, "farm_plot", islandId)) return false;
  if (task === "pasture" && !hasBuildingType(world, "pasture", islandId)) return false;
  if (task === "quarry" && !hasBuildingType(world, "quarry", islandId)) return false;
  if (task === "fish" && !hasBuildingType(world, "dock", islandId)) return false;
  if (task === "bake" && !hasBuildingType(world, "bakery", islandId)) return false;
  if (task === "study" && !hasBuildingType(world, "library", islandId)) return false;
  if (task === "smelt" && !hasBuildingType(world, "smeltery", islandId)) return false;
  if (task === "guard" && !hasBuildingType(world, "watchtower", islandId) && !hasBuildingType(world, "barracks", islandId)) {
    return false;
  }
  return true;
}
function isReachablePoint(world, v, x, y, islId) {
  if (islId === v.islandId) {
    const reach = checkTargetReachability(world, v.islandId, v.x, v.y, x, y, ARCHIPELAGO_LANDMARKS);
    return { ok: reach.reachable, reason: reach.reason ?? void 0 };
  }
  const hasBridge = world.bridges.some(
    (b) => b.built && (b.fromIsland === v.islandId && b.toIsland === islId || b.toIsland === v.islandId && b.fromIsland === islId)
  );
  const hasCable = world.cableways.some(
    (c) => c.built && (c.fromIsland === v.islandId && c.toIsland === islId || c.toIsland === v.islandId && c.fromIsland === islId)
  );
  const hasDock = world.buildings.some((b) => b.islandId === v.islandId && b.type === "dock" && b.unlocked);
  const hasGlider = world.buildings.some((b) => b.islandId === v.islandId && b.type === "glider_pad" && b.unlocked);
  if (!hasBridge && !hasCable && !hasDock && !hasGlider) {
    return { ok: false, reason: `No bridge, dock, or cableway to ${ISLAND_DEFS[islId].name}` };
  }
  return { ok: true };
}
function pickExplorationSpot(world, v) {
  const isl = ISLAND_DEFS[v.islandId];
  const observed = new Set(v.cognition.observedConcepts);
  const candidates = [];
  for (const node of world.wildNodes) {
    if (node.islandId !== v.islandId || node.amount <= 0) continue;
    if (!observed.has(node.kind)) {
      const r = isReachablePoint(world, v, node.x, node.y, node.islandId);
      if (r.ok) {
        candidates.push({ concept: node.kind, x: node.x, y: node.y, label: node.kind.replace("_", " ") });
      }
    }
  }
  if (isl.hasSpring && isl.springOffset && !observed.has("spring")) {
    const sx = isl.centerX + isl.springOffset.dx;
    const sy = isl.centerY + isl.springOffset.dy + 24;
    if (isReachablePoint(world, v, sx, sy, v.islandId).ok) {
      candidates.push({ concept: "spring", x: sx, y: sy, label: "fresh spring" });
    }
  }
  const herd = world.wildHerds.find((h) => h.islandId === v.islandId && h.hp > 0);
  if (herd && !observed.has("wildlife") && isReachablePoint(world, v, herd.x, herd.y, v.islandId).ok) {
    candidates.push({ concept: "wildlife", x: herd.x, y: herd.y, label: `wild ${herd.kind}` });
  }
  const fire = getBonfireOnIsland(world, v.islandId);
  if (fire && !observed.has("embers")) {
    candidates.push({ concept: "embers", x: fire.x, y: fire.y + 18, label: "crackling embers" });
  }
  if (!observed.has("horizon")) {
    const ang = (v.animPhase + v.x * 0.01) % (Math.PI * 2);
    candidates.push({
      concept: "horizon",
      x: isl.centerX + Math.cos(ang) * (isl.radiusX - 62),
      y: isl.centerY + Math.sin(ang) * (isl.radiusY - 56),
      label: "cliff edge horizon"
    });
  }
  if (candidates.length > 0) {
    return candidates[Math.floor((v.animPhase * 10 + candidates.length) % candidates.length) % candidates.length];
  }
  const anyNode = world.wildNodes.filter((n) => n.islandId === v.islandId && n.amount > 0);
  if (anyNode.length > 0) {
    const n = anyNode[Math.floor(Math.random() * anyNode.length)];
    if (isReachablePoint(world, v, n.x, n.y, n.islandId).ok) {
      return { concept: n.kind, x: n.x, y: n.y, label: n.kind.replace("_", " ") };
    }
  }
  return {
    concept: "horizon",
    x: isl.centerX + (Math.random() * 110 - 55),
    y: isl.centerY + (Math.random() * 80 - 40),
    label: "meadow clearing"
  };
}
function canExecuteVillagerAction(world, v, action) {
  const isl = ISLAND_DEFS[v.islandId];
  const homeId = v.homeIslandId ?? v.islandId;
  const homeRes = world.villageResources?.[homeId] ?? world.resources;
  const fire = getBonfireOnIsland(world, v.islandId);
  const home = getHomeOnIsland(world, v.islandId);
  if (action === "warm_up") {
    if (!fire && !home) {
      return {
        valid: true,
        label: "Huddle for Warmth",
        targetX: isl.centerX,
        targetY: isl.centerY + 14,
        targetIslandId: v.islandId,
        activityState: "resting",
        reason: "Huddling near camp center to conserve warmth."
      };
    }
    const tx = fire?.x ?? home?.x ?? isl.centerX;
    const ty = (fire?.y ?? home?.y ?? isl.centerY) + 16;
    const reach = isReachablePoint(world, v, tx, ty, v.islandId);
    if (!reach.ok) return { valid: false, label: "Warm by Hearth", blockedReason: reach.reason };
    return {
      valid: true,
      label: "Warm by Hearth",
      targetX: tx,
      targetY: ty,
      targetIslandId: v.islandId,
      activityState: "resting",
      reason: fire ? `Warming cold hands beside ${fire.name}.` : `Sheltering inside ${home.name}.`
    };
  }
  if (action === "eat_comfort") {
    if ((world.comforts?.[v.favoriteComfort] ?? 0) < 1) {
      return { valid: false, label: `Eat ${v.favoriteComfort}`, blockedReason: `No ${v.favoriteComfort} in comfort stock` };
    }
    return {
      valid: true,
      label: `Eat ${COMFORT_LABELS[v.favoriteComfort]}`,
      targetX: v.x,
      targetY: v.y,
      targetIslandId: v.islandId,
      activityState: "eating",
      reason: `Savoring ${COMFORT_LABELS[v.favoriteComfort].toLowerCase()}.`
    };
  }
  if (action === "eat_stockpile") {
    if ((homeRes.food ?? 0) < 1) {
      return { valid: false, label: "Eat from Stockpile", blockedReason: "Village food stockpile is empty" };
    }
    return {
      valid: true,
      label: "Eat from Stockpile",
      targetX: fire?.x ?? v.x,
      targetY: fire ? fire.y + 16 : v.y,
      targetIslandId: v.islandId,
      activityState: "eating",
      reason: "Eating from village food stores."
    };
  }
  if (action === "haul_to_stockpile") {
    if (!v.carriedResource || (v.carriedAmount ?? 0) <= 0.05) {
      return { valid: false, label: "Haul Resources", blockedReason: "Not carrying any harvested goods" };
    }
    const activeSite = world.activeConstruction && world.buildings.find(
      (b) => b.id === world.activeConstruction?.buildingId && !b.unlocked && b.islandId === v.islandId && (b.requiredMaterials?.[v.carriedResource] ?? 0) > (b.deliveredMaterials?.[v.carriedResource] ?? 0)
    );
    const dest = activeSite ? { x: activeSite.x, y: activeSite.y + 18 } : getStockpileDepositPoint(world, homeId);
    const reach = isReachablePoint(world, v, dest.x, dest.y, homeId);
    if (!reach.ok) return { valid: false, label: "Haul Resources", blockedReason: reach.reason };
    return {
      valid: true,
      label: activeSite ? `Deliver ${v.carriedResource} to ${activeSite.name}` : `Haul ${v.carriedResource} to Store`,
      targetX: dest.x,
      targetY: dest.y,
      targetIslandId: homeId,
      activityState: "walking",
      reason: activeSite ? `Delivering ${Math.round((v.carriedAmount ?? 0) * 10) / 10} ${v.carriedResource} to ${activeSite.name}.` : `Hauling ${Math.round((v.carriedAmount ?? 0) * 10) / 10} ${v.carriedResource} to village stockpile.`
    };
  }
  if (action === "sleep") {
    const tx = home ? home.x : fire ? fire.x + 12 : isl.centerX;
    const ty = (home ? home.y : fire ? fire.y : isl.centerY) + 18;
    return {
      valid: true,
      label: home ? "Sleep Indoors" : "Rest by Fire",
      targetX: tx,
      targetY: ty,
      targetIslandId: v.islandId,
      activityState: "sleeping",
      reason: home ? `Sleeping warmly inside ${home.name}.` : fire ? "Dozing beside the open Bonfire." : "Resting beneath open stars."
    };
  }
  if (action === "bonfire_ritual") {
    if (!fire) {
      return { valid: false, label: "Evening Hearth Circle", blockedReason: "No Bonfire built on this island" };
    }
    const ang = (v.animPhase * 1.7 + (v.x + v.y) * 0.01) % (Math.PI * 2);
    const rad = 46 + v.hairStyle % 3 * 10;
    return {
      valid: true,
      label: "Evening Hearth Circle",
      targetX: fire.x + Math.cos(ang) * rad,
      targetY: fire.y + Math.sin(ang) * rad * 0.82,
      targetIslandId: v.islandId,
      activityState: "socializing",
      reason: `Gathering by ${fire.name} for nightly stories & cultural bonding.`
    };
  }
  if (action === "defend_island") {
    const raider = world.raiders.find((r) => r.islandId === v.islandId && r.hp > 0);
    if (!raider) {
      return { valid: false, label: "Defend Village", blockedReason: "No hostile threats on island" };
    }
    const reach = isReachablePoint(world, v, raider.x, raider.y, raider.islandId);
    if (!reach.ok) {
      return { valid: false, label: "Defend Village", blockedReason: reach.reason };
    }
    return {
      valid: true,
      label: "Defend Village",
      targetX: raider.x,
      targetY: raider.y,
      targetIslandId: raider.islandId,
      task: "guard",
      activityState: "fighting",
      reason: `Defending ${isl.name} from ${raider.name.split(" ")[0]}!`
    };
  }
  if (action === "socialize_learn") {
    const peer = world.villagers.find(
      (other) => other.id !== v.id && !other.banished && other.islandId === v.islandId && other.lifeStage !== "infant"
    );
    if (!peer) {
      return { valid: false, label: "Chat with Kin", blockedReason: "No peers nearby on island" };
    }
    const reach = isReachablePoint(world, v, peer.x, peer.y, peer.islandId);
    if (!reach.ok) {
      return { valid: false, label: "Chat with Kin", blockedReason: reach.reason };
    }
    return {
      valid: true,
      label: `Chat with ${peer.name.split(" ")[0]}`,
      targetX: peer.x,
      targetY: peer.y,
      targetIslandId: peer.islandId,
      socialPeerId: peer.id,
      activityState: "socializing",
      reason: v.cognition.socialCount < 2 ? `Walking over to greet & learn with ${peer.name.split(" ")[0]} (${v.cognition.socialCount}/2 chats).` : `Sharing discoveries & warmth with ${peer.name.split(" ")[0]}.`
    };
  }
  if (action === "explore_wonder") {
    const spot = pickExplorationSpot(world, v);
    const reach = isReachablePoint(world, v, spot.x, spot.y, v.islandId);
    if (!reach.ok) {
      return { valid: false, label: "Explore Island", blockedReason: reach.reason };
    }
    return {
      valid: true,
      label: `Inspect ${spot.label}`,
      targetX: spot.x,
      targetY: spot.y,
      targetIslandId: v.islandId,
      task: "explore",
      focusConcept: spot.concept,
      activityState: "exploring",
      reason: v.cognition.stage === "awakening" ? `Wandering like a child toward ${spot.label} in curiosity.` : `Inspecting ${spot.label} to learn how the world works.`
    };
  }
  if (action === "child_play") {
    if (v.lifeStage !== "child") {
      return { valid: false, label: "Play Outdoors", blockedReason: "Only children play freely" };
    }
    const tx = (fire?.x ?? isl.centerX) + (Math.random() * 80 - 40);
    const ty = (fire?.y ?? isl.centerY) + (Math.random() * 64 - 32);
    return {
      valid: true,
      label: "Play Outdoors",
      targetX: tx,
      targetY: ty,
      targetIslandId: v.islandId,
      activityState: "playing",
      reason: "Playing among wildflowers & skipping pebbles."
    };
  }
  if (action.startsWith("task:")) {
    const task = action.slice(5);
    const meta = TASK_BY_ID[task];
    if (!meta) return { valid: false, label: action, blockedReason: "Unknown task" };
    const isEmergencyForage = task === "forage" && v.hunger < 26;
    if (!isEmergencyForage && !canVillagerWorkInBrain(world, v)) {
      return {
        valid: false,
        label: meta.label,
        blockedReason: "Cognition still awakening (needs 2 wonders & 1 chat)"
      };
    }
    if (!isTaskAvailableInBrain(world, task, homeId)) {
      const reqTech = meta.requiredTechId ? TECH_BY_ID[meta.requiredTechId]?.name : void 0;
      return {
        valid: false,
        label: meta.label,
        blockedReason: reqTech ? `Requires ${reqTech} & workplace` : "Required workplace not built"
      };
    }
    if (task === "forage") {
      const node = world.wildNodes.find(
        (n) => n.islandId === v.islandId && n.amount > 0.05 && (n.kind === "berry_bush" || n.kind === "flint_pile" || n.kind === "branch_pile")
      ) ?? world.wildNodes.find(
        (n) => world.islands[n.islandId]?.discovered && n.amount > 0.05 && n.kind === "berry_bush"
      );
      if (!node) {
        return { valid: false, label: meta.label, blockedReason: "No berry bushes, flint, or branches left" };
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
        activityState: Math.hypot(v.x - node.x, v.y - node.y) > 18 ? "walking" : "working",
        reason: `${meta.verb}.`
      };
    }
    if (task === "gather_stone") {
      const node = world.wildNodes.find((n) => n.islandId === v.islandId && n.amount > 0.1 && (n.kind === "stone_boulder" || n.kind === "flint_pile")) ?? world.wildNodes.find((n) => world.islands[n.islandId]?.discovered && n.amount > 0.1 && (n.kind === "stone_boulder" || n.kind === "flint_pile"));
      if (!node) {
        return { valid: false, label: meta.label, blockedReason: "No stone boulders or flint piles left" };
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
        activityState: Math.hypot(v.x - node.x, v.y - node.y) > 18 ? "walking" : "working",
        reason: `${meta.verb}.`
      };
    }
    if (task === "chop") {
      const node = world.wildNodes.find((n) => n.islandId === v.islandId && n.amount > 0.1 && (n.kind === "tree" || n.kind === "branch_pile")) ?? world.wildNodes.find((n) => world.islands[n.islandId]?.discovered && n.amount > 0.1 && n.kind === "tree");
      if (!node) {
        return { valid: false, label: meta.label, blockedReason: "No timber trees or branches available" };
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
        activityState: Math.hypot(v.x - node.x, v.y - node.y) > 18 ? "walking" : "working",
        reason: `${meta.verb}.`
      };
    }
    if (task === "hunt") {
      const prey = world.wildHerds.find((h) => h.islandId === v.islandId && h.hp > 0) ?? world.wildHerds.find((h) => world.islands[h.islandId]?.discovered && h.hp > 0);
      if (!prey) return { valid: false, label: meta.label, blockedReason: "No wild game sighted" };
      const reach = isReachablePoint(world, v, prey.x, prey.y, prey.islandId);
      if (!reach.ok) return { valid: false, label: meta.label, blockedReason: reach.reason };
      return {
        valid: true,
        label: meta.label,
        task,
        targetX: prey.x,
        targetY: prey.y,
        targetIslandId: prey.islandId,
        activityState: "hunting",
        reason: `Tracking wild ${prey.kind}.`
      };
    }
    if (task === "bake" && (homeRes.grain ?? 0) < 1) {
      return { valid: false, label: meta.label, blockedReason: "Requires grain in village store" };
    }
    if (task === "smelt" && (homeRes.copper ?? 0) < 1 && (homeRes.iron ?? 0) < 1) {
      return { valid: false, label: meta.label, blockedReason: "Requires copper or iron ore" };
    }
    const typeMap = {
      farm: "farm_plot",
      pasture: "pasture",
      quarry: "quarry",
      smelt: "smeltery",
      bake: "bakery",
      study: "library",
      guard: hasBuildingType(world, "watchtower", v.islandId) ? "watchtower" : "barracks",
      fish: "dock"
    };
    const bType = typeMap[task];
    if (bType) {
      const b = world.buildings.find((item) => item.type === bType && item.unlocked && item.islandId === v.islandId) ?? world.buildings.find((item) => item.type === bType && item.unlocked);
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
        activityState: Math.hypot(v.x - b.x, v.y - (b.y + 16)) > 18 ? "walking" : "working",
        reason: `${meta.verb}.`
      };
    }
    if (task === "explore") {
      const localRuin = world.exploreRuins.find((r) => r.islandId === v.islandId && r.cooldownTimer <= 0);
      if (localRuin && isReachablePoint(world, v, localRuin.x, localRuin.y + 12, localRuin.islandId).ok) {
        return {
          valid: true,
          label: meta.label,
          task: "explore",
          targetX: localRuin.x,
          targetY: localRuin.y + 12,
          targetIslandId: localRuin.islandId,
          activityState: "exploring",
          reason: `Scouting ${localRuin.name}.`
        };
      }
      const spot = pickExplorationSpot(world, v);
      return {
        valid: true,
        label: meta.label,
        task: "explore",
        targetX: spot.x,
        targetY: spot.y,
        targetIslandId: v.islandId,
        activityState: "exploring",
        reason: `Exploring toward ${spot.label}.`
      };
    }
  }
  return { valid: false, label: action, blockedReason: "Unsupported action" };
}
function getNextBuildResourceNeed(world, homeId) {
  const res = world.villageResources?.[homeId] ?? world.resources;
  if (world.activeConstruction) {
    const activeB = world.buildings.find(
      (b) => b.id === world.activeConstruction?.buildingId && !b.unlocked && b.islandId === homeId
    );
    if (activeB?.requiredMaterials) {
      const remStone = Math.max(0, (activeB.requiredMaterials.stone ?? 0) - (activeB.deliveredMaterials?.stone ?? 0));
      const remTimber = Math.max(0, (activeB.requiredMaterials.timber ?? 0) - (activeB.deliveredMaterials?.timber ?? 0));
      if (remStone > (res.stone ?? 0) || remTimber > (res.timber ?? 0)) {
        return {
          needStone: remStone > (res.stone ?? 0),
          needTimber: remTimber > (res.timber ?? 0)
        };
      }
    }
  }
  const countType = (t) => world.buildings.filter((b) => b.islandId === homeId && b.type === t).length;
  const pop = Math.max(1, world.villagers.filter((u) => (u.homeIslandId ?? u.islandId) === homeId).length);
  const beds = world.buildings.filter((b) => b.islandId === homeId && b.unlocked).reduce((s, b) => s + (b.housingCapacity ?? 0), 0);
  const checks = beds < pop || countType("lean_to") + countType("cottage") === 0 ? ["bonfire", "farm_plot", "lean_to", "cottage", "woodshop", "quarry", "dock", "watchtower", "library", "smeltery", "bakery", "barracks"] : ["bonfire", "farm_plot", "lean_to", "woodshop", "quarry", "cottage", "dock", "glider_pad", "watchtower", "library", "smeltery", "bakery", "barracks"];
  for (const t of checks) {
    const bp = BUILDING_BLUEPRINTS[t];
    if (!bp || !getTechUnlocked(world, bp.requiredTechId)) continue;
    if (countType(t) === 0 || t === "farm_plot" && countType(t) < 2) {
      return {
        needStone: (bp.baseCost.stone ?? 0) > (res.stone ?? 0),
        needTimber: (bp.baseCost.timber ?? 0) > (res.timber ?? 0)
      };
    }
  }
  return { needStone: false, needTimber: false };
}
function evaluateVillagerDecision(world, v) {
  const isl = ISLAND_DEFS[v.islandId];
  const homeId = v.homeIslandId ?? v.islandId;
  const homeRes = world.villageResources?.[homeId] ?? world.resources;
  const p = getNpcPersonality(v);
  const t = world.environment.timeOfDay;
  const isNight = t < 0.21 || t > 0.83;
  const isDuskRitual = t >= 0.72 && t <= 0.89;
  const isColdSeason = world.environment.season === "winter" || world.environment.weather === "snow";
  const pop = Math.max(1, world.villagers.filter((u) => (u.homeIslandId ?? u.islandId) === homeId).length);
  const prevAction = v.decisionTrace?.chosenAction ?? null;
  if (v.banished) {
    const pier = getPierApproachPoint(v.islandId);
    const reason = `Banished by ${isl.name} \u2014 heading to shore to board departing skiff.`;
    const trace2 = {
      chosenAction: "depart_banished",
      chosenLabel: "Leave Island (Banished)",
      reason,
      goal: "Walk to shore pier and sail away",
      validated: true,
      evaluatedAtDay: world.environment.dayCount,
      evaluatedAtTime: t,
      candidates: [
        { action: "depart_banished", label: "Leave Island (Banished)", score: 100, valid: true, reason }
      ]
    };
    return {
      trace: trace2,
      selectedAction: "depart_banished",
      activityState: "walking",
      task: v.activeTask,
      targetX: pier.x,
      targetY: pier.y,
      autonomyReason: reason
    };
  }
  if (v.lifeStage === "infant") {
    const fire = getBonfireOnIsland(world, v.islandId);
    const tx = (fire?.x ?? isl.centerX) + (Math.random() * 18 - 9);
    const ty = (fire?.y ?? isl.centerY) + 18;
    const reason = "Babbling softly and watching light beside the hearth.";
    const trace2 = {
      chosenAction: "infant_rest",
      chosenLabel: "Stay Near Hearth",
      reason,
      goal: "Rest under caretaker watch",
      validated: true,
      evaluatedAtDay: world.environment.dayCount,
      evaluatedAtTime: t,
      candidates: [
        { action: "infant_rest", label: "Stay Near Hearth", score: 100, valid: true, reason }
      ]
    };
    return {
      trace: trace2,
      selectedAction: "infant_rest",
      activityState: "sleeping",
      task: v.activeTask,
      targetX: tx,
      targetY: ty,
      autonomyReason: reason
    };
  }
  const candidateSpecs = [];
  const warmthDeficit = Math.max(0, (isColdSeason ? 55 : 35) - v.warmth);
  candidateSpecs.push({
    action: "warm_up",
    baseScore: warmthDeficit > 0 ? 75 + warmthDeficit * 1.4 : 6,
    reason: warmthDeficit > 0 ? `Warmth low (${Math.round(v.warmth)}%)` : "Adequately warm"
  });
  const hungerDeficit = Math.max(0, 50 - v.hunger);
  candidateSpecs.push({
    action: "eat_comfort",
    baseScore: v.hunger < 48 ? 72 + hungerDeficit * 1.3 : 4,
    reason: v.hunger < 48 ? `Craves ${v.favoriteComfort} (hunger ${Math.round(v.hunger)}%)` : "Not hungry"
  });
  candidateSpecs.push({
    action: "eat_stockpile",
    baseScore: v.hunger < 46 ? 68 + hungerDeficit * 1.25 : 4,
    reason: v.hunger < 46 ? `Needs village food (hunger ${Math.round(v.hunger)}%)` : "Not hungry"
  });
  if (isDuskRitual) {
    candidateSpecs.push({
      action: "bonfire_ritual",
      baseScore: 66 + p.sociability * 16 + p.empathy * 10,
      reason: "Twilight hearth ritual fosters village bonds & culture"
    });
  }
  if (isNight && !v.traits.includes("resilient") && v.energy < 70) {
    candidateSpecs.push({
      action: "sleep",
      baseScore: 64 + Math.max(0, 68 - v.energy) * 0.9,
      reason: `Nighttime fatigue (energy ${Math.round(v.energy)}%)`
    });
  } else if (v.energy < 24) {
    candidateSpecs.push({
      action: "sleep",
      baseScore: 76 + (24 - v.energy) * 1.2,
      reason: `Exhausted (energy ${Math.round(v.energy)}%)`
    });
  }
  if (world.raiders.some((r) => r.islandId === v.islandId && r.hp > 0)) {
    const braveryScore = 44 + p.bravery * 46 - p.caution * 14 + (v.weaponType !== "none" ? 16 : 0);
    candidateSpecs.push({
      action: "defend_island",
      baseScore: braveryScore,
      reason: p.bravery >= 0.45 ? "Protecting home island from raiders" : "Reluctant defense urge"
    });
  }
  if (v.lifeStage === "child") {
    candidateSpecs.push({
      action: "explore_wonder",
      baseScore: 52 + p.curiosity * 24,
      reason: "Childhood curiosity about island wonders"
    });
    candidateSpecs.push({
      action: "child_play",
      baseScore: 46 + p.sociability * 14,
      reason: "Playful energy around camp"
    });
  }
  const workReady = canVillagerWorkInBrain(world, v);
  const needsSocialGate = !workReady && v.cognition.socialCount < 2;
  candidateSpecs.push({
    action: "socialize_learn",
    baseScore: (needsSocialGate ? 62 : 24) + p.sociability * 22 + p.empathy * 10 + (v.activeWish === "chat" ? 10 : 0),
    reason: needsSocialGate ? `Awakening social bond (${v.cognition.socialCount}/2 chats)` : "Social bonding & sharing discoveries"
  });
  candidateSpecs.push({
    action: "explore_wonder",
    baseScore: (!workReady ? 58 : 22) + p.curiosity * 24 + (v.activeWish === "explore" ? 10 : 0) + (world.chiefFocus === "explore" ? 12 : 0),
    reason: !workReady ? `Awakening curiosity (${v.cognition.observedConcepts.length}/2 wonders)` : "Curiosity & exploring uncharted island wonders"
  });
  const carriedAmt = v.carriedAmount ?? 0;
  if (v.carriedResource && carriedAmt > 0.05) {
    const cap = getCarryCap(v);
    const fullRatio = Math.min(1, carriedAmt / cap);
    const neededBySite = world.activeConstruction && world.buildings.some(
      (b) => b.id === world.activeConstruction?.buildingId && !b.unlocked && b.islandId === v.islandId && (b.requiredMaterials?.[v.carriedResource] ?? 0) > (b.deliveredMaterials?.[v.carriedResource] ?? 0)
    );
    candidateSpecs.push({
      action: "haul_to_stockpile",
      baseScore: fullRatio >= 0.85 ? 92 : (neededBySite ? 80 : 32) + fullRatio * 34,
      reason: fullRatio >= 0.85 ? `Carry load full (${carriedAmt.toFixed(1)}/${cap} ${v.carriedResource})` : neededBySite ? `Build site awaits ${v.carriedResource}` : `Carrying ${carriedAmt.toFixed(1)} ${v.carriedResource}`
    });
  }
  const foodLow = (homeRes.food ?? 0) < pop * 6;
  const needBuild = getNextBuildResourceNeed(world, homeId);
  const tasksToConsider = [
    "forage",
    "gather_stone",
    "chop",
    "farm",
    "pasture",
    "hunt",
    "fish",
    "quarry",
    "bake",
    "study",
    "smelt",
    "guard",
    "explore"
  ];
  for (const task of tasksToConsider) {
    const actionId = `task:${task}`;
    let score = 26 + p.industriousness * 22 + p.discipline * 8;
    if (task === "forage") {
      score += (foodLow ? 28 : 4) + (v.hunger < 26 ? 42 : 0) + getKnowledgeLevel(v, "foraging") * 0.12;
    } else if (task === "farm" || task === "pasture") {
      score += (foodLow ? 30 : 12) + (world.chiefFocus === "harvest" ? 14 : 0) + getKnowledgeLevel(v, "foraging") * 0.14;
    } else if (task === "fish") {
      score += (foodLow ? 22 : 8) + getKnowledgeLevel(v, "sailing") * 0.14;
    } else if (task === "hunt") {
      score += (foodLow ? 20 : 6) + p.bravery * 18 - p.caution * 10 + (world.chiefFocus === "harvest" ? 10 : 0);
    } else if (task === "chop") {
      score += (needBuild.needTimber ? 24 : 5) + getKnowledgeLevel(v, "woodcraft") * 0.12;
    } else if (task === "gather_stone" || task === "quarry") {
      score += (needBuild.needStone ? 24 : 5) + (world.chiefFocus === "craft" ? 12 : 0) + getKnowledgeLevel(v, "stonecraft") * 0.12;
    } else if (task === "study") {
      score += p.curiosity * 18 + (world.chiefFocus === "craft" ? 12 : 0) + getKnowledgeLevel(v, "social_customs") * 0.1;
    } else if (task === "bake") {
      score += 14 + p.empathy * 10 + getKnowledgeLevel(v, "cooking") * 0.14;
    } else if (task === "smelt") {
      score += 14 + p.industriousness * 10 + getKnowledgeLevel(v, "toolmaking") * 0.14;
    } else if (task === "guard") {
      score += p.bravery * 16 + (world.chiefFocus === "defense" ? 18 : 0);
    } else if (task === "explore") {
      const undisc = ISLAND_ORDER.some((id) => !world.islands[id]?.discovered);
      score += p.curiosity * 20 + (undisc ? 12 : 0) + (world.chiefFocus === "explore" ? 14 : 0);
    }
    if (v.suggestedTask === task) {
      const followBonus = 24 + p.discipline * 16 - p.stubbornness * 14 + (v.mood > 70 ? 6 : -6);
      score += Math.max(6, followBonus);
    }
    if (prevAction === actionId && v.hunger > 35 && v.warmth > 35 && v.energy > 22) {
      score += 11;
    }
    candidateSpecs.push({
      action: actionId,
      baseScore: Number(score.toFixed(1)),
      reason: v.suggestedTask === task ? `Suggested role (${TASK_BY_ID[task].label})` : foodLow && (task === "forage" || task === "farm" || task === "hunt" || task === "fish") ? "Village food stores low" : needBuild.needTimber && task === "chop" ? "Timber needed for next village structure" : needBuild.needStone && (task === "gather_stone" || task === "quarry") ? "Stone needed for next village structure" : `${TASK_BY_ID[task].verb}`
    });
  }
  const evaluated = [];
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
        reason: val.valid ? spec.reason : val.blockedReason ?? spec.reason
      },
      validation: val
    });
  }
  evaluated.sort((a, b) => {
    if (a.candidate.valid !== b.candidate.valid) return a.candidate.valid ? -1 : 1;
    return b.candidate.score - a.candidate.score;
  });
  const winner = evaluated.find((e) => e.candidate.valid);
  const topCandidates = evaluated.slice(0, 6).map((e) => e.candidate);
  if (!winner) {
    const fallbackReason = "Resting briefly while waiting for reachable island tasks.";
    const trace2 = {
      chosenAction: "idle_wait",
      chosenLabel: "Wait at Camp",
      reason: fallbackReason,
      goal: "Await reachable task",
      validated: true,
      evaluatedAtDay: world.environment.dayCount,
      evaluatedAtTime: t,
      candidates: topCandidates
    };
    return {
      trace: trace2,
      selectedAction: "idle_wait",
      activityState: "resting",
      task: v.activeTask,
      targetX: isl.centerX,
      targetY: isl.centerY,
      autonomyReason: fallbackReason
    };
  }
  const chosen = winner.validation;
  const chosenCand = winner.candidate;
  const finalReason = chosen.reason ?? chosenCand.reason;
  const trace = {
    chosenAction: chosenCand.action,
    chosenLabel: chosenCand.label,
    reason: `${chosenCand.reason} (score ${chosenCand.score})`,
    goal: chosenCand.label,
    validated: true,
    evaluatedAtDay: world.environment.dayCount,
    evaluatedAtTime: t,
    candidates: topCandidates
  };
  return {
    trace,
    selectedAction: chosenCand.action,
    activityState: chosen.activityState ?? "walking",
    task: chosen.task ?? v.activeTask,
    targetX: chosen.targetX ?? isl.centerX,
    targetY: chosen.targetY ?? isl.centerY,
    autonomyReason: finalReason,
    focusConcept: chosen.focusConcept,
    socialPeerId: chosen.socialPeerId
  };
}

// src/game/wildlife.ts
var ARCHIPELAGO_LANDMARKS2 = buildArchipelagoLandmarks();
function ensureWildAnimalState(h) {
  if (typeof h.hunger !== "number") h.hunger = 76;
  if (typeof h.thirst !== "number") h.thirst = 76;
  if (typeof h.energy !== "number") h.energy = 86;
  if (typeof h.reproCooldown !== "number") h.reproCooldown = 40;
  if (!h.behaviorState) h.behaviorState = "wandering";
  if (!h.stuckState) h.stuckState = { lastX: h.x, lastY: h.y, timer: 0, detourSign: 1 };
}
function findShallowWaterDrinkPoint(world, islandId, fromX, fromY) {
  const isl = ISLAND_DEFS[islandId];
  const candidates = [];
  if (isl.hasSpring && isl.springOffset) {
    const sx = isl.centerX + isl.springOffset.dx;
    const sy = isl.centerY + isl.springOffset.dy;
    const ringOffsets = [
      [18, 0],
      [-18, 0],
      [0, 18],
      [0, -18],
      [14, 14]
    ];
    for (const [ox, oy] of ringOffsets) {
      const px = sx + ox;
      const py = sy + oy;
      const t = classifyMainWorldTerrain(world, px, py);
      if (t !== "deep_water") {
        candidates.push({ x: px, y: py });
      }
    }
  }
  if (isl.rivers) {
    for (const r of isl.rivers) {
      for (const wp of r.points) {
        const px = isl.centerX + wp.dx + 14;
        const py = isl.centerY + wp.dy;
        const t = classifyMainWorldTerrain(world, px, py);
        if (t !== "deep_water" && isPointInsideIsland(isl, px, py, 24)) {
          candidates.push({ x: px, y: py });
        }
      }
    }
  }
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestDist = Math.hypot(best.x - fromX, best.y - fromY);
  for (let i = 1; i < candidates.length; i++) {
    const d = Math.hypot(candidates[i].x - fromX, candidates[i].y - fromY);
    if (d < bestDist) {
      best = candidates[i];
      bestDist = d;
    }
  }
  return best;
}
function stepWildAnimalBehavior(world, h, dt, steerFn) {
  ensureWildAnimalState(h);
  const isl = ISLAND_DEFS[h.islandId];
  h.hunger = Math.max(0, (h.hunger ?? 76) - dt * 0.45);
  h.thirst = Math.max(0, (h.thirst ?? 76) - dt * 0.55);
  if (h.reproCooldown && h.reproCooldown > 0) {
    h.reproCooldown = Math.max(0, h.reproCooldown - dt);
  }
  if (h.behaviorState === "resting") {
    h.energy = Math.min(100, (h.energy ?? 80) + dt * 5.2);
  } else {
    const drain = h.behaviorState === "fleeing" || h.behaviorState === "fighting" ? 1.4 : 0.42;
    h.energy = Math.max(0, (h.energy ?? 85) - dt * drain);
  }
  if (h.kind !== "boar") {
    const fleeRadius = h.kind === "rabbit" ? 78 : 96;
    const threat = world.villagers.find(
      (v) => v.islandId === h.islandId && Math.hypot(v.x - h.x, v.y - h.y) < fleeRadius && (v.activeTask === "hunt" || v.state === "hunting" || v.state === "fighting" || Math.hypot(v.x - h.x, v.y - h.y) < 38)
    ) ?? world.raiders.find((r) => r.islandId === h.islandId && Math.hypot(r.x - h.x, r.y - h.y) < fleeRadius);
    if (threat) {
      h.behaviorState = "fleeing";
      const dx = h.x - threat.x;
      const dy = h.y - threat.y;
      const d = Math.hypot(dx, dy) || 1;
      const fx = h.x + dx / d * 85;
      const fy = h.y + dy / d * 65;
      if (classifyMainWorldTerrain(world, fx, fy) !== "deep_water" && isPointInsideIsland(isl, fx, fy, 26)) {
        h.targetX = fx;
        h.targetY = fy;
      } else {
        h.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.45);
        h.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.45);
      }
      h.pauseTimer = 0;
    } else if (h.behaviorState === "fleeing" && Math.hypot(h.targetX - h.x, h.targetY - h.y) < 10) {
      h.behaviorState = "wandering";
    }
  }
  if (h.behaviorState !== "fleeing" && h.behaviorState !== "fighting") {
    if ((h.thirst ?? 76) < 42) {
      if (h.behaviorState !== "drinking") {
        const drinkSpot = findShallowWaterDrinkPoint(world, h.islandId, h.x, h.y);
        if (drinkSpot) {
          h.behaviorState = "drinking";
          h.targetX = drinkSpot.x;
          h.targetY = drinkSpot.y;
          h.pauseTimer = 0;
        }
      }
    } else if ((h.energy ?? 85) < 28) {
      h.behaviorState = "resting";
      h.pauseTimer = Math.max(h.pauseTimer, 3.5);
    } else if ((h.hunger ?? 76) < 46 && h.behaviorState !== "drinking") {
      if (h.behaviorState !== "grazing") {
        const bush = world.wildNodes.find(
          (n) => n.islandId === h.islandId && n.amount > 0.2 && n.kind === "berry_bush"
        );
        h.behaviorState = "grazing";
        if (bush) {
          h.targetX = bush.x + (Math.random() * 18 - 9);
          h.targetY = bush.y + (Math.random() * 18 - 9);
        } else {
          h.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.5);
          h.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.5);
        }
        h.pauseTimer = 0;
      }
    } else if (h.behaviorState === "drinking" && (h.thirst ?? 0) >= 92) {
      h.behaviorState = "wandering";
    } else if (h.behaviorState === "grazing" && (h.hunger ?? 0) >= 88) {
      h.behaviorState = "wandering";
    } else if (h.behaviorState === "resting" && (h.energy ?? 0) >= 84) {
      h.behaviorState = "wandering";
    }
  }
  const islandHerdCount = world.wildHerds.filter((o) => o.islandId === h.islandId && o.hp > 0).length;
  if ((h.reproCooldown ?? 40) <= 0 && (h.hunger ?? 0) >= 64 && (h.thirst ?? 0) >= 58 && h.hp >= h.maxHp * 0.8 && h.behaviorState !== "fleeing" && h.behaviorState !== "fighting" && islandHerdCount < 6 && world.wildHerds.length < 26) {
    const mate = world.wildHerds.find(
      (o) => o.id !== h.id && o.kind === h.kind && o.islandId === h.islandId && o.hp >= o.maxHp * 0.7 && (o.reproCooldown ?? 40) <= 0 && Math.hypot(o.x - h.x, o.y - h.y) < 75
    );
    if (mate) {
      h.reproCooldown = 95;
      mate.reproCooldown = 95;
      h.hunger = Math.max(35, (h.hunger ?? 70) - 18);
      mate.hunger = Math.max(35, (mate.hunger ?? 70) - 18);
      const childScale = Number(Math.max(0.58, (h.scale ?? 1) * 0.72).toFixed(2));
      const childHp = Math.max(8, Math.round(h.maxHp * 0.75));
      const rawCx = Math.round(h.x + (Math.random() * 14 - 7));
      const rawCy = Math.round(h.y + (Math.random() * 14 - 7));
      const spawnSafe = classifyMainWorldTerrain(world, rawCx, rawCy) !== "deep_water" && isPointInsideIsland(isl, rawCx, rawCy, 22);
      const bx = spawnSafe ? rawCx : Math.round(h.x);
      const by = spawnSafe ? rawCy : Math.round(h.y);
      world.wildHerds.push({
        id: `wild_baby_${h.kind}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: h.kind,
        islandId: h.islandId,
        x: bx,
        y: by,
        targetX: bx,
        targetY: by,
        facing: h.facing,
        pauseTimer: 2.5,
        hp: childHp,
        maxHp: childHp,
        aggroTargetId: null,
        color: h.color,
        scale: childScale,
        behaviorState: "wandering",
        hunger: 75,
        thirst: 75,
        energy: 90,
        reproCooldown: 110
      });
      emitWorldEvent(world, {
        category: "wildlife",
        significance: "minor",
        summary: `A young wild ${h.kind} was born on ${isl.name}.`,
        islandId: h.islandId
      });
    }
  }
  const dist = Math.hypot(h.targetX - h.x, h.targetY - h.y);
  if (h.behaviorState === "resting") {
    h.pauseTimer = Math.max(0, h.pauseTimer - dt);
    return;
  }
  if (dist < 8) {
    if (h.behaviorState === "drinking") {
      h.thirst = Math.min(100, (h.thirst ?? 40) + dt * 20);
      h.energy = Math.min(100, (h.energy ?? 75) + dt * 1.5);
      h.pauseTimer = 1.2;
      return;
    }
    if (h.behaviorState === "grazing") {
      h.hunger = Math.min(100, (h.hunger ?? 45) + dt * 16);
      h.pauseTimer = 1.2;
      return;
    }
    if (h.pauseTimer > 0) {
      h.pauseTimer -= dt;
      return;
    }
    h.pauseTimer = 1.6 + Math.random() * 3.2;
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.62);
      const ty = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.6);
      if (classifyMainWorldTerrain(world, tx, ty) !== "deep_water" && isPointInsideIsland(isl, tx, ty, 24)) {
        h.targetX = tx;
        h.targetY = ty;
        break;
      }
    }
    return;
  }
  const baseSpd = h.kind === "rabbit" ? 14 : h.kind === "deer" ? 18 : 13;
  const spd = h.behaviorState === "fleeing" ? baseSpd * 1.65 : baseSpd;
  const step = steerFn(world, h.islandId, h.x, h.y, h.targetX, h.targetY, spd * dt, h.stuckState, dt, h.id);
  if (classifyMainWorldTerrain(world, step.x, step.y) !== "deep_water") {
    h.x = step.x;
    h.y = step.y;
    h.facing = step.facing;
  }
  if (step.hitEdge || step.hitWaterEdge || step.wasStuckReset) {
    if (h.behaviorState === "drinking" && step.hitWaterEdge) {
      h.targetX = h.x;
      h.targetY = h.y;
      h.thirst = Math.min(100, (h.thirst ?? 40) + dt * 18);
      return;
    }
    h.pauseTimer = 0.6;
    h.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.45);
    h.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.45);
  }
}

// src/game/simulation.ts
var ARCHIPELAGO_LANDMARKS3 = buildArchipelagoLandmarks();
var PARTICLE_POOL_SIZE = 280;
function makeEmptyResources() {
  return {
    food: 0,
    berries: 0,
    grain: 0,
    meat: 0,
    fish: 0,
    timber: 0,
    stone: 0,
    copper: 0,
    bronze: 0,
    iron: 0,
    wool: 0,
    hides: 0,
    herbs: 0,
    hearthlight: 0
  };
}
function makeEmptyFlow() {
  return {
    foodIn: 0,
    foodOut: 0,
    timberIn: 0,
    timberOut: 0,
    stoneIn: 0,
    stoneOut: 0,
    oreIn: 0,
    oreOut: 0
  };
}
function createParticlePool() {
  return Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
    active: false,
    kind: "heart",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 2,
    alpha: 1,
    phase: 0,
    color: "#fff"
  }));
}
function spawnParticle(pool, opts) {
  if (!pool) return;
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) {
      pool[i].active = true;
      pool[i].kind = opts.kind;
      pool[i].x = opts.x;
      pool[i].y = opts.y;
      pool[i].vx = opts.vx;
      pool[i].vy = opts.vy;
      pool[i].life = opts.life ?? opts.maxLife;
      pool[i].maxLife = opts.maxLife;
      pool[i].size = opts.size;
      pool[i].alpha = opts.alpha;
      pool[i].phase = opts.phase;
      pool[i].color = opts.color;
      return;
    }
  }
}
function getTechUnlocked2(world, techId) {
  if (!techId) return true;
  return world.unlockedTechIds.includes(techId);
}
function hasBuildingType2(world, type, islandId) {
  return world.buildings.some(
    (b) => b.type === type && b.unlocked && (!islandId || b.islandId === islandId)
  );
}
function getIslandBonfire(world, islandId) {
  return world.buildings.find((b) => b.islandId === islandId && b.type === "bonfire" && b.unlocked) ?? null;
}
function getTotalFood(res) {
  return res.berries + res.grain + res.meat + res.fish;
}
function getVillageRes(world, islandId) {
  const id = islandId ?? world.localHomeIslandId ?? "cradle";
  if (!world.villageResources) {
    world.villageResources = {};
  }
  if (!world.villageResources[id]) {
    world.villageResources[id] = makeEmptyResources();
  }
  return world.villageResources[id];
}
function recordFlow(world, islandId, dir, key, amount) {
  if (amount <= 0) return;
  if (!world.resourceFlows) world.resourceFlows = {};
  const fl = world.resourceFlows[islandId] ??= makeEmptyFlow();
  if (key === "berries" || key === "grain" || key === "meat" || key === "fish" || key === "food") {
    if (dir === "in") fl.foodIn += amount;
    else fl.foodOut += amount;
  } else if (key === "timber") {
    if (dir === "in") fl.timberIn += amount;
    else fl.timberOut += amount;
  } else if (key === "stone") {
    if (dir === "in") fl.stoneIn += amount;
    else fl.stoneOut += amount;
  } else if (key === "copper" || key === "bronze" || key === "iron") {
    if (dir === "in") fl.oreIn += amount;
    else fl.oreOut += amount;
  }
}
function addVillageResource(world, islandId, key, amount) {
  if (amount <= 0) return;
  const res = getVillageRes(world, islandId);
  res[key] = Math.max(0, (res[key] ?? 0) + amount);
  res.food = Math.max(0, getTotalFood(res));
  recordFlow(world, islandId, "in", key, amount);
  if (islandId === (world.localHomeIslandId ?? "cradle")) {
    world.resources = { ...res };
  }
}
function syncCombinedFood(world) {
  if (world.villageResources) {
    for (const id of ISLAND_ORDER) {
      const r = world.villageResources[id];
      if (r) {
        r.food = Math.max(0, getTotalFood(r));
      }
    }
    const home = world.localHomeIslandId ?? "cradle";
    if (world.villageResources[home]) {
      world.resources = { ...world.villageResources[home] };
      return;
    }
  }
  world.resources.food = Math.max(0, getTotalFood(world.resources));
}
function consumeFoodUnits(world, islandId, baseAmount) {
  const res = getVillageRes(world, islandId);
  res.food = Math.max(0, getTotalFood(res));
  const ration = world.villagePolicies?.[islandId]?.rationMode ?? "normal";
  const mult = ration === "conserve" ? 0.72 : ration === "feast" ? 1.35 : 1;
  const amount = Number((baseAmount * mult).toFixed(2));
  if (res.food < amount) {
    return { ok: false, hungerGain: 0, moodBonus: 0 };
  }
  let rem = amount;
  const order = ["berries", "fish", "grain", "meat"];
  for (const key of order) {
    if (rem <= 0) break;
    const take = Math.min(res[key], rem);
    res[key] = Math.max(0, res[key] - take);
    rem -= take;
  }
  recordFlow(world, islandId, "out", "food", amount);
  res.food = Math.max(0, getTotalFood(res));
  if (islandId === (world.localHomeIslandId ?? "cradle")) {
    world.resources = { ...res };
  }
  return {
    ok: true,
    hungerGain: ration === "conserve" ? 25 : ration === "feast" ? 42 : 34,
    moodBonus: ration === "conserve" ? -2 : ration === "feast" ? 6 : 1
  };
}
function canControlIsland(world, islandId, actorPlayerId) {
  if (world.gameMode === "shared_siege") {
    return islandId === "cradle" || islandId === "sunterrace" || islandId === "timbercrown";
  }
  if (actorPlayerId) {
    return world.islandOwners?.[islandId] === actorPlayerId;
  }
  return islandId === (world.localHomeIslandId ?? "cradle");
}
function canControlVillager(world, v, actorPlayerId) {
  if (v.isNativeClan || v.isStranger) return false;
  if (world.gameMode === "shared_siege") return true;
  if (actorPlayerId) {
    return v.ownerPlayerId === actorPlayerId || world.islandOwners?.[v.homeIslandId] === actorPlayerId;
  }
  return v.homeIslandId === (world.localHomeIslandId ?? "cradle");
}
function getLineageGeneration(lineage, parentIds) {
  if (!parentIds) return 1;
  const g1 = lineage[parentIds[0]]?.generation ?? 1;
  const g2 = lineage[parentIds[1]]?.generation ?? 1;
  return Math.max(g1, g2) + 1;
}
function upsertLineage(world, v, deathCause) {
  if (!world.lineage) world.lineage = {};
  const existing = world.lineage[v.id];
  const mergedChildren = Array.from(
    /* @__PURE__ */ new Set([...existing?.childrenIds ?? [], ...v.childrenIds ?? []])
  );
  world.lineage[v.id] = {
    id: v.id,
    name: v.name,
    homeIslandId: v.homeIslandId ?? v.islandId,
    cultureId: v.cultureId,
    lifeStage: v.lifeStage,
    birthDay: existing?.birthDay ?? Math.max(1, world.environment.dayCount - v.ageDays),
    deathDay: deathCause ? world.environment.dayCount : existing?.deathDay ?? null,
    deathCause: deathCause ?? existing?.deathCause ?? null,
    parentIds: v.parentIds ?? existing?.parentIds ?? null,
    partnerId: v.partnerId ?? existing?.partnerId ?? null,
    childrenIds: mergedChildren,
    generation: existing?.generation ?? getLineageGeneration(world.lineage, v.parentIds),
    traits: [...v.traits ?? []],
    cloakColor: v.cloakColor
  };
}
function findBridgeStep(world, from, to) {
  return findBridgeStepNav(world, from, to);
}
function islandNormalizedDist2(island, wx, wy) {
  const dx = (wx - island.centerX) / Math.max(20, island.radiusX);
  const dy = (wy - island.centerY) / Math.max(20, island.radiusY);
  const ang = Math.atan2(dy, dx);
  const wobble = islandCoastWobble(island, ang);
  return Math.hypot(dx, dy) / Math.max(0.4, wobble);
}
function steerEntity(world, islandId, x, y, tx, ty, stepDist, ignoreSpring = false, stuckState, dt = 0.05, selfId) {
  return steerMainWorldEntity(
    world,
    islandId,
    x,
    y,
    tx,
    ty,
    stepDist,
    ignoreSpring,
    stuckState,
    dt,
    ARCHIPELAGO_LANDMARKS3,
    selfId
  );
}
function addChronicle(world, text, kind, meta) {
  world.chronicle.unshift({
    id: `chr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    day: world.environment.dayCount,
    text,
    kind
  });
  if (world.chronicle.length > 42) {
    world.chronicle.length = 42;
  }
  const mapped = mapChronicleKindToEventCategory(kind);
  emitWorldEvent(world, {
    category: mapped.category,
    significance: mapped.significance,
    summary: text,
    islandId: meta?.islandId ?? world.localHomeIslandId ?? "cradle",
    participantIds: meta?.participantIds ?? []
  });
}
function getTraitStats(v) {
  let workSpeed = 1;
  let moodDrift = 0;
  let energyDrain = 1;
  let obedience = 0.68;
  let rainSensitive = false;
  let nightLoving = false;
  let morningGrumpy = false;
  let curiosityMod = 0;
  let braveryMod = 0;
  let bleedChanceMult = 1;
  let damageTakenMult = 1;
  let attackPowerMult = 1;
  let hpMaxMod = 0;
  let healRateMult = 1;
  let teachRateMult = 1;
  let gatherYieldMult = 1;
  let moveSpeedMult = 1;
  let knowledgeMult = 1;
  for (const tid of v.traits) {
    const t = TRAITS[tid];
    if (!t) continue;
    workSpeed *= t.workSpeedMult;
    moodDrift += t.moodDrift;
    energyDrain *= t.energyDrainMult;
    obedience += t.obedienceMod;
    if (t.rainSensitive) rainSensitive = true;
    if (t.nightLoving) nightLoving = true;
    if (t.morningGrumpy) morningGrumpy = true;
    if (t.curiosityMod) curiosityMod += t.curiosityMod;
    if (t.braveryMod) braveryMod += t.braveryMod;
    if (t.bleedChanceMult) bleedChanceMult *= t.bleedChanceMult;
    if (t.damageTakenMult) damageTakenMult *= t.damageTakenMult;
    if (t.attackPowerMult) attackPowerMult *= t.attackPowerMult;
    if (t.hpMaxMod) hpMaxMod += t.hpMaxMod;
    if (t.healRateMult) healRateMult *= t.healRateMult;
    if (t.teachRateMult) teachRateMult *= t.teachRateMult;
    if (t.gatherYieldMult) gatherYieldMult *= t.gatherYieldMult;
    if (t.moveSpeedMult) moveSpeedMult *= t.moveSpeedMult;
    if (t.knowledgeMult) knowledgeMult *= t.knowledgeMult;
  }
  return {
    workSpeed,
    moodDrift,
    energyDrain,
    obedience: Math.max(0.2, Math.min(0.95, obedience)),
    rainSensitive,
    nightLoving,
    morningGrumpy,
    curiosityMod,
    braveryMod,
    bleedChanceMult,
    damageTakenMult,
    attackPowerMult,
    hpMaxMod,
    healRateMult,
    teachRateMult,
    gatherYieldMult,
    moveSpeedMult,
    knowledgeMult
  };
}
function getSkillLevel(v, skillId) {
  return Math.max(0, Math.min(10, v.skills?.[skillId] ?? 0));
}
function gainSkillXp(world, v, skillId, amount) {
  if (v.lifeStage === "infant") return;
  if (!v.skills) v.skills = {};
  if (!v.skillXp) v.skillXp = {};
  const currLv = getSkillLevel(v, skillId);
  if (currLv >= 10) return;
  const intMult = 1 + ((v.stats?.intellect ?? 8) - 8) * 0.04;
  const nextXp = (v.skillXp[skillId] ?? 0) + amount * Math.max(0.7, intMult);
  const needed = 18 * (currLv + 1);
  if (nextXp >= needed) {
    v.skillXp[skillId] = nextXp - needed;
    v.skills[skillId] = currLv + 1;
    v.thoughtBubble = `${SKILL_META[skillId].label} Lv.${currLv + 1}!`;
    v.thoughtTimer = 2.8;
    addChronicle(world, `${v.name.split(" ")[0]} reached ${SKILL_META[skillId].label} Lv.${currLv + 1}.`, "tech");
  } else {
    v.skillXp[skillId] = nextXp;
  }
}
function getHousingBedsForIsland(world, islandId) {
  const beds = world.buildings.filter((b) => b.unlocked && b.islandId === islandId && b.cultureId !== "ashen_raider").reduce(
    (sum, b) => sum + (b.housingCapacity > 0 ? b.housingCapacity + Math.max(0, b.level - 1) * 2 : 0),
    0
  );
  return Math.max(2, beds);
}
function resolveLandPoint(islandId, tx, ty, minCenterDist = 0) {
  const isl = ISLAND_DEFS[islandId];
  const isOk = (wx, wy) => {
    const nd = islandNormalizedDist2(isl, wx, wy);
    if (nd > 0.85) return false;
    if (Math.hypot(wx - isl.centerX, wy - isl.centerY) < minCenterDist) return false;
    if (classifyMainWorldTerrain({ bridges: [] }, wx, wy) !== "land") return false;
    if (riverDepthAtSim(isl, wx, wy).depth > 0.14) return false;
    if (pondDepthAtSim(isl, wx, wy).inPond) return false;
    if (terrainSlopeAtSim(wx, wy) > 0.45) return false;
    return true;
  };
  if (isOk(tx, ty)) return { x: Math.round(tx), y: Math.round(ty) };
  const baseAng = Math.atan2(ty - isl.centerY, tx - isl.centerX);
  const baseFrac = Math.min(
    0.72,
    Math.max(0.12, Math.hypot((tx - isl.centerX) / isl.radiusX, (ty - isl.centerY) / isl.radiusY))
  );
  for (let ring = 0; ring < 5; ring++) {
    const frac = Math.min(0.8, Math.max(0.08, baseFrac + (ring % 2 === 0 ? -0.1 : 0.1) * Math.ceil(ring / 2)));
    for (let step = 0; step < 20; step++) {
      const ang = baseAng + (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * 0.28;
      const wobble = islandCoastWobble(isl, ang);
      const cx = isl.centerX + Math.cos(ang) * isl.radiusX * frac * wobble;
      const cy = isl.centerY + Math.sin(ang) * isl.radiusY * frac * wobble;
      if (isOk(cx, cy)) return { x: Math.round(cx), y: Math.round(cy) };
    }
  }
  return { x: Math.round(isl.centerX), y: Math.round(isl.centerY) };
}
function buildInitialWildNodes(worldSeed) {
  const nodes = [];
  let idx = 0;
  const rng = mulberry32((Math.floor(Math.abs(worldSeed)) || DEFAULT_WORLD_SEED) ^ 2654435769);
  const isValidNodeSpot = (islandId, kind, wx, wy) => {
    const isl = ISLAND_DEFS[islandId];
    const nd = islandNormalizedDist2(isl, wx, wy);
    if (nd > (kind === "tree" ? 0.87 : 0.81)) return false;
    if (classifyMainWorldTerrain({ bridges: [] }, wx, wy) !== "land") return false;
    if (riverDepthAtSim(isl, wx, wy).depth > 0.12) return false;
    if (pondDepthAtSim(isl, wx, wy).depth > 0.12) return false;
    if (terrainSlopeAtSim(wx, wy) > 0.43) return false;
    const minCenterDist = kind === "tree" || kind === "stone_boulder" ? 92 : 72;
    if (Math.hypot(wx - isl.centerX, wy - isl.centerY) < minCenterDist) return false;
    if (isl.hasSpring && isl.springOffset) {
      const sx = isl.centerX + isl.springOffset.dx;
      const sy = isl.centerY + isl.springOffset.dy;
      if (Math.hypot(wx - sx, wy - sy) < 64) return false;
    }
    if (Math.hypot(wx - isl.dockSpot.x, wy - isl.dockSpot.y) < 88) return false;
    const minNodeSep = kind === "tree" || kind === "stone_boulder" ? 42 : 30;
    for (let i = 0; i < nodes.length; i++) {
      const other = nodes[i];
      if (other.islandId !== islandId) continue;
      const req = other.kind === "tree" || other.kind === "stone_boulder" ? Math.max(minNodeSep, 40) : minNodeSep;
      if (Math.hypot(wx - other.x, wy - other.y) < req) return false;
    }
    return true;
  };
  const spawnSeededNodes = (islandId, kind, count, radMin, radMax, amount, variants, scaleMin = 1, scaleMax = 1, groveCenters) => {
    const isl = ISLAND_DEFS[islandId];
    for (let i = 0; i < count; i++) {
      let chosenX = null;
      let chosenY = null;
      for (let attempt = 0; attempt < 42; attempt++) {
        let ang;
        let rad;
        if (groveCenters && groveCenters.length > 0 && attempt < 26) {
          const baseGrove = groveCenters[i % groveCenters.length];
          ang = baseGrove + (rng() - 0.5) * 0.92;
          rad = radMin + rng() * (radMax - radMin);
        } else {
          ang = rng() * Math.PI * 2;
          rad = radMin + rng() * (radMax - radMin);
        }
        const wob = islandCoastWobble(isl, ang);
        const cx = Math.round(isl.centerX + Math.cos(ang) * isl.radiusX * rad * wob);
        const cy = Math.round(isl.centerY + Math.sin(ang) * isl.radiusY * rad * wob);
        if (isValidNodeSpot(islandId, kind, cx, cy)) {
          chosenX = cx;
          chosenY = cy;
          break;
        }
      }
      if (chosenX === null || chosenY === null) continue;
      const variant = variants && variants.length > 0 ? variants[i % variants.length] : void 0;
      const sc = Number((scaleMin + rng() * (scaleMax - scaleMin)).toFixed(2));
      nodes.push({
        id: `node_${idx++}`,
        islandId,
        kind,
        x: chosenX,
        y: chosenY,
        amount,
        maxAmount: amount,
        variant,
        scale: sc
      });
    }
  };
  const makeGroves = (numGroves) => {
    const startAng = rng() * Math.PI * 2;
    const angles = [];
    for (let g = 0; g < numGroves; g++) {
      angles.push(startAng + g / numGroves * Math.PI * 2 + (rng() - 0.5) * 0.5);
    }
    return angles;
  };
  const cradleGroves = makeGroves(4);
  spawnSeededNodes("cradle", "berry_bush", 3, 0.24, 0.52, 18);
  spawnSeededNodes("cradle", "branch_pile", 2, 0.28, 0.58, 22);
  spawnSeededNodes("cradle", "flint_pile", 1, 0.3, 0.56, 18);
  spawnSeededNodes("cradle", "stone_boulder", 2, 0.32, 0.62, 33, void 0, 1.02, 1.18);
  spawnSeededNodes("cradle", "tree", 24, 0.36, 0.78, 48, ["oak", "pine", "cedar", "oak"], 1.75, 2.32, cradleGroves);
  const timberGroves = makeGroves(3);
  spawnSeededNodes("timbercrown", "berry_bush", 2, 0.25, 0.54, 17);
  spawnSeededNodes("timbercrown", "branch_pile", 2, 0.3, 0.6, 24);
  spawnSeededNodes("timbercrown", "flint_pile", 1, 0.32, 0.58, 20);
  spawnSeededNodes("timbercrown", "stone_boulder", 2, 0.34, 0.64, 36, void 0, 1.08, 1.25);
  spawnSeededNodes("timbercrown", "tree", 22, 0.34, 0.78, 62, ["cedar", "pine", "cedar"], 2.02, 2.72, timberGroves);
  const sunGroves = makeGroves(3);
  spawnSeededNodes("sunterrace", "berry_bush", 2, 0.28, 0.58, 22);
  spawnSeededNodes("sunterrace", "branch_pile", 1, 0.34, 0.62, 24);
  spawnSeededNodes("sunterrace", "flint_pile", 1, 0.32, 0.6, 18);
  spawnSeededNodes("sunterrace", "stone_boulder", 2, 0.34, 0.65, 33, void 0, 1, 1.15);
  spawnSeededNodes("sunterrace", "tree", 17, 0.38, 0.76, 48, ["orchard", "oak", "pine"], 1.78, 2.22, sunGroves);
  spawnSeededNodes("coppercrag", "copper_vein", 2, 0.26, 0.58, 72);
  spawnSeededNodes("coppercrag", "iron_vein", 2, 0.28, 0.6, 68);
  spawnSeededNodes("coppercrag", "stone_boulder", 2, 0.32, 0.62, 44, void 0, 1.15, 1.32);
  spawnSeededNodes("coppercrag", "flint_pile", 1, 0.32, 0.56, 28);
  spawnSeededNodes("coppercrag", "tree", 3, 0.42, 0.72, 38, ["pine"], 1.7, 1.88);
  spawnSeededNodes("mistatoll", "berry_bush", 1, 0.32, 0.62, 16);
  spawnSeededNodes("mistatoll", "flint_pile", 1, 0.34, 0.62, 22);
  spawnSeededNodes("mistatoll", "stone_boulder", 1, 0.34, 0.6, 28, void 0, 0.92, 1.05);
  spawnSeededNodes("mistatoll", "tree", 4, 0.38, 0.74, 40, ["oak", "pine"], 1.78, 1.95);
  const starGroves = makeGroves(3);
  spawnSeededNodes("starbloom", "berry_bush", 2, 0.26, 0.56, 22);
  spawnSeededNodes("starbloom", "branch_pile", 1, 0.32, 0.6, 26);
  spawnSeededNodes("starbloom", "stone_boulder", 1, 0.34, 0.62, 36, void 0, 1.08, 1.2);
  spawnSeededNodes("starbloom", "copper_vein", 1, 0.4, 0.68, 52);
  spawnSeededNodes("starbloom", "tree", 14, 0.36, 0.76, 52, ["oak", "orchard", "pine", "cedar"], 1.85, 2.34, starGroves);
  spawnSeededNodes("embervault", "iron_vein", 2, 0.26, 0.56, 85);
  spawnSeededNodes("embervault", "copper_vein", 1, 0.32, 0.62, 75);
  spawnSeededNodes("embervault", "stone_boulder", 2, 0.32, 0.64, 44, void 0, 1.12, 1.28);
  spawnSeededNodes("embervault", "tree", 3, 0.44, 0.74, 35, ["pine"], 1.58, 1.74);
  const frostGroves = makeGroves(2);
  spawnSeededNodes("frostpeak", "iron_vein", 2, 0.28, 0.56, 80);
  spawnSeededNodes("frostpeak", "stone_boulder", 2, 0.32, 0.62, 42, void 0, 1.12, 1.28);
  spawnSeededNodes("frostpeak", "branch_pile", 1, 0.34, 0.64, 26);
  spawnSeededNodes("frostpeak", "tree", 12, 0.38, 0.74, 54, ["cedar", "pine"], 2, 2.54, frostGroves);
  return nodes;
}
function buildInitialExploreRuins(worldSeed) {
  const rng = mulberry32((Math.floor(Math.abs(worldSeed)) || DEFAULT_WORLD_SEED) + 313);
  const place = (id, rFrac) => {
    const isl = ISLAND_DEFS[id];
    const ang = rng() * Math.PI * 2;
    const wob = islandCoastWobble(isl, ang);
    return resolveLandPoint(
      id,
      isl.centerX + Math.cos(ang) * isl.radiusX * rFrac * wob,
      isl.centerY + Math.sin(ang) * isl.radiusY * rFrac * wob,
      rFrac > 0.18 ? 110 : 0
    );
  };
  const sunPt = place("sunterrace", 0.32);
  const starPt = place("starbloom", 0.14);
  const timberPt = place("timbercrown", 0.36);
  const frostPt = place("frostpeak", 0.18);
  const emberPt = place("embervault", 0.14);
  return [
    {
      id: "ruin_sun_obelisk",
      name: "Sun-Terrace Solarium",
      islandId: "sunterrace",
      kind: "sun_obelisk",
      x: sunPt.x,
      y: sunPt.y,
      exploredCount: 0,
      cooldownTimer: 0,
      lootLabel: "+Wheat Seeds, Honey & Lore",
      guardianThreat: false
    },
    {
      id: "ruin_star_observatory",
      name: "Starbloom Observatory",
      islandId: "starbloom",
      kind: "star_observatory",
      x: starPt.x,
      y: starPt.y,
      exploredCount: 0,
      cooldownTimer: 0,
      lootLabel: "+Hearthlight Relics, Herbs & Lore",
      guardianThreat: false
    },
    {
      id: "ruin_cedar_totem",
      name: "Whispering Cedar Totem",
      islandId: "timbercrown",
      kind: "cedar_totem",
      x: timberPt.x,
      y: timberPt.y,
      exploredCount: 0,
      cooldownTimer: 0,
      lootLabel: "+Timber, Tea & Lore",
      guardianThreat: false
    },
    {
      id: "ruin_frost_shrine",
      name: "Frostpeak Star-Shrine",
      islandId: "frostpeak",
      kind: "frost_shrine",
      x: frostPt.x,
      y: frostPt.y,
      exploredCount: 0,
      cooldownTimer: 0,
      lootLabel: "+Iron, Hearthlight & Crystal Lore",
      guardianThreat: true
    },
    {
      id: "ruin_ashen_vault",
      name: "Ashen Iron Vault",
      islandId: "embervault",
      kind: "ashen_vault",
      x: emberPt.x,
      y: emberPt.y,
      exploredCount: 0,
      cooldownTimer: 0,
      lootLabel: "+Heavy Iron, Bronze & War Spoils",
      guardianThreat: true
    }
  ];
}
function buildInitialWildHerds(worldSeed) {
  const herds = [];
  const rng = mulberry32((Math.floor(Math.abs(worldSeed)) || DEFAULT_WORLD_SEED) + 521);
  const spawn = (id, kind, islandId, color) => {
    const isl = ISLAND_DEFS[islandId];
    const ang = rng() * Math.PI * 2;
    const rad = 0.24 + rng() * 0.42;
    const wob = islandCoastWobble(isl, ang);
    const pos = resolveLandPoint(
      islandId,
      isl.centerX + Math.cos(ang) * isl.radiusX * rad * wob,
      isl.centerY + Math.sin(ang) * isl.radiusY * rad * wob,
      70
    );
    const scale = kind === "boar" ? Number((0.95 + rng() * 0.37).toFixed(2)) : kind === "deer" ? Number((0.92 + rng() * 0.34).toFixed(2)) : Number((0.76 + rng() * 0.28).toFixed(2));
    const hp = Math.round((kind === "boar" ? 58 : kind === "deer" ? 32 : 14) * scale);
    herds.push({
      id,
      kind,
      islandId,
      x: pos.x,
      y: pos.y,
      targetX: pos.x + 35,
      targetY: pos.y,
      facing: 1,
      pauseTimer: rng() * 2,
      hp,
      maxHp: hp,
      aggroTargetId: null,
      color,
      scale
    });
  };
  spawn("wild_r1", "rabbit", "cradle", "#E5DDD0");
  spawn("wild_r2", "rabbit", "cradle", "#C8B094");
  spawn("wild_r4", "rabbit", "cradle", "#DDD2C2");
  spawn("wild_d1", "deer", "cradle", "#A67249");
  spawn("wild_d5", "deer", "cradle", "#9E683E");
  spawn("wild_d2", "deer", "timbercrown", "#9E683E");
  spawn("wild_d3", "deer", "timbercrown", "#A67249");
  spawn("wild_b1", "boar", "timbercrown", "#5E463A");
  spawn("wild_b2", "boar", "timbercrown", "#4D382E");
  spawn("wild_r3", "rabbit", "sunterrace", "#D4C7B8");
  spawn("wild_d4", "deer", "sunterrace", "#B07B52");
  spawn("wild_d6", "deer", "sunterrace", "#A67249");
  spawn("wild_b3", "boar", "coppercrag", "#56433B");
  spawn("wild_r5", "rabbit", "starbloom", "#EAE2D6");
  spawn("wild_d7", "deer", "starbloom", "#A67249");
  spawn("wild_d8", "deer", "frostpeak", "#D8DEE6");
  spawn("wild_b4", "boar", "frostpeak", "#5B5654");
  spawn("wild_b5", "boar", "embervault", "#3C2D28");
  return herds;
}
function canVillagerWork(world, v) {
  if (v.lifeStage === "infant" || v.lifeStage === "child") return false;
  if (world.gameMode === "sovereign_sandbox" || world.gameMode === "shared_siege") return true;
  return v.cognition.awareness >= 30 && v.cognition.observedConcepts.length >= 2 && v.cognition.socialCount >= 1;
}
function cognitiveStageFromAwareness(awareness) {
  if (awareness >= 96) return "enlightened";
  if (awareness >= 72) return "reasoning";
  if (awareness >= 30) return "experimenting";
  if (awareness >= 14) return "observing";
  return "awakening";
}
function makeFounder(id, name, cloakColor, hairColor, skinTone, hairStyle, traits, dx, dy) {
  const cradle = ISLAND_DEFS.cradle;
  const stats = rollUnitStats(traits, false);
  const skills = rollStarterSkills("adult", false);
  const hpMod = traits.reduce((sum, tid) => sum + (TRAITS[tid]?.hpMaxMod ?? 0), 0);
  const maxHp = Math.max(70, 100 + (stats.endurance - 8) * 4 + hpMod);
  return {
    id,
    name,
    bioDescription: buildBioFromTraits(traits, false),
    cultureId: "hearthfolk",
    islandId: "cradle",
    homeIslandId: "cradle",
    ownerPlayerId: null,
    visitStatus: "home",
    visitTargetIslandId: null,
    parleyPartnerId: null,
    cloakColor,
    hairColor,
    skinTone,
    hairStyle,
    lifeStage: "adult",
    ageDays: 14,
    isChief: false,
    traits,
    stats,
    skills,
    skillXp: {},
    rtsOrder: null,
    drafted: false,
    teachCooldown: 0,
    partnerId: null,
    parentIds: null,
    childrenIds: [],
    homeBuildingId: null,
    hp: maxHp,
    maxHp,
    warmth: 88,
    mood: 84,
    energy: 95,
    hunger: 88,
    affectionXp: 10,
    affectionLevel: 1,
    gearTier: 0,
    weaponType: "none",
    curiosity: traits.includes("curious_scout") ? 0.88 : 0.72,
    bravery: traits.includes("brave_hunter") ? 0.78 : 0.55,
    voyageBoatId: null,
    killCount: 0,
    cognition: {
      stage: "awakening",
      awareness: 0,
      observedConcepts: [],
      socialCount: 0,
      focusObject: "berry_bush"
    },
    favoriteComfort: pickFavoriteComfort(),
    activeWish: "explore",
    wishFulfilledToday: false,
    currentDialogue: "Everything is brand new\u2014soft grass, bright sky, loose stones. Let me look closer and talk with kin!",
    lastMemory: "Opened eyes bare-handed under an endless sky.",
    relationships: {},
    hangOutTargetId: null,
    socialCooldown: 12,
    pairChatCooldowns: {},
    suggestedTask: null,
    activeTask: "explore",
    state: "exploring",
    autonomyReason: "Exploring nearby stones, berries & kin before beginning village work.",
    thoughtBubble: "What is this world?",
    thoughtTimer: 5.5,
    x: cradle.centerX + dx,
    y: cradle.centerY + dy,
    targetX: cradle.centerX + dx * 4,
    targetY: cradle.centerY + dy * 4,
    facing: 1,
    animPhase: Math.random() * 6,
    bounceScale: 1,
    decisionCooldown: 2.2,
    birthCooldownDays: 0,
    attackCooldown: 0,
    edgeAckCooldown: 0,
    stuckState: { lastX: cradle.centerX + dx, lastY: cradle.centerY + dy, timer: 0, detourSign: 1 },
    personality: buildNpcPersonality(id, traits, traits.includes("curious_scout") ? 0.88 : 0.72, traits.includes("brave_hunter") ? 0.78 : 0.55, false),
    knowledge: createKnowledgeProfile("awakening"),
    memories: [
      {
        id: `mem_init_${id}`,
        day: 1,
        timeOfDay: 0.25,
        kind: "discovery",
        summary: "Opened eyes bare-handed under an endless sky.",
        actorIds: [],
        importance: 8,
        sentiment: "positive"
      }
    ],
    carriedResource: null,
    carriedAmount: 0,
    carryCapacity: 6,
    reputation: 15,
    banished: false
  };
}
function makeNativeClanVillager(id, name, islandId, cultureId, cloakColor, hairColor, skinTone, dx, dy, task) {
  const isl = ISLAND_DEFS[islandId];
  const isAshen = cultureId === "ashen_raider";
  const traits = cultureId === "sylvan" ? ["curious_scout", "swift_footed", "danger_sense"] : cultureId === "cragforge" ? ["clever_crafter", "hard_skin", "master_artisan"] : isAshen ? ["hard_skin", "brave_hunter"] : ["brave_hunter", "warmhearted"];
  const stats = rollUnitStats(traits, isAshen);
  const skills = rollStarterSkills("adult", isAshen);
  const maxHp = isAshen ? 105 : 115;
  const spawnPos = resolveLandPoint(islandId, isl.centerX + dx, isl.centerY + dy);
  return {
    id,
    name,
    bioDescription: `Born and raised among the ${CULTURES[cultureId].name} of ${isl.name}.`,
    cultureId,
    islandId,
    homeIslandId: islandId,
    ownerPlayerId: null,
    visitStatus: "home",
    visitTargetIslandId: null,
    parleyPartnerId: null,
    isNativeClan: true,
    cloakColor,
    hairColor,
    skinTone,
    hairStyle: Math.floor(Math.random() * 4),
    lifeStage: "adult",
    ageDays: 19,
    isChief: false,
    traits,
    stats,
    skills,
    skillXp: {},
    rtsOrder: null,
    drafted: false,
    teachCooldown: 0,
    partnerId: null,
    parentIds: null,
    childrenIds: [],
    homeBuildingId: null,
    hp: maxHp,
    maxHp,
    warmth: 92,
    mood: 82,
    energy: 92,
    hunger: 85,
    affectionXp: 15,
    affectionLevel: 1,
    gearTier: cultureId === "cragforge" ? 2 : 1,
    weaponType: cultureId === "sylvan" ? "bow" : cultureId === "cragforge" ? "bronze_blade" : "flint_spear",
    curiosity: 0.55,
    bravery: 0.72,
    voyageBoatId: null,
    killCount: 0,
    cognition: {
      stage: "reasoning",
      awareness: 78,
      observedConcepts: ["berry_bush", "branch_pile", "stone_boulder", "spring", "embers"],
      socialCount: 6,
      focusObject: null
    },
    favoriteComfort: pickFavoriteComfort(),
    activeWish: "chat",
    wishFulfilledToday: false,
    currentDialogue: `Welcome under the sky-clouds! Our ${CULTURES[cultureId].name} folk are building our hearth on ${isl.name}.`,
    lastMemory: `Tending local traditions on ${isl.name}.`,
    relationships: {},
    hangOutTargetId: null,
    socialCooldown: 24,
    pairChatCooldowns: {},
    suggestedTask: null,
    activeTask: task,
    state: "working",
    autonomyReason: `Gathering & building ${CULTURES[cultureId].name} life on ${isl.name}.`,
    thoughtBubble: null,
    thoughtTimer: 0,
    x: spawnPos.x,
    y: spawnPos.y,
    targetX: spawnPos.x,
    targetY: spawnPos.y,
    facing: 1,
    animPhase: Math.random() * 6,
    bounceScale: 1,
    decisionCooldown: 3 + Math.random() * 4,
    birthCooldownDays: 99,
    attackCooldown: 0,
    edgeAckCooldown: 0,
    stuckState: { lastX: spawnPos.x, lastY: spawnPos.y, timer: 0, detourSign: 1 },
    personality: buildNpcPersonality(id, traits, 0.55, 0.72, isAshen),
    knowledge: createKnowledgeProfile("native"),
    memories: [
      {
        id: `mem_init_${id}`,
        day: 1,
        timeOfDay: 0.25,
        kind: "social",
        summary: `Raised among the ${CULTURES[cultureId].name} on ${isl.name}.`,
        actorIds: [],
        importance: 6,
        sentiment: "neutral"
      }
    ],
    carriedResource: null,
    carriedAmount: 0,
    carryCapacity: 6,
    reputation: isAshen ? -15 : 22,
    banished: false
  };
}
function buildInitialVillageCultures() {
  return {
    cradle: {
      islandId: "cradle",
      cultureId: "hearthfolk",
      ethosTitle: "Awakening Nomads",
      motto: "Two bare hands discovering grass, flint, and shared embers.",
      traditionLevel: 0,
      ritualPoints: 0,
      nightlyGatherings: 0,
      customs: [],
      lastRitualDay: 0
    },
    timbercrown: {
      islandId: "timbercrown",
      cultureId: "sylvan",
      ethosTitle: "Cedarwood Sylvans",
      motto: "Tall cedars shelter every watchful bow and dawn hum.",
      traditionLevel: 2,
      ritualPoints: 45,
      nightlyGatherings: 4,
      customs: ["nightly_hearth_circle", "dawn_forage_song"],
      lastRitualDay: 0
    },
    sunterrace: {
      islandId: "sunterrace",
      cultureId: "hearthfolk",
      ethosTitle: "Untilled Golden Loam",
      motto: "Ancient stepped loam awaiting planters, orchards, and songs.",
      traditionLevel: 0,
      ritualPoints: 0,
      nightlyGatherings: 0,
      customs: [],
      lastRitualDay: 0
    },
    coppercrag: {
      islandId: "coppercrag",
      cultureId: "cragforge",
      ethosTitle: "Cragforge Smiths",
      motto: "Hammer cadences echo across caldera stone and glowing copper.",
      traditionLevel: 2,
      ritualPoints: 48,
      nightlyGatherings: 4,
      customs: ["nightly_hearth_circle", "forge_drum_rhythm"],
      lastRitualDay: 0
    },
    mistatoll: {
      islandId: "mistatoll",
      cultureId: "mist_mariner",
      ethosTitle: "Mist-Reef Mariners",
      motto: "Turquoise sea lanterns ward skiffs across the drifting reef.",
      traditionLevel: 2,
      ritualPoints: 50,
      nightlyGatherings: 5,
      customs: ["nightly_hearth_circle", "sea_lantern_vigil"],
      lastRitualDay: 0
    },
    starbloom: {
      islandId: "starbloom",
      cultureId: "hearthfolk",
      ethosTitle: "Unclaimed Star-Meadow",
      motto: "Sunken starlight ruins awaiting pilgrim hearths and herbalists.",
      traditionLevel: 0,
      ritualPoints: 0,
      nightlyGatherings: 0,
      customs: [],
      lastRitualDay: 0
    },
    embervault: {
      islandId: "embervault",
      cultureId: "ashen_raider",
      ethosTitle: "Ashen Bastion Warband",
      motto: "Volcanic iron vaults guarded behind obsidian palisades and fire.",
      traditionLevel: 2,
      ritualPoints: 60,
      nightlyGatherings: 5,
      customs: ["nightly_hearth_circle", "forge_drum_rhythm"],
      lastRitualDay: 0
    },
    frostpeak: {
      islandId: "frostpeak",
      cultureId: "cragforge",
      ethosTitle: "Frozen Alpine Watch",
      motto: "Glacier crystals sing high above the clouds beside ancient iron.",
      traditionLevel: 0,
      ritualPoints: 0,
      nightlyGatherings: 0,
      customs: [],
      lastRitualDay: 0
    }
  };
}
function buildNativeOutposts() {
  const mist = ISLAND_DEFS.mistatoll;
  const tc = ISLAND_DEFS.timbercrown;
  const cc = ISLAND_DEFS.coppercrag;
  const ev = ISLAND_DEFS.embervault;
  const buildings = [
    // Timbercrown Native Sylvan Village
    {
      id: "sylvan_bonfire",
      type: "bonfire",
      name: "Cedar Hearth Circle",
      islandId: "timbercrown",
      cultureId: "sylvan",
      description: "Moss-ringed highland bonfire where Cedarwood Sylvans gather each dusk.",
      level: 2,
      maxLevel: 3,
      x: tc.centerX - 18,
      y: tc.centerY + 14,
      unlocked: true,
      disrepair: 0,
      hp: 180,
      maxHp: 180,
      housingCapacity: 0,
      baseCost: { timber: 6, stone: 4 },
      benefitDescription: "Sylvan cultural hearth"
    },
    {
      id: "sylvan_cottage_1",
      type: "cottage",
      name: "Sylvan Canopy Hall",
      islandId: "timbercrown",
      cultureId: "sylvan",
      description: "Stilted cedarwood lodge overlooking the waterfall cliff.",
      level: 2,
      maxLevel: 4,
      x: tc.centerX + 86,
      y: tc.centerY - 54,
      unlocked: true,
      disrepair: 0,
      hp: 210,
      maxHp: 210,
      housingCapacity: 4,
      baseCost: { timber: 22, stone: 10 },
      benefitDescription: "Native Sylvan dwelling"
    },
    {
      id: "sylvan_woodshop",
      type: "woodshop",
      name: "Bowyer & Cedar Mill",
      islandId: "timbercrown",
      cultureId: "sylvan",
      description: "Open-rafter forestry workshop shaping yew bows and planks.",
      level: 1,
      maxLevel: 3,
      x: tc.centerX - 115,
      y: tc.centerY - 48,
      unlocked: true,
      disrepair: 0,
      hp: 170,
      maxHp: 170,
      housingCapacity: 0,
      baseCost: { timber: 20, stone: 8 },
      benefitDescription: "Sylvan timber workshop"
    },
    // Copper-Crag Native Cragforge Village
    {
      id: "crag_bonfire",
      type: "bonfire",
      name: "Caldera Ember Pit",
      islandId: "coppercrag",
      cultureId: "cragforge",
      description: "Basalt-walled hearth warming high-altitude smiths at dusk.",
      level: 2,
      maxLevel: 3,
      x: cc.centerX - 10,
      y: cc.centerY + 24,
      unlocked: true,
      disrepair: 0,
      hp: 200,
      maxHp: 200,
      housingCapacity: 0,
      baseCost: { timber: 6, stone: 4 },
      benefitDescription: "Cragforge cultural hearth"
    },
    {
      id: "crag_cottage",
      type: "cottage",
      name: "Basalt Mason Hall",
      islandId: "coppercrag",
      cultureId: "cragforge",
      description: "Thick stone bastion home braced against highland gales.",
      level: 2,
      maxLevel: 4,
      x: cc.centerX - 110,
      y: cc.centerY - 42,
      unlocked: true,
      disrepair: 0,
      hp: 250,
      maxHp: 250,
      housingCapacity: 4,
      baseCost: { timber: 18, stone: 20 },
      benefitDescription: "Cragforge smith dwelling"
    },
    {
      id: "crag_smeltery",
      type: "smeltery",
      name: "Cragforge Furnace",
      islandId: "coppercrag",
      cultureId: "cragforge",
      description: "Roaring clay-stone furnace casting copper and bronze.",
      level: 2,
      maxLevel: 3,
      x: cc.centerX + 98,
      y: cc.centerY - 18,
      unlocked: true,
      disrepair: 0,
      hp: 240,
      maxHp: 240,
      housingCapacity: 0,
      baseCost: { timber: 24, stone: 24 },
      benefitDescription: "Cragforge ore furnace"
    },
    // Mist Atoll Native Mist-Mariner Settlement
    {
      id: "mist_bonfire",
      type: "bonfire",
      name: "Mist-Clan Beacon",
      islandId: "mistatoll",
      cultureId: "mist_mariner",
      description: "Driftwood hearth burning turquoise sea-salt embers.",
      level: 2,
      maxLevel: 3,
      x: mist.centerX - 15,
      y: mist.centerY + 6,
      unlocked: true,
      disrepair: 0,
      hp: 180,
      maxHp: 180,
      housingCapacity: 0,
      baseCost: { timber: 6, stone: 4 },
      benefitDescription: "Mist Mariner cultural hearth"
    },
    {
      id: "mist_cottage",
      type: "cottage",
      name: "Reed Longhouse",
      islandId: "mistatoll",
      cultureId: "mist_mariner",
      description: "Stilted driftwood hall with woven reed eaves.",
      level: 2,
      maxLevel: 4,
      x: mist.centerX + 55,
      y: mist.centerY - 38,
      unlocked: true,
      disrepair: 0,
      hp: 220,
      maxHp: 220,
      housingCapacity: 4,
      baseCost: { timber: 22, stone: 12 },
      benefitDescription: "Mist Mariner dwelling"
    },
    {
      id: "mist_dock",
      type: "dock",
      name: "Mariner Reef Pier",
      islandId: "mistatoll",
      cultureId: "mist_mariner",
      description: "Crescent-prow naval jetty facing the central archipelago.",
      level: 2,
      maxLevel: 3,
      x: mist.dockSpot.x,
      y: mist.dockSpot.y,
      unlocked: true,
      disrepair: 0,
      hp: 200,
      maxHp: 200,
      housingCapacity: 0,
      baseCost: { timber: 24, stone: 10 },
      benefitDescription: "Mist Mariner fleet pier"
    },
    // Ashen Bastion Volcanic Fortress (Battle Island)
    {
      id: "ember_bonfire",
      type: "bonfire",
      name: "Obsidian War-Brazier",
      islandId: "embervault",
      cultureId: "ashen_raider",
      description: "Scorched iron brazier rallying the Ashen Bastion garrison.",
      level: 2,
      maxLevel: 3,
      x: ev.centerX - 65,
      y: ev.centerY + 35,
      unlocked: true,
      disrepair: 0,
      hp: 220,
      maxHp: 220,
      housingCapacity: 0,
      baseCost: { timber: 8, stone: 10 },
      benefitDescription: "Ashen Bastion war hearth"
    },
    {
      id: "ember_barracks",
      type: "barracks",
      name: "Ashen Iron Citadel",
      islandId: "embervault",
      cultureId: "ashen_raider",
      description: "Basalt keep guarding rich subterranean iron vaults.",
      level: 2,
      maxLevel: 3,
      x: ev.centerX + 105,
      y: ev.centerY + 45,
      unlocked: true,
      disrepair: 0,
      hp: 300,
      maxHp: 300,
      housingCapacity: 4,
      baseCost: { timber: 28, stone: 28 },
      benefitDescription: "Bastion garrison hall"
    },
    {
      id: "ember_watchtower",
      type: "watchtower",
      name: "Scorched Bastion Tower",
      islandId: "embervault",
      cultureId: "ashen_raider",
      description: "Volcanic stone tower firing warning bolts over the caldera rim.",
      level: 2,
      maxLevel: 3,
      x: ev.centerX - 115,
      y: ev.centerY - 75,
      unlocked: true,
      disrepair: 0,
      hp: 240,
      maxHp: 240,
      housingCapacity: 0,
      baseCost: { timber: 22, stone: 20 },
      benefitDescription: "Bastion defensive tower"
    }
  ];
  const boats = [
    {
      id: "boat_mist_1",
      name: "Sea-Mist Skiff",
      kind: "fishing_skiff",
      cultureId: "mist_mariner",
      homeIslandId: "mistatoll",
      targetIslandId: "mistatoll",
      x: mist.dockSpot.seaX - 24,
      y: mist.dockSpot.seaY - 35,
      targetX: mist.dockSpot.seaX - 45,
      targetY: mist.dockSpot.seaY + 55,
      yaw: 0,
      hp: 100,
      maxHp: 100,
      state: "fishing",
      cargoText: "Sea-Reef Nets",
      passengerIds: [],
      tripTimer: 16
    }
  ];
  const clanVillagers = [
    makeNativeClanVillager("syl_1", "Rowan Fern", "timbercrown", "sylvan", "#4F8459", "#5A3B28", "#E7BC9B", -42, 28, "chop"),
    makeNativeClanVillager("syl_2", "Linden Moss", "timbercrown", "sylvan", "#6B9962", "#8B5A34", "#F2D0B6", 54, -22, "hunt"),
    makeNativeClanVillager("syl_3", "Bramble Pine", "timbercrown", "sylvan", "#487654", "#3A281E", "#D7A37E", -88, -32, "forage"),
    makeNativeClanVillager("crag_1", "Durnan Flint", "coppercrag", "cragforge", "#9D5B36", "#2D2420", "#D9A582", -38, 12, "smelt"),
    makeNativeClanVillager("crag_2", "Sera Slate", "coppercrag", "cragforge", "#5B6A7A", "#7E3E2A", "#EBC3A4", 65, 22, "quarry"),
    makeNativeClanVillager("crag_3", "Torin Brass", "coppercrag", "cragforge", "#B86E3E", "#40342E", "#DFAD89", -75, -55, "guard"),
    makeNativeClanVillager("mist_1", "Kael Tide", "mistatoll", "mist_mariner", "#3D7E8A", "#24292E", "#D59C78", -25, 18, "fish"),
    makeNativeClanVillager("mist_2", "Nera Drift", "mistatoll", "mist_mariner", "#4C9BA6", "#563D2D", "#E8BEA0", 48, -14, "forage"),
    makeNativeClanVillager("mist_3", "Orin Reef", "mistatoll", "mist_mariner", "#376C78", "#332C28", "#C98F6A", -70, 52, "guard")
  ];
  const makeBastionGuard = (id, name, dx, dy) => ({
    ...makeNativeClanVillager(id, name, "embervault", "ashen_raider", "#7E2E28", "#251D1B", "#C68A66", dx, dy, "guard"),
    isNativeClan: false,
    isStranger: true,
    hp: 95,
    maxHp: 95,
    gearTier: 3,
    weaponType: "iron_blade",
    bravery: 0.92,
    state: "fighting",
    autonomyReason: "Guarding the Ashen Bastion iron vaults.",
    currentDialogue: "Only steel claims the vault below this cone!"
  });
  const raiders = [
    makeBastionGuard("ash_guard_1", "Cinder Vane", -45, -15),
    makeBastionGuard("ash_guard_2", "Krag Ashblade", 72, 24),
    makeBastionGuard("ash_guard_3", "Pyra Ember", -12, 85)
  ];
  const landCheck = (id, x, y) => resolveLandPoint(id, x, y);
  for (const b of buildings) {
    if (b.type === "dock") continue;
    const p = landCheck(b.islandId, b.x, b.y);
    b.x = p.x;
    b.y = p.y;
  }
  return { buildings, boats, clanVillagers, raiders };
}
function createInitialWorld(gameMode = "whisper_solo", seed) {
  const worldSeed = typeof seed === "number" && Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : Math.floor(1 + Math.random() * 2147483640) || DEFAULT_WORLD_SEED;
  applyArchipelagoSeed(worldSeed);
  const isSiege = gameMode === "shared_siege";
  const isSovereign = gameMode === "sovereign_sandbox";
  const adam = makeFounder(
    "founder_adam",
    "Adam Ash",
    "#8A6A4E",
    "#4A3525",
    "#E6BA9A",
    0,
    ["curious_scout", "clever_crafter", "hard_skin"],
    -18,
    12
  );
  const eve = makeFounder(
    "founder_eve",
    "Eve Briar",
    "#6B7B58",
    "#8B4A32",
    "#F4D5BD",
    2,
    ["green_thumb", "warmhearted", "calculated_mind"],
    18,
    -6
  );
  adam.relationships[eve.id] = 68;
  eve.relationships[adam.id] = 68;
  adam.partnerId = eve.id;
  eve.partnerId = adam.id;
  const initialVillagers = [adam, eve];
  if (isSiege) {
    adam.weaponType = "flint_spear";
    adam.gearTier = 1;
    adam.cognition = { stage: "reasoning", awareness: 65, observedConcepts: ["berry_bush", "stone_boulder", "embers"], socialCount: 2, focusObject: null };
    adam.knowledge = createKnowledgeProfile("veteran");
    eve.weaponType = "bow";
    eve.gearTier = 1;
    eve.cognition = { stage: "reasoning", awareness: 65, observedConcepts: ["berry_bush", "stone_boulder", "embers"], socialCount: 2, focusObject: null };
    eve.knowledge = createKnowledgeProfile("veteran");
    const bram = makeFounder(
      "founder_bram",
      "Bram Crag",
      "#5B7290",
      "#2E2622",
      "#D19A74",
      1,
      ["brave_hunter", "hard_skin", "pain_dampener"],
      -42,
      -26
    );
    bram.weaponType = "flint_spear";
    bram.gearTier = 1;
    bram.cognition = { stage: "reasoning", awareness: 65, observedConcepts: ["berry_bush", "stone_boulder", "embers"], socialCount: 2, focusObject: null };
    bram.knowledge = createKnowledgeProfile("veteran");
    const clara = makeFounder(
      "founder_clara",
      "Clara Finch",
      "#A65C52",
      "#7A5438",
      "#F4D5BD",
      3,
      ["master_artisan", "swift_recovery", "curious_scout"],
      42,
      24
    );
    clara.weaponType = "bow";
    clara.gearTier = 1;
    clara.cognition = { stage: "reasoning", awareness: 65, observedConcepts: ["berry_bush", "stone_boulder", "embers"], socialCount: 2, focusObject: null };
    clara.knowledge = createKnowledgeProfile("veteran");
    initialVillagers.push(bram, clara);
  }
  const outpost = buildNativeOutposts();
  const startingBuildings = isSovereign ? [...outpost.buildings] : isSiege ? [
    {
      id: "siege_bonfire",
      type: "bonfire",
      name: "Hearthglen Watch-Fire",
      islandId: "cradle",
      cultureId: "hearthfolk",
      description: "Central rallying bonfire for defenders against the multi-front siege.",
      level: 1,
      maxLevel: 3,
      x: ISLAND_DEFS.cradle.centerX,
      y: ISLAND_DEFS.cradle.centerY,
      unlocked: true,
      disrepair: 0,
      hp: 260,
      maxHp: 260,
      housingCapacity: 0,
      baseCost: { timber: 6, stone: 4 },
      benefitDescription: "Rally hearth & night warmth"
    }
  ] : [];
  const starterCradleRes = isSovereign ? {
    food: 42,
    berries: 22,
    grain: 20,
    meat: 0,
    fish: 0,
    timber: 55,
    stone: 45,
    copper: 12,
    bronze: 6,
    iron: 4,
    wool: 10,
    hides: 6,
    herbs: 8,
    hearthlight: 12
  } : isSiege ? {
    food: 14,
    berries: 14,
    grain: 0,
    meat: 0,
    fish: 0,
    timber: 22,
    stone: 18,
    copper: 0,
    bronze: 0,
    iron: 0,
    wool: 0,
    hides: 0,
    herbs: 4,
    hearthlight: 6
  } : {
    food: 4,
    berries: 4,
    grain: 0,
    meat: 0,
    fish: 0,
    timber: 0,
    stone: 0,
    copper: 0,
    bronze: 0,
    iron: 0,
    wool: 0,
    hides: 0,
    herbs: 0,
    hearthlight: 0
  };
  const villageResources = {
    cradle: { ...starterCradleRes },
    timbercrown: { ...makeEmptyResources(), food: 18, berries: 10, meat: 8, timber: 24, stone: 10 },
    sunterrace: { ...makeEmptyResources(), food: 10, grain: 6, berries: 4, timber: 10, stone: 6 },
    coppercrag: { ...makeEmptyResources(), food: 16, meat: 10, berries: 6, timber: 14, stone: 24, copper: 10 },
    mistatoll: { ...makeEmptyResources(), food: 20, fish: 16, berries: 4, timber: 16, stone: 8 },
    starbloom: { ...makeEmptyResources(), food: 8, berries: 8, timber: 8, stone: 6, herbs: 6 },
    embervault: { ...makeEmptyResources(), food: 18, meat: 18, timber: 12, stone: 20, iron: 16 },
    frostpeak: { ...makeEmptyResources(), food: 6, berries: 6, timber: 4, stone: 16, iron: 8 }
  };
  const villagePolicies = {
    cradle: { rationMode: "normal", borderPolicy: "parley" },
    timbercrown: { rationMode: "normal", borderPolicy: "parley" },
    sunterrace: { rationMode: "normal", borderPolicy: "open_trade" },
    coppercrag: { rationMode: "normal", borderPolicy: "parley" },
    mistatoll: { rationMode: "normal", borderPolicy: isSiege ? "closed" : "parley" },
    starbloom: { rationMode: "normal", borderPolicy: "open_trade" },
    embervault: { rationMode: "normal", borderPolicy: "closed" },
    frostpeak: { rationMode: "normal", borderPolicy: "open_trade" }
  };
  const resourceFlows = {
    cradle: makeEmptyFlow(),
    timbercrown: makeEmptyFlow(),
    sunterrace: makeEmptyFlow(),
    coppercrag: makeEmptyFlow(),
    mistatoll: makeEmptyFlow(),
    starbloom: makeEmptyFlow(),
    embervault: makeEmptyFlow(),
    frostpeak: makeEmptyFlow()
  };
  const islandOwners = {
    cradle: "player_solo",
    timbercrown: null,
    sunterrace: null,
    coppercrag: null,
    mistatoll: null,
    starbloom: null,
    embervault: null,
    frostpeak: null
  };
  const world = {
    version: CURRENT_WORLD_VERSION,
    worldSeed,
    gameMode,
    era: 1,
    localHomeIslandId: "cradle",
    islandOwners,
    resources: { ...starterCradleRes },
    villageResources,
    villagePolicies,
    resourceFlows,
    lineage: {},
    comforts: { bread: 0, tea: 0, honey: 0 },
    knowledgeXp: 0,
    unlockedTechIds: isSiege ? ["fire_making", "woven_shelter", "flint_spears", "archery_watch"] : [],
    activeTechId: isSiege ? "masonry_bakery" : "fire_making",
    islands: {
      cradle: { id: "cradle", discovered: true, owningCultureId: "hearthfolk", ownerPlayerId: "player_solo", dockBuilt: isSovereign, settledDay: 1 },
      timbercrown: { id: "timbercrown", discovered: false, owningCultureId: "sylvan", ownerPlayerId: null, dockBuilt: false, settledDay: 1 },
      sunterrace: { id: "sunterrace", discovered: false, owningCultureId: "hearthfolk", ownerPlayerId: null, dockBuilt: false, settledDay: null },
      coppercrag: { id: "coppercrag", discovered: false, owningCultureId: "cragforge", ownerPlayerId: null, dockBuilt: false, settledDay: 1 },
      mistatoll: { id: "mistatoll", discovered: false, owningCultureId: "mist_mariner", ownerPlayerId: null, dockBuilt: isSovereign, settledDay: 1 },
      starbloom: { id: "starbloom", discovered: false, owningCultureId: "hearthfolk", ownerPlayerId: null, dockBuilt: false, settledDay: null },
      embervault: { id: "embervault", discovered: false, owningCultureId: "ashen_raider", ownerPlayerId: null, dockBuilt: false, settledDay: 1 },
      frostpeak: { id: "frostpeak", discovered: false, owningCultureId: "cragforge", ownerPlayerId: null, dockBuilt: false, settledDay: null }
    },
    villageCultures: buildInitialVillageCultures(),
    bridges: INITIAL_SKY_BRIDGES.map((b) => ({ ...b })),
    cableways: INITIAL_SKY_CABLEWAYS.map((c) => ({ ...c })),
    gliders: [],
    exploreRuins: buildInitialExploreRuins(worldSeed),
    projectiles: [],
    wildNodes: buildInitialWildNodes(worldSeed),
    villagers: initialVillagers,
    clanVillagers: isSiege ? [] : [...outpost.clanVillagers],
    raiders: isSiege ? [] : [...outpost.raiders],
    buildings: startingBuildings,
    placedSuggestions: [],
    livestock: [],
    wildHerds: buildInitialWildHerds(worldSeed),
    boats: isSovereign ? [...outpost.boats] : [],
    memorials: [],
    diplomacy: {
      hearthfolk: { cultureId: "hearthfolk", trust: 100, status: "peaceful", grievances: [], lastEnvoyDay: 1, raidTimer: 0 },
      sylvan: { cultureId: "sylvan", trust: 74, status: "peaceful", grievances: [], lastEnvoyDay: 1, raidTimer: 0 },
      cragforge: { cultureId: "cragforge", trust: 68, status: "peaceful", grievances: [], lastEnvoyDay: 1, raidTimer: 0 },
      mist_mariner: {
        cultureId: "mist_mariner",
        trust: isSiege ? 12 : 38,
        status: isSiege ? "war" : "wary",
        grievances: ["Wary of uncharted sails near their misty reef"],
        lastEnvoyDay: 0,
        raidTimer: 45
      },
      ashen_raider: {
        cultureId: "ashen_raider",
        trust: 0,
        status: "war",
        grievances: ["Defends volcanic iron vaults against all outsiders"],
        lastEnvoyDay: 0,
        raidTimer: 75
      }
    },
    pendingArrivals: [],
    chronicle: [
      {
        id: "chr_init_1",
        day: 1,
        text: isSovereign ? "Sovereign Sandbox opened over 8 floating islands\u2014you command Hearthglen while rival islands govern themselves autonomously." : isSiege ? "Shared Siege Defense begun! Rally defenders together across Cradle Isle against multi-front raiders from sea, gliders & bridges." : "Adam and Eve awakened with empty hands and no buildings on Cradle Isle\u2014securing fire, food, and shelter before raising their village.",
        kind: "era"
      }
    ],
    eventLog: [
      {
        id: "ev_init_1",
        day: 1,
        timeOfDay: 0.36,
        category: "migration",
        significance: "notable",
        summary: isSovereign ? "Sovereign Sandbox opened over 8 floating islands." : isSiege ? "Defenders rallied on Cradle Isle against the coming siege." : "Adam and Eve awakened with empty hands on Cradle Isle.",
        islandId: "cradle",
        participantIds: initialVillagers.map((v) => v.id)
      }
    ],
    communityRules: [],
    incidents: [],
    disputes: [],
    completedAspirations: [],
    chiefId: null,
    chiefFocus: isSiege ? "defense" : "balanced",
    siege: isSiege ? {
      wave: 0,
      nextWaveTimer: 32,
      activeFronts: [],
      totalKills: 0,
      warningText: "War horns echo across 3 horizons \u2014 gather stone & brace defenses!",
      lastWaveDay: 1
    } : {
      wave: 0,
      nextWaveTimer: 0,
      activeFronts: [],
      totalKills: 0,
      warningText: null,
      lastWaveDay: 1
    },
    environment: {
      timeOfDay: 0.36,
      timeMode: "cycle",
      cycleSpeedSeconds: 180,
      weather: "clear",
      weatherMode: "dynamic",
      weatherTimer: 85,
      season: "spring",
      seasonDay: 1,
      dayCount: 1,
      festivalActive: false
    },
    settings: {
      fpsCap: 60,
      simSpeed: 1,
      muted: true,
      volume: 0.45,
      autoProgress: true
    },
    lastTickTimestamp: Date.now(),
    nextTravelerTimer: 300,
    activeConstruction: null,
    suggestedBuildingId: null,
    autoBuildTimer: 4,
    autoWelcomeTimer: 18,
    prosperityScore: 55,
    villageTrajectory: "steady",
    trajectoryReasons: ["Founders exploring natural berries, loose stones & social ties before building."],
    ruinDaysCount: 0,
    departedCount: 0,
    deathCount: 0,
    catX: ISLAND_DEFS.cradle.centerX - 42,
    catY: ISLAND_DEFS.cradle.centerY + 34,
    catTargetX: ISLAND_DEFS.cradle.centerX + 46,
    catTargetY: ISLAND_DEFS.cradle.centerY + 42,
    catFacing: 1,
    catPauseTimer: 2
  };
  for (const v of [...world.villagers, ...world.clanVillagers]) {
    upsertLineage(world, v);
  }
  ensureSocialRecord(world, adam, eve);
  ensureSocialRecord(world, eve, adam);
  syncCombinedFood(world);
  for (const v of world.villagers) {
    v.decisionTrace = evaluateVillagerDecision(world, v).trace;
  }
  return world;
}
function assignPlayerVillageInWorld(world, playerId, preferredIslandId) {
  if (world.gameMode === "shared_siege") {
    if (!world.islandOwners) world.islandOwners = {};
    if (!world.islandOwners.cradle) world.islandOwners.cradle = playerId;
    world.islands.cradle.discovered = true;
    return "cradle";
  }
  let assigned = preferredIslandId ?? null;
  if (!assigned) {
    for (const id of PLAYER_VILLAGE_ISLANDS) {
      if (world.islandOwners[id] === playerId) {
        assigned = id;
        break;
      }
    }
  }
  if (!assigned) {
    for (const id of PLAYER_VILLAGE_ISLANDS) {
      const owner = world.islandOwners[id];
      if (!owner || owner === "player_solo") {
        assigned = id;
        break;
      }
    }
  }
  if (!assigned) assigned = "cradle";
  world.islandOwners[assigned] = playerId;
  world.islands[assigned].ownerPlayerId = playerId;
  world.islands[assigned].discovered = true;
  world.islands[assigned].settledDay ??= world.environment.dayCount;
  let existingLocals = world.villagers.filter((v) => v.homeIslandId === assigned);
  if (existingLocals.length === 0) {
    const promoted = [];
    for (let i = world.clanVillagers.length - 1; i >= 0; i--) {
      if (world.clanVillagers[i].homeIslandId === assigned) {
        const cv = world.clanVillagers.splice(i, 1)[0];
        cv.isNativeClan = false;
        cv.ownerPlayerId = playerId;
        cv.cognition.awareness = Math.max(cv.cognition.awareness, 45);
        cv.cognition.stage = cognitiveStageFromAwareness(cv.cognition.awareness);
        promoted.push(cv);
      }
    }
    if (promoted.length > 0) {
      world.villagers.push(...promoted);
      existingLocals = promoted;
    }
  } else {
    for (const v of existingLocals) {
      v.ownerPlayerId = playerId;
    }
  }
  if (existingLocals.length === 0) {
    const isl = ISLAND_DEFS[assigned];
    const names = new Set(world.villagers.map((u) => u.name));
    const c1 = generateCandidate("traveler", world.environment.dayCount, names);
    names.add(c1.name);
    const c2 = generateCandidate("traveler", world.environment.dayCount, names);
    const f1 = makeFounder(`vil_mp_${assigned}_1_${Date.now()}`, c1.name, c1.cloakColor, c1.hairColor, c1.skinTone, c1.hairStyle, c1.traits, -20, 10);
    const f2 = makeFounder(`vil_mp_${assigned}_2_${Date.now()}`, c2.name, c2.cloakColor, c2.hairColor, c2.skinTone, c2.hairStyle, c2.traits, 20, -8);
    for (const f of [f1, f2]) {
      f.islandId = assigned;
      f.homeIslandId = assigned;
      f.ownerPlayerId = playerId;
      f.cultureId = world.islands[assigned].owningCultureId;
      f.x = isl.centerX + (f === f1 ? -22 : 22);
      f.y = isl.centerY + (f === f1 ? 10 : -8);
      f.targetX = isl.centerX;
      f.targetY = isl.centerY;
      f.cognition = { stage: "experimenting", awareness: 38, observedConcepts: ["berry_bush", "stone_boulder"], socialCount: 2, focusObject: null };
      f.stuckState = { lastX: f.x, lastY: f.y, timer: 0, detourSign: 1 };
    }
    f1.partnerId = f2.id;
    f2.partnerId = f1.id;
    f1.relationships[f2.id] = 66;
    f2.relationships[f1.id] = 66;
    world.villagers.push(f1, f2);
    existingLocals = [f1, f2];
    const res = getVillageRes(world, assigned);
    if (res.food < 12) res.berries += 12 - res.food;
    if (res.timber < 18) res.timber = 18;
    if (res.stone < 12) res.stone = 12;
  }
  for (const v of existingLocals) {
    upsertLineage(world, v);
  }
  syncCombinedFood(world);
  addChronicle(world, `A new sky-deity claimed ${ISLAND_DEFS[assigned].name} (${existingLocals.length} villagers).`, "era");
  return assigned;
}
function getTaskAvailable(world, task, islandId) {
  const meta = TASK_BY_ID[task];
  if (!meta) return false;
  if (task === "gather_stone" || task === "forage" || task === "chop") return true;
  if (meta.requiredTechId && !getTechUnlocked2(world, meta.requiredTechId)) return false;
  if (task === "farm" && !hasBuildingType2(world, "farm_plot", islandId)) return false;
  if (task === "pasture" && !hasBuildingType2(world, "pasture", islandId)) return false;
  if (task === "quarry" && !hasBuildingType2(world, "quarry", islandId)) return false;
  if (task === "fish" && !hasBuildingType2(world, "dock", islandId)) {
    return false;
  }
  if (task === "bake" && !hasBuildingType2(world, "bakery", islandId)) return false;
  if (task === "study" && !hasBuildingType2(world, "library", islandId)) return false;
  if (task === "smelt" && !hasBuildingType2(world, "smeltery", islandId)) return false;
  if (task === "guard" && !hasBuildingType2(world, "watchtower", islandId) && !hasBuildingType2(world, "barracks", islandId)) return false;
  return true;
}
function getBuildCost(bp) {
  return bp.baseCost;
}
function hasResourcesFor(res, cost) {
  for (const [k, v] of Object.entries(cost)) {
    if (typeof v === "number" && (res[k] ?? 0) < v) {
      return false;
    }
  }
  return true;
}
function spendVillageResources(world, islandId, cost) {
  const res = getVillageRes(world, islandId);
  for (const [k, v] of Object.entries(cost)) {
    if (typeof v === "number" && v > 0) {
      const key = k;
      const actual = Math.min(res[key] ?? 0, v);
      res[key] = Math.max(0, (res[key] ?? 0) - v);
      recordFlow(world, islandId, "out", key, actual);
    }
  }
  syncCombinedFood(world);
}
function findValidSiteOnIsland(world, islandId) {
  const isl = ISLAND_DEFS[islandId];
  for (let attempt = 0; attempt < 64; attempt++) {
    const ang = attempt * 2.39996 % (Math.PI * 2);
    const rFactor = 0.14 + attempt % 8 / 8 * 0.64;
    const x = Math.round(isl.centerX + Math.cos(ang) * (isl.radiusX - 90) * rFactor);
    const y = Math.round(isl.centerY + Math.sin(ang) * (isl.radiusY - 80) * rFactor);
    if (!isPointInsideIsland(isl, x, y, 48)) continue;
    if (world.buildings.some((b) => Math.hypot(b.x - x, b.y - y) < 82)) continue;
    if (world.wildNodes.some(
      (n) => n.islandId === islandId && Math.hypot(n.x - x, n.y - y) < (n.kind === "tree" ? (n.scale ?? 1) * 18 + 26 : 42)
    )) {
      continue;
    }
    if (isl.hasSpring && isl.springOffset) {
      const sx = isl.centerX + isl.springOffset.dx;
      const sy = isl.centerY + isl.springOffset.dy;
      if (Math.hypot(x - sx, y - sy) < 58) continue;
    }
    if (world.exploreRuins.some((r) => r.islandId === islandId && Math.hypot(r.x - x, r.y - y) < 68)) continue;
    if (ARCHIPELAGO_LANDMARKS3.some(
      (lm) => lm.islandId === islandId && lm.kind !== "reed_clump" && Math.hypot(lm.x - x, lm.y - y) < lm.scale * 22 + 24
    )) {
      continue;
    }
    if (world.bridges.some(
      (br) => br.fromIsland === islandId && Math.hypot(br.x1 - x, br.y1 - y) < 58 || br.toIsland === islandId && Math.hypot(br.x2 - x, br.y2 - y) < 58
    )) {
      continue;
    }
    return { x, y };
  }
  return { x: isl.centerX + 55, y: isl.centerY + 42 };
}
function pickBuildingCulture(islandId, world) {
  return world.islands[islandId]?.owningCultureId ?? ISLAND_DEFS[islandId].defaultCultureId;
}
function createBuildingInstance(world, type, islandId, x, y, cropType = "turnip", livestockKind = "sheep") {
  const bp = BUILDING_BLUEPRINTS[type];
  const cultureId = pickBuildingCulture(islandId, world);
  const isl = ISLAND_DEFS[islandId];
  const nearWater = isl.hasSpring && isl.springOffset ? Math.hypot(x - (isl.centerX + isl.springOffset.dx), y - (isl.centerY + isl.springOffset.dy)) < 120 : false;
  const b = {
    id: `bld_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    name: type === "farm_plot" ? `${CROP_META[cropType].label} Field` : type === "pasture" ? `${LIVESTOCK_META[livestockKind].label} Pen` : bp.name,
    islandId,
    cultureId,
    description: bp.description,
    level: 0,
    maxLevel: bp.maxLevel,
    x,
    y,
    unlocked: false,
    disrepair: 0,
    hp: 160,
    maxHp: 160,
    housingCapacity: bp.housingCapacity,
    baseCost: bp.baseCost,
    benefitDescription: bp.benefitDescription,
    cropState: type === "farm_plot" ? { cropType, growth: 0.08, fertility: isl.soilQuality, irrigated: nearWater || isl.hasWaterfall } : void 0,
    livestockKind: type === "pasture" ? livestockKind : void 0
  };
  initStagedBuildingMaterials(b, bp.baseCost);
  return b;
}
function spawnPastureLivestock(world, pasture) {
  const kind = pasture.livestockKind ?? "sheep";
  const count = kind === "fowl" ? 4 : 3;
  const baseColor = LIVESTOCK_META[kind].color;
  for (let i = 0; i < count; i++) {
    const scale = Number((0.86 + Math.random() * 0.32).toFixed(2));
    world.livestock.push({
      id: `stk_${pasture.id}_${i}`,
      kind,
      islandId: pasture.islandId,
      pastureId: pasture.id,
      x: pasture.x + (Math.random() * 24 - 12),
      y: pasture.y + (Math.random() * 16 - 8),
      targetX: pasture.x + (Math.random() * 22 - 11),
      targetY: pasture.y + (Math.random() * 14 - 7),
      facing: Math.random() < 0.5 ? 1 : -1,
      pauseTimer: Math.random() * 3,
      yieldTimer: 18 + Math.random() * 12,
      color: baseColor,
      scale
    });
  }
}
function spawnDockBoat(world, dock, kind) {
  const isl = ISLAND_DEFS[dock.islandId];
  const cultureId = dock.cultureId;
  const labelMap = {
    fishing_skiff: "Coastal Skiff",
    cargo_merchant: "Archipelago Merchant",
    war_galley: "Shielded Galley",
    migrant_skiff: "Migrant Skiff"
  };
  const maxHp = kind === "war_galley" ? 240 : kind === "cargo_merchant" ? 160 : 100;
  world.boats.push({
    id: `boat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: `${CULTURES[cultureId].name.split(" ")[0]} ${labelMap[kind]}`,
    kind,
    cultureId,
    homeIslandId: dock.islandId,
    targetIslandId: dock.islandId,
    x: isl.dockSpot.seaX,
    y: isl.dockSpot.seaY,
    targetX: isl.dockSpot.seaX + (Math.random() * 90 - 45),
    targetY: isl.dockSpot.seaY + (Math.random() * 80 - 40),
    yaw: 0,
    hp: maxHp,
    maxHp,
    state: kind === "fishing_skiff" ? "fishing" : "docked",
    cargoText: kind === "fishing_skiff" ? "Nets & Catch" : kind === "cargo_merchant" ? "Timber & Grain" : "Patrol Crew",
    passengerIds: [],
    tripTimer: 8 + Math.random() * 8
  });
}
function discoverIsland(world, islandId, explorerName) {
  const islState = world.islands[islandId];
  if (!islState || islState.discovered) return;
  islState.discovered = true;
  const def = ISLAND_DEFS[islandId];
  if (islandId === "mistatoll") {
    const dip = world.diplomacy.mist_mariner;
    if (dip.status === "unknown") {
      dip.status = "wary";
      dip.trust = 38;
    }
    addChronicle(
      world,
      `${explorerName ?? "Scouts"} pierced the eastern mist and sighted ${def.name}\u2014home to the wary Mist Mariners!`,
      "voyage"
    );
  } else {
    addChronicle(
      world,
      `${explorerName ?? "Explorers"} charted ${def.name}! (${def.subtitle})`,
      "voyage"
    );
  }
}
function killVillager(world, villagerId, cause, particles) {
  const idx = world.villagers.findIndex((v2) => v2.id === villagerId);
  if (idx === -1) return;
  const v = world.villagers[idx];
  upsertLineage(world, v, cause);
  world.villagers.splice(idx, 1);
  world.deathCount += 1;
  const epitaphs = {
    starvation: "Fell to hunger when winter stores ran bare.",
    freezing: "Taken by bitter frost without dry wool or hearth.",
    boar: "Charged by a fierce wild boar in the highland brush.",
    shipwreck: "Lost to stormy sky-sea squalls far from shore.",
    combat: "Fell defending the archipelago against raiders.",
    old_age: "Passed peacefully after many seasons by the fire."
  };
  world.memorials.push({
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    villagerName: v.name,
    islandId: v.islandId,
    x: v.x,
    y: v.y,
    dayDied: world.environment.dayCount,
    cause,
    epitaph: epitaphs[cause]
  });
  if (world.chiefId === v.id) {
    world.chiefId = null;
  }
  if (world.activeConstruction?.builderId === v.id) {
    world.activeConstruction = null;
  }
  for (const rem of world.villagers) {
    if (rem.partnerId === v.id) rem.partnerId = null;
    if (rem.hangOutTargetId === v.id) rem.hangOutTargetId = null;
    if (rem.childrenIds.includes(v.id)) {
      rem.childrenIds = rem.childrenIds.filter((cid) => cid !== v.id);
    }
    const wasKin = v.partnerId === rem.id || (rem.relationships[v.id] ?? 0) >= 55;
    rem.mood = Math.max(5, rem.mood - (wasKin ? 22 : 10));
    if (wasKin) {
      rem.thoughtBubble = `Farewell, ${v.name.split(" ")[0]}...`;
      rem.thoughtTimer = 4.2;
      rem.lastMemory = `Mourned the loss of ${v.name.split(" ")[0]}.`;
    }
  }
  addChronicle(world, `${v.name} died (${cause.replace("_", " ")}) on ${ISLAND_DEFS[v.islandId].name}.`, "death");
  for (let i = 0; i < 6; i++) {
    spawnParticle(particles, {
      kind: cause === "boar" || cause === "combat" ? "blood" : "smoke",
      x: v.x + (Math.random() * 12 - 6),
      y: v.y - 6,
      vx: (Math.random() - 0.5) * 8,
      vy: -10 - Math.random() * 8,
      maxLife: 1.4,
      size: 2.2,
      alpha: 0.85,
      phase: 0,
      color: cause === "boar" || cause === "combat" ? "#D9534F" : "#CBD5E1"
    });
  }
  if (world.villagers.length === 0) {
    world.villageTrajectory = "ruined";
    world.prosperityScore = 0;
    addChronicle(world, "Every inhabitant perished. Only silent stone cairns remain above the clouds.", "ruin");
  }
}
function grantKnowledge(world, amount, particles, sourceUnit) {
  if (world.villagers.length === 0) return;
  const techMods = getTechModifiers(world.unlockedTechIds);
  const libs = world.buildings.filter((b) => b.type === "library" && b.unlocked);
  const libBonus = 1 + libs.reduce((acc, b) => acc + b.level * 0.65, 0);
  const bonfires = world.buildings.filter((b) => b.type === "bonfire" && b.unlocked);
  const fireBonus = bonfires.length > 0 ? 1.25 : 1;
  const enlightenedBoost = world.villagers.some((v) => v.cognition.stage === "enlightened") ? 1.3 : 1;
  const traitMult = sourceUnit ? getTraitStats(sourceUnit).knowledgeMult : 1;
  world.knowledgeXp += amount * libBonus * fireBonus * enlightenedBoost * techMods.knowledgeMult * traitMult;
  const frontier = getAvailableFrontierTechs(world.unlockedTechIds);
  if (frontier.length === 0) {
    world.activeTechId = null;
    return;
  }
  if (!world.activeTechId || !frontier.some((f) => f.id === world.activeTechId)) {
    world.activeTechId = frontier[0].id;
  }
  const activeNode = TECH_BY_ID[world.activeTechId];
  if (activeNode && world.knowledgeXp >= activeNode.costXp) {
    world.knowledgeXp -= activeNode.costXp;
    world.unlockedTechIds.push(activeNode.id);
    addChronicle(
      world,
      `Cultural Discovery: ${activeNode.name} \u2014 ${activeNode.effectSummary ?? activeNode.unlocksLabel}!`,
      "tech"
    );
    const firstV = sourceUnit ?? world.villagers[0];
    if (firstV) {
      firstV.thoughtBubble = `${activeNode.name}!`;
      firstV.thoughtTimer = 4;
      spawnParticle(particles, {
        kind: "sparkle",
        x: firstV.x,
        y: firstV.y - 14,
        vx: 0,
        vy: -14,
        maxLife: 1.5,
        size: 3,
        alpha: 1,
        phase: 0,
        color: "#FDE047"
      });
    }
    const nextFrontier = getAvailableFrontierTechs(world.unlockedTechIds);
    world.activeTechId = nextFrontier[0]?.id ?? null;
  }
}
function applyCombatStrike(world, attacker, defender, rawDmg, baseBleedChance, cause, particles) {
  const defStats = getTraitStats(defender);
  const techMods = getTechModifiers(world.unlockedTechIds);
  const defTactics = getSkillLevel(defender, "tactics");
  const armorMit = defender.gearTier * 2.5 + (defender.isStranger ? 0 : techMods.armorBonus) + defTactics * 0.4;
  const dmg = Math.max(2, Math.round((rawDmg - armorMit) * defStats.damageTakenMult));
  defender.hp = Math.max(0, defender.hp - dmg);
  const bleedMult = defStats.bleedChanceMult * Math.max(0.08, 1 - (defender.stats?.bleedResist ?? 0.1) - (defender.isStranger ? 0 : techMods.bleedResistBonus));
  const atkBladeBonus = attacker ? getSkillLevel(attacker, "blade_mastery") * 0.03 : 0;
  const finalBleedChance = Math.max(0.02, (baseBleedChance + atkBladeBonus) * bleedMult);
  if (Math.random() < finalBleedChance && defender.hp > 0) {
    if (!defender.stats) defender.stats = rollUnitStats(defender.traits, Boolean(defender.isStranger));
    defender.stats.bleedStack = Math.min(4, defender.stats.bleedStack + 1);
    defender.stats.bleedTimer = 12;
    defender.thoughtBubble = defender.traits.includes("hard_skin") ? "Scratched!" : "Bleeding!";
    defender.thoughtTimer = 2.4;
  }
  for (let i = 0; i < 3; i++) {
    spawnParticle(particles, {
      kind: "blood",
      x: defender.x + (Math.random() * 8 - 4),
      y: defender.y - 6,
      vx: (Math.random() - 0.5) * 10,
      vy: -8 - Math.random() * 6,
      maxLife: 0.7,
      size: 1.8,
      alpha: 0.85,
      phase: 0,
      color: "#DC2626"
    });
  }
  if (defender.hp <= 0) {
    if (!defender.isStranger) {
      killVillager(world, defender.id, cause, particles);
    }
    return true;
  }
  return false;
}
function updateVillagerEquipment(world, v) {
  if (v.lifeStage === "infant") return;
  const res = getVillageRes(world, v.homeIslandId ?? v.islandId);
  let targetGear = v.gearTier;
  if (getTechUnlocked2(world, "iron_statecraft") && res.iron >= 2 && (v.bravery > 0.65 || v.activeTask === "guard" || v.drafted)) {
    targetGear = 3;
  } else if (getTechUnlocked2(world, "bronze_smelting") && res.bronze >= 2 && v.bravery > 0.55) {
    targetGear = Math.max(targetGear, 3);
  } else if (getTechUnlocked2(world, "animal_husbandry") && res.wool >= 1) {
    targetGear = Math.max(targetGear, 2);
  } else if (getTechUnlocked2(world, "woven_shelter")) {
    targetGear = Math.max(targetGear, 1);
  }
  v.gearTier = targetGear;
  if (getTechUnlocked2(world, "iron_statecraft") && res.iron >= 1 && (v.activeTask === "guard" || v.drafted || v.bravery > 0.68)) {
    v.weaponType = "iron_blade";
  } else if (getTechUnlocked2(world, "bronze_smelting") && res.bronze >= 1 && (v.activeTask === "guard" || v.activeTask === "hunt" || v.drafted)) {
    v.weaponType = "bronze_blade";
  } else if (getTechUnlocked2(world, "archery_watch") && (v.activeTask === "hunt" || v.activeTask === "guard")) {
    v.weaponType = "bow";
  } else if (getTechUnlocked2(world, "flint_spears") && (v.activeTask === "hunt" || v.activeTask === "guard" || v.bravery > 0.54 || v.drafted)) {
    v.weaponType = "flint_spear";
  }
}
function getOwnedBuildIslands(world) {
  if (world.gameMode === "shared_siege") {
    return ["cradle", "sunterrace", "timbercrown"].filter((id) => world.islands[id]?.discovered);
  }
  const owned = PLAYER_VILLAGE_ISLANDS.filter((id) => Boolean(world.islandOwners?.[id]));
  if (owned.length > 0) return owned;
  return [world.localHomeIslandId ?? "cradle"];
}
function pickNextAutonomousBuilding(world, targetHomeIslandId) {
  const homeIsles = targetHomeIslandId ? [targetHomeIslandId] : getOwnedBuildIslands(world);
  const primaryIsle = homeIsles[0] ?? world.localHomeIslandId ?? "cradle";
  for (const sug of world.placedSuggestions) {
    if (targetHomeIslandId && sug.islandId !== targetHomeIslandId && world.gameMode !== "shared_siege") continue;
    const bp = BUILDING_BLUEPRINTS[sug.buildingType];
    if (!bp) continue;
    if (!getTechUnlocked2(world, bp.requiredTechId)) continue;
    const payIsle = world.islandOwners?.[sug.islandId] ? sug.islandId : primaryIsle;
    if (!hasResourcesFor(getVillageRes(world, payIsle), getBuildCost(bp))) continue;
    return {
      type: sug.buildingType,
      islandId: sug.islandId,
      x: sug.x,
      y: sug.y,
      cropType: sug.cropType,
      livestockKind: sug.livestockKind,
      suggestionId: sug.id
    };
  }
  for (const homeId of homeIsles) {
    const res = getVillageRes(world, homeId);
    const pop = Math.max(1, world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === homeId).length);
    const beds = getHousingBedsForIsland(world, homeId);
    const countIsleType = (t) => world.buildings.filter((b) => b.islandId === homeId && b.type === t && b.unlocked).length;
    const anyPendingOnIsle = world.buildings.some((b) => b.islandId === homeId && !b.unlocked);
    if (anyPendingOnIsle) continue;
    const priorities = [];
    if (countIsleType("bonfire") === 0) {
      priorities.push({ type: "bonfire", islandId: homeId });
    }
    const foodTarget = Math.max(10, pop * 6);
    if (res.food < foodTarget && countIsleType("farm_plot") < 2) {
      priorities.push({
        type: "farm_plot",
        islandId: homeId,
        cropType: countIsleType("farm_plot") === 0 ? "turnip" : "wheat"
      });
    }
    const homeCount = countIsleType("lean_to") + countIsleType("cottage");
    const needsHousing = villageNeedsHousing(pop, beds) || homeCount === 0;
    if (needsHousing) {
      if (canBuildCottage(world, homeId) && hasFoundationResources(res, getBuildCost(BUILDING_BLUEPRINTS.cottage))) {
        priorities.push({ type: "cottage", islandId: homeId });
      } else {
        priorities.push({ type: "lean_to", islandId: homeId });
      }
    }
    const basicNeedsSecured = countIsleType("bonfire") > 0 && (res.food >= Math.max(8, pop * 4) || countIsleType("farm_plot") >= 1) && !villageNeedsHousing(pop, beds) && homeCount > 0;
    if (basicNeedsSecured) {
      if (countIsleType("farm_plot") < 3) {
        priorities.push({
          type: "farm_plot",
          islandId: homeId,
          cropType: countIsleType("farm_plot") === 0 ? "turnip" : countIsleType("farm_plot") === 1 ? "wheat" : "herbs"
        });
      }
      if (countIsleType("woodshop") === 0) priorities.push({ type: "woodshop", islandId: homeId });
      if (countIsleType("pasture") === 0) priorities.push({ type: "pasture", islandId: homeId, livestockKind: "sheep" });
      if (countIsleType("quarry") === 0) priorities.push({ type: "quarry", islandId: homeId });
      if (countIsleType("dock") === 0) priorities.push({ type: "dock", islandId: homeId });
      if (countIsleType("glider_pad") === 0) priorities.push({ type: "glider_pad", islandId: homeId });
      if (countIsleType("bakery") === 0) priorities.push({ type: "bakery", islandId: homeId });
      if (countIsleType("library") === 0) priorities.push({ type: "library", islandId: homeId });
      if (countIsleType("watchtower") < 2) priorities.push({ type: "watchtower", islandId: homeId });
      if (countIsleType("smeltery") === 0) priorities.push({ type: "smeltery", islandId: homeId });
      if (countIsleType("barracks") === 0) priorities.push({ type: "barracks", islandId: homeId });
    }
    for (const cand of priorities) {
      if (cand.type === "cottage" && !canBuildCottage(world, cand.islandId)) continue;
      const bp = BUILDING_BLUEPRINTS[cand.type];
      if (!getTechUnlocked2(world, bp.requiredTechId)) continue;
      if (!hasFoundationResources(res, getBuildCost(bp))) continue;
      const site = findValidSiteOnIsland(world, cand.islandId);
      if (!site) continue;
      return {
        ...cand,
        x: site.x,
        y: site.y
      };
    }
  }
  return null;
}
function tickAutonomousConstruction(world, dt, particles, emitVisualParticles) {
  if (world.activeConstruction) {
    const ac = world.activeConstruction;
    const b = world.buildings.find((item) => item.id === ac.buildingId);
    let builder = world.villagers.find((v) => v.id === ac.builderId);
    if (!b) {
      world.activeConstruction = null;
      return;
    }
    if (!builder || builder.lifeStage === "infant" || builder.banished) {
      builder = world.villagers.find((v) => !v.banished && v.lifeStage !== "infant" && (v.homeIslandId ?? v.islandId) === b.islandId) ?? world.villagers.find((v) => !v.banished && (v.lifeStage === "adult" || v.lifeStage === "elder"));
      if (!builder) return;
      ac.builderId = builder.id;
    }
    const matCheck = deliverMaterialsForStage(world, b, ac, syncCombinedFood);
    if (!matCheck.gateMet) {
      ac.progress = Math.min(ac.progress, Math.max(0, matCheck.nextGateRatio * ac.duration - 0.02));
      ac.pausedForMaterials = true;
      const carryingNeeded = builder.carriedResource && (builder.carriedAmount ?? 0) > 0.05 && matCheck.missing.includes(builder.carriedResource);
      if (carryingNeeded && builder.hunger >= 22) {
        builder.targetX = b.x;
        builder.targetY = b.y + 18;
        builder.autonomyReason = `Hauling ${builder.carriedResource} to ${b.name} (${ac.stage ?? "foundation"}).`;
      } else {
        if (builder.state === "building") builder.state = "working";
        builder.autonomyReason = `Awaiting ${matCheck.missing.join(", ")} at ${b.name} (${ac.stage ?? "foundation"}).`;
      }
      return;
    }
    ac.pausedForMaterials = false;
    if (builder.hunger < 24 || builder.warmth < 20) {
      if (builder.state === "building") builder.state = "resting";
      return;
    }
    builder.targetX = b.x;
    builder.targetY = b.y + 18;
    const dist = Math.hypot(builder.x - b.x, builder.y - b.y);
    if (dist <= 38) {
      builder.state = "building";
      builder.autonomyReason = `${ac.isUpgrade ? "Upgrading" : "Building"} ${b.name} (${ac.stage ?? "foundation"}).`;
      const cleverBoost = builder.traits.includes("clever_crafter") ? 1.3 : 1;
      const masonryMult = 1 + getSkillLevel(builder, "masonry") * 0.08;
      const techBuildMult = getTechModifiers(world.unlockedTechIds).buildSpeedMult;
      ac.progress += dt * cleverBoost * masonryMult * (ac.isUpgrade ? techBuildMult : 1);
      b.constructionStage = getConstructionStageForRatio(ac.progress / Math.max(0.1, ac.duration), b.unlocked);
      ac.stage = b.constructionStage;
      gainSkillXp(world, builder, "masonry", dt * 1.1);
      if (emitVisualParticles && Math.random() < dt * 2.2) {
        spawnParticle(particles, {
          kind: "sparkle",
          x: b.x + (Math.random() * 20 - 10),
          y: b.y - 10,
          vx: (Math.random() - 0.5) * 14,
          vy: -14,
          maxLife: 0.7,
          size: 2,
          alpha: 0.9,
          phase: 0,
          color: "#FBBF24"
        });
      }
      if (ac.progress >= ac.duration) {
        b.unlocked = true;
        b.constructionStage = "complete";
        b.pausedForMaterials = false;
        b.level = Math.min(b.maxLevel, Math.max(1, b.level + 1));
        b.disrepair = 0;
        b.hp = b.maxHp;
        addVillageResource(world, b.islandId, "hearthlight", 6);
        grantKnowledge(world, 6, particles, builder);
        advanceKnowledge(builder, "construction", 8);
        recordPositiveContribution(world, builder, "build", null, 5);
        recordNpcMemory(builder, {
          day: world.environment.dayCount,
          timeOfDay: world.environment.timeOfDay,
          kind: "construction",
          summary: `${ac.isUpgrade ? "Upgraded" : "Completed"} ${b.name} on ${ISLAND_DEFS[b.islandId].name}.`,
          actorIds: [],
          importance: 7,
          sentiment: "positive"
        });
        if (!ac.isUpgrade && b.type === "pasture") {
          spawnPastureLivestock(world, b);
        }
        if (!ac.isUpgrade && b.type === "dock") {
          world.islands[b.islandId].dockBuilt = true;
          spawnDockBoat(world, b, "fishing_skiff");
          if (getTechUnlocked2(world, "sail_navigation")) {
            spawnDockBoat(world, b, "cargo_merchant");
          }
        }
        if (b.type === "barracks" && getTechUnlocked2(world, "iron_statecraft")) {
          const hasGalley = world.boats.some((bt) => bt.homeIslandId === b.islandId && bt.kind === "war_galley");
          if (!hasGalley) spawnDockBoat(world, b, "war_galley");
        }
        addChronicle(
          world,
          `${builder.name.split(" ")[0]} ${ac.isUpgrade ? `upgraded ${b.name} to Lv.${b.level}` : `completed ${b.name}`} on ${ISLAND_DEFS[b.islandId].name}.`,
          "build",
          { islandId: b.islandId, participantIds: [builder.id] }
        );
        builder.thoughtBubble = "Built!";
        builder.thoughtTimer = 3.2;
        builder.state = "working";
        builder.decisionCooldown = 1;
        world.activeConstruction = null;
        if (world.suggestedBuildingId === b.id) world.suggestedBuildingId = null;
      }
    }
    return;
  }
  for (const br of world.bridges) {
    if (br.built) continue;
    if (!getTechUnlocked2(world, br.requiredTechId)) continue;
    const builder = world.villagers.find(
      (v) => canVillagerWork(world, v) && (world.islands[br.fromIsland].discovered || world.islands[br.toIsland].discovered)
    );
    if (!builder) continue;
    const payIsle = builder.homeIslandId ?? builder.islandId;
    const payRes = getVillageRes(world, payIsle);
    if (br.progress === 0) {
      if (payRes.timber >= br.costTimber && payRes.stone >= br.costStone) {
        spendVillageResources(world, payIsle, { timber: br.costTimber, stone: br.costStone });
        br.progress = 0.04;
        addChronicle(world, `${builder.name.split(" ")[0]} began lashing the ${br.name}!`, "voyage");
      } else {
        continue;
      }
    }
    if (br.progress > 0 && !br.built) {
      const anchorX = builder.islandId === br.toIsland ? br.x2 : br.x1;
      const anchorY = builder.islandId === br.toIsland ? br.y2 : br.y1;
      builder.targetX = anchorX;
      builder.targetY = anchorY;
      const d = Math.hypot(builder.x - anchorX, builder.y - anchorY);
      if (d <= 64) {
        builder.state = "building";
        builder.autonomyReason = `Lashing planks on ${br.name} (${Math.round(br.progress * 100)}%).`;
        br.progress = Math.min(1, br.progress + dt * 0.11);
      } else {
        br.progress = Math.min(1, br.progress + dt * 0.03);
      }
      if (br.progress >= 1) {
        br.built = true;
        br.progress = 1;
        discoverIsland(world, br.fromIsland, builder.name.split(" ")[0]);
        discoverIsland(world, br.toIsland, builder.name.split(" ")[0]);
        world.islands[br.toIsland].settledDay ??= world.environment.dayCount;
        builder.thoughtBubble = "Bridge linked!";
        builder.thoughtTimer = 3.6;
        addChronicle(
          world,
          `${builder.name.split(" ")[0]} completed the ${br.name}, linking ${ISLAND_DEFS[br.fromIsland].name} to ${ISLAND_DEFS[br.toIsland].name}!`,
          "voyage"
        );
      }
      return;
    }
  }
  for (const cb of world.cableways) {
    if (cb.built) continue;
    if (!getTechUnlocked2(world, cb.requiredTechId)) continue;
    const builder = world.villagers.find(
      (v) => canVillagerWork(world, v) && (world.islands[cb.fromIsland].discovered || world.islands[cb.toIsland].discovered)
    );
    if (!builder) continue;
    const payIsle = builder.homeIslandId ?? builder.islandId;
    const payRes = getVillageRes(world, payIsle);
    if (cb.progress === 0) {
      if (payRes.timber >= cb.costTimber && payRes.stone >= cb.costStone && payRes.iron >= cb.costIron) {
        spendVillageResources(world, payIsle, { timber: cb.costTimber, stone: cb.costStone, iron: cb.costIron });
        cb.progress = 0.05;
        addChronicle(world, `${builder.name.split(" ")[0]} began rigging the ${cb.name} sky-cable!`, "voyage");
      } else {
        continue;
      }
    }
    if (cb.progress > 0 && !cb.built) {
      const anchorX = builder.islandId === cb.toIsland ? cb.x2 : cb.x1;
      const anchorY = builder.islandId === cb.toIsland ? cb.y2 : cb.y1;
      builder.targetX = anchorX;
      builder.targetY = anchorY;
      const d = Math.hypot(builder.x - anchorX, builder.y - anchorY);
      if (d <= 72) {
        builder.state = "building";
        builder.autonomyReason = `Tensioning cable lines on ${cb.name} (${Math.round(cb.progress * 100)}%).`;
        cb.progress = Math.min(1, cb.progress + dt * 0.12);
      } else {
        cb.progress = Math.min(1, cb.progress + dt * 0.035);
      }
      if (cb.progress >= 1) {
        cb.built = true;
        cb.progress = 1;
        discoverIsland(world, cb.fromIsland, builder.name.split(" ")[0]);
        discoverIsland(world, cb.toIsland, builder.name.split(" ")[0]);
        builder.thoughtBubble = "Cableway ready!";
        builder.thoughtTimer = 3.4;
        addChronicle(
          world,
          `${builder.name.split(" ")[0]} strung the ${cb.name} gondola between ${ISLAND_DEFS[cb.fromIsland].name} & ${ISLAND_DEFS[cb.toIsland].name}!`,
          "voyage"
        );
      }
      return;
    }
  }
  world.autoBuildTimer -= dt;
  if (world.autoBuildTimer > 0) return;
  world.autoBuildTimer = 6.5;
  const builders = world.villagers.filter((v) => canVillagerWork(world, v));
  if (builders.length === 0) return;
  const unfinished = world.buildings.find((b) => !b.unlocked && b.cultureId !== "ashen_raider");
  if (unfinished) {
    const builder = builders.find((v) => (v.homeIslandId ?? v.islandId) === unfinished.islandId) ?? builders.find((v) => v.islandId === unfinished.islandId) ?? builders[0];
    const buildSpeed = getTechModifiers(world.unlockedTechIds).buildSpeedMult;
    world.activeConstruction = {
      buildingId: unfinished.id,
      builderId: builder.id,
      progress: 0,
      duration: Number(((unfinished.type === "bonfire" || unfinished.type === "lean_to" ? 4.2 : 6.8) / buildSpeed).toFixed(2)),
      isUpgrade: false
    };
    return;
  }
  if (world.suggestedBuildingId) {
    const b = world.buildings.find((item) => item.id === world.suggestedBuildingId);
    if (b && b.cultureId !== "ashen_raider" && b.level < b.maxLevel) {
      const cost = getUpgradeCost(b);
      if (hasResourcesFor(getVillageRes(world, b.islandId), cost)) {
        spendVillageResources(world, b.islandId, cost);
        const builder = builders.find((v) => (v.homeIslandId ?? v.islandId) === b.islandId) ?? builders[Math.floor(Math.random() * builders.length)];
        world.activeConstruction = {
          buildingId: b.id,
          builderId: builder.id,
          progress: 0,
          duration: 6 + b.level * 2.5,
          isUpgrade: b.unlocked
        };
        return;
      }
    }
  }
  const nextPlan = pickNextAutonomousBuilding(world);
  if (nextPlan) {
    const bp = BUILDING_BLUEPRINTS[nextPlan.type];
    const cost = getBuildCost(bp);
    if (!hasFoundationResources(getVillageRes(world, nextPlan.islandId), cost)) return;
    if (nextPlan.suggestionId) {
      world.placedSuggestions = world.placedSuggestions.filter((s) => s.id !== nextPlan.suggestionId);
    }
    const building = createBuildingInstance(
      world,
      nextPlan.type,
      nextPlan.islandId,
      nextPlan.x,
      nextPlan.y,
      nextPlan.cropType ?? "turnip",
      nextPlan.livestockKind ?? "sheep"
    );
    initStagedBuildingMaterials(building, cost);
    world.buildings.push(building);
    const builder = builders.find((v) => (v.homeIslandId ?? v.islandId) === nextPlan.islandId) ?? builders.find((v) => v.islandId === nextPlan.islandId) ?? builders[Math.floor(Math.random() * builders.length)];
    const buildSpeed = getTechModifiers(world.unlockedTechIds).buildSpeedMult;
    const baseDur = nextPlan.type === "bonfire" || nextPlan.type === "lean_to" ? 4.2 : 7.5;
    world.activeConstruction = {
      buildingId: building.id,
      builderId: builder.id,
      progress: 0,
      duration: Number((baseDur / buildSpeed).toFixed(2)),
      isUpgrade: false,
      stage: "foundation",
      pausedForMaterials: false
    };
    return;
  }
  const ownedIsles = new Set(getOwnedBuildIslands(world));
  const upgradable = world.buildings.filter(
    (b) => b.unlocked && ownedIsles.has(b.islandId) && b.cultureId !== "ashen_raider" && b.level < b.maxLevel && world.islands[b.islandId]?.discovered
  );
  for (const b of upgradable) {
    const cost = getUpgradeCost(b);
    if (hasResourcesFor(getVillageRes(world, b.islandId), cost)) {
      spendVillageResources(world, b.islandId, cost);
      const builder = builders.find((v) => (v.homeIslandId ?? v.islandId) === b.islandId) ?? builders[0];
      world.activeConstruction = {
        buildingId: b.id,
        builderId: builder.id,
        progress: 0,
        duration: 6.5 + b.level * 2.2,
        isUpgrade: true
      };
      return;
    }
  }
}
function assignTargetForTask(world, v, task) {
  const sameIsland = (x, y, islId) => {
    if (islId !== v.islandId) {
      const reach = checkTargetReachability(world, v.islandId, v.x, v.y, x, y, ARCHIPELAGO_LANDMARKS3);
      if (!reach.reachable) return false;
      if (!findBridgeStep(world, v.islandId, islId)) {
        const dock = world.buildings.find((b) => b.islandId === v.islandId && b.type === "dock" && b.unlocked);
        if (dock) {
          v.targetX = dock.x;
          v.targetY = dock.y;
          return true;
        }
        return false;
      }
    }
    v.targetX = x;
    v.targetY = y;
    return true;
  };
  if (task === "forage") {
    const node = world.wildNodes.find(
      (n) => n.islandId === v.islandId && n.amount > 0.05 && (n.kind === "berry_bush" || n.kind === "flint_pile" || n.kind === "branch_pile")
    ) ?? world.wildNodes.find((n) => world.islands[n.islandId].discovered && n.amount > 0.05 && n.kind === "berry_bush");
    if (node) {
      sameIsland(node.x + (Math.random() * 14 - 7), node.y + (Math.random() * 14 - 7), node.islandId);
      return;
    }
  } else if (task === "gather_stone") {
    const node = world.wildNodes.find((n) => n.islandId === v.islandId && n.amount > 0.1 && (n.kind === "stone_boulder" || n.kind === "flint_pile")) ?? world.wildNodes.find((n) => world.islands[n.islandId].discovered && n.amount > 0.1 && (n.kind === "stone_boulder" || n.kind === "flint_pile"));
    if (node) {
      sameIsland(node.x + (Math.random() * 16 - 8), node.y + (Math.random() * 16 - 8), node.islandId);
      return;
    }
  } else if (task === "chop") {
    const node = world.wildNodes.find((n) => n.islandId === v.islandId && n.amount > 0.1 && (n.kind === "tree" || n.kind === "branch_pile")) ?? world.wildNodes.find((n) => world.islands[n.islandId].discovered && n.amount > 0.1 && n.kind === "tree");
    if (node) {
      sameIsland(node.x + (Math.random() * 16 - 8), node.y + (Math.random() * 16 - 8), node.islandId);
      return;
    }
  } else if (task === "farm") {
    const farm = world.buildings.find((b) => b.type === "farm_plot" && b.unlocked && b.islandId === v.islandId) ?? world.buildings.find((b) => b.type === "farm_plot" && b.unlocked);
    if (farm) {
      sameIsland(farm.x + (Math.random() * 18 - 9), farm.y + (Math.random() * 12 - 6), farm.islandId);
      return;
    }
  } else if (task === "pasture") {
    const pen = world.buildings.find((b) => b.type === "pasture" && b.unlocked && b.islandId === v.islandId) ?? world.buildings.find((b) => b.type === "pasture" && b.unlocked);
    if (pen) {
      sameIsland(pen.x + (Math.random() * 20 - 10), pen.y + (Math.random() * 14 - 7), pen.islandId);
      return;
    }
  } else if (task === "hunt") {
    const prey = world.wildHerds.find((h) => h.islandId === v.islandId && h.hp > 0) ?? world.wildHerds.find((h) => world.islands[h.islandId].discovered && h.hp > 0);
    if (prey) {
      sameIsland(prey.x, prey.y, prey.islandId);
      return;
    }
  } else if (task === "quarry" || task === "smelt" || task === "bake" || task === "study" || task === "guard" || task === "fish") {
    const typeMap = {
      quarry: "quarry",
      smelt: "smeltery",
      bake: "bakery",
      study: "library",
      guard: hasBuildingType2(world, "watchtower") ? "watchtower" : "barracks",
      fish: "dock"
    };
    const b = world.buildings.find((item) => item.type === typeMap[task] && item.unlocked && item.islandId === v.islandId) ?? world.buildings.find((item) => item.type === typeMap[task] && item.unlocked);
    if (b) {
      sameIsland(b.x + (Math.random() * 14 - 7), b.y + 16, b.islandId);
      return;
    }
  } else if (task === "explore") {
    const localRuin = world.exploreRuins.find((r) => r.islandId === v.islandId && r.cooldownTimer <= 0);
    if (localRuin) {
      v.targetX = localRuin.x;
      v.targetY = localRuin.y + 12;
      return;
    }
    const pad = world.buildings.find((b) => b.islandId === v.islandId && b.type === "glider_pad" && b.unlocked);
    if (pad) {
      v.targetX = pad.x;
      v.targetY = pad.y;
      return;
    }
    const cb = world.cableways.find((c) => c.built && (c.fromIsland === v.islandId || c.toIsland === v.islandId));
    if (cb) {
      v.targetX = cb.fromIsland === v.islandId ? cb.x1 : cb.x2;
      v.targetY = cb.fromIsland === v.islandId ? cb.y1 : cb.y2;
      return;
    }
    const dock = world.buildings.find((b) => b.islandId === v.islandId && b.type === "dock" && b.unlocked);
    if (dock) {
      v.targetX = dock.x;
      v.targetY = dock.y;
      return;
    }
    const br = world.bridges.find((item) => item.built && (item.fromIsland === v.islandId || item.toIsland === v.islandId));
    if (br) {
      const targetIsle = br.fromIsland === v.islandId ? br.toIsland : br.fromIsland;
      v.targetX = ISLAND_DEFS[targetIsle].centerX;
      v.targetY = ISLAND_DEFS[targetIsle].centerY;
      return;
    }
  }
  const isl = ISLAND_DEFS[v.islandId];
  v.targetX = isl.centerX + (Math.random() * 90 - 45);
  v.targetY = isl.centerY + (Math.random() * 65 - 32);
}
var CONCEPT_REACTION_LINES = {
  berry_bush: {
    bubble: "Sweet berries!",
    dialogue: "I tasted soft red berries growing on leafy twigs\u2014sweet and filling!",
    memory: "Discovered wild edible berries in the meadow brush."
  },
  flint_pile: {
    bubble: "Sharp sparking rock!",
    dialogue: "When I struck two grey stones together, bright golden sparks flew!",
    memory: "Noticed flint chips throw hot sparks when struck."
  },
  branch_pile: {
    bubble: "Dry kindling!",
    dialogue: "Snapped dry fallen branches\u2014they are light, strong, and catch sparks easily.",
    memory: "Examined fallen branches and tested their strength."
  },
  spring: {
    bubble: "Cool clear water!",
    dialogue: "Dipped my fingers into the bubbling meadow spring\u2014cool, clear, and refreshing!",
    memory: "Found fresh spring water pooling in the mossy stones."
  },
  tree: {
    bubble: "Towering wood!",
    dialogue: "Pressed my hands against rough bark reaching toward the sky\u2014solid timber!",
    memory: "Studied tall meadow trees swaying in the breeze."
  },
  wildlife: {
    bubble: "Furry creature!",
    dialogue: "Watched a quick wild creature dart across the grass in awe!",
    memory: "Observed wild animals roaming across the island."
  },
  horizon: {
    bubble: "Island in the sky!",
    dialogue: "Peered over the cliff rim\u2014our meadow floats above an endless blue sky-sea!",
    memory: "Discovered the floating island horizon and distant mist."
  },
  embers: {
    bubble: "Warm dancing flame!",
    dialogue: "Held my palms beside the crackling orange embers\u2014warmth chases away the dark!",
    memory: "Marveled at the heat and light of shared embers."
  },
  copper_vein: {
    bubble: "Gleaming green stone!",
    dialogue: "Found heavy green-streaked rock inside the cliff face!",
    memory: "Spotted gleaming copper ore veins."
  },
  iron_vein: {
    bubble: "Heavy dark iron!",
    dialogue: "Touched dense dark-blue iron ore veining the high crags!",
    memory: "Identified dark iron ore veins for strong blades & cables."
  },
  ruin: {
    bubble: "Ancient carvings!",
    dialogue: "Traced ancient star-glyphs etched into moss-grown obelisks!",
    memory: "Uncovered forgotten ruins left by ancient sky-farers."
  },
  glacier: {
    bubble: "Crystalline frost!",
    dialogue: "Felt crisp alpine ice crystals shimmering at the summit spire!",
    memory: "Marvelled at high-altitude alpine snow & crystal peaks."
  },
  volcano: {
    bubble: "Glowing basalt!",
    dialogue: "Heat rises from fissures inside the Ashen Bastion caldera!",
    memory: "Observed glowing volcanic rock along the Bastion cliffs."
  }
};
function assignCognitiveExplorationTarget(world, v) {
  const isl = ISLAND_DEFS[v.islandId];
  const observed = new Set(v.cognition.observedConcepts);
  const candidates = [];
  for (const node of world.wildNodes) {
    if (node.islandId !== v.islandId || node.amount <= 0) continue;
    if (!observed.has(node.kind)) {
      candidates.push({
        concept: node.kind,
        x: node.x,
        y: node.y,
        label: node.kind.replace("_", " ")
      });
    }
  }
  if (isl.hasSpring && isl.springOffset && !observed.has("spring")) {
    candidates.push({
      concept: "spring",
      x: isl.centerX + isl.springOffset.dx,
      y: isl.centerY + isl.springOffset.dy,
      label: "fresh spring"
    });
  }
  const herd = world.wildHerds.find((h) => h.islandId === v.islandId && h.hp > 0);
  if (herd && !observed.has("wildlife")) {
    candidates.push({
      concept: "wildlife",
      x: herd.x,
      y: herd.y,
      label: `wild ${herd.kind}`
    });
  }
  const fire = getIslandBonfire(world, v.islandId);
  if (fire && !observed.has("embers")) {
    candidates.push({ concept: "embers", x: fire.x, y: fire.y + 18, label: "crackling embers" });
  }
  if (!observed.has("horizon")) {
    const ang = Math.random() * Math.PI * 2;
    candidates.push({
      concept: "horizon",
      x: isl.centerX + Math.cos(ang) * (isl.radiusX - 58),
      y: isl.centerY + Math.sin(ang) * (isl.radiusY - 52),
      label: "cliff edge horizon"
    });
  }
  let pick = null;
  if (candidates.length > 0) {
    pick = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    const anyNode = world.wildNodes.filter((n) => n.islandId === v.islandId && n.amount > 0);
    if (anyNode.length > 0 && Math.random() < 0.7) {
      const n = anyNode[Math.floor(Math.random() * anyNode.length)];
      pick = { concept: n.kind, x: n.x, y: n.y, label: n.kind.replace("_", " ") };
    } else {
      const ang = Math.random() * Math.PI * 2;
      const r = 0.35 + Math.random() * 0.48;
      pick = {
        concept: "horizon",
        x: isl.centerX + Math.cos(ang) * (isl.radiusX - 45) * r,
        y: isl.centerY + Math.sin(ang) * (isl.radiusY - 40) * r,
        label: "uncharted meadow clearing"
      };
    }
  }
  v.cognition.focusObject = pick.concept;
  v.activeTask = "explore";
  v.state = "exploring";
  v.targetX = pick.x + (Math.random() * 24 - 12);
  v.targetY = pick.y + (Math.random() * 20 - 10);
  v.autonomyReason = v.cognition.stage === "awakening" ? `Wandering like a child toward ${pick.label} in curiosity.` : `Inspecting ${pick.label} to learn how the world works.`;
}
function learnConcept(world, v, concept, particles, sharedFrom) {
  const prevStage = v.cognition.stage;
  const isNew = !v.cognition.observedConcepts.includes(concept);
  if (isNew) {
    v.cognition.observedConcepts.push(concept);
  }
  const gain = isNew ? sharedFrom ? 9 : 15 : 3.5;
  v.cognition.awareness = Math.min(100, v.cognition.awareness + gain * (0.85 + v.curiosity * 0.4));
  v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);
  const info = CONCEPT_REACTION_LINES[concept];
  if (info && isNew) {
    v.thoughtBubble = sharedFrom ? `Learned from ${sharedFrom}!` : info.bubble;
    v.thoughtTimer = 4.2;
    v.currentDialogue = info.dialogue;
    recordNpcMemory(v, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: "discovery",
      summary: sharedFrom ? `Learned about ${concept.replace("_", " ")} from ${sharedFrom}.` : info.memory,
      actorIds: [],
      importance: 7,
      sentiment: "positive"
    });
  } else {
    v.thoughtBubble = "Hmm... interesting!";
    v.thoughtTimer = 2.6;
  }
  const domainMap = {
    berry_bush: "foraging",
    branch_pile: "woodcraft",
    tree: "woodcraft",
    flint_pile: "toolmaking",
    stone_boulder: "stonecraft",
    copper_vein: "stonecraft",
    iron_vein: "toolmaking",
    embers: "firecraft",
    volcano: "firecraft",
    spring: "healing",
    wildlife: "foraging",
    horizon: "sailing",
    glacier: "sailing",
    ruin: "social_customs"
  };
  const domainId = domainMap[concept] ?? "foraging";
  advanceKnowledge(v, domainId, isNew ? sharedFrom ? 5.5 : 8.5 : 1.6);
  grantKnowledge(world, isNew ? 3.5 : 0.8, particles, v);
  spawnParticle(particles, {
    kind: "sparkle",
    x: v.x,
    y: v.y - 12,
    vx: 0,
    vy: -12,
    maxLife: 1,
    size: 2.1,
    alpha: 0.95,
    phase: 0,
    color: "#A8D8EA"
  });
  if (prevStage !== v.cognition.stage) {
    if (v.cognition.stage === "experimenting") {
      addChronicle(
        world,
        `${v.name.split(" ")[0]}'s mind awakened to toolmaking and shelter\u2014ready to test sparks and branches!`,
        "tech"
      );
    } else if (v.cognition.stage === "reasoning") {
      addChronicle(
        world,
        `${v.name.split(" ")[0]} reached full Reasoning maturity, able to farm, craft, and teach others.`,
        "tech"
      );
    } else if (v.cognition.stage === "enlightened") {
      addChronicle(world, `${v.name.split(" ")[0]} became an Enlightened thinker of the archipelago!`, "tech");
    }
  }
}
function decideVillagerBehavior(world, v) {
  if (world.activeConstruction && world.activeConstruction.builderId === v.id && !world.activeConstruction.pausedForMaterials && v.hunger >= 24 && v.warmth >= 20) {
    return;
  }
  const decision = evaluateVillagerDecision(world, v);
  v.decisionTrace = decision.trace;
  if (decision.selectedAction === "eat_comfort" && world.comforts[v.favoriteComfort] >= 1) {
    world.comforts[v.favoriteComfort] -= 1;
    v.hunger = Math.min(100, v.hunger + 44);
    v.hp = Math.min(v.maxHp, v.hp + 10);
    v.mood = Math.min(100, v.mood + 9);
    v.state = "eating";
    v.autonomyReason = decision.autonomyReason;
    v.thoughtBubble = `Warm ${v.favoriteComfort}!`;
    v.thoughtTimer = 3;
    advanceKnowledge(v, "cooking", 1.2);
    recordNpcMemory(v, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: "survival",
      summary: `Enjoyed ${COMFORT_LABELS[v.favoriteComfort].toLowerCase()} beside the hearth.`,
      actorIds: [],
      importance: 4,
      sentiment: "positive"
    });
    return;
  }
  if (decision.selectedAction === "eat_stockpile") {
    const foodRes = consumeFoodUnits(world, v.homeIslandId ?? v.islandId, 1);
    if (foodRes.ok) {
      v.hunger = Math.min(100, v.hunger + foodRes.hungerGain);
      v.mood = Math.max(5, Math.min(100, v.mood + foodRes.moodBonus));
      v.hp = Math.min(v.maxHp, v.hp + 4);
      v.state = "eating";
      v.autonomyReason = decision.autonomyReason;
      return;
    }
  }
  v.state = decision.activityState;
  v.activeTask = decision.task;
  v.targetX = decision.targetX;
  v.targetY = decision.targetY;
  v.autonomyReason = decision.autonomyReason;
  if (decision.focusConcept) {
    v.cognition.focusObject = decision.focusConcept;
  }
}
function tickBoats(world, dt, particles, emitVisualParticles) {
  const weather = world.environment.weather;
  for (let bi = world.boats.length - 1; bi >= 0; bi--) {
    const boat = world.boats[bi];
    const homeDef = ISLAND_DEFS[boat.homeIslandId];
    if (boat.state === "sailing" && (weather === "rain" || weather === "mist")) {
      boat.hp = Math.max(0, boat.hp - dt * 1.4);
      if (boat.hp <= 0) {
        addChronicle(world, `${boat.name} was dashed against sky-reefs in heavy mist!`, "ruin");
        for (const pid of [...boat.passengerIds]) {
          const pv = world.villagers.find((v) => v.id === pid);
          if (pv) {
            pv.voyageBoatId = null;
            killVillager(world, pv.id, "shipwreck", particles);
          }
        }
        world.boats.splice(bi, 1);
        continue;
      }
    } else if (boat.state === "docked") {
      boat.hp = Math.min(boat.maxHp, boat.hp + dt * 4);
    }
    boat.tripTimer -= dt;
    const dx = boat.targetX - boat.x;
    const dy = boat.targetY - boat.y;
    const dist = Math.hypot(dx, dy);
    if (boat.kind === "migrant_skiff") {
      if (tickMigrantBoatLifecycle(world, boat, dt, world.boats, bi)) {
        continue;
      }
      if (boat.state === "docked") continue;
    }
    if (dist > 6) {
      const boatSpeedMult = boat.cultureId === "mist_mariner" ? 1 : getTechModifiers(world.unlockedTechIds).boatSpeedMult;
      const spd = (boat.kind === "fishing_skiff" ? 24 : boat.kind === "migrant_skiff" ? 28 : boat.kind === "cargo_merchant" ? 32 : 36) * boatSpeedMult;
      boat.x += dx / dist * spd * dt;
      boat.y += dy / dist * spd * dt;
      boat.yaw = Math.atan2(-(boat.y - (boat.y - dy)), dx);
      for (const pid of boat.passengerIds) {
        const pv = world.villagers.find((v) => v.id === pid);
        if (pv) {
          pv.x = boat.x;
          pv.y = boat.y;
          pv.state = "sailing";
        }
      }
      if (emitVisualParticles && Math.random() < dt * 1.8) {
        spawnParticle(particles, {
          kind: "splash",
          x: boat.x,
          y: boat.y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          maxLife: 0.7,
          size: 1.8,
          alpha: 0.5,
          phase: 0,
          color: "#E0F2FE"
        });
      }
    } else if (boat.tripTimer <= 0) {
      if (boat.kind === "fishing_skiff") {
        if (boat.cultureId !== "mist_mariner") {
          addVillageResource(world, boat.homeIslandId, "fish", 1.4);
          grantKnowledge(world, 0.4, particles);
        }
        const ang = Math.random() * Math.PI * 2;
        boat.targetX = homeDef.dockSpot.seaX + Math.cos(ang) * 75;
        boat.targetY = homeDef.dockSpot.seaY + Math.sin(ang) * 55;
        boat.tripTimer = 8 + Math.random() * 6;
      } else if (boat.kind === "cargo_merchant") {
        const targetIslands = ISLAND_ORDER.filter(
          (id) => id !== boat.targetIslandId && world.islands[id].discovered && world.islands[id].dockBuilt && (id !== "mistatoll" || world.diplomacy.mist_mariner.status !== "war")
        );
        const nextIsle = targetIslands[Math.floor(Math.random() * targetIslands.length)] ?? boat.homeIslandId;
        if (boat.targetIslandId === "coppercrag" && world.islands.coppercrag.discovered) {
          addVillageResource(world, boat.homeIslandId, "copper", 2);
          addVillageResource(world, boat.homeIslandId, "iron", 1);
        } else if (boat.targetIslandId === "mistatoll" && world.diplomacy.mist_mariner.status !== "war") {
          addVillageResource(world, boat.homeIslandId, "fish", 2);
          addVillageResource(world, boat.homeIslandId, "hearthlight", 2);
          world.diplomacy.mist_mariner.trust = Math.min(100, world.diplomacy.mist_mariner.trust + 3);
        } else if (boat.targetIslandId === "sunterrace") {
          addVillageResource(world, boat.homeIslandId, "grain", 2);
          addVillageResource(world, boat.homeIslandId, "wool", 1);
        } else {
          addVillageResource(world, boat.homeIslandId, "timber", 1.5);
        }
        syncCombinedFood(world);
        boat.targetIslandId = nextIsle;
        boat.targetX = ISLAND_DEFS[nextIsle].dockSpot.seaX;
        boat.targetY = ISLAND_DEFS[nextIsle].dockSpot.seaY;
        boat.state = "sailing";
        boat.tripTimer = 10;
      } else if (boat.kind === "war_galley") {
        if (boat.cultureId === "mist_mariner" && world.diplomacy.mist_mariner.status === "war") {
          if (boat.state === "raiding") {
            const targetDef = ISLAND_DEFS[boat.targetIslandId];
            for (let r = 0; r < 2; r++) {
              world.raiders.push({
                id: `raid_${Date.now()}_${r}`,
                name: `Mist Raider ${r + 1}`,
                bioDescription: "Hostile Mist-Mariner sea raider.",
                cultureId: "mist_mariner",
                islandId: boat.targetIslandId,
                homeIslandId: "mistatoll",
                isStranger: true,
                cloakColor: "#376C78",
                hairColor: "#2E2622",
                skinTone: "#D19A74",
                hairStyle: r % 4,
                lifeStage: "adult",
                ageDays: 18,
                isChief: false,
                traits: ["brave_hunter"],
                partnerId: null,
                parentIds: null,
                childrenIds: [],
                homeBuildingId: null,
                hp: 65,
                maxHp: 65,
                warmth: 90,
                mood: 60,
                energy: 95,
                hunger: 90,
                affectionXp: 0,
                affectionLevel: 0,
                gearTier: 2,
                weaponType: "bronze_blade",
                curiosity: 0.2,
                bravery: 0.9,
                voyageBoatId: null,
                killCount: 0,
                favoriteComfort: "tea",
                activeWish: "chat",
                wishFulfilledToday: false,
                currentDialogue: "Keep your ships clear of our mist!",
                lastMemory: "Landed with the Mist Galley.",
                relationships: {},
                hangOutTargetId: null,
                socialCooldown: 0,
                suggestedTask: null,
                activeTask: "guard",
                state: "fighting",
                autonomyReason: "Raiding rival stores!",
                thoughtBubble: "Raid!",
                thoughtTimer: 3,
                x: targetDef.dockSpot.x - 15,
                y: targetDef.dockSpot.y + r * 14,
                targetX: targetDef.centerX,
                targetY: targetDef.centerY,
                facing: -1,
                animPhase: 0,
                bounceScale: 1,
                decisionCooldown: 1,
                birthCooldownDays: 99,
                attackCooldown: 0,
                stats: rollUnitStats(["brave_hunter"], true),
                skills: rollStarterSkills("adult"),
                skillXp: {},
                rtsOrder: null,
                drafted: false,
                cognition: {
                  stage: "reasoning",
                  awareness: 65,
                  observedConcepts: ["berry_bush", "wild_fauna", "sky_rim"],
                  socialCount: 2,
                  focusObject: "Mist Galley"
                }
              });
            }
            addChronicle(world, `A Mist-Mariner War Galley landed raiders on ${targetDef.name}!`, "war");
            boat.state = "returning";
            boat.targetIslandId = "mistatoll";
            boat.targetX = ISLAND_DEFS.mistatoll.dockSpot.seaX;
            boat.targetY = ISLAND_DEFS.mistatoll.dockSpot.seaY;
            boat.tripTimer = 18;
          } else {
            boat.state = "docked";
            boat.tripTimer = 20;
          }
        } else {
          if (boat.passengerIds.length > 0 && !world.islands[boat.targetIslandId].discovered) {
            const exp = world.villagers.find((v) => v.id === boat.passengerIds[0]);
            discoverIsland(world, boat.targetIslandId, exp?.name.split(" ")[0]);
            for (const pid of [...boat.passengerIds]) {
              const pv = world.villagers.find((v) => v.id === pid);
              if (pv) {
                pv.voyageBoatId = null;
                pv.islandId = boat.targetIslandId;
                pv.x = ISLAND_DEFS[boat.targetIslandId].dockSpot.x;
                pv.y = ISLAND_DEFS[boat.targetIslandId].dockSpot.y;
                pv.state = "working";
              }
            }
            boat.passengerIds = [];
          }
          boat.state = "docked";
          boat.targetX = homeDef.dockSpot.seaX;
          boat.targetY = homeDef.dockSpot.seaY;
          boat.tripTimer = 15;
        }
      }
    }
  }
}
function tickFarmingAndPastures(world, dt) {
  const season = world.environment.season;
  const isWinter = season === "winter" || world.environment.weather === "snow";
  const isRain = world.environment.weather === "rain";
  for (const b of world.buildings) {
    if (!b.unlocked || b.type !== "farm_plot" || !b.cropState) continue;
    const cs = b.cropState;
    const seasonMult = isWinter ? cs.cropType === "turnip" ? 0.45 : 0.1 : season === "summer" || season === "spring" ? 1.15 : 1;
    const waterMult = (cs.irrigated ? 1.32 : 1) * (isRain ? 1.25 : 1);
    const workerNear = world.villagers.some(
      (v) => v.activeTask === "farm" && Math.hypot(v.x - b.x, v.y - b.y) < 35
    );
    const rate = 0.015 * cs.fertility * seasonMult * waterMult * (workerNear ? 1.55 : 0.65) * (1 + (b.level - 1) * 0.25);
    cs.growth = Math.min(1, cs.growth + rate * dt);
    if (cs.growth >= 1 && workerNear) {
      cs.growth = 0.12;
      const qty = 3 + b.level;
      if (cs.cropType === "turnip" || cs.cropType === "wheat") {
        addVillageResource(world, b.islandId, "grain", qty);
      } else if (cs.cropType === "flax") {
        addVillageResource(world, b.islandId, "wool", Math.ceil(qty * 0.7));
      } else if (cs.cropType === "herbs") {
        addVillageResource(world, b.islandId, "herbs", qty);
        world.comforts.tea = Math.min(25, world.comforts.tea + 1);
      } else if (cs.cropType === "orchard") {
        addVillageResource(world, b.islandId, "berries", qty);
        world.comforts.honey = Math.min(25, world.comforts.honey + 1);
      }
      syncCombinedFood(world);
    }
  }
  for (const st of world.livestock) {
    if (st.pauseTimer > 0) {
      st.pauseTimer -= dt;
    } else {
      const pasture = world.buildings.find((b) => b.id === st.pastureId);
      const cx = pasture?.x ?? st.x;
      const cy = pasture?.y ?? st.y;
      const d = Math.hypot(st.targetX - st.x, st.targetY - st.y);
      if (d < 3) {
        st.pauseTimer = 2 + Math.random() * 4;
        st.targetX = cx + (Math.random() * 26 - 13);
        st.targetY = cy + (Math.random() * 18 - 9);
      } else {
        const step = Math.min(d, 10 * dt);
        const nx = st.x + (st.targetX - st.x) / d * step;
        const ny = st.y + (st.targetY - st.y) / d * step;
        st.facing = st.targetX >= st.x ? 1 : -1;
        if (classifyMainWorldTerrain(world, nx, ny) !== "deep_water") {
          st.x = nx;
          st.y = ny;
        } else {
          st.targetX = cx;
          st.targetY = cy;
          st.pauseTimer = 1;
        }
      }
    }
    st.yieldTimer -= dt;
    if (st.yieldTimer <= 0) {
      st.yieldTimer = 22 + Math.random() * 10;
      if (st.kind === "sheep") {
        addVillageResource(world, st.islandId, "wool", 1.4);
        addVillageResource(world, st.islandId, "meat", 0.4);
      } else if (st.kind === "pig") {
        addVillageResource(world, st.islandId, "meat", 1.5);
      } else {
        addVillageResource(world, st.islandId, "meat", 1);
      }
      syncCombinedFood(world);
    }
  }
}
function tickWildHerdsAndHunting(world, dt, particles) {
  for (let i = world.wildHerds.length - 1; i >= 0; i--) {
    const h = world.wildHerds[i];
    if (h.hp <= 0) {
      world.wildHerds.splice(i, 1);
      continue;
    }
    const attacker = world.villagers.find(
      (v) => (v.activeTask === "hunt" || v.state === "hunting") && v.islandId === h.islandId && Math.hypot(v.x - h.x, v.y - h.y) < (v.weaponType === "bow" ? 42 : 20)
    );
    if (attacker && attacker.attackCooldown <= 0) {
      const baseDmg = attacker.weaponType === "iron_blade" ? 28 : attacker.weaponType === "bronze_blade" ? 22 : attacker.weaponType === "bow" ? 18 : attacker.weaponType === "flint_spear" ? 14 : 7;
      const atkStats = getTraitStats(attacker);
      const techMods = getTechModifiers(world.unlockedTechIds);
      const skillBonus = attacker.weaponType === "bow" ? getSkillLevel(attacker, "archery") * 1.8 : getSkillLevel(attacker, "blade_mastery") * 1.6;
      const dmg = Math.round((baseDmg + skillBonus + (attacker.stats?.strength ?? 8) * 0.4) * atkStats.attackPowerMult * techMods.attackMult);
      if (attacker.weaponType === "bow") {
        spawnProjectile(world, "arrow", attacker.islandId, attacker.x, attacker.y, h.islandId, h.x, h.y);
        gainSkillXp(world, attacker, "archery", 2.2);
      } else {
        gainSkillXp(world, attacker, "blade_mastery", 2.2);
      }
      h.hp -= dmg;
      attacker.attackCooldown = 1.35;
      grantKnowledge(world, 0.8, particles);
      if (h.hp <= 0) {
        const meatGain = h.kind === "boar" ? 7 : h.kind === "deer" ? 5 : 2;
        const hideGain = h.kind === "boar" ? 3 : h.kind === "deer" ? 2 : 1;
        const creditIsle = attacker.homeIslandId ?? attacker.islandId;
        addVillageResource(world, creditIsle, "meat", meatGain);
        addVillageResource(world, creditIsle, "hides", hideGain);
        syncCombinedFood(world);
        attacker.killCount += 1;
        attacker.thoughtBubble = `Hunted ${h.kind}!`;
        attacker.thoughtTimer = 3;
        world.wildHerds.splice(i, 1);
        continue;
      }
      if (h.kind === "boar") {
        h.aggroTargetId = attacker.id;
      } else {
        const dx = h.x - attacker.x;
        const dy = h.y - attacker.y;
        const d = Math.hypot(dx, dy) || 1;
        h.targetX = h.x + dx / d * 65;
        h.targetY = h.y + dy / d * 45;
        h.pauseTimer = 0;
      }
    }
    if (!h.stuckState) {
      h.stuckState = { lastX: h.x, lastY: h.y, timer: 0, detourSign: 1 };
    }
    ensureWildAnimalState(h);
    if (h.kind === "boar" && h.aggroTargetId) {
      const preyV = world.villagers.find((v) => v.id === h.aggroTargetId && v.islandId === h.islandId);
      if (!preyV) {
        h.aggroTargetId = null;
        h.behaviorState = "wandering";
      } else {
        h.behaviorState = "fighting";
        const d = Math.hypot(preyV.x - h.x, preyV.y - h.y);
        if (d < 16) {
          if (Math.random() < dt * 0.9) {
            const died = applyCombatStrike(world, null, preyV, 14, 0.36, "boar", particles);
            if (!died && !preyV.thoughtBubble) {
              preyV.thoughtBubble = "Boar gored me!";
              preyV.thoughtTimer = 2.6;
            }
            if (died) {
              h.aggroTargetId = null;
              h.behaviorState = "wandering";
            }
          }
        } else if (d < 95) {
          const step = steerEntity(world, h.islandId, h.x, h.y, preyV.x, preyV.y, 24 * dt, false, h.stuckState, dt, h.id);
          if (classifyMainWorldTerrain(world, step.x, step.y) !== "deep_water") {
            h.x = step.x;
            h.y = step.y;
            h.facing = step.facing;
          }
          if (step.wasStuckReset) {
            h.aggroTargetId = null;
            h.behaviorState = "wandering";
          }
          continue;
        } else {
          h.aggroTargetId = null;
          h.behaviorState = "wandering";
        }
      }
    }
    stepWildAnimalBehavior(
      world,
      h,
      dt,
      (w, islId, x, y, tx, ty, stepDist, stuck, dtSec, id) => steerEntity(w, islId, x, y, tx, ty, stepDist, false, stuck, dtSec, id)
    );
  }
}
function spawnProjectile(world, kind, fromIsland, fromX, fromY, toIsland, toX, toY) {
  if (world.projectiles.length >= 24) world.projectiles.shift();
  world.projectiles.push({
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    fromX,
    fromY,
    fromElev: ISLAND_DEFS[fromIsland].elevationY + 2.5,
    toX,
    toY,
    toElev: ISLAND_DEFS[toIsland].elevationY + 1.4,
    progress: 0,
    duration: 0.45
  });
}
function tickProjectiles(world, dt) {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const p = world.projectiles[i];
    p.progress += dt / Math.max(0.15, p.duration);
    if (p.progress >= 1) {
      world.projectiles.splice(i, 1);
    }
  }
}
function tickCableways(world, dt, particles) {
  for (const cb of world.cableways) {
    if (!cb.built) continue;
    cb.gondolaT += cb.gondolaDir * dt * 0.14;
    if (cb.gondolaT >= 1) {
      cb.gondolaT = 1;
      cb.gondolaDir = -1;
      for (const pid of [...cb.passengerIds]) {
        const pv = world.villagers.find((v) => v.id === pid);
        if (pv) {
          pv.transitCableId = null;
          pv.islandId = cb.toIsland;
          pv.x = cb.x2;
          pv.y = cb.y2;
          pv.targetX = ISLAND_DEFS[cb.toIsland].centerX;
          pv.targetY = ISLAND_DEFS[cb.toIsland].centerY;
          pv.state = "exploring";
          discoverIsland(world, cb.toIsland, pv.name.split(" ")[0]);
        }
      }
      cb.passengerIds = [];
    } else if (cb.gondolaT <= 0) {
      cb.gondolaT = 0;
      cb.gondolaDir = 1;
      for (const pid of [...cb.passengerIds]) {
        const pv = world.villagers.find((v) => v.id === pid);
        if (pv) {
          pv.transitCableId = null;
          pv.islandId = cb.fromIsland;
          pv.x = cb.x1;
          pv.y = cb.y1;
          pv.targetX = ISLAND_DEFS[cb.fromIsland].centerX;
          pv.targetY = ISLAND_DEFS[cb.fromIsland].centerY;
          pv.state = "exploring";
          discoverIsland(world, cb.fromIsland, pv.name.split(" ")[0]);
        }
      }
      cb.passengerIds = [];
    }
    const gx = cb.x1 + (cb.x2 - cb.x1) * cb.gondolaT;
    const gy = cb.y1 + (cb.y2 - cb.y1) * cb.gondolaT;
    for (const pid of cb.passengerIds) {
      const pv = world.villagers.find((v) => v.id === pid);
      if (pv) {
        pv.x = gx;
        pv.y = gy;
        pv.state = "gondola";
      }
    }
    if (cb.passengerIds.length < 2 && (cb.gondolaT <= 0.06 || cb.gondolaT >= 0.94)) {
      const atFirst = cb.gondolaT <= 0.06;
      const stationIsland = atFirst ? cb.fromIsland : cb.toIsland;
      const destIsland = atFirst ? cb.toIsland : cb.fromIsland;
      const sx = atFirst ? cb.x1 : cb.x2;
      const sy = atFirst ? cb.y1 : cb.y2;
      const rider = world.villagers.find(
        (v) => v.islandId === stationIsland && !v.voyageBoatId && !v.transitGliderId && !v.transitCableId && canVillagerWork(world, v) && Math.hypot(v.x - sx, v.y - sy) < 62 && (v.activeTask === "explore" || !world.islands[destIsland].discovered || Math.random() < 0.35)
      );
      if (rider) {
        cb.passengerIds.push(rider.id);
        rider.transitCableId = cb.id;
        rider.state = "gondola";
        rider.thoughtBubble = `Gondola to ${ISLAND_DEFS[destIsland].name.split(" ")[0]}!`;
        rider.thoughtTimer = 3.2;
        grantKnowledge(world, 0.8, particles);
      }
    }
  }
}
function tickGliders(world, dt, particles, emitVisualParticles) {
  for (let i = world.gliders.length - 1; i >= 0; i--) {
    const g = world.gliders[i];
    g.progress += dt * 0.16;
    const t = Math.min(1, g.progress);
    g.x = g.startX + (g.endX - g.startX) * t;
    g.y = g.startY + (g.endY - g.startY) * t;
    g.altitudeBoost = Math.sin(t * Math.PI) * 9.5;
    g.yaw = Math.atan2(-(g.endY - g.startY), g.endX - g.startX);
    const pilot = world.villagers.find((v) => v.id === g.villagerId);
    if (pilot) {
      pilot.x = g.x;
      pilot.y = g.y;
      pilot.state = "gliding";
    }
    if (emitVisualParticles && Math.random() < dt * 2.5) {
      spawnParticle(particles, {
        kind: "leaf",
        x: g.x,
        y: g.y,
        vx: (Math.random() - 0.5) * 6,
        vy: 6,
        maxLife: 0.7,
        size: 1.6,
        alpha: 0.5,
        phase: 0,
        color: "#E0F2FE"
      });
    }
    if (t >= 1) {
      if (pilot) {
        pilot.transitGliderId = null;
        pilot.islandId = g.toIsland;
        pilot.x = g.endX;
        pilot.y = g.endY;
        pilot.targetX = ISLAND_DEFS[g.toIsland].centerX;
        pilot.targetY = ISLAND_DEFS[g.toIsland].centerY;
        pilot.state = "exploring";
        pilot.thoughtBubble = "Touched down!";
        pilot.thoughtTimer = 3.2;
        discoverIsland(world, g.toIsland, pilot.name.split(" ")[0]);
        grantKnowledge(world, 3, particles);
      }
      world.gliders.splice(i, 1);
    }
  }
  if (world.gliders.length < 3 && getTechUnlocked2(world, "wind_gliders")) {
    for (const pad of world.buildings) {
      if (!pad.unlocked || pad.type !== "glider_pad") continue;
      const launcher = world.villagers.find(
        (v) => v.islandId === pad.islandId && !v.voyageBoatId && !v.transitGliderId && !v.transitCableId && canVillagerWork(world, v) && (v.activeTask === "explore" || v.curiosity > 0.62) && Math.hypot(v.x - pad.x, v.y - pad.y) < 55
      );
      if (!launcher) continue;
      const candidates = ISLAND_ORDER.filter((id) => id !== pad.islandId);
      const undisc = candidates.filter((id) => !world.islands[id].discovered);
      const pool = undisc.length > 0 ? undisc : candidates;
      const destId = pool[Math.floor(Math.random() * pool.length)];
      if (!destId) continue;
      const destDef = ISLAND_DEFS[destId];
      const gliderId = `glider_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      world.gliders.push({
        id: gliderId,
        villagerId: launcher.id,
        fromIsland: pad.islandId,
        toIsland: destId,
        startX: pad.x,
        startY: pad.y,
        endX: destDef.centerX + (Math.random() * 80 - 40),
        endY: destDef.centerY + (Math.random() * 60 - 30),
        progress: 0,
        x: pad.x,
        y: pad.y,
        altitudeBoost: 0,
        yaw: Math.atan2(-(destDef.centerY - pad.y), destDef.centerX - pad.x),
        wingColor: CULTURES[launcher.cultureId]?.sailColor ?? "#FAF6EE"
      });
      launcher.transitGliderId = gliderId;
      launcher.state = "gliding";
      launcher.thoughtBubble = `Gliding to ${destDef.name.split(" ")[0]}!`;
      launcher.thoughtTimer = 3.5;
      addChronicle(
        world,
        `${launcher.name.split(" ")[0]} launched a Wind-Glider from ${ISLAND_DEFS[pad.islandId].name} toward ${destDef.name}!`,
        "voyage"
      );
      break;
    }
  }
}
function tickExploreRuins(world, dt, particles) {
  for (const ruin of world.exploreRuins) {
    if (ruin.cooldownTimer > 0) {
      ruin.cooldownTimer = Math.max(0, ruin.cooldownTimer - dt);
      continue;
    }
    const explorer = world.villagers.find(
      (v) => v.islandId === ruin.islandId && canVillagerWork(world, v) && Math.hypot(v.x - ruin.x, v.y - ruin.y) < 38
    );
    if (!explorer) continue;
    ruin.exploredCount += 1;
    ruin.cooldownTimer = 95;
    discoverIsland(world, ruin.islandId, explorer.name.split(" ")[0]);
    learnConcept(world, explorer, "ruin", particles);
    grantKnowledge(world, 10, particles, explorer);
    const creditIsle = explorer.homeIslandId ?? explorer.islandId;
    addVillageResource(world, creditIsle, "hearthlight", 8);
    if (ruin.kind === "sun_obelisk") {
      addVillageResource(world, creditIsle, "grain", 12);
      world.comforts.honey = Math.min(25, world.comforts.honey + 3);
    } else if (ruin.kind === "star_observatory") {
      addVillageResource(world, creditIsle, "herbs", 10);
      addVillageResource(world, creditIsle, "hearthlight", 6);
    } else if (ruin.kind === "cedar_totem") {
      addVillageResource(world, creditIsle, "timber", 14);
      world.comforts.tea = Math.min(25, world.comforts.tea + 3);
    } else if (ruin.kind === "frost_shrine") {
      addVillageResource(world, creditIsle, "iron", 8);
      addVillageResource(world, creditIsle, "copper", 8);
    } else if (ruin.kind === "ashen_vault") {
      addVillageResource(world, creditIsle, "iron", 16);
      addVillageResource(world, creditIsle, "bronze", 10);
    }
    syncCombinedFood(world);
    explorer.thoughtBubble = "Ancient relic!";
    explorer.thoughtTimer = 4;
    advanceKnowledge(explorer, "sailing", 4.5);
    recordNpcMemory(explorer, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: "discovery",
      summary: `Explored ${ruin.name} on ${ISLAND_DEFS[ruin.islandId].name}.`,
      actorIds: [],
      importance: 8,
      sentiment: "positive"
    });
    addChronicle(
      world,
      `${explorer.name.split(" ")[0]} explored ${ruin.name} on ${ISLAND_DEFS[ruin.islandId].name} (${ruin.lootLabel})!`,
      "voyage"
    );
    if (ruin.guardianThreat && world.raiders.filter((r) => r.islandId === ruin.islandId).length === 0) {
      world.raiders.push({
        ...makeNativeClanVillager(
          `ruin_guard_${Date.now()}`,
          "Stone-Sentinel",
          ruin.islandId,
          "ashen_raider",
          "#5C4D4A",
          "#252020",
          "#C29B7B",
          0,
          0,
          "guard"
        ),
        isNativeClan: false,
        isStranger: true,
        x: ruin.x + 22,
        y: ruin.y + 18,
        targetX: explorer.x,
        targetY: explorer.y,
        hp: 75,
        maxHp: 75,
        gearTier: 3,
        weaponType: "bronze_blade",
        state: "fighting",
        autonomyReason: `Defending ${ruin.name}.`
      });
    }
  }
}
function tickDiplomacyAndWar(world, dt, particles) {
  const mist = world.diplomacy.mist_mariner;
  if (mist.status !== "unknown") {
    if (mist.trust >= 65) mist.status = "peaceful";
    else if (mist.trust >= 34) mist.status = "wary";
    else if (mist.trust >= 16) mist.status = "tense";
    else mist.status = "war";
    if (mist.status === "wary" && Math.random() < dt * 0.012) {
      mist.trust = Math.max(0, mist.trust - 1);
    }
    if (mist.status === "war") {
      mist.raidTimer -= dt;
      if (mist.raidTimer <= 0 && world.raiders.length < 5 && world.villagers.length > 0) {
        mist.raidTimer = 55;
        const galley = world.boats.find((b) => b.cultureId === "mist_mariner" && b.kind === "war_galley");
        const targetIsle = world.islands.sunterrace.discovered ? "sunterrace" : "cradle";
        if (!galley) {
          world.boats.push({
            id: `boat_mist_war_${Date.now()}`,
            name: "Mist-Clan Longship",
            kind: "war_galley",
            cultureId: "mist_mariner",
            homeIslandId: "mistatoll",
            targetIslandId: targetIsle,
            x: ISLAND_DEFS.mistatoll.dockSpot.seaX,
            y: ISLAND_DEFS.mistatoll.dockSpot.seaY,
            targetX: ISLAND_DEFS[targetIsle].dockSpot.seaX,
            targetY: ISLAND_DEFS[targetIsle].dockSpot.seaY,
            yaw: Math.PI,
            hp: 200,
            maxHp: 200,
            state: "raiding",
            cargoText: "Boarding Crew",
            passengerIds: [],
            tripTimer: 6
          });
        } else if (galley.state === "docked") {
          galley.state = "raiding";
          galley.targetIslandId = targetIsle;
          galley.targetX = ISLAND_DEFS[targetIsle].dockSpot.seaX;
          galley.targetY = ISLAND_DEFS[targetIsle].dockSpot.seaY;
          galley.tripTimer = 6;
        }
      }
    }
  }
  for (let ri = world.raiders.length - 1; ri >= 0; ri--) {
    const r = world.raiders[ri];
    if (r.hp <= 0) {
      world.raiders.splice(ri, 1);
      continue;
    }
    const techMods = getTechModifiers(world.unlockedTechIds);
    for (const tw of world.buildings) {
      if (tw.type === "watchtower" && tw.unlocked && tw.islandId === r.islandId && tw.cultureId !== "ashen_raider" && Math.hypot(tw.x - r.x, tw.y - r.y) < 135) {
        r.hp -= dt * (6.5 + tw.level * 3) * techMods.attackMult;
        if (Math.random() < dt * 1.1) {
          spawnProjectile(world, "arrow", tw.islandId, tw.x, tw.y, r.islandId, r.x, r.y);
        }
      }
    }
    if (r.islandId === "embervault") {
      const intruder = world.villagers.find((v) => v.islandId === "embervault");
      const bastTower = world.buildings.find((b) => b.id === "ember_watchtower" && b.unlocked);
      if (intruder && bastTower && Math.random() < dt * 0.55 && Math.hypot(bastTower.x - intruder.x, bastTower.y - intruder.y) < 170) {
        spawnProjectile(world, "ember_bolt", "embervault", bastTower.x, bastTower.y, "embervault", intruder.x, intruder.y);
        applyCombatStrike(world, null, intruder, 8, 0.25, "combat", particles);
      }
    }
    const targetV = world.villagers.filter((v) => v.islandId === r.islandId && v.lifeStage !== "infant").sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0];
    if (!r.stuckState) {
      r.stuckState = { lastX: r.x, lastY: r.y, timer: 0, detourSign: 1 };
    }
    if (targetV) {
      const dist = Math.hypot(targetV.x - r.x, targetV.y - r.y);
      const attackRange = targetV.weaponType === "bow" ? 28 : 15;
      if (dist > 14) {
        const step = steerEntity(world, r.islandId, r.x, r.y, targetV.x, targetV.y, 23 * dt, false, r.stuckState, dt, r.id);
        r.x = step.x;
        r.y = step.y;
        r.islandId = step.islandId;
        r.facing = step.facing;
      }
      if (dist <= 15 && r.attackCooldown <= 0) {
        r.attackCooldown = 1.6;
        const rDmg = 11 + (r.stats?.strength ?? 8) * 0.45;
        applyCombatStrike(world, r, targetV, rDmg, 0.36, "combat", particles);
      }
      if (dist <= attackRange && targetV.hp > 0 && targetV.attackCooldown <= 0) {
        targetV.attackCooldown = 1.3;
        if (targetV.weaponType === "bow") {
          spawnProjectile(world, "arrow", targetV.islandId, targetV.x, targetV.y, r.islandId, r.x, r.y);
          gainSkillXp(world, targetV, "archery", 2.4);
        } else {
          gainSkillXp(world, targetV, "blade_mastery", 2.4);
        }
        gainSkillXp(world, targetV, "tactics", 1.2);
        const baseVDmg = targetV.weaponType === "iron_blade" ? 26 : targetV.weaponType === "bronze_blade" ? 20 : targetV.weaponType === "bow" ? 16 : targetV.weaponType === "flint_spear" ? 13 : 7;
        const tStats = getTraitStats(targetV);
        const skillDmg = targetV.weaponType === "bow" ? getSkillLevel(targetV, "archery") * 1.8 : getSkillLevel(targetV, "blade_mastery") * 1.8;
        const finalDmg = (baseVDmg + skillDmg + (targetV.stats?.strength ?? 8) * 0.4) * tStats.attackPowerMult * techMods.attackMult;
        applyCombatStrike(world, targetV, r, finalDmg, 0.28, "combat", particles);
        if (r.hp <= 0) {
          targetV.killCount += 1;
        }
      }
    } else if (world.gameMode === "shared_siege" && r.islandId !== "cradle") {
      const cradle = ISLAND_DEFS.cradle;
      const step = steerEntity(world, r.islandId, r.x, r.y, cradle.centerX, cradle.centerY, 24 * dt, false, r.stuckState, dt, r.id);
      r.x = step.x;
      r.y = step.y;
      r.islandId = step.islandId;
      r.facing = step.facing;
    } else if (r.islandId === "embervault") {
      const d = Math.hypot(r.targetX - r.x, r.targetY - r.y);
      if (d < 10) {
        const ev = ISLAND_DEFS.embervault;
        r.targetX = ev.centerX + (Math.random() * 240 - 120);
        r.targetY = ev.centerY + (Math.random() * 180 - 90);
      } else {
        const step = steerEntity(world, "embervault", r.x, r.y, r.targetX, r.targetY, 18 * dt, false, r.stuckState, dt, r.id);
        r.x = step.x;
        r.y = step.y;
        r.facing = step.facing;
        if (step.wasStuckReset || step.hitWaterEdge) {
          const ev = ISLAND_DEFS.embervault;
          r.targetX = ev.centerX + (Math.random() * 200 - 100);
          r.targetY = ev.centerY + (Math.random() * 160 - 80);
        }
      }
    }
    if (r.attackCooldown > 0) r.attackCooldown -= dt;
    if (r.hp <= 0) {
      const homeSpoilsIsle = world.localHomeIslandId ?? "cradle";
      if (world.gameMode === "shared_siege") {
        world.siege.totalKills += 1;
        addVillageResource(world, "cradle", "timber", 2);
        addVillageResource(world, "cradle", "stone", 1);
        addVillageResource(world, "cradle", "iron", 1);
        addVillageResource(world, "cradle", "hearthlight", 2);
        addChronicle(world, `Defenders felled ${r.name} (+Siege spoils)!`, "war");
      } else if (r.islandId === "embervault") {
        addVillageResource(world, homeSpoilsIsle, "iron", 12);
        addVillageResource(world, homeSpoilsIsle, "hearthlight", 6);
        addChronicle(world, `Vanguard defeated ${r.name} at Ashen Bastion (+12 Iron spoils)!`, "war");
      } else {
        addChronicle(world, `Island defenders repelled ${r.name} on ${ISLAND_DEFS[r.islandId].name}.`, "war");
      }
      world.raiders.splice(ri, 1);
    }
  }
}
function evaluateVillageTrajectory(world) {
  if (world.villagers.length === 0) {
    world.prosperityScore = 0;
    world.villageTrajectory = "ruined";
    world.trajectoryReasons = ["All inhabitants were lost."];
    return;
  }
  const avgMood = world.villagers.reduce((s, v) => s + v.mood, 0) / world.villagers.length;
  const avgHp = world.villagers.reduce((s, v) => s + v.hp, 0) / world.villagers.length;
  const avgHunger = world.villagers.reduce((s, v) => s + v.hunger, 0) / world.villagers.length;
  const avgWarmth = world.villagers.reduce((s, v) => s + v.warmth, 0) / world.villagers.length;
  let score = Math.round(avgMood * 0.28 + avgHp * 0.24 + avgHunger * 0.22 + avgWarmth * 0.16 + Math.min(10, world.unlockedTechIds.length * 0.7));
  const reasons = [];
  const homeId = world.localHomeIslandId ?? "cradle";
  const homePop = Math.max(1, world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === homeId).length);
  if (getVillageRes(world, homeId).food < homePop * 2) {
    score -= 14;
    reasons.push("Food stores running critically low.");
  }
  if (world.environment.season === "winter" && !hasBuildingType2(world, "bonfire")) {
    score -= 18;
    reasons.push("Winter frost threatens unheated villagers!");
  }
  if (world.diplomacy.mist_mariner.status === "war") {
    score -= 10;
    reasons.push("At war with the Mist Mariners.");
  }
  if (reasons.length === 0) {
    reasons.push(
      world.unlockedTechIds.length >= 6 ? "Thriving archipelago trade, farms & hearths." : "Founders finding their footing beside the embers."
    );
  }
  world.prosperityScore = Math.max(0, Math.min(100, score));
  world.trajectoryReasons = reasons;
  world.villageTrajectory = world.prosperityScore >= 72 ? "flourishing" : world.prosperityScore >= 48 ? "steady" : world.prosperityScore >= 26 ? "strained" : "ruin_risk";
}
function evaluateEra(world) {
  const techs = world.unlockedTechIds.length;
  const discoveredCount = Object.values(world.islands).filter((i) => i.discovered).length;
  let era = 1;
  if (techs >= 3 && hasBuildingType2(world, "cottage")) era = 2;
  if (techs >= 7 && (discoveredCount >= 3 || hasBuildingType2(world, "dock"))) era = 3;
  if (techs >= 12 && (hasBuildingType2(world, "barracks") || hasBuildingType2(world, "smeltery"))) era = 4;
  if (era > world.era) {
    world.era = era;
    addChronicle(world, `Archipelago advanced to ${ERA_LABELS[era].name}!`, "era");
  }
}
function unlockCustomForIsland(world, culture, customId) {
  if (culture.customs.includes(customId)) return;
  culture.customs.push(customId);
  culture.traditionLevel = culture.customs.length;
  const islName = ISLAND_DEFS[culture.islandId].name;
  const meta = VILLAGE_CUSTOM_META[customId];
  if (culture.islandId === "cradle") {
    if (culture.traditionLevel >= 4) {
      culture.ethosTitle = "Hearthlight Chroniclers";
      culture.motto = "Kindred around nightly embers sharing loaf, story, and starlight.";
    } else if (culture.traditionLevel >= 2) {
      culture.ethosTitle = "Kindred Ember Circle";
      culture.motto = "Bonded each twilight beside crackling stones and open sky.";
    } else {
      culture.ethosTitle = "Ember-Bound Folk";
      culture.motto = "Learning together beside their first warm hearth.";
    }
  } else if (culture.islandId === "sunterrace") {
    culture.ethosTitle = culture.traditionLevel >= 2 ? "Terrace Harvest Keepers" : "Sun-Loam Settlers";
    culture.motto = "Stepped terraces singing with orchards, grain, and evening songs.";
  }
  addChronicle(world, `${islName} birthed a new cultural tradition: ${meta.name}! (${meta.bonusLabel})`, "bond");
}
function tickVillageCulturesAndBonfireRituals(world, dt, particles, emitVisualParticles) {
  const t = world.environment.timeOfDay;
  const isDuskRitual = t >= 0.72 && t <= 0.89;
  const allFolks = [...world.villagers, ...world.clanVillagers];
  for (const islandId of ISLAND_ORDER) {
    const culture = world.villageCultures[islandId];
    const fire = world.buildings.find((b) => b.islandId === islandId && b.type === "bonfire" && b.unlocked);
    if (!culture || !fire) continue;
    const gathered = allFolks.filter(
      (v) => v.islandId === islandId && Math.hypot(v.x - fire.x, v.y - fire.y) < 92
    );
    if (isDuskRitual && gathered.length >= 2) {
      culture.ritualPoints += dt * (1.2 + gathered.length * 0.45);
      for (const member of gathered) {
        member.mood = Math.min(100, member.mood + dt * 2.2);
        member.warmth = Math.min(100, member.warmth + dt * 5);
        if (emitVisualParticles && Math.random() < dt * 0.35) {
          spawnParticle(particles, {
            kind: "firefly",
            x: fire.x + (Math.random() * 48 - 24),
            y: fire.y - 8 + (Math.random() * 24 - 12),
            vx: (Math.random() - 0.5) * 6,
            vy: -8 - Math.random() * 6,
            maxLife: 1.4,
            size: 2,
            alpha: 0.9,
            phase: Math.random() * 6,
            color: "#FDE68A"
          });
        }
      }
      if (culture.lastRitualDay !== world.environment.dayCount) {
        culture.lastRitualDay = world.environment.dayCount;
        culture.nightlyGatherings += 1;
        for (let i = 0; i < gathered.length; i++) {
          const a = gathered[i];
          if (a.thoughtTimer <= 0) {
            a.thoughtBubble = "Evening fire!";
            a.thoughtTimer = 3.2;
          }
        }
        processBonfireSocialCircle(world, islandId, gathered);
        grantKnowledge(world, 1.8, particles);
      }
      if (culture.nightlyGatherings >= 1) {
        unlockCustomForIsland(world, culture, "nightly_hearth_circle");
      }
      if (culture.nightlyGatherings >= 2 || culture.ritualPoints >= 28) {
        unlockCustomForIsland(world, culture, "ember_storytelling");
      }
      if (hasBuildingType2(world, "farm_plot", islandId) || hasBuildingType2(world, "bakery", islandId)) {
        unlockCustomForIsland(world, culture, "harvest_feast_table");
      }
      if (hasBuildingType2(world, "pasture", islandId)) {
        unlockCustomForIsland(world, culture, "pasture_shepherd_tune");
      }
      if (hasBuildingType2(world, "smeltery", islandId) || hasBuildingType2(world, "quarry", islandId)) {
        unlockCustomForIsland(world, culture, "forge_drum_rhythm");
      }
      if (hasBuildingType2(world, "dock", islandId) && culture.nightlyGatherings >= 2) {
        unlockCustomForIsland(world, culture, "sea_lantern_vigil");
      }
      if (gathered.some((g) => g.cognition.observedConcepts.includes("horizon")) && culture.ritualPoints >= 22) {
        unlockCustomForIsland(world, culture, "cliff_lookout_chant");
      }
      if (gathered.some((g) => g.cognition.observedConcepts.includes("berry_bush")) && culture.ritualPoints >= 16) {
        unlockCustomForIsland(world, culture, "dawn_forage_song");
      }
    }
  }
}
function tickClanVillagers(world, dt) {
  const t = world.environment.timeOfDay;
  const isDuskRitual = t >= 0.72 && t <= 0.89;
  const isNight = t < 0.21 || t > 0.89;
  for (const cv of world.clanVillagers) {
    cv.animPhase += dt * (cv.state === "walking" ? 6.2 : 2.5);
    if (cv.edgeAckCooldown && cv.edgeAckCooldown > 0) cv.edgeAckCooldown = Math.max(0, cv.edgeAckCooldown - dt);
    if (cv.thoughtTimer > 0) {
      cv.thoughtTimer -= dt;
      if (cv.thoughtTimer <= 0) cv.thoughtBubble = null;
    }
    if (!cv.stuckState) {
      cv.stuckState = { lastX: cv.x, lastY: cv.y, timer: 0, detourSign: 1 };
    }
    const isl = ISLAND_DEFS[cv.islandId];
    const fire = world.buildings.find((b) => b.islandId === cv.islandId && b.type === "bonfire" && b.unlocked);
    const aiHomeId = cv.homeIslandId ?? cv.islandId;
    const aiRes = getVillageRes(world, aiHomeId);
    cv.decisionCooldown -= dt;
    if (cv.decisionCooldown <= 0) {
      cv.decisionCooldown = 4.5 + Math.random() * 5.5;
      if (isDuskRitual && fire) {
        const ang = (cv.animPhase + cv.x * 0.02) % (Math.PI * 2);
        cv.state = "socializing";
        cv.targetX = fire.x + Math.cos(ang) * 52;
        cv.targetY = fire.y + Math.sin(ang) * 42;
        cv.autonomyReason = `Sitting around ${fire.name} for nightly ${CULTURES[cv.cultureId].name} songs.`;
        if (Math.random() < 0.35 && !cv.thoughtBubble) {
          cv.thoughtBubble = "Firelight song!";
          cv.thoughtTimer = 3;
        }
      } else if (isNight && fire) {
        cv.state = "sleeping";
        cv.targetX = fire.x + (Math.random() * 54 - 27);
        cv.targetY = fire.y + (Math.random() * 44 - 22);
      } else {
        cv.state = "walking";
        if (aiRes.food < 12) {
          const berry = world.wildNodes.find((n) => n.islandId === cv.islandId && n.kind === "berry_bush" && n.amount > 0.2);
          cv.targetX = berry ? berry.x : isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.56);
          cv.targetY = berry ? berry.y : isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.54);
          cv.autonomyReason = `Foraging food for ${isl.name}.`;
        } else {
          cv.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.56);
          cv.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.54);
          cv.autonomyReason = `Tending ${CULTURES[cv.cultureId].name} village life on ${isl.name}.`;
        }
      }
    }
    const d = Math.hypot(cv.targetX - cv.x, cv.targetY - cv.y);
    if (d > 8) {
      const step = steerEntity(world, cv.islandId, cv.x, cv.y, cv.targetX, cv.targetY, 26 * dt, false, cv.stuckState, dt, cv.id);
      cv.x = step.x;
      cv.y = step.y;
      cv.facing = step.facing;
      if ((step.hitEdge || step.hitWaterEdge || step.wasStuckReset) && (!cv.edgeAckCooldown || cv.edgeAckCooldown <= 0)) {
        cv.edgeAckCooldown = 2.5;
        if (step.hitEdge) {
          cv.thoughtBubble = "High cliff!";
          cv.thoughtTimer = 2;
        }
        cv.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.45);
        cv.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.45);
      }
    } else if (cv.state === "walking") {
      cv.state = "working";
    }
    if (cv.state === "working" && aiHomeId === cv.islandId) {
      if (aiRes.food < 14) {
        addVillageResource(world, aiHomeId, "berries", 0.18 * dt);
      } else {
        addVillageResource(world, aiHomeId, "timber", 0.16 * dt);
        addVillageResource(world, aiHomeId, "stone", 0.12 * dt);
        if (hasBuildingType2(world, "farm_plot", aiHomeId)) {
          addVillageResource(world, aiHomeId, "grain", 0.14 * dt);
        }
      }
    }
  }
}
function tickSkillTeaching(world, dt, particles) {
  const techMods = getTechModifiers(world.unlockedTechIds);
  const allStudents = world.villagers;
  for (const teacher of world.villagers) {
    if (teacher.teachCooldown && teacher.teachCooldown > 0) {
      teacher.teachCooldown = Math.max(0, teacher.teachCooldown - dt);
    }
    if (teacher.lifeStage === "infant" || teacher.lifeStage === "child") continue;
    if (teacher.teachCooldown && teacher.teachCooldown > 0) continue;
    if (teacher.voyageBoatId || teacher.transitGliderId || teacher.transitCableId) continue;
    let bestSkill = null;
    let bestLv = 0;
    for (const sid of ALL_SKILL_IDS) {
      const lv = getSkillLevel(teacher, sid);
      if (lv > bestLv) {
        bestLv = lv;
        bestSkill = sid;
      }
    }
    if (!bestSkill || bestLv < 1) continue;
    const student = allStudents.find(
      (s) => s.id !== teacher.id && s.islandId === teacher.islandId && s.lifeStage !== "infant" && getSkillLevel(s, bestSkill) < bestLv && Math.hypot(s.x - teacher.x, s.y - teacher.y) < 58
    );
    if (!student) continue;
    const teacherStats = getTraitStats(teacher);
    const prevLv = getSkillLevel(student, bestSkill);
    const xpGain = 15 * techMods.teachRateMult * teacherStats.teachRateMult;
    gainSkillXp(world, student, bestSkill, xpGain);
    teacher.teachCooldown = 14;
    if (!teacher.thoughtBubble) {
      teacher.thoughtBubble = `Taught ${SKILL_META[bestSkill].label}!`;
      teacher.thoughtTimer = 2.6;
    }
    if (getSkillLevel(student, bestSkill) > prevLv) {
      recordPositiveContribution(world, teacher, "teach", student, 3);
      addChronicle(
        world,
        `${teacher.name.split(" ")[0]} mentored ${student.name.split(" ")[0]} in ${SKILL_META[bestSkill].label}!`,
        "tech"
      );
    }
    spawnParticle(particles, {
      kind: "sparkle",
      x: student.x,
      y: student.y - 11,
      vx: 0,
      vy: -9,
      maxLife: 0.9,
      size: 2,
      alpha: 0.9,
      phase: 0,
      color: "#93C5FD"
    });
  }
}
function tickAutonomousAiVillages(world, dt) {
  if (Math.random() > dt * 0.08) return;
  const aiIslands = ["timbercrown", "coppercrag", "sunterrace", "starbloom", "mistatoll"];
  for (const islandId of aiIslands) {
    if (world.islandOwners?.[islandId]) continue;
    if (world.villagers.some((v) => v.homeIslandId === islandId)) continue;
    const locals = world.clanVillagers.filter((cv) => (cv.homeIslandId ?? cv.islandId) === islandId);
    if (locals.length === 0) continue;
    const res = getVillageRes(world, islandId);
    const pop = locals.length;
    const beds = getHousingBedsForIsland(world, islandId);
    const hasType = (t) => world.buildings.some((b) => b.islandId === islandId && b.type === t && b.unlocked);
    const countType = (t) => world.buildings.filter((b) => b.islandId === islandId && b.type === t && b.unlocked).length;
    if (res.food >= pop * 0.6 && Math.random() < 0.25) {
      consumeFoodUnits(world, islandId, Math.max(0.5, pop * 0.3));
    }
    let nextType = null;
    if (!hasType("bonfire")) {
      nextType = "bonfire";
    } else if (res.food < Math.max(10, pop * 6) && countType("farm_plot") < 2) {
      nextType = "farm_plot";
    } else if (villageNeedsHousing(pop, beds) || countType("lean_to") + countType("cottage") === 0) {
      nextType = countType("lean_to") === 0 && res.stone < 8 ? "lean_to" : "cottage";
    } else if (islandId === "timbercrown") {
      if (!hasType("woodshop")) nextType = "woodshop";
      else if (!hasType("watchtower")) nextType = "watchtower";
    } else if (islandId === "coppercrag") {
      if (!hasType("quarry")) nextType = "quarry";
      else if (!hasType("smeltery")) nextType = "smeltery";
    } else if (islandId === "mistatoll") {
      if (!hasType("dock")) nextType = "dock";
    } else {
      if (!hasType("farm_plot")) nextType = "farm_plot";
      else if (!hasType("library")) nextType = "library";
    }
    if (nextType) {
      const bp = BUILDING_BLUEPRINTS[nextType];
      const cost = getBuildCost(bp);
      if (hasResourcesFor(res, cost)) {
        const site = findValidSiteOnIsland(world, islandId);
        if (site) {
          spendVillageResources(world, islandId, cost);
          const cultureId = world.islands[islandId]?.owningCultureId ?? ISLAND_DEFS[islandId].defaultCultureId;
          const b = createBuildingInstance(world, nextType, islandId, site.x, site.y);
          b.cultureId = cultureId;
          b.unlocked = true;
          b.constructionStage = "complete";
          b.pausedForMaterials = false;
          b.level = 1;
          world.buildings.push(b);
          if (nextType === "dock") {
            world.islands[islandId].dockBuilt = true;
          }
          addChronicle(
            world,
            `${CULTURES[cultureId].name} villagers raised a ${b.name} on ${ISLAND_DEFS[islandId].name}.`,
            "build"
          );
          break;
        }
      }
    }
    if (pop < beds && pop < 7 && res.food >= pop * 6 + 6 && Math.random() < 0.06) {
      const cultureId = world.islands[islandId]?.owningCultureId ?? ISLAND_DEFS[islandId].defaultCultureId;
      const cand = generateCandidate("traveler", world.environment.dayCount, new Set(locals.map((l) => l.name)));
      const newNative = makeNativeClanVillager(
        `clan_ai_${islandId}_${Date.now()}`,
        cand.name,
        islandId,
        cultureId,
        CULTURES[cultureId].bannerColor,
        cand.hairColor,
        cand.skinTone,
        0,
        0,
        "forage"
      );
      world.clanVillagers.push(newNative);
      upsertLineage(world, newNative);
    }
  }
}
function tickForeignPerimeterAndParley(world, _dt) {
  if (world.gameMode === "shared_siege") return;
  const allLocals = [...world.villagers, ...world.clanVillagers];
  for (const v of world.villagers) {
    const homeId = v.homeIslandId ?? v.islandId;
    if (v.islandId === homeId) {
      if (v.visitStatus && v.visitStatus !== "home") {
        v.visitStatus = "home";
        v.visitTargetIslandId = null;
        v.parleyPartnerId = null;
      }
      continue;
    }
    const sameOwner = Boolean(v.ownerPlayerId) && Boolean(world.islandOwners?.[v.islandId]) && world.islandOwners?.[v.islandId] === v.ownerPlayerId;
    if (sameOwner) {
      v.visitStatus = "admitted";
      continue;
    }
    const isl = ISLAND_DEFS[v.islandId];
    const policy = world.villagePolicies?.[v.islandId]?.borderPolicy ?? "parley";
    const targetCulture = world.islands[v.islandId]?.owningCultureId ?? isl.defaultCultureId;
    const dipTrust = world.diplomacy?.[targetCulture]?.trust ?? 50;
    if (policy === "open_trade" || policy === "allied" && dipTrust >= 50) {
      v.visitStatus = "admitted";
      continue;
    }
    if (v.visitStatus === "admitted" && v.visitTargetIslandId === v.islandId) {
      continue;
    }
    const nd = islandNormalizedDist2(isl, v.x, v.y);
    if (nd < 0.66) {
      const rdx = v.x - isl.centerX;
      const rdy = v.y - isl.centerY;
      const dist = Math.hypot(rdx, rdy) || 1;
      const pushScale = 0.72 / Math.max(0.08, nd);
      v.x = isl.centerX + rdx / dist * (dist * pushScale);
      v.y = isl.centerY + rdy / dist * (dist * pushScale);
    }
    if (v.visitStatus === "denied") {
      const homeDef = ISLAND_DEFS[homeId];
      v.targetX = homeDef.centerX;
      v.targetY = homeDef.centerY;
      v.autonomyReason = `Denied entry at ${isl.name} perimeter; returning home.`;
      continue;
    }
    v.visitTargetIslandId = v.islandId;
    const localResident = allLocals.find(
      (other) => other.id !== v.id && other.islandId === v.islandId && (other.homeIslandId ?? other.islandId) === v.islandId && other.lifeStage !== "infant"
    );
    if (localResident) {
      const distToLocal = Math.hypot(localResident.x - v.x, localResident.y - v.y);
      if (distToLocal > 55) {
        v.visitStatus = "at_perimeter";
        const ang = Math.atan2(v.y - isl.centerY, v.x - isl.centerX);
        v.targetX = isl.centerX + Math.cos(ang) * (isl.radiusX * 0.74);
        v.targetY = isl.centerY + Math.sin(ang) * (isl.radiusY * 0.74);
        v.autonomyReason = `Waiting outside ${isl.name} perimeter to parley with locals.`;
        if (!v.thoughtBubble) {
          v.thoughtBubble = "Hail, neighbors!";
          v.thoughtTimer = 2.8;
        }
        if (localResident.state !== "fighting" && localResident.state !== "sleeping") {
          localResident.targetX = v.x;
          localResident.targetY = v.y;
          localResident.state = "socializing";
        }
      } else {
        v.visitStatus = "parleying";
        v.parleyPartnerId = localResident.id;
        const relScore = v.relationships[localResident.id] ?? 36;
        const warmBonus = v.traits.includes("warmhearted") || localResident.traits.includes("warmhearted") ? 10 : 0;
        const trustCheck = relScore + warmBonus + (dipTrust - 45) * 0.4;
        const allowed = policy === "closed" ? trustCheck >= 85 : trustCheck >= 28 && world.diplomacy?.[targetCulture]?.status !== "war";
        if (allowed) {
          v.visitStatus = "admitted";
          processDirectSocialShift(world, v, localResident, 8, "parley");
          v.thoughtBubble = "Admitted!";
          v.thoughtTimer = 3;
          localResident.thoughtBubble = "Welcome in!";
          localResident.thoughtTimer = 2.6;
          v.autonomyReason = `Parleyed with ${localResident.name.split(" ")[0]} and entered ${isl.name}.`;
          addChronicle(
            world,
            `${v.name.split(" ")[0]} greeted ${localResident.name.split(" ")[0]} outside ${isl.name} and was admitted.`,
            "bond",
            { islandId: isl.id, participantIds: [v.id, localResident.id] }
          );
        } else {
          v.visitStatus = "denied";
          v.thoughtBubble = "Turned away...";
          v.thoughtTimer = 3.2;
          localResident.thoughtBubble = "Borders closed!";
          localResident.thoughtTimer = 2.8;
          const homeDef = ISLAND_DEFS[homeId];
          v.targetX = homeDef.centerX;
          v.targetY = homeDef.centerY;
          v.autonomyReason = `${isl.name} border policy denied entry.`;
          emitWorldEvent(world, {
            category: "migration",
            significance: "minor",
            summary: `${localResident.name.split(" ")[0]} turned ${v.name.split(" ")[0]} away at ${isl.name} border.`,
            islandId: isl.id,
            participantIds: [v.id, localResident.id]
          });
        }
      }
    } else {
      v.visitStatus = "admitted";
    }
  }
}
function spawnSiegeRaider(world, name, islandId, x, y, wave) {
  const isl = ISLAND_DEFS[islandId];
  const traits = wave >= 3 ? ["hard_skin", "brave_hunter"] : ["brave_hunter"];
  const hp = 58 + wave * 12;
  world.raiders.push({
    ...makeNativeClanVillager(
      `siege_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      islandId,
      "ashen_raider",
      "#7C2D12",
      "#1C1917",
      "#C49B7B",
      0,
      0,
      "guard"
    ),
    isNativeClan: false,
    isStranger: true,
    traits,
    stats: rollUnitStats(traits, true),
    skills: rollStarterSkills("adult", true),
    skillXp: {},
    rtsOrder: null,
    drafted: false,
    x,
    y,
    targetX: ISLAND_DEFS.cradle.centerX,
    targetY: ISLAND_DEFS.cradle.centerY,
    hp,
    maxHp: hp,
    gearTier: wave >= 3 ? 3 : 2,
    weaponType: wave >= 4 ? "iron_blade" : wave >= 2 ? "bronze_blade" : "flint_spear",
    state: "fighting",
    autonomyReason: `Storming ${isl.name} in Siege Wave ${wave}!`,
    thoughtBubble: `Wave ${wave}!`,
    thoughtTimer: 3.5
  });
}
function tickSharedSiege(world, dt, particles) {
  if (world.gameMode !== "shared_siege" || world.villagers.length === 0) return;
  if (!world.siege) {
    world.siege = {
      wave: 0,
      nextWaveTimer: 35,
      activeFronts: [],
      totalKills: 0,
      warningText: null,
      lastWaveDay: 0
    };
  }
  const liveFronts = Array.from(new Set(world.raiders.map((r) => r.islandId)));
  world.siege.activeFronts = liveFronts;
  if (world.raiders.length >= 14) return;
  world.siege.nextWaveTimer -= dt;
  if (world.siege.nextWaveTimer <= 10 && world.siege.nextWaveTimer > 0 && world.raiders.length === 0) {
    world.siege.warningText = `Wave ${world.siege.wave + 1} approaching multiple fronts in ${Math.ceil(world.siege.nextWaveTimer)}s!`;
  }
  if (world.siege.nextWaveTimer <= 0) {
    world.siege.wave += 1;
    const wave = world.siege.wave;
    world.siege.nextWaveTimer = Math.max(34, 68 - wave * 3);
    world.siege.lastWaveDay = world.environment.dayCount;
    const cradle = ISLAND_DEFS.cradle;
    const sun = ISLAND_DEFS.sunterrace;
    const timber = ISLAND_DEFS.timbercrown;
    spawnSiegeRaider(
      world,
      `Sea-Raider W${wave}-A`,
      "cradle",
      cradle.dockSpot.x + (Math.random() * 26 - 13),
      cradle.dockSpot.y - 10,
      wave
    );
    if (wave >= 2) {
      spawnSiegeRaider(
        world,
        `Sea-Raider W${wave}-B`,
        "cradle",
        cradle.dockSpot.x + 24,
        cradle.dockSpot.y - 18,
        wave
      );
    }
    spawnSiegeRaider(
      world,
      `Bridge-Vanguard W${wave}`,
      "sunterrace",
      sun.centerX - sun.radiusX * 0.45,
      sun.centerY,
      wave
    );
    if (wave >= 2) {
      spawnSiegeRaider(
        world,
        `Timber-Flanker W${wave}`,
        "timbercrown",
        timber.centerX + timber.radiusX * 0.4,
        timber.centerY,
        wave
      );
    }
    if (wave >= 4) {
      spawnSiegeRaider(
        world,
        `Sky-Dropper W${wave}`,
        "cradle",
        cradle.centerX + (Math.random() * 120 - 60),
        cradle.centerY - cradle.radiusY * 0.65,
        wave
      );
    }
    const fronts = wave >= 2 ? ["cradle", "sunterrace", "timbercrown"] : ["cradle", "sunterrace"];
    world.siege.activeFronts = fronts;
    world.siege.warningText = `Siege Wave ${wave} attacking across ${fronts.length} fronts!`;
    addChronicle(
      world,
      `Siege Wave ${wave} struck across ${fronts.map((id) => ISLAND_DEFS[id].name).join(" & ")}!`,
      "war"
    );
    spawnParticle(particles, {
      kind: "sparkle",
      x: cradle.centerX,
      y: cradle.centerY,
      vx: 0,
      vy: -14,
      maxLife: 1.2,
      size: 3,
      alpha: 0.9,
      phase: 0,
      color: "#EF4444"
    });
  }
}
function executeRtsOrder(world, v, dt, particles) {
  const order = v.rtsOrder;
  if (!order) return false;
  if (order.kind === "hold") {
    v.state = "working";
    v.targetX = v.x;
    v.targetY = v.y;
    v.autonomyReason = "Holding position (RTS order).";
    const nearbyR = world.raiders.find((r) => r.islandId === v.islandId && Math.hypot(r.x - v.x, r.y - v.y) < (v.weaponType === "bow" ? 52 : 24));
    if (nearbyR) v.state = "fighting";
    return true;
  }
  if (order.kind === "attack") {
    const rTarget = world.raiders.find((r) => r.id === order.targetId && r.hp > 0);
    const hTarget = !rTarget ? world.wildHerds.find((h) => h.id === order.targetId && h.hp > 0) : null;
    const tgt = rTarget ?? hTarget;
    if (!tgt) {
      v.rtsOrder = null;
      return false;
    }
    v.activeTask = rTarget ? "guard" : "hunt";
    v.state = rTarget ? "fighting" : "hunting";
    v.targetX = tgt.x;
    v.targetY = tgt.y;
    v.autonomyReason = `RTS Attack: engaging ${rTarget ? rTarget.name : hTarget?.kind ?? "target"}.`;
    if (rTarget && v.islandId === rTarget.islandId && Math.hypot(v.x - rTarget.x, v.y - rTarget.y) <= (v.weaponType === "bow" ? 42 : 17)) {
      if (v.attackCooldown <= 0) {
        v.attackCooldown = 1.25;
        if (v.weaponType === "bow") {
          spawnProjectile(world, "arrow", v.islandId, v.x, v.y, rTarget.islandId, rTarget.x, rTarget.y);
          gainSkillXp(world, v, "archery", 2.4);
        } else {
          gainSkillXp(world, v, "blade_mastery", 2.4);
        }
        const techMods = getTechModifiers(world.unlockedTechIds);
        const tStats = getTraitStats(v);
        const baseVDmg = v.weaponType === "iron_blade" ? 28 : v.weaponType === "bronze_blade" ? 21 : v.weaponType === "bow" ? 17 : v.weaponType === "flint_spear" ? 14 : 8;
        const skillDmg = v.weaponType === "bow" ? getSkillLevel(v, "archery") * 1.8 : getSkillLevel(v, "blade_mastery") * 1.8;
        const finalDmg = (baseVDmg + skillDmg + (v.stats?.strength ?? 8) * 0.45) * tStats.attackPowerMult * techMods.attackMult;
        applyCombatStrike(world, v, rTarget, finalDmg, 0.3, "combat", particles);
        if (rTarget.hp <= 0) {
          v.killCount += 1;
          v.rtsOrder = null;
        }
      }
    }
    return true;
  }
  if (order.kind === "gather") {
    const node = world.wildNodes.find((n) => n.id === order.targetId && n.amount > 0.05);
    if (!node) {
      v.rtsOrder = null;
      return false;
    }
    const task = node.kind === "tree" || node.kind === "branch_pile" ? "chop" : node.kind === "stone_boulder" || node.kind === "flint_pile" ? "gather_stone" : node.kind === "copper_vein" || node.kind === "iron_vein" ? "quarry" : "forage";
    v.activeTask = task;
    v.targetX = node.x;
    v.targetY = node.y;
    const d = Math.hypot(v.x - node.x, v.y - node.y);
    v.state = d <= 24 ? "working" : "walking";
    v.autonomyReason = `RTS Gather: ${node.kind.replace("_", " ")}.`;
    if (d <= 26) {
      const stats = getTraitStats(v);
      const techMods = getTechModifiers(world.unlockedTechIds);
      const rate = 0.34 * stats.workSpeed * stats.gatherYieldMult * techMods.gatherMult * dt;
      const take = harvestWildNode(node, rate * 1.5);
      const creditIsle = v.homeIslandId ?? v.islandId;
      if (node.kind === "tree" || node.kind === "branch_pile") {
        addVillageResource(world, creditIsle, "timber", take);
        gainSkillXp(world, v, "woodcraft", dt * 1.5);
      } else if (node.kind === "stone_boulder" || node.kind === "flint_pile") {
        addVillageResource(world, creditIsle, "stone", take);
        gainSkillXp(world, v, "stonecraft", dt * 1.5);
      } else if (node.kind === "copper_vein") {
        addVillageResource(world, creditIsle, "copper", take * 0.85);
        addVillageResource(world, creditIsle, "stone", take * 0.35);
        gainSkillXp(world, v, "metallurgy", dt * 1.4);
      } else if (node.kind === "iron_vein") {
        addVillageResource(world, creditIsle, "iron", take * 0.75);
        addVillageResource(world, creditIsle, "stone", take * 0.35);
        gainSkillXp(world, v, "metallurgy", dt * 1.5);
      } else {
        addVillageResource(world, creditIsle, "berries", take);
        gainSkillXp(world, v, "foraging", dt * 1.5);
      }
      syncCombinedFood(world);
      grantKnowledge(world, dt * 0.65, particles, v);
    }
    return true;
  }
  if (order.kind === "build") {
    const b = world.buildings.find((item) => item.id === order.targetId && !item.unlocked);
    if (!b) {
      v.rtsOrder = null;
      return false;
    }
    v.targetX = b.x;
    v.targetY = b.y + 16;
    v.state = Math.hypot(v.x - b.x, v.y - b.y) <= 38 ? "building" : "walking";
    v.autonomyReason = `RTS Build: ${b.name}.`;
    if (!world.activeConstruction || world.activeConstruction.buildingId === b.id) {
      if (!world.activeConstruction) {
        const buildSpeed = getTechModifiers(world.unlockedTechIds).buildSpeedMult;
        world.activeConstruction = {
          buildingId: b.id,
          builderId: v.id,
          progress: 0,
          duration: Number((6.5 / buildSpeed).toFixed(2)),
          isUpgrade: false
        };
      } else {
        world.activeConstruction.builderId = v.id;
      }
    }
    return true;
  }
  v.targetX = order.x;
  v.targetY = order.y;
  const dist = Math.hypot(v.x - order.x, v.y - order.y);
  v.state = dist > 10 ? "walking" : "working";
  v.autonomyReason = `RTS Move (${ISLAND_DEFS[order.islandId].name}).`;
  if (dist <= 10 && v.islandId === order.islandId) {
    v.rtsOrder = null;
  }
  return true;
}
function stepSimulation(world, rawDt, particles = [], emitVisualParticles = true) {
  const dt = Math.min(rawDt, 0.05) * (world.settings.simSpeed === 0 ? 0 : world.settings.simSpeed);
  world.lastTickTimestamp = Date.now();
  if (dt <= 0) return;
  const prevTime = world.environment.timeOfDay;
  if (world.environment.timeMode !== "locked") {
    world.environment.timeOfDay = (prevTime + dt / world.environment.cycleSpeedSeconds) % 1;
    if (world.environment.timeOfDay < prevTime) {
      world.environment.dayCount += 1;
      handleNewDayEvents(world);
    }
  }
  if (world.environment.weatherMode !== "manual") {
    world.environment.weatherTimer -= dt;
    if (world.environment.weatherTimer <= 0) {
      const weights = SEASON_META[world.environment.season].weatherWeights;
      world.environment.weather = weights[Math.floor(Math.random() * weights.length)];
      world.environment.weatherTimer = 60 + Math.random() * 60;
    }
  }
  tickWildNodeRegrowth(world, dt);
  tickAutonomousConstruction(world, dt, particles, emitVisualParticles);
  tickFarmingAndPastures(world, dt);
  tickWildHerdsAndHunting(world, dt, particles);
  tickBoats(world, dt, particles, emitVisualParticles);
  tickCableways(world, dt, particles);
  tickGliders(world, dt, particles, emitVisualParticles);
  tickExploreRuins(world, dt, particles);
  tickProjectiles(world, dt);
  tickDiplomacyAndWar(world, dt, particles);
  tickClanVillagers(world, dt);
  tickAutonomousAiVillages(world, dt);
  tickForeignPerimeterAndParley(world, dt);
  tickVillageCulturesAndBonfireRituals(world, dt, particles, emitVisualParticles);
  tickSkillTeaching(world, dt, particles);
  tickSharedSiege(world, dt, particles);
  tickGovernance(world, dt);
  const hasQueued = world.pendingArrivals.some((a) => a.kind === "traveler");
  const arrivalIsle = getOwnedBuildIslands(world)[0] ?? world.localHomeIslandId ?? "cradle";
  const arrPop = world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === arrivalIsle).length;
  const arrBeds = getHousingBedsForIsland(world, arrivalIsle);
  const arrFood = getVillageRes(world, arrivalIsle).food;
  if (!hasQueued && arrPop > 0 && arrPop < arrBeds && arrPop < 24 && arrFood >= arrPop * 6 + 6) {
    world.nextTravelerTimer -= dt;
    if (world.nextTravelerTimer <= 0) {
      world.nextTravelerTimer = 300 + Math.random() * 160;
      const names = new Set(world.villagers.map((v) => v.name));
      const traveler = generateCandidate("traveler", world.environment.dayCount, names);
      traveler.islandId = arrivalIsle;
      const greeter = getGreetingVillagerForIsland(world, arrivalIsle);
      if (greeter) {
        traveler.greeterId = greeter.id;
        traveler.greeterName = greeter.name;
      } else {
        evaluateTravelerDecision(world, traveler, null);
      }
      dispatchMigrantBoat(world, arrivalIsle, traveler);
    }
  }
  for (const arr of world.pendingArrivals) {
    if (arr.kind === "traveler" && arr.boatPhase !== "approaching" && arr.decisionVerdict === "talking") {
      arr.deliberationTimer -= dt;
      if (arr.deliberationTimer <= 0) {
        const greeter = arr.greeterId ? world.villagers.find((v) => v.id === arr.greeterId) ?? null : null;
        evaluateTravelerDecision(world, arr, greeter);
      }
    }
  }
  if (world.pendingArrivals.length > 0) {
    const first = world.pendingArrivals[0];
    if (first.kind === "birth" || first.boatPhase !== "approaching" && first.decisionVerdict !== "talking") {
      world.autoWelcomeTimer -= dt;
      if (world.autoWelcomeTimer <= 0) {
        const targetIsle = first.islandId ?? arrivalIsle;
        const pop = world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === targetIsle).length;
        const beds = getHousingBedsForIsland(world, targetIsle);
        const foodOk = first.kind === "birth" || getVillageRes(world, targetIsle).food >= pop * 6 + 6;
        const accept = (first.kind === "birth" || first.decisionVerdict === "recommend_welcome") && pop < beds && foodOk;
        resolveArrival(world, first.id, accept, particles);
        world.autoWelcomeTimer = 18;
      }
    }
  }
  const t = world.environment.timeOfDay;
  const isNight = t < 0.22 || t > 0.89;
  const isWinter = world.environment.season === "winter" || world.environment.weather === "snow";
  const isRain = world.environment.weather === "rain";
  for (let vi = world.villagers.length - 1; vi >= 0; vi--) {
    const v = world.villagers[vi];
    const stats = getTraitStats(v);
    v.animPhase += dt * (v.state === "walking" || v.state === "exploring" ? 6.8 : 2.6);
    v.bounceScale += (1 - v.bounceScale) * Math.min(1, dt * 10);
    if (v.socialCooldown > 0) v.socialCooldown -= dt;
    if (v.pairChatCooldowns) {
      for (const pid of Object.keys(v.pairChatCooldowns)) {
        v.pairChatCooldowns[pid] -= dt;
        if (v.pairChatCooldowns[pid] <= 0) delete v.pairChatCooldowns[pid];
      }
    }
    if (!v.stuckState) {
      v.stuckState = { lastX: v.x, lastY: v.y, timer: 0, detourSign: 1 };
    }
    if (v.attackCooldown > 0) v.attackCooldown -= dt;
    if (v.edgeAckCooldown && v.edgeAckCooldown > 0) v.edgeAckCooldown = Math.max(0, v.edgeAckCooldown - dt);
    if (v.thoughtTimer > 0) {
      v.thoughtTimer -= dt;
      if (v.thoughtTimer <= 0) v.thoughtBubble = null;
    }
    if (v.voyageBoatId || v.transitGliderId || v.transitCableId) {
      continue;
    }
    updateVillagerEquipment(world, v);
    const fire = getIslandBonfire(world, v.islandId);
    const nearFire = fire ? Math.hypot(v.x - fire.x, v.y - fire.y) < 110 : false;
    const insideHome = v.state === "sleeping" && hasBuildingType2(world, "cottage", v.islandId);
    const woolResist = v.gearTier >= 2 ? 0.35 : v.gearTier === 1 ? 0.65 : 1;
    const techMods = getTechModifiers(world.unlockedTechIds);
    const homeId = v.homeIslandId ?? v.islandId;
    const homeRes = getVillageRes(world, homeId);
    const hasCaretaker = world.villagers.some((c) => c.id !== v.id && c.lifeStage !== "infant");
    if (v.lifeStage === "infant" && hasCaretaker) {
      v.warmth = Math.max(72, Math.min(100, v.warmth + dt * 6));
      v.hunger = Math.max(64, Math.min(100, v.hunger + dt * 2.5));
      v.hp = Math.min(v.maxHp, v.hp + dt * 2);
    } else {
      if (nearFire || insideHome) {
        v.warmth = Math.min(100, v.warmth + dt * 10);
      } else if (isWinter || isNight && isRain) {
        const chill = (isWinter ? 1.45 : 0.7) * woolResist * (v.traits.includes("resilient") ? 0.5 : 1);
        v.warmth = Math.max(0, v.warmth - dt * chill);
      } else {
        v.warmth = Math.min(100, v.warmth + dt * 1.4);
      }
      v.hunger = Math.max(0, v.hunger - dt * 0.32);
      if (v.hunger <= 0) {
        v.hp -= dt * 2.2;
        if (v.hp <= 0) {
          killVillager(world, v.id, "starvation", particles);
          continue;
        }
      } else if (v.warmth <= 0) {
        v.hp -= dt * 2.6;
        if (v.hp <= 0) {
          killVillager(world, v.id, "freezing", particles);
          continue;
        }
      } else if (v.hunger > 45 && v.warmth > 40 && v.hp < v.maxHp) {
        const herbBoost = homeRes.herbs >= 1 ? 1.5 : 1;
        v.hp = Math.min(v.maxHp, v.hp + dt * 0.9 * herbBoost * stats.healRateMult * techMods.healRateMult);
      }
    }
    if (v.stats && v.stats.bleedStack > 0 && v.stats.bleedTimer > 0) {
      const nearSpring = ISLAND_DEFS[v.islandId].hasSpring && ISLAND_DEFS[v.islandId].springOffset ? Math.hypot(
        v.x - (ISLAND_DEFS[v.islandId].centerX + ISLAND_DEFS[v.islandId].springOffset.dx),
        v.y - (ISLAND_DEFS[v.islandId].centerY + ISLAND_DEFS[v.islandId].springOffset.dy)
      ) < 75 : false;
      const clotRate = 1 + (nearFire || nearSpring ? 0.65 : 0) + getSkillLevel(v, "herbalism") * 0.25 + (v.traits.includes("swift_recovery") ? 0.6 : 0);
      v.stats.bleedTimer = Math.max(0, v.stats.bleedTimer - dt * clotRate);
      const bleedDmg = v.stats.bleedStack * 1.05 * stats.bleedChanceMult * dt;
      v.hp = Math.max(0, v.hp - bleedDmg);
      if (emitVisualParticles && Math.random() < dt * 1.4) {
        spawnParticle(particles, {
          kind: "blood",
          x: v.x,
          y: v.y - 4,
          vx: (Math.random() - 0.5) * 4,
          vy: -3,
          maxLife: 0.6,
          size: 1.5,
          alpha: 0.8,
          phase: 0,
          color: "#EF4444"
        });
      }
      if (v.hp <= 0) {
        killVillager(world, v.id, "combat", particles);
        continue;
      }
      if (v.stats.bleedTimer <= 0) {
        v.stats.bleedStack = 0;
      }
    }
    if (v.state === "sleeping" || v.state === "resting") {
      v.energy = Math.min(100, v.energy + dt * 5.2);
      v.mood = Math.min(100, v.mood + dt * 1.2);
    } else {
      v.energy = Math.max(0, v.energy - dt * 0.58 * stats.energyDrain);
    }
    const hasActiveRtsOrder = (world.gameMode === "sovereign_sandbox" || world.gameMode === "shared_siege") && Boolean(v.rtsOrder) && executeRtsOrder(world, v, dt, particles);
    const agiBonus = 1 + ((v.stats?.agility ?? 8) - 8) * 0.025;
    const baseSpeed = v.lifeStage === "infant" ? 14 : 34;
    const speed = baseSpeed * stats.moveSpeedMult * techMods.moveSpeedMult * agiBonus * (v.lifeStage === "elder" ? 0.8 : 1);
    const dist = Math.hypot(v.targetX - v.x, v.targetY - v.y);
    if (dist > 8) {
      const step = steerEntity(world, v.islandId, v.x, v.y, v.targetX, v.targetY, speed * dt, false, v.stuckState, dt, v.id);
      v.x = step.x;
      v.y = step.y;
      v.islandId = step.islandId;
      v.facing = step.facing;
      if (step.wasStuckReset) {
        const isl = ISLAND_DEFS[v.islandId];
        v.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.52);
        v.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.52);
        if (step.navBlockedReason) {
          v.autonomyReason = `Replanning: ${step.navBlockedReason}`;
        }
        if (v.rtsOrder && v.rtsOrder.kind === "move" && v.rtsOrder.islandId !== v.islandId) {
          v.rtsOrder = null;
        }
        v.decisionCooldown = Math.min(v.decisionCooldown, 1);
      }
      if (step.hitEdge && (!v.edgeAckCooldown || v.edgeAckCooldown <= 0)) {
        v.edgeAckCooldown = 2.4;
        if (!v.cognition.observedConcepts.includes("horizon")) {
          learnConcept(world, v, "horizon", particles);
        } else {
          v.thoughtBubble = "Sky-sea rim!";
          v.thoughtTimer = 2;
        }
        const isl = ISLAND_DEFS[v.islandId];
        v.targetX = isl.centerX + (Math.random() * 2 - 1) * (isl.radiusX * 0.52);
        v.targetY = isl.centerY + (Math.random() * 2 - 1) * (isl.radiusY * 0.52);
      }
      if (!world.islands[v.islandId].discovered) {
        discoverIsland(world, v.islandId, v.name.split(" ")[0]);
      }
    } else if (v.state === "walking") {
      if (v.decisionTrace?.chosenAction === "haul_to_stockpile") {
        if ((v.carriedAmount ?? 0) > 0.01) {
          const activeSite = world.activeConstruction && world.buildings.find(
            (b) => b.id === world.activeConstruction?.buildingId && !b.unlocked && b.islandId === v.islandId && Math.hypot(v.x - b.x, v.y - b.y) <= 48 && (b.requiredMaterials?.[v.carriedResource] ?? 0) > (b.deliveredMaterials?.[v.carriedResource] ?? 0)
          );
          if (activeSite && v.carriedResource) {
            if (!activeSite.deliveredMaterials) activeSite.deliveredMaterials = {};
            const need = (activeSite.requiredMaterials?.[v.carriedResource] ?? 0) - (activeSite.deliveredMaterials[v.carriedResource] ?? 0);
            const give = Math.min(need, v.carriedAmount ?? 0);
            if (give > 0) {
              activeSite.deliveredMaterials[v.carriedResource] = Number(((activeSite.deliveredMaterials[v.carriedResource] ?? 0) + give).toFixed(2));
              v.carriedAmount = Math.max(0, Number(((v.carriedAmount ?? 0) - give).toFixed(2)));
              if (v.carriedAmount <= 0.01) {
                v.carriedAmount = 0;
                v.carriedResource = null;
              }
            }
            if ((v.carriedAmount ?? 0) > 0.01) {
              depositCarriedToVillage(world, v, addVillageResource, syncCombinedFood);
            }
            v.thoughtBubble = "Delivered!";
            v.thoughtTimer = 2;
          } else if (depositCarriedToVillage(world, v, addVillageResource, syncCombinedFood)) {
            v.thoughtBubble = "Stored!";
            v.thoughtTimer = 2;
          }
        }
        v.state = "resting";
        v.decisionCooldown = Math.min(v.decisionCooldown, 0.25);
      } else {
        v.state = "working";
      }
    } else if (v.state === "exploring") {
      v.state = "inspecting";
      const concept = v.cognition.focusObject ?? "horizon";
      learnConcept(world, v, concept, particles);
      v.decisionCooldown = Math.min(v.decisionCooldown, 2.8);
    }
    if (v.state === "inspecting" || v.state === "exploring") {
      v.cognition.awareness = Math.min(100, v.cognition.awareness + dt * (v.state === "inspecting" ? 2.6 : 0.9));
      v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);
    }
    const busyStates = v.state === "fighting" || v.state === "hunting" || v.state === "sleeping" || v.state === "building";
    if (!v.banished && v.socialCooldown <= 0 && !busyStates && v.hunger >= 30) {
      const peer = [...world.villagers, ...world.clanVillagers].find(
        (other) => other.id !== v.id && !other.banished && other.islandId === v.islandId && other.state !== "fighting" && other.state !== "hunting" && other.state !== "sleeping" && ((other.homeIslandId ?? other.islandId) === (v.homeIslandId ?? v.islandId) || v.visitStatus === "admitted" || other.visitStatus === "admitted") && (!v.pairChatCooldowns || (v.pairChatCooldowns[other.id] ?? 0) <= 0) && Math.hypot(other.x - v.x, other.y - v.y) < 36
      );
      if (peer) {
        processSocialEncounter(world, v, peer, (target, concept, peerFirst) => {
          learnConcept(world, target, concept, particles, peerFirst);
        });
        spreadIncidentRumor(world, v, peer);
        spreadIncidentRumor(world, peer, v);
      }
    }
    if (!v.banished && !hasActiveRtsOrder && (v.state === "working" || v.state === "exploring" && canVillagerWork(world, v)) && canVillagerWork(world, v)) {
      const yieldMult = stats.gatherYieldMult * techMods.gatherMult;
      const rate = 0.25 * stats.workSpeed * yieldMult * (0.75 + v.mood / 100 * 0.35);
      if (v.activeTask === "forage") {
        const nearbyNode = world.wildNodes.find(
          (n) => n.islandId === v.islandId && n.amount > 0.02 && (n.kind === "berry_bush" || n.kind === "flint_pile" || n.kind === "branch_pile") && Math.hypot(n.x - v.x, n.y - v.y) < 48
        );
        if (nearbyNode) {
          const take = harvestWildNode(nearbyNode, rate * (1.35 + getSkillLevel(v, "foraging") * 0.08) * dt);
          if (take > 0) {
            const resKey = nearbyNode.kind === "berry_bush" ? "berries" : nearbyNode.kind === "flint_pile" ? "stone" : "timber";
            addToVillagerInventory(world, v, resKey, take, addVillageResource);
            gainSkillXp(world, v, "foraging", dt * 1.15);
            advanceKnowledge(v, "foraging", dt * 0.75);
            grantKnowledge(world, dt * 0.95, particles, v);
            if ((v.carriedAmount ?? 0) >= getCarryCap(v) - 0.05 || nearbyNode.amount <= 0.02) {
              v.decisionCooldown = Math.min(v.decisionCooldown, 0.2);
            }
          }
        } else {
          const nextNode = world.wildNodes.find(
            (n) => n.islandId === v.islandId && n.amount > 0.05 && (n.kind === "berry_bush" || n.kind === "flint_pile" || n.kind === "branch_pile")
          );
          if (nextNode) {
            v.targetX = nextNode.x;
            v.targetY = nextNode.y;
            v.state = "walking";
          } else {
            v.decisionCooldown = 0;
          }
        }
      } else if (v.activeTask === "gather_stone") {
        const nearbyNode = world.wildNodes.find(
          (n) => n.islandId === v.islandId && n.amount > 0.02 && (n.kind === "stone_boulder" || n.kind === "flint_pile") && Math.hypot(n.x - v.x, n.y - v.y) < 48
        );
        const stoneBonus = 1 + getSkillLevel(v, "stonecraft") * 0.1;
        if (nearbyNode) {
          const take = harvestWildNode(nearbyNode, rate * 1.45 * stoneBonus * dt);
          if (take > 0) {
            addToVillagerInventory(world, v, "stone", take, addVillageResource);
            gainSkillXp(world, v, "stonecraft", dt * 1.35);
            advanceKnowledge(v, "stonecraft", dt * 0.8);
            if (nearbyNode.kind === "flint_pile") advanceKnowledge(v, "toolmaking", dt * 0.4);
            grantKnowledge(world, dt * 0.85, particles, v);
            if ((v.carriedAmount ?? 0) >= getCarryCap(v) - 0.05 || nearbyNode.amount <= 0.02) {
              v.decisionCooldown = Math.min(v.decisionCooldown, 0.2);
            }
          }
        } else {
          const nextNode = world.wildNodes.find(
            (n) => n.islandId === v.islandId && n.amount > 0.05 && (n.kind === "stone_boulder" || n.kind === "flint_pile")
          );
          if (nextNode) {
            v.targetX = nextNode.x;
            v.targetY = nextNode.y;
            v.state = "walking";
          } else {
            v.decisionCooldown = 0;
          }
        }
      } else if (v.activeTask === "chop") {
        const woodBoost = (hasBuildingType2(world, "woodshop", homeId) ? 1.35 : 1) * (1 + getSkillLevel(v, "woodcraft") * 0.09);
        const treeNode = world.wildNodes.find(
          (n) => n.islandId === v.islandId && n.amount > 0.02 && (n.kind === "tree" || n.kind === "branch_pile") && Math.hypot(n.x - v.x, n.y - v.y) < 48
        );
        if (treeNode) {
          const take = harvestWildNode(treeNode, rate * 1.3 * woodBoost * dt);
          if (take > 0) {
            addToVillagerInventory(world, v, "timber", take, addVillageResource);
            gainSkillXp(world, v, "woodcraft", dt * 1.2);
            advanceKnowledge(v, "woodcraft", dt * 0.75);
            grantKnowledge(world, dt * 0.65, particles, v);
            if ((v.carriedAmount ?? 0) >= getCarryCap(v) - 0.05 || treeNode.amount <= 0.02) {
              v.decisionCooldown = Math.min(v.decisionCooldown, 0.2);
            }
          }
        } else {
          const nextTree = world.wildNodes.find(
            (n) => n.islandId === v.islandId && n.amount > 0.05 && (n.kind === "tree" || n.kind === "branch_pile")
          );
          if (nextTree) {
            v.targetX = nextTree.x;
            v.targetY = nextTree.y;
            v.state = "walking";
          } else {
            v.decisionCooldown = 0;
          }
        }
      } else if (v.activeTask === "quarry") {
        const crag = v.islandId === "coppercrag" || v.islandId === "frostpeak";
        const quarryBonus = 1 + getSkillLevel(v, "stonecraft") * 0.1;
        addVillageResource(world, homeId, "stone", rate * 1.15 * quarryBonus * dt);
        if (crag || getTechUnlocked2(world, "bronze_smelting")) {
          addVillageResource(world, homeId, "copper", rate * (crag ? 0.55 : 0.18) * dt);
        }
        if (crag || getTechUnlocked2(world, "iron_statecraft")) {
          addVillageResource(world, homeId, "iron", rate * (crag ? 0.35 : 0.08) * dt);
        }
        gainSkillXp(world, v, "stonecraft", dt * 1.1);
        advanceKnowledge(v, "stonecraft", dt * 0.75);
        grantKnowledge(world, dt * 0.7, particles, v);
      } else if (v.activeTask === "farm") {
        gainSkillXp(world, v, "farming", dt * 1.1);
        advanceKnowledge(v, "foraging", dt * 0.7);
        grantKnowledge(world, dt * 0.55, particles, v);
      } else if (v.activeTask === "pasture") {
        gainSkillXp(world, v, "husbandry", dt * 1.1);
        advanceKnowledge(v, "foraging", dt * 0.55);
        grantKnowledge(world, dt * 0.5, particles, v);
      } else if (v.activeTask === "bake" && homeRes.grain >= 0.2) {
        const bakeAmt = Math.min(homeRes.grain, 0.22 * dt);
        spendVillageResources(world, homeId, { grain: bakeAmt });
        world.comforts.bread = Math.min(25, world.comforts.bread + bakeAmt * 0.55);
        addVillageResource(world, homeId, "hearthlight", 0.25 * dt);
        syncCombinedFood(world);
        gainSkillXp(world, v, "herbalism", dt * 0.7);
        advanceKnowledge(v, "cooking", dt * 0.9);
        advanceKnowledge(v, "firecraft", dt * 0.35);
        grantKnowledge(world, dt * 0.5, particles, v);
      } else if (v.activeTask === "study") {
        v.cognition.awareness = Math.min(100, v.cognition.awareness + dt * 1.8);
        v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);
        advanceKnowledge(v, "social_customs", dt * 0.8);
        advanceKnowledge(v, "healing", dt * 0.35);
        grantKnowledge(world, dt * 1.85, particles, v);
        addVillageResource(world, homeId, "hearthlight", 0.22 * dt);
      } else if (v.activeTask === "smelt") {
        if (homeRes.copper >= 0.2) {
          const take = Math.min(homeRes.copper, 0.2 * dt);
          spendVillageResources(world, homeId, { copper: take });
          addVillageResource(world, homeId, "bronze", take * (0.85 + getSkillLevel(v, "metallurgy") * 0.05));
        }
        gainSkillXp(world, v, "metallurgy", dt * 1.25);
        advanceKnowledge(v, "toolmaking", dt * 0.85);
        advanceKnowledge(v, "firecraft", dt * 0.45);
        grantKnowledge(world, dt * 0.85, particles, v);
      } else if (v.activeTask === "fish") {
        addVillageResource(world, homeId, "fish", rate * (0.9 + getSkillLevel(v, "seamanship") * 0.08) * dt);
        syncCombinedFood(world);
        gainSkillXp(world, v, "seamanship", dt * 1.1);
        advanceKnowledge(v, "sailing", dt * 0.8);
        grantKnowledge(world, dt * 0.55, particles, v);
      } else if (v.activeTask === "explore") {
        const undisc = ISLAND_ORDER.filter((id) => !world.islands[id].discovered);
        const dockBoat = world.boats.find(
          (b) => b.cultureId !== "mist_mariner" && b.homeIslandId === v.islandId && b.state === "docked" && (b.kind === "cargo_merchant" || b.kind === "war_galley")
        );
        if (dockBoat && undisc.length > 0 && Math.hypot(v.x - dockBoat.x, v.y - dockBoat.y) < 120) {
          const targetIsle = undisc[0];
          dockBoat.targetIslandId = targetIsle;
          dockBoat.targetX = ISLAND_DEFS[targetIsle].dockSpot.seaX;
          dockBoat.targetY = ISLAND_DEFS[targetIsle].dockSpot.seaY;
          dockBoat.state = "sailing";
          dockBoat.passengerIds = [v.id];
          dockBoat.tripTimer = 10;
          v.voyageBoatId = dockBoat.id;
          v.state = "sailing";
          v.thoughtBubble = `Sailing to ${ISLAND_DEFS[targetIsle].name.split(" ")[0]}!`;
          v.thoughtTimer = 3.5;
        }
        gainSkillXp(world, v, "seamanship", dt * 0.65);
        advanceKnowledge(v, "sailing", dt * 0.65);
        grantKnowledge(world, dt * 0.7, particles, v);
      }
      if (nearFire) advanceKnowledge(v, "firecraft", dt * 0.15);
    }
    if (!hasActiveRtsOrder) {
      v.decisionCooldown -= dt;
      if (v.decisionCooldown <= 0) {
        const isResting = v.state === "resting";
        v.decisionCooldown = v.cognition.stage === "awakening" ? 3 + Math.random() * 2 : isResting ? 2.2 + Math.random() * 1.8 : 4.5 + Math.random() * 4;
        decideVillagerBehavior(world, v);
      }
    }
  }
  if (world.catPauseTimer > 0) {
    world.catPauseTimer -= dt;
  } else {
    const d = Math.hypot(world.catTargetX - world.catX, world.catTargetY - world.catY);
    if (d < 6) {
      world.catPauseTimer = 3 + Math.random() * 5;
      const c = ISLAND_DEFS.cradle;
      world.catTargetX = c.centerX + (Math.random() * 320 - 160);
      world.catTargetY = c.centerY + (Math.random() * 220 - 110);
    } else {
      const step = steerEntity(world, "cradle", world.catX, world.catY, world.catTargetX, world.catTargetY, 22 * dt);
      world.catX = step.x;
      world.catY = step.y;
      world.catFacing = step.facing;
      if (step.hitEdge || step.hitWaterEdge) {
        world.catPauseTimer = 1.4;
        const c = ISLAND_DEFS.cradle;
        world.catTargetX = c.centerX + (Math.random() * 240 - 120);
        world.catTargetY = c.centerY + (Math.random() * 160 - 80);
      }
    }
  }
  evaluateEra(world);
  evaluateVillageTrajectory(world);
  if (emitVisualParticles) {
    updateParticles(world, dt, particles);
  }
}
function handleNewDayEvents(world) {
  world.environment.seasonDay += 1;
  if (world.environment.seasonDay > 5) {
    world.environment.seasonDay = 1;
    const order = ["spring", "summer", "autumn", "winter"];
    const nextIdx = (order.indexOf(world.environment.season) + 1) % order.length;
    world.environment.season = order[nextIdx];
    addChronicle(world, `${SEASON_META[world.environment.season].label} arrived across the sky-sea.`, "festival");
  }
  if (world.resourceFlows) {
    for (const id of ISLAND_ORDER) {
      const fl = world.resourceFlows[id];
      if (!fl) continue;
      fl.foodIn = Number((fl.foodIn * 0.35).toFixed(2));
      fl.foodOut = Number((fl.foodOut * 0.35).toFixed(2));
      fl.timberIn = Number((fl.timberIn * 0.35).toFixed(2));
      fl.timberOut = Number((fl.timberOut * 0.35).toFixed(2));
      fl.stoneIn = Number((fl.stoneIn * 0.35).toFixed(2));
      fl.stoneOut = Number((fl.stoneOut * 0.35).toFixed(2));
      fl.oreIn = Number((fl.oreIn * 0.35).toFixed(2));
      fl.oreOut = Number((fl.oreOut * 0.35).toFixed(2));
    }
  }
  if (world.pendingArrivals.length === 0) {
    for (const homeId of getOwnedBuildIslands(world)) {
      const islandFolks = world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === homeId);
      const pop = islandFolks.length;
      const beds = getHousingBedsForIsland(world, homeId);
      const res = getVillageRes(world, homeId);
      if (pop >= beds || pop >= 18 || res.food < pop * 6 + 6) continue;
      const couple = islandFolks.find(
        (v) => v.lifeStage === "adult" && v.partnerId && v.birthCooldownDays <= 0 && v.mood >= 65 && v.hunger >= 55
      );
      if (couple && Math.random() < 0.28) {
        const partner = world.villagers.find((p) => p.id === couple.partnerId);
        if (partner) {
          couple.birthCooldownDays = 8;
          partner.birthCooldownDays = 8;
          const names = new Set(world.villagers.map((item) => item.name));
          const baby = generateCandidate("birth", world.environment.dayCount, names, [
            { id: couple.id, name: couple.name, traits: couple.traits },
            { id: partner.id, name: partner.name, traits: partner.traits }
          ]);
          baby.islandId = homeId;
          world.pendingArrivals.push(baby);
          break;
        }
      }
    }
  }
  for (let i = world.villagers.length - 1; i >= 0; i--) {
    const v = world.villagers[i];
    v.ageDays += 1;
    v.wishFulfilledToday = false;
    v.activeWish = pickRandomWish();
    if (v.birthCooldownDays > 0) v.birthCooldownDays -= 1;
    if (v.lifeStage === "infant" && v.ageDays >= 3) {
      v.lifeStage = "child";
      if (Object.keys(v.skills ?? {}).length === 0) {
        v.skills = rollStarterSkills("child", false);
      }
      upsertLineage(world, v);
      addChronicle(world, `${v.name.split(" ")[0]} grew from infancy into a curious child!`, "birth");
    } else if (v.lifeStage === "child" && v.ageDays >= 8) {
      v.lifeStage = "adult";
      upsertLineage(world, v);
      addChronicle(world, `${v.name.split(" ")[0]} came of age as a full adult of ${ISLAND_DEFS[v.homeIslandId ?? v.islandId].name}.`, "birth");
    } else if (v.lifeStage === "adult" && v.ageDays >= 30) {
      v.lifeStage = "elder";
      v.hairColor = "#B9B5AE";
      upsertLineage(world, v);
    } else if (v.lifeStage === "elder" && v.ageDays >= 46 && Math.random() < 0.22) {
      killVillager(world, v.id, "old_age", []);
      continue;
    }
    if (v.lifeStage === "adult" && !v.partnerId) {
      const candidate = world.villagers.find(
        (u) => u.id !== v.id && u.lifeStage === "adult" && !u.partnerId && (u.homeIslandId ?? u.islandId) === (v.homeIslandId ?? v.islandId) && (!v.parentIds || !v.parentIds.includes(u.id)) && (!u.parentIds || !u.parentIds.includes(v.id)) && (v.relationships[u.id] ?? 0) >= 65
      );
      if (candidate) {
        v.partnerId = candidate.id;
        candidate.partnerId = v.id;
        processDirectSocialShift(world, v, candidate, 14, "hangout");
        upsertLineage(world, v);
        upsertLineage(world, candidate);
        addChronicle(
          world,
          `${v.name.split(" ")[0]} and ${candidate.name.split(" ")[0]} formed a life bond!`,
          "bond",
          { islandId: v.homeIslandId ?? v.islandId, participantIds: [v.id, candidate.id] }
        );
      }
    }
  }
  if (!world.chiefId && world.villagers.length >= 3) {
    const cand = world.villagers.find((v) => v.lifeStage === "adult" || v.lifeStage === "elder");
    if (cand) {
      cand.isChief = true;
      world.chiefId = cand.id;
      addChronicle(world, `${cand.name} was chosen as Island Chief.`, "chief");
    }
  }
}
function updateParticles(world, dt, particles) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.phase += dt * 4;
  }
  for (const b of world.buildings) {
    if (b.type === "bonfire" && b.unlocked && Math.random() < dt * 2.2) {
      spawnParticle(particles, {
        kind: "smoke",
        x: b.x + (Math.random() * 6 - 3),
        y: b.y - 6,
        vx: 2,
        vy: -12,
        maxLife: 1.5,
        size: 2.2,
        alpha: 0.45,
        phase: Math.random() * 6,
        color: "#D6CEC4"
      });
    }
  }
  const weather = world.environment.weather;
  if (weather === "rain" || weather === "snow") {
    const spawnCount = weather === "rain" ? 3 : 2;
    for (let s = 0; s < spawnCount; s++) {
      spawnParticle(particles, {
        kind: weather === "rain" ? "rain" : "snow",
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        vx: weather === "rain" ? -15 : (Math.random() - 0.5) * 14,
        vy: weather === "rain" ? 140 : 32,
        maxLife: weather === "rain" ? 0.9 : 2.1,
        size: weather === "rain" ? 1 : 1.8,
        alpha: 0.65,
        phase: Math.random() * 6,
        color: weather === "rain" ? "#93C5FD" : "#F8FAFC"
      });
    }
  }
}
function evaluateTravelerDecision(world, candidate, greeter) {
  let score = 0;
  if (candidate.attitude === "warm" || candidate.attitude === "humble") score += 2;
  else if (candidate.attitude === "boisterous") score += 1;
  else if (candidate.attitude === "restless") score -= 2;
  else score -= 1;
  for (const tid of candidate.traits) {
    const t = TRAITS[tid];
    if (t?.polarity === "positive") score += 1;
    else if (t?.polarity === "negative") score -= 1;
  }
  if (greeter?.traits.includes("cautious_homebody")) score -= 1;
  if (greeter?.traits.includes("warmhearted")) score += 1;
  if (candidate.godSuggestion === "welcome") score += 2;
  if (candidate.godSuggestion === "decline") score -= 2;
  const verdict = score >= 0 ? "recommend_welcome" : "recommend_decline";
  candidate.decisionVerdict = verdict;
  candidate.decisionReason = verdict === "recommend_welcome" ? `${greeter ? greeter.name.split(" ")[0] : "The clan"} welcomed ${candidate.name.split(" ")[0]}'s spirit.` : `${greeter ? greeter.name.split(" ")[0] : "Scouts"} stayed wary of ${candidate.name.split(" ")[0]}'s manner.`;
  return verdict;
}
function resolveArrival(world, arrivalId, accept, particles) {
  const idx = world.pendingArrivals.findIndex((a) => a.id === arrivalId);
  if (idx === -1) return;
  const cand = world.pendingArrivals[idx];
  world.pendingArrivals.splice(idx, 1);
  const homeId = cand.islandId ?? world.localHomeIslandId ?? "cradle";
  const homeDef = ISLAND_DEFS[homeId];
  const migrantBoat = cand.boatId ? world.boats.find((b) => b.id === cand.boatId) : void 0;
  if (!accept) {
    cand.boatPhase = "departing";
    if (migrantBoat) {
      sendMigrantBoatAway(migrantBoat, cand.name.split(" ")[0]);
    }
    emitWorldEvent(world, {
      category: "migration",
      significance: "notable",
      summary: `${cand.name} re-boarded their skiff and sailed away from ${homeDef.name}.`,
      islandId: homeId,
      participantIds: cand.greeterId ? [cand.greeterId] : []
    });
    addChronicle(world, `${cand.name} parted peacefully by skiff from ${homeDef.name}.`, "arrival", {
      islandId: homeId,
      participantIds: cand.greeterId ? [cand.greeterId] : []
    });
    return;
  }
  const isBirth = cand.kind === "birth";
  const unitStats = rollUnitStats(cand.traits, false);
  const unitSkills = isBirth ? {} : rollStarterSkills(cand.lifeStage, false);
  const hpMod = cand.traits.reduce((sum, tid) => sum + (TRAITS[tid]?.hpMaxMod ?? 0), 0);
  const maxHp = Math.max(70, 100 + (unitStats.endurance - 8) * 4 + hpMod);
  const landing = isBirth ? { x: homeDef.centerX + (Math.random() * 48 - 24), y: homeDef.centerY + (Math.random() * 36 - 18) } : getMigrantLandingPoint(homeId);
  const sx = landing.x;
  const sy = landing.y;
  const villager = {
    id: `vil_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: cand.name,
    bioDescription: cand.bioDescription,
    cultureId: world.islands[homeId]?.owningCultureId ?? "hearthfolk",
    islandId: homeId,
    homeIslandId: homeId,
    ownerPlayerId: world.islandOwners?.[homeId] ?? null,
    visitStatus: "home",
    cloakColor: cand.cloakColor,
    hairColor: cand.hairColor,
    skinTone: cand.skinTone,
    hairStyle: cand.hairStyle,
    lifeStage: cand.lifeStage,
    ageDays: isBirth ? 0 : 16,
    isChief: false,
    traits: cand.traits,
    stats: unitStats,
    skills: unitSkills,
    skillXp: {},
    rtsOrder: null,
    drafted: false,
    teachCooldown: 0,
    partnerId: null,
    parentIds: cand.parentIds,
    childrenIds: [],
    homeBuildingId: null,
    hp: maxHp,
    maxHp,
    warmth: 88,
    mood: 84,
    energy: 90,
    hunger: 82,
    affectionXp: 15,
    affectionLevel: 1,
    gearTier: getTechUnlocked2(world, "woven_shelter") ? 1 : 0,
    weaponType: "none",
    curiosity: cand.traits.includes("curious_scout") ? 0.85 : 0.5,
    bravery: cand.traits.includes("brave_hunter") ? 0.8 : 0.5,
    voyageBoatId: null,
    killCount: 0,
    cognition: isBirth ? { stage: "awakening", awareness: 0, observedConcepts: [], socialCount: 0, focusObject: "embers" } : {
      stage: "awakening",
      awareness: 12,
      observedConcepts: [],
      socialCount: 0,
      focusObject: "berry_bush"
    },
    favoriteComfort: cand.favoriteComfort,
    activeWish: pickRandomWish(),
    wishFulfilledToday: false,
    currentDialogue: isBirth ? "Soft curious blinking beside the warm embers." : `Let me explore ${homeDef.name} and meet your people first!`,
    lastMemory: isBirth ? "Born beside the warm hearth." : `Disembarked onto ${homeDef.name} pier.`,
    relationships: {},
    hangOutTargetId: null,
    socialCooldown: 12,
    pairChatCooldowns: {},
    suggestedTask: null,
    activeTask: "explore",
    state: isBirth ? "sleeping" : "exploring",
    autonomyReason: isBirth ? "Taking in warmth and light like a newborn." : `Walking up from ${homeDef.name} pier to meet villagers.`,
    thoughtBubble: isBirth ? "Ooh..." : "Landfall!",
    thoughtTimer: 3.5,
    x: sx,
    y: sy,
    targetX: homeDef.centerX,
    targetY: homeDef.centerY,
    facing: 1,
    animPhase: 0,
    bounceScale: 1,
    decisionCooldown: 2,
    birthCooldownDays: 0,
    attackCooldown: 0,
    edgeAckCooldown: 0,
    stuckState: { lastX: sx, lastY: sy, timer: 0, detourSign: 1 },
    personality: buildNpcPersonality(
      `vil_arr_${cand.id}`,
      cand.traits,
      cand.traits.includes("curious_scout") ? 0.85 : 0.5,
      cand.traits.includes("brave_hunter") ? 0.8 : 0.5,
      false
    ),
    knowledge: createKnowledgeProfile(isBirth ? "infant" : "awakening"),
    memories: [
      {
        id: `mem_arr_${cand.id}`,
        day: world.environment.dayCount,
        timeOfDay: world.environment.timeOfDay,
        kind: isBirth ? "social" : "discovery",
        summary: isBirth ? `Born beside the warm hearth on ${homeDef.name}.` : `Disembarked from skiff at ${homeDef.name} shore.`,
        actorIds: cand.parentIds ? [...cand.parentIds] : [],
        importance: 8,
        sentiment: "positive"
      }
    ],
    carriedResource: null,
    carriedAmount: 0,
    carryCapacity: 6,
    reputation: 10,
    banished: false
  };
  world.villagers.push(villager);
  if (migrantBoat) {
    sendMigrantBoatAway(migrantBoat);
  }
  if (!isBirth && cand.greeterId) {
    const greeter = world.villagers.find((v) => v.id === cand.greeterId);
    if (greeter) {
      processSocialEncounter(world, villager, greeter, (target, concept, peerFirst) => {
        learnConcept(world, target, concept, particles, peerFirst);
      });
    }
  }
  if (isBirth && cand.parentIds) {
    for (const pid of cand.parentIds) {
      const par = world.villagers.find((u) => u.id === pid);
      if (par) {
        if (!par.childrenIds.includes(villager.id)) par.childrenIds.push(villager.id);
        upsertLineage(world, par);
      } else if (world.lineage?.[pid]) {
        if (!world.lineage[pid].childrenIds.includes(villager.id)) {
          world.lineage[pid].childrenIds.push(villager.id);
        }
      }
    }
  }
  upsertLineage(world, villager);
  addChronicle(
    world,
    cand.kind === "birth" ? `Baby ${cand.name} was born on ${homeDef.name}!` : `${cand.name} disembarked at ${homeDef.name} pier and joined the village!`,
    cand.kind === "birth" ? "birth" : "arrival",
    {
      islandId: homeId,
      participantIds: [villager.id, ...cand.greeterId ? [cand.greeterId] : []]
    }
  );
  spawnParticle(particles, {
    kind: "heart",
    x: villager.x,
    y: villager.y - 12,
    vx: 0,
    vy: -12,
    maxLife: 1.2,
    size: 2.5,
    alpha: 1,
    phase: 0,
    color: "#F43F5E"
  });
}
function suggestGateDecision(world, arrivalId, lean) {
  const arr = world.pendingArrivals.find((a) => a.id === arrivalId);
  if (!arr) return { ok: false, message: "No traveler waiting." };
  arr.godSuggestion = lean;
  const greeter = arr.greeterId ? world.villagers.find((v) => v.id === arr.greeterId) ?? null : null;
  if (arr.decisionVerdict !== "talking") evaluateTravelerDecision(world, arr, greeter);
  return {
    ok: true,
    message: lean === "neutral" ? "Withdrew divine suggestion." : `Whispered ${lean} suggestion to villagers.`
  };
}
function letVillagerDecideArrival(world, arrivalId, particles) {
  const arr = world.pendingArrivals.find((a) => a.id === arrivalId);
  if (!arr) return { ok: false, message: "No arrival waiting." };
  const homeId = arr.islandId ?? world.localHomeIslandId ?? "cradle";
  const pop = world.villagers.filter((v) => (v.homeIslandId ?? v.islandId) === homeId).length;
  const beds = getHousingBedsForIsland(world, homeId);
  if (arr.kind === "birth") {
    resolveArrival(world, arrivalId, pop < beds, particles);
    return { ok: true, message: pop < beds ? `Celebrated ${arr.name}'s birth!` : `Insufficient shelter beds on ${ISLAND_DEFS[homeId].name}.` };
  }
  const greeter = arr.greeterId ? world.villagers.find((v) => v.id === arr.greeterId) ?? null : null;
  const verdict = evaluateTravelerDecision(world, arr, greeter);
  const foodOk = getVillageRes(world, homeId).food >= pop * 6 + 6;
  const accept = verdict === "recommend_welcome" && pop < beds && foodOk;
  resolveArrival(world, arrivalId, accept, particles);
  return {
    ok: true,
    message: accept ? `Villagers welcomed ${arr.name}!` : `Villagers declined ${arr.name} (housing/food cap or caution).`
  };
}
function chatWithVillager(world, villagerId, particles) {
  const v = [...world.villagers, ...world.clanVillagers].find((item) => item.id === villagerId);
  if (!v) return null;
  const season = SEASON_META[world.environment.season].label.toLowerCase();
  const lines = [
    `The ${season} wind carries salt and pine across ${ISLAND_DEFS[v.islandId].name}.`,
    `Our knowledge grows around the embers\u2014${v.autonomyReason.toLowerCase()}`,
    v.warmth < 45 ? "Brr, I need a wool cloak or bonfire soon." : "The sky-sea looks calm from the cliff rim."
  ];
  v.currentDialogue = lines[Math.floor(Math.random() * lines.length)];
  v.mood = Math.min(100, v.mood + 5);
  v.affectionXp += 4;
  v.affectionLevel = Math.min(5, 1 + Math.floor(v.affectionXp / 25));
  v.cognition.socialCount += 1;
  spawnParticle(particles, {
    kind: "sparkle",
    x: v.x,
    y: v.y - 12,
    vx: 0,
    vy: -10,
    maxLife: 1,
    size: 2,
    alpha: 0.9,
    phase: 0,
    color: "#FDE047"
  });
  return v.currentDialogue;
}
function speakGodComment(world, villagerId, kind, particles) {
  const v = [...world.villagers, ...world.clanVillagers].find((item) => item.id === villagerId);
  if (!v) return { ok: false, note: "No inhabitant selected." };
  v.bounceScale = 1.18;
  if (kind === "praise") {
    v.mood = Math.min(100, v.mood + 7);
    v.thoughtBubble = "Kind sky!";
    v.thoughtTimer = 3;
    spawnParticle(particles, {
      kind: "heart",
      x: v.x,
      y: v.y - 12,
      vx: 0,
      vy: -12,
      maxLife: 1.1,
      size: 2.2,
      alpha: 1,
      phase: 0,
      color: "#F43F5E"
    });
    return { ok: true, note: `Praised ${v.name.split(" ")[0]} gently.` };
  }
  if (kind === "encourage_explore") {
    v.curiosity = Math.min(1, v.curiosity + 0.14);
    v.cognition.awareness = Math.min(100, v.cognition.awareness + 4);
    v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);
    v.thoughtBubble = "Let me look!";
    v.thoughtTimer = 3;
    assignCognitiveExplorationTarget(world, v);
    v.decisionCooldown = 4.5;
    return { ok: true, note: `Nudged ${v.name.split(" ")[0]}'s curiosity to explore nearby wonders.` };
  }
  if (kind === "remind_eat") {
    v.thoughtBubble = "Better eat!";
    v.thoughtTimer = 2.8;
    v.decisionCooldown = 0.4;
    return { ok: true, note: `Reminded ${v.name.split(" ")[0]} to check food stores.` };
  }
  v.thoughtBubble = "Rest by fire!";
  v.thoughtTimer = 2.8;
  v.decisionCooldown = 0.4;
  return { ok: true, note: `Suggested ${v.name.split(" ")[0]} rest beside the hearth.` };
}
function suggestVillagerRole(world, villagerId, task) {
  const v = [...world.villagers, ...world.clanVillagers].find((item) => item.id === villagerId);
  if (!v) return { accepted: false, message: "No villager selected." };
  if (world.gameMode === "sovereign_sandbox" || world.gameMode === "shared_siege") {
    if (task) {
      v.cognition.awareness = Math.max(v.cognition.awareness, 55);
      v.cognition.stage = cognitiveStageFromAwareness(v.cognition.awareness);
      v.cognition.socialCount = Math.max(v.cognition.socialCount, 2);
      v.rtsOrder = null;
      v.suggestedTask = task;
      v.activeTask = task;
      assignTargetForTask(world, v, task);
      v.state = task === "hunt" ? "hunting" : task === "explore" ? "exploring" : "walking";
      v.autonomyReason = `${TASK_BY_ID[task].verb} (RTS Command).`;
      v.thoughtBubble = `${TASK_BY_ID[task].label}!`;
      v.thoughtTimer = 2.6;
      v.decisionCooldown = 8;
      return { accepted: true, message: `Commanded ${v.name.split(" ")[0]} to ${TASK_BY_ID[task].label}.` };
    }
    v.suggestedTask = null;
    v.rtsOrder = null;
    v.decisionCooldown = 0.5;
    return { accepted: true, message: `${v.name.split(" ")[0]} freed to follow autonomy.` };
  }
  if (v.isNativeClan) {
    return { accepted: false, message: `${v.name.split(" ")[0]} follows their native clan elders.` };
  }
  if (task && task !== "explore" && !canVillagerWork(world, v)) {
    return {
      accepted: false,
      message: `${v.name.split(" ")[0]} needs ${Math.max(0, 2 - v.cognition.observedConcepts.length)} more wonders & ${Math.max(0, 1 - v.cognition.socialCount)} more social chats first!`
    };
  }
  if (task && !getTaskAvailable(world, task, v.homeIslandId ?? v.islandId)) {
    return { accepted: false, message: "Requires an unlocked discovery & structure in this village first." };
  }
  v.suggestedTask = task;
  v.decisionCooldown = 0.5;
  return {
    accepted: true,
    message: task ? `Suggested ${TASK_BY_ID[task].label} to ${v.name.split(" ")[0]}.` : `${v.name.split(" ")[0]} will follow their own judgment.`
  };
}
function sendVillagerToHangOut(world, villagerId, targetId) {
  const all = [...world.villagers, ...world.clanVillagers];
  const v = all.find((i) => i.id === villagerId);
  const t = all.find((i) => i.id === targetId);
  if (!v || !t) return "Neighbor unavailable.";
  v.targetX = t.x;
  v.targetY = t.y;
  v.state = "socializing";
  v.hangOutTargetId = t.id;
  processDirectSocialShift(world, v, t, 2, "hangout");
  return `Suggested ${v.name.split(" ")[0]} visit ${t.name.split(" ")[0]}.`;
}
function suggestChief(world, villagerId) {
  const v = world.villagers.find((i) => i.id === villagerId);
  if (!v || v.lifeStage !== "adult" && v.lifeStage !== "elder") {
    return { ok: false, reason: "Only adults or elders can bear the Chief sash." };
  }
  for (const item of world.villagers) item.isChief = item.id === v.id;
  world.chiefId = v.id;
  addChronicle(world, `${v.name} became Chief of the archipelago.`, "chief");
  return { ok: true, reason: `${v.name} accepted the Chief sash.` };
}
function setChiefFocus(world, focus) {
  world.chiefFocus = focus;
}
function suggestBuildingSpot(world, buildingType, islandId, x, y, cropType, livestockKind) {
  const isl = ISLAND_DEFS[islandId];
  const bp = BUILDING_BLUEPRINTS[buildingType];
  if (!isPointInsideIsland(isl, x, y, 22)) {
    return { ok: false, message: "Click inside the island plateau to place structure." };
  }
  if (world.gameMode === "sovereign_sandbox") {
    const b = createBuildingInstance(world, buildingType, islandId, Math.round(x), Math.round(y), cropType ?? "turnip", livestockKind ?? "sheep");
    b.unlocked = true;
    b.constructionStage = "complete";
    b.pausedForMaterials = false;
    b.level = 1;
    world.buildings.push(b);
    world.islands[islandId].discovered = true;
    world.islands[islandId].settledDay ??= world.environment.dayCount;
    if (buildingType === "pasture") spawnPastureLivestock(world, b);
    if (buildingType === "dock") {
      world.islands[islandId].dockBuilt = true;
      spawnDockBoat(world, b, "fishing_skiff");
    }
    addChronicle(world, `Sovereign decreed ${b.name} upon ${isl.name}.`, "build");
    return { ok: true, message: `Placed ${b.name} instantaneously on ${isl.name}!` };
  }
  if (world.gameMode === "shared_siege") {
    if (!getTechUnlocked2(world, bp.requiredTechId)) {
      return { ok: false, message: `Requires ${TECH_BY_ID[bp.requiredTechId]?.name ?? "technology"} first.` };
    }
    const cost = getBuildCost(bp);
    const siegeRes = getVillageRes(world, "cradle");
    if (!hasResourcesFor(siegeRes, cost)) {
      return { ok: false, message: `Need more materials to raise ${bp.name}.` };
    }
    spendVillageResources(world, "cradle", cost);
    const b = createBuildingInstance(world, buildingType, islandId, Math.round(x), Math.round(y), cropType ?? "turnip", livestockKind ?? "sheep");
    b.deliveredMaterials = { ...cost };
    world.buildings.push(b);
    addChronicle(world, `Defenders staked ${b.name} on ${isl.name}.`, "build");
    return { ok: true, message: `Staked ${b.name} on ${isl.name} \u2014 builders moving to construct!` };
  }
  if (!world.islands[islandId]?.discovered) {
    return { ok: false, message: "Villagers have not explored that island yet (send scouts or build a sky-bridge)." };
  }
  if (!getTechUnlocked2(world, bp.requiredTechId)) {
    return {
      ok: false,
      message: `Suggested ${bp.name} stake placed \u2014 awaits ${TECH_BY_ID[bp.requiredTechId]?.name ?? "discovery"}.`
    };
  }
  const sug = {
    id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    buildingType,
    islandId,
    x: Math.round(x),
    y: Math.round(y),
    cropType,
    livestockKind,
    createdAtDay: world.environment.dayCount,
    acceptedByVillagers: true
  };
  world.placedSuggestions.push(sug);
  if (world.placedSuggestions.length > 6) world.placedSuggestions.shift();
  return {
    ok: true,
    message: `Suggested ${bp.name} on ${isl.name}. Builders will start once materials allow.`
  };
}
function suggestBuildingProject(world, buildingId) {
  const b = world.buildings.find((item) => item.id === buildingId);
  if (!b) return { ok: false, message: "Structure not found." };
  if (b.level >= b.maxLevel) return { ok: false, message: `${b.name} is already at highest tier.` };
  if (world.gameMode === "sovereign_sandbox") {
    b.unlocked = true;
    b.level = Math.min(b.maxLevel, b.level + 1);
    b.disrepair = 0;
    b.hp = b.maxHp;
    addChronicle(world, `Sovereign elevated ${b.name} to Lv.${b.level}.`, "build");
    return { ok: true, message: `Upgraded ${b.name} to Lv.${b.level}!` };
  }
  world.suggestedBuildingId = b.id;
  return { ok: true, message: `Suggested upgrading ${b.name} when materials allow.` };
}
function suggestActiveTech(world, techId) {
  const frontier = getAvailableFrontierTechs(world.unlockedTechIds);
  const found = frontier.find((t) => t.id === techId);
  if (!found) return { ok: false, message: "Wait until prerequisites are discovered." };
  world.activeTechId = found.id;
  return { ok: true, message: `Suggested studying ${found.name} around the bonfire & library.` };
}
function suggestDiplomacyAction(world, cultureId, action, sourceIslandId) {
  const dip = world.diplomacy[cultureId];
  if (!dip) return { ok: false, message: "Unknown culture." };
  if (cultureId !== "mist_mariner" && world.gameMode !== "sovereign_sandbox") {
    return { ok: false, message: "Already peaceful allies." };
  }
  const srcIsle = sourceIslandId ?? world.localHomeIslandId ?? "cradle";
  const srcRes = getVillageRes(world, srcIsle);
  if (action === "gift") {
    if (world.gameMode !== "sovereign_sandbox") {
      if (srcRes.timber < 10 && srcRes.grain < 6) {
        return { ok: false, message: "Need at least 10 Timber or 6 Grain to offer a trade gift." };
      }
      if (srcRes.timber >= 10) spendVillageResources(world, srcIsle, { timber: 10 });
      else spendVillageResources(world, srcIsle, { grain: 6 });
      syncCombinedFood(world);
    }
    dip.trust = Math.min(100, dip.trust + 18);
    dip.lastEnvoyDay = world.environment.dayCount;
    addChronicle(world, `Sent a peace gift across the sky-sea to the ${CULTURES[cultureId].name} (+Trust).`, "voyage");
    return { ok: true, message: `Dispatched peace gift to ${CULTURES[cultureId].name}.` };
  }
  if (world.gameMode !== "sovereign_sandbox" && world.environment.dayCount - dip.lastEnvoyDay < 1) {
    return { ok: false, message: "An envoy already parleyed today." };
  }
  dip.lastEnvoyDay = world.environment.dayCount;
  dip.trust = Math.min(100, dip.trust + 11);
  addChronicle(world, `Island envoy met ${CULTURES[cultureId].name} elders for parley (+Trust).`, "voyage");
  return { ok: true, message: `Envoy parley improved ${CULTURES[cultureId].name} relations.` };
}
function getActorHomeIsland(world, actorPlayerId) {
  if (actorPlayerId) {
    const found = PLAYER_VILLAGE_ISLANDS.find((id) => world.islandOwners?.[id] === actorPlayerId);
    if (found) return found;
  }
  return world.localHomeIslandId ?? "cradle";
}
function applyWorldCommand(world, cmd, particles, actorPlayerId) {
  const actorHome = getActorHomeIsland(world, actorPlayerId);
  switch (cmd.kind) {
    case "set_speed":
      world.settings.simSpeed = cmd.speed;
      return { ok: true, message: cmd.speed === 0 ? "Simulation paused." : `Simulation speed ${cmd.speed}x.` };
    case "assign_task": {
      const target = [...world.villagers, ...world.clanVillagers].find((i) => i.id === cmd.villagerId);
      if (!target) return { ok: false, message: "Inhabitant not found." };
      if (!canControlVillager(world, target, actorPlayerId)) {
        return { ok: false, message: "You only command villagers belonging to your own village." };
      }
      const r = suggestVillagerRole(world, cmd.villagerId, cmd.task);
      return { ok: r.accepted, message: r.message };
    }
    case "move_villager": {
      const all = [...world.villagers, ...world.clanVillagers];
      const v = all.find((i) => i.id === cmd.villagerId);
      if (!v) return { ok: false, message: "Inhabitant not found." };
      if (!canControlVillager(world, v, actorPlayerId)) {
        return { ok: false, message: "Cannot order inhabitants of another village." };
      }
      const isl = ISLAND_DEFS[cmd.islandId];
      if (!isPointInsideIsland(isl, cmd.x, cmd.y, 12)) {
        return { ok: false, message: "Click inside an island plateau to move." };
      }
      if (v.islandId !== cmd.islandId && world.gameMode === "sovereign_sandbox") {
        v.islandId = cmd.islandId;
        v.x = cmd.x;
        v.y = cmd.y;
      } else {
        const reach = checkTargetReachability(world, v.islandId, v.x, v.y, cmd.x, cmd.y, ARCHIPELAGO_LANDMARKS3);
        if (!reach.reachable) {
          return { ok: false, message: reach.reason ?? "Destination unreachable across deep water or cliffs." };
        }
      }
      v.targetX = cmd.x;
      v.targetY = cmd.y;
      if (v.stuckState) {
        v.stuckState.waypoints = void 0;
        v.stuckState.navBlockedReason = null;
      }
      v.state = "walking";
      v.thoughtBubble = "On my way!";
      v.thoughtTimer = 2.4;
      v.decisionCooldown = 12;
      return { ok: true, message: `Moved ${v.name.split(" ")[0]} across ${isl.name}.` };
    }
    case "god_comment": {
      const r = speakGodComment(world, cmd.villagerId, cmd.comment, particles);
      return { ok: r.ok, message: r.note };
    }
    case "chat_villager": {
      const line = chatWithVillager(world, cmd.villagerId, particles);
      return line ? { ok: true, message: line } : { ok: false, message: "Inhabitant not found." };
    }
    case "hang_out": {
      const v = world.villagers.find((i) => i.id === cmd.villagerId);
      if (v && !canControlVillager(world, v, actorPlayerId)) {
        return { ok: false, message: "Cannot order another village\u2019s inhabitants." };
      }
      const msg = sendVillagerToHangOut(world, cmd.villagerId, cmd.targetId);
      return { ok: true, message: msg };
    }
    case "set_chief": {
      const v = world.villagers.find((i) => i.id === cmd.villagerId);
      if (!v || !canControlVillager(world, v, actorPlayerId)) {
        return { ok: false, message: "Select an adult in your own village as Chief." };
      }
      const r = suggestChief(world, cmd.villagerId);
      return { ok: r.ok, message: r.reason };
    }
    case "set_chief_focus":
      setChiefFocus(world, cmd.focus);
      return { ok: true, message: `Chief Focus set to ${cmd.focus}.` };
    case "place_building":
      if (!canControlIsland(world, cmd.islandId, actorPlayerId)) {
        return { ok: false, message: `You only build within your own village (${ISLAND_DEFS[actorHome].name}).` };
      }
      return suggestBuildingSpot(world, cmd.buildingType, cmd.islandId, cmd.x, cmd.y, cmd.cropType, cmd.livestockKind);
    case "upgrade_building": {
      const b = world.buildings.find((item) => item.id === cmd.buildingId);
      if (!b) return { ok: false, message: "Structure not found." };
      if (!canControlIsland(world, b.islandId, actorPlayerId)) {
        return { ok: false, message: "Cannot upgrade structures in another village." };
      }
      return suggestBuildingProject(world, cmd.buildingId);
    }
    case "select_tech":
      return suggestActiveTech(world, cmd.techId);
    case "diplomacy": {
      if (cmd.action === "trust_delta") {
        const dip = world.diplomacy[cmd.cultureId];
        if (!dip) return { ok: false, message: "Culture not found." };
        dip.trust = Math.max(0, Math.min(100, dip.trust + (cmd.delta ?? 0)));
        if (dip.trust >= 65) dip.status = "peaceful";
        else if (dip.trust >= 34) dip.status = "wary";
        else if (dip.trust >= 16) dip.status = "tense";
        else dip.status = "war";
        return { ok: true, message: `${CULTURES[cmd.cultureId].name} trust adjusted to ${dip.trust}% (${dip.status}).` };
      }
      return suggestDiplomacyAction(world, cmd.cultureId, cmd.action, actorHome);
    }
    case "set_village_policy": {
      if (!canControlIsland(world, cmd.islandId, actorPlayerId)) {
        return { ok: false, message: "You can only set policies for your own village." };
      }
      if (!world.villagePolicies) world.villagePolicies = {};
      const cur = world.villagePolicies[cmd.islandId] ?? { rationMode: "normal", borderPolicy: "parley" };
      world.villagePolicies[cmd.islandId] = {
        rationMode: cmd.rationMode ?? cur.rationMode,
        borderPolicy: cmd.borderPolicy ?? cur.borderPolicy
      };
      return {
        ok: true,
        message: `${ISLAND_DEFS[cmd.islandId].name} policy: ${world.villagePolicies[cmd.islandId].rationMode} rations, ${world.villagePolicies[cmd.islandId].borderPolicy.replace("_", " ")} borders.`
      };
    }
    case "send_caravan": {
      if (!canControlIsland(world, cmd.fromIslandId, actorPlayerId)) {
        return { ok: false, message: "You can only dispatch caravans from your own village." };
      }
      if (cmd.fromIslandId === cmd.toIslandId) {
        return { ok: false, message: "Choose a different destination island." };
      }
      const amt = Math.max(1, Math.round(cmd.amount));
      const srcRes = getVillageRes(world, cmd.fromIslandId);
      if ((srcRes[cmd.resource] ?? 0) < amt) {
        return { ok: false, message: `Insufficient ${cmd.resource} in ${ISLAND_DEFS[cmd.fromIslandId].name}.` };
      }
      spendVillageResources(world, cmd.fromIslandId, { [cmd.resource]: amt });
      addVillageResource(world, cmd.toIslandId, cmd.resource, amt);
      const destCulture = world.islands[cmd.toIslandId]?.owningCultureId ?? ISLAND_DEFS[cmd.toIslandId].defaultCultureId;
      if (world.diplomacy?.[destCulture]) {
        world.diplomacy[destCulture].trust = Math.min(100, world.diplomacy[destCulture].trust + 8);
      }
      addChronicle(
        world,
        `Supply caravan delivered ${amt} ${cmd.resource} from ${ISLAND_DEFS[cmd.fromIslandId].name} to ${ISLAND_DEFS[cmd.toIslandId].name}.`,
        "voyage"
      );
      return {
        ok: true,
        message: `Delivered ${amt} ${cmd.resource} to ${ISLAND_DEFS[cmd.toIslandId].name}!`
      };
    }
    case "resolve_arrival": {
      if (typeof cmd.accept === "boolean") {
        resolveArrival(world, cmd.arrivalId, cmd.accept, particles);
        return { ok: true, message: cmd.accept ? "Welcomed arrival!" : "Declined traveler." };
      }
      return letVillagerDecideArrival(world, cmd.arrivalId, particles);
    }
    case "suggest_gate":
      return suggestGateDecision(world, cmd.arrivalId, cmd.lean);
    case "sovereign_weather":
      if (world.gameMode !== "sovereign_sandbox") return { ok: false, message: "Requires Sovereign Sandbox mode." };
      world.environment.weather = cmd.weather;
      world.environment.weatherMode = "manual";
      return { ok: true, message: `Skies shifted to ${cmd.weather}.` };
    case "sovereign_time":
      if (world.gameMode !== "sovereign_sandbox") return { ok: false, message: "Requires Sovereign Sandbox mode." };
      world.environment.timeOfDay = Math.max(0, Math.min(0.99, cmd.timeOfDay));
      return { ok: true, message: "Set sky sun & moon phase." };
    case "sovereign_season":
      if (world.gameMode !== "sovereign_sandbox") return { ok: false, message: "Requires Sovereign Sandbox mode." };
      world.environment.season = cmd.season;
      return { ok: true, message: `Season turned to ${SEASON_META[cmd.season].label}.` };
    case "sovereign_festival":
      if (world.gameMode !== "sovereign_sandbox") return { ok: false, message: "Requires Sovereign Sandbox mode." };
      world.environment.festivalActive = !world.environment.festivalActive;
      for (const v of world.villagers) {
        if (canControlVillager(world, v, actorPlayerId)) v.mood = Math.min(100, v.mood + 18);
      }
      addChronicle(world, world.environment.festivalActive ? "Lantern Festival lit across the archipelago!" : "Lantern Festival drew softly to a close.", "festival");
      return { ok: true, message: world.environment.festivalActive ? "Festival ignited!" : "Festival ended." };
    case "sovereign_grant_resources":
      if (world.gameMode !== "sovereign_sandbox") return { ok: false, message: "Requires Sovereign Sandbox mode." };
      addVillageResource(world, actorHome, "berries", 40);
      addVillageResource(world, actorHome, "grain", 40);
      addVillageResource(world, actorHome, "timber", 60);
      addVillageResource(world, actorHome, "stone", 50);
      addVillageResource(world, actorHome, "copper", 25);
      addVillageResource(world, actorHome, "bronze", 20);
      addVillageResource(world, actorHome, "iron", 20);
      addVillageResource(world, actorHome, "wool", 25);
      addVillageResource(world, actorHome, "hearthlight", 30);
      syncCombinedFood(world);
      return { ok: true, message: `Granted bounty to ${ISLAND_DEFS[actorHome].name} (+60 Timber, +50 Stone, Food & Ores).` };
    case "sovereign_spawn_villager": {
      if (world.gameMode !== "sovereign_sandbox") return { ok: false, message: "Requires Sovereign Sandbox mode." };
      if (!canControlIsland(world, cmd.islandId, actorPlayerId)) {
        return { ok: false, message: `You can only summon villagers into your own village (${ISLAND_DEFS[actorHome].name}).` };
      }
      const names = new Set(world.villagers.map((v) => v.name));
      const cand = generateCandidate("traveler", world.environment.dayCount, names);
      const isl = ISLAND_DEFS[cmd.islandId];
      const nv = makeFounder(
        `vil_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        cand.name,
        cand.cloakColor,
        cand.hairColor,
        cand.skinTone,
        cand.hairStyle,
        cand.traits,
        0,
        0
      );
      nv.islandId = cmd.islandId;
      nv.homeIslandId = cmd.islandId;
      nv.ownerPlayerId = world.islandOwners?.[cmd.islandId] ?? actorPlayerId ?? null;
      nv.cultureId = world.islands[cmd.islandId]?.owningCultureId ?? "hearthfolk";
      nv.x = isl.centerX + (Math.random() * 60 - 30);
      nv.y = isl.centerY + (Math.random() * 44 - 22);
      nv.targetX = isl.centerX;
      nv.targetY = isl.centerY;
      nv.cognition = { stage: "reasoning", awareness: 65, observedConcepts: ["berry_bush", "spring", "embers"], socialCount: 2, focusObject: null };
      nv.stuckState = { lastX: nv.x, lastY: nv.y, timer: 0, detourSign: 1 };
      world.villagers.push(nv);
      upsertLineage(world, nv);
      addChronicle(world, `Sovereign summoned ${nv.name} onto ${isl.name}.`, "arrival");
      return { ok: true, message: `Summoned ${nv.name} onto ${isl.name}.` };
    }
    case "sovereign_build_bridge": {
      if (world.gameMode !== "sovereign_sandbox") return { ok: false, message: "Requires Sovereign Sandbox mode." };
      const br = world.bridges.find((b) => b.id === cmd.bridgeId);
      if (!br) return { ok: false, message: "Bridge not found." };
      br.built = true;
      br.progress = 1;
      discoverIsland(world, br.fromIsland, "Sovereign");
      discoverIsland(world, br.toIsland, "Sovereign");
      addChronicle(world, `Sovereign raised the ${br.name}!`, "voyage");
      return { ok: true, message: `${br.name} completed!` };
    }
    case "sovereign_build_cableway": {
      if (world.gameMode !== "sovereign_sandbox") return { ok: false, message: "Requires Sovereign Sandbox mode." };
      const cb = world.cableways.find((c) => c.id === cmd.cableId);
      if (!cb) return { ok: false, message: "Cableway not found." };
      cb.built = true;
      cb.progress = 1;
      discoverIsland(world, cb.fromIsland, "Sovereign");
      discoverIsland(world, cb.toIsland, "Sovereign");
      addChronicle(world, `Sovereign strung the ${cb.name} sky-gondola!`, "voyage");
      return { ok: true, message: `${cb.name} completed!` };
    }
    case "sovereign_uplift_villager": {
      if (world.gameMode !== "sovereign_sandbox") return { ok: false, message: "Requires Sovereign Sandbox mode." };
      const v = [...world.villagers, ...world.clanVillagers].find((i) => i.id === cmd.villagerId);
      if (!v) return { ok: false, message: "Inhabitant not found." };
      if (!canControlVillager(world, v, actorPlayerId)) {
        return { ok: false, message: "Cannot uplift another village\u2019s unit." };
      }
      v.hp = v.maxHp;
      v.hunger = 100;
      v.warmth = 100;
      v.energy = 100;
      v.mood = 100;
      v.cognition = {
        stage: "enlightened",
        awareness: 100,
        observedConcepts: ["berry_bush", "flint_pile", "branch_pile", "spring", "embers", "horizon", "ruin"],
        socialCount: 6,
        focusObject: null
      };
      v.thoughtBubble = "Enlightened!";
      v.thoughtTimer = 3.2;
      return { ok: true, message: `Uplifted ${v.name.split(" ")[0]}'s mind & vitality.` };
    }
    case "sovereign_unlock_all_tech":
      if (world.gameMode !== "sovereign_sandbox") return { ok: false, message: "Requires Sovereign Sandbox mode." };
      world.unlockedTechIds = TECH_TREE.map((t) => t.id);
      world.activeTechId = null;
      addChronicle(world, "Sovereign unlocked all archipelago discoveries!", "tech");
      return { ok: true, message: "All cultural technologies unlocked!" };
    case "rts_order_units": {
      if (world.gameMode !== "sovereign_sandbox" && world.gameMode !== "shared_siege") {
        return { ok: false, message: "Direct RTS orders are active in Sovereign Sandbox & Shared Siege." };
      }
      const ids = new Set(cmd.villagerIds);
      let count = 0;
      const spreadCount = Math.max(1, ids.size);
      let idx = 0;
      for (const v of world.villagers) {
        if (!ids.has(v.id) || v.lifeStage === "infant") continue;
        if (!canControlVillager(world, v, actorPlayerId)) continue;
        if (!cmd.order) {
          v.rtsOrder = null;
          v.decisionCooldown = 0.2;
          count += 1;
          continue;
        }
        const offsetAng = idx / spreadCount * Math.PI * 2;
        const offsetR = spreadCount > 1 && cmd.order.kind === "move" ? 14 : 0;
        const ox = cmd.order.x + Math.cos(offsetAng) * offsetR;
        const oy = cmd.order.y + Math.sin(offsetAng) * offsetR;
        if (v.islandId !== cmd.order.islandId && world.gameMode === "sovereign_sandbox") {
          v.islandId = cmd.order.islandId;
          v.x = ox;
          v.y = oy;
        } else if (cmd.order.kind === "move") {
          const reach = checkTargetReachability(world, v.islandId, v.x, v.y, ox, oy, ARCHIPELAGO_LANDMARKS3);
          if (!reach.reachable) {
            v.thoughtBubble = "No route!";
            v.thoughtTimer = 2.2;
            continue;
          }
        }
        v.rtsOrder = { ...cmd.order, x: ox, y: oy };
        v.targetX = ox;
        v.targetY = oy;
        if (v.stuckState) {
          v.stuckState.waypoints = void 0;
        }
        v.state = cmd.order.kind === "attack" ? "fighting" : cmd.order.kind === "hold" ? "working" : "walking";
        v.thoughtBubble = cmd.order.kind === "attack" ? "Attack!" : cmd.order.kind === "gather" ? "Gathering!" : cmd.order.kind === "build" ? "Building!" : cmd.order.kind === "hold" ? "Holding!" : "Moving!";
        v.thoughtTimer = 2.2;
        idx += 1;
        count += 1;
      }
      if (count === 0) return { ok: false, message: "Select one or more non-infant units from your village first." };
      return {
        ok: true,
        message: cmd.order ? `Ordered ${count} unit${count > 1 ? "s" : ""} (${cmd.order.kind}).` : `Cleared RTS orders for ${count} unit${count > 1 ? "s" : ""}.`
      };
    }
    case "sovereign_draft_toggle": {
      const ids = new Set(cmd.villagerIds);
      let count = 0;
      for (const v of world.villagers) {
        if (!ids.has(v.id) || v.lifeStage === "infant") continue;
        if (!canControlVillager(world, v, actorPlayerId)) continue;
        v.drafted = typeof cmd.drafted === "boolean" ? cmd.drafted : !v.drafted;
        if (v.drafted) {
          v.activeTask = "guard";
          v.thoughtBubble = "Arms ready!";
          v.thoughtTimer = 2.4;
        }
        updateVillagerEquipment(world, v);
        count += 1;
      }
      return count > 0 ? { ok: true, message: `Updated combat draft status for ${count} unit${count > 1 ? "s" : ""}.` } : { ok: false, message: "No eligible units selected in your village." };
    }
    case "dev_action": {
      const targetIsle = cmd.islandId ?? actorHome;
      const isl = ISLAND_DEFS[targetIsle];
      switch (cmd.action) {
        case "grant_resources": {
          const amt = cmd.amount ?? 50;
          addVillageResource(world, targetIsle, "berries", amt);
          addVillageResource(world, targetIsle, "grain", amt);
          addVillageResource(world, targetIsle, "timber", amt);
          addVillageResource(world, targetIsle, "stone", amt);
          addVillageResource(world, targetIsle, "copper", Math.round(amt * 0.5));
          addVillageResource(world, targetIsle, "bronze", Math.round(amt * 0.4));
          addVillageResource(world, targetIsle, "iron", Math.round(amt * 0.4));
          addVillageResource(world, targetIsle, "herbs", Math.round(amt * 0.3));
          addVillageResource(world, targetIsle, "hearthlight", Math.round(amt * 0.5));
          syncCombinedFood(world);
          return { ok: true, message: `[Dev] Granted +${amt} resources to ${isl.name}.` };
        }
        case "spawn_villager": {
          const names = new Set(world.villagers.map((v) => v.name));
          const cand = generateCandidate("traveler", world.environment.dayCount, names);
          const nv = makeFounder(
            `vil_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            cand.name,
            cand.cloakColor,
            cand.hairColor,
            cand.skinTone,
            cand.hairStyle,
            cand.traits,
            0,
            0
          );
          nv.islandId = targetIsle;
          nv.homeIslandId = targetIsle;
          nv.ownerPlayerId = world.islandOwners?.[targetIsle] ?? null;
          nv.cultureId = world.islands[targetIsle]?.owningCultureId ?? "hearthfolk";
          nv.x = isl.centerX + (Math.random() * 56 - 28);
          nv.y = isl.centerY + (Math.random() * 44 - 22);
          nv.targetX = nv.x;
          nv.targetY = nv.y;
          nv.cognition = { stage: "reasoning", awareness: 70, observedConcepts: ["berry_bush", "embers", "horizon"], socialCount: 2, focusObject: null };
          nv.stuckState = { lastX: nv.x, lastY: nv.y, timer: 0, detourSign: 1 };
          world.villagers.push(nv);
          upsertLineage(world, nv);
          return { ok: true, message: `[Dev] Spawned ${nv.name} on ${isl.name}.` };
        }
        case "spawn_raider": {
          spawnSiegeRaider(
            world,
            `Dev Raider ${world.raiders.length + 1}`,
            targetIsle,
            isl.centerX + (Math.random() * 90 - 45),
            isl.centerY + (Math.random() * 70 - 35),
            Math.max(1, world.siege?.wave ?? 1)
          );
          return { ok: true, message: `[Dev] Spawned Raider on ${isl.name}.` };
        }
        case "spawn_animal": {
          const kind = cmd.entityKind === "boar" || cmd.entityKind === "rabbit" ? cmd.entityKind : "deer";
          const baseScale = kind === "boar" ? 1.15 : kind === "deer" ? 1.25 : 0.78;
          const maxHp = kind === "boar" ? 48 : kind === "deer" ? 32 : 12;
          const ax = isl.centerX + (Math.random() * 80 - 40);
          const ay = isl.centerY + (Math.random() * 60 - 30);
          world.wildHerds.push({
            id: `dev_herd_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            kind,
            islandId: targetIsle,
            x: ax,
            y: ay,
            targetX: isl.centerX,
            targetY: isl.centerY,
            facing: 1,
            pauseTimer: 1,
            hp: maxHp,
            maxHp,
            aggroTargetId: null,
            color: kind === "boar" ? "#584439" : kind === "deer" ? "#9C6D46" : "#C9C0B5",
            scale: Number((baseScale * (0.86 + Math.random() * 0.34)).toFixed(2)),
            stuckState: { lastX: ax, lastY: ay, timer: 0, detourSign: 1 }
          });
          return { ok: true, message: `[Dev] Spawned wild ${kind} on ${isl.name}.` };
        }
        case "spawn_stone": {
          world.wildNodes.push({
            id: `dev_stone_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            islandId: targetIsle,
            kind: "stone_boulder",
            x: isl.centerX + (Math.random() * isl.radiusX * 0.8 - isl.radiusX * 0.4),
            y: isl.centerY + (Math.random() * isl.radiusY * 0.7 - isl.radiusY * 0.35),
            amount: 24,
            maxAmount: 24,
            scale: 1.05
          });
          return { ok: true, message: `[Dev] Spawned stone boulder on ${isl.name}.` };
        }
        case "spawn_tree": {
          world.wildNodes.push({
            id: `dev_tree_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            islandId: targetIsle,
            kind: "tree",
            variant: targetIsle === "timbercrown" ? "cedar" : "oak",
            x: isl.centerX + (Math.random() * isl.radiusX * 0.8 - isl.radiusX * 0.4),
            y: isl.centerY + (Math.random() * isl.radiusY * 0.7 - isl.radiusY * 0.35),
            amount: 24,
            maxAmount: 24,
            scale: 1.15
          });
          return { ok: true, message: `[Dev] Spawned tree on ${isl.name}.` };
        }
        case "trigger_siege": {
          if (!world.siege) {
            world.siege = { wave: 0, nextWaveTimer: 1, activeFronts: [], totalKills: 0, warningText: null, lastWaveDay: 0 };
          }
          world.siege.nextWaveTimer = 0.05;
          tickSharedSiege(world, 0.1, particles);
          if (world.gameMode !== "shared_siege") {
            world.siege.wave += 1;
            spawnSiegeRaider(world, `Raid Vanguard`, "cradle", ISLAND_DEFS.cradle.dockSpot.x, ISLAND_DEFS.cradle.dockSpot.y, world.siege.wave);
            spawnSiegeRaider(world, `Bridge Raider`, "sunterrace", ISLAND_DEFS.sunterrace.centerX - 60, ISLAND_DEFS.sunterrace.centerY, world.siege.wave);
          }
          return { ok: true, message: `[Dev] Triggered multi-front Siege Wave ${world.siege.wave}!` };
        }
        case "advance_day": {
          world.environment.dayCount += 1;
          handleNewDayEvents(world);
          return { ok: true, message: `[Dev] Advanced to Day ${world.environment.dayCount}.` };
        }
        case "unlock_next_tech": {
          const frontier = getAvailableFrontierTechs(world.unlockedTechIds);
          const next = world.activeTechId && TECH_BY_ID[world.activeTechId] || frontier[0];
          if (!next) return { ok: false, message: "All technologies already unlocked." };
          if (!world.unlockedTechIds.includes(next.id)) world.unlockedTechIds.push(next.id);
          const nextFrontier = getAvailableFrontierTechs(world.unlockedTechIds);
          world.activeTechId = nextFrontier[0]?.id ?? null;
          return { ok: true, message: `[Dev] Unlocked ${next.name}!` };
        }
        case "unlock_all_tech": {
          world.unlockedTechIds = TECH_TREE.map((t) => t.id);
          world.activeTechId = null;
          return { ok: true, message: "[Dev] Unlocked every technology." };
        }
        case "finish_builds": {
          for (const b of world.buildings) {
            if (!b.unlocked && b.cultureId !== "ashen_raider") {
              b.unlocked = true;
              b.constructionStage = "complete";
              b.pausedForMaterials = false;
              b.level = Math.max(1, b.level);
            }
          }
          world.activeConstruction = null;
          return { ok: true, message: "[Dev] Completed all active & staked constructions." };
        }
        case "heal_all": {
          for (const v of world.villagers) {
            v.hp = v.maxHp;
            v.hunger = 100;
            v.warmth = 100;
            v.energy = 100;
            v.mood = 100;
            if (v.stats) {
              v.stats.bleedStack = 0;
              v.stats.bleedTimer = 0;
            }
          }
          return { ok: true, message: "[Dev] Healed all villagers & cured bleeding." };
        }
        case "reroll_traits": {
          const tgt = cmd.villagerId && world.villagers.find((v) => v.id === cmd.villagerId) || world.villagers[0];
          if (!tgt) return { ok: false, message: "No villager available." };
          if (cmd.traitId && TRAITS[cmd.traitId]) {
            if (!tgt.traits.includes(cmd.traitId)) {
              tgt.traits = [cmd.traitId, ...tgt.traits.slice(0, 2)];
            }
          } else {
            tgt.traits = rollBalancedTraits();
          }
          tgt.stats = rollUnitStats(tgt.traits, false);
          tgt.bioDescription = buildBioFromTraits(tgt.traits, false);
          upsertLineage(world, tgt);
          return { ok: true, message: `[Dev] Updated traits for ${tgt.name.split(" ")[0]}.` };
        }
        case "grant_skill_xp": {
          const tgt = cmd.villagerId && world.villagers.find((v) => v.id === cmd.villagerId) || world.villagers[0];
          if (!tgt) return { ok: false, message: "No villager available." };
          const skillId = cmd.skillId ?? "blade_mastery";
          gainSkillXp(world, tgt, skillId, cmd.amount ?? 30);
          return { ok: true, message: `[Dev] Granted ${SKILL_META[skillId].label} XP to ${tgt.name.split(" ")[0]}.` };
        }
        default:
          return { ok: false, message: "Unknown dev tool action." };
      }
    }
    default:
      return { ok: false, message: "Unsupported command." };
  }
}

// src/game/multiplayerSync.ts
var MULTIPLAYER_LOCKED_SPEED = 1;
function enforceMultiplayerClock(world) {
  if (!world.settings) {
    world.settings = {
      fpsCap: 60,
      simSpeed: MULTIPLAYER_LOCKED_SPEED,
      muted: true,
      volume: 0.45,
      autoProgress: true
    };
  } else {
    world.settings.simSpeed = MULTIPLAYER_LOCKED_SPEED;
  }
  return world;
}
function applyMultiplayerWorldCommand(world, cmd, particles = [], actorPlayerId) {
  enforceMultiplayerClock(world);
  if (cmd.kind === "set_speed") {
    return {
      ok: false,
      message: "Simulation pace is locked at 1\xD7 in multiplayer."
    };
  }
  const result = applyWorldCommand(world, cmd, particles, actorPlayerId);
  enforceMultiplayerClock(world);
  return result;
}
function stepMultiplayerWorld(world, elapsedSeconds, particles = []) {
  enforceMultiplayerClock(world);
  let remaining = Math.min(0.25, Math.max(0, elapsedSeconds));
  while (remaining > 5e-4) {
    const slice = Math.min(0.05, remaining);
    stepSimulation(world, slice, particles, false);
    remaining -= slice;
  }
  enforceMultiplayerClock(world);
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var rooms = /* @__PURE__ */ new Map();
function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? makeRoomCode() : code;
}
function sendMsg(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
function broadcastRoom(room, msg) {
  const raw = JSON.stringify(msg);
  for (const player of room.players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(raw);
    }
  }
}
function getPlayersList(room) {
  return Array.from(room.players.values()).map((p) => p.presence);
}
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.players.size === 0) {
      rooms.delete(code);
      continue;
    }
    const dt = Math.min(0.18, Math.max(0.02, (now - room.lastTickMs) / 1e3));
    room.lastTickMs = now;
    stepMultiplayerWorld(room.world, dt, room.particles);
    broadcastRoom(room, {
      type: "world_state",
      world: room.world,
      players: getPlayersList(room)
    });
  }
}, 120);
async function startServer() {
  const app = express();
  app.use(express.json());
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });
  app.get("/api/rooms/:code", (req, res) => {
    const code = String(req.params.code || "").toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ ok: false, error: "Room not found" });
      return;
    }
    res.json({
      ok: true,
      code,
      gameMode: room.world.gameMode,
      players: getPlayersList(room)
    });
  });
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    const playerId = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    let activeRoom = null;
    ws.on("message", (data) => {
      let parsed = null;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        sendMsg(ws, { type: "error", message: "Invalid command payload." });
        return;
      }
      if (parsed.type === "create_room") {
        const code = makeRoomCode();
        const world = enforceMultiplayerClock(
          createInitialWorld(parsed.gameMode || "sovereign_sandbox")
        );
        const homeIslandId = assignPlayerVillageInWorld(world, playerId, "cradle");
        const homeDef = ISLAND_DEFS[homeIslandId];
        const room = {
          code,
          world,
          particles: createParticlePool(),
          players: /* @__PURE__ */ new Map(),
          lastTickMs: Date.now()
        };
        const presence = {
          id: playerId,
          name: (parsed.playerName || "Deity").slice(0, 20),
          color: parsed.playerColor || "#E5AF47",
          homeIslandId,
          focusIslandId: homeIslandId,
          cursorSimX: homeDef.centerX,
          cursorSimY: homeDef.centerY,
          isHost: true
        };
        room.players.set(playerId, { id: playerId, ws, presence });
        rooms.set(code, room);
        activeRoom = room;
        sendMsg(ws, {
          type: "room_joined",
          roomCode: code,
          playerId,
          players: getPlayersList(room),
          world: room.world
        });
        return;
      }
      if (parsed.type === "join_room") {
        const code = String(parsed.roomCode || "").trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendMsg(ws, { type: "error", message: `Room "${code}" not found.` });
          return;
        }
        const homeIslandId = assignPlayerVillageInWorld(room.world, playerId);
        const homeDef = ISLAND_DEFS[homeIslandId];
        const presence = {
          id: playerId,
          name: (parsed.playerName || "Co-Deity").slice(0, 20),
          color: parsed.playerColor || "#68B2D8",
          homeIslandId,
          focusIslandId: homeIslandId,
          cursorSimX: homeDef.centerX,
          cursorSimY: homeDef.centerY,
          isHost: false
        };
        room.players.set(playerId, { id: playerId, ws, presence });
        activeRoom = room;
        sendMsg(ws, {
          type: "room_joined",
          roomCode: code,
          playerId,
          players: getPlayersList(room),
          world: room.world
        });
        broadcastRoom(room, { type: "players", players: getPlayersList(room) });
        broadcastRoom(room, {
          type: "toast",
          message: `${presence.name} claimed ${homeDef.name} in the sky-realm!`,
          ok: true
        });
        return;
      }
      if (!activeRoom) {
        sendMsg(ws, { type: "error", message: "Not connected to an active multiplayer room." });
        return;
      }
      if (parsed.type === "presence") {
        const p = activeRoom.players.get(playerId);
        if (p) {
          p.presence.focusIslandId = parsed.focusIslandId;
          p.presence.cursorSimX = Number(parsed.cursorSimX) || 2260;
          p.presence.cursorSimY = Number(parsed.cursorSimY) || 2560;
          broadcastRoom(activeRoom, { type: "players", players: getPlayersList(activeRoom) });
        }
        return;
      }
      if (parsed.type === "command") {
        const res = applyMultiplayerWorldCommand(
          activeRoom.world,
          parsed.cmd,
          activeRoom.particles,
          playerId
        );
        sendMsg(ws, { type: "toast", message: res.message, ok: res.ok });
        broadcastRoom(activeRoom, {
          type: "world_state",
          world: activeRoom.world,
          players: getPlayersList(activeRoom)
        });
      }
    });
    ws.on("close", () => {
      if (activeRoom) {
        const p = activeRoom.players.get(playerId);
        activeRoom.players.delete(playerId);
        if (activeRoom.players.size === 0) {
          rooms.delete(activeRoom.code);
        } else {
          broadcastRoom(activeRoom, { type: "players", players: getPlayersList(activeRoom) });
          if (p) {
            broadcastRoom(activeRoom, {
              type: "toast",
              message: `${p.presence.name} stepped back from the sky-realm.`,
              ok: true
            });
          }
        }
      }
    });
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      const indexFile = path.join(distDir, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Build output not found.");
      }
    });
  }
  const PORT = Number(process.env.PORT || 3e3);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Hearthglen server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
