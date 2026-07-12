# X AI Signal

Read-only browser extension that adds a local human-likeness signal to visible X/Twitter posts. It does not hide posts, click controls, block accounts, call private X endpoints, or send tweet/account data to a server.

The extension is built for the current safer product direction: help the user notice suspicious reply/account behavior, then let the user decide what to do.

## What the score means

Each visible avatar can show a border from red to yellow to green:

- `0%`: observed evidence looks strongly machine-like or spam-like.
- `50%`: neutral or insufficient evidence.
- `100%`: observed evidence looks strongly human-compatible.

This is not a certainty score. The extension never claims that an account is confirmed AI or confirmed human.

The border opacity comes from evidence reliability:

- `0%` reliability: no visible border.
- `20%` reliability: weak early evidence.
- `50%` reliability: half-opacity border.
- `100%` reliability: fully opaque border.

Reliability grows as the browser observes more useful evidence for the same handle.

## Current scoring inputs

The score is local-first and account-based. When the same handle appears multiple times, the extension stores bounded derived evidence and updates every visible avatar for that handle to the same account score.

Currently used signals:

- Content-only writing baseline:
  - too little text returns neutral `50%` with zero reliability;
  - formulaic phrases, strongly structured lists, and repeated contrast framing lower the score;
  - absence of configured writing-pattern signals gives a small positive baseline.
- X probable-spam context:
  - replies rendered after X's “Show probable spam” control receive a bounded penalty;
  - this is treated as useful context, not proof.
- Exact repetition:
  - repeated normalized text hashes from the same account lower the score;
  - raw tweet text is not stored.
- Near-duplicate repetition:
  - 64-bit character n-gram SimHash catches lightly edited repeated templates from the same account;
  - only the account's capped recent local history is compared.
- Repeated external link domains:
  - repeatedly sharing the same external domain adds a small penalty.
- Repeated shape of behavior:
  - very similar text lengths across enough recent posts lower the score;
  - varied text lengths add a small human-compatible signal;
  - unusually high mention density lowers the score.
- Media mix:
  - some media posts add a weak human-compatible signal;
  - this is intentionally small because media can also be automated.
- Rendered profile-card context:
  - follower count;
  - following count;
  - common follows / “others you follow” count;
  - “follows you” / mutual-follow labels when rendered;
  - verification icon when rendered.
- Lightweight extracted context:
  - post ID and timestamp when rendered;
  - text length;
  - link domains;
  - mention count;
  - media presence;
  - language when rendered;
  - simple post kind when detectable.

Stored account history is capped at 50 recent post signatures or 30 days.

The account formula is continuous. It starts from weighted observed-post scores, then applies bounded positive and negative adjustments. This allows scores like `92%`, `67%`, or `14%` instead of only fixed buckets. Reliability controls how strongly that score should be trusted visually.

## What is not used yet

Not implemented yet:

- profile-page follower/following enrichment beyond the current rendered DOM snapshot;
- account age;
- conversation-aware relevance to parent posts;
- temporal activity patterns;
- cross-account coordination;
- remote classifiers or shared reputation lists.

These are planned only if they can stay local, explainable, and low-risk for the user's account.

## Privacy and safety boundary

By default, the extension stores only derived local evidence in `browser.storage.local`. It does not store full tweet text and does not send tweet content, handles, or account metadata to third parties.

The popup shows local storage usage, account count, observation count, retention policy, and a confirmed “Delete all local evidence” control.

## Architecture

- Framework: WXT.
- Browser targets: Chromium/Chrome/Brave and Firefox.
- Manifest: MV3 for Chromium, WXT-generated Firefox target.
- Content script: reads rendered X DOM and injects read-only avatar/hover-card UI.
- Background worker: owns local account evidence, batching, migration, corrupt-record recovery, and popup messages.
- Popup: storage summary and delete-local-evidence control.

## Project structure

```text
.
├── resources/            # Research notes, policy notes, fixtures, TODOs
├── src/
│   ├── entrypoints/      # WXT content, background, and popup entrypoints
│   ├── content/          # X DOM extraction and injected indicator layer
│   ├── scoring/          # Content and account scoring
│   └── ui/               # Injected CSS and UI helpers
├── tests/                # Node test suite
├── AGENTS.md             # Working instructions for future coding agents
├── README.md
├── package.json
├── tsconfig.json
└── wxt.config.ts
```

## Local development

Install dependencies:

```bash
nvm use
pnpm install
```

### Develop in the existing Brave profile

WXT is configured not to launch a separate browser. Start the development build:

```bash
pnpm dev:brave
```

For the first install only:

1. Open `brave://extensions` in the Brave profile already logged into X.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository's `extension-builds/chrome-mv3-dev` directory.

Keep `pnpm dev:brave` running. For normal TypeScript and CSS edits, save the file and refresh the X tab if the indicator does not refresh automatically. Use WXT's `Alt+R` development shortcut as a fallback.

Do not remove and re-add the extension after each edit. Only click the extension's reload button in `brave://extensions` after changing `wxt.config.ts`, the manifest, or entrypoint files. Always keep the loaded path on `extension-builds/chrome-mv3-dev`, not `extension-builds/chrome-mv3`.

Run Firefox manually when needed:

```bash
pnpm dev:firefox
```

Then load `extension-builds/firefox-mv2-dev/manifest.json` as a temporary add-on from `about:debugging`.

Build distributable extension output:

```bash
pnpm build:chrome
pnpm build:firefox
```

WXT writes browser-specific output under the visible `extension-builds/` directory. Git ignores this generated directory.

Run tests and production builds:

```bash
pnpm verify
```

## Current roadmap

See [resources/TODO.md](resources/TODO.md) for the development checklist and phase gates. See [resources/research.md](resources/research.md) for research notes on AI text detection, bot behavior, local scoring, and future shared-learning risks.
