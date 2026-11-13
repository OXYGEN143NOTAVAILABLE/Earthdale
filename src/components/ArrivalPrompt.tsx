import { MessageCircle, Sparkles } from 'lucide-react';
import { TRAITS, TRAVELER_ATTITUDE_META } from '../game/catalog';
import type { ArrivalCandidate, GameMode } from '../game/types';
import { VillagerPortrait } from './VillagerPortrait';

interface ArrivalPromptProps {
  candidate: ArrivalCandidate;
  gameMode: GameMode;
  bedsFull: boolean;
  totalBeds: number;
  population: number;
  feedback: string | null;
  onSuggestGate: (id: string, lean: 'welcome' | 'decline' | 'neutral') => void;
  onLetVillagerDecide: (id: string) => void;
  onDirectDecide?: (id: string, accept: boolean) => void;
}

export function ArrivalPrompt({
  candidate,
  gameMode,
  bedsFull,
  totalBeds,
  population,
  feedback,
  onSuggestGate,
  onLetVillagerDecide,
  onDirectDecide,
}: ArrivalPromptProps) {
  const isBirth = candidate.kind === 'birth';
  const isSovereign = gameMode === 'sovereign_sandbox';
  const attitudeMeta = TRAVELER_ATTITUDE_META[candidate.attitude ?? 'warm'];
  const greeterFirst = candidate.greeterName ? candidate.greeterName.split(' ')[0] : 'A villager';

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto kingdom-frame fixed bottom-3 right-3.5 z-30 w-[308px] max-w-[calc(100vw-1.5rem)] rounded p-3 text-[#F3EAD6] hud-panel"
    >
      <div className="flex items-start gap-2.5">
        <VillagerPortrait
          cloakColor={candidate.cloakColor}
          hairColor={candidate.hairColor}
          skinTone={candidate.skinTone}
          hairStyle={candidate.hairStyle}
          lifeStage={candidate.lifeStage}
          mood={90}
          size={38}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 text-[10px] font-semibold text-[#E5AF47]">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>{isBirth ? 'Baby Born' : 'Castaway at Shore'}</span>
            </span>
            {!isBirth && (
              <span style={{ color: attitudeMeta.toneColor }}>{attitudeMeta.label}</span>
            )}
          </div>
          <h3
            className="text-sm font-semibold text-[#F7EFDD] leading-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {candidate.name}
          </h3>
          <p className="text-[11px] text-[#C8BCA6] mt-0.5 leading-snug">
            {isBirth ? candidate.bioDescription : `“${candidate.greetingLine}”`}
          </p>
        </div>
      </div>

      <div className="mt-2 pt-1.5 border-t border-[#8E6B35]/35 text-[11px] flex flex-wrap gap-x-2 gap-y-0.5">
        {candidate.traits.map((tid) => {
          const trait = TRAITS[tid];
          if (!trait) return null;
          const isPos = trait.polarity === 'positive';
          return (
            <span key={tid} className={`font-semibold ${isPos ? 'text-[#74C294]' : 'text-[#E38589]'}`}>
              {isPos ? '+' : '−'} {trait.name}
            </span>
          );
        })}
      </div>

      {!isBirth && (
        <div className="mt-2 px-2 py-1.5 rounded-sm bg-[#10131C]/80 border border-[#8E6B35]/30 text-[10.5px] leading-snug flex items-start gap-1.5">
          <MessageCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#E5AF47]" />
          {candidate.decisionVerdict === 'talking' ? (
            <span className="text-[#C8BCA6]">
              <span className="text-[#F3EAD6] font-medium">{greeterFirst}</span> is speaking with them along the shore…
            </span>
          ) : (
            <span
              className={
                candidate.decisionVerdict === 'recommend_welcome'
                  ? 'text-[#A8DEC0]'
                  : 'text-[#F0AAAA]'
              }
            >
              {candidate.decisionReason}
            </span>
          )}
        </div>
      )}

      {!isBirth && candidate.godSuggestion !== 'neutral' && (
        <p className="mt-1 text-[10px] text-[#E5AF47]">
          Divine whisper: {candidate.godSuggestion === 'welcome' ? 'Suggested welcoming' : 'Suggested caution'}
        </p>
      )}

      {bedsFull && !isSovereign && (
        <p className="mt-1.5 text-[11px] text-[#E38589] font-medium tabular-nums">
          Beds full ({population}/{totalBeds}). Suggest a shelter in Ledger.
        </p>
      )}
      {feedback && <p className="mt-1 text-[11px] text-[#E5AF47]">{feedback}</p>}

      {isBirth ? (
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onLetVillagerDecide(candidate.id)}
            className="flex-1 py-1.5 px-2 rounded-sm bg-[#D69635] hover:bg-[#E5A746] text-[#14161D] text-[11px] font-semibold cursor-pointer whitespace-nowrap"
          >
            Celebrate Newborn
          </button>
        </div>
      ) : isSovereign && onDirectDecide ? (
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDirectDecide(candidate.id, true)}
            className="flex-1 py-1.5 px-2 rounded-sm bg-[#D69635] hover:bg-[#E5A746] text-[#14161D] text-[11px] font-semibold cursor-pointer whitespace-nowrap"
          >
            Admit Now
          </button>
          <button
            type="button"
            onClick={() => onLetVillagerDecide(candidate.id)}
            className="py-1.5 px-2 rounded-sm bg-[#212836] hover:bg-[#2C3547] border border-[#E5AF47]/45 text-[#F3EAD6] text-[11px] font-medium cursor-pointer whitespace-nowrap"
          >
            Ask Locals
          </button>
          <button
            type="button"
            onClick={() => onDirectDecide(candidate.id, false)}
            className="py-1.5 px-2 rounded-sm bg-[#261D22] hover:bg-[#38262D] border border-[#C8666B]/45 text-[#F2B5B8] text-[11px] font-medium cursor-pointer whitespace-nowrap"
          >
            Turn Away
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSuggestGate(candidate.id, candidate.godSuggestion === 'welcome' ? 'neutral' : 'welcome')}
            className={`flex-1 py-1.5 px-1.5 rounded-sm text-[11px] font-semibold cursor-pointer whitespace-nowrap border ${
              candidate.godSuggestion === 'welcome'
                ? 'bg-[#D69635] text-[#14161D] border-[#E5AF47]'
                : 'bg-[#222B3A] hover:bg-[#2E3A4E] text-[#F3EAD6] border-[#8E6B35]/40'
            }`}
          >
            Suggest Welcome
          </button>
          <button
            type="button"
            onClick={() => onLetVillagerDecide(candidate.id)}
            className="py-1.5 px-2 rounded-sm bg-[#212836] hover:bg-[#2C3547] border border-[#E5AF47]/45 text-[#F3EAD6] text-[11px] font-medium cursor-pointer whitespace-nowrap"
          >
            Ask Villagers
          </button>
          <button
            type="button"
            onClick={() => onSuggestGate(candidate.id, candidate.godSuggestion === 'decline' ? 'neutral' : 'decline')}
            className={`py-1.5 px-1.5 rounded-sm text-[11px] font-medium cursor-pointer whitespace-nowrap border ${
              candidate.godSuggestion === 'decline'
                ? 'bg-[#A84E54] text-[#FFFDF9] border-[#E38589]'
                : 'bg-[#261D22] hover:bg-[#38262D] border-[#C8666B]/45 text-[#F2B5B8]'
            }`}
          >
            Suggest Decline
          </button>
        </div>
      )}
    </div>
  );
}
