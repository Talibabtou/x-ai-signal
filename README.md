# X AI Signal

Read-only browser extension experiment that adds an AI-writing suspicion indicator beside visible X/Twitter posts. It does not hide posts or perform account actions.

## Goal

The first milestone adds one gray border around the profile picture on every visible tweet and reply. Later milestones can color it from green to red using explainable, local signals.

- Gray: not scored or insufficient information.
- Green: few suspicious writing signals.
- Amber: mixed signals.
- Red: several suspicious writing signals.

Colors express suspicion, not proof of human or AI authorship. The user decides what to do with the information.

## Current Recommendation

Use a Manifest V3 WebExtension built with WXT.

Why:

- One TypeScript codebase can target Chrome and Firefox.
- WXT gives fast local extension reloads and browser-specific builds.
- Content scripts can inspect the X page and inject the review buffer UI.
- Background service workers can later handle storage, OAuth, and API calls.
- Permissions can stay narrow to `x.com` and `twitter.com`.

## Constraints

X/Twitter does not provide a stable public DOM contract. Reading visible replies from the page is practical for an extension prototype, but it will be selector-fragile.

Automatic blocking is the riskiest part:

- UI-click automation is fragile and may be interpreted as suspicious account automation.
- The official X API exposes block endpoints, but requires developer access, OAuth, and compliance with X policy.
- The safer path is human-confirmed blocking first, then an explicit opt-in automatic mode only after rate limits, audit logs, and policy review exist.

See [resources/research.md](resources/RESEARCH.md) for source links and implementation notes.

## Project Structure

```text
.
├── resources/            # Research notes, policies, experiments, screenshots
├── src/
│   ├── entrypoints/      # WXT extension entrypoints: content script, background, popup
│   ├── content/          # DOM scanning and X page integration
│   ├── scoring/          # Human-confidence scoring
│   ├── ui/               # Injected page UI and extension popup styling
│   └── types.ts
├── AGENTS.md             # Working instructions for future coding agents
├── README.md
├── package.json
├── tsconfig.json
└── wxt.config.ts
```

## Local Development

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

Verify checks and both production builds:

```bash
pnpm verify
```

## First Milestones

1. Add exactly one gray profile-picture border to every visible tweet and reply.
2. Extract the tweet's own rendered text and visible author information.
3. Add a small deterministic suspicion score with visible reasons.
4. Verify the same read-only behavior in Chromium and Firefox.

## Open Questions

- Should unsupported languages remain gray until they have their own evaluated signals?
- Which rendered account fields are stable enough to use without visiting profiles or calling X endpoints?
- Should the first colored score use a number, four bands, or only the color and reasons?
