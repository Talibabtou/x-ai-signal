import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'extension-builds',
  webExt: {
    disabled: true,
  },
  manifest: {
    name: 'X AI Signal',
    description: 'Adds a read-only AI-writing suspicion indicator to visible X/Twitter posts.',
  },
});
