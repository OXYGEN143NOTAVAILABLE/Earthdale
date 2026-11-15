import { useState } from 'react';
import {
  Anchor,
  BookOpen,
  Brain,
  Check,
  Coffee,
  Compass,
  Crown,
  Droplets,
  Heart,
  MapPin,
  MessageCircle,
  Shield,
  Sparkles,
  Swords,
  Utensils,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  CHIEF_FOCUSES,
  COGNITIVE_STAGE_META,
  COMFORT_LABELS,
  CONCEPT_LABELS,
  ISLAND_DEFS,
  SKILL_META,
  TASKS,
  TRAITS,
  WISH_LABELS,
  getSocialTier,
} from '../game/catalog';
import { getStandingMeta } from '../game/governance';
import { KNOWLEDGE_DOMAINS, getKnowledgeLevel, getKnowledgeRankLabel } from '../game/knowledge';
import { PERSONALITY_AXES, getNpcPersonality } from '../game/personality';
import { CULTURES } from '../game/techAndCultures';
import type { ChiefFocus, GameMode, GodCommentKind, SkillId, TaskType, VillagerEntity } from '../game/types';
import { ComfortSvg } from './StorybookIcons';
import { VillagerPortrait } from './VillagerPortrait';

interface NpcInspectorProps {
  villager: VillagerEntity;
  allVillagers: VillagerEntity[];
  gameMode: GameMode;
  canControl: boolean;
  chiefFocus: ChiefFocus;
  taskAvailability: Record<TaskType, boolean>;
  statusFeedback: string | null;
  isMovingCommand?: boolean;
  onToggleMoveCommand?: () => void;
  onUpliftVillager?: () => void;
  onToggleDraft?: () => void;
  onHoldPosition?: () => void;
  onClearRtsOrder?: () => void;
  onClose: () => void;
  onChat: () => void;
  onComment: (kind: GodCommentKind) => void;
  onHangOut: (targetVillagerId: string) => void;
  onSuggestTask: (task: TaskType | null) => void;
  onSuggestChief: () => void;
  onChangeChiefFocus: (focus: ChiefFocus) => void;
}

type InspectorTab = 'overview' | 'brain' | 'knowledge';

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
      <span className="w-[68px] text-[#B4A995] shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-sm bg-[#262E3E] overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      <span className="w-8 text-right text-[#F3EAD6] tabular-nums">{pct}%</span>
    </div>
  );
}

export function NpcInspector({
  villager,
  allVillagers,
  gameMode,
  canControl,
  chiefFocus,
  taskAvailability,
  statusFeedback,
  isMovingCommand,
  onToggleMoveCommand,
  onUpliftVillager,
  onToggleDraft,
  onHoldPosition,
  onClearRtsOrder,
  onClose,
  onChat,
  onComment,
  onHangOut,
  onSuggestTask,
  onSuggestChief,
  onChangeChiefFocus,
}: NpcInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview');

  const isSovereign = gameMode === 'sovereign_sandbox';
  const isRtsMode = isSovereign || gameMode === 'shared_siege';
  const partner = villager.partnerId ? allVillagers.find((v) => v.id === villager.partnerId) : null;
  const children = villager.childrenIds
    .map((cid) => allVillagers.find((v) => v.id === cid)?.name.split(' ')[0])
    .filter(Boolean);
  const workReady =
    isRtsMode ||
    ((villager.lifeStage === 'adult' || villager.lifeStage === 'elder') &&
      villager.cognition.awareness >= 30 &&
      villager.cognition.observedConcepts.length >= 2 &&
      villager.cognition.socialCount >= 1);
  const canAssignRole = canControl && (isSovereign || (workReady && !villager.isNativeClan));
  const neighbors = allVillagers.filter((v) => v.id !== villager.id && v.lifeStage !== 'infant');
  const homeIslandId = villager.homeIslandId ?? villager.islandId;
  const isVisitingForeign = villager.islandId !== homeIslandId;
  const visitStatusLabel =
    villager.visitStatus === 'at_perimeter'
      ? 'Waiting at Perimeter'
      : villager.visitStatus === 'parleying'
        ? 'Parleying at Gate'
        : villager.visitStatus === 'denied'
          ? 'Turned Away'
          : villager.visitStatus === 'admitted'
            ? 'Admitted Guest'
            : null;
  const culture = CULTURES[villager.cultureId] ?? CULTURES.hearthfolk;
  const cogMeta = COGNITIVE_STAGE_META[villager.cognition.stage];
  const stats = villager.stats;
  const bleedStack = stats?.bleedStack ?? 0;
  const skillEntries = (Object.entries(villager.skills ?? {}) as [SkillId, number][]).filter(
    ([, lv]) => typeof lv === 'number' && lv > 0,
  );
  const personality = getNpcPersonality(villager);
  const standing = getStandingMeta(villager.reputation ?? 15, villager.banished);
  const memories = villager.memories ?? [];
  const trace = villager.decisionTrace;

  return (
    <aside
      aria-label="Villager Inspector"
      className="pointer-events-auto kingdom-frame fixed top-14 right-3.5 z-20 w-[330px] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-10rem)] overflow-y-auto rounded p-3 text-[#F3EAD6] hud-panel"
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
                {villager.isNativeClan ? `AI Village (${culture.name})` : culture.name} · {personality.archetype}
              </span>
            </p>
            <p className="text-[10px] text-[#9EB1C2] truncate">
              {GEAR_LABELS[villager.gearTier]}
              {isVisitingForeign && visitStatusLabel ? ` · ${visitStatusLabel}` : ''}
              {!canControl ? ' · Autonomous / Rival' : ''}
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

      {/* Inspector Section Tabs */}
      <div role="tablist" aria-label="Villager Inspector Tabs" className="mt-2 grid grid-cols-3 gap-1">
        {[
          { id: 'overview' as const, label: 'Overview', icon: Sparkles },
          { id: 'brain' as const, label: 'Brain & Logs', icon: Brain },
          { id: 'knowledge' as const, label: 'Knowledge', icon: BookOpen },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`py-1 px-1.5 rounded-sm text-[10.5px] font-semibold border flex items-center justify-center gap-1 cursor-pointer ${
                active
                  ? 'bg-[#D69635] text-[#14161D] border-[#E5AF47]'
                  : 'bg-[#1A2130] hover:bg-[#252E42] text-[#C8BCA6] border-[#8E6B35]/35'
              }`}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {bleedStack > 0 && (
        <div className="mt-2 px-2.5 py-1 rounded-sm bg-[#461D22] border border-[#E38589] text-[11px] font-semibold text-[#FDE2E3] flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <Droplets className="w-3.5 h-3.5 text-[#F87171]" />
            <span>Bleeding ×{bleedStack}</span>
          </span>
          <span className="text-[10px] text-[#FCA5A5] tabular-nums">
            {Math.ceil(stats.bleedTimer)}s · Needs fire/herbs
          </span>
        </div>
      )}

      {activeTab === 'overview' && (
        <>
          <blockquote className="mt-2 rounded-sm bg-[#1C2332] border border-[#8E6B35]/35 px-2.5 py-1.5 text-[11px] italic leading-snug text-[#ECE0C9]">
            “{villager.currentDialogue}”
          </blockquote>

          {isRtsMode && canControl && (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {onToggleMoveCommand && (
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
              )}
              {onHoldPosition && (
                <button
                  type="button"
                  onClick={onHoldPosition}
                  className={`py-1.5 px-2 rounded-sm text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer border ${
                    villager.rtsOrder?.kind === 'hold'
                      ? 'bg-[#2F3C54] text-[#FDE68A] border-[#E5AF47]'
                      : 'bg-[#1D2432] hover:bg-[#283246] text-[#DCE6F5] border-[#6E8AB5]/45'
                  }`}
                >
                  <Anchor className="w-3 h-3 shrink-0" />
                  <span>Hold Pos</span>
                </button>
              )}
              {onToggleDraft && (
                <button
                  type="button"
                  onClick={onToggleDraft}
                  className={`py-1.5 px-2 rounded-sm text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer border ${
                    villager.drafted
                      ? 'bg-[#462328] hover:bg-[#5B2E34] text-[#FDE2E3] border-[#E38589]/65'
                      : 'bg-[#252B39] hover:bg-[#31394C] text-[#F3EAD6] border-[#8E6B35]/45'
                  }`}
                >
                  <Swords className="w-3 h-3 shrink-0 text-[#E5AF47]" />
                  <span>{villager.drafted ? 'Release Draft' : 'Draft Combat'}</span>
                </button>
              )}
              {isSovereign && onUpliftVillager ? (
                <button
                  type="button"
                  onClick={onUpliftVillager}
                  className="py-1.5 px-2 rounded-sm bg-[#21332A] hover:bg-[#2C4539] text-[#A8DEC0] border border-[#589674]/45 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Zap className="w-3 h-3 shrink-0" />
                  <span>Uplift &amp; Heal</span>
                </button>
              ) : (
                onClearRtsOrder && (
                  <button
                    type="button"
                    onClick={onClearRtsOrder}
                    disabled={!villager.rtsOrder}
                    className="py-1.5 px-2 rounded-sm bg-[#1B212E] hover:bg-[#262E40] disabled:opacity-45 text-[#C8BCA6] border border-[#8E6B35]/35 text-[11px] font-semibold cursor-pointer"
                  >
                    Clear Order
                  </button>
                )
              )}
              {isSovereign && villager.rtsOrder && onClearRtsOrder && (
                <button
                  type="button"
                  onClick={onClearRtsOrder}
                  className="col-span-2 py-1 px-2 rounded-sm bg-[#1B212E] hover:bg-[#262E40] text-[#D8CEBA] border border-[#8E6B35]/35 text-[10.5px] font-medium cursor-pointer"
                >
                  Clear Active RTS Order ({villager.rtsOrder.kind})
                </button>
              )}
            </div>
          )}

          <div className="mt-2 space-y-0.5 text-[11px] text-[#B4A995]">
            <p>
              <span className="font-semibold text-[#F3EAD6]">Now:</span> {villager.autonomyReason}
            </p>
            <p>
              <span className="font-semibold text-[#F3EAD6]">Gear:</span> {WEAPON_LABELS[villager.weaponType]} ·{' '}
              <span>Cognition: <strong style={{ color: cogMeta.color }}>{cogMeta.label}</strong></span>
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
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="flex items-center gap-1.5">
                <span className="font-semibold text-[#F3EAD6]">Standing:</span>
                <span className={`px-1.5 py-0.5 rounded-sm border text-[10px] font-semibold tabular-nums ${standing.bgClass}`}>
                  {standing.label} ({(villager.reputation ?? 15) >= 0 ? `+${Math.round(villager.reputation ?? 15)}` : Math.round(villager.reputation ?? 15)})
                </span>
              </span>
              {((villager.contributionCount ?? 0) > 0 || (villager.offenseCount ?? 0) > 0) && (
                <span className="text-[10px] text-[#9EB1C2] tabular-nums">
                  +{villager.contributionCount ?? 0} deeds · {villager.offenseCount ?? 0} offenses
                </span>
              )}
            </div>
          </div>

          {stats && (
            <div className="mt-2 pt-2 border-t border-[#8E6B35]/35">
              <div className="grid grid-cols-5 gap-1 text-center tabular-nums">
                {[
                  { label: 'STR', value: stats.strength, color: 'text-[#F3A88B]' },
                  { label: 'AGI', value: stats.agility, color: 'text-[#8CE0AC]' },
                  { label: 'END', value: stats.endurance, color: 'text-[#FDE68A]' },
                  { label: 'INT', value: stats.intellect, color: 'text-[#A8D8EA]' },
                  { label: 'BLD RES', value: `${Math.round(stats.bleedResist * 100)}%`, color: 'text-[#DCE6F5]' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="px-1 py-1 rounded-sm bg-[#1A202D] border border-[#8E6B35]/30"
                  >
                    <div className="text-[9px] text-[#9C907D]">{item.label}</div>
                    <div className={`text-[11px] font-semibold ${item.color}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Neighbors & Social Tiers */}
          {villager.lifeStage !== 'infant' && neighbors.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-[#8E6B35]/35">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-[#F3EAD6] mb-1">
                <Users className="w-3 h-3 text-[#B4A995]" />
                <span>Social Ties{canControl ? ' (Click to Visit)' : ''}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {neighbors.slice(0, 6).map((n) => {
                  const bond = Math.round(villager.relationships[n.id] ?? 18);
                  const tier = getSocialTier(bond);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      disabled={!canControl}
                      onClick={() => canControl && onHangOut(n.id)}
                      className={`px-2 py-0.5 rounded-sm bg-[#1D2330] border border-[#8E6B35]/35 text-[10px] text-[#E5DAC4] whitespace-nowrap tabular-nums ${
                        canControl ? 'hover:bg-[#283142] cursor-pointer' : 'opacity-80 cursor-default'
                      }`}
                      title={`${n.name} (${ISLAND_DEFS[n.homeIslandId ?? n.islandId].name}) · ${tier.label} (${bond}%)`}
                    >
                      {n.name.split(' ')[0]} ·{' '}
                      <span style={{ color: tier.color }}>{tier.label}</span> ({bond}%)
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Role Commands / Suggestions */}
          {canAssignRole && (
            <div className="mt-2.5 pt-2 border-t border-[#8E6B35]/35">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="font-semibold text-[#F3EAD6]">{isRtsMode ? 'Command Role' : 'Suggest Role'}</span>
                <button
                  type="button"
                  onClick={() => onSuggestTask(null)}
                  className={`cursor-pointer hover:underline ${
                    villager.suggestedTask === null ? 'font-semibold text-[#E5AF47]' : 'text-[#B4A995]'
                  }`}
                >
                  Free Will (X)
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

          {canControl && !villager.isNativeClan && (canAssignRole || workReady) && (
            <div className="mt-2.5 pt-2 border-t border-[#8E6B35]/35">
              {!villager.isChief ? (
                <button
                  type="button"
                  onClick={onSuggestChief}
                  className="w-full py-1.5 px-2 rounded-sm bg-[#262E3D] hover:bg-[#313B4F] text-[#F3EAD6] border border-[#B68B44]/55 text-[11px] font-semibold cursor-pointer whitespace-nowrap flex items-center justify-center gap-1"
                >
                  <Crown className="w-3 h-3 text-[#E5AF47]" />
                  <span>{isRtsMode ? 'Crown as Chief' : 'Suggest as Chief'}</span>
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
        </>
      )}

      {activeTab === 'brain' && (
        <div className="mt-2 space-y-2.5">
          {/* Explainable Decision Trace */}
          <div className="rounded-sm bg-[#1A2130] border border-[#8E6B35]/35 p-2 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#F3EAD6]">Explainable AI Decision</span>
              {trace && (
                <span className="text-[10px] text-[#9EB1C2] tabular-nums">
                  Day {trace.evaluatedAtDay}
                </span>
              )}
            </div>
            {trace ? (
              <>
                <div className="text-[11px] text-[#FDE68A] font-semibold">
                  Goal: {trace.chosenLabel}
                </div>
                <p className="text-[10.5px] text-[#D8CEBA] leading-snug">{trace.reason}</p>
                <div className="space-y-1 pt-1 border-t border-[#8E6B35]/25">
                  <div className="text-[9.5px] uppercase tracking-wide text-[#9C907D]">
                    Evaluated Candidates
                  </div>
                  {trace.candidates.map((cand) => (
                    <div
                      key={cand.action}
                      className={`px-1.5 py-1 rounded-sm border text-[10px] ${
                        cand.action === trace.chosenAction
                          ? 'bg-[#263229] border-[#65B386]/60 text-[#E7F6EC]'
                          : cand.valid
                            ? 'bg-[#151B27] border-[#8E6B35]/25 text-[#C8BCA6]'
                            : 'bg-[#23191D] border-[#9E5A60]/40 text-[#E6B3B6]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 font-medium">
                        <span className="truncate">{cand.label}</span>
                        <span className="tabular-nums shrink-0">
                          {cand.valid ? `Score ${cand.score}` : 'Blocked'}
                        </span>
                      </div>
                      <p className="text-[9.5px] opacity-85 truncate">
                        {cand.valid ? cand.reason : cand.blockedReason ?? cand.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[10.5px] text-[#9C907D] italic">
                Evaluating first decision on island arrival...
              </p>
            )}
          </div>

          {/* 10-Axis Continuous Personality */}
          <div className="rounded-sm bg-[#1A2130] border border-[#8E6B35]/35 p-2 space-y-1">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-semibold text-[#F3EAD6]">Personality Profile</span>
              <span className="text-[10px] text-[#E5AF47] font-semibold">{personality.archetype}</span>
            </div>
            {PERSONALITY_AXES.map((axis) => (
              <MeterRow
                key={axis.key}
                label={axis.label}
                value={personality[axis.key] * 100}
                barColor={axis.color}
              />
            ))}
          </div>

          {/* Bounded Memory Stream */}
          <div className="rounded-sm bg-[#1A2130] border border-[#8E6B35]/35 p-2 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#F3EAD6]">Memory Stream</span>
              <span className="text-[10px] text-[#9C907D] tabular-nums">{memories.length}/24</span>
            </div>
            {memories.length > 0 ? (
              <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
                {memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="px-2 py-1 rounded-sm bg-[#141A26] border border-[#8E6B35]/25 text-[10.5px]"
                  >
                    <div className="flex items-center justify-between text-[9.5px] text-[#9EB1C2] mb-0.5 tabular-nums">
                      <span className="capitalize">
                        D{mem.day} · {mem.kind}
                      </span>
                      <span
                        className={
                          mem.sentiment === 'positive'
                            ? 'text-[#8CE0AC]'
                            : mem.sentiment === 'negative'
                              ? 'text-[#E38589]'
                              : 'text-[#D8CEBA]'
                        }
                      >
                        Imp {mem.importance}
                      </span>
                    </div>
                    <p className="text-[#ECE0C9] leading-snug">{mem.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10.5px] text-[#9C907D] italic">No recorded memories yet.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'knowledge' && (
        <div className="mt-2 space-y-2.5">
          {/* Cognition & World Awareness */}
          <div className="rounded-sm bg-[#1A2130] border border-[#8E6B35]/35 p-2 space-y-1.5">
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
                Wonders {Math.min(2, villager.cognition.observedConcepts.length)}/2 · Chats{' '}
                {Math.min(1, villager.cognition.socialCount)}/1
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
                    className="px-1.5 py-0.5 rounded-sm bg-[#141A26] border border-[#8E6B35]/35 text-[9.5px] text-[#DCE6F5]"
                  >
                    {CONCEPT_LABELS[c] ?? c.replace('_', ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 10 Progressive Knowledge Domains */}
          <div className="rounded-sm bg-[#1A2130] border border-[#8E6B35]/35 p-2 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#F3EAD6]">10 Knowledge Domains</span>
              <span className="text-[10px] text-[#9C907D]">Learned via action &amp; peers</span>
            </div>
            <div className="space-y-1.5">
              {KNOWLEDGE_DOMAINS.map((dom) => {
                const lv = getKnowledgeLevel(villager, dom.id);
                const rank = getKnowledgeRankLabel(lv);
                return (
                  <div key={dom.id} title={dom.summary} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="text-[#E5DAC4]">{dom.label}</span>
                      <span className="text-[#9EB1C2] tabular-nums">
                        {rank} ({Math.round(lv)}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-sm bg-[#262E3E] overflow-hidden">
                      <div
                        className="h-full"
                        style={{ width: `${Math.min(100, Math.round(lv))}%`, backgroundColor: dom.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leveled Combat & Craft Skills */}
          <div className="rounded-sm bg-[#1A2130] border border-[#8E6B35]/35 p-2">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-semibold text-[#F3EAD6]">Practical Skills</span>
              <span className="text-[10px] text-[#9C907D]">Taught &amp; practiced</span>
            </div>
            {skillEntries.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {skillEntries.map(([sk, lv]) => {
                  const meta = SKILL_META[sk];
                  if (!meta) return null;
                  return (
                    <span
                      key={sk}
                      title={meta.summary}
                      className="px-1.5 py-0.5 rounded-sm bg-[#141A26] border border-[#8E6B35]/40 text-[10px] text-[#F3EAD6] tabular-nums"
                    >
                      {meta.label} <strong className="text-[#E5AF47]">Lv.{lv}</strong>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-[10.5px] text-[#9C907D] italic">
                {villager.lifeStage === 'infant'
                  ? 'Too young to train — watched over near hearth.'
                  : 'No formal skills yet — learns from daily tasks & elders.'}
              </p>
            )}
          </div>
        </div>
      )}

      {statusFeedback && <p className="mt-2 text-[11px] text-[#E5AF47] font-medium">{statusFeedback}</p>}
    </aside>
  );
}
