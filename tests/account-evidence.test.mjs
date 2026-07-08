import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPostObservation,
  hashText,
  isAccountEvidenceV1,
  isPostObservationV1,
  MAX_RECENT_POSTS,
  mergePostObservation,
  migrateAccountEvidence,
  normalizeAccountKey,
  scoreAccountEvidence,
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
    'First sufficiently long account post for a local score.',
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
    'Second sufficiently long account post for a local score.',
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

  const migrated = migrateAccountEvidence(legacy);

  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.recentPosts[0].probableSpam, false);
  assert.equal(isAccountEvidenceV1(migrated), true);
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
