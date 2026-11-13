import { Compass, RotateCcw, X } from 'lucide-react';
import { ISLAND_DEFS, ISLAND_ORDER, WORLD_HEIGHT, WORLD_WIDTH } from '../game/catalog';
import { CULTURES } from '../game/techAndCultures';
import type {
  BoatEntity,
  BuildingEntity,
  CameraState,
  IslandId,
  IslandState,
  MemorialStone,
  RoomPlayerPresence,
  SkyBridgeEntity,
  VillagerEntity,
} from '../game/types';

interface ValleyMapDrawerProps {
  islands: Record<IslandId, IslandState>;
  bridges: SkyBridgeEntity[];
  buildings: BuildingEntity[];
  villagers: VillagerEntity[];
  clanVillagers: VillagerEntity[];
  raiders: VillagerEntity[];
  boats: BoatEntity[];
  memorials: MemorialStone[];
  peers?: RoomPlayerPresence[];
  selectedVillagerId: string | null;
  camera: CameraState;
  viewportBounds: { sx: number; sy: number; vw: number; vh: number };
  onJumpTo: (x: number, y: number) => void;
  onFocusIsland: (id: IslandId | 'all') => void;
  onClose: () => void;
}

const BIOME_FILL: Record<string, string> = {
  meadow: '#45764B',
  pine: '#325E49',
  terrace: '#657F47',
  crag: '#5C554D',
  mist_atoll: '#3B6F74',
};

export function ValleyMapDrawer({
  islands,
  bridges,
  buildings,
  villagers,
  clanVillagers,
  raiders,
  boats,
  memorials,
  peers = [],
  selectedVillagerId,
  camera,
  viewportBounds,
  onJumpTo,
  onFocusIsland,
  onClose,
}: ValleyMapDrawerProps) {
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const wx = ((e.clientX - rect.left) / rect.width) * WORLD_WIDTH;
    const wy = ((e.clientY - rect.top) / rect.height) * WORLD_HEIGHT;
    onJumpTo(Math.round(wx), Math.round(wy));
  };

  return (
    <aside
      aria-label="Interactive Archipelago Map"
      className="pointer-events-auto kingdom-frame fixed top-14 left-3.5 z-20 w-[356px] max-w-[calc(100vw-1.5rem)] rounded p-3 text-[#F3EAD6] hud-panel"
    >
      <div className="flex items-center justify-between pb-2 border-b border-[#8E6B35]/40">
        <div className="flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-[#E5AF47]" />
          <h2 className="text-sm font-semibold text-[#F7EFDD]" style={{ fontFamily: 'var(--font-display)' }}>
            Archipelago Sea Chart
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onFocusIsland('all')}
            className="px-1.5 py-0.5 rounded-sm hover:bg-[#252D3D] text-[10px] font-medium text-[#D8CEBA] cursor-pointer flex items-center gap-1"
            title="World Overview (0)"
          >
            <RotateCcw className="w-3 h-3 text-[#E5AF47]" />
            <span>Overview</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-sm hover:bg-[#252D3D] text-[#B4A995] hover:text-[#F3EAD6] cursor-pointer"
            aria-label="Close Archipelago Map"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2 rounded-sm border border-[#8E6B35]/60 overflow-hidden bg-[#132535]">
        <svg
          viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
          onClick={handleSvgClick}
          className="block w-full h-auto cursor-crosshair select-none"
          role="img"
          aria-label="Interactive chart of the five floating islands and sky-sea"
        >
          {/* Sky-Sea Backdrop */}
          <rect width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="#152B3C" />
          <rect x="20" y="20" width={WORLD_WIDTH - 40} height={WORLD_HEIGHT - 40} fill="none" stroke="#8E6B35" strokeOpacity="0.45" strokeWidth="6" />

          {/* Sky-Bridges */}
          {bridges.map((br) => (
            <line
              key={br.id}
              x1={br.x1}
              y1={br.y1}
              x2={br.x2}
              y2={br.y2}
              stroke={br.built ? '#E5AF47' : '#64748B'}
              strokeWidth={br.built ? 18 : 10}
              strokeDasharray={br.built ? undefined : '24 16'}
            />
          ))}

          {/* Floating Islands (always crisp and visible to God) */}
          {ISLAND_ORDER.map((id) => {
            const def = ISLAND_DEFS[id];
            const st = islands[id];
            const disc = Boolean(st?.discovered);
            const cult = CULTURES[st?.owningCultureId ?? def.defaultCultureId];
            return (
              <ellipse
                key={id}
                cx={def.centerX}
                cy={def.centerY}
                rx={def.radiusX}
                ry={def.radiusY}
                fill={BIOME_FILL[def.biome] ?? '#3E6B47'}
                stroke={cult.bannerColor}
                strokeWidth={disc ? 14 : 9}
                strokeDasharray={disc ? undefined : '28 14'}
              />
            );
          })}

          {/* Buildings */}
          {buildings.map((b) => (
            <rect
              key={b.id}
              x={b.x - 20}
              y={b.y - 20}
              width="40"
              height="34"
              rx="6"
              fill={CULTURES[b.cultureId]?.bannerColor ?? '#D69635'}
              stroke="#FAF6EE"
              strokeWidth="4"
            />
          ))}

          {/* Boats */}
          {boats.map((boat) => (
            <polygon
              key={boat.id}
              points={`${boat.x},${boat.y - 28} ${boat.x + 22},${boat.y + 18} ${boat.x - 22},${boat.y + 18}`}
              fill={CULTURES[boat.cultureId]?.sailColor ?? '#FAF6EE'}
              stroke="#14161D"
              strokeWidth="4"
            />
          ))}

          {/* Memorials */}
          {memorials.map((m) => (
            <circle key={m.id} cx={m.x} cy={m.y} r="14" fill="#9CA3AF" stroke="#14161D" strokeWidth="4" />
          ))}

          {/* Raiders */}
          {raiders.map((r) => (
            <circle key={r.id} cx={r.x} cy={r.y} r="20" fill="#EF4444" stroke="#FEF2F2" strokeWidth="4" />
          ))}

          {/* Native Clan Inhabitants */}
          {clanVillagers.map((cv) => {
            const isSel = cv.id === selectedVillagerId;
            return (
              <g key={cv.id}>
                {isSel && <circle cx={cv.x} cy={cv.y} r="36" fill="none" stroke="#FDE68A" strokeWidth="7" />}
                <circle
                  cx={cv.x}
                  cy={cv.y}
                  r="17"
                  fill={cv.cloakColor}
                  stroke={CULTURES[cv.cultureId]?.bannerColor ?? '#FAF6EE'}
                  strokeWidth="6"
                />
              </g>
            );
          })}

          {/* Live Villagers */}
          {villagers.map((v) => {
            const isSel = v.id === selectedVillagerId;
            return (
              <g key={v.id}>
                {isSel && <circle cx={v.x} cy={v.y} r="38" fill="none" stroke="#FDE68A" strokeWidth="7" />}
                <circle
                  cx={v.x}
                  cy={v.y}
                  r={v.isChief ? 24 : 19}
                  fill={v.cloakColor}
                  stroke={v.isChief ? '#FBBF24' : '#FAF6EE'}
                  strokeWidth="6"
                />
              </g>
            );
          })}

          {/* Remote Multiplayer Co-Deity Cursors */}
          {peers.map((p) => (
            <g key={p.id}>
              <circle cx={p.cursorSimX} cy={p.cursorSimY} r="44" fill="none" stroke={p.color} strokeWidth="9" />
              <circle cx={p.cursorSimX} cy={p.cursorSimY} r="12" fill={p.color} />
            </g>
          ))}

          {/* Island Labels */}
          {ISLAND_ORDER.map((id) => {
            const def = ISLAND_DEFS[id];
            return (
              <text
                key={id}
                x={def.centerX}
                y={def.centerY - def.radiusY - 34}
                textAnchor="middle"
                fill="#F7EFDD"
                stroke="#101A24"
                strokeWidth="14"
                paintOrder="stroke"
                fontSize="64"
                fontWeight="700"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {def.name}
              </text>
            );
          })}

          {/* Live Viewport Box */}
          <rect
            x={viewportBounds.sx}
            y={viewportBounds.sy}
            width={viewportBounds.vw}
            height={viewportBounds.vh}
            fill="rgba(229, 175, 71, 0.08)"
            stroke="#FDE68A"
            strokeWidth="12"
            strokeDasharray="36 22"
          />
        </svg>
      </div>

      <p className="mt-1.5 text-[10px] text-[#B4A995] tabular-nums flex items-center justify-between">
        <span>Click map to pan · Scroll to zoom</span>
        <span>Zoom {camera.zoom.toFixed(2)}×</span>
      </p>
    </aside>
  );
}
