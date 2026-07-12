import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageOpacity, humanScoreColor } from '../src/ui/signal-color.ts';

test('maps score endpoints and midpoint to red, yellow, and green', () => {
  assert.equal(humanScoreColor(0), 'rgb(244 33 46)');
  assert.equal(humanScoreColor(50), 'rgb(255 212 0)');
  assert.equal(humanScoreColor(100), 'rgb(0 186 124)');
});

test('clamps scores and interpolates intermediate colors', () => {
  assert.equal(humanScoreColor(-10), humanScoreColor(0));
  assert.equal(humanScoreColor(110), humanScoreColor(100));
  assert.equal(humanScoreColor(25), 'rgb(250 123 23)');
  assert.equal(humanScoreColor(75), 'rgb(128 199 62)');
});

test('maps coverage to border opacity and reaches full opacity at 100', () => {
  assert.equal(coverageOpacity(0), 0);
  assert.equal(coverageOpacity(20), 0.2);
  assert.equal(coverageOpacity(50), 0.5);
  assert.equal(coverageOpacity(100), 1);
  assert.equal(humanScoreColor(50, coverageOpacity(20)), 'rgb(255 212 0 / 0.2)');
});
