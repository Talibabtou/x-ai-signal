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
const PROFILE_SCORE_CARD_CLASS = 'taib-ai-profile-score-card';
const PROFILE_SCORE_ANCHOR_ATTRIBUTE = 'data-taib-ai-profile-score-anchor';
const SIGNAL_CLASSES = [
  'taib-ai-avatar-signal--unknown',
  'taib-ai-avatar-signal--low',
  'taib-ai-avatar-signal--medium',
  'taib-ai-avatar-signal--high',
];

function indicatorDescription(humanScore: number, coverage: number, reasons: string[]): string {
  return `Human-likeness: ${humanScore}% · reliability: ${coverage}%. ${reasons.join(' ')}`;
}

function createMeter(label: string, value: number): string {
  const clampedValue = Math.max(0, Math.min(100, value));

  return `<div class="taib-ai-score-meter">
    <div class="taib-ai-score-meter-row">
      <span>${label}</span>
      <strong>${clampedValue}%</strong>
    </div>
    <div class="taib-ai-score-meter-track" aria-hidden="true">
      <span class="taib-ai-score-meter-cursor" style="left: ${clampedValue}%"></span>
    </div>
  </div>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

function scoreDetailsHtml(
  score: Pick<AccountScoreV1, 'humanScore' | 'coverage' | 'reasons' | 'gauges'>,
) {
  const reasons = score.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
  const gauges = score.gauges
    .map(
      (gauge) => `<div class="taib-ai-score-meter-wrap">
        ${createMeter(escapeHtml(gauge.label), gauge.value)}
        <div class="taib-ai-score-meter-detail">${escapeHtml(gauge.detail)}</div>
      </div>`,
    )
    .join('');

  return `<div class="taib-ai-hover-card-signal taib-ai-profile-score-summary">
      <span class="taib-ai-hover-card-dot" aria-hidden="true"></span>
      <span class="taib-ai-hover-card-text">Human-likeness: ${score.humanScore}% · reliability: ${score.coverage}%</span>
    </div>
    <div class="taib-ai-profile-score-body">
      ${gauges}
    </div>
    <div class="taib-ai-profile-score-reasons">
      <div class="taib-ai-profile-score-reasons-title">Why this score</div>
      <ul>${reasons}</ul>
    </div>`;
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
  avatar.setAttribute('data-taib-ai-score-details', JSON.stringify(score));
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

function hasRenderedProfileHandle(root: HTMLElement, accountKey: string): boolean {
  for (const span of root.querySelectorAll('span')) {
    if (normalizeAccountKey(span.textContent?.trim() ?? '') === accountKey) return true;
  }

  return false;
}

function findProfilePageAvatar(accountKey: string): HTMLElement | null {
  const profileRoot = document.querySelector<HTMLElement>('main');
  if (!profileRoot) return null;

  if (!hasRenderedProfileHandle(profileRoot, accountKey)) return null;

  const avatarSelector = `${X_SELECTORS.profileAvatar}, ${X_SELECTORS.avatar}`;
  for (const avatar of profileRoot.querySelectorAll<HTMLElement>(avatarSelector)) {
    if (avatar.closest(X_SELECTORS.tweet) || avatar.closest(X_SELECTORS.hoverCard)) continue;
    return avatar;
  }

  return null;
}

function updateProfilePageAvatar(accountKey: string, score: AccountScoreV1) {
  const avatar = findProfilePageAvatar(accountKey);
  if (!avatar) return;

  avatar.setAttribute(ACCOUNT_ATTRIBUTE, accountKey);
  avatar.setAttribute(PROFILE_SCORE_ANCHOR_ATTRIBUTE, 'true');
  applyScoreToAvatar(avatar, score);
}

function scoreFromAvatar(
  avatar: HTMLElement,
): Pick<AccountScoreV1, 'humanScore' | 'coverage' | 'level' | 'reasons' | 'gauges'> | null {
  const rawScore = avatar.getAttribute('data-taib-ai-score-details');
  if (!rawScore) return null;

  try {
    const score = JSON.parse(rawScore) as Partial<AccountScoreV1>;
    if (
      typeof score.humanScore === 'number' &&
      typeof score.coverage === 'number' &&
      typeof score.level === 'string' &&
      Array.isArray(score.reasons)
    ) {
      return {
        humanScore: score.humanScore,
        coverage: score.coverage,
        level: score.level,
        reasons: score.reasons.filter((reason): reason is string => typeof reason === 'string'),
        gauges: Array.isArray(score.gauges)
          ? score.gauges.filter(
              (gauge): gauge is AccountScoreV1['gauges'][number] =>
                gauge !== null &&
                typeof gauge === 'object' &&
                typeof gauge.id === 'string' &&
                typeof gauge.label === 'string' &&
                typeof gauge.value === 'number' &&
                typeof gauge.detail === 'string',
            )
          : [
              {
                id: 'final',
                label: 'Final score',
                value: score.humanScore,
                detail: 'Combined bounded account score.',
              },
              {
                id: 'reliability',
                label: 'Reliability',
                value: score.coverage,
                detail: 'How much local evidence supports it.',
              },
            ],
      };
    }
  } catch {
    return null;
  }

  return null;
}

function removeProfileScoreCard() {
  document.querySelector(`.${PROFILE_SCORE_CARD_CLASS}`)?.remove();
}

function updateProfileScoreCard(avatar: HTMLElement | undefined) {
  if (avatar?.getAttribute(PROFILE_SCORE_ANCHOR_ATTRIBUTE) !== 'true') {
    removeProfileScoreCard();
    return;
  }

  const score = scoreFromAvatar(avatar);
  if (!score) {
    removeProfileScoreCard();
    return;
  }

  let card = document.querySelector<HTMLElement>(`.${PROFILE_SCORE_CARD_CLASS}`);
  if (!card) {
    card = document.createElement('div');
    card.className = PROFILE_SCORE_CARD_CLASS;
    card.setAttribute('role', 'tooltip');
    document.body.append(card);
  }

  const scoreKey = JSON.stringify(score);
  if (card.getAttribute('data-taib-ai-score-card-key') !== scoreKey) {
    card.setAttribute('data-taib-ai-score-card-key', scoreKey);
    card.innerHTML = scoreDetailsHtml(score);
    card.style.setProperty('--taib-ai-signal-color', humanScoreColor(score.humanScore));
  }
  const avatarRect = avatar.getBoundingClientRect();
  const cardWidth = Math.min(360, Math.max(280, window.innerWidth - 24));
  const left = Math.min(
    window.innerWidth - cardWidth - 12,
    Math.max(12, avatarRect.left + avatarRect.width / 2 - cardWidth / 2),
  );
  const top =
    avatarRect.bottom + 12 + 280 > window.innerHeight
      ? Math.max(12, avatarRect.top - 292)
      : avatarRect.bottom + 12;

  card.style.setProperty('--taib-ai-profile-card-width', `${cardWidth}px`);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function isOwnInjectedNode(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(
    element?.closest(`.${PROFILE_SCORE_CARD_CLASS}`) ||
      element?.closest(`.${HOVER_CARD_INDICATOR_CLASS}`) ||
      element?.closest(`.${ACCESSIBLE_INDICATOR_CLASS}`),
  );
}

function stableProfileSnapshotKey(evidence: ReturnType<typeof extractRenderedProfileCard>): string {
  if (!evidence) return '';

  return JSON.stringify({
    followers: evidence.profile.followers,
    following: evidence.profile.following,
    commonFollows: evidence.profile.commonFollows,
    relationshipLabel: evidence.profile.relationshipLabel,
    verified: evidence.profile.verified,
  });
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
        conversationId: evidence.conversationId,
        hasVisibleParentContext: evidence.hasVisibleParentContext,
        activeHour: evidence.activeHour,
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
  let activeProfileAvatar: HTMLElement | undefined;
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
      activeProfileAvatar = undefined;
      clearActiveAvatarTimer = undefined;
      updateHoverCardIndicator(undefined);
      updateProfileScoreCard(undefined);
    }, 1000);
  };

  const resetActiveUi = () => {
    keepActiveAvatar();
    activeAvatar = undefined;
    activeProfileAvatar = undefined;
    updateHoverCardIndicator(undefined);
    updateProfileScoreCard(undefined);
  };

  const handlePointerOver = (event: Event) => {
    if (!(event.target instanceof Element)) return;

    const avatar = event.target.closest<HTMLElement>(`[${INDICATOR_ATTRIBUTE}]`);
    if (avatar) {
      keepActiveAvatar();
      activeAvatar = avatar;
      activeProfileAvatar =
        avatar.getAttribute(PROFILE_SCORE_ANCHOR_ATTRIBUTE) === 'true' ? avatar : undefined;
      updateHoverCardIndicator(activeAvatar);
      updateProfileScoreCard(activeProfileAvatar);
      scheduleProfileContextScan();
      return;
    }

    if (
      event.target.closest(X_SELECTORS.hoverCard) ||
      event.target.closest(`.${PROFILE_SCORE_CARD_CLASS}`)
    ) {
      keepActiveAvatar();
      scheduleProfileContextScan();
      return;
    }

    clearActiveAvatarAfterDelay();
  };

  const observeProfileEvidence = (evidence: ReturnType<typeof extractRenderedProfileCard>) => {
    if (!evidence) return;

    const snapshotKey = stableProfileSnapshotKey(evidence);
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
        if (response) {
          updateProfilePageAvatar(evidence.accountKey, response.score);
          updateAccountIndicators(evidence.accountKey, response.score);
          updateProfileScoreCard(activeProfileAvatar);
        }
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
          if (isOwnInjectedNode(mutation.target)) continue;

          if (mutation.target instanceof Element) {
            const tweet = mutation.target.closest<HTMLElement>(X_SELECTORS.tweet);
            if (tweet) addIndicator(tweet, observedTweets);
          }

          for (const node of mutation.addedNodes) {
            if (isOwnInjectedNode(node)) continue;
            if (node instanceof Element) scan(node, observedTweets);
          }
        }

        updateHoverCardIndicator(activeAvatar);
        updateProfileScoreCard(activeProfileAvatar);
        scheduleProfileContextScan();
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
    },
    rescan() {
      resetActiveUi();
      window.setTimeout(() => {
        scan(document, observedTweets);
        observeVisibleProfileContexts();
      }, 100);
    },
    stop() {
      observer?.disconnect();
      observer = undefined;
      resetActiveUi();
      if (profileContextScanTimer !== undefined) {
        window.clearTimeout(profileContextScanTimer);
        profileContextScanTimer = undefined;
      }
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('focusin', handlePointerOver, true);
      removeProfileScoreCard();
      document.querySelectorAll(`.${HOVER_CARD_INDICATOR_CLASS}`).forEach((indicator) => {
        indicator.remove();
      });
      document.querySelectorAll<HTMLElement>(`[${INDICATOR_ATTRIBUTE}]`).forEach((avatar) => {
        avatar.removeAttribute(INDICATOR_ATTRIBUTE);
        avatar.removeAttribute(EVIDENCE_ATTRIBUTE);
        avatar.removeAttribute(SCORE_ATTRIBUTE);
        avatar.removeAttribute(COVERAGE_ATTRIBUTE);
        avatar.removeAttribute(ACCOUNT_ATTRIBUTE);
        avatar.removeAttribute(PROFILE_SCORE_ANCHOR_ATTRIBUTE);
        avatar.removeAttribute('data-taib-ai-score-details');
        avatar.removeAttribute(AVATAR_SHAPE_ATTRIBUTE);
        avatar.style.removeProperty('--taib-ai-signal-color');
        avatar.style.removeProperty('--taib-ai-border-color');
        avatar.classList.remove('taib-ai-avatar-signal', ...SIGNAL_CLASSES);
        avatar.querySelector(`.${ACCESSIBLE_INDICATOR_CLASS}`)?.remove();
      });
    },
  };
}
