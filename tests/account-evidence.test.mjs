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

  assert.equal(firstScore.humanScore, 70);
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
