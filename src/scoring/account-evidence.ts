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
  profile: ProfileSnapshotV1 | null;
};

export type AccountScoreV1 = {
  schemaVersion: 1;
  humanScore: number;
  coverage: number;
  level: SuspicionLevel;
  reasons: string[];
  observationCount: number;
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

export function hashText(text: string): string | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  let hash = 0x811c9dc5;
  for (const character of normalized) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createPostObservation(
  handle: string,
  text: string | null,
  postId: string | null,
  publishedAt: number | null,
  result: SuspicionResult,
  probableSpam = false,
  observedAt = Date.now(),
): PostObservationV1 | null {
  const accountKey = normalizeAccountKey(handle);
  if (!accountKey) return null;

  return {
    schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
    accountKey,
    handle,
    postId,
    publishedAt,
    observedAt,
    textLength: Array.from(text ?? '').length,
    exactTextHash: text ? hashText(text) : null,
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
    (account.profile === null || isProfileSnapshotV1(account.profile))
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
    };
  });
  const migrated = {
    ...legacy,
    schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
    recentPosts: migratedPosts,
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
      profile: current?.profile ?? null,
    },
    stored: true,
  };
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
    return {
      schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
      humanScore: 50,
      coverage: 0,
      level: 'unknown',
      reasons: ['No scoreable account evidence has been observed yet.'],
      observationCount: account.observationCount,
    };
  }

  const probableSpam = eligiblePosts.some((post) => post.probableSpam);
  const baseScoreTotal = eligiblePosts.reduce(
    (total, post) => total + Math.min(100, post.contentHumanScore + (post.probableSpam ? 20 : 0)),
    0,
  );
  const humanScore = Math.max(
    0,
    Math.min(100, Math.round(baseScoreTotal / eligiblePosts.length) - (probableSpam ? 20 : 0)),
  );
  const maximumPostCoverage = Math.max(...eligiblePosts.map((post) => post.contentCoverage));
  const coverage = Math.min(
    50,
    Math.max(maximumPostCoverage, 10 + eligiblePosts.length * 10 + (probableSpam ? 10 : 0)),
  );
  const reasons = [`Based on ${eligiblePosts.length} locally observed post(s).`];

  if (probableSpam) {
    reasons.push('At least one reply was shown behind X’s probable-spam control.');
  }

  return {
    schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
    humanScore,
    coverage,
    level: levelForAccountScore(humanScore, coverage),
    reasons,
    observationCount: account.observationCount,
  };
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
    profile: null,
  };
}
