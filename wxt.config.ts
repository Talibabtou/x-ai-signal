import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Twitter AI Blocker',
    description:
      'Scores X/Twitter replies and hides or queues suspected AI-generated replies for review.',
    permissions: ['storage'],
    host_permissions: ['https://x.com/*', 'https://twitter.com/*'],
    action: {
      default_title: 'Twitter AI Blocker',
    },
  },
});
