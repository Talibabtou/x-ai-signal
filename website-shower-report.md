# Website Shower report

Report mode: read-only repository audit. No audited source or config files were changed.

Commands used:

- `scan-website-shower.sh .`
- focused `rg`, file inspection, Git status/history, and generated-manifest inspection
- `pnpm check`
- `pnpm build:chrome`
- `pnpm build:firefox`

Inspected scope:

- Framework entrypoints: `src/entrypoints/`, `wxt.config.ts`
- Feature roots: `src/content/`, `src/scoring/`, `src/ui/`, `src/popup/`
- Boundaries: X DOM, extension storage permission, background worker, popup, injected content UI
- Tests/stories: none found
- Generated output: `.wxt/` and `.output/` inspected only to verify manifests/build targets; excluded from source findings
- Dependencies: root `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`
- Working tree: existing uncommitted user changes were preserved

## Findings

### State and domain contracts

- [ ] WS-001 Make collapse settings the single owner of thresholds
  Evidence: high
  Change risk: medium
  Boundaries: local-storage, state-store
  Files:
  - `src/content/reply-scanner.ts:21`
  - `src/popup/main.ts:11`
  - `src/popup/main.ts:15`
  Why:
  The collapse threshold `30` appears in runtime code and inert popup markup, while `70` has no consumer. Changing the popup does not change behavior.
  Safe action:
  Define a typed settings contract with defaults, persist it through extension storage, and make the scanner consume it.
  Validation:
  Unit-test defaults and storage migration; verify live changes in Brave.

- [ ] WS-002 Separate serializable verdict data from DOM ownership
  Evidence: high
  Change risk: medium
  Boundaries: state-store, local-storage
  Files:
  - `src/types.ts:1`
  - `src/content/reply-scanner.ts:27`
  - `src/ui/review-buffer.ts:15`
  Why:
  `ReplyVerdict` contains an `HTMLElement`, tying scoring/review data to one page node and preventing clean persistence. The element currently exists only to support restoration, but restoration was never implemented.
  Safe action:
  Store normalized verdict data by reply ID and keep DOM references in a content-script-owned map.
  Validation:
  Typecheck, serialize a verdict in a unit test, and test restore after review.

### Component hygiene

- [ ] WS-003 Give injected UI an idempotent lifecycle
  Evidence: high
  Change risk: medium
  Boundaries: framework-entrypoint
  Files:
  - `src/entrypoints/content.ts:8`
  - `src/ui/review-buffer.ts:4`
  Why:
  `mountReviewBuffer` always appends a new root and exposes no teardown. Development reloads or future route remounting can duplicate UI and retain stale verdicts.
  Safe action:
  Guard by a stable root ID and return `destroy`, `restoreAll`, and clear methods.
  Validation:
  Mount twice, assert one root, then destroy and assert no injected nodes remain.

- [ ] WS-004 Bound or virtualize the review list after review actions exist
  Evidence: medium
  Change risk: low
  Files:
  - `src/ui/review-buffer.ts:15`
  - `src/ui/review-buffer.ts:24`
  Why:
  The buffer retains every verdict and replaces every row on each addition. Long threads will create avoidable work and an unwieldy panel.
  Safe action:
  Keep a bounded recent queue or render pages. Do this after the review-state contract exists.
  Validation:
  Add 500 fixture verdicts and assert the rendered node limit.

### TypeScript hygiene

- [ ] WS-005 Remove repeated `HTMLElement` assertions in the scanner
  Evidence: high
  Change risk: low
  Files:
  - `src/content/reply-scanner.ts:22`
  - `src/content/reply-scanner.ts:27`
  Why:
  Querying with an `HTMLElement` generic expresses the DOM expectation once and removes two casts.
  Safe action:
  Use `document.querySelectorAll<HTMLElement>(...)` after the extractor boundary is introduced.
  Validation:
  Run `pnpm typecheck` and extraction fixtures.

### Checker and target configuration

- [ ] WS-006 Restore a passing repository check
  Evidence: high
  Change risk: low
  Files:
  - `src/popup/main.ts:21`
  Why:
  `pnpm check` currently stops on Biome formatting before typechecking.
  Safe action:
  Apply the formatter to this file, inspect the diff, then rerun the full check.
  Validation:
  `pnpm check`.

- [ ] WS-007 Resolve the Firefox manifest-version mismatch
  Evidence: high
  Change risk: medium
  Boundaries: framework-entrypoint
  Files:
  - `AGENTS.md:11`
  - `package.json:12`
  - `wxt.config.ts:3`
  Why:
  The repository says Manifest V3, while `pnpm build:firefox` produces `.output/firefox-mv2`. The build also warns about Firefox's data-collection declaration for new extensions.
  Safe action:
  Choose a supported Firefox target explicitly, then configure and document it. Do not suppress the data warning without a truthful declaration.
  Validation:
  Inspect the generated manifest and load the build in Firefox.

## Leads ignored

- `src/types.ts` is not a junk drawer yet; it owns one contract shared by scanner and UI.
- Repeated CSS values are too small and local to justify tokens or Tailwind.
- The review list's `.map()` is a future scale concern, not proof of a current performance fault.
- No dependency drift, JavaScript migration leftovers, broad `any`, suppressions, duplicate package families, or stale exports were found by the available checks.
- The unused-code scan used the conservative `rg` fallback because `fallow` is not installed.

Summary: seven open tasks. WS-006 is the safest first edit; WS-001 through WS-003 matter most for a trustworthy product.
