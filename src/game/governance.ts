import { ISLAND_DEFS } from './catalog';
import { emitWorldEvent } from './eventBus';
import { getKnowledgeLevel } from './knowledge';
import { getNpcPersonality, recordNpcMemory } from './personality';
import { applySocialScoreChange, ensureSocialRecord } from './social';
import type {
  BoatEntity,
  CommunityRule,
  CommunityRuleKind,
  DisputeCase,
  DisputeVote,
  IslandId,
  OffenseKind,
  VillageIncident,
  VillagerEntity,
  WorldState,
} from './types';

export const WITNESS_RANGE = 140;
export const MAX_INCIDENTS = 60;
export const MAX_DISPUTES = 24;

export function getPierApproachPoint(islandId: IslandId): { x: number; y: number } {
  const isl = ISLAND_DEFS[islandId] ?? ISLAND_DEFS.cradle;
  return {
    x: Math.round(isl.centerX + (isl.dockSpot.x - isl.centerX) * 0.89),
    y: Math.round(isl.centerY + (isl.dockSpot.y - isl.centerY) * 0.89),
  };
}

export interface StandingMeta {
  label: string;
  color: string;
  bgClass: string;
}

export function getStandingMeta(reputation: number, banished?: boolean): StandingMeta {
  if (banished) {
    return {
      label: 'Banished',
      color: '#F87171',
      bgClass: 'bg-[#461D22] border-[#E38589] text-[#FDE2E3]',
    };
  }
  if (reputation >= 65) {
    return {
      label: 'Venerated',
      color: '#FDE68A',
      bgClass: 'bg-[#2C2414] border-[#E5AF47]/60 text-[#FDE68A]',
    };
  }
  if (reputation >= 35) {
    return {
      label: 'Respected',
      color: '#8CE0AC',
      bgClass: 'bg-[#1D2D24] border-[#589674]/55 text-[#8CE0AC]',
    };
  }
  if (reputation >= 12) {
    return {
      label: 'Trusted',
      color: '#A8D8EA',
      bgClass: 'bg-[#1A2636] border-[#6E8AB5]/45 text-[#A8D8EA]',
    };
  }
  if (reputation > -12) {
    return {
      label: 'Unproven',
      color: '#D8CEBA',
      bgClass: 'bg-[#1B212E] border-[#8E6B35]/35 text-[#D8CEBA]',
    };
  }
  if (reputation > -32) {
    return {
      label: 'Distrusted',
      color: '#F0B46E',
      bgClass: 'bg-[#2E2118] border-[#D97706]/50 text-[#FDBA74]',
    };
  }
  return {
    label: 'Outcast Risk',
    color: '#F87171',
    bgClass: 'bg-[#3A1E24] border-[#E38589]/60 text-[#FDE2E3]',
  };
}

function clampRep(val: number): number {
  return Math.max(-100, Math.min(100, Math.round(val)));
}

export function ensureGovernanceArrays(world: WorldState): void {
  if (!Array.isArray(world.communityRules)) world.communityRules = [];
  if (!Array.isArray(world.incidents)) world.incidents = [];
  if (!Array.isArray(world.disputes)) world.disputes = [];
}

export function adjustVillagerReputation(
  world: WorldState,
  villager: VillagerEntity,
  delta: number,
  reason?: string,
): number {
  const prev = villager.reputation ?? 15;
  const next = clampRep(prev + delta);
  villager.reputation = next;

  if (prev < 35 && next >= 35 && !villager.banished) {
    const islandId = villager.homeIslandId ?? villager.islandId;
    const islName = ISLAND_DEFS[islandId]?.name ?? 'Hearthglen';
    emitWorldEvent(world, {
      category: 'rule',
      significance: 'notable',
      summary: `${villager.name.split(' ')[0]} gained the lasting trust of ${islName}${reason ? ` (${reason})` : ''}.`,
      islandId,
      participantIds: [villager.id],
    });
  }
  return next;
}

export function recordPositiveContribution(
  world: WorldState,
  actor: VillagerEntity,
  kind: 'help' | 'teach' | 'build' | 'defend' | 'share',
  beneficiary?: VillagerEntity | null,
  points: number = 4,
): void {
  if (actor.banished) return;
  actor.contributionCount = (actor.contributionCount ?? 0) + 1;
  const reasonMap = {
    help: 'helping neighbors',
    teach: 'teaching skills',
    build: 'community construction',
    defend: 'defending the island',
    share: 'sharing provisions',
  };
  adjustVillagerReputation(world, actor, points, reasonMap[kind]);

  if (beneficiary && beneficiary.id !== actor.id) {
    applySocialScoreChange(world, beneficiary, actor, Math.max(2, Math.round(points * 0.75)), 'gift', {
      markIntroduced: true,
    });
    recordNpcMemory(beneficiary, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: 'social',
      summary: `${actor.name.split(' ')[0]} helped me through ${reasonMap[kind]}.`,
      actorIds: [actor.id],
      importance: 6,
      sentiment: 'positive',
    });
  }
}

const RULE_BLUEPRINTS: Record<
  CommunityRuleKind,
  { title: string; description: string; severity: 'informal' | 'formal' }
> = {
  no_theft: {
    title: 'Respect Village Stores',
    description: 'Pilfering from communal stockpiles or neighbors is forbidden and brings council censure.',
    severity: 'formal',
  },
  fair_share: {
    title: 'Fair Share in Hardship',
    description: 'Provisions gathered on the island belong to the hearth circle before private hoarding.',
    severity: 'informal',
  },
  no_assault: {
    title: 'Peace Beside the Hearth',
    description: 'Striking fellow villagers or turning brawls against kin incurs collective discipline.',
    severity: 'formal',
  },
  protect_kin: {
    title: 'Guard the Vulnerable',
    description: 'Adults are expected to shelter youths and injured villagers during cold or raids.',
    severity: 'informal',
  },
  shared_duty: {
    title: 'Shared Hearth Duty',
    description: 'Able-bodied villagers must contribute to shelter, food, or defense.',
    severity: 'informal',
  },
};

export function hasActiveCommunityRule(
  world: WorldState,
  islandId: IslandId,
  kind: CommunityRuleKind,
): boolean {
  return Boolean(
    world.communityRules?.some((r) => r.islandId === islandId && r.kind === kind && r.enforced),
  );
}

export function establishCommunityRule(
  world: WorldState,
  islandId: IslandId,
  kind: CommunityRuleKind,
  triggerReason: string,
): CommunityRule | null {
  ensureGovernanceArrays(world);
  if (hasActiveCommunityRule(world, islandId, kind)) return null;

  const bp = RULE_BLUEPRINTS[kind];
  const rule: CommunityRule = {
    id: `rule_${islandId}_${kind}`,
    islandId,
    kind,
    title: bp.title,
    description: bp.description,
    establishedDay: world.environment.dayCount,
    triggerReason,
    severity: bp.severity,
    enforced: true,
  };
  world.communityRules!.push(rule);

  const islName = ISLAND_DEFS[islandId]?.name ?? 'Hearthglen';
  const adults = world.villagers.filter(
    (v) =>
      !v.banished &&
      (v.homeIslandId ?? v.islandId) === islandId &&
      (v.lifeStage === 'adult' || v.lifeStage === 'elder'),
  );
  for (const adult of adults) {
    recordNpcMemory(adult, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: 'rule',
      summary: `${islName} established community rule: ${bp.title}.`,
      actorIds: [],
      importance: 7,
      sentiment: 'neutral',
    });
  }

  emitWorldEvent(world, {
    category: 'rule',
    significance: 'notable',
    summary: `${islName} adopted a community rule: "${bp.title}" (${triggerReason}).`,
    islandId,
    participantIds: adults.slice(0, 4).map((a) => a.id),
  });

  return rule;
}

function mapOffenseToRuleKind(kind: OffenseKind): CommunityRuleKind {
  switch (kind) {
    case 'theft':
      return 'no_theft';
    case 'hoarding':
      return 'fair_share';
    case 'assault':
      return 'no_assault';
    case 'sabotage':
      return 'shared_duty';
    default:
      return 'no_theft';
  }
}

export function evaluateRuleEmergence(
  world: WorldState,
  islandId: IslandId,
  recentOffense: OffenseKind,
): CommunityRule | null {
  ensureGovernanceArrays(world);
  const targetRule = mapOffenseToRuleKind(recentOffense);
  if (hasActiveCommunityRule(world, islandId, targetRule)) return null;

  const islandAdults = world.villagers.filter(
    (v) =>
      !v.banished &&
      (v.homeIslandId ?? v.islandId) === islandId &&
      (v.lifeStage === 'adult' || v.lifeStage === 'elder'),
  );
  if (islandAdults.length < 3) return null;

  const matchingIncidents = (world.incidents ?? []).filter(
    (inc) =>
      inc.islandId === islandId &&
      mapOffenseToRuleKind(inc.kind) === targetRule,
  );
  if (matchingIncidents.length < 2) return null;

  const reasonMap: Record<CommunityRuleKind, string> = {
    no_theft: 'after repeated thefts from village stores',
    fair_share: 'after repeated hoarding complaints',
    no_assault: 'after repeated altercations',
    protect_kin: 'to safeguard youths and elders',
    shared_duty: 'after neglected community duties',
  };
  return establishCommunityRule(world, islandId, targetRule, reasonMap[targetRule]);
}

/**
 * Records a misconduct incident that ONLY nearby witnesses (within WITNESS_RANGE)
 * and the direct victim actually observe. Distant or off-island villagers remain unaware
 * unless informed secondhand via social encounters.
 */
export function recordMisconductIncident(
  world: WorldState,
  perpetrator: VillagerEntity,
  kind: OffenseKind,
  severity: number,
  summary: string,
  victim?: VillagerEntity | null,
): VillageIncident | null {
  if (perpetrator.banished) return null;
  ensureGovernanceArrays(world);

  const islandId = perpetrator.islandId;
  const clampedSeverity = Math.max(1, Math.min(3, Math.round(severity)));
  const activeRuleBroken = hasActiveCommunityRule(world, islandId, mapOffenseToRuleKind(kind));

  const witnesses = world.villagers.filter((other) => {
    if (other.id === perpetrator.id || other.banished) return false;
    if (other.lifeStage === 'infant') return false;
    if (victim && other.id === victim.id) return true;
    if (other.islandId !== islandId) return false;
    return Math.hypot(other.x - perpetrator.x, other.y - perpetrator.y) <= WITNESS_RANGE;
  });

  const witnessIds = witnesses.map((w) => w.id);
  const inc: VillageIncident = {
    id: `inc_${world.environment.dayCount}_${Math.random().toString(36).slice(2, 7)}`,
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    islandId,
    perpetratorId: perpetrator.id,
    victimId: victim?.id ?? null,
    kind,
    severity: clampedSeverity,
    summary,
    witnessIds,
    rumorIds: [],
    addressed: false,
  };
  world.incidents!.unshift(inc);
  if (world.incidents!.length > MAX_INCIDENTS) {
    world.incidents!.length = MAX_INCIDENTS;
  }

  perpetrator.offenseCount = (perpetrator.offenseCount ?? 0) + 1;
  const repPenalty = -(6 * clampedSeverity + (activeRuleBroken ? 5 : 0));
  adjustVillagerReputation(world, perpetrator, repPenalty);

  const perpFirst = perpetrator.name.split(' ')[0];
  recordNpcMemory(perpetrator, {
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    kind: 'conflict',
    summary: `Committed ${kind}: ${summary}`,
    actorIds: victim ? [victim.id] : [],
    importance: 7,
    sentiment: 'negative',
  });

  for (const w of witnesses) {
    if (!Array.isArray(w.knownIncidentIds)) w.knownIncidentIds = [];
    if (!w.knownIncidentIds.includes(inc.id)) w.knownIncidentIds.push(inc.id);

    const trustDrop = -(7 * clampedSeverity + (victim?.id === w.id ? 6 : 0) + (activeRuleBroken ? 3 : 0));
    applySocialScoreChange(world, w, perpetrator, trustDrop, 'quarrel', { markIntroduced: true });

    recordNpcMemory(w, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: 'conflict',
      summary:
        victim?.id === w.id
          ? `Wronged by ${perpFirst} (${summary}).`
          : `Witnessed ${perpFirst} commit ${kind}: ${summary}`,
      actorIds: [perpetrator.id],
      importance: 7 + clampedSeverity,
      sentiment: 'negative',
    });
  }

  emitWorldEvent(world, {
    category: 'rule',
    significance: clampedSeverity >= 2 || activeRuleBroken ? 'notable' : 'minor',
    summary:
      witnessIds.length > 0
        ? `${perpFirst} was caught (${kind}): ${summary} (${witnessIds.length} witness${witnessIds.length === 1 ? '' : 'es'}).`
        : `${perpFirst} committed ${kind} unseen: ${summary}`,
    islandId,
    participantIds: victim ? [perpetrator.id, victim.id] : [perpetrator.id],
    witnessIds,
  });

  evaluateRuleEmergence(world, islandId, kind);
  maybeOpenDisputeForPerpetrator(world, perpetrator, inc);

  return inc;
}

/**
 * Allows a villager who directly witnessed an incident to share a secondhand report
 * during a social encounter. Secondhand listeners record a rumor (not firsthand fact)
 * and reduce trust far more cautiously than direct witnesses.
 */
export function spreadIncidentRumor(
  world: WorldState,
  speaker: VillagerEntity,
  listener: VillagerEntity,
): VillageIncident | null {
  if (speaker.banished || listener.banished) return null;
  if (!speaker.knownIncidentIds || speaker.knownIncidentIds.length === 0) return null;
  ensureGovernanceArrays(world);

  for (const incId of speaker.knownIncidentIds) {
    const inc = world.incidents?.find((item) => item.id === incId);
    if (!inc || inc.perpetratorId === listener.id || inc.perpetratorId === speaker.id) continue;
    const listenerKnows =
      (listener.knownIncidentIds?.includes(inc.id) ?? false) ||
      (listener.rumorIncidentIds?.includes(inc.id) ?? false);
    if (listenerKnows) continue;

    const perp = world.villagers.find((v) => v.id === inc.perpetratorId);
    if (!perp || perp.banished) continue;

    if (!Array.isArray(listener.rumorIncidentIds)) listener.rumorIncidentIds = [];
    listener.rumorIncidentIds.push(inc.id);
    if (!inc.rumorIds.includes(listener.id)) inc.rumorIds.push(listener.id);

    const listenerPersonality = getNpcPersonality(listener);
    const speakerTrust = listener.relationships[speaker.id] ?? 25;
    const rumorCredibility = Math.max(0.3, Math.min(1, (speakerTrust / 65) * (1.1 - listenerPersonality.caution * 0.35)));
    const mildDrop = -Math.max(1, Math.round(inc.severity * 2.5 * rumorCredibility));

    applySocialScoreChange(world, listener, perp, mildDrop, 'chat', { markIntroduced: false });
    recordNpcMemory(listener, {
      day: world.environment.dayCount,
      timeOfDay: world.environment.timeOfDay,
      kind: 'rule',
      summary: `Heard secondhand from ${speaker.name.split(' ')[0]} about ${perp.name.split(' ')[0]}'s ${inc.kind}.`,
      actorIds: [speaker.id, perp.id],
      importance: 5,
      sentiment: 'negative',
    });

    return inc;
  }
  return null;
}

export function maybeOpenDisputeForPerpetrator(
  world: WorldState,
  accused: VillagerEntity,
  triggerIncident: VillageIncident,
): DisputeCase | null {
  if (accused.banished) return null;
  ensureGovernanceArrays(world);

  const islandId = accused.homeIslandId ?? accused.islandId;
  const activeExisting = world.disputes!.some(
    (d) => d.accusedId === accused.id && (d.status === 'confrontation' || d.status === 'deliberation'),
  );
  if (activeExisting) return null;

  const islandAdults = world.villagers.filter(
    (v) =>
      !v.banished &&
      v.id !== accused.id &&
      (v.homeIslandId ?? v.islandId) === islandId &&
      (v.lifeStage === 'adult' || v.lifeStage === 'elder'),
  );
  // Community council requires established social organization (>= 2 other adults)
  if (islandAdults.length < 2) return null;

  const offenses = accused.offenseCount ?? 0;
  const rep = accused.reputation ?? 15;
  const witnessedByAnyone = triggerIncident.witnessIds.length > 0;
  // A single minor incident never triggers banishment council automatically
  const warrantsCouncil =
    witnessedByAnyone &&
    (offenses >= 2 || (triggerIncident.severity >= 3 && rep <= -15));
  if (!warrantsCouncil) return null;

  const accuser =
    islandAdults.find((a) => a.isChief && (a.knownIncidentIds?.includes(triggerIncident.id) ?? false)) ??
    islandAdults.find((a) => a.id === triggerIncident.victimId) ??
    islandAdults.find((a) => triggerIncident.witnessIds.includes(a.id)) ??
    islandAdults[0];

  const dispute: DisputeCase = {
    id: `disp_${world.environment.dayCount}_${Math.random().toString(36).slice(2, 7)}`,
    islandId,
    accusedId: accused.id,
    accusedName: accused.name,
    accuserId: accuser.id,
    accuserName: accuser.name,
    reason: `Repeated ${triggerIncident.kind} (${offenses} recorded incident${offenses === 1 ? '' : 's'})`,
    openedDay: world.environment.dayCount,
    status: 'confrontation',
    deliberationTimer: 8,
    votesForBanish: 0,
    votesAgainstBanish: 0,
    votes: [],
  };
  world.disputes!.unshift(dispute);
  if (world.disputes!.length > MAX_DISPUTES) {
    world.disputes!.length = MAX_DISPUTES;
  }

  accused.thoughtBubble = 'Confronted!';
  accused.thoughtTimer = 3.2;
  accuser.thoughtBubble = 'Hold council!';
  accuser.thoughtTimer = 3.2;

  emitWorldEvent(world, {
    category: 'rule',
    significance: 'notable',
    summary: `${accuser.name.split(' ')[0]} confronted ${accused.name.split(' ')[0]} and called a village council over ${dispute.reason}.`,
    islandId,
    participantIds: [accuser.id, accused.id],
    witnessIds: triggerIncident.witnessIds,
  });

  return dispute;
}

export function evaluateAndResolveDispute(
  world: WorldState,
  dispute: DisputeCase,
): DisputeCase {
  ensureGovernanceArrays(world);
  const accused = world.villagers.find((v) => v.id === dispute.accusedId);
  if (!accused || accused.banished) {
    dispute.status = 'reconciled';
    dispute.resolvedDay = world.environment.dayCount;
    dispute.outcomeSummary = 'Dispute closed before council vote.';
    return dispute;
  }

  const voters = world.villagers.filter(
    (v) =>
      !v.banished &&
      v.id !== accused.id &&
      (v.homeIslandId ?? v.islandId) === dispute.islandId &&
      (v.lifeStage === 'adult' || v.lifeStage === 'elder'),
  );

  const accusedIncidents = (world.incidents ?? []).filter((inc) => inc.perpetratorId === accused.id);
  const accusedPersonality = getNpcPersonality(accused);
  const activeRuleCount = (world.communityRules ?? []).filter(
    (r) => r.islandId === dispute.islandId && r.enforced,
  ).length;

  let votesForBanish = 0;
  let votesAgainstBanish = 0;
  let banishSupporters = 0;
  const votes: DisputeVote[] = [];

  for (const voter of voters) {
    const vp = getNpcPersonality(voter);
    const rel = voter.relationships[accused.id] ?? ensureSocialRecord(world, voter, accused).score;
    const firsthandWitness = accusedIncidents.some((inc) => voter.knownIncidentIds?.includes(inc.id));
    const heardRumor = accusedIncidents.some((inc) => voter.rumorIncidentIds?.includes(inc.id));
    const chiefBonus = voter.isChief ? 1.5 : 1.0;

    // Individual opinion score (> 0 leans toward banishment, <= 0 defends/warns/reconciles)
    let score = 0;
    if (firsthandWitness) score += 1.65;
    else if (heardRumor) score += 0.45 - vp.caution * 0.35;
    else score -= 0.75; // Uninvolved villagers hesitate to banish without direct proof

    if (voter.partnerId === accused.id || rel >= 58) {
      score -= 2.2; // Friends & partners defend accused
    } else if (rel >= 42) {
      score -= 0.9;
    } else if (rel <= 16) {
      score += 0.85;
    }

    const offenses = accused.offenseCount ?? 0;
    if (offenses >= 3) score += 1.25;
    else if (offenses >= 2) score += 0.65;
    if ((accused.reputation ?? 15) <= -15) score += 0.7;
    if (activeRuleCount > 0) score += 0.4;

    // Personality divergence: disciplined & strict vs empathetic & forgiving
    score += vp.discipline * 0.95 + vp.honesty * 0.45 - vp.empathy * 1.15;

    // Remorse / reconciliatory temperament by accused softens verdict when not chronic
    if (accusedPersonality.honesty >= 0.65 && offenses <= 2) {
      score -= 0.65;
    }

    let decision: DisputeVote['decision'];
    let reason: string;
    if (score >= 1.15 && (firsthandWitness || heardRumor) && (offenses >= 2 || (accused.reputation ?? 0) <= -20)) {
      decision = 'banish';
      banishSupporters += 1;
      votesForBanish += chiefBonus;
      reason = firsthandWitness
        ? 'Witnessed repeated rule-breaking; voted to banish.'
        : 'Convinced by pattern of misconduct; voted to banish.';
    } else if (rel >= 55 || voter.partnerId === accused.id || (!firsthandWitness && !heardRumor)) {
      decision = 'defend';
      votesAgainstBanish += chiefBonus;
      reason = rel >= 55 ? 'Spoke in defense of a friend.' : 'Withheld banishment without firsthand proof.';
    } else if (vp.empathy >= 0.55 || score < 0.25) {
      decision = 'reconcile';
      votesAgainstBanish += chiefBonus;
      reason = 'Urged atonement and reconciliation.';
    } else {
      decision = 'warn';
      votesAgainstBanish += chiefBonus;
      reason = 'Supported formal probation rather than exile.';
    }

    votes.push({
      voterId: voter.id,
      voterName: voter.name,
      decision,
      weight: chiefBonus,
      reason,
      firsthandWitness,
    });
  }

  dispute.votes = votes;
  dispute.votesForBanish = Number(votesForBanish.toFixed(1));
  dispute.votesAgainstBanish = Number(votesAgainstBanish.toFixed(1));
  dispute.resolvedDay = world.environment.dayCount;

  const offenses = accused.offenseCount ?? 0;
  const approvedBanish =
    votesForBanish > votesAgainstBanish &&
    banishSupporters >= 2 &&
    (offenses >= 2 || (accused.reputation ?? 0) <= -20);

  const islName = ISLAND_DEFS[dispute.islandId]?.name ?? 'Hearthglen';
  const accusedFirst = accused.name.split(' ')[0];

  if (approvedBanish) {
    dispute.status = 'banished';
    dispute.outcomeSummary = `Council voted ${dispute.votesForBanish}–${dispute.votesAgainstBanish} to banish ${accused.name}.`;
    executePhysicalBanishment(world, accused, dispute);
  } else {
    const majorityReconcile = votes.filter((v) => v.decision === 'reconcile' || v.decision === 'defend').length >=
      votes.filter((v) => v.decision === 'warn').length;
    dispute.status = majorityReconcile ? 'reconciled' : 'restricted';
    dispute.outcomeSummary = majorityReconcile
      ? `Council chose reconciliation (${dispute.votesAgainstBanish}–${dispute.votesForBanish} against exile); ${accusedFirst} pledged amends.`
      : `Council issued strict probation (${dispute.votesAgainstBanish}–${dispute.votesForBanish} against exile) for ${accusedFirst}.`;

    if (majorityReconcile) {
      accused.reputation = clampRep((accused.reputation ?? 0) + 6);
      accused.mood = Math.min(100, accused.mood + 6);
      accused.thoughtBubble = 'Forgiven...';
      accused.thoughtTimer = 3.0;
    } else {
      establishCommunityRule(world, dispute.islandId, 'no_theft', `following council warning to ${accusedFirst}`);
      accused.thoughtBubble = 'On probation';
      accused.thoughtTimer = 3.0;
    }

    for (const v of voters) {
      recordNpcMemory(v, {
        day: world.environment.dayCount,
        timeOfDay: world.environment.timeOfDay,
        kind: 'rule',
        summary: dispute.outcomeSummary,
        actorIds: [accused.id],
        importance: 7,
        sentiment: 'neutral',
      });
    }

    emitWorldEvent(world, {
      category: 'rule',
      significance: 'notable',
      summary: `${islName} ${dispute.outcomeSummary}`,
      islandId: dispute.islandId,
      participantIds: [accused.id, ...voters.slice(0, 3).map((v) => v.id)],
    });
  }

  for (const inc of accusedIncidents) {
    if (inc.islandId === dispute.islandId) inc.addressed = true;
  }

  return dispute;
}

export function executePhysicalBanishment(
  world: WorldState,
  accused: VillagerEntity,
  dispute: DisputeCase,
): void {
  const islandId = accused.homeIslandId ?? accused.islandId;
  const isl = ISLAND_DEFS[islandId] ?? ISLAND_DEFS.cradle;
  const pier = getPierApproachPoint(islandId);

  accused.banished = true;
  accused.isChief = false;
  if (world.chiefId === accused.id) world.chiefId = null;
  accused.rtsOrder = null;
  accused.drafted = false;
  accused.suggestedTask = null;
  accused.hangOutTargetId = null;
  accused.state = 'walking';
  accused.targetX = pier.x;
  accused.targetY = pier.y;
  accused.autonomyReason = `Banished from ${isl.name} — walking to shore to board departing skiff.`;
  accused.thoughtBubble = 'Exiled...';
  accused.thoughtTimer = 5.0;

  // Consequences for both sides while preserving relationships
  const accusedFirst = accused.name.split(' ')[0];
  for (const other of world.villagers) {
    if (other.id === accused.id) continue;
    const rel = other.relationships[accused.id] ?? 20;
    const isFriend = rel >= 55 || other.partnerId === accused.id;
    if (isFriend) {
      other.mood = Math.max(8, other.mood - 10);
      recordNpcMemory(other, {
        day: world.environment.dayCount,
        timeOfDay: world.environment.timeOfDay,
        kind: 'rule',
        summary: `Saddened that the council banished ${accusedFirst} from ${isl.name}.`,
        actorIds: [accused.id],
        importance: 9,
        sentiment: 'negative',
      });
    } else if ((other.homeIslandId ?? other.islandId) === islandId) {
      other.mood = Math.min(100, other.mood + 4);
      recordNpcMemory(other, {
        day: world.environment.dayCount,
        timeOfDay: world.environment.timeOfDay,
        kind: 'rule',
        summary: `Joined ${isl.name} in banishing ${accusedFirst} for ${dispute.reason}.`,
        actorIds: [accused.id],
        importance: 8,
        sentiment: 'neutral',
      });
    }
  }

  // Resentment toward accuser persists on accused
  const accuser = world.villagers.find((v) => v.id === dispute.accuserId);
  if (accuser) {
    applySocialScoreChange(world, accused, accuser, -20, 'quarrel', { markIntroduced: true });
  }
  recordNpcMemory(accused, {
    day: world.environment.dayCount,
    timeOfDay: world.environment.timeOfDay,
    kind: 'rule',
    summary: `Banished from ${isl.name} by council vote (${dispute.reason}).`,
    actorIds: [dispute.accuserId],
    importance: 10,
    sentiment: 'negative',
  });

  emitWorldEvent(world, {
    category: 'rule',
    significance: 'major',
    summary: `${isl.name} voted to banish ${accused.name} (${dispute.votesForBanish}–${dispute.votesAgainstBanish}) for ${dispute.reason}.`,
    islandId,
    participantIds: [accused.id, dispute.accuserId],
  });
}

function boardBanishmentSkiff(world: WorldState, v: VillagerEntity): BoatEntity {
  const islandId = v.islandId;
  const isl = ISLAND_DEFS[islandId] ?? ISLAND_DEFS.cradle;
  const outX = isl.dockSpot.seaX - isl.centerX;
  const outY = isl.dockSpot.seaY - isl.centerY;
  const len = Math.hypot(outX, outY) || 1;
  const destX = Math.round(isl.dockSpot.seaX + (outX / len) * 280);
  const destY = Math.round(isl.dockSpot.seaY + (outY / len) * 240);

  const boat: BoatEntity = {
    id: `boat_exile_${v.id}_${world.environment.dayCount}`,
    name: `${v.name.split(' ')[0]}'s Exile Skiff`,
    kind: 'migrant_skiff',
    cultureId: v.cultureId,
    homeIslandId: islandId,
    targetIslandId: islandId,
    x: isl.dockSpot.seaX,
    y: isl.dockSpot.seaY,
    targetX: destX,
    targetY: destY,
    yaw: Math.atan2(-(destY - isl.dockSpot.seaY), destX - isl.dockSpot.seaX),
    hp: 100,
    maxHp: 100,
    state: 'returning',
    cargoText: `Departing (Banished): ${v.name}`,
    passengerIds: [v.id],
    tripTimer: 16,
    arrivalId: null,
  };
  world.boats.push(boat);
  v.voyageBoatId = boat.id;
  v.state = 'sailing';
  v.x = boat.x;
  v.y = boat.y;
  v.autonomyReason = `Sailing away into the sky-sea after banishment from ${isl.name}.`;

  emitWorldEvent(world, {
    category: 'migration',
    significance: 'major',
    summary: `${v.name} boarded a departing skiff and sailed away from ${isl.name} in exile.`,
    islandId,
    participantIds: [v.id],
  });

  return boat;
}

/**
 * Steps autonomous community disputes, spontaneous low-honesty misconduct,
 * and physical off-island boat departure for banished villagers.
 */
export function tickGovernance(world: WorldState, dt: number): void {
  ensureGovernanceArrays(world);

  // 1. Advance active disputes from confrontation -> deliberation -> vote resolution
  for (const dispute of world.disputes!) {
    if (dispute.status === 'confrontation') {
      dispute.deliberationTimer -= dt;
      if (dispute.deliberationTimer <= 3.5) {
        dispute.status = 'deliberation';
      }
    } else if (dispute.status === 'deliberation') {
      dispute.deliberationTimer -= dt;
      if (dispute.deliberationTimer <= 0) {
        evaluateAndResolveDispute(world, dispute);
      }
    }
  }

  // 2. Physical banishment route -> shore pier -> departing skiff
  for (const v of world.villagers) {
    if (!v.banished) continue;
    if (v.voyageBoatId) continue;
    const isl = ISLAND_DEFS[v.islandId] ?? ISLAND_DEFS.cradle;
    const pier = getPierApproachPoint(v.islandId);
    v.targetX = pier.x;
    v.targetY = pier.y;
    v.state = 'walking';
    v.autonomyReason = `Banished — walking to ${isl.name} shore to depart by skiff.`;
    const distToDock = Math.hypot(v.x - pier.x, v.y - pier.y);
    if (distToDock <= 28) {
      boardBanishmentSkiff(world, v);
    }
  }

  // 3. Rare organic misconduct when greedy & low-honesty villager is strained (never spammed)
  if (world.villagers.length >= 3 && Math.random() < dt * 0.008) {
    const candidate = world.villagers.find((v) => {
      if (v.banished || v.lifeStage === 'infant' || v.lifeStage === 'child') return false;
      const p = getNpcPersonality(v);
      return p.greed >= 0.68 && p.honesty <= 0.42 && (v.hunger < 44 || v.mood < 42);
    });
    if (candidate) {
      const sameIsleRecent = (world.incidents ?? []).some(
        (inc) => inc.perpetratorId === candidate.id && inc.day === world.environment.dayCount,
      );
      if (!sameIsleRecent) {
        const nearbyPeer = world.villagers.find(
          (other) =>
            other.id !== candidate.id &&
            !other.banished &&
            other.islandId === candidate.islandId &&
            Math.hypot(other.x - candidate.x, other.y - candidate.y) <= WITNESS_RANGE,
        );
        const foragingSkill = getKnowledgeLevel(candidate, 'foraging');
        const kind: OffenseKind = foragingSkill < 25 ? 'theft' : 'hoarding';
        recordMisconductIncident(
          world,
          candidate,
          kind,
          1,
          kind === 'theft'
            ? 'took extra rations from village stores without sharing'
            : 'hid gathered provisions from the community storehouse',
          nearbyPeer ?? null,
        );
      }
    }
  }
}
