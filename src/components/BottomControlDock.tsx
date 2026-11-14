import {
  BoxSelect,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  Globe,
  Heart,
  MessageCircle,
  RotateCcw,
  RotateCw,
  Swords,
  Utensils,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ISLAND_DEFS, ISLAND_ORDER } from '../game/catalog';
import type { GameMode, GodCommentKind, IslandId, IslandState, VillagerEntity } from '../game/types';
import { VillagerPortrait } from './VillagerPortrait';

interface BottomControlDockProps {
  villagers: VillagerEntity[];
  totalBeds: number;
  homeIslandId: IslandId;
  islands: Record<IslandId, IslandState>;
  focusIslandId: IslandId | 'all';
  selectedVillagerId: string | null;
  selectedUnitIds?: Set<string>;
  gameMode?: GameMode;
  boxSelectMode?: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFocusIsland: (target: IslandId | 'all') => void;
  onSelectVillager: (id: string, additive?: boolean) => void;
  onFocusVillager: (id: string) => void;
  onChatSelected: () => void;
  onCommentSelected: (kind: GodCommentKind) => void;
  onToggleBoxSelect?: () => void;
  onDraftSelected?: () => void;
  onRotateCamera?: (deltaYaw: number) => void;
  onResetCameraYaw?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export function BottomControlDock({
  villagers,
  totalBeds,
  homeIslandId,
  islands,
  focusIslandId,
  selectedVillagerId,
  selectedUnitIds,
  gameMode,
  boxSelectMode,
  collapsed,
  onToggleCollapse,
  onFocusIsland,
  onSelectVillager,
  onFocusVillager,
  onChatSelected,
  onCommentSelected,
  onToggleBoxSelect,
  onDraftSelected,
  onRotateCamera,
  onResetCameraYaw,
  onZoomIn,
  onZoomOut,
}: BottomControlDockProps) {
  const isRtsMode = gameMode === 'sovereign_sandbox' || gameMode === 'shared_siege';
  const rtsCount = selectedUnitIds?.size ?? 0;

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
        {/* Top Row: All Islands Overview + Island Focus Buttons + Camera Orbit + Collapse Toggle */}
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
              const shortLabel = def.name
                .replace(' Isle', '')
                .replace(' Ridge', '')
                .replace(' Spire', '')
                .replace(' Atoll', '')
                .replace(' Ruins', '')
                .replace(' Glacier', '')
                .replace('Ashen Bastion', 'Bastion');
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onFocusIsland(id)}
                  className={`px-2 py-1 rounded-sm text-[11px] font-medium cursor-pointer flex items-center gap-1 transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#D69635] text-[#14161D] font-semibold'
                      : disc
                        ? 'bg-[#1D2330] hover:bg-[#283142] text-[#E5DAC4] border border-[#8E6B35]/35'
                        : 'bg-[#181E2B] hover:bg-[#232C3E] text-[#BAC6D4] border border-[#6E8AB5]/35'
                  }`}
                  title={
                    id === homeIslandId
                      ? `${def.name} (Your Village) — ${def.subtitle}`
                      : disc
                        ? `${def.name} (${def.roleTag}) — ${def.subtitle}`
                        : `${def.name} (${def.roleTag}) — visible to you; AI / distant island`
                  }
                >
                  <span>{id === homeIslandId ? `${shortLabel} ★` : shortLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1">
            {(onZoomOut || onZoomIn) && (
              <div className="flex items-center gap-0.5 pr-1 border-r border-[#8E6B35]/35">
                {onZoomOut && (
                  <button
                    type="button"
                    onClick={onZoomOut}
                    className="p-1 rounded-sm bg-[#1D2330] hover:bg-[#283142] border border-[#8E6B35]/35 text-[#E5DAC4] cursor-pointer"
                    title="Zoom Out (-)"
                    aria-label="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5 text-[#E5AF47]" />
                  </button>
                )}
                {onZoomIn && (
                  <button
                    type="button"
                    onClick={onZoomIn}
                    className="p-1 rounded-sm bg-[#1D2330] hover:bg-[#283142] border border-[#8E6B35]/35 text-[#E5DAC4] cursor-pointer"
                    title="Zoom In (+)"
                    aria-label="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5 text-[#E5AF47]" />
                  </button>
                )}
              </div>
            )}
            {onRotateCamera && onResetCameraYaw && (
              <div className="flex items-center gap-0.5 pr-1 border-r border-[#8E6B35]/35">
                <button
                  type="button"
                  onClick={() => onRotateCamera(-0.28)}
                  className="px-1.5 py-1 rounded-sm bg-[#1D2330] hover:bg-[#283142] border border-[#8E6B35]/35 text-[10.5px] text-[#E5DAC4] flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                  title="Orbit Camera Left (Q) · Pan Camera (WASD / Arrows)"
                >
                  <RotateCcw className="w-3 h-3 text-[#E5AF47]" />
                  <span>Q</span>
                </button>
                <button
                  type="button"
                  onClick={onResetCameraYaw}
                  className="px-1.5 py-1 rounded-sm bg-[#1D2330] hover:bg-[#283142] border border-[#8E6B35]/35 text-[10px] text-[#B4A995] hover:text-[#F3EAD6] cursor-pointer whitespace-nowrap"
                  title="Reset Camera Angle (0 / Home)"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => onRotateCamera(0.28)}
                  className="px-1.5 py-1 rounded-sm bg-[#1D2330] hover:bg-[#283142] border border-[#8E6B35]/35 text-[10.5px] text-[#E5DAC4] flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                  title="Orbit Camera Right (E) · Cycle Villager ([ / ])"
                >
                  <span>E</span>
                  <RotateCw className="w-3 h-3 text-[#E5AF47]" />
                </button>
              </div>
            )}
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
        </div>

        {/* Bottom Row: Villager Retinue + RTS / Gentle God Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 overflow-x-auto max-w-[54vw] sm:max-w-[460px] pr-1">
            {villagers.length === 0 ? (
              <span className="px-2 py-1 text-[11px] text-[#E38589]">No living inhabitants remain.</span>
            ) : (
              villagers.map((v) => {
                const isSelected = v.id === selectedVillagerId || Boolean(selectedUnitIds?.has(v.id));
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={(e) => onSelectVillager(v.id, e.shiftKey)}
                    onDoubleClick={() => onFocusVillager(v.id)}
                    className={`flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-left transition-all cursor-pointer shrink-0 border ${
                      isSelected
                        ? 'bg-[#2B3548] border-[#E5AF47] text-[#FFFDF9]'
                        : 'bg-[#1A202C]/70 border-transparent hover:bg-[#242B3B] text-[#D8CEBA]'
                    }`}
                    title={`${v.name} (${ISLAND_DEFS[v.islandId].name}) — Shift+Click multi-select, Double-click follow`}
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
            <div className="flex flex-wrap items-center gap-1 pl-2 border-l border-[#8E6B35]/35">
              {isRtsMode && onToggleBoxSelect && (
                <button
                  type="button"
                  onClick={onToggleBoxSelect}
                  className={`px-2 py-1 rounded-sm border text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                    boxSelectMode
                      ? 'bg-[#D69635] text-[#14161D] border-[#FDE68A]'
                      : 'bg-[#1F2736] hover:bg-[#2A3548] border-[#8E6B35]/45 text-[#FDE68A]'
                  }`}
                  title="Drag-box marquee select (or hold Shift+Left Drag). Right-click to order units."
                >
                  <BoxSelect className="w-3 h-3" />
                  <span>{rtsCount > 1 ? `Box (${rtsCount})` : 'Box Select'}</span>
                </button>
              )}
              {isRtsMode && onDraftSelected && rtsCount > 0 && (
                <button
                  type="button"
                  onClick={onDraftSelected}
                  className="px-2 py-1 rounded-sm bg-[#3A2026] hover:bg-[#4E2A32] border border-[#E38589]/55 text-[11px] font-semibold text-[#FDE2E3] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  title="Toggle combat draft for selected units"
                >
                  <Swords className="w-3 h-3 text-[#E38589]" />
                  <span>Draft</span>
                </button>
              )}
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
