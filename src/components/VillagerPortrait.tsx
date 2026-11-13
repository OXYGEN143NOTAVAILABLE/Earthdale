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

        <path
          d="M6 48 C8 35 16 33 24 33 C32 33 40 35 42 48 Z"
          fill={cloakColor}
          stroke={INK}
          strokeWidth="1.4"
        />
        {!isInfant && (
          <path d="M17 34 L24 39.5 L31 34" fill="#F5EDE0" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
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
                <circle cx="12.5" cy="27" r="3.4" />
                <circle cx="35.5" cy="27" r="3.4" />
              </g>
            )}

            <rect x="21" y="30" width="6" height="5" fill={skinTone} stroke={INK} strokeWidth="1.1" />
            <circle cx="24" cy={cy} r={headR} fill={skinTone} stroke={INK} strokeWidth="1.4" />

            <path
              d={`M${24 - headR} 21 C${24 - headR} 11 ${24 + headR} 11 ${24 + headR} 21 Q27 16 24 19 Q19 16 ${24 - headR} 21 Z`}
              fill={hairColor}
              stroke={INK}
              strokeWidth="1.2"
            />
          </g>
        )}

        <circle cx="17.2" cy={cy + 2.5} r="2.1" fill="#E5897D" opacity="0.38" />
        <circle cx="30.8" cy={cy + 2.5} r="2.1" fill="#E5897D" opacity="0.38" />
        <circle cx="20" cy={cy + 0.5} r="1.45" fill={INK} />
        <circle cx="28" cy={cy + 0.5} r="1.45" fill={INK} />

        {isElder && (
          <g fill="none" stroke="#8A6A3E" strokeWidth="1.05">
            <circle cx="20" cy={cy + 0.5} r="2.8" />
            <circle cx="28" cy={cy + 0.5} r="2.8" />
            <line x1="22.8" y1={cy + 0.5} x2="25.2" y2={cy + 0.5} />
          </g>
        )}

        {mood >= 65 ? (
          <path d={`M21 ${cy + 4.1} Q24 ${cy + 6.7} 27 ${cy + 4.1}`} stroke="#6E4235" strokeWidth="1.35" fill="none" strokeLinecap="round" />
        ) : mood < 40 ? (
          <path d={`M21 ${cy + 5.6} Q24 ${cy + 3.6} 27 ${cy + 5.6}`} stroke="#6E4235" strokeWidth="1.35" fill="none" strokeLinecap="round" />
        ) : (
          <line x1="21.5" y1={cy + 4.6} x2="26.5" y2={cy + 4.6} stroke="#6E4235" strokeWidth="1.25" strokeLinecap="round" />
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

        {canGear && (activeTask === 'guard' || activeTask === 'hunt') && (
          <path d="M13 15 C16 7 32 7 35 15 Q24 11.5 13 15 Z" fill="#5B6A7A" stroke={INK} strokeWidth="1.2" />
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
