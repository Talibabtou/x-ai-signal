const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const AVATAR_SELECTOR = '[data-testid="Tweet-User-Avatar"]';
const INDICATOR_ATTRIBUTE = 'data-taib-ai-indicator';

function addIndicator(tweet: HTMLElement) {
  const avatar = tweet.querySelector<HTMLElement>(AVATAR_SELECTOR);
  if (!avatar || avatar.hasAttribute(INDICATOR_ATTRIBUTE)) return;

  avatar.setAttribute(INDICATOR_ATTRIBUTE, 'unknown');
  avatar.classList.add('taib-ai-avatar-signal', 'taib-ai-avatar-signal--unknown');
}

function scan(root: ParentNode) {
  if (root instanceof HTMLElement && root.matches(TWEET_SELECTOR)) {
    addIndicator(root);
  }

  for (const tweet of root.querySelectorAll<HTMLElement>(TWEET_SELECTOR)) {
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
            const tweet = mutation.target.closest<HTMLElement>(TWEET_SELECTOR);
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
        avatar.classList.remove('taib-ai-avatar-signal', 'taib-ai-avatar-signal--unknown');
      });
    },
  };
}
