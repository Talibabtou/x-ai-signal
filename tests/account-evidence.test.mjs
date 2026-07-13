import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPostObservation,
  hashText,
  isAccountEvidenceV1,
  isPostObservationV1,
  MAX_RECENT_POSTS,
  mergePostObservation,
  mergeProfileSnapshot,
  migrateAccountEvidence,
  normalizeAccountKey,
  scoreAccountEvidence,
  simHashDistance,
  simHashText,
} from '../src/scoring/account-evidence.ts';

const contentResult = {
  level: 'low',
  humanScore: 70,
  coverage: 20,
  reasons: ['No configured writing-pattern signals were found.'],
};

test('normalizes valid handles and rejects invalid account keys', () => {
  assert.equal(normalizeAccountKey(' @Alice_1 '), '@alice_1');
  assert.equal(normalizeAccountKey('not a handle'), null);
});

test('hashes equivalent text without retaining its contents', () => {
  assert.equal(hashText('  Same\nTEXT  '), hashText('same text'));
  assert.notEqual(hashText('same text'), hashText('different text'));
});

test('creates comparable simhashes for lightly edited text', () => {
  const first = simHashText('This is a repeated reply template with a small product link today.');
  const second = simHashText('This is a repeated reply template with a tiny product link today!');

  assert.ok(first);
  assert.ok(second);
  const distance = simHashDistance(first, second);
  assert.ok(distance !== null && distance <= 10);
});

test('creates a sanitized versioned observation', () => {
  const observation = createPostObservation(
    '@Alice',
    'A useful test post with enough content.',
    '123',
    1_700_000_000_000,
    contentResult,
    false,
    1_700_000_001_000,
  );

  assert.ok(observation);
  assert.equal(observation.accountKey, '@alice');
  assert.equal(observation.postId, '123');
  assert.equal(observation.activeHour, 22);
  assert.equal('text' in observation, false);
  assert.equal(isPostObservationV1(observation), true);
});

test('deduplicates a rendered post and keeps a bounded recent history', () => {
  const first = createPostObservation(
    '@alice',
    'First post',
    '1',
    null,
    contentResult,
    false,
    1_000,
  );
  assert.ok(first);

  const initial = mergePostObservation(null, first, 1_000);
  const duplicate = mergePostObservation(initial.account, first, 1_000);

  assert.equal(initial.stored, true);
  assert.equal(duplicate.stored, false);
  assert.equal(duplicate.account.observationCount, 1);

  let account = initial.account;
  for (let index = 2; index <= MAX_RECENT_POSTS + 5; index += 1) {
    const observation = createPostObservation(
      '@alice',
      `Post ${index}`,
      String(index),
      null,
      contentResult,
      false,
      1_000 + index,
    );
    assert.ok(observation);
    account = mergePostObservation(account, observation, 1_000 + index).account;
  }

  assert.equal(account.observationCount, MAX_RECENT_POSTS + 5);
  assert.equal(account.recentPosts.length, MAX_RECENT_POSTS);
});

test('rejects malformed observations', () => {
  assert.equal(isPostObservationV1({ schemaVersion: 1, accountKey: '@alice' }), false);
});

test('produces one evolving score for an account', () => {
  const first = createPostObservation(
    '@alice',
    'I spent the morning testing the extension on a profile page.',
    'score-1',
    null,
    contentResult,
    false,
    1_000,
  );
  assert.ok(first);
  const firstAccount = mergePostObservation(null, first, 1_000).account;
  const firstScore = scoreAccountEvidence(firstAccount);

  const second = createPostObservation(
    '@alice',
    'The rain stopped before lunch and the street market opened again.',
    'score-2',
    null,
    { ...contentResult, humanScore: 50 },
    false,
    2_000,
  );
  assert.ok(second);
  const secondAccount = mergePostObservation(firstAccount, second, 2_000).account;
  const secondScore = scoreAccountEvidence(secondAccount);

  assert.equal(firstScore.humanScore, 68);
  assert.equal(firstScore.coverage, 20);
  assert.equal(secondScore.humanScore, 60);
  assert.equal(secondScore.coverage, 30);
});

test('keeps X probable-spam context as an account-level penalty', () => {
  const spamObservation = createPostObservation(
    '@alice',
    'A post that X rendered in its probable spam reply section.',
    'spam-1',
    null,
    { ...contentResult, humanScore: 50, coverage: 30, level: 'medium' },
    true,
    1_000,
  );
  assert.ok(spamObservation);
  const spamAccount = mergePostObservation(null, spamObservation, 1_000).account;

  assert.equal(scoreAccountEvidence(spamAccount).humanScore, 50);
  assert.equal(scoreAccountEvidence(spamAccount).coverage, 30);
});

test('penalizes repeated exact posts from the same account', () => {
  let account = null;
  for (let index = 1; index <= 2; index += 1) {
    const observation = createPostObservation(
      '@alice',
      'This is the exact same reply template being reused by this account.',
      `duplicate-${index}`,
      null,
      contentResult,
      false,
      1_000 + index,
    );
    assert.ok(observation);
    account = mergePostObservation(account, observation, 1_000 + index).account;
  }

  const score = scoreAccountEvidence(account);

  assert.equal(account.aggregates.exactDuplicateCount, 1);
  assert.equal(score.humanScore, 40);
  assert.ok(score.reasons.some((reason) => reason.includes('repeated exact')));
});

test('penalizes near-duplicate posts without raw text storage', () => {
  let account = null;
  for (const [index, text] of [
    'This is a repeated reply template with a small product link today.',
    'This is a repeated reply template with a tiny product link today!',
  ].entries()) {
    const observation = createPostObservation(
      '@alice',
      text,
      `near-${index}`,
      null,
      contentResult,
      false,
      1_000 + index,
    );
    assert.ok(observation);
    account = mergePostObservation(account, observation, 1_000 + index).account;
  }

  const score = scoreAccountEvidence(account);

  assert.equal(account.aggregates.nearDuplicateCount, 1);
  assert.equal(score.humanScore, 45);
  assert.ok(score.reasons.some((reason) => reason.includes('near-duplicate')));
});

test('adds a small penalty for repeated link domains', () => {
  let account = null;
  for (let index = 1; index <= 3; index += 1) {
    const observation = createPostObservation(
      '@alice',
      [
        'A market note with one external domain and a calm explanation.',
        'A weekend travel photo linking to the same external domain.',
        'A support answer that references the same external domain.',
      ][index - 1],
      `link-${index}`,
      null,
      contentResult,
      false,
      { linkDomains: ['example.com'] },
      1_000 + index,
    );
    assert.ok(observation);
    account = mergePostObservation(account, observation, 1_000 + index).account;
  }

  const score = scoreAccountEvidence(account);

  assert.equal(account.aggregates.repeatedLinkDomainCount, 1);
  assert.equal(score.humanScore, 51);
});

test('can score a locally bad behavioral pattern below 50', () => {
  let account = null;
  for (let index = 1; index <= 5; index += 1) {
    const observation = createPostObservation(
      '@botlike',
      `This is a repeated reply template with a product link and @target mention ${index}.`,
      `bad-${index}`,
      null,
      contentResult,
      false,
      {
        linkDomains: ['promo.example'],
        mentionCount: 3,
      },
      1_000 + index,
    );
    assert.ok(observation);
    account = mergePostObservation(account, observation, 1_000 + index).account;
  }

  const score = scoreAccountEvidence(account);

  assert.ok(score.humanScore < 50);
  assert.ok(score.coverage >= 50);
});

test('does not inflate neutral observations into a high human score', () => {
  let account = null;
  for (let index = 1; index <= 8; index += 1) {
    const observation = createPostObservation(
      '@neutralacct',
      [
        'A regular update about a project status and a small scheduling change.',
        'Another note shares a general thought without much account-specific context.',
        'The reply points to a simple observation and avoids repeated wording.',
        'A short explanation describes why the previous message needed clarification.',
        'The account adds another ordinary sentence about work and timing.',
        'One more update mentions a topic without links or repeated phrases.',
        'A neutral post gives a basic response to a rendered conversation.',
        'The last sample is varied enough but still lacks strong positive evidence.',
      ][index - 1],
      `neutral-${index}`,
      1_700_000_000_000 + index * 60 * 60 * 1000,
      contentResult,
      false,
      {
        kind: 'reply',
        conversationId: `conversation-${index}`,
        hasVisibleParentContext: true,
      },
      1_700_000_000_000 + index * 60 * 60 * 1000,
    );
    assert.ok(observation);
    account = mergePostObservation(account, observation, observation.observedAt).account;
  }

  const profileResult = mergeProfileSnapshot(
    account,
    '@neutralacct',
    {
      schemaVersion: 1,
      observedAt: 1_700_000_000_000,
      followers: 2_000,
      following: 1_500,
      commonFollows: null,
      relationshipLabel: null,
      verified: false,
    },
    '@neutralacct',
    1_700_000_000_000,
  );
  assert.ok(profileResult);
  const score = scoreAccountEvidence(profileResult.account);

  assert.ok(score.humanScore < 80);
});

test('tracks rendered conversation and reply activity as bounded context', () => {
  let account = null;
  const texts = [
    'I tried the same setting yesterday and the modal stayed open.',
    'That recipe works better when the pan is already warm.',
    'The train delay cleared before the evening commute started.',
    'Your screenshot shows the old button label near the toolbar.',
    'I found the venue entrance on the north side of the block.',
  ];
  for (let index = 1; index <= 5; index += 1) {
    const observation = createPostObservation(
      '@alice',
      texts[index - 1],
      `reply-${index}`,
      1_700_000_000_000 + index * 60 * 60 * 1000,
      contentResult,
      false,
      {
        kind: 'reply',
        conversationId: `conversation-${index}`,
        hasVisibleParentContext: true,
      },
      1_700_000_000_000 + index * 60 * 60 * 1000,
    );
    assert.ok(observation);
    account = mergePostObservation(account, observation, observation.observedAt).account;
  }

  const score = scoreAccountEvidence(account);

  assert.equal(account.aggregates.replyCount, 5);
  assert.equal(account.aggregates.distinctConversationCount, 5);
  assert.equal(account.aggregates.visibleParentContextCount, 5);
  assert.equal(score.humanScore, 63);
  assert.ok(score.reasons.some((reason) => reason.includes('multiple rendered conversations')));
  assert.ok(score.gauges.some((gauge) => gauge.id === 'reply-mix'));
});

test('penalizes reply broadcasting concentrated in few rendered conversations', () => {
  let account = null;
  const texts = [
    'The account keeps entering this discussion without new context.',
    'A second reply appears in the same rendered thread sample.',
    'Another short answer lands under the same visible exchange.',
    'The fourth reply still stays inside the first conversation.',
    'A separate conversation receives the same account behavior.',
    'The next note remains concentrated in that second exchange.',
    'One more reply continues the narrow conversation pattern.',
    'The final observed reply does not broaden the local sample.',
  ];
  for (let index = 1; index <= 8; index += 1) {
    const observation = createPostObservation(
      '@alice',
      texts[index - 1],
      `broadcast-${index}`,
      1_700_000_000_000 + index * 60 * 60 * 1000,
      contentResult,
      false,
      {
        kind: 'reply',
        conversationId: index <= 4 ? 'conversation-a' : 'conversation-b',
        hasVisibleParentContext: true,
      },
      1_700_000_000_000 + index * 60 * 60 * 1000,
    );
    assert.ok(observation);
    account = mergePostObservation(account, observation, observation.observedAt).account;
  }

  const score = scoreAccountEvidence(account);

  assert.equal(account.aggregates.replyCount, 8);
  assert.equal(account.aggregates.distinctConversationCount, 2);
  assert.equal(score.humanScore, 50);
  assert.ok(score.reasons.some((reason) => reason.includes('concentrated')));
});

test('gates timing signals until enough timestamped posts span six hours', () => {
  let account = null;
  const texts = [
    'The first timestamped note is about a build setting.',
    'A lunch plan changed after the weather report arrived.',
    'The dashboard screenshot uses a different account filter.',
    'I moved the charger from the desk to the travel bag.',
    'That bookstore closes earlier on Sunday evenings.',
    'The profile card rendered after the second pointer hover.',
    'A small CSS fix made the avatar border visible again.',
  ];
  for (let index = 1; index <= 7; index += 1) {
    const observation = createPostObservation(
      '@alice',
      texts[index - 1],
      `timing-small-${index}`,
      1_700_000_000_000 + index * 60_000,
      contentResult,
      false,
      { kind: 'post' },
      1_700_000_000_000 + index * 60_000,
    );
    assert.ok(observation);
    account = mergePostObservation(account, observation, observation.observedAt).account;
  }

  const score = scoreAccountEvidence(account);

  assert.equal(account.aggregates.timestampedPostCount, 7);
  assert.equal(account.aggregates.gapBins.underFiveMinutes, 6);
  assert.equal(score.humanScore, 58);
  assert.equal(
    score.reasons.some((reason) => reason.includes('posting gaps')),
    false,
  );
});

test('uses sampled timing gaps only after the configured timing gate', () => {
  let account = null;
  const start = 1_700_000_000_000;
  const texts = [
    'The first gated timing sample mentions a calendar export.',
    'Another note compares two separate browser windows.',
    'This update talks about a train platform change.',
    'A later sample records a bookmark folder cleanup.',
    'The fifth observation mentions a quiet profile page.',
    'Another timestamped post describes a local fixture.',
    'The afternoon item talks about a different recipe test.',
    'The evening note covers a keyboard shortcut mismatch.',
  ];
  const offsets = [
    0,
    60_000,
    120_000,
    180_000,
    240_000,
    300_000,
    12 * 60 * 60_000,
    13 * 60 * 60_000,
  ];
  for (const [index, offset] of offsets.entries()) {
    const observation = createPostObservation(
      '@alice',
      texts[index],
      `timing-gated-${index}`,
      start + offset,
      contentResult,
      false,
      { kind: 'post' },
      start + offset,
    );
    assert.ok(observation);
    account = mergePostObservation(account, observation, observation.observedAt).account;
  }

  const score = scoreAccountEvidence(account);

  assert.equal(account.aggregates.timestampedPostCount, 8);
  assert.equal(account.aggregates.timestampedSpanMs, 13 * 60 * 60_000);
  assert.equal(account.aggregates.gapBins.underFiveMinutes, 5);
  assert.equal(score.humanScore, 48);
  assert.ok(score.reasons.some((reason) => reason.includes('posting gaps')));
  assert.ok(score.gauges.some((gauge) => gauge.id === 'timing'));
});

test('migrates legacy account records without a probable-spam field', () => {
  const observation = createPostObservation(
    '@alice',
    'A legacy post with enough text to create an account record.',
    'legacy-1',
    null,
    contentResult,
    false,
    1_000,
  );
  assert.ok(observation);
  const account = mergePostObservation(null, observation, 1_000).account;
  const legacy = structuredClone(account);
  legacy.schemaVersion = 0;
  delete legacy.recentPosts[0].probableSpam;
  delete legacy.recentPosts[0].simHash;
  delete legacy.recentPosts[0].linkDomains;
  delete legacy.recentPosts[0].mentionCount;
  delete legacy.recentPosts[0].hasMedia;
  delete legacy.recentPosts[0].kind;
  delete legacy.recentPosts[0].language;
  delete legacy.recentPosts[0].conversationId;
  delete legacy.recentPosts[0].hasVisibleParentContext;
  delete legacy.recentPosts[0].activeHour;
  delete legacy.aggregates;

  const migrated = migrateAccountEvidence(legacy);

  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.recentPosts[0].probableSpam, false);
  assert.deepEqual(migrated.aggregates, {
    exactDuplicateCount: 0,
    nearDuplicateCount: 0,
    repeatedLinkDomainCount: 0,
    mediaPostCount: 0,
    mentionTotal: 0,
    distinctConversationCount: 0,
    visibleParentContextCount: 0,
    postCount: 0,
    replyCount: 0,
    quoteCount: 0,
    repostCount: 0,
    activeHourBins: Array.from({ length: 24 }, () => 0),
    gapBins: {
      underFiveMinutes: 0,
      fiveMinutesToOneHour: 0,
      oneHourToSixHours: 0,
      overSixHours: 0,
    },
    timestampedPostCount: 0,
    timestampedSpanMs: 0,
    textLengthMean: 59,
    textLengthStdDev: 0,
  });
  assert.equal(isAccountEvidenceV1(migrated), true);
});

test('uses rendered profile-card context as a bounded account signal', () => {
  const profile = {
    schemaVersion: 1,
    observedAt: 2_000,
    followers: 100_000,
    following: 1_000,
    commonFollows: 16,
    relationshipLabel: 'Follows you',
    verified: true,
  };
  const result = mergeProfileSnapshot(null, '@alice', profile, '@alice', 2_000);

  assert.ok(result);
  const score = scoreAccountEvidence(result.account);

  assert.equal(score.humanScore, 70);
  assert.equal(score.coverage, 30);
  assert.ok(score.gauges.some((gauge) => gauge.id === 'follower-ratio'));
  assert.ok(score.gauges.some((gauge) => gauge.id === 'common-follows'));
});

test('scores a large asymmetric follower ratio as strong profile context', () => {
  const profile = {
    schemaVersion: 1,
    observedAt: 2_000,
    followers: 1_100_000,
    following: 9_162,
    commonFollows: 430,
    relationshipLabel: null,
    verified: false,
  };
  const result = mergeProfileSnapshot(null, '@largeacct', profile, '@largeacct', 2_000);

  assert.ok(result);
  const score = scoreAccountEvidence(result.account);
  const followerRatio = score.gauges.find((gauge) => gauge.id === 'follower-ratio');

  assert.ok(followerRatio);
  assert.equal(followerRatio.value, 90);
  assert.ok(followerRatio.detail.includes('120.1:1'));
});

test('does not erase known profile fields with missing card fields', () => {
  const fullProfile = {
    schemaVersion: 1,
    observedAt: 2_000,
    followers: 500,
    following: 100,
    commonFollows: 4,
    relationshipLabel: 'Follows you',
    verified: true,
  };
  const partialProfile = {
    schemaVersion: 1,
    observedAt: 3_000,
    followers: null,
    following: null,
    commonFollows: null,
    relationshipLabel: null,
    verified: null,
  };
  const first = mergeProfileSnapshot(null, '@alice', fullProfile, '@alice', 2_000);
  assert.ok(first);
  const second = mergeProfileSnapshot(first.account, '@alice', partialProfile, '@alice', 3_000);

  assert.ok(second);
  assert.equal(second.account.profile.followers, 500);
  assert.equal(second.account.profile.following, 100);
  assert.equal(second.account.profile.commonFollows, 4);
  assert.equal(second.account.profile.relationshipLabel, 'Follows you');
  assert.equal(second.account.profile.verified, true);
});

test('rejects corrupt account records so storage can recover', () => {
  assert.equal(
    migrateAccountEvidence({
      schemaVersion: 1,
      accountKey: '@alice',
      handle: '@alice',
      firstSeenAt: 1_000,
      lastSeenAt: 2_000,
      observationCount: 2,
      recentPosts: 'corrupt',
      profile: null,
    }),
    null,
  );
});
