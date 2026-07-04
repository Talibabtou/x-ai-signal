import { type SuspicionLevel, scoreContentSuspicion } from '../scoring/content-suspicion';
import { extractRenderedTweet } from './tweet-extractor';
import { X_SELECTORS } from './x-selectors';

const INDICATOR_ATTRIBUTE = 'data-taib-ai-indicator';
const EVIDENCE_ATTRIBUTE = 'data-taib-ai-evidence';
const ORIGINAL_TITLE_ATTRIBUTE = 'data-taib-ai-original-title';
const ACCESSIBLE_INDICATOR_CLASS = 'taib-ai-accessible-signal';
const SIGNAL_CLASSES = [
  'taib-ai-avatar-signal--unknown',
  'taib-ai-avatar-signal--low',
  'taib-ai-avatar-signal--medium',
  'taib-ai-avatar-signal--high',
];

function indicatorDescription(level: SuspicionLevel, reasons: string[]): string {
  const label = level === 'unknown' ? 'Unknown' : `${level[0]?.toUpperCase()}${level.slice(1)}`;
  return `AI-writing suspicion: ${label} (content only). ${reasons.join(' ')}`;
}

function updateAccessibleIndicator(avatar: HTMLElement, description: string) {
  let accessibleIndicator = avatar.querySelector<HTMLElement>(`.${ACCESSIBLE_INDICATOR_CLASS}`);

  if (!accessibleIndicator) {
    accessibleIndicator = document.createElement('span');
    accessibleIndicator.className = ACCESSIBLE_INDICATOR_CLASS;
    accessibleIndicator.setAttribute('role', 'img');
    avatar.append(accessibleIndicator);
  }

  accessibleIndicator.setAttribute('aria-label', description);
  if (!avatar.hasAttribute(ORIGINAL_TITLE_ATTRIBUTE)) {
    avatar.setAttribute(ORIGINAL_TITLE_ATTRIBUTE, avatar.getAttribute('title') ?? '');
  }
  avatar.title = description;
}

function addIndicator(tweet: HTMLElement) {
  const avatar = tweet.querySelector<HTMLElement>(X_SELECTORS.avatar);
  if (!avatar) return;

  const evidence = extractRenderedTweet(tweet);
  const result = scoreContentSuspicion(evidence.status === 'ready' ? evidence.text : null);
  const description = indicatorDescription(result.level, result.reasons);

  avatar.setAttribute(INDICATOR_ATTRIBUTE, result.level);
  avatar.setAttribute(EVIDENCE_ATTRIBUTE, evidence.status);
  avatar.classList.remove(...SIGNAL_CLASSES);
  avatar.classList.add('taib-ai-avatar-signal', `taib-ai-avatar-signal--${result.level}`);
  updateAccessibleIndicator(avatar, description);
}

function scan(root: ParentNode) {
  if (root instanceof HTMLElement && root.matches(X_SELECTORS.tweet)) {
    addIndicator(root);
  }

  for (const tweet of root.querySelectorAll<HTMLElement>(X_SELECTORS.tweet)) {
    addIndicator(tweet);
  }
}

export function createTweetIndicatorLayer() {
  let observer: MutationObserver | undefined;

  return {
    start() {
      scan(document);

      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.target instanceof Element) {
            const tweet = mutation.target.closest<HTMLElement>(X_SELECTORS.tweet);
            if (tweet) addIndicator(tweet);
          }

          for (const node of mutation.addedNodes) {
            if (node instanceof Element) scan(node);
          }
        }
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
    },
    stop() {
      observer?.disconnect();
      observer = undefined;
      document.querySelectorAll<HTMLElement>(`[${INDICATOR_ATTRIBUTE}]`).forEach((avatar) => {
        avatar.removeAttribute(INDICATOR_ATTRIBUTE);
        avatar.removeAttribute(EVIDENCE_ATTRIBUTE);
        const originalTitle = avatar.getAttribute(ORIGINAL_TITLE_ATTRIBUTE);
        if (originalTitle) avatar.title = originalTitle;
        else avatar.removeAttribute('title');
        avatar.removeAttribute(ORIGINAL_TITLE_ATTRIBUTE);
        avatar.classList.remove('taib-ai-avatar-signal', ...SIGNAL_CLASSES);
        avatar.querySelector(`.${ACCESSIBLE_INDICATOR_CLASS}`)?.remove();
      });
    },
  };
}
