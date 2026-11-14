import { useState } from 'react';
import {
  BookOpen,
  CloudRain,
  CloudSun,
  Compass,
  Copy,
  Crown,
  Gift,
  Lightbulb,
  Moon,
  Pause,
  Settings,
  Snowflake,
  Sparkles,
  Sun,
  Swords,
  Users,
  Volume2,
  VolumeX,
  Wind,
  Wrench,
} from 'lucide-react';
import { ISLAND_DEFS, SEASON_META, WEATHER_LABELS } from '../game/catalog';
import { TECH_BY_ID } from '../game/techAndCultures';
import type { HudSnapshot, RoomPlayerPresence, VillageEra, VillageTrajectory, WeatherType } from '../game/types';
import { ResourceSvg, SeasonSvg } from './StorybookIcons';

interface TopBarProps {
  hud: HudSnapshot;
  muted: boolean;
  simSpeed: 0 | 1 | 2 | 3;
  activeDrawer: 'ledger' | 'climate' | 'map' | null;
  devToolsOpen?: boolean;
  mpRoomCode: string | null;
  mpPlayers: RoomPlayerPresence[];
  onToggleDrawer: (drawer: 'ledger' | 'climate' | 'map') => void;
  onToggleDevTools?: () => void;
  onChangeSimSpeed: (speed: 0 | 1 | 2 | 3) => void;
  onToggleMute: () => void;
  onGrantResources: () => void;
  onPause: () => void;
}

const ERA_NUMERAL: Record<VillageEra, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
};

const TRAJECTORY_META: Record<VillageTrajectory, { label: string; colorClass: string }> = {
  flourishing: { label: 'Flourishing', colorClass: 'text-[#8CE0AC]' },
  steady: { label: 'Steady', colorClass: 'text-[#E5AF47]' },
  strained: { label: 'Strained', colorClass: 'text-[#F0B46E]' },
  ruin_risk: { label: 'Ruin Risk', colorClass: 'text-[#E38589]' },
  ruined: { label: 'Ruined', colorClass: 'text-[#D66A6E]' },
};

function getTimePhaseLabel(t: number): string {
  if (t < 0.22 || t >= 0.85) return 'Night';
  if (t < 0.34) return 'Dawn';
  if (t < 0.63) return 'Day';
  if (t < 0.74) return 'Golden';
  return 'Dusk';
}

function WeatherIcon({ weather, timeOfDay }: { weather: WeatherType; timeOfDay: number }) {
  const cls = 'w-3.5 h-3.5 shrink-0 text-[#E5AF47]';
  if (weather === 'rain') return <CloudRain className={cls} />;
  if (weather === 'snow') return <Snowflake className={cls} />;
  if (weather === 'breeze') return <Wind className={cls} />;
  if (weather === 'mist') return <CloudSun className={cls} />;
  if (timeOfDay < 0.22 || timeOfDay >= 0.84) return <Moon className={cls} />;
  return <Sun className={cls} />;
}

export function TopBar({
  hud,
  muted,
  simSpeed,
  activeDrawer,
  devToolsOpen,
  mpRoomCode,
  mpPlayers,
  onToggleDrawer,
  onToggleDevTools,
  onChangeSimSpeed,
  onToggleMute,
  onGrantResources,
  onPause,
}: TopBarProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const { resources, environment, era, prosperityScore, villageTrajectory, activeTechId, knowledgeXp, gameMode } = hud;
  const seasonLabel = SEASON_META[environment.season].label;
  const traj = TRAJECTORY_META[villageTrajectory];
  const activeTech = activeTechId ? TECH_BY_ID[activeTechId] : null;
  const techPct = activeTech ? Math.min(100, Math.round((knowledgeXp / Math.max(1, activeTech.costXp)) * 100)) : 100;

  const handleCopyCode = () => {
    if (!mpRoomCode) return;
    navigator.clipboard?.writeText(mpRoomCode).catch(() => {});
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1800);
  };

  return (
    <header className="pointer-events-none fixed top-0 left-0 right-0 z-20 flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
      {/* Top-Left Horizon Crest */}
      <div className="pointer-events-auto kingdom-frame flex flex-wrap items-center gap-2.5 rounded px-3 py-1.5 text-[11px] font-medium text-[#F3EAD6] tabular-nums">
        <span className="flex items-center gap-1.5 font-semibold text-[#E5AF47] whitespace-nowrap" title="Archipelago Era">
          <Crown className="w-3.5 h-3.5 text-[#E5AF47]" />
          <span style={{ fontFamily: 'var(--font-display)' }}>Era {ERA_NUMERAL[era]}</span>
        </span>

        <span
          className={`text-[10.5px] font-semibold whitespace-nowrap ${
            gameMode === 'shared_siege' ? 'text-[#E38589]' : 'text-[#A8D8EA]'
          }`}
        >
          {gameMode === 'sovereign_sandbox' ? 'Sovereign' : gameMode === 'shared_siege' ? 'Siege' : 'Whispering'}
        </span>

        <span
          className="text-[10.5px] font-semibold text-[#FDE68A] whitespace-nowrap"
          title="Your assigned village (other islands act as autonomous AI or rival player villages)"
        >
          {ISLAND_DEFS[hud.localHomeIslandId]?.name ?? 'Cradle Isle'} ({hud.populationCount}/{hud.totalHousingBeds} beds)
        </span>

        {gameMode === 'shared_siege' && (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-[#3C1E24] border border-[#E38589]/55 text-[10.5px] font-semibold text-[#FDE2E3] whitespace-nowrap"
            title={hud.siege.warningText ?? 'Shared Siege Multi-Front Wave Defense'}
          >
            <Swords className="w-3 h-3 text-[#E38589]" />
            <span>
              Wave {hud.siege.wave} · {hud.siege.totalKills} KO
              {hud.siege.activeFronts.length > 0
                ? ` · ${hud.siege.activeFronts.length} Fronts`
                : ` · Next ${Math.max(0, Math.ceil(hud.siege.nextWaveTimer))}s`}
            </span>
          </span>
        )}

        <span className={`font-semibold whitespace-nowrap ${traj.colorClass}`}>
          {traj.label} {prosperityScore}%
        </span>

        <span className="text-[#8E6B35]/60" aria-hidden="true">|</span>

        <span className="flex items-center gap-1.5 text-[#D8CEBA] whitespace-nowrap">
          <SeasonSvg season={environment.season} />
          <span>
            {seasonLabel} {environment.seasonDay}/5
          </span>
          <span className="text-[#8E7F6B]" aria-hidden="true">·</span>
          <WeatherIcon weather={environment.weather} timeOfDay={environment.timeOfDay} />
          <span>{getTimePhaseLabel(environment.timeOfDay)}</span>
          <span className="text-[#8E7F6B]" aria-hidden="true">·</span>
          <span>{WEATHER_LABELS[environment.weather]}</span>
          {environment.festivalActive && (
            <span className="flex items-center gap-0.5 text-[#FBBF24] font-semibold">
              <Sparkles className="w-3 h-3" />
              Festival
            </span>
          )}
        </span>

        {activeTech && (
          <>
            <span className="text-[#8E6B35]/60" aria-hidden="true">|</span>
            <button
              type="button"
              onClick={() => onToggleDrawer('ledger')}
              className="flex items-center gap-1.5 text-[#A8D8EA] hover:text-[#FDE68A] cursor-pointer whitespace-nowrap"
              title={`Studying ${activeTech.name} (${Math.floor(knowledgeXp)}/${activeTech.costXp} XP)`}
            >
              <Lightbulb className="w-3.5 h-3.5 text-[#FDE047] shrink-0" />
              <span className="max-w-[115px] truncate">{activeTech.name}</span>
              <span className="text-[#D8CEBA]">{techPct}%</span>
            </button>
          </>
        )}

        {mpRoomCode && (
          <>
            <span className="text-[#8E6B35]/60" aria-hidden="true">|</span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex items-center gap-1 text-[#8CE0AC] hover:text-[#FDE68A] cursor-pointer whitespace-nowrap"
              title="Click to copy Co-Op Room Code"
            >
              <Users className="w-3.5 h-3.5" />
              <span className="font-mono font-semibold">{copiedCode ? 'Copied' : mpRoomCode}</span>
              <span className="text-[#D8CEBA]">({mpPlayers.length})</span>
              <Copy className="w-2.5 h-2.5 opacity-80" />
            </button>
          </>
        )}
      </div>

      {/* Top-Right Stockpiles & Controls */}
      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
        <div className="kingdom-frame flex items-center gap-3 rounded px-3 py-1.5 text-[11px] font-semibold text-[#F3EAD6] tabular-nums">
          <span className="flex items-center gap-1 whitespace-nowrap" title="Total Food (Berries, Grain, Meat, Fish)">
            <ResourceSvg kind="food" />
            {Math.floor(resources.food)}
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap" title="Timber">
            <ResourceSvg kind="timber" />
            {Math.floor(resources.timber)}
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap" title="Stone">
            <ResourceSvg kind="stone" />
            {Math.floor(resources.stone)}
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap" title="Copper / Bronze / Iron">
            <ResourceSvg kind={resources.iron > 0 ? 'iron' : resources.bronze > 0 ? 'bronze' : 'copper'} />
            {Math.floor(resources.copper + resources.bronze + resources.iron)}
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap" title="Wool (for winter warmth)">
            <ResourceSvg kind="wool" />
            {Math.floor(resources.wool)}
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap text-[#FDE68A]" title="Hearthlight">
            <ResourceSvg kind="hearthlight" />
            {Math.floor(resources.hearthlight)}
          </span>
          {gameMode === 'sovereign_sandbox' && (
            <button
              type="button"
              onClick={onGrantResources}
              className="ml-1 px-1.5 py-0.5 rounded-sm bg-[#2B3749] hover:bg-[#3A4A62] border border-[#E5AF47]/50 text-[10px] text-[#FDE68A] flex items-center gap-1 cursor-pointer whitespace-nowrap"
              title="Grant Divine Bounty (+Timber, Stone, Food, Ores)"
            >
              <Gift className="w-3 h-3" />
              <span>+Bounty</span>
            </button>
          )}
        </div>

        <div className="kingdom-frame flex items-center gap-0.5 rounded p-0.5 text-[11px] font-medium text-[#E5DAC4]">
          <button
            type="button"
            onClick={() => onToggleDrawer('ledger')}
            className={`px-2.5 py-1 rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
              activeDrawer === 'ledger'
                ? 'bg-[#D69635] text-[#14161D] font-semibold'
                : 'hover:bg-[#252D3D] text-[#E5DAC4]'
            }`}
            title="Realm Ledger: Structures, Tech Tree, Islands & Diplomacy (B / L)"
          >
            <BookOpen className="w-3 h-3" />
            <span>Ledger</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleDrawer('map')}
            className={`px-2 py-1 rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
              activeDrawer === 'map'
                ? 'bg-[#D69635] text-[#14161D] font-semibold'
                : 'hover:bg-[#252D3D] text-[#E5DAC4]'
            }`}
            title="Archipelago Map (G)"
          >
            <Compass className="w-3 h-3" />
            <span>Map</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleDrawer('climate')}
            className={`px-2.5 py-1 rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeDrawer === 'climate'
                ? 'bg-[#D69635] text-[#14161D] font-semibold'
                : 'hover:bg-[#252D3D] text-[#E5DAC4]'
            }`}
            title="Sky & Season Almanac (C)"
          >
            Sky
          </button>
          {onToggleDevTools && (
            <button
              type="button"
              onClick={onToggleDevTools}
              className={`px-2 py-1 rounded-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                devToolsOpen
                  ? 'bg-[#D69635] text-[#14161D] font-semibold'
                  : 'hover:bg-[#252D3D] text-[#FDE68A]'
              }`}
              title="Developer Toolbox"
            >
              <Wrench className="w-3 h-3" />
              <span>Dev</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleMute}
            className="p-1.5 rounded-sm hover:bg-[#252D3D] transition-colors cursor-pointer shrink-0"
            title={muted ? 'Unmute Sound (M)' : 'Mute Sound (M)'}
            aria-label={muted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5 text-[#9C907D]" /> : <Volume2 className="w-3.5 h-3.5 text-[#E5AF47]" />}
          </button>
          <div className="flex items-center gap-0.5 px-1 border-l border-[#8E6B35]/35" role="group" aria-label="Game Speed">
            {([0, 1, 2, 3] as const).map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => onChangeSimSpeed(sp)}
                className={`px-1.5 py-1 rounded-sm text-[10.5px] font-semibold cursor-pointer tabular-nums transition-colors ${
                  simSpeed === sp
                    ? sp === 0
                      ? 'bg-[#8E4B52] text-[#FFFDF9]'
                      : 'bg-[#4C8767] text-[#FFFDF9]'
                    : 'hover:bg-[#252D3D] text-[#C8BCA6]'
                }`}
                title={sp === 0 ? 'Pause Time (Space)' : `Simulation Speed ${sp}x`}
              >
                {sp === 0 ? <Pause className="w-3 h-3" /> : `${sp}×`}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onPause}
            className="p-1.5 rounded-sm hover:bg-[#252D3D] transition-colors cursor-pointer shrink-0"
            title="Chronicle & Settings (Esc)"
            aria-label="Chronicle and Settings"
          >
            <Settings className="w-3.5 h-3.5 text-[#E5AF47]" />
          </button>
        </div>
      </div>
    </header>
  );
}
