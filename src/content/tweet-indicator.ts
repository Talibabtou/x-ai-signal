import { type SuspicionLevel, scoreContentSuspicion } from '../scoring/content-suspicion';
import { extractRenderedTweet } from './tweet-extractor';
import { X_SELECTORS } from './x-selectors';

const INDICATOR_ATTRIBUTE = 'data-taib-ai-indicator';
const EVIDENCE_ATTRIBUTE = 'data-taib-ai-evidence';
const ACCESSIBLE_INDICATOR_CLASS = 'taib-ai-accessible-signal';
const HOVER_CARD_INDICATOR_CLASS = 'taib-ai-hover-card-signal';
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
}

function updateHoverCardIndicator(avatar: HTMLElement | undefined) {
  const description = avatar
    ?.querySelector<HTMLElement>(`.${ACCESSIBLE_INDICATOR_CLASS}`)
    ?.getAttribute('aria-label');
  const level = avatar?.getAttribute(INDICATOR_ATTRIBUTE) as SuspicionLevel | null | undefined;

  for (const hoverCard of document.querySelectorAll<HTMLElement>(X_SELECTORS.hoverCard)) {
    let indicator = hoverCard.querySelector<HTMLElement>(`.${HOVER_CARD_INDICATOR_CLASS}`);

    if (!description || !level) {
      indicator?.remove();
      continue;
    }

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = HOVER_CARD_INDICATOR_CLASS;
      indicator.innerHTML =
        '<span class="taib-ai-hover-card-dot" aria-hidden="true"></span><span class="taib-ai-hover-card-text"></span>';
      (hoverCard.firstElementChild ?? hoverCard).append(indicator);
    }

    indicator.setAttribute('aria-label', description);
    if (indicator.getAttribute('data-taib-ai-level') !== level) {
      indicator.setAttribute('data-taib-ai-level', level);
    }

    const text = indicator.querySelector<HTMLElement>('.taib-ai-hover-card-text');
    if (text && text.textContent !== description) {
      text.textContent = description;
    }
  }
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
  let activeAvatar: HTMLElement | undefined;
  let clearActiveAvatarTimer: number | undefined;

  const keepActiveAvatar = () => {
    if (clearActiveAvatarTimer !== undefined) {
      window.clearTimeout(clearActiveAvatarTimer);
      clearActiveAvatarTimer = undefined;
    }
  };

  const clearActiveAvatarAfterDelay = () => {
    if (clearActiveAvatarTimer !== undefined) return;

    clearActiveAvatarTimer = window.setTimeout(() => {
      activeAvatar = undefined;
      clearActiveAvatarTimer = undefined;
      updateHoverCardIndicator(undefined);
    }, 1000);
  };

  const handlePointerOver = (event: Event) => {
    if (!(event.target instanceof Element)) return;

    const avatar = event.target.closest<HTMLElement>(`[${INDICATOR_ATTRIBUTE}]`);
    if (avatar) {
      keepActiveAvatar();
      activeAvatar = avatar;
      updateHoverCardIndicator(activeAvatar);
      return;
    }

    if (event.target.closest(X_SELECTORS.hoverCard)) {
      keepActiveAvatar();
      return;
    }

    clearActiveAvatarAfterDelay();
  };

  return {
    start() {
      scan(document);
      document.addEventListener('pointerover', handlePointerOver, true);
      document.addEventListener('focusin', handlePointerOver, true);

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

        updateHoverCardIndicator(activeAvatar);
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
    },
    stop() {
      observer?.disconnect();
      observer = undefined;
      keepActiveAvatar();
      activeAvatar = undefined;
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('focusin', handlePointerOver, true);
      document.querySelectorAll(`.${HOVER_CARD_INDICATOR_CLASS}`).forEach((indicator) => {
        indicator.remove();
      });
      document.querySelectorAll<HTMLElement>(`[${INDICATOR_ATTRIBUTE}]`).forEach((avatar) => {
        avatar.removeAttribute(INDICATOR_ATTRIBUTE);
        avatar.removeAttribute(EVIDENCE_ATTRIBUTE);
        avatar.classList.remove('taib-ai-avatar-signal', ...SIGNAL_CLASSES);
        avatar.querySelector(`.${ACCESSIBLE_INDICATOR_CLASS}`)?.remove();
      });
    },
  };
}
