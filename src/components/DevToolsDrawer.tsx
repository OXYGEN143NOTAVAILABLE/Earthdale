import { useState } from 'react';
import {
  Bug,
  CalendarPlus,
  Dices,
  Eye,
  Flame,
  Hammer,
  HeartPulse,
  Mountain,
  PackagePlus,
  PawPrint,
  Skull,
  Sparkles,
  Swords,
  Trees,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import { ALL_SKILL_IDS, ISLAND_DEFS, ISLAND_ORDER, SKILL_META, TRAITS } from '../game/catalog';
import type { IslandId, SkillId, VillagerEntity } from '../game/types';

export type DevActionPayload = {
  action:
    | 'grant_resources'
    | 'spawn_villager'
    | 'spawn_raider'
    | 'spawn_animal'
    | 'spawn_stone'
    | 'spawn_tree'
    | 'trigger_siege'
    | 'advance_day'
    | 'unlock_all_tech'
    | 'unlock_next_tech'
    | 'finish_builds'
    | 'heal_all'
    | 'reroll_traits'
    | 'grant_skill_xp';
  islandId?: IslandId;
  villagerId?: string;
  entityKind?: string;
  traitId?: string;
  skillId?: SkillId;
  amount?: number;
};

interface DevToolsDrawerProps {
  selectedVillager: VillagerEntity | null;
  debugShowCollisions: boolean;
  onToggleDebugCollisions: () => void;
  onDevAction: (payload: DevActionPayload) => void;
  onClose: () => void;
}

const TRAIT_LIST = Object.values(TRAITS);

export function DevToolsDrawer({
  selectedVillager,
  debugShowCollisions,
  onToggleDebugCollisions,
  onDevAction,
  onClose,
}: DevToolsDrawerProps) {
  const [targetIsland, setTargetIsland] = useState<IslandId>('cradle');
  const [animalKind, setAnimalKind] = useState<'rabbit' | 'deer' | 'boar'>('boar');
  const [selectedTraitId, setSelectedTraitId] = useState<string>('hard_skin');
  const [selectedSkillId, setSelectedSkillId] = useState<SkillId>('blade_mastery');

  return (
    <aside
      aria-label="Developer Tools"
      className="pointer-events-auto kingdom-frame fixed top-14 right-3.5 z-30 w-[336px] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-10.5rem)] overflow-y-auto rounded p-3 text-[#F3EAD6] hud-panel"
    >
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#8E6B35]/45">
        <div className="flex items-center gap-1.5">
          <Wrench className="w-4 h-4 text-[#FDE047]" />
          <h2 className="text-sm font-semibold text-[#F7EFDD]" style={{ fontFamily: 'var(--font-display)' }}>
            Developer Toolbox
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-sm hover:bg-[#252D3D] text-[#B4A995] hover:text-[#F3EAD6] cursor-pointer"
          aria-label="Close Developer Tools"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Island Target */}
      <div className="mt-2.5 space-y-2 text-[11px]">
        <label className="block">
          <span className="text-[10.5px] text-[#B4A995] font-medium block mb-1">Target Island</span>
          <select
            value={targetIsland}
            onChange={(e) => setTargetIsland(e.target.value as IslandId)}
            className="w-full px-2 py-1 rounded-sm bg-[#131823] border border-[#8E6B35]/45 text-[#F3EAD6] text-[11px]"
          >
            {ISLAND_ORDER.map((id) => (
              <option key={id} value={id}>
                {ISLAND_DEFS[id].name}
              </option>
            ))}
          </select>
        </label>

        {/* Economy, Time & Tech */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onDevAction({ action: 'grant_resources', amount: 60 })}
            className="px-2 py-1.5 rounded-sm bg-[#1F2C27] hover:bg-[#2A3C35] border border-[#589674]/45 text-[#DFEFE4] font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <PackagePlus className="w-3.5 h-3.5 text-[#8CE0AC] shrink-0" />
            <span>+60 Resources</span>
          </button>
          <button
            type="button"
            onClick={() => onDevAction({ action: 'advance_day' })}
            className="px-2 py-1.5 rounded-sm bg-[#222B3B] hover:bg-[#2E3A50] border border-[#6E8AB5]/45 text-[#DCE6F5] font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <CalendarPlus className="w-3.5 h-3.5 text-[#A8D8EA] shrink-0" />
            <span>Advance Day</span>
          </button>
          <button
            type="button"
            onClick={() => onDevAction({ action: 'unlock_next_tech' })}
            className="px-2 py-1.5 rounded-sm bg-[#262E3E] hover:bg-[#333E54] border border-[#E5AF47]/45 text-[#FDE68A] font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#FDE047] shrink-0" />
            <span>Unlock Next Tech</span>
          </button>
          <button
            type="button"
            onClick={() => onDevAction({ action: 'unlock_all_tech' })}
            className="px-2 py-1.5 rounded-sm bg-[#332A1B] hover:bg-[#463924] border border-[#E5AF47]/55 text-[#FDE68A] font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Flame className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
            <span>Unlock All Tech</span>
          </button>
          <button
            type="button"
            onClick={() => onDevAction({ action: 'finish_builds' })}
            className="px-2 py-1.5 rounded-sm bg-[#232A38] hover:bg-[#313B4F] border border-[#8E6B35]/45 text-[#F3EAD6] font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Hammer className="w-3.5 h-3.5 text-[#E5AF47] shrink-0" />
            <span>Finish Builds</span>
          </button>
          <button
            type="button"
            onClick={() => onDevAction({ action: 'heal_all' })}
            className="px-2 py-1.5 rounded-sm bg-[#1F2C27] hover:bg-[#2A3C35] border border-[#589674]/45 text-[#8CE0AC] font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <HeartPulse className="w-3.5 h-3.5 shrink-0" />
            <span>Heal All Units</span>
          </button>
        </div>

        {/* Spawning & Siege */}
        <div className="pt-2 border-t border-[#8E6B35]/35 space-y-1.5">
          <span className="text-[10.5px] font-semibold text-[#E5AF47] block">World &amp; Entity Spawners</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onDevAction({ action: 'spawn_villager', islandId: targetIsland })}
              className="px-2 py-1.5 rounded-sm bg-[#1F2C27] hover:bg-[#2A3C35] border border-[#589674]/45 text-[#DFEFE4] font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#8CE0AC] shrink-0" />
              <span>Spawn Villager</span>
            </button>
            <button
              type="button"
              onClick={() => onDevAction({ action: 'spawn_raider', islandId: targetIsland })}
              className="px-2 py-1.5 rounded-sm bg-[#3A2026] hover:bg-[#4E2A32] border border-[#E38589]/50 text-[#FDE2E3] font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Skull className="w-3.5 h-3.5 text-[#E38589] shrink-0" />
              <span>Spawn Raider</span>
            </button>
            <button
              type="button"
              onClick={() => onDevAction({ action: 'spawn_stone', islandId: targetIsland })}
              className="px-2 py-1.5 rounded-sm bg-[#232A38] hover:bg-[#313B4F] border border-[#8E6B35]/45 text-[#DCE6F5] font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Mountain className="w-3.5 h-3.5 text-[#9EB1C2] shrink-0" />
              <span>Spawn Boulder</span>
            </button>
            <button
              type="button"
              onClick={() => onDevAction({ action: 'spawn_tree', islandId: targetIsland })}
              className="px-2 py-1.5 rounded-sm bg-[#1F2C27] hover:bg-[#2A3C35] border border-[#589674]/45 text-[#DFEFE4] font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Trees className="w-3.5 h-3.5 text-[#74C294] shrink-0" />
              <span>Spawn Tree</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={animalKind}
              onChange={(e) => setAnimalKind(e.target.value as 'rabbit' | 'deer' | 'boar')}
              className="flex-1 px-2 py-1 rounded-sm bg-[#131823] border border-[#8E6B35]/45 text-[#F3EAD6] text-[11px]"
            >
              <option value="rabbit">Wild Rabbit</option>
              <option value="deer">Wild Deer</option>
              <option value="boar">Ridge Boar</option>
            </select>
            <button
              type="button"
              onClick={() =>
                onDevAction({ action: 'spawn_animal', islandId: targetIsland, entityKind: animalKind })
              }
              className="px-2.5 py-1 rounded-sm bg-[#262E3E] hover:bg-[#333E54] border border-[#E5AF47]/45 text-[#FDE68A] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <PawPrint className="w-3.5 h-3.5" />
              <span>Spawn Herd</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onDevAction({ action: 'trigger_siege' })}
            className="w-full py-1.5 px-2 rounded-sm bg-[#3F2026] hover:bg-[#552A32] border border-[#E38589]/55 text-[#FDE2E3] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Swords className="w-3.5 h-3.5 text-[#E38589]" />
            <span>Trigger Multi-Front Siege Wave</span>
          </button>
        </div>

        {/* Unit Traits & Skills Inspector Actions */}
        <div className="pt-2 border-t border-[#8E6B35]/35 space-y-1.5">
          <span className="text-[10.5px] font-semibold text-[#E5AF47] block">
            Unit Editor {selectedVillager ? `(${selectedVillager.name})` : '(Select a villager)'}
          </span>

          <div className="flex items-center gap-1.5">
            <select
              value={selectedTraitId}
              onChange={(e) => setSelectedTraitId(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1 rounded-sm bg-[#131823] border border-[#8E6B35]/45 text-[#F3EAD6] text-[11px]"
            >
              {TRAIT_LIST.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.polarity === 'positive' ? '+ ' : '− '}
                  {tr.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedVillager}
              onClick={() =>
                selectedVillager &&
                onDevAction({
                  action: 'reroll_traits',
                  villagerId: selectedVillager.id,
                  traitId: selectedTraitId,
                })
              }
              className="px-2 py-1 rounded-sm bg-[#262E3E] hover:bg-[#333E54] disabled:opacity-45 border border-[#8E6B35]/45 text-[#F3EAD6] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              title="Apply selected trait to villager"
            >
              <Dices className="w-3.5 h-3.5 text-[#E5AF47]" />
              <span>Set Trait</span>
            </button>
          </div>

          <button
            type="button"
            disabled={!selectedVillager}
            onClick={() =>
              selectedVillager &&
              onDevAction({
                action: 'reroll_traits',
                villagerId: selectedVillager.id,
              })
            }
            className="w-full py-1 px-2 rounded-sm bg-[#1D2330] hover:bg-[#283142] disabled:opacity-45 border border-[#8E6B35]/35 text-[#D8CEBA] font-medium cursor-pointer"
          >
            Reroll Balanced Traits &amp; Stats
          </button>

          <div className="flex items-center gap-1.5">
            <select
              value={selectedSkillId}
              onChange={(e) => setSelectedSkillId(e.target.value as SkillId)}
              className="flex-1 min-w-0 px-2 py-1 rounded-sm bg-[#131823] border border-[#8E6B35]/45 text-[#F3EAD6] text-[11px]"
            >
              {ALL_SKILL_IDS.map((sk) => (
                <option key={sk} value={sk}>
                  {SKILL_META[sk].label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedVillager}
              onClick={() =>
                selectedVillager &&
                onDevAction({
                  action: 'grant_skill_xp',
                  villagerId: selectedVillager.id,
                  skillId: selectedSkillId,
                  amount: 120,
                })
              }
              className="px-2 py-1 rounded-sm bg-[#1F2C27] hover:bg-[#2A3C35] disabled:opacity-45 border border-[#589674]/45 text-[#8CE0AC] font-semibold cursor-pointer whitespace-nowrap"
            >
              +120 Skill XP
            </button>
          </div>
        </div>

        {/* Debug Visuals */}
        <div className="pt-2 border-t border-[#8E6B35]/35">
          <button
            type="button"
            onClick={onToggleDebugCollisions}
            className={`w-full py-1.5 px-2 rounded-sm border text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
              debugShowCollisions
                ? 'bg-[#D69635] text-[#14161D] border-[#FDE68A]'
                : 'bg-[#1A202D] hover:bg-[#252D3D] text-[#D8CEBA] border-[#8E6B35]/40'
            }`}
          >
            {debugShowCollisions ? <Eye className="w-3.5 h-3.5" /> : <Bug className="w-3.5 h-3.5 text-[#E5AF47]" />}
            <span>{debugShowCollisions ? 'Hide 3D Collision Rings' : 'Show 3D Collision Rings'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
