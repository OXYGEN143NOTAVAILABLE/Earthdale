import { ChevronDown, ChevronUp, Compass, Eye, Globe, Heart, MessageCircle, Utensils } from 'lucide-react';
import { ISLAND_DEFS, ISLAND_ORDER } from '../game/catalog';
import type { GodCommentKind, IslandId, IslandState, VillagerEntity } from '../game/types';
import { VillagerPortrait } from './VillagerPortrait';

interface BottomControlDockProps {
  villagers: VillagerEntity[];
  totalBeds: number;
  islands: Record<IslandId, IslandState>;
  focusIslandId: IslandId | 'all';
  selectedVillagerId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFocusIsland: (target: IslandId | 'all') => void;
  onSelectVillager: (id: string) => void;
  onFocusVillager: (id: string) => void;
  onChatSelected: () => void;
  onCommentSelected: (kind: GodCommentKind) => void;
}

export function BottomControlDock({
  villagers,
  totalBeds,
  islands,
  focusIslandId,
  selectedVillagerId,
  collapsed,
  onToggleCollapse,
  onFocusIsland,
  onSelectVillager,
  onFocusVillager,
  onChatSelected,
  onCommentSelected,
}: BottomControlDockProps) {
  if (collapsed) {
    return (
      <div className="pointer-events-auto fixed bottom-3 left-3.5 z-20">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="kingdom-frame px-3 py-1.5 rounded text-[11px] font-semibold text-[#E5AF47] hover:bg-[#232A38] flex items-center gap-1.5 cursor-pointer"
          title="Show Islands & Villager Dock (H)"
        >
          <ChevronUp className="w-3.5 h-3.5" />
          <span>Archipelago Dock ({villagers.length}/{totalBeds})</span>
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto fixed bottom-3 left-3.5 z-20 max-w-[calc(100vw-2.5rem)]">
      <div className="kingdom-frame rounded px-2.5 py-2 flex flex-col gap-1.5">
        {/* Top Row: All Islands Overview + 5 Island Focus Buttons + Collapse Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 border-b border-[#8E6B35]/35">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => onFocusIsland('all')}
              className={`px-2 py-1 rounded-sm text-[11px] font-semibold cursor-pointer flex items-center gap-1 transition-colors ${
                focusIslandId === 'all'
                  ? 'bg-[#D69635] text-[#14161D]'
                  : 'bg-[#1D2330] hover:bg-[#283142] text-[#E5DAC4] border border-[#8E6B35]/35'
              }`}
              title="Zoom out to view the entire floating archipelago (0)"
            >
              <Globe className="w-3 h-3" />
              <span>All Islands</span>
            </button>
            {ISLAND_ORDER.map((id) => {
              const def = ISLAND_DEFS[id];
              const st = islands[id];
              const disc = Boolean(st?.discovered);
              const active = focusIslandId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onFocusIsland(id)}
                  className={`px-2 py-1 rounded-sm text-[11px] font-medium cursor-pointer flex items-center gap-1 transition-colors ${
                    active
                      ? 'bg-[#D69635] text-[#14161D] font-semibold'
                      : disc
                        ? 'bg-[#1D2330] hover:bg-[#283142] text-[#E5DAC4] border border-[#8E6B35]/35'
                        : 'bg-[#181E2B] hover:bg-[#232C3E] text-[#BAC6D4] border border-[#6E8AB5]/35'
                  }`}
                  title={disc ? `${def.name} — ${def.subtitle}` : `${def.name} — visible to you; unexplored by Hearthglen scouts`}
                >
                  <span>{def.name.replace(' Isle', '').replace(' Ridge', '').replace(' Spire', '').replace(' Atoll', '')}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded-sm hover:bg-[#252D3D] text-[#B4A995] hover:text-[#F3EAD6] cursor-pointer"
            title="Hide Dock (H)"
            aria-label="Hide Dock"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Bottom Row: Villager Retinue + Gentle God Comment Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 overflow-x-auto max-w-[54vw] sm:max-w-[460px] pr-1">
            {villagers.length === 0 ? (
              <span className="px-2 py-1 text-[11px] text-[#E38589]">No living inhabitants remain.</span>
            ) : (
              villagers.map((v) => {
                const isSelected = v.id === selectedVillagerId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onSelectVillager(v.id)}
                    onDoubleClick={() => onFocusVillager(v.id)}
                    className={`flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-left transition-all cursor-pointer shrink-0 border ${
                      isSelected
                        ? 'bg-[#2B3548] border-[#E5AF47] text-[#FFFDF9]'
                        : 'bg-[#1A202C]/70 border-transparent hover:bg-[#242B3B] text-[#D8CEBA]'
                    }`}
                    title={`${v.name} (${ISLAND_DEFS[v.islandId].name}) — Double-click to follow`}
                  >
                    <VillagerPortrait
                      cloakColor={v.cloakColor}
                      hairColor={v.hairColor}
                      skinTone={v.skinTone}
                      hairStyle={v.hairStyle}
                      lifeStage={v.lifeStage}
                      isChief={v.isChief}
                      mood={v.mood}
                      activeTask={v.activeTask}
                      size={26}
                    />
                    <div className="min-w-0 leading-tight">
                      <div className="text-[11px] font-semibold truncate max-w-[68px]">
                        {v.name.split(' ')[0]}
                      </div>
                      <div className="text-[9.5px] text-[#B4A995] tabular-nums">
                        {Math.round(v.hp)}hp · {Math.round(v.warmth)}°
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-[#8E6B35]/35 text-[11px] text-[#B4A995] tabular-nums">
            <span title="Population vs Housing Beds">
              {villagers.length}/{totalBeds} beds
            </span>
          </div>

          {villagers.length > 0 && (
            <div className="flex items-center gap-1 pl-2 border-l border-[#8E6B35]/35">
              {selectedVillagerId && (
                <button
                  type="button"
                  onClick={() => onFocusVillager(selectedVillagerId)}
                  className="p-1.5 rounded-sm bg-[#212836] hover:bg-[#2C3547] border border-[#8E6B35]/35 text-[#E5AF47] cursor-pointer"
                  title="Follow Selected Villager"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onChatSelected}
                className="px-2 py-1 rounded-sm bg-[#232A38] hover:bg-[#2F384B] border border-[#8E6B35]/40 text-[11px] font-semibold text-[#F3EAD6] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                title="Talk with villager (T)"
              >
                <MessageCircle className="w-3 h-3 text-[#E5AF47]" />
                <span>Talk</span>
              </button>
              <button
                type="button"
                onClick={() => onCommentSelected('praise')}
                className="px-2 py-1 rounded-sm bg-[#2E2229] hover:bg-[#3D2C36] border border-[#9E5A60]/40 text-[11px] font-semibold text-[#F7DFE0] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                title="Praise gently (P)"
              >
                <Heart className="w-3 h-3 text-[#E4787D]" />
                <span>Praise</span>
              </button>
              <button
                type="button"
                onClick={() => onCommentSelected('remind_eat')}
                className="px-2 py-1 rounded-sm bg-[#1F2C27] hover:bg-[#2A3C35] border border-[#589674]/40 text-[11px] font-semibold text-[#DFEFE4] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                title="Remind villager to check food (F)"
              >
                <Utensils className="w-3 h-3 text-[#65B386]" />
                <span>Meal</span>
              </button>
              <button
                type="button"
                onClick={() => onCommentSelected('encourage_explore')}
                className="px-2 py-1 rounded-sm bg-[#1E2534] hover:bg-[#2A3347] border border-[#6E8AB5]/40 text-[11px] font-semibold text-[#DCE6F5] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                title="Encourage curiosity toward distant islands"
              >
                <Compass className="w-3 h-3 text-[#8EB4E6]" />
                <span>Explore</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
