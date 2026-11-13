import { CloudSun, Sparkles, X } from 'lucide-react';
import { SEASON_META, WEATHER_LABELS } from '../game/catalog';
import type { EnvironmentState, GameMode, SeasonType, WeatherType } from '../game/types';
import { SeasonSvg } from './StorybookIcons';

interface ClimateDrawerProps {
  environment: EnvironmentState;
  gameMode: GameMode;
  onSetWeather?: (weather: WeatherType) => void;
  onSetTimePreset?: (timeOfDay: number) => void;
  onSetSeason?: (season: SeasonType) => void;
  onTriggerFestival?: () => void;
  onClose: () => void;
}

const SEASON_KEYS: SeasonType[] = ['spring', 'summer', 'autumn', 'winter'];
const ALL_WEATHERS: WeatherType[] = ['clear', 'breeze', 'rain', 'mist', 'snow'];
const TIME_PRESETS = [
  { label: 'Dawn', t: 0.28 },
  { label: 'Day', t: 0.48 },
  { label: 'Golden', t: 0.68 },
  { label: 'Dusk', t: 0.78 },
  { label: 'Night', t: 0.04 },
];

function getTimePhaseLabel(t: number): string {
  if (t < 0.22 || t >= 0.85) return 'Night';
  if (t < 0.34) return 'Dawn';
  if (t < 0.63) return 'Day';
  if (t < 0.74) return 'Golden Hour';
  return 'Dusk';
}

export function ClimateDrawer({
  environment,
  gameMode,
  onSetWeather,
  onSetTimePreset,
  onSetSeason,
  onTriggerFestival,
  onClose,
}: ClimateDrawerProps) {
  const seasonMeta = SEASON_META[environment.season];
  const uniqueWeathers = Array.from(new Set(seasonMeta.weatherWeights));
  const isSovereign = gameMode === 'sovereign_sandbox';

  return (
    <aside
      aria-label="Valley Sky and Season Almanac"
      className="pointer-events-auto kingdom-frame fixed top-13 right-3.5 z-20 w-[280px] max-w-[calc(100vw-1.5rem)] rounded p-3 text-[#F3EAD6] hud-panel"
    >
      <div className="flex items-center justify-between pb-2 border-b border-[#8E6B35]/40">
        <h2 className="text-sm font-semibold text-[#F7EFDD]" style={{ fontFamily: 'var(--font-display)' }}>
          Sky & Season Almanac
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-sm hover:bg-[#252D3D] text-[#B4A995] hover:text-[#F3EAD6] cursor-pointer"
          aria-label="Close Climate Drawer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="mt-2 text-[11px] text-[#B4A995] leading-snug">
        {isSovereign
          ? 'Sovereign Sky Command: shape weather, sunlight, season, and festivals at will.'
          : 'Nature turns at its own unhurried pace across Hearthglen. Watch how villagers adapt to light, rain, and season.'}
      </p>

      <div className="mt-2.5 pt-2 border-t border-[#8E6B35]/35 space-y-1.5 text-[11px] tabular-nums">
        <div className="flex items-center justify-between">
          <span className="text-[#B4A995]">Daylight Phase</span>
          <span className="font-semibold text-[#F3EAD6]">{getTimePhaseLabel(environment.timeOfDay)}</span>
        </div>
        {isSovereign && onSetTimePreset && (
          <div className="grid grid-cols-5 gap-1">
            {TIME_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onSetTimePreset(p.t)}
                className="py-1 rounded-sm bg-[#1B2230] hover:bg-[#283246] border border-[#8E6B35]/35 text-[10px] text-[#E5DAC4] cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[#B4A995]">Current Weather</span>
          <span className="font-semibold text-[#8CE0AC] flex items-center gap-1">
            <CloudSun className="w-3.5 h-3.5" />
            {WEATHER_LABELS[environment.weather]}
          </span>
        </div>

        {isSovereign && onSetWeather ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {ALL_WEATHERS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => onSetWeather(w)}
                className={`px-2 py-0.5 rounded-sm text-[10px] font-medium cursor-pointer border ${
                  environment.weather === w
                    ? 'bg-[#D69635] text-[#14161D] border-[#FDE68A] font-semibold'
                    : 'bg-[#1B2230] hover:bg-[#283246] text-[#D8CEBA] border-[#8E6B35]/30'
                }`}
              >
                {WEATHER_LABELS[w]}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-[#B4A995]">Likely Sky Next</span>
            <span className="text-[#D8CEBA]">
              {uniqueWeathers.map((w) => WEATHER_LABELS[w]).join(' · ')}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-2.5 border-t border-[#8E6B35]/35">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="font-semibold text-[#F3EAD6]">Season Cycle</span>
          <span className="text-[10px] text-[#B4A995] tabular-nums">Day {environment.seasonDay}/5</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {SEASON_KEYS.map((s) => {
            const active = environment.season === s;
            if (isSovereign && onSetSeason) {
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSetSeason(s)}
                  className={`px-2 py-1 rounded-sm text-[11px] font-medium border whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer ${
                    active
                      ? 'bg-[#2B3548] text-[#FDE68A] border-[#E5AF47] font-semibold'
                      : 'bg-[#1D2330]/70 hover:bg-[#283142] text-[#B4A995] border-[#8E6B35]/25'
                  }`}
                >
                  <SeasonSvg season={s} />
                  <span>{SEASON_META[s].label}</span>
                </button>
              );
            }
            return (
              <div
                key={s}
                className={`px-2 py-1 rounded-sm text-[11px] font-medium border whitespace-nowrap flex items-center justify-center gap-1.5 ${
                  active
                    ? 'bg-[#2B3548] text-[#FDE68A] border-[#E5AF47] font-semibold'
                    : 'bg-[#1D2330]/70 text-[#8E8475] border-[#8E6B35]/20'
                }`}
              >
                <SeasonSvg season={s} />
                <span>{SEASON_META[s].label}</span>
              </div>
            );
          })}
        </div>

        {isSovereign && onTriggerFestival ? (
          <button
            type="button"
            onClick={onTriggerFestival}
            className={`mt-2.5 w-full py-1.5 px-2 rounded-sm text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer border ${
              environment.festivalActive
                ? 'bg-[#D69635] text-[#14161D] border-[#FDE68A]'
                : 'bg-[#232A38] hover:bg-[#2E384B] text-[#FDE68A] border-[#E5AF47]/45'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{environment.festivalActive ? 'End Lantern Festival' : `Ignite ${seasonMeta.festivalName}`}</span>
          </button>
        ) : (
          <p className="mt-2 text-[10.5px] text-[#E5AF47] flex items-center gap-1">
            <Sparkles className="w-3 h-3 shrink-0" />
            <span>{seasonMeta.festivalName} (Day 5 Dusk)</span>
          </p>
        )}
      </div>
    </aside>
  );
}
