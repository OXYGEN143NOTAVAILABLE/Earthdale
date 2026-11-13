import { useState } from 'react';
import { Crown, Eye, Users } from 'lucide-react';
import type { GameMode } from '../game/types';

interface TitleScreenProps {
  hasSavedVillage: boolean;
  savedDay: number;
  savedPopulation: number;
  selectedMode: GameMode;
  onSelectMode: (mode: GameMode) => void;
  onStart: () => void;
  onNewVillage: (mode: GameMode) => void;
  onHostMultiplayer: (playerName: string, playerColor: string, mode: GameMode) => void;
  onJoinMultiplayer: (roomCode: string, playerName: string, playerColor: string) => void;
  mpConnecting: boolean;
  mpError: string | null;
}

const AURA_COLORS = ['#E5AF47', '#68B2D8', '#74C294', '#E38589', '#B99CE6'];

export function TitleScreen({
  hasSavedVillage,
  savedDay,
  savedPopulation,
  selectedMode,
  onSelectMode,
  onStart,
  onNewVillage,
  onHostMultiplayer,
  onJoinMultiplayer,
  mpConnecting,
  mpError,
}: TitleScreenProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [sessionType, setSessionType] = useState<'solo' | 'multiplayer'>('solo');
  const [playerName, setPlayerName] = useState('Aurelius');
  const [playerColor, setPlayerColor] = useState(AURA_COLORS[0]);
  const [joinCode, setJoinCode] = useState('');

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-b from-[#98B4C4] via-[#DFC49B] to-[#5D7B52]">
      {/* Illustrated valley backdrop with resilient CSS fallback */}
      {!imgFailed && (
        <img
          src="/src/assets/images/hearthglen_valley_art_1794552846645.jpg"
          alt="Hand-painted Hearthglen mountain valley at golden hour"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover scale-[1.06] pointer-events-none"
        />
      )}

      {/* Soft sky scrim for high-contrast typography */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(22, 29, 46, 0.48) 0%, rgba(22, 29, 46, 0.16) 46%, rgba(18, 24, 38, 0.72) 100%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center justify-between h-full px-6 py-6 sm:py-8 text-center overflow-y-auto">
        {/* Ornate storybook SVG valley crest */}
        <div className="mt-1 flex flex-col items-center">
          <svg
            viewBox="0 0 540 164"
            className="w-[300px] sm:w-[440px] h-auto drop-shadow-[0_4px_18px_rgba(20,16,12,0.45)]"
            role="img"
            aria-label="Hearthglen Storybook Crest"
          >
            <defs>
              <radialGradient id="titleLanternGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.95" />
                <stop offset="55%" stopColor="#F59E0B" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="titleGoldInk" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FEF3C7" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#D97724" />
              </linearGradient>
              <linearGradient id="titleSkyWash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2A3A4F" />
                <stop offset="100%" stopColor="#6D8576" />
              </linearGradient>
            </defs>

            <g transform="translate(270, 44)">
              <path d="M-34 8 C-56 4 -74 -10 -86 -26" fill="none" stroke="#2C221A" strokeWidth="3" strokeLinecap="round" />
              <path d="M-34 8 C-56 4 -74 -10 -86 -26" fill="none" stroke="#6E9468" strokeWidth="1.6" strokeLinecap="round" />
              {[-44, -58, -72].map((lx, i) => (
                <g key={lx} transform={`translate(${lx}, ${i * -9}) rotate(${-22 - i * 8})`}>
                  <path d="M0 0 C-7 -5 -9 -12 -2 -14 C2 -10 2 -4 0 0 Z" fill="#4D7A54" stroke="#2C221A" strokeWidth="1" />
                  <path d="M0 0 C5 -7 10 -6 9 1 C5 3 2 1 0 0 Z" fill="#639162" stroke="#2C221A" strokeWidth="1" />
                </g>
              ))}
              <circle cx="-50" cy="4" r="2.2" fill="#FBBF24" stroke="#2C221A" strokeWidth="0.8" />
              <circle cx="-68" cy="-8" r="2" fill="#E5897D" stroke="#2C221A" strokeWidth="0.8" />

              <path d="M34 8 C56 4 74 -10 86 -26" fill="none" stroke="#2C221A" strokeWidth="3" strokeLinecap="round" />
              <path d="M34 8 C56 4 74 -10 86 -26" fill="none" stroke="#6E9468" strokeWidth="1.6" strokeLinecap="round" />
              {[44, 58, 72].map((rx, i) => (
                <g key={rx} transform={`translate(${rx}, ${i * -9}) scale(-1,1) rotate(${-22 - i * 8})`}>
                  <path d="M0 0 C-7 -5 -9 -12 -2 -14 C2 -10 2 -4 0 0 Z" fill="#4D7A54" stroke="#2C221A" strokeWidth="1" />
                  <path d="M0 0 C5 -7 10 -6 9 1 C5 3 2 1 0 0 Z" fill="#639162" stroke="#2C221A" strokeWidth="1" />
                </g>
              ))}
              <circle cx="50" cy="4" r="2.2" fill="#FBBF24" stroke="#2C221A" strokeWidth="0.8" />
              <circle cx="68" cy="-8" r="2" fill="#E5897D" stroke="#2C221A" strokeWidth="0.8" />

              <circle cx="0" cy="-6" r="28" fill="url(#titleSkyWash)" stroke="url(#titleGoldInk)" strokeWidth="2.4" />
              <circle cx="0" cy="-6" r="24.5" fill="none" stroke="#2C221A" strokeWidth="1" strokeOpacity="0.6" />
              <path d="M-24 2 L-9 -14 L3 -2 L14 -12 L24 2 Z" fill="#4E6659" stroke="#2C221A" strokeWidth="1" />
              <circle cx="9" cy="-19" r="3.6" fill="#FDE68A" />
              <path d="M-23 4 Q0 1 23 4 A25 25 0 0 1 -23 4 Z" fill="#5D8458" />
              <path d="M2 2 Q-4 9 3 18" fill="none" stroke="#85B8CB" strokeWidth="2.4" strokeLinecap="round" />
              <rect x="-12" y="-3" width="12" height="8" fill="#F4EAD6" stroke="#2C221A" strokeWidth="1" />
              <path d="M-14 -3 L-6 -9 L2 -3 Z" fill="#B86446" stroke="#2C221A" strokeWidth="1" strokeLinejoin="round" />
              <rect x="-7.5" y="0" width="3" height="5" fill="#FBBF24" />
              <circle cx="-4" cy="-12" r="1.4" fill="#FAF6EE" opacity="0.7" />
              <circle cx="-2" cy="-16" r="1.8" fill="#FAF6EE" opacity="0.5" />
            </g>

            <g transform="translate(88, 62)">
              <path d="M-16 0 H10 C15 0 18 4 18 9" fill="none" stroke="#FDE68A" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
              <g className="svg-lantern-sway">
                <line x1="18" y1="9" x2="18" y2="17" stroke="#2C221A" strokeWidth="1.5" />
                <circle cx="18" cy="27" r="16" fill="url(#titleLanternGlow)" className="svg-lantern-glow" />
                <path d="M12 19 L24 19 L21 16 L15 16 Z" fill="#C48735" stroke="#2C221A" strokeWidth="1.2" />
                <rect x="12" y="19" width="12" height="14" rx="1.5" fill="#FEF3C7" stroke="#2C221A" strokeWidth="1.3" />
                <path d="M18 22 C20.5 24.5 20.5 28 18 30 C15.5 28 15.5 24.5 18 22 Z" fill="#EA580C" />
                <path d="M11 33 L25 33 L22 36 L14 36 Z" fill="#9A5F1D" stroke="#2C221A" strokeWidth="1.2" />
              </g>
            </g>

            <g transform="translate(452, 62) scale(-1, 1)">
              <path d="M-16 0 H10 C15 0 18 4 18 9" fill="none" stroke="#FDE68A" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
              <g className="svg-lantern-sway-alt">
                <line x1="18" y1="9" x2="18" y2="17" stroke="#2C221A" strokeWidth="1.5" />
                <circle cx="18" cy="27" r="16" fill="url(#titleLanternGlow)" className="svg-lantern-glow" />
                <path d="M12 19 L24 19 L21 16 L15 16 Z" fill="#C48735" stroke="#2C221A" strokeWidth="1.2" />
                <rect x="12" y="19" width="12" height="14" rx="1.5" fill="#FEF3C7" stroke="#2C221A" strokeWidth="1.3" />
                <path d="M18 22 C20.5 24.5 20.5 28 18 30 C15.5 28 15.5 24.5 18 22 Z" fill="#EA580C" />
                <path d="M11 33 L25 33 L22 36 L14 36 Z" fill="#9A5F1D" stroke="#2C221A" strokeWidth="1.2" />
              </g>
            </g>

            <text
              x="270"
              y="128"
              textAnchor="middle"
              fill="#FAF6EE"
              stroke="#2C221A"
              strokeWidth="0.9"
              paintOrder="stroke"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '56px',
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              Hearthglen
            </text>

            <path
              d="M148 144 Q210 139 270 144 Q330 149 392 144"
              fill="none"
              stroke="url(#titleGoldInk)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <polygon points="270,139 274,144 270,149 266,144" fill="#FDE68A" stroke="#2C221A" strokeWidth="0.8" />
          </svg>

          <p className="mt-1 max-w-xl text-xs sm:text-sm text-[#FAF6EE]/90 font-normal">
            Five visible floating islands above a living sky-sea. Watch villagers awaken from childhood curiosity, bond around nightly fires to evolve unique cultures, or step in directly as an all-powerful Sovereign—solo or with friends.
          </p>
        </div>

        {/* Mode & Session Panel */}
        <div className="my-3 w-full max-w-xl kingdom-frame rounded-md p-4 text-left text-[#F3EAD6]">
          {/* Game Type Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSelectMode('whisper_solo')}
              className={`p-2.5 rounded-sm border text-left transition-colors cursor-pointer ${
                selectedMode === 'whisper_solo'
                  ? 'bg-[#263042] border-[#E5AF47]'
                  : 'bg-[#171C27]/85 border-[#8E6B35]/30 hover:bg-[#1E2534]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F7EFDD]">
                <Eye className="w-3.5 h-3.5 text-[#E5AF47]" />
                <span>Whispering God</span>
              </div>
              <p className="mt-1 text-[11px] text-[#C8BCA6] leading-snug">
                Suggestion-only chronicles. Villagers start bare-handed, explore & chat before work, and forge culture on their own.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onSelectMode('sovereign_sandbox')}
              className={`p-2.5 rounded-sm border text-left transition-colors cursor-pointer ${
                selectedMode === 'sovereign_sandbox'
                  ? 'bg-[#263042] border-[#E5AF47]'
                  : 'bg-[#171C27]/85 border-[#8E6B35]/30 hover:bg-[#1E2534]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F7EFDD]">
                <Crown className="w-3.5 h-3.5 text-[#E5AF47]" />
                <span>Sovereign Sandbox</span>
              </div>
              <p className="mt-1 text-[11px] text-[#C8BCA6] leading-snug">
                Full divine control: command any villager, instant structures & sky-bridges, shape weather, seasons, festivals & diplomacy.
              </p>
            </button>
          </div>

          {/* Session Type Tabs */}
          <div className="mt-3 flex items-center gap-1 p-1 rounded-sm bg-[#12161F] border border-[#8E6B35]/35">
            <button
              type="button"
              onClick={() => setSessionType('solo')}
              className={`flex-1 py-1.5 rounded-sm text-xs font-semibold cursor-pointer transition-colors ${
                sessionType === 'solo' ? 'bg-[#D69635] text-[#14161D]' : 'text-[#C8BCA6] hover:text-[#F7EFDD]'
              }`}
            >
              Solo Realm
            </button>
            <button
              type="button"
              onClick={() => setSessionType('multiplayer')}
              className={`flex-1 py-1.5 rounded-sm text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                sessionType === 'multiplayer' ? 'bg-[#D69635] text-[#14161D]' : 'text-[#C8BCA6] hover:text-[#F7EFDD]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Co-Op Multiplayer</span>
            </button>
          </div>

          {sessionType === 'solo' ? (
            <div className="mt-3 flex flex-col items-center gap-2.5">
              {hasSavedVillage && (
                <p className="text-xs text-[#D8CEBA] tabular-nums">
                  Saved Realm: Day {savedDay} · {savedPopulation} {savedPopulation === 1 ? 'Inhabitant' : 'Inhabitants'}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={onStart}
                  className="px-6 py-2.5 rounded-sm bg-[#D69635] hover:bg-[#E5A746] text-[#14161D] border border-[#FDE68A]/60 font-semibold text-sm shadow-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  {hasSavedVillage ? 'Continue Archipelago' : `Enter ${selectedMode === 'sovereign_sandbox' ? 'Sovereign Realm' : 'Archipelago'}`}
                </button>
                {hasSavedVillage && (
                  <button
                    type="button"
                    onClick={() => onNewVillage(selectedMode)}
                    className="px-4 py-2.5 rounded-sm bg-[#1D2432] hover:bg-[#273144] text-[#F3EAD6] border border-[#8E6B35]/55 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    New {selectedMode === 'sovereign_sandbox' ? 'Sovereign' : 'Whispering'} Realm
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
                <label className="block">
                  <span className="text-[11px] text-[#B4A995] font-medium">Deity Name</span>
                  <input
                    type="text"
                    value={playerName}
                    maxLength={20}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Your name"
                    className="mt-1 w-full px-2.5 py-1.5 rounded-sm bg-[#12161F] border border-[#8E6B35]/45 text-[#F7EFDD] text-xs focus:outline-none focus:border-[#E5AF47]"
                  />
                </label>

                <div>
                  <span className="text-[11px] text-[#B4A995] font-medium block">Aura Color</span>
                  <div className="mt-1.5 flex items-center gap-2">
                    {AURA_COLORS.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setPlayerColor(col)}
                        aria-label={`Select aura color ${col}`}
                        className={`w-6 h-6 rounded-sm cursor-pointer border-2 transition-transform ${
                          playerColor === col ? 'border-[#FAF6EE] scale-110' : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: col }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  disabled={mpConnecting}
                  onClick={() => onHostMultiplayer(playerName.trim() || 'Deity', playerColor, selectedMode)}
                  className="px-4 py-2 rounded-sm bg-[#D69635] hover:bg-[#E5A746] disabled:opacity-60 text-[#14161D] font-semibold cursor-pointer whitespace-nowrap"
                >
                  {mpConnecting ? 'Opening Realm...' : `Host ${selectedMode === 'sovereign_sandbox' ? 'Sovereign' : 'Whispering'} Room`}
                </button>

                <div className="flex-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    value={joinCode}
                    maxLength={6}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="ROOM CODE"
                    className="flex-1 min-w-0 px-2.5 py-2 rounded-sm bg-[#12161F] border border-[#8E6B35]/45 text-[#F7EFDD] text-xs font-mono tracking-wider uppercase focus:outline-none focus:border-[#E5AF47]"
                  />
                  <button
                    type="button"
                    disabled={mpConnecting || !joinCode.trim()}
                    onClick={() => onJoinMultiplayer(joinCode.trim().toUpperCase(), playerName.trim() || 'Co-Deity', playerColor)}
                    className="px-4 py-2 rounded-sm bg-[#253145] hover:bg-[#31415C] disabled:opacity-50 text-[#F7EFDD] border border-[#8E6B35]/50 font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Join Room
                  </button>
                </div>
              </div>

              {mpError && <p className="text-[11px] text-[#E38589] font-medium">{mpError}</p>}
            </div>
          )}
        </div>

        <p className="text-xs text-[#FAF6EE]/80 tracking-wide">
          Enter Start · Drag Pan · Scroll Zoom · Space Pause/Play · H Hide Dock · B Ledger · G Map · C Sky
        </p>
      </div>
    </div>
  );
}
