import { X_SELECTORS } from './x-selectors.ts';

export type RenderedTweetEvidence = {
  status: 'ready' | 'unknown';
  text: string | null;
  handle: string | null;
  displayName: string | null;
  verified: boolean;
  relationshipLabel: string | null;
  promoted: boolean;
  postId: string | null;
  publishedAt: number | null;
  probableSpam: boolean;
};

const HANDLE_PATTERN = /^@[A-Za-z0-9_]{1,15}$/;
const RELATIONSHIP_LABELS = new Set(['follows you', 'you follow each other']);
const PROBABLE_SPAM_LABELS = new Set([
  'show probable spam',
  'afficher un spam probable',
  'mostrar spam probable',
]);

function trimmedText(element: Element | null): string | null {
  const text = element?.textContent?.trim();
  return text || null;
}

function singleLineText(element: Element | null): string | null {
  const text = trimmedText(element)?.replace(/\s+/g, ' ');
  return text || null;
}

function extractOwnText(tweet: Element): string | null {
  for (const textNode of tweet.querySelectorAll(X_SELECTORS.tweetText)) {
    if (!textNode.closest(X_SELECTORS.quote)) return trimmedText(textNode);
  }

  return null;
}

function extractPostIdentity(tweet: Element): {
  postId: string | null;
  publishedAt: number | null;
} {
  for (const time of tweet.querySelectorAll('time[datetime]')) {
    if (time.closest(X_SELECTORS.quote)) continue;

    const link = time.closest<HTMLAnchorElement>('a[href*="/status/"]');
    const postId = link?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1] ?? null;
    const parsedTime = Date.parse(time.getAttribute('datetime') ?? '');

    return {
      postId,
      publishedAt: Number.isNaN(parsedTime) ? null : parsedTime,
    };
  }

  return { postId: null, publishedAt: null };
}

function normalizedControlText(element: Element): string {
  return element.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
}

function isInProbableSpamSection(tweet: Element): boolean {
  const root = tweet.closest('main') ?? tweet.ownerDocument;

  for (const control of root.querySelectorAll('button, [role="button"]')) {
    const controlComesFirst = Boolean(control.compareDocumentPosition(tweet) & 4);
    if (controlComesFirst && PROBABLE_SPAM_LABELS.has(normalizedControlText(control))) return true;
  }

  return false;
}

function extractHandle(author: Element | null): string | null {
  if (!author) return null;

  for (const span of author.querySelectorAll('span')) {
    const text = singleLineText(span);
    if (text && HANDLE_PATTERN.test(text)) return text;
  }

  return null;
}

function extractDisplayName(author: Element | null, handle: string | null): string | null {
  if (!author) return null;

  const expectedPath = handle ? `/${handle.slice(1).toLowerCase()}` : null;
  const links = author.querySelectorAll<HTMLAnchorElement>('a[href]');

  for (const link of links) {
    const text = singleLineText(link);
    const path = link.getAttribute('href')?.toLowerCase();
    if (text && text !== handle && (!expectedPath || path === expectedPath)) return text;
  }

  return null;
}

function extractRelationshipLabel(author: Element | null): string | null {
  if (!author) return null;

  for (const span of author.querySelectorAll('span')) {
    const text = singleLineText(span);
    if (text && RELATIONSHIP_LABELS.has(text.toLowerCase())) return text;
  }

  return null;
}

export function extractRenderedTweet(tweet: Element): RenderedTweetEvidence {
  const author = tweet.querySelector(X_SELECTORS.author);
  const text = extractOwnText(tweet);
  const handle = extractHandle(author);
  const identity = extractPostIdentity(tweet);

  return {
    status: text && author ? 'ready' : 'unknown',
    text,
    handle,
    displayName: extractDisplayName(author, handle),
    verified: Boolean(author?.querySelector(X_SELECTORS.verifiedIcon)),
    relationshipLabel: extractRelationshipLabel(author),
    promoted: Boolean(tweet.closest(X_SELECTORS.promotedContainer)),
    probableSpam: isInProbableSpamSection(tweet),
    ...identity,
  };
}
