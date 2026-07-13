import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { extractRenderedTweet } from '../src/content/tweet-extractor.ts';

const fixtureHtml = await readFile(
  new URL('../resources/fixtures/x-tweets.html', import.meta.url),
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
    postId: '123456789',
    publishedAt: Date.parse('2026-07-05T10:30:00.000Z'),
    conversationId: '123456789',
    activeHour: 10,
    probableSpam: false,
    linkDomains: [],
    mentionCount: 0,
    hasMedia: false,
    kind: 'post',
    language: 'en',
    hasVisibleParentContext: false,
  });
});

test('extracts a rendered post ID and timestamp', () => {
  const evidence = extractRenderedTweet(fixture('normal'));

  assert.equal(evidence.postId, '123456789');
  assert.equal(evidence.publishedAt, Date.parse('2026-07-05T10:30:00.000Z'));
});

test('extracts replies without surrounding UI', () => {
  const evidence = extractRenderedTweet(fixture('reply'));

  assert.equal(evidence.text, 'This is the reply body.');
  assert.equal(evidence.postId, '222');
  assert.equal(evidence.conversationId, '111');
  assert.equal(evidence.kind, 'reply');
  assert.equal(evidence.hasVisibleParentContext, true);
  assert.equal(evidence.activeHour, 10);
});

test('does not mix quoted text into the post body', () => {
  assert.equal(extractRenderedTweet(fixture('quote')).text, 'My comment on the quoted post.');
});

test('recognizes promoted content from its rendered wrapper', () => {
  assert.equal(extractRenderedTweet(fixture('promoted')).promoted, true);
});

test('extracts lightweight behavior features without storing text', () => {
  const evidence = extractRenderedTweet(fixture('behavior-features'));

  assert.deepEqual(evidence.linkDomains, ['example.com']);
  assert.equal(evidence.mentionCount, 1);
  assert.equal(evidence.hasMedia, true);
  assert.equal(evidence.language, 'en');
});

test('recognizes replies rendered after X probable-spam control', () => {
  assert.equal(extractRenderedTweet(fixture('probable-spam')).probableSpam, true);
  assert.equal(extractRenderedTweet(fixture('normal')).probableSpam, false);
});

test('returns unknown when text or the author anchor is absent', () => {
  for (const name of ['media-only', 'missing-text', 'missing-author']) {
    assert.equal(extractRenderedTweet(fixture(name)).status, 'unknown');
  }
});
