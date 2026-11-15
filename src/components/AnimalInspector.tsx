import { Crosshair, Heart, PawPrint, ShieldAlert, Sparkles, X } from 'lucide-react';
import { ISLAND_DEFS } from '../game/catalog';
import { LIVESTOCK_META } from '../game/techAndCultures';
import type { GameMode, IslandId, LivestockEntity, WildHerdEntity } from '../game/types';

export interface SelectedAnimalTarget {
  animalKind: 'livestock' | 'wild' | 'cat';
  id: string;
}

interface AnimalInspectorProps {
  target: SelectedAnimalTarget;
  livestock: LivestockEntity[];
  wildHerds: WildHerdEntity[];
  catPosition: { x: number; y: number };
  gameMode: GameMode;
  selectedRtsCount: number;
  onOrderHuntAttack: (targetId: string, islandId: IslandId, x: number, y: number) => void;
  onClose: () => void;
}

const WILD_ANIMAL_META: Record<
  WildHerdEntity['kind'],
  { label: string; demeanor: string; summary: string; role: string }
> = {
  rabbit: {
    label: 'Cottontail Hare',
    demeanor: 'Timid Forager',
    summary: 'Quick-footed meadow grazer. Skittish around hunters; yields light meat & pelts.',
    role: 'Small Wild Game',
  },
  deer: {
    label: 'Highland Stag / Doe',
    demeanor: 'Swift Grazer',
    summary: 'Wary woodland runner across terraces and pine ridges. Yields venison & supple hides.',
    role: 'Prime Wild Game',
  },
  boar: {
    label: 'Tusked Ridge Boar',
    demeanor: 'Territorial & Fierce',
    summary: 'Charges nearby villagers if provoked or cornered. High meat & tough hide yield.',
    role: 'Aggressive Beast',
  },
};

export function AnimalInspector({
  target,
  livestock,
  wildHerds,
  catPosition,
  gameMode,
  selectedRtsCount,
  onOrderHuntAttack,
  onClose,
}: AnimalInspectorProps) {
  const isRtsMode = gameMode === 'sovereign_sandbox' || gameMode === 'shared_siege';

  if (target.animalKind === 'cat') {
    return (
      <aside
        aria-label="Animal Inspector"
        className="pointer-events-auto kingdom-frame fixed top-14 right-3.5 z-20 w-[290px] max-w-[calc(100vw-1.5rem)] rounded p-3 text-[#F3EAD6] hud-panel"
      >
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#8E6B35]/40">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-sm bg-[#272F40] border border-[#E5AF47]/40 text-[#FDE68A]">
              <PawPrint className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#F7EFDD]" style={{ fontFamily: 'var(--font-display)' }}>
                Mochi the Hearth Cat
              </h2>
              <p className="text-[11px] text-[#B4A995]">Cradle Isle · Village Companion</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-sm hover:bg-[#252D3D] text-[#B4A995] hover:text-[#F3EAD6] cursor-pointer"
            aria-label="Close Animal Inspector"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-2.5 space-y-1.5 text-[11px] text-[#D8CEBA]">
          <p className="flex items-center gap-1.5 text-[#8CE0AC]">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Prowls near warm fires &amp; keeps villagers in good spirits.</span>
          </p>
          <p className="text-[#B4A995] tabular-nums">
            Position: ({Math.round(catPosition.x)}, {Math.round(catPosition.y)}) · Scale 1.00×
          </p>
        </div>
      </aside>
    );
  }

  if (target.animalKind === 'livestock') {
    const animal = livestock.find((a) => a.id === target.id);
    if (!animal) return null;
    const meta = LIVESTOCK_META[animal.kind];
    const scale = animal.scale ?? 1;

    return (
      <aside
        aria-label="Animal Inspector"
        className="pointer-events-auto kingdom-frame fixed top-14 right-3.5 z-20 w-[290px] max-w-[calc(100vw-1.5rem)] rounded p-3 text-[#F3EAD6] hud-panel"
      >
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#8E6B35]/40">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-7 h-7 rounded-sm border border-[#E5AF47]/45 flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${meta.color}22` }}
            >
              <PawPrint className="w-4 h-4 text-[#FDE68A]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[#F7EFDD] truncate" style={{ fontFamily: 'var(--font-display)' }}>
                {meta.label}
              </h2>
              <p className="text-[11px] text-[#B4A995] truncate">
                {ISLAND_DEFS[animal.islandId].name} · Tamed Livestock
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-sm hover:bg-[#252D3D] text-[#B4A995] hover:text-[#F3EAD6] cursor-pointer shrink-0"
            aria-label="Close Animal Inspector"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-2.5 space-y-1.5 text-[11px] text-[#D8CEBA]">
          <p className="text-[#C8BCA6] leading-snug">{meta.summary}</p>
          <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10.5px] tabular-nums">
            <div className="px-2 py-1 rounded-sm bg-[#1A202D] border border-[#8E6B35]/30">
              <span className="text-[#9C907D] block">Size Scale</span>
              <span className="font-semibold text-[#F3EAD6]">{scale.toFixed(2)}×</span>
            </div>
            <div className="px-2 py-1 rounded-sm bg-[#1A202D] border border-[#8E6B35]/30">
              <span className="text-[#9C907D] block">Next Yield</span>
              <span className="font-semibold text-[#8CE0AC]">{Math.max(0, Math.round(animal.yieldTimer))}s</span>
            </div>
          </div>
          <p className="flex items-center gap-1 text-[10.5px] text-[#8CE0AC] pt-0.5">
            <Heart className="w-3 h-3 shrink-0" />
            <span>Tended inside island pasture enclosure</span>
          </p>
        </div>
      </aside>
    );
  }

  const herd = wildHerds.find((h) => h.id === target.id);
  if (!herd) return null;
  const meta = WILD_ANIMAL_META[herd.kind];
  const scale = herd.scale ?? 1;
  const hpPct = Math.max(0, Math.min(100, Math.round((herd.hp / Math.max(1, herd.maxHp)) * 100)));

  return (
    <aside
      aria-label="Animal Inspector"
      className="pointer-events-auto kingdom-frame fixed top-14 right-3.5 z-20 w-[290px] max-w-[calc(100vw-1.5rem)] rounded p-3 text-[#F3EAD6] hud-panel"
    >
      <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#8E6B35]/40">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-7 h-7 rounded-sm border flex items-center justify-center shrink-0 ${
              herd.kind === 'boar'
                ? 'bg-[#3A1F25] border-[#E38589]/55 text-[#F4A2A5]'
                : 'bg-[#212B25] border-[#74C294]/45 text-[#8CE0AC]'
            }`}
          >
            {herd.kind === 'boar' ? <ShieldAlert className="w-4 h-4" /> : <PawPrint className="w-4 h-4" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#F7EFDD] truncate" style={{ fontFamily: 'var(--font-display)' }}>
              {meta.label}
            </h2>
            <p className="text-[11px] text-[#B4A995] truncate">
              {ISLAND_DEFS[herd.islandId].name} · {meta.role}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-sm hover:bg-[#252D3D] text-[#B4A995] hover:text-[#F3EAD6] cursor-pointer shrink-0"
          aria-label="Close Animal Inspector"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-2.5 space-y-2 text-[11px]">
        <div className="flex items-center justify-between text-[10.5px]">
          <span className="text-[#B4A995]">Demeanor</span>
          <span className={herd.kind === 'boar' ? 'text-[#E38589] font-semibold' : 'text-[#8CE0AC] font-semibold'}>
            {meta.demeanor}
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10.5px] tabular-nums">
            <span className="text-[#B4A995]">Vitality</span>
            <span className="text-[#F3EAD6] font-semibold">
              {Math.ceil(herd.hp)} / {herd.maxHp} HP
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[#262E3E] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${hpPct}%`,
                backgroundColor: herd.kind === 'boar' ? '#E36D70' : '#65B386',
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[10.5px] tabular-nums">
          <div className="px-2 py-1 rounded-sm bg-[#1A202D] border border-[#8E6B35]/30">
            <span className="text-[#9C907D] block">Size Scale</span>
            <span className="font-semibold text-[#F3EAD6]">{scale.toFixed(2)}×</span>
          </div>
          <div className="px-2 py-1 rounded-sm bg-[#1A202D] border border-[#8E6B35]/30">
            <span className="text-[#9C907D] block">Behavior</span>
            <span className="font-semibold text-[#FDE68A] capitalize">
              {herd.aggroTargetId ? 'Engaged' : (herd.behaviorState ?? 'wandering')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-[10px] tabular-nums">
          <div className="px-1.5 py-1 rounded-sm bg-[#1A202D] border border-[#8E6B35]/25">
            <span className="text-[#9C907D] block">Hunger</span>
            <span className="font-semibold text-[#A8DEC0]">{Math.round(herd.hunger ?? 76)}%</span>
          </div>
          <div className="px-1.5 py-1 rounded-sm bg-[#1A202D] border border-[#8E6B35]/25">
            <span className="text-[#9C907D] block">Thirst</span>
            <span className="font-semibold text-[#7CC4F2]">{Math.round(herd.thirst ?? 76)}%</span>
          </div>
          <div className="px-1.5 py-1 rounded-sm bg-[#1A202D] border border-[#8E6B35]/25">
            <span className="text-[#9C907D] block">Energy</span>
            <span className="font-semibold text-[#FDE68A]">{Math.round(herd.energy ?? 85)}%</span>
          </div>
        </div>

        <p className="text-[#C8BCA6] leading-snug">{meta.summary}</p>

        {isRtsMode && (
          <button
            type="button"
            disabled={selectedRtsCount === 0}
            onClick={() => onOrderHuntAttack(herd.id, herd.islandId, herd.x, herd.y)}
            className={`w-full py-1.5 px-2 rounded-sm text-[11px] font-semibold flex items-center justify-center gap-1.5 border ${
              selectedRtsCount > 0
                ? 'bg-[#3C2227] hover:bg-[#522D34] text-[#FDE2E3] border-[#E38589]/60 cursor-pointer'
                : 'bg-[#191F2A] text-[#6E675C] border-[#333A48] cursor-not-allowed'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>
              {selectedRtsCount > 0
                ? `Order ${selectedRtsCount} Unit${selectedRtsCount > 1 ? 's' : ''} to Hunt`
                : 'Select Units to Order Hunt'}
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
