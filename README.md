# Twitter AI Blocker

Browser extension experiment for detecting likely AI-generated replies under large X/Twitter posts, hiding uncertain replies, and preparing a human review flow before account blocking.

## Goal

When a post is opened on X/Twitter, the extension should scan visible replies and assign each reply a human-confidence score from `0` to `100`.

- `0`: very likely AI-generated or automated.
- `100`: very likely human.
- Low score: hide from the thread and eventually block if the user enables that policy.
- Mid score: hide into a review buffer where the user can choose `let` or `block`.
- High score: leave visible.

The first implementation should avoid automatic account blocking. It should prove that reply extraction, scoring, local hiding, and review UX work reliably before any irreversible account action is added.

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

Run Chrome target:

```bash
pnpm dev:chrome
```

Run Firefox target:

```bash
pnpm dev:firefox
```

Build distributable extension output:

```bash
pnpm build:chrome
pnpm build:firefox
```

WXT writes browser-specific output under `.output/`.

## First Milestones

1. Detect when the user is on a post detail page.
2. Extract reply text, author handle, reply URL, and visible account metadata from each reply.
3. Implement a deterministic local scoring baseline.
4. Hide low and mid-confidence replies without mutating the X account.
5. Add a review buffer with `let` and `block` actions.
6. Store human decisions locally for evaluation.
7. Add an optional X API blocking integration only after OAuth and explicit consent are designed.

## Open Questions

- Should the first version support only English replies, or multilingual scoring from the start?
- Should suspected replies be hidden immediately, blurred, collapsed, or moved to a side buffer?
- Should user feedback stay fully local, or can anonymized examples be exported manually for model tuning?
- What false-positive rate is acceptable before adding any automatic block mode?
