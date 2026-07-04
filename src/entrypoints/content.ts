import { createTweetIndicatorLayer } from '../content/tweet-indicator';
import '../ui/tweet-indicator.css';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    const indicators = createTweetIndicatorLayer();
    indicators.start();
    ctx.onInvalidated(indicators.stop);
  },
});
