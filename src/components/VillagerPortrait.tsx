import { useId } from 'react';
import type { LifeStage, TaskType } from '../game/types';

interface VillagerPortraitProps {
  cloakColor: string;
  hairColor: string;
  skinTone: string;
  hairStyle: number;
  lifeStage: LifeStage;
  isChief?: boolean;
  mood?: number;
  activeTask?: TaskType;
  size?: number;
}

const INK = '#2C221A';

export function VillagerPortrait({
  cloakColor,
  hairColor,
  skinTone,
  hairStyle,
  lifeStage,
  isChief = false,
  mood = 80,
  activeTask,
  size = 44,
}: VillagerPortraitProps) {
  const uid = useId().replace(/:/g, '');
  const isInfant = lifeStage === 'infant';
  const isChild = lifeStage === 'child';
  const isElder = lifeStage === 'elder';
  const canGear = !isInfant && !isChild;
  const headR = isInfant ? 8.6 : isChild ? 10 : 11.2;
  const cy = isInfant ? 23.5 : 22.8;
  const style = hairStyle % 4;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className="shrink-0 rounded bg-[#1B222F] border border-[#B68B44]/65"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`sky_${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#263145" />
          <stop offset="100%" stopColor="#3B4958" />
        </linearGradient>
        <clipPath id={`clip_${uid}`}>
          <rect width="48" height="48" rx="4" />
        </clipPath>
      </defs>

      <g clipPath={`url(#clip_${uid})`}>
        <rect width="48" height="48" fill={`url(#sky_${uid})`} />
        <path d="M0 38 Q16 31 32 36 T48 34 L48 48 L0 48 Z" fill="#2A3B38" opacity="0.85" />

        {activeTask === 'guard' && canGear ? (
          <g>
            {/* Light guard shoulder pads & leather/steel tunic */}
            <path d="M6 48 C7 35 13 32 18 33 L18 48 Z" fill="#8C9084" stroke={INK} strokeWidth="1.2" />
            <path d="M42 48 C41 35 35 32 30 33 L30 48 Z" fill="#8C9084" stroke={INK} strokeWidth="1.2" />
            <path d="M12 48 C13 35 19 33 24 33 C29 33 35 35 36 48 Z" fill="#999C90" stroke={INK} strokeWidth="1.3" />
            <path d="M18 33 L24 37.5 L30 33" fill={cloakColor} stroke={INK} strokeWidth="1.1" strokeLinejoin="round" />
          </g>
        ) : (
          <g>
            <path
              d="M6 48 C8 35 16 33 24 33 C32 33 40 35 42 48 Z"
              fill={cloakColor}
              stroke={INK}
              strokeWidth="1.4"
            />
            {!isInfant && (
              <>
                {(activeTask === 'bake' || activeTask === 'smelt' || style === 1) && (
                  <path
                    d="M16 36 L32 36 L34 48 L14 48 Z"
                    fill={activeTask === 'smelt' ? '#7D5C47' : '#EFE7D6'}
                    stroke={INK}
                    strokeWidth="1.1"
                  />
                )}
                {style === 2 && (
                  <path d="M17 34 L24 41 L31 34 L31 48 L17 48 Z" fill="#F2E9D8" stroke={INK} strokeWidth="1.1" />
                )}
                {style === 3 && (
                  <path d="M10 40 Q24 44 38 40 L35 34 Q24 36 13 34 Z" fill="#7D8E75" stroke={INK} strokeWidth="1.1" />
                )}
                <path d="M17 34 L24 39.5 L31 34" fill="#F5EDE0" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
              </>
            )}
          </g>
        )}

        {isChief && (
          <g>
            <path d="M12 48 L33 34" stroke="#F59E0B" strokeWidth="3.6" strokeLinecap="round" />
            <circle cx="24" cy="39.5" r="2.2" fill="#FDE68A" stroke={INK} strokeWidth="1" />
          </g>
        )}

        {isInfant ? (
          <g>
            <ellipse cx="24" cy="34.5" rx="13" ry="9.5" fill={cloakColor} stroke={INK} strokeWidth="1.4" />
            <circle cx="24" cy={cy} r={headR} fill={skinTone} stroke={INK} strokeWidth="1.4" />
            <path d="M23.5 14 C22 10 27 10 25.5 14" fill={hairColor} stroke={INK} strokeWidth="1" />
          </g>
        ) : (
          <g>
            {style === 1 && (
              <path
                d={`M${24 - headR - 2} 22 C${24 - headR - 3.5} 34 ${24 + headR + 3.5} 34 ${24 + headR + 2} 22 Z`}
                fill={hairColor}
                stroke={INK}
                strokeWidth="1.2"
              />
            )}
            {style === 2 && (
              <g fill={hairColor} stroke={INK} strokeWidth="1.1">
                <circle cx="12.5" cy="24" r="3.8" />
                <circle cx="35.5" cy="24" r="3.8" />
              </g>
            )}

            <rect x="21" y="30" width="6" height="5" fill={skinTone} stroke={INK} strokeWidth="1.1" />
            <circle cx="13" cy={cy + 1.2} r="2.2" fill={skinTone} stroke={INK} strokeWidth="1.1" />
            <circle cx="35" cy={cy + 1.2} r="2.2" fill={skinTone} stroke={INK} strokeWidth="1.1" />
            <circle cx="24" cy={cy} r={headR} fill={skinTone} stroke={INK} strokeWidth="1.4" />

            {/* Sculpted chibi fringe bangs matching 3D hair */}
            <path
              d={
                style === 0
                  ? `M${24 - headR} 21 C${24 - headR} 10.5 ${24 + headR} 10.5 ${24 + headR} 21 L32.5 18 L29.5 20.2 L26.5 17.5 L24 20.5 L20.8 17.4 L17.5 20 Z`
                  : `M${24 - headR} 21 C${24 - headR} 11 ${24 + headR} 11 ${24 + headR} 21 Q27 16 24 19 Q19 16 ${24 - headR} 21 Z`
              }
              fill={hairColor}
              stroke={INK}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </g>
        )}

        {/* Expressive anime/chibi eyes + matching eyebrows */}
        {[19.4, 28.6].map((ex, idx) => (
          <g key={idx}>
            <line
              x1={ex - 2.3}
              y1={cy - 3.3}
              x2={ex + 2.3}
              y2={cy - 3.5}
              stroke={hairColor}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <ellipse cx={ex} cy={cy + 0.2} rx="2.65" ry="1.95" fill="#FCFBF7" stroke={INK} strokeWidth="0.7" />
            <circle cx={ex} cy={cy + 0.25} r="1.45" fill="#9F7D38" />
            <circle cx={ex} cy={cy + 0.25} r="0.7" fill="#231B16" />
            <circle cx={ex - 0.55} cy={cy - 0.35} r="0.5" fill="#FFFFFF" />
            <path
              d={`M${ex - 2.7} ${cy - 0.7} Q${ex} ${cy - 2.3} ${ex + 2.7} ${cy - 0.7}`}
              stroke="#2A2019"
              strokeWidth="1.25"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        ))}

        {isElder && (
          <g fill="none" stroke="#8A6A3E" strokeWidth="1.05">
            <circle cx="19.4" cy={cy + 0.2} r="3.1" />
            <circle cx="28.6" cy={cy + 0.2} r="3.1" />
            <line x1="22.5" y1={cy + 0.2} x2="25.5" y2={cy + 0.2} />
          </g>
        )}

        {mood >= 65 ? (
          <path d={`M22 ${cy + 4.2} Q24 ${cy + 6.1} 26 ${cy + 4.2}`} stroke="#8E5B49" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        ) : mood < 40 ? (
          <path d={`M22 ${cy + 5.4} Q24 ${cy + 3.8} 26 ${cy + 5.4}`} stroke="#8E5B49" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        ) : (
          <line x1="22.4" y1={cy + 4.6} x2="25.6" y2={cy + 4.6} stroke="#8E5B49" strokeWidth="1.15" strokeLinecap="round" />
        )}

        {canGear && (activeTask === 'farm' || activeTask === 'forage' || activeTask === 'pasture') && (
          <g>
            <ellipse cx="24" cy="13.5" rx="14.5" ry="3.2" fill="#E3C178" stroke={INK} strokeWidth="1.2" />
            <path d="M16 13 C17 7.5 31 7.5 32 13 Z" fill="#D5AE5D" stroke={INK} strokeWidth="1.2" />
          </g>
        )}

        {canGear && activeTask === 'bake' && (
          <path d="M15.5 14 C14 7 34 7 32.5 14 Z" fill="#FAF5EA" stroke={INK} strokeWidth="1.2" />
        )}

        {canGear && (activeTask === 'fish' || activeTask === 'explore') && (
          <path d="M14 14.5 C15 8 33 8 34 14.5 Z" fill="#4C6D82" stroke={INK} strokeWidth="1.2" />
        )}

        {canGear && activeTask === 'study' && (
          <path d="M13 15 C16 7 32 7 35 15 Q24 11.5 13 15 Z" fill="#3B4D6B" stroke={INK} strokeWidth="1.2" />
        )}

        {isChief && (
          <polygon
            points="24,3.5 25.6,7 29.4,7.4 26.6,9.8 27.4,13.4 24,11.5 20.6,13.4 21.4,9.8 18.6,7.4 22.4,7"
            fill="#FBBF24"
            stroke={INK}
            strokeWidth="0.9"
          />
        )}
      </g>
    </svg>
  );
}
