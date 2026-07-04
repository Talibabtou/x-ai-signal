import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { extractRenderedTweet } from './tweet-extractor.ts';

const fixtureHtml = await readFile(
  new URL('../../resources/fixtures/x-tweets.html', import.meta.url),
  'utf8',
);
const { document } = parseHTML(fixtureHtml);

function fixture(name) {
  const tweet = document.querySelector(`[data-fixture="${name}"]`);
  assert.ok(tweet, `Missing fixture: ${name}`);
  return tweet;
}

test('extracts rendered tweet and author evidence', () => {
  assert.deepEqual(extractRenderedTweet(fixture('normal')), {
    status: 'ready',
    text: 'A normal rendered tweet.',
    handle: '@alice',
    displayName: 'Alice Example',
    verified: true,
    relationshipLabel: 'Follows you',
    promoted: false,
  });
});

test('extracts replies without surrounding UI', () => {
  assert.equal(extractRenderedTweet(fixture('reply')).text, 'This is the reply body.');
});

test('does not mix quoted text into the post body', () => {
  assert.equal(extractRenderedTweet(fixture('quote')).text, 'My comment on the quoted post.');
});

test('recognizes promoted content from its rendered wrapper', () => {
  assert.equal(extractRenderedTweet(fixture('promoted')).promoted, true);
});

test('returns unknown when text or the author anchor is absent', () => {
  for (const name of ['media-only', 'missing-text', 'missing-author']) {
    assert.equal(extractRenderedTweet(fixture(name)).status, 'unknown');
  }
});
