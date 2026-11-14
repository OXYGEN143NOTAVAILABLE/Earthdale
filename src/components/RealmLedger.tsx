import { useState } from 'react';
import {
  Anchor,
  ArrowRightLeft,
  Check,
  Flame,
  GitBranch,
  Hammer,
  Lightbulb,
  Lock,
  MapPin,
  Package,
  Shield,
  Skull,
  Sparkles,
  Swords,
  UserPlus,
  X,
} from 'lucide-react';
import {
  ERA_LABELS,
  ISLAND_DEFS,
  ISLAND_ORDER,
  TRAITS,
  getUpgradeCost,
} from '../game/catalog';
import {
  BUILDING_BLUEPRINTS,
  CROP_META,
  CULTURES,
  LIVESTOCK_META,
  TECH_BRANCH_LABELS,
  TECH_BY_ID,
  TECH_TREE,
  VILLAGE_CUSTOM_META,
  getAvailableFrontierTechs,
  getBlueprintsList,
  getTechModifiers,
} from '../game/techAndCultures';
import type {
  BorderPolicy,
  BuildingType,
  CropType,
  CultureId,
  GameMode,
  HudSnapshot,
  IslandId,
  LivestockKind,
  RationMode,
  TechBranch,
  VillageResources,
} from '../game/types';
import { BuildingSvg } from './StorybookIcons';

interface RealmLedgerProps {
  hud: HudSnapshot;
  gameMode: GameMode;
  feedback: string | null;
  placingType: BuildingType | null;
  onStartPlaceSuggestion: (
    buildingType: BuildingType,
    cropType?: CropType,
    livestockKind?: LivestockKind,
  ) => void;
  onCancelPlaceSuggestion: () => void;
  onSuggestUpgrade: (buildingId: string) => void;
  onSuggestTech: (techId: string) => void;
  onSuggestDiplomacy: (cultureId: CultureId, action: 'envoy' | 'gift') => void;
  onAdjustDiplomacy?: (cultureId: CultureId, delta: number) => void;
  onSetVillagePolicy?: (islandId: IslandId, rationMode?: RationMode, borderPolicy?: BorderPolicy) => void;
  onSendCaravan?: (
    fromIslandId: IslandId,
    toIslandId: IslandId,
    resource: keyof VillageResources,
    amount: number,
  ) => void;
  onCompleteBridge?: (bridgeId: string) => void;
  onCompleteCableway?: (cableId: string) => void;
  onSpawnVillager?: (islandId: IslandId) => void;
  onUnlockAllTech?: () => void;
  onFocusIsland: (islandId: IslandId) => void;
  onClose: () => void;
}

type LedgerTab = 'structures' | 'resources' | 'tech' | 'islands' | 'diplomacy' | 'lineage';

const BRANCH_ORDER: TechBranch[] = [
  'hearth_shelter',
  'botany_pastures',
  'maritime_bridges',
  'metallurgy_war',
];

const CARAVAN_RESOURCES: { id: keyof VillageResources; label: string }[] = [
  { id: 'berries', label: 'Berries' },
  { id: 'grain', label: 'Grain' },
  { id: 'meat', label: 'Meat' },
  { id: 'fish', label: 'Fish' },
  { id: 'timber', label: 'Timber' },
  { id: 'stone', label: 'Stone' },
  { id: 'copper', label: 'Copper' },
  { id: 'bronze', label: 'Bronze' },
  { id: 'iron', label: 'Iron' },
  { id: 'wool', label: 'Wool' },
  { id: 'herbs', label: 'Herbs' },
];

function formatInlineCost(cost: Partial<VillageResources>): string {
  const parts: string[] = [];
  if (cost.timber) parts.push(`Timber ${cost.timber}`);
  if (cost.stone) parts.push(`Stone ${cost.stone}`);
  if (cost.copper) parts.push(`Copper ${cost.copper}`);
  if (cost.bronze) parts.push(`Bronze ${cost.bronze}`);
  if (cost.iron) parts.push(`Iron ${cost.iron}`);
  if (cost.wool) parts.push(`Wool ${cost.wool}`);
  if (cost.hides) parts.push(`Hides ${cost.hides}`);
  if (cost.grain) parts.push(`Grain ${cost.grain}`);
  if (cost.hearthlight) parts.push(`Hearth ${cost.hearthlight}`);
  return parts.join(' · ') || 'No materials';
}

export function RealmLedger({
  hud,
  gameMode,
  feedback,
  placingType,
  onStartPlaceSuggestion,
  onCancelPlaceSuggestion,
  onSuggestUpgrade,
  onSuggestTech,
  onSuggestDiplomacy,
  onAdjustDiplomacy,
  onSetVillagePolicy,
  onSendCaravan,
  onCompleteBridge,
  onCompleteCableway,
  onSpawnVillager,
  onUnlockAllTech,
  onFocusIsland,
  onClose,
}: RealmLedgerProps) {
  const [tab, setTab] = useState<LedgerTab>('structures');
  const [selectedCrop, setSelectedCrop] = useState<CropType>('wheat');
  const [selectedStock, setSelectedStock] = useState<LivestockKind>('sheep');
  const homeId = hud.localHomeIslandId ?? 'cradle';
  const [caravanDest, setCaravanDest] = useState<IslandId>(() =>
    homeId === 'sunterrace' ? 'cradle' : 'sunterrace',
  );
  const [caravanResource, setCaravanResource] = useState<keyof VillageResources>('timber');
  const [caravanAmount, setCaravanAmount] = useState<number>(10);
  const [lineageOnlyHome, setLineageOnlyHome] = useState<boolean>(false);

  const isSovereign = gameMode === 'sovereign_sandbox';
  const unlockedSet = new Set(hud.unlockedTechIds);
  const frontierIds = new Set(getAvailableFrontierTechs(hud.unlockedTechIds).map((t) => t.id));
  const blueprints = getBlueprintsList();
  const techMods = getTechModifiers(hud.unlockedTechIds);

  const homeRes = hud.villageResources?.[homeId] ?? hud.resources;
  const homeFlow = hud.resourceFlows?.[homeId] ?? {
    foodIn: 0,
    foodOut: 0,
    timberIn: 0,
    timberOut: 0,
    stoneIn: 0,
    stoneOut: 0,
    oreIn: 0,
    oreOut: 0,
  };
  const homePolicy = hud.villagePolicies?.[homeId] ?? { rationMode: 'normal', borderPolicy: 'parley' };

  return (
    <aside
      aria-label="Realm Ledger"
      className="pointer-events-auto kingdom-frame fixed top-14 left-3.5 z-20 w-[490px] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-11rem)] flex flex-col rounded p-3.5 text-[#F3EAD6] hud-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-[#8E6B35]/45">
        <div>
          <h2 className="text-base font-semibold text-[#F7EFDD]" style={{ fontFamily: 'var(--font-display)' }}>
            Archipelago Realm Ledger
          </h2>
          <p className="text-[11px] text-[#B4A995] tabular-nums">
            {ERA_LABELS[hud.era].name} · {ISLAND_DEFS[homeId]?.name}: {hud.populationCount}/{hud.totalHousingBeds} beds · {hud.buildings.length} structures
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-sm hover:bg-[#252D3D] text-[#B4A995] hover:text-[#F3EAD6] cursor-pointer"
          aria-label="Close Realm Ledger"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 6 Tabs */}
      <div className="mt-2.5 grid grid-cols-6 gap-1 bg-[#141822] p-1 rounded border border-[#8E6B35]/35 text-[10.5px] font-medium">
        {(
          [
            { id: 'structures', label: 'Build' },
            { id: 'resources', label: 'Resources' },
            { id: 'tech', label: 'Tech' },
            { id: 'islands', label: 'Islands' },
            { id: 'diplomacy', label: 'Cultures' },
            { id: 'lineage', label: 'Lineage' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`py-1.5 px-1 rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              tab === t.id
                ? 'bg-[#D69635] text-[#14161D] font-semibold'
                : 'text-[#C8BCA6] hover:text-[#F7EFDD] hover:bg-[#212836]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {feedback && (
        <div className="mt-2 px-2.5 py-1.5 rounded-sm bg-[#212836] border border-[#E5AF47]/45 text-[11px] font-medium text-[#FDE68A]">
          {feedback}
        </div>
      )}

      {/* Tab Body */}
      <div className="mt-2.5 flex-1 overflow-y-auto pr-1 space-y-2.5">
        {tab === 'resources' && (
          <div className="space-y-3 text-[11px]">
            <div className="p-2.5 rounded-sm bg-[#1D2330] border border-[#8E6B35]/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#F7EFDD] flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-[#E5AF47]" />
                  <span>{ISLAND_DEFS[homeId]?.name} Storehouses</span>
                </span>
                <span className="text-[10.5px] text-[#8CE0AC] tabular-nums">
                  Food: {Math.floor(homeRes.food)} (~{Math.max(0, Math.round(homeRes.food / Math.max(1, hud.populationCount * 1.5)))}d) · Beds: {hud.populationCount}/{hud.totalHousingBeds}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 tabular-nums">
                {[
                  { label: 'Berries', val: homeRes.berries },
                  { label: 'Grain', val: homeRes.grain },
                  { label: 'Meat', val: homeRes.meat },
                  { label: 'Fish', val: homeRes.fish },
                ].map((item) => (
                  <div key={item.label} className="p-1.5 rounded-sm bg-[#141822] border border-[#8E6B35]/25">
                    <div className="text-[9.5px] text-[#B4A995]">{item.label}</div>
                    <div className="text-[12px] font-semibold text-[#FDE68A]">{Math.floor(item.val)}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-1.5 tabular-nums">
                {[
                  { label: 'Timber', val: homeRes.timber },
                  { label: 'Stone', val: homeRes.stone },
                  { label: 'Copper Ore', val: homeRes.copper },
                  { label: 'Bronze', val: homeRes.bronze },
                  { label: 'Iron', val: homeRes.iron },
                  { label: 'Wool', val: homeRes.wool },
                  { label: 'Hides', val: homeRes.hides },
                  { label: 'Herbs', val: homeRes.herbs },
                  { label: 'Hearthlight', val: homeRes.hearthlight },
                ].map((item) => (
                  <div key={item.label} className="p-1.5 rounded-sm bg-[#141822] border border-[#8E6B35]/25 flex items-center justify-between">
                    <span className="text-[10px] text-[#C8BCA6]">{item.label}</span>
                    <span className="font-semibold text-[#F3EAD6]">{Math.floor(item.val)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rolling Daily Flow */}
            <div className="p-2.5 rounded-sm bg-[#171D29] border border-[#8E6B35]/35 space-y-1.5 tabular-nums">
              <div className="font-semibold text-[#E5AF47]">Daily Production &amp; Upkeep Flow</div>
              <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
                {[
                  { name: 'Food', inp: homeFlow.foodIn, out: homeFlow.foodOut },
                  { name: 'Timber', inp: homeFlow.timberIn, out: homeFlow.timberOut },
                  { name: 'Stone', inp: homeFlow.stoneIn, out: homeFlow.stoneOut },
                  { name: 'Metals', inp: homeFlow.oreIn, out: homeFlow.oreOut },
                ].map((row) => {
                  const net = row.inp - row.out;
                  return (
                    <div key={row.name} className="p-1.5 rounded-sm bg-[#121721] border border-[#8E6B35]/25 flex items-center justify-between">
                      <span className="text-[#D8CEBA]">{row.name}</span>
                      <span>
                        <span className="text-[#8CE0AC]">+{row.inp.toFixed(1)}</span>
                        {' / '}
                        <span className="text-[#E38589]">-{row.out.toFixed(1)}</span>
                        {' '}
                        <span className={net >= 0 ? 'text-[#8CE0AC] font-semibold' : 'text-[#E38589] font-semibold'}>
                          ({net >= 0 ? `+${net.toFixed(1)}` : net.toFixed(1)})
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ration & Border Policies */}
            {onSetVillagePolicy && (
              <div className="p-2.5 rounded-sm bg-[#1D2330] border border-[#8E6B35]/35 space-y-2">
                <div>
                  <div className="font-semibold text-[#F7EFDD] mb-1">Daily Ration Policy</div>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: 'conserve', label: 'Conserve', tip: 'Half food cost, lower hunger recovery' },
                        { id: 'normal', label: 'Normal', tip: 'Balanced daily meals' },
                        { id: 'feast', label: 'Feast', tip: '1.5x food cost, higher mood & healing' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSetVillagePolicy(homeId, opt.id, undefined)}
                        title={opt.tip}
                        className={`py-1 px-2 rounded-sm border text-[10.5px] font-semibold cursor-pointer whitespace-nowrap ${
                          homePolicy.rationMode === opt.id
                            ? 'bg-[#D69635] text-[#14161D] border-[#FDE68A]'
                            : 'bg-[#141822] hover:bg-[#252D3D] text-[#D8CEBA] border-[#8E6B35]/35'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-semibold text-[#F7EFDD] mb-1">Perimeter &amp; Visitor Border Policy</div>
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        { id: 'closed', label: 'Closed' },
                        { id: 'parley', label: 'Parley First' },
                        { id: 'open_trade', label: 'Open Trade' },
                        { id: 'allied', label: 'Allied' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSetVillagePolicy(homeId, undefined, opt.id)}
                        className={`py-1 px-1.5 rounded-sm border text-[10px] font-semibold cursor-pointer whitespace-nowrap ${
                          homePolicy.borderPolicy === opt.id
                            ? 'bg-[#4C8767] text-white border-[#8CE0AC]'
                            : 'bg-[#141822] hover:bg-[#252D3D] text-[#D8CEBA] border-[#8E6B35]/35'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Supply Caravan Dispatcher */}
            {onSendCaravan && (
              <div className="p-2.5 rounded-sm bg-[#1D2330] border border-[#8E6B35]/35 space-y-2">
                <div className="font-semibold text-[#E5AF47] flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Dispatch Supply / Gift Caravan</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <select
                    value={caravanDest}
                    onChange={(e) => setCaravanDest(e.target.value as IslandId)}
                    className="px-1.5 py-1 rounded-sm bg-[#141822] border border-[#8E6B35]/40 text-[#F3EAD6] text-[10.5px]"
                  >
                    {ISLAND_ORDER.filter((id) => id !== homeId).map((id) => (
                      <option key={id} value={id}>
                        To: {ISLAND_DEFS[id].name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={caravanResource}
                    onChange={(e) => setCaravanResource(e.target.value as keyof VillageResources)}
                    className="px-1.5 py-1 rounded-sm bg-[#141822] border border-[#8E6B35]/40 text-[#F3EAD6] text-[10.5px]"
                  >
                    {CARAVAN_RESOURCES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} ({Math.floor(homeRes[r.id] ?? 0)})
                      </option>
                    ))}
                  </select>
                  <select
                    value={caravanAmount}
                    onChange={(e) => setCaravanAmount(Number(e.target.value))}
                    className="px-1.5 py-1 rounded-sm bg-[#141822] border border-[#8E6B35]/40 text-[#F3EAD6] text-[10.5px]"
                  >
                    <option value={5}>5 units</option>
                    <option value={10}>10 units</option>
                    <option value={20}>20 units</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => onSendCaravan(homeId, caravanDest, caravanResource, caravanAmount)}
                  className="w-full py-1.5 px-2.5 rounded-sm bg-[#D69635] hover:bg-[#E5A746] text-[#14161D] font-semibold cursor-pointer whitespace-nowrap"
                >
                  Send Caravan (+8 Culture Trust)
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'structures' && (
          <>
            {placingType && (
              <div className="p-2.5 rounded-sm bg-[#2B3548] border border-[#E5AF47] text-[11px] flex items-center justify-between gap-2">
                <span className="text-[#FDE68A] font-medium">
                  Click within {ISLAND_DEFS[homeId]?.name} in 3D to {isSovereign ? 'place' : 'stake a suggestion for'}{' '}
                  <strong>{BUILDING_BLUEPRINTS[placingType].name}</strong>.
                </span>
                <button
                  type="button"
                  onClick={onCancelPlaceSuggestion}
                  className="px-2 py-1 rounded-sm bg-[#1A202C] text-[#F3EAD6] hover:bg-[#252D3D] cursor-pointer shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}

            <p className="text-[11px] text-[#B4A995] leading-snug">
              {isSovereign
                ? `Sovereign Sandbox: place or upgrade structures in your village (${ISLAND_DEFS[homeId]?.name}) immediately.`
                : `Villagers in ${ISLAND_DEFS[homeId]?.name} prioritize food & shelter first on their own; you can stake gentle placement suggestions.`}
            </p>

            {/* Blueprints */}
            <div className="space-y-2">
              {blueprints.map((bp) => {
                const techReady = isSovereign || unlockedSet.has(bp.requiredTechId);
                const reqTech = TECH_BY_ID[bp.requiredTechId];
                const isPlacing = placingType === bp.type;

                return (
                  <div
                    key={bp.type}
                    className={`p-2.5 rounded-sm border ${
                      techReady
                        ? 'bg-[#1D2330] border-[#8E6B35]/40'
                        : 'bg-[#161B25]/80 border-[#4A4338]/30 opacity-85'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <BuildingSvg type={bp.type} unlocked={techReady} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12.5px] font-semibold text-[#F7EFDD]">{bp.name}</span>
                          {!techReady && reqTech && (
                            <span className="text-[10px] text-[#B4A995] flex items-center gap-1 shrink-0">
                              <Lock className="w-2.5 h-2.5" />
                              {reqTech.name}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#C8BCA6] leading-snug mt-0.5">{bp.description}</p>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-[#8CE0AC]">
                          <span>{bp.benefitDescription}</span>
                          <span className="text-[#D8CEBA] tabular-nums shrink-0">
                            {isSovereign ? 'Free (Sovereign)' : formatInlineCost(bp.baseCost)}
                          </span>
                        </div>

                        {techReady && bp.type === 'farm_plot' && (
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            {(Object.keys(CROP_META) as CropType[]).map((crop) => {
                              const cropReady = isSovereign || unlockedSet.has(CROP_META[crop].requiredTechId);
                              return (
                                <button
                                  key={crop}
                                  type="button"
                                  disabled={!cropReady}
                                  onClick={() => setSelectedCrop(crop)}
                                  className={`px-2 py-0.5 rounded-sm text-[10px] border cursor-pointer ${
                                    !cropReady
                                      ? 'bg-[#141822] text-[#6E675C] border-[#2E3442] cursor-not-allowed'
                                      : selectedCrop === crop
                                        ? 'bg-[#4C8767] text-white border-[#8CE0AC] font-semibold'
                                        : 'bg-[#141822] text-[#D8CEBA] border-[#8E6B35]/35 hover:bg-[#252D3D]'
                                  }`}
                                  title={cropReady ? CROP_META[crop].seasonBonus : `Requires ${TECH_BY_ID[CROP_META[crop].requiredTechId]?.name}`}
                                >
                                  {CROP_META[crop].label}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {techReady && bp.type === 'pasture' && (
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            {(Object.keys(LIVESTOCK_META) as LivestockKind[]).map((stock) => (
                              <button
                                key={stock}
                                type="button"
                                onClick={() => setSelectedStock(stock)}
                                className={`px-2 py-0.5 rounded-sm text-[10px] border cursor-pointer ${
                                  selectedStock === stock
                                    ? 'bg-[#D69635] text-[#14161D] border-[#FDE68A] font-semibold'
                                    : 'bg-[#141822] text-[#D8CEBA] border-[#8E6B35]/35 hover:bg-[#252D3D]'
                                }`}
                                title={LIVESTOCK_META[stock].summary}
                              >
                                {LIVESTOCK_META[stock].label}
                              </button>
                            ))}
                          </div>
                        )}

                        {techReady && (
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                isPlacing
                                  ? onCancelPlaceSuggestion()
                                  : onStartPlaceSuggestion(
                                      bp.type,
                                      bp.type === 'farm_plot' ? selectedCrop : undefined,
                                      bp.type === 'pasture' ? selectedStock : undefined,
                                    )
                              }
                              className={`px-2.5 py-1 rounded-sm text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                                isPlacing
                                  ? 'bg-[#FDE68A] text-[#14161D]'
                                  : 'bg-[#262E3E] hover:bg-[#323D52] text-[#F3EAD6] border border-[#B68B44]/50'
                              }`}
                            >
                              <MapPin className="w-3 h-3 text-[#E5AF47]" />
                              <span>
                                {isPlacing
                                  ? 'Click Island...'
                                  : isSovereign
                                    ? 'Place Now (Free)'
                                    : 'Suggest Spot on Island'}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Existing Built Structures */}
            {hud.buildings.length > 0 && (
              <div className="pt-2 border-t border-[#8E6B35]/40 space-y-1.5">
                <h3 className="text-[11.5px] font-semibold text-[#E5AF47] flex items-center gap-1">
                  <Hammer className="w-3.5 h-3.5" />
                  <span>Built Structures ({hud.buildings.length})</span>
                </h3>
                {hud.buildings.map((b) => {
                  const culture = CULTURES[b.cultureId];
                  const isSuggested = hud.suggestedBuildingId === b.id;
                  const upCost = getUpgradeCost(b);
                  const canUp =
                    b.level < b.maxLevel &&
                    (b.islandId === homeId || gameMode === 'shared_siege') &&
                    (isSovereign || (b.cultureId !== 'mist_mariner' && b.cultureId !== 'ashen_raider'));
                  return (
                    <div
                      key={b.id}
                      className="p-2 rounded-sm bg-[#171C27] border border-[#8E6B35]/30 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-sm shrink-0"
                            style={{ backgroundColor: culture?.bannerColor ?? '#D69635' }}
                          />
                          <span className="font-semibold text-[#F3EAD6] truncate">
                            {b.name} Lv.{b.level}
                          </span>
                          <span className="text-[10px] text-[#B4A995]">({ISLAND_DEFS[b.islandId].name})</span>
                        </div>
                        <div className="text-[10px] text-[#B4A995] tabular-nums mt-0.5">
                          {b.cropState
                            ? `${CROP_META[b.cropState.cropType].label} · ${Math.round(b.cropState.growth * 100)}% grown`
                            : b.benefitDescription}
                          {b.disrepair > 20 ? ` · Disrepair ${Math.round(b.disrepair)}%` : ''}
                        </div>
                      </div>
                      {canUp && (
                        <button
                          type="button"
                          onClick={() => onSuggestUpgrade(b.id)}
                          className={`px-2 py-1 rounded-sm text-[10px] font-semibold shrink-0 cursor-pointer border ${
                            isSuggested && !isSovereign
                              ? 'bg-[#D69635] text-[#14161D] border-[#FDE68A]'
                              : 'bg-[#222938] hover:bg-[#2D364A] text-[#E5DAC4] border-[#8E6B35]/35'
                          }`}
                          title={isSovereign ? 'Upgrade immediately' : `Upgrade cost: ${formatInlineCost(upCost)}`}
                        >
                          {isSovereign ? 'Upgrade Now' : isSuggested ? 'Suggested' : 'Suggest Upgrade'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'tech' && (
          <div className="space-y-3">
            <div className="p-2.5 rounded-sm bg-[#1A202D] border border-[#8E6B35]/40">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-[#F7EFDD] flex items-center gap-1">
                  <Lightbulb className="w-3.5 h-3.5 text-[#FDE047]" />
                  <span>Active Discovery: {hud.activeTechId ? TECH_BY_ID[hud.activeTechId]?.name : 'All Discovered'}</span>
                </span>
                <span className="tabular-nums text-[#A8D8EA]">
                  {Math.floor(hud.knowledgeXp)}/{hud.activeTechId ? TECH_BY_ID[hud.activeTechId]?.costXp ?? 0 : 0} XP
                </span>
              </div>
              {hud.activeTechId && (
                <div className="h-1.5 rounded-full bg-[#10131C] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#5EA7C4]"
                    style={{
                      width: `${Math.min(100, Math.round((hud.knowledgeXp / Math.max(1, TECH_BY_ID[hud.activeTechId]?.costXp ?? 1)) * 100))}%`,
                    }}
                  />
                </div>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[10.5px] text-[#B4A995]">
                  Inhabitants generate Knowledge XP naturally around campfires, libraries, and expeditions.
                </p>
                {isSovereign && onUnlockAllTech && hud.unlockedTechIds.length < TECH_TREE.length && (
                  <button
                    type="button"
                    onClick={onUnlockAllTech}
                    className="px-2.5 py-1 rounded-sm bg-[#D69635] hover:bg-[#E5A746] text-[#14161D] text-[10.5px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Unlock All Tech
                  </button>
                )}
              </div>
            </div>

            {/* Active Tech Bonus Summary */}
            <div className="p-2 rounded-sm bg-[#171D29] border border-[#58A87A]/35 text-[10px] text-[#D8CEBA] grid grid-cols-3 gap-1.5 tabular-nums">
              <span>Gather +{Math.round((techMods.gatherMult - 1) * 100)}%</span>
              <span>Stone +{Math.round((techMods.stoneMult - 1) * 100)}%</span>
              <span>Timber +{Math.round((techMods.timberMult - 1) * 100)}%</span>
              <span>Attack +{Math.round((techMods.attackMult - 1) * 100)}%</span>
              <span>Armor +{techMods.armorBonus}</span>
              <span>Bleed Res +{Math.round(techMods.bleedResistBonus * 100)}%</span>
              <span>Heal +{Math.round((techMods.healRateMult - 1) * 100)}%</span>
              <span>Build +{Math.round((techMods.buildSpeedMult - 1) * 100)}%</span>
              <span>Teach +{Math.round((techMods.teachRateMult - 1) * 100)}%</span>
            </div>

            {BRANCH_ORDER.map((branch) => {
              const nodes = TECH_TREE.filter((t) => t.branch === branch);
              return (
                <div key={branch} className="space-y-1.5">
                  <h3 className="text-[11.5px] font-semibold text-[#E5AF47] border-b border-[#8E6B35]/30 pb-1">
                    {TECH_BRANCH_LABELS[branch]}
                  </h3>
                  {nodes.map((node) => {
                    const isDone = unlockedSet.has(node.id);
                    const isFrontier = frontierIds.has(node.id);
                    const isActive = hud.activeTechId === node.id;
                    return (
                      <div
                        key={node.id}
                        className={`p-2 rounded-sm border text-[11px] ${
                          isDone
                            ? 'bg-[#1D2B24] border-[#58A87A]/45'
                            : isActive
                              ? 'bg-[#263144] border-[#E5AF47]'
                              : isFrontier
                                ? 'bg-[#1D2330] border-[#8E6B35]/40'
                                : 'bg-[#151922] border-[#333A48] opacity-70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#F7EFDD] flex items-center gap-1">
                            {isDone ? (
                              <Check className="w-3.5 h-3.5 text-[#8CE0AC]" />
                            ) : !isFrontier ? (
                              <Lock className="w-3 h-3 text-[#8E8475]" />
                            ) : (
                              <Sparkles className="w-3 h-3 text-[#FDE047]" />
                            )}
                            {node.name}
                          </span>
                          <span className="text-[10px] text-[#B4A995] tabular-nums">
                            {isDone ? 'Discovered' : `${node.costXp} XP`}
                          </span>
                        </div>
                        <p className="text-[10.5px] text-[#C8BCA6] mt-0.5">{node.summary}</p>
                        {node.effectSummary && (
                          <p className="text-[10px] text-[#A8D8EA] mt-0.5 font-medium">{node.effectSummary}</p>
                        )}
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-[#8CE0AC]">{node.unlocksLabel}</span>
                          {isFrontier && !isDone && (
                            <button
                              type="button"
                              onClick={() => onSuggestTech(node.id)}
                              className={`px-2 py-0.5 rounded-sm text-[10px] font-semibold cursor-pointer ${
                                isActive
                                  ? 'bg-[#D69635] text-[#14161D]'
                                  : 'bg-[#283142] hover:bg-[#344056] text-[#F3EAD6]'
                              }`}
                            >
                              {isActive ? 'Focused' : 'Suggest Focus'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'islands' && (
          <div className="space-y-3">
            {/* Floating Islands & Evolving Village Cultures */}
            <div className="space-y-1.5">
              <h3 className="text-[11.5px] font-semibold text-[#E5AF47]">Floating Archipelago & Village Cultures</h3>
              {ISLAND_ORDER.map((id) => {
                const def = ISLAND_DEFS[id];
                const st = hud.islands[id];
                const cult = CULTURES[st?.owningCultureId ?? def.defaultCultureId];
                const profile = hud.villageCultures[id];
                const popHere = hud.villagers.filter((v) => v.islandId === id).length;
                const nativeHere = hud.clanVillagers.filter((v) => v.islandId === id).length;
                const ruinsHere = hud.exploreRuins.filter((r) => r.islandId === id);
                const hasBridgeRoute = hud.bridges.some((b) => b.fromIsland === id || b.toIsland === id);
                return (
                  <div
                    key={id}
                    className="p-2.5 rounded-sm bg-[#1D2330] border border-[#8E6B35]/35 space-y-1.5 text-[11px]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-semibold text-[#F7EFDD] flex-wrap">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cult.bannerColor }}
                          />
                          <span>{def.name}</span>
                          <span className="px-1.5 py-0.2 rounded-sm bg-[#141923] border border-[#8E6B35]/35 text-[9.5px] uppercase text-[#E5AF47]">
                            {def.roleTag}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded-sm text-[9.5px] border ${
                              hasBridgeRoute
                                ? 'bg-[#1D2B24] border-[#589674]/45 text-[#8CE0AC]'
                                : 'bg-[#1E2534] border-[#6E8AB5]/40 text-[#A8D8EA]'
                            }`}
                          >
                            {hasBridgeRoute ? 'Bridge Route' : 'Unbridged · Boat/Glider'}
                          </span>
                          <span className="text-[10px] text-[#A8D8EA] font-normal">
                            {st?.discovered ? '(Charted)' : nativeHere > 0 ? '(Native Settlement)' : '(Awaiting Scouts)'}
                          </span>
                        </div>
                        <p className="text-[10.5px] text-[#B4A995] mt-0.5 tabular-nums">
                          {def.subtitle} · {def.terrainStyle.replace('_', ' ')} · {popHere} Hearthglen{nativeHere > 0 ? ` · ${nativeHere} ${cult.name}` : ''}
                        </p>
                        {ruinsHere.length > 0 && (
                          <p className="text-[10px] text-[#FDE68A] mt-0.5">
                            Ruin: {ruinsHere.map((r) => `${r.name} (${r.exploredCount > 0 ? `${r.exploredCount}x explored` : 'Unexplored'})`).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isSovereign && onSpawnVillager && (
                          <button
                            type="button"
                            onClick={() => onSpawnVillager(id)}
                            className="px-2 py-1 rounded-sm bg-[#233229] hover:bg-[#2E4236] border border-[#589674]/45 text-[10px] font-semibold text-[#DFEFE4] cursor-pointer flex items-center gap-1"
                            title={`Summon a new inhabitant onto ${def.name}`}
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>+Villager</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onFocusIsland(id)}
                          className="px-2 py-1 rounded-sm bg-[#262E3E] hover:bg-[#323D52] text-[10.5px] font-medium text-[#F3EAD6] cursor-pointer"
                        >
                          Focus
                        </button>
                      </div>
                    </div>

                    {profile && (
                      <div className="pt-1.5 border-t border-[#8E6B35]/25 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[10.5px] tabular-nums">
                          <span className="font-semibold text-[#E5AF47] flex items-center gap-1">
                            <Flame className="w-3 h-3" />
                            {profile.ethosTitle}
                          </span>
                          <span className="text-[#9EB1C2]">
                            Fire Circles: {profile.nightlyGatherings} · Lv.{profile.traditionLevel}
                          </span>
                        </div>
                        <p className="text-[10px] italic text-[#C8BCA6]">“{profile.motto}”</p>
                        {profile.customs.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {profile.customs.map((cId) => {
                              const cm = VILLAGE_CUSTOM_META[cId];
                              if (!cm) return null;
                              return (
                                <span
                                  key={cId}
                                  title={`${cm.summary} (${cm.bonusLabel})`}
                                  className="px-1.5 py-0.5 rounded-sm bg-[#141923] border border-[#8E6B35]/35 text-[9.5px] text-[#F3EAD6]"
                                >
                                  {cm.name}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sky-Bridges */}
            <div className="pt-2 border-t border-[#8E6B35]/35 space-y-1.5">
              <h3 className="text-[11.5px] font-semibold text-[#E5AF47]">Sky-Bridges</h3>
              {hud.bridges.map((br) => {
                const techReady = unlockedSet.has(br.requiredTechId);
                return (
                  <div key={br.id} className="p-2 rounded-sm bg-[#181E29] border border-[#8E6B35]/30 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#F3EAD6]">{br.name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold tabular-nums ${br.built ? 'text-[#8CE0AC]' : 'text-[#E5AF47]'}`}>
                          {br.built ? 'Connected' : techReady ? `Building ${Math.round(br.progress * 100)}%` : `Needs ${TECH_BY_ID[br.requiredTechId]?.name}`}
                        </span>
                        {isSovereign && !br.built && onCompleteBridge && (
                          <button
                            type="button"
                            onClick={() => onCompleteBridge(br.id)}
                            className="px-2 py-0.5 rounded-sm bg-[#D69635] hover:bg-[#E5A746] text-[#14161D] text-[10px] font-semibold cursor-pointer"
                          >
                            Complete Now
                          </button>
                        )}
                      </div>
                    </div>
                    {!br.built && (
                      <p className="text-[10px] text-[#B4A995] mt-0.5 tabular-nums">
                        Requires Timber {br.costTimber} · Stone {br.costStone} (builders construct plank-by-plank)
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sky-Cableways */}
            <div className="pt-2 border-t border-[#8E6B35]/35 space-y-1.5">
              <h3 className="text-[11.5px] font-semibold text-[#2DD4BF]">Cliff Sky-Cableways</h3>
              {hud.cableways.map((cb) => {
                const techReady = unlockedSet.has(cb.requiredTechId);
                return (
                  <div key={cb.id} className="p-2 rounded-sm bg-[#181E29] border border-[#2DD4BF]/30 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#F3EAD6]">{cb.name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold tabular-nums ${cb.built ? 'text-[#2DD4BF]' : 'text-[#E5AF47]'}`}>
                          {cb.built ? `Operating (${cb.passengerIds.length} aboard)` : techReady ? `Rigging ${Math.round(cb.progress * 100)}%` : `Needs ${TECH_BY_ID[cb.requiredTechId]?.name}`}
                        </span>
                        {isSovereign && !cb.built && onCompleteCableway && (
                          <button
                            type="button"
                            onClick={() => onCompleteCableway(cb.id)}
                            className="px-2 py-0.5 rounded-sm bg-[#2DD4BF] hover:bg-[#5EEAD4] text-[#0F172A] text-[10px] font-semibold cursor-pointer"
                          >
                            Complete Now
                          </button>
                        )}
                      </div>
                    </div>
                    {!cb.built && (
                      <p className="text-[10px] text-[#B4A995] mt-0.5 tabular-nums">
                        Requires Timber {cb.costTimber} · Stone {cb.costStone} · Iron {cb.costIron}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Fleet & Gliders */}
            <div className="pt-2 border-t border-[#8E6B35]/35 space-y-1.5">
              <h3 className="text-[11.5px] font-semibold text-[#E5AF47] flex items-center gap-1">
                <Anchor className="w-3.5 h-3.5" />
                <span>Archipelago Fleet ({hud.boats.length}) · Active Gliders ({hud.gliders.length})</span>
              </h3>
              {hud.boats.map((boat) => (
                <div key={boat.id} className="p-2 rounded-sm bg-[#181E29] border border-[#8E6B35]/30 flex items-center justify-between text-[11px]">
                  <div>
                    <div className="font-semibold text-[#F3EAD6]">
                      {boat.name} · <span className="capitalize text-[#A8D8EA]">{boat.kind.replace('_', ' ')}</span>
                    </div>
                    <div className="text-[10px] text-[#B4A995]">
                      {CULTURES[boat.cultureId].name} · {boat.cargoText} · {boat.state}
                    </div>
                  </div>
                  <span className="text-[10px] text-[#8CE0AC] tabular-nums">{Math.round(boat.hp)}/{boat.maxHp} HP</span>
                </div>
              ))}
              {hud.gliders.map((g) => (
                <div key={g.id} className="p-2 rounded-sm bg-[#181E29] border border-[#E5AF47]/35 flex items-center justify-between text-[11px]">
                  <span className="text-[#FDE68A]">
                    Wind-Glider: {ISLAND_DEFS[g.fromIsland].name} → {ISLAND_DEFS[g.toIsland].name}
                  </span>
                  <span className="text-[10px] text-[#A8D8EA] tabular-nums">{Math.round(g.progress * 100)}%</span>
                </div>
              ))}
            </div>

            {/* Memorial Cairns */}
            {hud.memorials.length > 0 && (
              <div className="pt-2 border-t border-[#8E6B35]/35 space-y-1">
                <h3 className="text-[11.5px] font-semibold text-[#E38589] flex items-center gap-1">
                  <Skull className="w-3.5 h-3.5" />
                  <span>Memorial Cairns ({hud.memorials.length})</span>
                </h3>
                {hud.memorials.map((m) => (
                  <p key={m.id} className="text-[10.5px] text-[#C8BCA6]">
                    <span className="text-[#F3EAD6] font-medium">{m.villagerName}</span> (Day {m.dayDied}) — {m.epitaph}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'diplomacy' && (
          <div className="space-y-3">
            <p className="text-[11px] text-[#B4A995] leading-snug">
              Each settled island develops distinct customs around its nightly fires. Neighbor clans begin peaceful or wary—while the Ashen Bastion defends volcanic iron vaults by force.
            </p>

            {hud.raiders.length > 0 && (
              <div className="p-2.5 rounded-sm bg-[#3A1E24] border border-[#E38589] text-[11px] flex items-center gap-2 text-[#F7D7D9]">
                <Swords className="w-4 h-4 text-[#E38589] shrink-0" />
                <span>
                  {hud.raiders.length} active hostile warrior(s) across the archipelago (Ashen Bastion garrison & sea raiders).
                </span>
              </div>
            )}

            {(Object.keys(CULTURES) as CultureId[]).map((cid) => {
              const cult = CULTURES[cid];
              const dip = hud.diplomacy[cid];
              const isMist = cid === 'mist_mariner';
              const statusColor =
                dip.status === 'war'
                  ? 'text-[#E38589]'
                  : dip.status === 'tense'
                    ? 'text-[#F0B46E]'
                    : dip.status === 'peaceful'
                      ? 'text-[#8CE0AC]'
                      : 'text-[#A8D8EA]';

              return (
                <div key={cid} className="p-2.5 rounded-sm bg-[#1D2330] border border-[#8E6B35]/35 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-sm border border-[#FAF6EE]/40 shrink-0"
                        style={{ backgroundColor: cult.bannerColor }}
                      />
                      <span className="font-semibold text-[#F7EFDD]">{cult.name}</span>
                    </div>
                    <span className={`font-semibold uppercase text-[10px] tabular-nums ${statusColor}`}>
                      {dip.status} · Trust {Math.round(dip.trust)}%
                    </span>
                  </div>
                  <p className="text-[10.5px] text-[#C8BCA6]">{cult.summary}</p>
                  <p className="text-[10px] text-[#E5AF47]">{cult.bonusLabel}</p>

                  {dip.grievances.length > 0 && (
                    <p className="text-[10px] text-[#E38589]">Notes: {dip.grievances[0]}</p>
                  )}

                  {((isMist && dip.status !== 'unknown') || (isSovereign && cid !== 'hearthfolk')) && (
                    <div className="pt-1 flex flex-wrap items-center gap-1.5">
                      {isMist && (
                        <>
                          <button
                            type="button"
                            onClick={() => onSuggestDiplomacy(cid, 'envoy')}
                            className="flex-1 py-1 px-2 rounded-sm bg-[#243044] hover:bg-[#314059] border border-[#6E8AB5]/45 text-[#DCE6F5] font-semibold cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap"
                          >
                            <Shield className="w-3 h-3" />
                            <span>{isSovereign ? 'Send Envoy' : 'Suggest Envoy'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onSuggestDiplomacy(cid, 'gift')}
                            className="flex-1 py-1 px-2 rounded-sm bg-[#233229] hover:bg-[#2E4236] border border-[#589674]/45 text-[#DFEFE4] font-semibold cursor-pointer whitespace-nowrap"
                          >
                            {isSovereign ? 'Bestow Peace Gift' : 'Suggest Gift (10 Timber / 6 Grain)'}
                          </button>
                        </>
                      )}
                      {isSovereign && onAdjustDiplomacy && (
                        <div className="w-full flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => onAdjustDiplomacy(cid, 15)}
                            className="flex-1 py-1 px-2 rounded-sm bg-[#1F342A] hover:bg-[#2A4739] border border-[#589674]/45 text-[#8CE0AC] text-[10.5px] font-semibold cursor-pointer"
                          >
                            Trust +15
                          </button>
                          <button
                            type="button"
                            onClick={() => onAdjustDiplomacy(cid, -15)}
                            className="flex-1 py-1 px-2 rounded-sm bg-[#341F24] hover:bg-[#472A31] border border-[#C8666B]/45 text-[#E38589] text-[10.5px] font-semibold cursor-pointer"
                          >
                            Trust −15
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'lineage' && (
          <div className="space-y-2.5 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#E5AF47] flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5" />
                <span>Generational Family Tree</span>
              </span>
              <div className="flex items-center gap-1 bg-[#141822] p-0.5 rounded border border-[#8E6B35]/35 text-[10px]">
                <button
                  type="button"
                  onClick={() => setLineageOnlyHome(false)}
                  className={`px-2 py-0.5 rounded-sm cursor-pointer ${
                    !lineageOnlyHome ? 'bg-[#D69635] text-[#14161D] font-semibold' : 'text-[#C8BCA6]'
                  }`}
                >
                  All Realm
                </button>
                <button
                  type="button"
                  onClick={() => setLineageOnlyHome(true)}
                  className={`px-2 py-0.5 rounded-sm cursor-pointer ${
                    lineageOnlyHome ? 'bg-[#D69635] text-[#14161D] font-semibold' : 'text-[#C8BCA6]'
                  }`}
                >
                  {ISLAND_DEFS[homeId]?.name}
                </button>
              </div>
            </div>

            {(() => {
              const allRecords = Object.values(hud.lineage ?? {}).filter(
                (r) => !lineageOnlyHome || r.homeIslandId === homeId,
              );
              if (allRecords.length === 0) {
                return (
                  <p className="text-[#B4A995] italic py-4 text-center">
                    No family lineage records archived yet.
                  </p>
                );
              }
              const byGen = new Map<number, typeof allRecords>();
              for (const rec of allRecords) {
                const g = rec.generation ?? 1;
                const list = byGen.get(g) ?? [];
                list.push(rec);
                byGen.set(g, list);
              }
              const gens = Array.from(byGen.keys()).sort((a, b) => a - b);

              return gens.map((gen) => {
                const members = byGen.get(gen) ?? [];
                return (
                  <div key={gen} className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-[#A8D8EA] border-b border-[#8E6B35]/30 pb-0.5 tabular-nums">
                      Generation {gen} ({members.length})
                    </div>
                    {members.map((m) => {
                      const pNames = m.parentIds
                        ? m.parentIds
                            .map((pid) => hud.lineage[pid]?.name.split(' ')[0] ?? 'Founder')
                            .join(' & ')
                        : null;
                      const partnerName = m.partnerId ? hud.lineage[m.partnerId]?.name.split(' ')[0] : null;
                      const childNames = m.childrenIds
                        .map((cid) => hud.lineage[cid]?.name.split(' ')[0])
                        .filter(Boolean);
                      const traitLabels = m.traits
                        .map((tid) => TRAITS[tid]?.name)
                        .filter(Boolean)
                        .slice(0, 3);

                      const isAlive = m.deathDay === null;
                      return (
                        <div
                          key={m.id}
                          className={`p-2 rounded-sm border ${
                            isAlive
                              ? 'bg-[#1D2330] border-[#8E6B35]/35'
                              : 'bg-[#151821] border-[#6E5156]/40 opacity-85'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#F7EFDD]">{m.name}</span>
                            <span
                              className={`text-[10px] font-semibold tabular-nums ${
                                isAlive ? 'text-[#8CE0AC]' : 'text-[#E38589]'
                              }`}
                            >
                              {isAlive
                                ? `Living · ${m.lifeStage}`
                                : `Passed D${m.deathDay ?? '?'} (${m.deathCause ?? 'old age'})`}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#B4A995] mt-0.5">
                            Home: {ISLAND_DEFS[m.homeIslandId]?.name} · Born D{m.birthDay}
                            {pNames ? ` · Parents: ${pNames}` : ' · Origin: Founder / Traveler'}
                          </div>
                          {(partnerName || childNames.length > 0) && (
                            <div className="text-[10px] text-[#DCE6F5] mt-0.5">
                              {partnerName ? `Partner: ${partnerName}` : ''}
                              {partnerName && childNames.length > 0 ? ' · ' : ''}
                              {childNames.length > 0 ? `Children: ${childNames.join(', ')}` : ''}
                            </div>
                          )}
                          {traitLabels.length > 0 && (
                            <div className="text-[10px] text-[#E5AF47] mt-0.5">
                              Inherited Traits: {traitLabels.join(' · ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </aside>
  );
}
