import {
  type AccountScoreV1,
  createPostObservation,
  normalizeAccountKey,
  type ObservePostMessage,
  type ObservePostResponse,
  type UpdateProfileMessage,
  type UpdateProfileResponse,
} from '../scoring/account-evidence';
import { type SuspicionLevel, scoreContentSuspicion } from '../scoring/content-suspicion';
import { detectAvatarShape } from '../ui/avatar-shape';
import { coverageOpacity, humanScoreColor } from '../ui/signal-color';
import { extractRenderedProfileCard, extractRenderedProfilePage } from './profile-card-extractor';
import { extractRenderedTweet } from './tweet-extractor';
import { X_SELECTORS } from './x-selectors';

const INDICATOR_ATTRIBUTE = 'data-taib-ai-indicator';
const EVIDENCE_ATTRIBUTE = 'data-taib-ai-evidence';
const SCORE_ATTRIBUTE = 'data-taib-ai-human-score';
const COVERAGE_ATTRIBUTE = 'data-taib-ai-coverage';
const ACCOUNT_ATTRIBUTE = 'data-taib-ai-account-key';
const AVATAR_SHAPE_ATTRIBUTE = 'data-taib-ai-avatar-shape';
const ACCESSIBLE_INDICATOR_CLASS = 'taib-ai-accessible-signal';
const HOVER_CARD_INDICATOR_CLASS = 'taib-ai-hover-card-signal';
const SIGNAL_CLASSES = [
  'taib-ai-avatar-signal--unknown',
  'taib-ai-avatar-signal--low',
  'taib-ai-avatar-signal--medium',
  'taib-ai-avatar-signal--high',
];

function indicatorDescription(humanScore: number, coverage: number, reasons: string[]): string {
  return `Human-likeness: ${humanScore}% · reliability: ${coverage}%. ${reasons.join(' ')}`;
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
  const score = avatar?.getAttribute(SCORE_ATTRIBUTE);
  const coverage = avatar?.getAttribute(COVERAGE_ATTRIBUTE);
  const signalColor = avatar?.style.getPropertyValue('--taib-ai-signal-color');

  for (const hoverCard of document.querySelectorAll<HTMLElement>(X_SELECTORS.hoverCard)) {
    let indicator = hoverCard.querySelector<HTMLElement>(`.${HOVER_CARD_INDICATOR_CLASS}`);
    const contentRoot = hoverCard.firstElementChild;

    if (!description || !level || !score || !coverage || !(contentRoot instanceof HTMLElement)) {
      indicator?.remove();
      continue;
    }

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = HOVER_CARD_INDICATOR_CLASS;
      indicator.innerHTML =
        '<span class="taib-ai-hover-card-dot" aria-hidden="true"></span><span class="taib-ai-hover-card-text"></span>';
      contentRoot.append(indicator);
    } else if (
      indicator.parentElement !== contentRoot ||
      indicator !== contentRoot.lastElementChild
    ) {
      contentRoot.append(indicator);
    }

    indicator.setAttribute('aria-label', description);
    indicator.style.setProperty('--taib-ai-signal-color', signalColor || '#71767b');
    if (indicator.getAttribute('data-taib-ai-level') !== level) {
      indicator.setAttribute('data-taib-ai-level', level);
    }

    const text = indicator.querySelector<HTMLElement>('.taib-ai-hover-card-text');
    const shortDescription = `Human-likeness: ${score}% · reliability: ${coverage}%`;
    if (text && text.textContent !== shortDescription) {
      text.textContent = shortDescription;
    }
  }
}

function applyScoreToAvatar(
  avatar: HTMLElement,
  score: Pick<AccountScoreV1, 'humanScore' | 'coverage' | 'level' | 'reasons'>,
) {
  const signalColor = humanScoreColor(score.humanScore);
  const borderColor = humanScoreColor(score.humanScore, coverageOpacity(score.coverage));
  const description = indicatorDescription(score.humanScore, score.coverage, score.reasons);

  avatar.setAttribute(INDICATOR_ATTRIBUTE, score.level);
  avatar.setAttribute(SCORE_ATTRIBUTE, String(score.humanScore));
  avatar.setAttribute(COVERAGE_ATTRIBUTE, String(score.coverage));
  avatar.setAttribute(AVATAR_SHAPE_ATTRIBUTE, detectAvatarShape(avatar));
  avatar.style.setProperty('--taib-ai-signal-color', signalColor);
  avatar.style.setProperty('--taib-ai-border-color', borderColor);
  avatar.classList.remove(...SIGNAL_CLASSES);
  avatar.classList.add('taib-ai-avatar-signal', `taib-ai-avatar-signal--${score.level}`);
  updateAccessibleIndicator(avatar, description);
}

function updateAccountIndicators(accountKey: string, score: AccountScoreV1) {
  for (const avatar of document.querySelectorAll<HTMLElement>(`[${ACCOUNT_ATTRIBUTE}]`)) {
    if (avatar.getAttribute(ACCOUNT_ATTRIBUTE) === accountKey) {
      applyScoreToAvatar(avatar, score);
    }
  }
}

function addIndicator(tweet: HTMLElement, observedTweets: WeakSet<HTMLElement>) {
  const avatar = tweet.querySelector<HTMLElement>(X_SELECTORS.avatar);
  if (!avatar) return;
  if (observedTweets.has(tweet) && avatar.hasAttribute(SCORE_ATTRIBUTE)) return;

  const evidence = extractRenderedTweet(tweet);
  const result = scoreContentSuspicion(evidence.status === 'ready' ? evidence.text : null, {
    probableSpam: evidence.probableSpam,
  });
  const accountKey = evidence.handle ? normalizeAccountKey(evidence.handle) : null;

  avatar.setAttribute(EVIDENCE_ATTRIBUTE, evidence.status);
  if (accountKey) avatar.setAttribute(ACCOUNT_ATTRIBUTE, accountKey);
  applyScoreToAvatar(avatar, result);

  if (!observedTweets.has(tweet) && evidence.handle) {
    observedTweets.add(tweet);
    const observation = createPostObservation(
      evidence.handle,
      evidence.text,
      evidence.postId,
      evidence.publishedAt,
      result,
      evidence.probableSpam,
      {
        linkDomains: evidence.linkDomains,
        mentionCount: evidence.mentionCount,
        hasMedia: evidence.hasMedia,
        kind: evidence.kind,
        language: evidence.language,
      },
    );

    if (observation) {
      const message: ObservePostMessage = { type: 'x-ai-signal:observe-post', observation };
      void browser.runtime
        .sendMessage(message)
        .then((response: ObservePostResponse | undefined) => {
          if (response) updateAccountIndicators(observation.accountKey, response.score);
        })
        .catch(() => undefined);
    }
  }
}

function scan(root: ParentNode, observedTweets: WeakSet<HTMLElement>) {
  if (root instanceof HTMLElement && root.matches(X_SELECTORS.tweet)) {
    addIndicator(root, observedTweets);
  }

  for (const tweet of root.querySelectorAll<HTMLElement>(X_SELECTORS.tweet)) {
    addIndicator(tweet, observedTweets);
  }
}

export function createTweetIndicatorLayer() {
  let observer: MutationObserver | undefined;
  let activeAvatar: HTMLElement | undefined;
  let clearActiveAvatarTimer: number | undefined;
  let profileContextScanTimer: number | undefined;
  const observedTweets = new WeakSet<HTMLElement>();
  const observedProfileSnapshots = new Map<string, string>();

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
      scheduleProfileContextScan();
      return;
    }

    if (event.target.closest(X_SELECTORS.hoverCard)) {
      keepActiveAvatar();
      scheduleProfileContextScan();
      return;
    }

    clearActiveAvatarAfterDelay();
  };

  const observeProfileEvidence = (evidence: ReturnType<typeof extractRenderedProfileCard>) => {
    if (!evidence) return;

    const snapshotKey = JSON.stringify(evidence.profile);
    if (observedProfileSnapshots.get(evidence.accountKey) === snapshotKey) return;

    observedProfileSnapshots.set(evidence.accountKey, snapshotKey);
    const message: UpdateProfileMessage = {
      type: 'x-ai-signal:update-profile',
      accountKey: evidence.accountKey,
      profile: evidence.profile,
    };

    void browser.runtime
      .sendMessage(message)
      .then((response: UpdateProfileResponse | undefined) => {
        if (response) updateAccountIndicators(evidence.accountKey, response.score);
      })
      .catch(() => undefined);
  };

  const observeVisibleProfileContexts = () => {
    for (const hoverCard of document.querySelectorAll<HTMLElement>(X_SELECTORS.hoverCard)) {
      observeProfileEvidence(extractRenderedProfileCard(hoverCard));
    }

    const profilePage = extractRenderedProfilePage(document);
    observeProfileEvidence(profilePage);
  };

  const scheduleProfileContextScan = () => {
    if (profileContextScanTimer !== undefined) return;

    profileContextScanTimer = window.setTimeout(() => {
      profileContextScanTimer = undefined;
      observeVisibleProfileContexts();
    }, 150);
  };

  return {
    start() {
      scan(document, observedTweets);
      observeVisibleProfileContexts();
      document.addEventListener('pointerover', handlePointerOver, true);
      document.addEventListener('focusin', handlePointerOver, true);

      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.target instanceof Element) {
            const tweet = mutation.target.closest<HTMLElement>(X_SELECTORS.tweet);
            if (tweet) addIndicator(tweet, observedTweets);
          }

          for (const node of mutation.addedNodes) {
            if (node instanceof Element) scan(node, observedTweets);
          }
        }

        updateHoverCardIndicator(activeAvatar);
        scheduleProfileContextScan();
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
    },
    stop() {
      observer?.disconnect();
      observer = undefined;
      keepActiveAvatar();
      if (profileContextScanTimer !== undefined) {
        window.clearTimeout(profileContextScanTimer);
        profileContextScanTimer = undefined;
      }
      activeAvatar = undefined;
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('focusin', handlePointerOver, true);
      document.querySelectorAll(`.${HOVER_CARD_INDICATOR_CLASS}`).forEach((indicator) => {
        indicator.remove();
      });
      document.querySelectorAll<HTMLElement>(`[${INDICATOR_ATTRIBUTE}]`).forEach((avatar) => {
        avatar.removeAttribute(INDICATOR_ATTRIBUTE);
        avatar.removeAttribute(EVIDENCE_ATTRIBUTE);
        avatar.removeAttribute(SCORE_ATTRIBUTE);
        avatar.removeAttribute(COVERAGE_ATTRIBUTE);
        avatar.removeAttribute(ACCOUNT_ATTRIBUTE);
        avatar.removeAttribute(AVATAR_SHAPE_ATTRIBUTE);
        avatar.style.removeProperty('--taib-ai-signal-color');
        avatar.style.removeProperty('--taib-ai-border-color');
        avatar.classList.remove('taib-ai-avatar-signal', ...SIGNAL_CLASSES);
        avatar.querySelector(`.${ACCESSIBLE_INDICATOR_CLASS}`)?.remove();
      });
    },
  };
}
