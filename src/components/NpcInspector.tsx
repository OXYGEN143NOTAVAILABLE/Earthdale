import { Brain, Check, Coffee, Compass, Crown, Heart, MapPin, MessageCircle, Shield, Sparkles, Utensils, Users, X, Zap } from 'lucide-react';
import { CHIEF_FOCUSES, COGNITIVE_STAGE_META, COMFORT_LABELS, CONCEPT_LABELS, ISLAND_DEFS, TASKS, TRAITS, WISH_LABELS } from '../game/catalog';
import { CULTURES } from '../game/techAndCultures';
import type { ChiefFocus, GameMode, GodCommentKind, TaskType, VillagerEntity } from '../game/types';
import { ComfortSvg } from './StorybookIcons';
import { VillagerPortrait } from './VillagerPortrait';

interface NpcInspectorProps {
  villager: VillagerEntity;
  allVillagers: VillagerEntity[];
  gameMode: GameMode;
  chiefFocus: ChiefFocus;
  taskAvailability: Record<TaskType, boolean>;
  statusFeedback: string | null;
  isMovingCommand?: boolean;
  onToggleMoveCommand?: () => void;
  onUpliftVillager?: () => void;
  onClose: () => void;
  onChat: () => void;
  onComment: (kind: GodCommentKind) => void;
  onHangOut: (targetVillagerId: string) => void;
  onSuggestTask: (task: TaskType | null) => void;
  onSuggestChief: () => void;
  onChangeChiefFocus: (focus: ChiefFocus) => void;
}

const GEAR_LABELS = ['Primitive Wraps', 'Dyed Tunic', 'Wool Winter Cloak', 'Forged Armor'];
const WEAPON_LABELS: Record<VillagerEntity['weaponType'], string> = {
  none: 'Bare-Handed',
  flint_spear: 'Flint Spear',
  bow: 'Yew Bow',
  bronze_blade: 'Bronze Blade',
  iron_blade: 'Iron Blade',
};

function MeterRow({ label, value, barColor }: { label: string; value: number; barColor: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-12 text-[#B4A995] shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[#262E3E] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      <span className="w-8 text-right text-[#F3EAD6] tabular-nums">{pct}%</span>
    </div>
  );
}

export function NpcInspector({
  villager,
  allVillagers,
  gameMode,
  chiefFocus,
  taskAvailability,
  statusFeedback,
  isMovingCommand,
  onToggleMoveCommand,
  onUpliftVillager,
  onClose,
  onChat,
  onComment,
  onHangOut,
  onSuggestTask,
  onSuggestChief,
  onChangeChiefFocus,
}: NpcInspectorProps) {
  const isSovereign = gameMode === 'sovereign_sandbox';
  const partner = villager.partnerId ? allVillagers.find((v) => v.id === villager.partnerId) : null;
  const children = villager.childrenIds
    .map((cid) => allVillagers.find((v) => v.id === cid)?.name.split(' ')[0])
    .filter(Boolean);
  const workReady =
    (villager.lifeStage === 'adult' || villager.lifeStage === 'elder') &&
    villager.cognition.awareness >= 45 &&
    villager.cognition.observedConcepts.length >= 3 &&
    villager.cognition.socialCount >= 2;
  const canAssignRole = isSovereign || (workReady && !villager.isNativeClan);
  const neighbors = allVillagers.filter((v) => v.id !== villager.id && v.lifeStage !== 'infant');
  const culture = CULTURES[villager.cultureId] ?? CULTURES.hearthfolk;
  const cogMeta = COGNITIVE_STAGE_META[villager.cognition.stage];

  return (
    <aside
      aria-label="Villager Inspector"
      className="pointer-events-auto kingdom-frame fixed top-14 right-3.5 z-20 w-[308px] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-10rem)] overflow-y-auto rounded p-3 text-[#F3EAD6] hud-panel"
    >
      <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#8E6B35]/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <VillagerPortrait
            cloakColor={villager.cloakColor}
            hairColor={villager.hairColor}
            skinTone={villager.skinTone}
            hairStyle={villager.hairStyle}
            lifeStage={villager.lifeStage}
            isChief={villager.isChief}
            mood={villager.mood}
            activeTask={villager.activeTask}
            size={42}
          />
          <div className="min-w-0">
            <h2
              className="text-sm font-semibold leading-tight text-[#F7EFDD] truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {villager.name}
            </h2>
            <p className="text-[11px] text-[#B4A995] capitalize tabular-nums">
              {villager.lifeStage} · D{villager.ageDays} · {ISLAND_DEFS[villager.islandId].name}
              {villager.isChief ? ' · Chief' : ''}
            </p>
            <p className="text-[10.5px] font-medium flex items-center gap-1" style={{ color: culture.bannerColor }}>
              <Shield className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {villager.isNativeClan ? `Native Clan (${culture.name})` : culture.name} · {GEAR_LABELS[villager.gearTier]}
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-sm hover:bg-[#252D3D] text-[#B4A995] hover:text-[#F3EAD6] cursor-pointer shrink-0"
          aria-label="Close Inspector"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <blockquote className="mt-2 rounded-sm bg-[#1C2332] border border-[#8E6B35]/35 px-2.5 py-1.5 text-[11px] italic leading-snug text-[#ECE0C9]">
        “{villager.currentDialogue}”
      </blockquote>

      {isSovereign && onToggleMoveCommand && onUpliftVillager && (
        <div className="mt-2 grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={onToggleMoveCommand}
            className={`py-1.5 px-2 rounded-sm text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer border ${
              isMovingCommand
                ? 'bg-[#D69635] text-[#14161D] border-[#FDE68A]'
                : 'bg-[#232D40] hover:bg-[#2F3C54] text-[#FDE68A] border-[#E5AF47]/45'
            }`}
          >
            <MapPin className="w-3 h-3 shrink-0" />
            <span>{isMovingCommand ? 'Click Island...' : 'Move Here'}</span>
          </button>
          <button
            type="button"
            onClick={onUpliftVillager}
            className="py-1.5 px-2 rounded-sm bg-[#21332A] hover:bg-[#2C4539] text-[#A8DEC0] border border-[#589674]/45 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
          >
            <Zap className="w-3 h-3 shrink-0" />
            <span>Uplift & Heal</span>
          </button>
        </div>
      )}

      <div className="mt-2 space-y-0.5 text-[11px] text-[#B4A995]">
        <p>
          <span className="font-semibold text-[#F3EAD6]">Now:</span> {villager.autonomyReason}
        </p>
        <p>
          <span className="font-semibold text-[#F3EAD6]">Gear:</span> {WEAPON_LABELS[villager.weaponType]} ·{' '}
          <span>Curiosity {Math.round(villager.curiosity * 100)}%</span> ·{' '}
          <span>Bravery {Math.round(villager.bravery * 100)}%</span>
        </p>
        <p className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-[#E5AF47] shrink-0" />
          <span className="font-semibold text-[#F3EAD6]">Wish:</span>
          <span className="truncate">{WISH_LABELS[villager.activeWish]}</span>
          {villager.wishFulfilledToday && <Check className="w-3 h-3 text-[#65B386] shrink-0" />}
        </p>
        <p className="flex items-center gap-1 flex-wrap">
          <span className="font-semibold text-[#F3EAD6]">Favorite:</span>
          <ComfortSvg kind={villager.favoriteComfort} className="w-3.5 h-3.5 inline-block shrink-0" />
          <span>{COMFORT_LABELS[villager.favoriteComfort]}</span>
        </p>
      </div>

      {/* Cognition & World Awareness */}
      <div className="mt-2 pt-2 border-t border-[#8E6B35]/35 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1 font-semibold text-[#F3EAD6]">
            <Brain className="w-3.5 h-3.5" style={{ color: cogMeta.color }} />
            <span>Cognition:</span>
            <span style={{ color: cogMeta.color }}>{cogMeta.label}</span>
          </span>
          <span className="text-[#D8CEBA] tabular-nums">{Math.round(villager.cognition.awareness)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-sm bg-[#262E3E] overflow-hidden">
          <div
            className="h-full"
            style={{ width: `${Math.min(100, Math.round(villager.cognition.awareness))}%`, backgroundColor: cogMeta.color }}
          />
        </div>
        <div className="flex items-center justify-between text-[10.5px] text-[#DCE6F5] tabular-nums">
          <span>
            Wonders {Math.min(3, villager.cognition.observedConcepts.length)}/3 · Chats {Math.min(2, villager.cognition.socialCount)}/2
          </span>
          <span className={workReady ? 'text-[#8CE0AC] font-semibold' : 'text-[#E5AF47]'}>
            {workReady ? 'Work Ready' : 'Learning'}
          </span>
        </div>
        <p className="text-[10.5px] leading-snug text-[#B4A995]">{cogMeta.summary}</p>
        {villager.cognition.observedConcepts.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {villager.cognition.observedConcepts.map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 rounded-sm bg-[#1B2331] border border-[#8E6B35]/35 text-[9.5px] text-[#DCE6F5]"
              >
                {CONCEPT_LABELS[c] ?? c.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}
        <p className="text-[10px] italic text-[#9EB1C2]">“{villager.lastMemory}”</p>
      </div>

      {/* Traits */}
      <div className="mt-2 pt-2 border-t border-[#8E6B35]/35 space-y-1">
        {villager.traits.map((tid) => {
          const trait = TRAITS[tid];
          if (!trait) return null;
          const isPos = trait.polarity === 'positive';
          return (
            <div key={tid} className="text-[11px] leading-tight">
              <span className={`font-semibold ${isPos ? 'text-[#74C294]' : 'text-[#E38589]'}`}>
                {isPos ? '+ ' : '− '}
                {trait.name}
              </span>
              <span className="text-[#B4A995]"> — {trait.summary}</span>
            </div>
          );
        })}
      </div>

      {(partner || children.length > 0) && (
        <div className="mt-2 pt-2 border-t border-[#8E6B35]/35 text-[11px] text-[#C8BCA6]">
          {partner && <span>Partner: {partner.name.split(' ')[0]}</span>}
          {partner && children.length > 0 && <span aria-hidden="true"> · </span>}
          {children.length > 0 && <span>Kids: {children.join(', ')}</span>}
        </div>
      )}

      {/* Survival & Needs */}
      <div className="mt-2 pt-2 border-t border-[#8E6B35]/35 space-y-1">
        <MeterRow label="Health" value={(villager.hp / Math.max(1, villager.maxHp)) * 100} barColor="#E36D70" />
        <MeterRow label="Warmth" value={villager.warmth} barColor="#F59E0B" />
        <MeterRow label="Food" value={villager.hunger} barColor="#C98A54" />
        <MeterRow label="Energy" value={villager.energy} barColor="#65B386" />
        <MeterRow label="Mood" value={villager.mood} barColor="#5EA7C4" />
      </div>

      {/* Divine Comments */}
      <div className="mt-2.5 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={onChat}
          className="py-1.5 px-1.5 rounded-sm bg-[#232A38] hover:bg-[#2F384B] border border-[#8E6B35]/40 text-[#F3EAD6] text-[11px] font-semibold cursor-pointer whitespace-nowrap flex items-center justify-center gap-1"
        >
          <MessageCircle className="w-3 h-3 text-[#E5AF47]" />
          <span>Talk (T)</span>
        </button>
        <button
          type="button"
          onClick={() => onComment('praise')}
          className="py-1.5 px-1.5 rounded-sm bg-[#2E2229] hover:bg-[#3D2C36] border border-[#9E5A60]/40 text-[#F7DFE0] text-[11px] font-semibold cursor-pointer whitespace-nowrap flex items-center justify-center gap-1"
        >
          <Heart className="w-3 h-3 text-[#E4787D]" />
          <span>Praise (P)</span>
        </button>
        <button
          type="button"
          onClick={() => onComment('remind_eat')}
          className="py-1.5 px-1.5 rounded-sm bg-[#1F2C27] hover:bg-[#2A3C35] border border-[#589674]/40 text-[#DFEFE4] text-[11px] font-semibold cursor-pointer whitespace-nowrap flex items-center justify-center gap-1"
        >
          <Utensils className="w-3 h-3 text-[#65B386]" />
          <span>Meal (F)</span>
        </button>
        <button
          type="button"
          onClick={() => onComment('encourage_explore')}
          className="py-1.5 px-1.5 rounded-sm bg-[#1E2534] hover:bg-[#2A3347] border border-[#6E8AB5]/40 text-[#DCE6F5] text-[11px] font-semibold cursor-pointer whitespace-nowrap flex items-center justify-center gap-1"
        >
          <Compass className="w-3 h-3 text-[#8EB4E6]" />
          <span>Explore</span>
        </button>
        <button
          type="button"
          onClick={() => onComment('remind_rest')}
          className="col-span-2 py-1 px-1.5 rounded-sm bg-[#1A202D] hover:bg-[#252D3D] border border-[#8E6B35]/30 text-[#D8CEBA] text-[11px] font-medium cursor-pointer flex items-center justify-center gap-1"
        >
          <Coffee className="w-3 h-3 text-[#E5AF47]" />
          <span>Suggest Warm Rest by Hearth</span>
        </button>
      </div>

      {/* Neighbors */}
      {villager.lifeStage !== 'infant' && neighbors.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-[#8E6B35]/35">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-[#F3EAD6] mb-1">
            <Users className="w-3 h-3 text-[#B4A995]" />
            <span>Visit Neighbor</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {neighbors.slice(0, 6).map((n) => {
              const bond = Math.round(villager.relationships[n.id] ?? 20);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onHangOut(n.id)}
                  className="px-2 py-0.5 rounded-sm bg-[#1D2330] hover:bg-[#283142] border border-[#8E6B35]/35 text-[10px] text-[#E5DAC4] cursor-pointer whitespace-nowrap tabular-nums"
                >
                  {n.name.split(' ')[0]} · {bond}%
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 12 Role Commands / Suggestions */}
      {canAssignRole && (
        <div className="mt-2.5 pt-2 border-t border-[#8E6B35]/35">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="font-semibold text-[#F3EAD6]">{isSovereign ? 'Command Role' : 'Suggest Role'}</span>
            <button
              type="button"
              onClick={() => onSuggestTask(null)}
              className={`cursor-pointer hover:underline ${
                villager.suggestedTask === null ? 'font-semibold text-[#E5AF47]' : 'text-[#B4A995]'
              }`}
            >
              Free Will (A)
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {TASKS.map((task) => {
              const available = isSovereign || taskAvailability[task.id];
              const isSuggested = villager.suggestedTask === task.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  disabled={!available}
                  onClick={() => onSuggestTask(task.id)}
                  className={`px-1.5 py-1 rounded-sm text-[10.5px] font-medium whitespace-nowrap truncate border text-left ${
                    !available
                      ? 'bg-[#191F2A]/60 text-[#686055] border-[#333A48] cursor-not-allowed'
                      : isSuggested
                        ? 'bg-[#D69635] text-[#14161D] border-[#E5AF47] font-semibold cursor-pointer'
                        : 'bg-[#1D2330] hover:bg-[#283142] text-[#E5DAC4] border-[#8E6B35]/35 cursor-pointer'
                  }`}
                >
                  {task.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!villager.isNativeClan && (canAssignRole || workReady) && (
        <div className="mt-2.5 pt-2 border-t border-[#8E6B35]/35">
          {!villager.isChief ? (
            <button
              type="button"
              onClick={onSuggestChief}
              className="w-full py-1.5 px-2 rounded-sm bg-[#262E3D] hover:bg-[#313B4F] text-[#F3EAD6] border border-[#B68B44]/55 text-[11px] font-semibold cursor-pointer whitespace-nowrap flex items-center justify-center gap-1"
            >
              <Crown className="w-3 h-3 text-[#E5AF47]" />
              <span>{isSovereign ? 'Crown as Chief' : 'Suggest as Chief'}</span>
            </button>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-[#E5AF47]">
                <Crown className="w-3 h-3" />
                <span>Chief Focus</span>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {CHIEF_FOCUSES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onChangeChiefFocus(f.id)}
                    className={`px-2 py-1 rounded-sm text-left text-[11px] cursor-pointer border ${
                      chiefFocus === f.id
                        ? 'bg-[#D69635]/20 border-[#E5AF47] text-[#FDE68A] font-semibold'
                        : 'bg-[#1D2330] hover:bg-[#283142] border-[#8E6B35]/30 text-[#D1C6B2]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {statusFeedback && <p className="mt-2 text-[11px] text-[#E5AF47] font-medium">{statusFeedback}</p>}
    </aside>
  );
}
