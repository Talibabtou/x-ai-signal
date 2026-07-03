# AGENTS.md

## Project Intent

This repository builds a Chrome and Firefox extension that reduces time wasted on likely AI-generated replies under X/Twitter posts. The product should favor user control, local-first scoring, and reversible UI actions before any account-level blocking automation.

## Architecture

- Framework: WXT with Manifest V3.
- Browser targets: Chrome and Firefox.
- Extension entrypoints live in `src/entrypoints/`.
- Reusable implementation lives in `src/`.
- Research, policy notes, test fixtures, and screenshots live in `resources/`.

Core surfaces:

- `src/entrypoints/content.ts`: page integration on `x.com` and `twitter.com`.
- `src/entrypoints/background.ts`: background service worker for browser APIs, storage, messaging, and future OAuth/API work.
- `src/entrypoints/popup.html` and `src/entrypoints/popup.ts`: extension popup and settings.
- `src/content/`: reply scanning and DOM extraction.
- `src/scoring/`: deterministic and future model scoring.
- `src/ui/`: injected review UI and popup CSS.

## Development Commands

```bash
nvm use
pnpm install
pnpm dev:chrome
pnpm dev:firefox
pnpm check
pnpm build:chrome
pnpm build:firefox
```

## Guardrails

- Do not add automatic blocking by DOM-clicking the X web UI without explicit user approval and a policy review.
- Do not send tweet content, handles, or account metadata to any third-party service by default.
- Keep host permissions limited to X/Twitter unless a concrete feature requires more.
- Prefer local deterministic scoring for early iterations.
- Treat X DOM selectors as unstable. Keep selectors isolated in `src/content/`.
- Store human review decisions locally first.
- Any future remote classifier must have a visible privacy setting and a clear data-retention note.

## Coding Style

- TypeScript strict mode.
- Keep content-script DOM mutation small and reversible.
- Keep scoring functions pure where possible.
- Avoid unrelated refactors while iterating.
- Add focused tests when scoring logic or DOM extraction grows beyond simple prototypes.

## Product Principles

- False positives are more damaging than false negatives.
- Human-confirmed actions should come before irreversible account actions.
- The extension should make hidden content recoverable from a review buffer.
- The user should be able to understand why a reply was scored poorly.
