import type { SuspicionLevel, SuspicionResult } from './content-suspicion';

export const ACCOUNT_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const MAX_RECENT_POSTS = 50;
export const MAX_POST_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type PostObservationV1 = {
  schemaVersion: 1;
  accountKey: string;
  handle: string;
  postId: string | null;
  publishedAt: number | null;
  observedAt: number;
  textLength: number;
  exactTextHash: string | null;
  simHash: string | null;
  linkDomains: string[];
  mentionCount: number;
  hasMedia: boolean;
  kind: 'post' | 'reply' | 'quote' | 'repost' | 'unknown';
  language: string | null;
  conversationId: string | null;
  hasVisibleParentContext: boolean;
  activeHour: number | null;
  contentHumanScore: number;
  contentCoverage: number;
  contentLevel: SuspicionLevel;
  contentReasons: string[];
  probableSpam: boolean;
};

export type PostSignatureV1 = Omit<PostObservationV1, 'schemaVersion' | 'accountKey' | 'handle'> & {
  observationKey: string;
};

export type ProfileSnapshotV1 = {
  schemaVersion: 1;
  observedAt: number;
  followers: number | null;
  following: number | null;
  commonFollows: number | null;
  relationshipLabel: string | null;
  verified: boolean | null;
};

export type AccountEvidenceV1 = {
  schemaVersion: 1;
  accountKey: string;
  handle: string;
  firstSeenAt: number;
  lastSeenAt: number;
  observationCount: number;
  recentPosts: PostSignatureV1[];
  aggregates: AccountAggregatesV1;
  profile: ProfileSnapshotV1 | null;
};

export type AccountAggregatesV1 = {
  exactDuplicateCount: number;
  nearDuplicateCount: number;
  repeatedLinkDomainCount: number;
  mediaPostCount: number;
  mentionTotal: number;
  distinctConversationCount: number;
  visibleParentContextCount: number;
  postCount: number;
  replyCount: number;
  quoteCount: number;
  repostCount: number;
  activeHourBins: number[];
  gapBins: GapBinsV1;
  timestampedPostCount: number;
  timestampedSpanMs: number;
  textLengthMean: number;
  textLengthStdDev: number;
};

export type GapBinsV1 = {
  underFiveMinutes: number;
  fiveMinutesToOneHour: number;
  oneHourToSixHours: number;
  overSixHours: number;
};

export type AccountScoreV1 = {
  schemaVersion: 1;
  humanScore: number;
  coverage: number;
  level: SuspicionLevel;
  reasons: string[];
  gauges: AccountScoreGaugeV1[];
  observationCount: number;
};

export type AccountScoreGaugeV1 = {
  id: string;
  label: string;
  value: number;
  detail: string;
};

export type ObservePostMessage = {
  type: 'x-ai-signal:observe-post';
  observation: PostObservationV1;
};

export type ObservePostResponse = {
  stored: boolean;
  account: AccountEvidenceV1;
  score: AccountScoreV1;
};

export type UpdateProfileMessage = {
  type: 'x-ai-signal:update-profile';
  accountKey: string;
  profile: ProfileSnapshotV1;
};

export type UpdateProfileResponse = {
  stored: boolean;
  account: AccountEvidenceV1;
  score: AccountScoreV1;
};

export type StorageSummaryV1 = {
  schemaVersion: 1;
  bytesInUse: number;
  accountCount: number;
  observationCount: number;
  maxRecentPostsPerAccount: number;
  maxPostAgeDays: number;
};

export type GetStorageSummaryMessage = {
  type: 'x-ai-signal:get-storage-summary';
};

export type ClearAccountEvidenceMessage = {
  type: 'x-ai-signal:clear-account-evidence';
};

export type ClearAccountEvidenceResponse = {
  deletedAccountCount: number;
};

export function normalizeAccountKey(handle: string): string | null {
  const normalized = handle.trim().toLowerCase();
  return /^@[a-z0-9_]{1,15}$/.test(normalized) ? normalized : null;
}

function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function fnv32(text: string): number {
  let hash = 0x811c9dc5;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function hashText(text: string): string | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  return fnv32(normalized).toString(16).padStart(8, '0');
}

export function simHashText(text: string): string | null {
  const normalized = normalizeText(text);
  if (Array.from(normalized).length < 20) return null;

  const weights = Array.from({ length: 64 }, () => 0);
  const grams: string[] = [];
  for (let index = 0; index <= normalized.length - 4; index += 1) {
    grams.push(normalized.slice(index, index + 4));
  }
  for (const gram of grams.length > 0 ? grams : [normalized]) {
    const low = fnv32(`low:${gram}`);
    const high = fnv32(`high:${gram}`);
    const combined = BigInt(low) | (BigInt(high) << 32n);
    for (let bit = 0; bit < 64; bit += 1) {
      weights[bit] = (weights[bit] ?? 0) + (combined & (1n << BigInt(bit)) ? 1 : -1);
    }
  }

  let fingerprint = 0n;
  weights.forEach((weight, bit) => {
    if (weight > 0) fingerprint |= 1n << BigInt(bit);
  });

  return fingerprint.toString(16).padStart(16, '0');
}

export function simHashDistance(left: string | null, right: string | null): number | null {
  if (!left || !right) return null;

  let difference = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (difference > 0n) {
    distance += Number(difference & 1n);
    difference >>= 1n;
  }
  return distance;
}

export type PostObservationContext = {
  linkDomains?: string[];
  mentionCount?: number;
  hasMedia?: boolean;
  kind?: PostObservationV1['kind'];
  language?: string | null;
  conversationId?: string | null;
  hasVisibleParentContext?: boolean;
  activeHour?: number | null;
};

export function createPostObservation(
  handle: string,
  text: string | null,
  postId: string | null,
  publishedAt: number | null,
  result: SuspicionResult,
  probableSpam = false,
  contextOrObservedAt: PostObservationContext | number = {},
  observedAt = Date.now(),
): PostObservationV1 | null {
  const accountKey = normalizeAccountKey(handle);
  if (!accountKey) return null;
  const context = typeof contextOrObservedAt === 'number' ? {} : contextOrObservedAt;
  const observationTime =
    typeof contextOrObservedAt === 'number' ? contextOrObservedAt : observedAt;

  return {
    schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
    accountKey,
    handle,
    postId,
    publishedAt,
    observedAt: observationTime,
    textLength: Array.from(text ?? '').length,
    exactTextHash: text ? hashText(text) : null,
    simHash: text ? simHashText(text) : null,
    linkDomains: [...new Set(context.linkDomains ?? [])].sort(),
    mentionCount: context.mentionCount ?? 0,
    hasMedia: context.hasMedia ?? false,
    kind: context.kind ?? 'unknown',
    language: context.language ?? null,
    conversationId: context.conversationId ?? null,
    hasVisibleParentContext: context.hasVisibleParentContext ?? false,
    activeHour: context.activeHour ?? activeHourFromTimestamp(publishedAt),
    contentHumanScore: result.humanScore,
    contentCoverage: result.coverage,
    contentLevel: result.level,
    contentReasons: result.reasons,
    probableSpam,
  };
}

function observationKey(observation: PostObservationV1): string {
  if (observation.postId) return `post:${observation.postId}`;

  return [
    'fallback',
    observation.accountKey,
    observation.publishedAt ?? 'unknown-time',
    observation.exactTextHash ?? `length-${observation.textLength}`,
  ].join(':');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableActiveHour(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23)
  );
}

function isPostSignatureV1(value: unknown): value is PostSignatureV1 {
  if (!value || typeof value !== 'object') return false;
  const post = value as Partial<PostSignatureV1>;

  return (
    typeof post.observationKey === 'string' &&
    isNullableString(post.postId) &&
    (post.publishedAt === null || isFiniteNumber(post.publishedAt)) &&
    isFiniteNumber(post.observedAt) &&
    isFiniteNumber(post.textLength) &&
    isNullableString(post.exactTextHash) &&
    isNullableString(post.simHash) &&
    Array.isArray(post.linkDomains) &&
    post.linkDomains.every((domain) => typeof domain === 'string') &&
    isFiniteNumber(post.mentionCount) &&
    typeof post.hasMedia === 'boolean' &&
    ['post', 'reply', 'quote', 'repost', 'unknown'].includes(post.kind ?? '') &&
    isNullableString(post.language) &&
    isNullableString(post.conversationId) &&
    typeof post.hasVisibleParentContext === 'boolean' &&
    isNullableActiveHour(post.activeHour) &&
    isFiniteNumber(post.contentHumanScore) &&
    post.contentHumanScore >= 0 &&
    post.contentHumanScore <= 100 &&
    isFiniteNumber(post.contentCoverage) &&
    post.contentCoverage >= 0 &&
    post.contentCoverage <= 100 &&
    ['unknown', 'low', 'medium', 'high'].includes(post.contentLevel ?? '') &&
    Array.isArray(post.contentReasons) &&
    post.contentReasons.every((reason) => typeof reason === 'string') &&
    typeof post.probableSpam === 'boolean'
  );
}

function isProfileSnapshotV1(value: unknown): value is ProfileSnapshotV1 {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<ProfileSnapshotV1>;
  const nullableNumber = (candidate: unknown) => candidate === null || isFiniteNumber(candidate);

  return (
    profile.schemaVersion === ACCOUNT_EVIDENCE_SCHEMA_VERSION &&
    isFiniteNumber(profile.observedAt) &&
    nullableNumber(profile.followers) &&
    nullableNumber(profile.following) &&
    nullableNumber(profile.commonFollows) &&
    isNullableString(profile.relationshipLabel) &&
    (profile.verified === null || typeof profile.verified === 'boolean')
  );
}

export function isPostObservationV1(value: unknown): value is PostObservationV1 {
  if (!value || typeof value !== 'object') return false;
  const observation = value as Partial<PostObservationV1>;

  return (
    observation.schemaVersion === ACCOUNT_EVIDENCE_SCHEMA_VERSION &&
    typeof observation.accountKey === 'string' &&
    normalizeAccountKey(observation.accountKey) === observation.accountKey &&
    typeof observation.handle === 'string' &&
    (observation.postId === null || typeof observation.postId === 'string') &&
    (observation.publishedAt === null || isFiniteNumber(observation.publishedAt)) &&
    isFiniteNumber(observation.observedAt) &&
    isFiniteNumber(observation.textLength) &&
    (observation.exactTextHash === null || typeof observation.exactTextHash === 'string') &&
    isNullableString(observation.simHash) &&
    Array.isArray(observation.linkDomains) &&
    observation.linkDomains.every((domain) => typeof domain === 'string') &&
    isFiniteNumber(observation.mentionCount) &&
    typeof observation.hasMedia === 'boolean' &&
    ['post', 'reply', 'quote', 'repost', 'unknown'].includes(observation.kind ?? '') &&
    isNullableString(observation.language) &&
    isNullableString(observation.conversationId) &&
    typeof observation.hasVisibleParentContext === 'boolean' &&
    isNullableActiveHour(observation.activeHour) &&
    isFiniteNumber(observation.contentHumanScore) &&
    observation.contentHumanScore >= 0 &&
    observation.contentHumanScore <= 100 &&
    isFiniteNumber(observation.contentCoverage) &&
    observation.contentCoverage >= 0 &&
    observation.contentCoverage <= 100 &&
    ['unknown', 'low', 'medium', 'high'].includes(observation.contentLevel ?? '') &&
    Array.isArray(observation.contentReasons) &&
    observation.contentReasons.every((reason) => typeof reason === 'string') &&
    typeof observation.probableSpam === 'boolean'
  );
}

export function isAccountEvidenceV1(value: unknown): value is AccountEvidenceV1 {
  if (!value || typeof value !== 'object') return false;
  const account = value as Partial<AccountEvidenceV1>;

  return (
    account.schemaVersion === ACCOUNT_EVIDENCE_SCHEMA_VERSION &&
    typeof account.accountKey === 'string' &&
    normalizeAccountKey(account.accountKey) === account.accountKey &&
    typeof account.handle === 'string' &&
    isFiniteNumber(account.firstSeenAt) &&
    isFiniteNumber(account.lastSeenAt) &&
    isFiniteNumber(account.observationCount) &&
    account.observationCount >= 0 &&
    Array.isArray(account.recentPosts) &&
    account.recentPosts.every(isPostSignatureV1) &&
    isAccountAggregatesV1(account.aggregates) &&
    (account.profile === null || isProfileSnapshotV1(account.profile))
  );
}

function isAccountAggregatesV1(value: unknown): value is AccountAggregatesV1 {
  if (!value || typeof value !== 'object') return false;
  const aggregates = value as Partial<AccountAggregatesV1>;

  return (
    isFiniteNumber(aggregates.exactDuplicateCount) &&
    isFiniteNumber(aggregates.nearDuplicateCount) &&
    isFiniteNumber(aggregates.repeatedLinkDomainCount) &&
    isFiniteNumber(aggregates.mediaPostCount) &&
    isFiniteNumber(aggregates.mentionTotal) &&
    isFiniteNumber(aggregates.distinctConversationCount) &&
    isFiniteNumber(aggregates.visibleParentContextCount) &&
    isFiniteNumber(aggregates.postCount) &&
    isFiniteNumber(aggregates.replyCount) &&
    isFiniteNumber(aggregates.quoteCount) &&
    isFiniteNumber(aggregates.repostCount) &&
    Array.isArray(aggregates.activeHourBins) &&
    aggregates.activeHourBins.length === 24 &&
    aggregates.activeHourBins.every(isFiniteNumber) &&
    isGapBinsV1(aggregates.gapBins) &&
    isFiniteNumber(aggregates.timestampedPostCount) &&
    isFiniteNumber(aggregates.timestampedSpanMs) &&
    isFiniteNumber(aggregates.textLengthMean) &&
    isFiniteNumber(aggregates.textLengthStdDev)
  );
}

function isGapBinsV1(value: unknown): value is GapBinsV1 {
  if (!value || typeof value !== 'object') return false;
  const bins = value as Partial<GapBinsV1>;

  return (
    isFiniteNumber(bins.underFiveMinutes) &&
    isFiniteNumber(bins.fiveMinutesToOneHour) &&
    isFiniteNumber(bins.oneHourToSixHours) &&
    isFiniteNumber(bins.overSixHours)
  );
}

export function migrateAccountEvidence(value: unknown): AccountEvidenceV1 | null {
  if (isAccountEvidenceV1(value)) return value;
  if (!value || typeof value !== 'object') return null;

  const legacy = value as Omit<Partial<AccountEvidenceV1>, 'schemaVersion'> & {
    schemaVersion?: number;
  };
  if (
    legacy.schemaVersion !== undefined &&
    legacy.schemaVersion !== 0 &&
    legacy.schemaVersion !== 1
  ) {
    return null;
  }
  if (!Array.isArray(legacy.recentPosts)) return null;

  const migratedPosts = legacy.recentPosts.map((post) => {
    if (!post || typeof post !== 'object') return post;
    return {
      ...post,
      probableSpam:
        typeof (post as Partial<PostSignatureV1>).probableSpam === 'boolean'
          ? (post as Partial<PostSignatureV1>).probableSpam
          : false,
      simHash:
        typeof (post as Partial<PostSignatureV1>).simHash === 'string'
          ? (post as Partial<PostSignatureV1>).simHash
          : null,
      linkDomains: Array.isArray((post as Partial<PostSignatureV1>).linkDomains)
        ? (post as Partial<PostSignatureV1>).linkDomains
        : [],
      mentionCount:
        typeof (post as Partial<PostSignatureV1>).mentionCount === 'number'
          ? (post as Partial<PostSignatureV1>).mentionCount
          : 0,
      hasMedia:
        typeof (post as Partial<PostSignatureV1>).hasMedia === 'boolean'
          ? (post as Partial<PostSignatureV1>).hasMedia
          : false,
      kind: (post as Partial<PostSignatureV1>).kind ?? 'unknown',
      language: (post as Partial<PostSignatureV1>).language ?? null,
      conversationId:
        typeof (post as Partial<PostSignatureV1>).conversationId === 'string'
          ? (post as Partial<PostSignatureV1>).conversationId
          : null,
      hasVisibleParentContext:
        typeof (post as Partial<PostSignatureV1>).hasVisibleParentContext === 'boolean'
          ? (post as Partial<PostSignatureV1>).hasVisibleParentContext
          : false,
      activeHour:
        typeof (post as Partial<PostSignatureV1>).activeHour === 'number'
          ? (post as Partial<PostSignatureV1>).activeHour
          : activeHourFromTimestamp((post as Partial<PostSignatureV1>).publishedAt ?? null),
    };
  });
  const legacyAggregates = isAccountAggregatesV1(legacy.aggregates)
    ? legacy.aggregates
    : summarizePosts(migratedPosts.filter(isPostSignatureV1));
  const migrated = {
    ...legacy,
    schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
    recentPosts: migratedPosts,
    aggregates: legacyAggregates,
    profile: legacy.profile ?? null,
  };

  return isAccountEvidenceV1(migrated) ? migrated : null;
}

export function mergePostObservation(
  current: AccountEvidenceV1 | null,
  observation: PostObservationV1,
  now = Date.now(),
): { account: AccountEvidenceV1; stored: boolean } {
  const key = observationKey(observation);
  const previousPosts = current?.accountKey === observation.accountKey ? current.recentPosts : [];

  if (previousPosts.some((post) => post.observationKey === key)) {
    return {
      account: current ?? createEmptyAccount(observation),
      stored: false,
    };
  }

  const signature: PostSignatureV1 = {
    observationKey: key,
    postId: observation.postId,
    publishedAt: observation.publishedAt,
    observedAt: observation.observedAt,
    textLength: observation.textLength,
    exactTextHash: observation.exactTextHash,
    simHash: observation.simHash,
    linkDomains: observation.linkDomains,
    mentionCount: observation.mentionCount,
    hasMedia: observation.hasMedia,
    kind: observation.kind,
    language: observation.language,
    conversationId: observation.conversationId,
    hasVisibleParentContext: observation.hasVisibleParentContext,
    activeHour: observation.activeHour,
    contentHumanScore: observation.contentHumanScore,
    contentCoverage: observation.contentCoverage,
    contentLevel: observation.contentLevel,
    contentReasons: observation.contentReasons,
    probableSpam: observation.probableSpam,
  };
  const cutoff = now - MAX_POST_AGE_MS;
  const recentPosts = [...previousPosts, signature]
    .filter((post) => post.observedAt >= cutoff)
    .sort((left, right) => left.observedAt - right.observedAt)
    .slice(-MAX_RECENT_POSTS);

  return {
    account: {
      schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
      accountKey: observation.accountKey,
      handle: observation.handle,
      firstSeenAt: current?.firstSeenAt ?? observation.observedAt,
      lastSeenAt: Math.max(current?.lastSeenAt ?? 0, observation.observedAt),
      observationCount: (current?.observationCount ?? 0) + 1,
      recentPosts,
      aggregates: summarizePosts(recentPosts),
      profile: current?.profile ?? null,
    },
    stored: true,
  };
}

export function mergeProfileSnapshot(
  current: AccountEvidenceV1 | null,
  accountKey: string,
  profile: ProfileSnapshotV1,
  handle = accountKey,
  now = Date.now(),
): { account: AccountEvidenceV1; stored: boolean } | null {
  const normalizedAccountKey = normalizeAccountKey(accountKey);
  if (!normalizedAccountKey) return null;

  const previousProfile = current?.profile;
  const mergedProfile: ProfileSnapshotV1 = {
    schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
    observedAt: profile.observedAt,
    followers: profile.followers ?? previousProfile?.followers ?? null,
    following: profile.following ?? previousProfile?.following ?? null,
    commonFollows: profile.commonFollows ?? previousProfile?.commonFollows ?? null,
    relationshipLabel: profile.relationshipLabel ?? previousProfile?.relationshipLabel ?? null,
    verified: profile.verified ?? previousProfile?.verified ?? null,
  };
  const hasChanged =
    !previousProfile ||
    previousProfile.followers !== mergedProfile.followers ||
    previousProfile.following !== mergedProfile.following ||
    previousProfile.commonFollows !== mergedProfile.commonFollows ||
    previousProfile.relationshipLabel !== mergedProfile.relationshipLabel ||
    previousProfile.verified !== mergedProfile.verified;

  const firstSeenAt = current?.firstSeenAt ?? Math.min(mergedProfile.observedAt, now);
  const lastSeenAt = Math.max(current?.lastSeenAt ?? 0, mergedProfile.observedAt, now);
  const account: AccountEvidenceV1 = {
    schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
    accountKey: normalizedAccountKey,
    handle: current?.handle ?? handle,
    firstSeenAt,
    lastSeenAt,
    observationCount: current?.observationCount ?? 0,
    recentPosts: current?.recentPosts ?? [],
    aggregates: current?.aggregates ?? summarizePosts([]),
    profile: mergedProfile,
  };

  return { account, stored: hasChanged };
}

function levelForAccountScore(humanScore: number, coverage: number): SuspicionLevel {
  if (coverage === 0) return 'unknown';
  if (humanScore <= 25) return 'high';
  if (humanScore <= 50) return 'medium';
  return 'low';
}

export function scoreAccountEvidence(account: AccountEvidenceV1): AccountScoreV1 {
  const eligiblePosts = account.recentPosts.filter(
    (post) => post.contentCoverage > 0 || post.probableSpam,
  );

  if (eligiblePosts.length === 0) {
    const profileOnly = scoreProfileOnly(account);
    if (profileOnly) return profileOnly;

    return {
      schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
      humanScore: 50,
      coverage: 0,
      level: 'unknown',
      reasons: ['No scoreable account evidence has been observed yet.'],
      gauges: [],
      observationCount: account.observationCount,
    };
  }

  const probableSpam = eligiblePosts.some((post) => post.probableSpam);
  const exactDuplicateCount = account.aggregates.exactDuplicateCount;
  const nearDuplicateCount = account.aggregates.nearDuplicateCount;
  const repeatedLinkDomainCount = account.aggregates.repeatedLinkDomainCount;
  const postWeightTotal = eligiblePosts.reduce((total, post) => total + postWeight(post), 0);
  const baseScoreTotal = eligiblePosts.reduce(
    (total, post) =>
      total +
      Math.min(100, post.contentHumanScore + (post.probableSpam ? 20 : 0)) * postWeight(post),
    0,
  );
  const baseScore = baseScoreTotal / Math.max(1, postWeightTotal);
  const duplicatePenalty = duplicatePatternPenalty(account);
  const linkPenalty = repeatedLinkDomainPenalty(account);
  const mentionPenalty = mentionPatternPenalty(account);
  const textShapeAdjustment = textShapeScoreAdjustment(account);
  const mediaAdjustment = mediaScoreAdjustment(account);
  const conversationAdjustment = conversationScoreAdjustment(account);
  const timingAdjustment = timingScoreAdjustment(account);
  const profileAdjustment = profileScoreAdjustment(account.profile);
  const rawHumanScore =
    baseScore -
    (probableSpam ? 20 : 0) -
    duplicatePenalty -
    linkPenalty -
    mentionPenalty +
    textShapeAdjustment +
    mediaAdjustment +
    conversationAdjustment +
    timingAdjustment +
    profileAdjustment;
  const humanScoreCap = maximumHumanScoreFromEvidence(account);
  const humanScore = Math.max(0, Math.min(humanScoreCap, Math.round(rawHumanScore)));
  const maximumPostCoverage = Math.max(...eligiblePosts.map((post) => post.contentCoverage));
  const profileCoverage = profileCoverageContribution(account.profile);
  const coverage = Math.min(
    100,
    Math.max(
      maximumPostCoverage,
      10 +
        Math.min(45, eligiblePosts.length * 10) +
        (probableSpam ? 10 : 0) +
        (exactDuplicateCount > 0 ? 10 : 0) +
        (nearDuplicateCount > 0 ? 10 : 0) +
        (repeatedLinkDomainCount > 0 ? 5 : 0) +
        (account.aggregates.distinctConversationCount >= 2 ? 5 : 0) +
        (hasTimingSample(account) ? 10 : 0) +
        profileCoverage,
    ),
  );
  const reasons = [`Based on ${eligiblePosts.length} locally observed post(s).`];

  if (probableSpam) {
    reasons.push('At least one reply was shown behind X’s probable-spam control.');
  }
  if (exactDuplicateCount > 0) {
    reasons.push(`${exactDuplicateCount} repeated exact post signature(s) observed.`);
  }
  if (nearDuplicateCount > 0) {
    reasons.push(`${nearDuplicateCount} near-duplicate post pair(s) observed.`);
  }
  if (repeatedLinkDomainCount > 0) {
    reasons.push(`${repeatedLinkDomainCount} repeated link domain signal(s) observed.`);
  }
  if (mentionPenalty > 0) {
    reasons.push('High mention density was observed across recent posts.');
  }
  if (mediaAdjustment > 0) {
    reasons.push('Some recent posts include media, a weak human-compatible signal.');
  }
  if (conversationAdjustment < 0) {
    reasons.push('Recent replies are concentrated in a small number of rendered conversations.');
  } else if (conversationAdjustment > 0) {
    reasons.push('Recent replies span multiple rendered conversations with visible context.');
  }
  if (timingAdjustment < 0) {
    reasons.push('Sampled timestamped posts include unusually tight posting gaps.');
  } else if (timingAdjustment > 0) {
    reasons.push('Sampled timestamped posts show varied activity gaps.');
  }
  if (textShapeAdjustment < 0) {
    reasons.push('Recent posts have unusually similar text lengths.');
  } else if (textShapeAdjustment > 0) {
    reasons.push('Recent posts show varied text lengths.');
  }
  if (profileAdjustment !== 0) {
    reasons.push('Rendered profile-card context affected the account score.');
  }
  if (humanScore < Math.round(rawHumanScore)) {
    reasons.push(
      'The score was capped because high confidence requires stronger positive evidence.',
    );
  }

  return {
    schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
    humanScore,
    coverage,
    level: levelForAccountScore(humanScore, coverage),
    reasons,
    gauges: scoreGauges(account, humanScore, coverage),
    observationCount: account.observationCount,
  };
}

function scoreProfileOnly(account: AccountEvidenceV1): AccountScoreV1 | null {
  const adjustment = profileScoreAdjustment(account.profile);
  const coverage = profileCoverageContribution(account.profile);
  if (coverage === 0) return null;

  const humanScore = Math.max(0, Math.min(100, Math.round(50 + adjustment)));

  return {
    schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
    humanScore,
    coverage,
    level: levelForAccountScore(humanScore, coverage),
    reasons: ['Only rendered profile-card context has been observed so far.'],
    gauges: scoreGauges(account, humanScore, coverage),
    observationCount: account.observationCount,
  };
}

function createGauge(
  id: string,
  label: string,
  value: number,
  detail: string,
): AccountScoreGaugeV1 {
  return {
    id,
    label,
    value: Math.max(0, Math.min(100, Math.round(value))),
    detail,
  };
}

function scoreGauges(
  account: AccountEvidenceV1,
  humanScore: number,
  coverage: number,
): AccountScoreGaugeV1[] {
  const gauges: AccountScoreGaugeV1[] = [
    createGauge('final', 'Final score', humanScore, 'Combined bounded account score.'),
    createGauge('reliability', 'Reliability', coverage, 'How much local evidence supports it.'),
  ];
  const profileRatioGauge = followerRatioGauge(account.profile);
  if (profileRatioGauge) gauges.push(profileRatioGauge);
  const commonFollowsGauge = commonFollowsGaugeForProfile(account.profile);
  if (commonFollowsGauge) gauges.push(commonFollowsGauge);
  const replyMixGauge = replyMixGaugeForAccount(account);
  if (replyMixGauge) gauges.push(replyMixGauge);
  const repetitionGauge = repetitionGaugeForAccount(account);
  if (repetitionGauge) gauges.push(repetitionGauge);
  const linkGauge = linkGaugeForAccount(account);
  if (linkGauge) gauges.push(linkGauge);
  const mentionGauge = mentionGaugeForAccount(account);
  if (mentionGauge) gauges.push(mentionGauge);
  const textVarietyGauge = textVarietyGaugeForAccount(account);
  if (textVarietyGauge) gauges.push(textVarietyGauge);
  const timingGauge = timingGaugeForAccount(account);
  if (timingGauge) gauges.push(timingGauge);
  const mediaGauge = mediaGaugeForAccount(account);
  if (mediaGauge) gauges.push(mediaGauge);

  return gauges;
}

function followerRatioGauge(profile: ProfileSnapshotV1 | null): AccountScoreGaugeV1 | null {
  if (!profile || profile.followers === null || profile.following === null) return null;

  const ratio = profile.following > 0 ? profile.followers / profile.following : profile.followers;
  let value = 50;
  if (profile.followers === 0 && profile.following >= 200) value = 25;
  else if (profile.following >= 2_000 && profile.followers < 200) value = 25;
  else if (profile.following >= 1_000 && ratio < 0.08) value = 35;
  else if (profile.followers >= 1_000_000 && ratio >= 50) value = 90;
  else if (profile.followers >= 100_000 && ratio >= 20) value = 85;
  else if (profile.followers >= 10_000 && ratio >= 5) value = 78;
  else if (profile.followers >= 50 && ratio >= 0.2 && ratio <= 20) value = 65;
  else if (profile.followers >= 1_000) value = 60;

  return createGauge(
    'follower-ratio',
    'Follower ratio',
    value,
    `${profile.followers} followers / ${profile.following} following (${ratio.toFixed(1)}:1).`,
  );
}

function commonFollowsGaugeForProfile(
  profile: ProfileSnapshotV1 | null,
): AccountScoreGaugeV1 | null {
  if (!profile || profile.commonFollows === null) return null;

  const value =
    profile.commonFollows === 0
      ? 50
      : Math.min(85, 58 + Math.round(Math.sqrt(profile.commonFollows) * 5));

  return createGauge(
    'common-follows',
    'Common follows',
    value,
    `${profile.commonFollows} rendered common follow(s).`,
  );
}

function replyMixGaugeForAccount(account: AccountEvidenceV1): AccountScoreGaugeV1 | null {
  const postCount = account.recentPosts.length;
  if (postCount < 3) return null;

  const replyRatio = account.aggregates.replyCount / postCount;
  let value = 50;
  if (
    postCount >= 8 &&
    replyRatio >= 0.85 &&
    account.aggregates.distinctConversationCount > 0 &&
    account.aggregates.distinctConversationCount <= 2
  ) {
    value = 35;
  } else if (
    replyRatio >= 0.45 &&
    account.aggregates.distinctConversationCount >= 4 &&
    account.aggregates.visibleParentContextCount >= 3
  ) {
    value = 72;
  } else if (replyRatio > 0 && account.aggregates.distinctConversationCount >= 2) {
    value = 58;
  }

  return createGauge(
    'reply-mix',
    'Tweet/reply mix',
    value,
    `${account.aggregates.replyCount}/${postCount} observed post(s) are replies across ${account.aggregates.distinctConversationCount} conversation(s).`,
  );
}

function repetitionGaugeForAccount(account: AccountEvidenceV1): AccountScoreGaugeV1 | null {
  if (account.recentPosts.length < 2) return null;

  const penalty = duplicatePatternPenalty(account);
  return createGauge(
    'repetition',
    'Repetition',
    75 - penalty,
    `${account.aggregates.exactDuplicateCount} exact and ${account.aggregates.nearDuplicateCount} near-duplicate signal(s).`,
  );
}

function linkGaugeForAccount(account: AccountEvidenceV1): AccountScoreGaugeV1 | null {
  const linkedPostCount = account.recentPosts.filter((post) => post.linkDomains.length > 0).length;
  if (linkedPostCount === 0) return null;

  return createGauge(
    'links',
    'Link pattern',
    account.aggregates.repeatedLinkDomainCount > 0 ? 45 : 62,
    `${linkedPostCount} linked post(s), ${account.aggregates.repeatedLinkDomainCount} repeated domain signal(s).`,
  );
}

function mentionGaugeForAccount(account: AccountEvidenceV1): AccountScoreGaugeV1 | null {
  const postCount = account.recentPosts.length;
  if (postCount === 0 || account.aggregates.mentionTotal === 0) return null;

  const average = account.aggregates.mentionTotal / postCount;
  return createGauge(
    'mentions',
    'Mention density',
    average <= 1.5 ? 65 : 55 - mentionPatternPenalty(account),
    `${average.toFixed(1)} mention(s) per observed post.`,
  );
}

function textVarietyGaugeForAccount(account: AccountEvidenceV1): AccountScoreGaugeV1 | null {
  if (account.recentPosts.length < 5 || account.aggregates.textLengthMean < 20) return null;

  const adjustment = textShapeScoreAdjustment(account);
  return createGauge(
    'text-variety',
    'Text variety',
    adjustment < 0 ? 38 : adjustment > 0 ? 66 : 52,
    `Average length ${Math.round(account.aggregates.textLengthMean)}, variance ${Math.round(account.aggregates.textLengthStdDev)}.`,
  );
}

function timingGaugeForAccount(account: AccountEvidenceV1): AccountScoreGaugeV1 | null {
  if (!hasTimingSample(account)) return null;

  const adjustment = timingScoreAdjustment(account);
  return createGauge(
    'timing',
    'Timing gaps',
    adjustment < 0 ? 40 : adjustment > 0 ? 66 : 52,
    `${account.aggregates.timestampedPostCount} timestamped post(s) spanning ${Math.round(account.aggregates.timestampedSpanMs / 3_600_000)}h.`,
  );
}

function mediaGaugeForAccount(account: AccountEvidenceV1): AccountScoreGaugeV1 | null {
  if (account.recentPosts.length === 0 || account.aggregates.mediaPostCount === 0) return null;

  return createGauge(
    'media',
    'Media mix',
    58 +
      Math.min(8, Math.round((account.aggregates.mediaPostCount / account.recentPosts.length) * 8)),
    `${account.aggregates.mediaPostCount}/${account.recentPosts.length} observed post(s) include media.`,
  );
}

function maximumHumanScoreFromEvidence(account: AccountEvidenceV1): number {
  let cap = 68;
  const postCount = account.recentPosts.length;

  if (postCount >= 5) cap += 6;
  if (postCount >= 10) cap += 4;
  if (
    account.aggregates.distinctConversationCount >= 4 &&
    account.aggregates.visibleParentContextCount >= 3
  ) {
    cap += 8;
  }
  if (hasTimingSample(account) && timingScoreAdjustment(account) >= 0) cap += 3;
  if (account.aggregates.mediaPostCount > 0 && postCount >= 3) cap += 3;
  if (textShapeScoreAdjustment(account) > 0) cap += 4;

  const profile = account.profile;
  if (profile) {
    if (profile.relationshipLabel) cap += 5;
    if (profile.verified) cap += 2;
    if (profile.commonFollows !== null && profile.commonFollows > 0) {
      cap += profile.commonFollows >= 100 ? 12 : 7;
    }
    if (profile.followers !== null && profile.following !== null) {
      const ratio =
        profile.following > 0 ? profile.followers / profile.following : profile.followers;
      if (profile.followers >= 1_000_000 && ratio >= 50) cap += 8;
      else if (profile.followers >= 100_000 && ratio >= 20) cap += 6;
      else if (profile.followers >= 10_000 && ratio >= 5) cap += 4;
    } else if (profile.followers !== null && profile.followers >= 100_000) {
      cap += 4;
    }
  }

  return Math.min(100, cap);
}

function postWeight(post: PostSignatureV1): number {
  return Math.max(1, post.contentCoverage / 20) + (post.probableSpam ? 0.5 : 0);
}

function duplicatePatternPenalty(account: AccountEvidenceV1): number {
  const postCount = Math.max(1, account.recentPosts.length);
  const exactRate = account.aggregates.exactDuplicateCount / postCount;
  const nearRate = account.aggregates.nearDuplicateCount / postCount;
  const exactPenalty =
    account.aggregates.exactDuplicateCount === 0 ? 0 : 8 + Math.min(32, exactRate * 45);
  const nearPenalty =
    account.aggregates.nearDuplicateCount === 0 ? 0 : 6 + Math.min(28, nearRate * 38);

  return Math.min(58, exactPenalty + nearPenalty);
}

function repeatedLinkDomainPenalty(account: AccountEvidenceV1): number {
  if (account.aggregates.repeatedLinkDomainCount === 0) return 0;

  const postCount = Math.max(1, account.recentPosts.length);
  const linkedPostCount = account.recentPosts.filter((post) => post.linkDomains.length > 0).length;
  const linkedPostRatio = linkedPostCount / postCount;

  return Math.min(
    28,
    account.aggregates.repeatedLinkDomainCount * 7 + Math.round(linkedPostRatio * 12),
  );
}

function mentionPatternPenalty(account: AccountEvidenceV1): number {
  const postCount = Math.max(1, account.recentPosts.length);
  const mentionAverage = account.aggregates.mentionTotal / postCount;
  if (mentionAverage <= 1.5) return 0;

  return Math.min(20, Math.round((mentionAverage - 1.5) * 7));
}

function mediaScoreAdjustment(account: AccountEvidenceV1): number {
  const postCount = account.recentPosts.length;
  if (postCount === 0 || account.aggregates.mediaPostCount === 0) return 0;

  const mediaRatio = account.aggregates.mediaPostCount / postCount;
  if (mediaRatio > 0.85 && postCount >= 6) return 1;

  return Math.min(6, 2 + Math.round(mediaRatio * 5));
}

function textShapeScoreAdjustment(account: AccountEvidenceV1): number {
  if (account.recentPosts.length < 5) return 0;
  if (account.aggregates.textLengthMean < 20) return 0;
  if (account.aggregates.textLengthStdDev <= 8) return -12;
  if (account.aggregates.textLengthStdDev >= 55) return 3;

  return 0;
}

function conversationScoreAdjustment(account: AccountEvidenceV1): number {
  const postCount = account.recentPosts.length;
  if (postCount < 5) return 0;

  const replyRatio = account.aggregates.replyCount / postCount;
  if (
    postCount >= 8 &&
    replyRatio >= 0.85 &&
    account.aggregates.distinctConversationCount > 0 &&
    account.aggregates.distinctConversationCount <= 2
  ) {
    return -8;
  }

  if (
    replyRatio >= 0.45 &&
    account.aggregates.distinctConversationCount >= 4 &&
    account.aggregates.visibleParentContextCount >= 3
  ) {
    return 5;
  }

  return 0;
}

function hasTimingSample(account: AccountEvidenceV1): boolean {
  return (
    account.aggregates.timestampedPostCount >= 8 &&
    account.aggregates.timestampedSpanMs >= 6 * 60 * 60 * 1000
  );
}

function timingScoreAdjustment(account: AccountEvidenceV1): number {
  if (!hasTimingSample(account)) return 0;

  const gapCount =
    account.aggregates.gapBins.underFiveMinutes +
    account.aggregates.gapBins.fiveMinutesToOneHour +
    account.aggregates.gapBins.oneHourToSixHours +
    account.aggregates.gapBins.overSixHours;
  if (gapCount === 0) return 0;

  const tightGapRatio = account.aggregates.gapBins.underFiveMinutes / gapCount;
  if (tightGapRatio >= 0.65 && account.aggregates.gapBins.underFiveMinutes >= 5) return -10;
  if (
    account.aggregates.gapBins.oneHourToSixHours > 0 &&
    account.aggregates.gapBins.overSixHours > 0 &&
    tightGapRatio <= 0.35
  ) {
    return 4;
  }

  return 0;
}

function profileCoverageContribution(profile: ProfileSnapshotV1 | null): number {
  if (!profile) return 0;

  let coverage = 0;
  if (profile.followers !== null) coverage += 8;
  if (profile.following !== null) coverage += 8;
  if (profile.commonFollows !== null) coverage += 10;
  if (profile.relationshipLabel) coverage += 8;
  if (profile.verified !== null) coverage += 4;

  return Math.min(30, coverage);
}

function profileScoreAdjustment(profile: ProfileSnapshotV1 | null): number {
  if (!profile) return 0;

  let adjustment = 0;

  if (profile.relationshipLabel) adjustment += 5;
  if (profile.verified) adjustment += 2;
  if (profile.commonFollows !== null && profile.commonFollows > 0) {
    adjustment += Math.min(10, 3 + Math.round(Math.sqrt(profile.commonFollows)));
  }
  if (profile.followers !== null) {
    if (profile.followers >= 100_000) adjustment += 7;
    else if (profile.followers >= 10_000) adjustment += 5;
    else if (profile.followers >= 1_000) adjustment += 3;
  }
  if (profile.followers !== null && profile.following !== null) {
    if (profile.followers === 0 && profile.following >= 200) adjustment -= 10;
    const ratio = profile.following > 0 ? profile.followers / profile.following : profile.followers;
    if (profile.following >= 2_000 && profile.followers < 200) adjustment -= 12;
    else if (profile.following >= 1_000 && ratio < 0.08) adjustment -= 8;
    else if (profile.followers >= 50 && ratio >= 0.2 && ratio <= 20) adjustment += 3;
  }

  return Math.max(-20, Math.min(20, adjustment));
}

function activeHourFromTimestamp(timestamp: number | null): number | null {
  if (timestamp === null || !Number.isFinite(timestamp)) return null;
  return new Date(timestamp).getUTCHours();
}

function createEmptyAccount(observation: PostObservationV1): AccountEvidenceV1 {
  return {
    schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
    accountKey: observation.accountKey,
    handle: observation.handle,
    firstSeenAt: observation.observedAt,
    lastSeenAt: observation.observedAt,
    observationCount: 0,
    recentPosts: [],
    aggregates: summarizePosts([]),
    profile: null,
  };
}

function summarizePosts(posts: PostSignatureV1[]): AccountAggregatesV1 {
  const exactHashCounts = new Map<string, number>();
  const linkDomainCounts = new Map<string, number>();
  const conversationIds = new Set<string>();
  const activeHourBins = Array.from({ length: 24 }, () => 0);
  const gapBins: GapBinsV1 = {
    underFiveMinutes: 0,
    fiveMinutesToOneHour: 0,
    oneHourToSixHours: 0,
    overSixHours: 0,
  };
  let mediaPostCount = 0;
  let mentionTotal = 0;
  let nearDuplicateCount = 0;
  let visibleParentContextCount = 0;
  let postCount = 0;
  let replyCount = 0;
  let quoteCount = 0;
  let repostCount = 0;
  const textLengths = posts.map((post) => post.textLength);
  const timestampedPosts = posts
    .filter((post) => post.publishedAt !== null)
    .sort((left, right) => (left.publishedAt ?? 0) - (right.publishedAt ?? 0));

  posts.forEach((post, index) => {
    if (post.exactTextHash && post.textLength >= 20) {
      exactHashCounts.set(post.exactTextHash, (exactHashCounts.get(post.exactTextHash) ?? 0) + 1);
    }
    post.linkDomains.forEach((domain) => {
      linkDomainCounts.set(domain, (linkDomainCounts.get(domain) ?? 0) + 1);
    });
    if (post.hasMedia) mediaPostCount += 1;
    mentionTotal += post.mentionCount;
    if (post.conversationId) conversationIds.add(post.conversationId);
    if (post.hasVisibleParentContext) visibleParentContextCount += 1;
    if (post.activeHour !== null)
      activeHourBins[post.activeHour] = (activeHourBins[post.activeHour] ?? 0) + 1;
    if (post.kind === 'post') postCount += 1;
    if (post.kind === 'reply') replyCount += 1;
    if (post.kind === 'quote') quoteCount += 1;
    if (post.kind === 'repost') repostCount += 1;

    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previous = posts[previousIndex];
      if (!previous || previous.exactTextHash === post.exactTextHash) continue;
      if (Math.min(previous.textLength, post.textLength) < 40) continue;
      const distance = simHashDistance(previous.simHash, post.simHash);
      if (distance !== null && distance <= 10) nearDuplicateCount += 1;
    }
  });
  for (let index = 1; index < timestampedPosts.length; index += 1) {
    const previous = timestampedPosts[index - 1]?.publishedAt;
    const current = timestampedPosts[index]?.publishedAt;
    if (previous === null || previous === undefined || current === null || current === undefined) {
      continue;
    }
    const gapMs = Math.abs(current - previous);
    if (gapMs < 5 * 60 * 1000) gapBins.underFiveMinutes += 1;
    else if (gapMs < 60 * 60 * 1000) gapBins.fiveMinutesToOneHour += 1;
    else if (gapMs < 6 * 60 * 60 * 1000) gapBins.oneHourToSixHours += 1;
    else gapBins.overSixHours += 1;
  }
  const firstTimestamp = timestampedPosts[0]?.publishedAt ?? null;
  const lastTimestamp = timestampedPosts.at(-1)?.publishedAt ?? null;

  return {
    exactDuplicateCount: Array.from(exactHashCounts.values()).reduce(
      (total, count) => total + Math.max(0, count - 1),
      0,
    ),
    nearDuplicateCount,
    repeatedLinkDomainCount: Array.from(linkDomainCounts.values()).reduce(
      (total, count) => total + (count >= 3 ? 1 : 0),
      0,
    ),
    mediaPostCount,
    mentionTotal,
    distinctConversationCount: conversationIds.size,
    visibleParentContextCount,
    postCount,
    replyCount,
    quoteCount,
    repostCount,
    activeHourBins,
    gapBins,
    timestampedPostCount: timestampedPosts.length,
    timestampedSpanMs:
      firstTimestamp !== null && lastTimestamp !== null
        ? Math.max(0, lastTimestamp - firstTimestamp)
        : 0,
    textLengthMean: mean(textLengths),
    textLengthStdDev: standardDeviation(textLengths),
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;

  const average = mean(values);
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}
