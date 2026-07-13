import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreContentSuspicion } from '../src/scoring/content-suspicion.ts';

test('returns unknown when there is too little text to score', () => {
  assert.deepEqual(scoreContentSuspicion('A short post with too little evidence.'), {
    level: 'unknown',
    humanScore: 50,
    coverage: 0,
    reasons: ['Not enough text for a useful content-only score.'],
  });
});

test('always returns bounded human-likeness and coverage scores', () => {
  for (const text of [
    null,
    'Short',
    'I walked home through the rain and missed my train, but the bakery was still open nearby.',
    "Here's the thing: the key takeaway matters. This isn't just about speed, it's about focus. The real question is whether it works.\n- Check the input\n- Read the result\n- Review the reasons",
  ]) {
    const result = scoreContentSuspicion(text);

    assert.ok(result.humanScore >= 0 && result.humanScore <= 100);
    assert.ok(result.coverage >= 0 && result.coverage <= 100);
  }
});

test('returns low when supported text has no configured signals', () => {
  const result = scoreContentSuspicion(
    'I walked home through the rain and missed my train, but the bakery was still open nearby.',
  );

  assert.equal(result.level, 'low');
  assert.equal(result.humanScore, 58);
  assert.equal(result.coverage, 20);
});

test('recognizes a strongly structured list', () => {
  const result = scoreContentSuspicion(
    'Three things I noticed today:\n- The station was empty\n- The rain stopped early\n- The bakery stayed open',
  );

  assert.deepEqual(result.reasons, ['Uses a strongly structured list or sequence.']);
  assert.equal(result.level, 'medium');
});

test('recognizes a cluster of formulaic phrases', () => {
  const result = scoreContentSuspicion(
    "Here's the thing: the key takeaway is that planning matters when a project has several moving parts.",
  );

  assert.deepEqual(result.reasons, ['Contains several formulaic phrases.']);
  assert.equal(result.level, 'medium');
});

test('recognizes repeated contrast framing', () => {
  const result = scoreContentSuspicion(
    "This isn't just about speed, it's about focus. The real question is whether the result helps anyone who uses it.",
  );

  assert.deepEqual(result.reasons, ['Repeats contrast-based sentence framing.']);
  assert.equal(result.level, 'medium');
});

test('returns high only when several independent signals accumulate', () => {
  const result = scoreContentSuspicion(
    "Here's the thing: the key takeaway matters. This isn't just about speed, it's about focus. The real question is whether it works.\n- Check the input\n- Read the result\n- Review the reasons",
  );

  assert.equal(result.level, 'high');
  assert.equal(result.humanScore, 10);
  assert.equal(result.reasons.length, 3);
});

test('applies a bounded penalty when X places a reply behind probable spam', () => {
  const result = scoreContentSuspicion(
    'I walked home through the rain and missed my train, but the bakery was still open nearby.',
    { probableSpam: true },
  );

  assert.equal(result.humanScore, 38);
  assert.equal(result.coverage, 30);
  assert.equal(result.level, 'medium');
  assert.ok(result.reasons.includes('X placed this reply behind its probable-spam control.'));
});

test('uses probable spam as context when text is too short to score', () => {
  const result = scoreContentSuspicion('Thanks!', { probableSpam: true });

  assert.equal(result.humanScore, 30);
  assert.equal(result.coverage, 10);
  assert.equal(result.level, 'medium');
});
