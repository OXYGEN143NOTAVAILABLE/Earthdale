import type { BuildingType, ComfortItem, SeasonType, VillageResources } from '../game/types';

const INK = '#2C221A';

export function ResourceSvg({
  kind,
  className = 'w-3.5 h-3.5 shrink-0',
}: {
  kind: keyof VillageResources;
  className?: string;
}) {
  if (kind === 'timber') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M5 10.5 L15.5 6.5 C17.5 6 19.5 8 18.5 10.5 L8 14.5 Z" fill="#8C5E3C" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
        <ellipse cx="6.5" cy="12.5" rx="2.6" ry="2.4" fill="#DFC098" stroke={INK} strokeWidth="1.3" />
        <circle cx="6.5" cy="12.5" r="0.8" fill={INK} />
        <path d="M8 15.5 L18.5 11.5 C20.5 11 21.5 13.5 20 15.5 L10.5 19.5 Z" fill="#734A2E" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
        <ellipse cx="9.2" cy="17.5" rx="2.6" ry="2.4" fill="#D5B285" stroke={INK} strokeWidth="1.3" />
      </svg>
    );
  }
  if (kind === 'stone') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M4 16 L6.5 8.5 L13.5 6 L19.5 10.5 L19 17 L10 19 Z" fill="#9EA5AC" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M6.5 8.5 L12.5 11.5 L19.5 10.5 M12.5 11.5 L10 19" fill="none" stroke={INK} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'copper' || kind === 'bronze' || kind === 'iron') {
    const fill = kind === 'copper' ? '#D97A3C' : kind === 'bronze' ? '#C9963B' : '#8FA2B6';
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M5 15 L8 8.5 L17 8.5 L20 15 L17 18.5 L8 18.5 Z" fill={fill} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 8.5 L12.5 12 L17 8.5" fill="none" stroke="#F8FAFC" strokeOpacity="0.45" strokeWidth="1.2" />
      </svg>
    );
  }
  if (kind === 'wool') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="9.5" cy="11.5" r="4" fill="#F2ECE0" stroke={INK} strokeWidth="1.3" />
        <circle cx="14.5" cy="11.5" r="4" fill="#F2ECE0" stroke={INK} strokeWidth="1.3" />
        <circle cx="12" cy="14.5" r="4" fill="#E8E0D0" stroke={INK} strokeWidth="1.3" />
        <circle cx="12" cy="9" r="3.4" fill="#FAF6EE" stroke={INK} strokeWidth="1.3" />
      </svg>
    );
  }
  if (kind === 'food' || kind === 'grain' || kind === 'berries' || kind === 'meat' || kind === 'fish') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M12 20 L12 6" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
        <ellipse cx="12" cy="6.5" rx="2" ry="3" fill="#E8B948" stroke={INK} strokeWidth="1.2" />
        <ellipse cx="8.4" cy="9.5" rx="1.8" ry="2.6" transform="rotate(-22 8.4 9.5)" fill="#D9A036" stroke={INK} strokeWidth="1.2" />
        <ellipse cx="15.6" cy="9.5" rx="1.8" ry="2.6" transform="rotate(22 15.6 9.5)" fill="#D9A036" stroke={INK} strokeWidth="1.2" />
        <path d="M9.5 15.5 L14.5 15.5" stroke="#B85D3B" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M9 6 C9 4 15 4 15 6" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7.5 8 L16.5 8 L15 6 L9 6 Z" fill="#C48735" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="7.5" y="8" width="9" height="9.5" rx="1.2" fill="#FDE68A" stroke={INK} strokeWidth="1.4" />
      <path d="M12 10.5 C13.5 12.2 13.5 14.5 12 15.5 C10.5 14.5 10.5 12.2 12 10.5 Z" fill="#E67E22" />
      <path d="M7 17.5 L17 17.5 L15.5 20 L8.5 20 Z" fill="#A66B26" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function ComfortSvg({
  kind,
  className = 'w-4 h-4 shrink-0',
}: {
  kind: ComfortItem;
  className?: string;
}) {
  if (kind === 'bread') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path
          d="M4 15 C4 9.5 7.5 7 12 7 C16.5 7 20 9.5 20 15 C20 17.5 18.2 18.5 12 18.5 C5.8 18.5 4 17.5 4 15 Z"
          fill="#DDA059"
          stroke={INK}
          strokeWidth="1.4"
        />
        <path d="M8 10.5 L10 13 M12 9.5 L13.5 12.5 M15.5 10.5 L16.8 13" stroke="#8C4F23" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'tea') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M5.5 9.5 L16.5 9.5 L15.5 17 C15.2 18.8 13.5 19.5 11 19.5 C8.5 19.5 6.8 18.8 6.5 17 Z" fill="#E8EFE4" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M16.5 11 C19 11 19.5 15 16.2 15.5" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
        <ellipse cx="11" cy="9.5" rx="5.3" ry="1.4" fill="#6AA87B" stroke={INK} strokeWidth="1.1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M14.5 9 L19 4.5" stroke="#8C5E3C" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M7 9.5 L16 9.5 C17.8 12 18 17.5 15.5 19.5 L7.5 19.5 C5 17.5 5.2 12 7 9.5 Z"
        fill="#E6A532"
        stroke={INK}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <rect x="6.5" y="7.8" width="10" height="2" rx="1" fill="#F3E5CE" stroke={INK} strokeWidth="1.2" />
    </svg>
  );
}

export function SeasonSvg({
  season,
  className = 'w-3.5 h-3.5 shrink-0',
}: {
  season: SeasonType;
  className?: string;
}) {
  if (season === 'spring') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="7.5" r="2.6" fill="#F5B8C8" stroke={INK} strokeWidth="1.1" />
        <circle cx="16.3" cy="10.8" r="2.6" fill="#F5B8C8" stroke={INK} strokeWidth="1.1" />
        <circle cx="14.6" cy="15.8" r="2.6" fill="#F5B8C8" stroke={INK} strokeWidth="1.1" />
        <circle cx="9.4" cy="15.8" r="2.6" fill="#F5B8C8" stroke={INK} strokeWidth="1.1" />
        <circle cx="7.7" cy="10.8" r="2.6" fill="#F5B8C8" stroke={INK} strokeWidth="1.1" />
        <circle cx="12" cy="12.2" r="2.2" fill="#FCD34D" stroke={INK} strokeWidth="1" />
      </svg>
    );
  }
  if (season === 'summer') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="4.5" fill="#FBBF24" stroke={INK} strokeWidth="1.3" />
        <path
          d="M12 3.5 V5.5 M12 18.5 V20.5 M3.5 12 H5.5 M18.5 12 H20.5"
          stroke={INK}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (season === 'autumn') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path
          d="M12 20 V14 M12 4 C9 6.5 6 8.5 6.5 12.5 C7 15 9.5 16.5 12 16.5 C14.5 16.5 17 15 17.5 12.5 C18 8.5 15 6.5 12 4 Z"
          fill="#D97724"
          stroke={INK}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 3.5 V20.5 M4.6 7.8 L19.4 16.2 M19.4 7.8 L4.6 16.2" stroke="#4F7996" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.2" fill="#E6F2F8" stroke={INK} strokeWidth="1.1" />
    </svg>
  );
}

export function BuildingSvg({
  type,
  unlocked,
  className = 'w-9 h-9 shrink-0',
}: {
  type: BuildingType;
  unlocked: boolean;
  className?: string;
}) {
  const roofTint =
    type === 'cottage'
      ? '#C2664B'
      : type === 'bakery'
        ? '#CC724B'
        : type === 'library'
          ? '#4D8078'
          : type === 'watchtower' || type === 'barracks'
            ? '#6A5B7A'
            : type === 'smeltery'
              ? '#A65638'
              : '#8C6244';

  const wallFill = unlocked ? '#F5ECDA' : '#D5CDC0';
  const roofFill = unlocked ? roofTint : '#A69D8E';
  const winFill = unlocked ? '#FBBF24' : '#C8C0B2';
  const opacity = unlocked ? 1 : 0.78;

  return (
    <svg
      viewBox="0 0 36 36"
      className={`${className} rounded bg-[#232A38] border border-[#B68B44]/55`}
      style={{ opacity }}
      aria-hidden="true"
    >
      <rect width="36" height="36" fill="#E8DEC8" />

      {type === 'bonfire' && (
        <g>
          <ellipse cx="18" cy="27" rx="9" ry="3" fill="#8C8478" stroke={INK} strokeWidth="1.2" />
          <path d="M13 26 L18 11 L23 26 Z" fill="#EA580C" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M15.5 26 L18 16 L20.5 26 Z" fill="#FDE047" />
        </g>
      )}

      {type === 'lean_to' && (
        <g>
          <path d="M7 27 L18 12 L29 27 Z" fill="#C49A6C" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M13 27 L18 18 L23 27 Z" fill="#4B3B2E" />
        </g>
      )}

      {(type === 'cottage' || type === 'bakery' || type === 'library' || type === 'barracks') && (
        <g>
          <rect x="8" y="16" width="20" height="13" fill={wallFill} stroke={INK} strokeWidth="1.3" />
          <path d="M5.5 17 L18 8.5 L30.5 17 Z" fill={roofFill} stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
          <rect x="15.5" y="21" width="5" height="8" fill="#7D5236" stroke={INK} strokeWidth="1.1" />
          <rect x="10.5" y="19.5" width="3.5" height="3.5" fill={winFill} stroke={INK} strokeWidth="1" />
          <rect x="22" y="19.5" width="3.5" height="3.5" fill={winFill} stroke={INK} strokeWidth="1" />
        </g>
      )}

      {type === 'woodshop' && (
        <g>
          <path d="M9 29 V16 M27 29 V16" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M6 16 L18 9.5 L30 16 Z" fill={roofFill} stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
          <rect x="11" y="23" width="14" height="3.5" fill="#C48F5A" stroke={INK} strokeWidth="1.2" />
        </g>
      )}

      {type === 'quarry' && (
        <g>
          <path d="M6 28 L10 15 L19 12 L27 18 L29 28 Z" fill="#8C939A" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M25 28 V11 L17 11" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      )}

      {type === 'farm_plot' && (
        <g>
          <rect x="6" y="19" width="24" height="10" rx="1.5" fill="#876143" stroke={INK} strokeWidth="1.2" />
          <path d="M11 21 V13 M18 21 V11 M25 21 V13" stroke="#4D8049" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="11" cy="12" r="2" fill="#E8B948" stroke={INK} strokeWidth="1" />
          <circle cx="18" cy="10" r="2" fill="#E8B948" stroke={INK} strokeWidth="1" />
          <circle cx="25" cy="12" r="2" fill="#E8B948" stroke={INK} strokeWidth="1" />
        </g>
      )}

      {type === 'pasture' && (
        <g>
          <rect x="6" y="16" width="24" height="12" rx="1.5" fill="#63984D" stroke={INK} strokeWidth="1.2" />
          <circle cx="14" cy="22" r="3.4" fill="#F2ECE0" stroke={INK} strokeWidth="1.1" />
          <circle cx="23" cy="21" r="2.8" fill="#E3A89C" stroke={INK} strokeWidth="1.1" />
        </g>
      )}

      {type === 'smeltery' && (
        <g>
          <path d="M10 29 L13 11 L23 11 L26 29 Z" fill="#8C887E" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M15 29 C15 23 21 23 21 29 Z" fill="#F97316" stroke={INK} strokeWidth="1.1" />
        </g>
      )}

      {type === 'dock' && (
        <g>
          <rect x="6" y="19" width="24" height="4" fill="#A0744E" stroke={INK} strokeWidth="1.2" />
          <path d="M10 23 V29 M18 23 V29 M26 23 V29" stroke={INK} strokeWidth="1.6" />
          <path d="M18 19 V9 L26 14 L18 16" fill="#EFE4CE" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
        </g>
      )}

      {type === 'watchtower' && (
        <g>
          <rect x="12" y="14" width="12" height="15" fill="#B5ABA0" stroke={INK} strokeWidth="1.3" />
          <path d="M10 15 L18 7 L26 15 Z" fill={roofFill} stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
          <rect x="16.5" y="18" width="3" height="4" fill={winFill} stroke={INK} strokeWidth="1" />
        </g>
      )}
    </svg>
  );
}
