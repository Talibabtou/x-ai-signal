import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreContentSuspicion } from './content-suspicion.ts';

test('returns unknown when there is too little text to score', () => {
  assert.deepEqual(scoreContentSuspicion('A short post with too little evidence.'), {
    level: 'unknown',
    reasons: ['Not enough text for a useful content-only score.'],
  });
});

test('returns low when supported text has no configured signals', () => {
  const result = scoreContentSuspicion(
    'I walked home through the rain and missed my train, but the bakery was still open nearby.',
  );

  assert.equal(result.level, 'low');
});

test('recognizes a strongly structured list', () => {
  const result = scoreContentSuspicion(
    'Three things I noticed today:\n- The station was empty\n- The rain stopped early\n- The bakery stayed open',
  );

  assert.deepEqual(result.reasons, ['Uses a strongly structured list or sequence.']);
  assert.equal(result.level, 'low');
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
  assert.equal(result.level, 'low');
});

test('returns high only when several independent signals accumulate', () => {
  const result = scoreContentSuspicion(
    "Here's the thing: the key takeaway matters. This isn't just about speed, it's about focus. The real question is whether it works.\n- Check the input\n- Read the result\n- Review the reasons",
  );

  assert.equal(result.level, 'high');
  assert.equal(result.reasons.length, 3);
});
