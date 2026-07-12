import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import {
  extractRenderedProfileCard,
  extractRenderedProfilePage,
  parseCompactRenderedNumber,
} from '../src/content/profile-card-extractor.ts';

const fixtureHtml = await readFile(
  new URL('../resources/fixtures/x-tweets.html', import.meta.url),
  'utf8',
);
const { document } = parseHTML(fixtureHtml);

test('parses compact localized profile numbers', () => {
  assert.equal(parseCompactRenderedNumber('1,234 followers'), 1234);
  assert.equal(parseCompactRenderedNumber('219,9 k abonnés'), 219900);
  assert.equal(parseCompactRenderedNumber('1.2M followers'), 1_200_000);
});

test('extracts rendered hover-card profile context', () => {
  const hoverCard = document.querySelector('[data-fixture="hover-card"]');
  assert.ok(hoverCard);

  const evidence = extractRenderedProfileCard(hoverCard);

  assert.ok(evidence);
  assert.equal(evidence.accountKey, '@alice');
  assert.equal(evidence.profile.following, 1234);
  assert.equal(evidence.profile.followers, 219900);
  assert.equal(evidence.profile.commonFollows, 249);
  assert.equal(evidence.profile.relationshipLabel, 'Follows you');
  assert.equal(evidence.profile.verified, true);
});

test('extracts rendered profile-page context from a natural profile visit', () => {
  Object.defineProperty(document, 'location', {
    configurable: true,
    value: new URL('https://x.com/profileacct'),
  });

  const evidence = extractRenderedProfilePage(document);

  assert.ok(evidence);
  assert.equal(evidence.accountKey, '@profileacct');
  assert.equal(evidence.profile.following, 42);
  assert.equal(evidence.profile.followers, 12_500);
  assert.equal(evidence.profile.verified, true);
});
