import {
  ACCOUNT_EVIDENCE_SCHEMA_VERSION,
  normalizeAccountKey,
  type ProfileSnapshotV1,
} from '../scoring/account-evidence.ts';
import { X_SELECTORS } from './x-selectors.ts';

export type RenderedProfileCardEvidence = {
  accountKey: string;
  profile: ProfileSnapshotV1;
};

const HANDLE_PATTERN = /^@[A-Za-z0-9_]{1,15}$/;
const RELATIONSHIP_LABELS = new Set([
  'follows you',
  'you follow each other',
  'vous suit',
  'vous vous suivez mutuellement',
]);
const NON_PROFILE_PATHS = new Set([
  'compose',
  'explore',
  'home',
  'i',
  'jobs',
  'messages',
  'notifications',
  'search',
  'settings',
]);

function singleLineText(element: Element | null): string | null {
  const text = element?.textContent?.replace(/\s+/g, ' ').trim();
  return text || null;
}

export function parseCompactRenderedNumber(text: string | null): number | null {
  if (!text) return null;

  const normalized = text
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();
  const match = normalized.match(/(\d[\d\s.,]*)(?:\s*([kmb]))?/i);
  if (!match) return null;

  const rawNumber = match[1]?.replace(/\s/g, '') ?? '';
  const suffix = match[2] ?? '';
  let decimalNormalized = rawNumber;

  if (rawNumber.includes(',') && rawNumber.includes('.')) {
    decimalNormalized = rawNumber.replace(/,/g, '');
  } else if (rawNumber.includes(',')) {
    const [whole, fraction] = rawNumber.split(',');
    decimalNormalized =
      fraction && fraction.length <= 2 ? `${whole}.${fraction}` : rawNumber.replace(/,/g, '');
  }

  const parsed = Number.parseFloat(decimalNormalized);
  if (!Number.isFinite(parsed)) return null;

  const multiplier =
    suffix === 'b' ? 1_000_000_000 : suffix === 'm' ? 1_000_000 : suffix === 'k' ? 1_000 : 1;
  return Math.round(parsed * multiplier);
}

function extractHandle(root: Element): string | null {
  for (const span of root.querySelectorAll('span')) {
    const text = singleLineText(span);
    const accountKey = text && HANDLE_PATTERN.test(text) ? normalizeAccountKey(text) : null;
    if (accountKey) return accountKey;
  }

  return null;
}

function extractNumberFromPath(root: Element, pathSuffixes: string[]): number | null {
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const path = link.getAttribute('href')?.toLowerCase() ?? '';
    if (!pathSuffixes.some((suffix) => path.endsWith(suffix))) continue;

    const value = parseCompactRenderedNumber(singleLineText(link));
    if (value !== null) return value;
  }

  return null;
}

function extractCommonFollows(root: Element): number | null {
  const text = singleLineText(root) ?? '';
  const match = text.match(
    /(\d[\d\s.,]*)\s+(?:others? you follow|autres? personnes? que vous suivez)/i,
  );

  return parseCompactRenderedNumber(match?.[1] ?? null);
}

function extractRelationshipLabel(root: Element): string | null {
  for (const span of root.querySelectorAll('span, div')) {
    const text = singleLineText(span);
    if (text && RELATIONSHIP_LABELS.has(text.toLowerCase())) return text;
  }

  return null;
}

function createProfileEvidence(
  root: Element,
  accountKey: string,
): RenderedProfileCardEvidence | null {
  const normalizedAccountKey = normalizeAccountKey(accountKey);
  if (!normalizedAccountKey) return null;

  return {
    accountKey: normalizedAccountKey,
    profile: {
      schemaVersion: ACCOUNT_EVIDENCE_SCHEMA_VERSION,
      observedAt: Date.now(),
      followers: extractNumberFromPath(root, ['/followers', '/verified_followers']),
      following: extractNumberFromPath(root, ['/following']),
      commonFollows: extractCommonFollows(root),
      relationshipLabel: extractRelationshipLabel(root),
      verified: Boolean(root.querySelector(X_SELECTORS.verifiedIcon)),
    },
  };
}

function accountKeyFromLocation(location: Location): string | null {
  const [firstSegment] = location.pathname.split('/').filter(Boolean);
  if (!firstSegment || NON_PROFILE_PATHS.has(firstSegment.toLowerCase())) return null;

  return normalizeAccountKey(`@${firstSegment}`);
}

export function extractRenderedProfileCard(hoverCard: Element): RenderedProfileCardEvidence | null {
  const accountKey = extractHandle(hoverCard);
  if (!accountKey) return null;

  return createProfileEvidence(hoverCard, accountKey);
}

export function extractRenderedProfilePage(document: Document): RenderedProfileCardEvidence | null {
  const accountKey = accountKeyFromLocation(document.location);
  const main = document.querySelector('main');
  if (!accountKey || !main) return null;

  return createProfileEvidence(main, accountKey);
}
