# Development checklist

Ordered by dependency. Do not start a later phase while its gate remains open.

## Reference repositories

Use these as targeted references, not templates to copy wholesale:

- [WXT](https://github.com/wxt-dev/wxt) and [WXT examples](https://github.com/wxt-dev/examples): generated manifests, entrypoints, browser targets, storage, messaging, content-script UI, and packaging. Prefer current WXT 0.20 patterns over older polyfill advice.
- [Control Panel for Twitter](https://github.com/insin/control-panel-for-twitter): the closest product comparison. Study its X route handling, selector breakage history, narrow `storage` permission, MV2/MV3 manifests, browser release scripts, and settings flow. Do not copy its large page-world script or `window.postMessage` bridge unless WXT's isolated content script cannot do the job.
- [Refined GitHub](https://github.com/refined-github/refined-github): feature isolation on a changing single-page application. Study its route-based run conditions, duplicate-load guard, `AbortController` cleanup, feature switches, settings migrations, and combined type/lint/test/build gate. Implement a much smaller version.
- [MDN WebExtension examples](https://github.com/mdn/webextensions-examples) and [Chrome extension samples](https://github.com/GoogleChrome/chrome-extensions-samples): use these to verify one browser API at a time. They are API references, not application architectures.
- [Dark Reader](https://github.com/darkreader/darkreader): long-running Chromium/Firefox release engineering, site-specific regression handling, and generated browser packages. Its codebase is too large to guide this project's initial structure.

## Phase 0: restore a reliable development loop

- [ ] Add `webExt: { disabled: true }` to `wxt.config.ts` so `pnpm dev:chrome` does not launch a fresh browser profile.
- [ ] Run `pnpm dev:chrome`, then load `.output/chrome-mv3-dev` once from `brave://extensions` in the main Brave profile.
- [ ] Document the reload loop: keep WXT running; reload the extension and X tab after content-script or manifest changes; reopen the popup for popup-only changes.
- [ ] Fix the Biome formatting error in `src/popup/main.ts` so `pnpm check` passes.
- [ ] Add a one-command preflight script that runs `pnpm check` and the Chrome production build.
- [ ] Decide whether Firefox must use MV3 now. The current command outputs Firefox MV2 and warns about required `data_collection_permissions` for new submissions.
- [ ] Write a browser target matrix listing Chromium/Firefox manifest version, minimum browser version, development output path, manual install method, and release artifact.
- [ ] Add a Firefox manual-install smoke loop using `about:debugging` and the generated manifest; keep Brave as the main daily browser.

Gate: `pnpm check`, both browser builds, and the manual Brave install work from a clean checkout; Firefox has a documented smoke path.

## Phase 1: define and enforce account safety

- [ ] Rename the working product promise from “AI blocker” to “local reply filter” or another name that does not claim authorship.
- [ ] Write `resources/SAFETY.md` with the non-negotiable rule: no X UI scripting and no account-changing API calls.
- [ ] Add a source check for synthetic `.click()`, dispatched mouse/keyboard events, X-bound mutation requests, cookie access, and debugger permissions.
- [ ] Remove “block” controls from planned first-release UI; use “open reply” and “open profile” for manual review.
- [ ] Define a privacy inventory for settings, decisions, handles, URLs, and reply text. Keep full-text retention off by default.
- [ ] Add a global off switch and a “restore all collapsed replies” action.
- [ ] Add an explicit manifest permission allowlist test so new permissions or host patterns require a deliberate review.

Gate: a code review can show that the extension cannot change the X account.

## Phase 2: extract actual replies

- [ ] Detect X conversation/detail routes before scanning.
- [ ] Split DOM selectors and extraction into a typed adapter under `src/content/`.
- [ ] Extract only the reply text node, not the article's full `textContent`.
- [ ] Identify and exclude the parent post, quoted posts, promoted items, and non-reply articles.
- [ ] Derive a stable reply ID and URL; return extraction warnings when data is missing.
- [ ] Handle X SPA navigation, virtualized nodes, reused elements, and teardown.
- [ ] Batch observer work and scan added subtrees instead of querying the full document after every mutation.
- [ ] Capture sanitized HTML fixtures for at least: plain reply, nested reply, quoted post, media-only reply, promoted item, deleted item, and multilingual reply.
- [ ] Make route detection a pure module with fixtures for `x.com`, `twitter.com`, post detail pages, timelines, search, notifications, and unsupported routes.
- [ ] Record selector purpose and fallback behavior next to each selector; a missing selector must leave content visible and emit a local diagnostic.

Gate: fixture tests never classify the parent post or quoted content as the reply body.

## Phase 3: make page changes reversible

- [ ] Replace inline `display: none` with a namespaced collapsed state owned by a renderer.
- [ ] Insert an inline placeholder showing score band, reasons, and a **Show reply** button.
- [ ] Restore the exact reply in place without losing X's event handlers.
- [ ] Make mounting idempotent so reloads cannot add duplicate panels or placeholders.
- [ ] Add renderer teardown for extension disable, route changes, and development reloads.
- [ ] Keep `HTMLElement` references out of stored/domain verdicts; use a content-script-owned ID-to-element map.
- [ ] Pass an `AbortSignal` to scanner and renderer features so route changes remove observers and event listeners through one cleanup mechanism.
- [ ] Mark the document when the extension loads and refuse a second mount, while logging enough information to diagnose duplicate developer installs.

Gate: every collapse in fixtures and manual Brave testing can be undone immediately.

## Phase 4: create a scoring baseline that can be evaluated

- [ ] Replace the numeric-only return value with score, disposition, confidence, reason weights, and scorer version.
- [ ] Change the target from “AI-generated” to “likely low-value for this user.”
- [ ] Add an abstain/default-visible result for short text, unknown language, missing parent context, and extraction warnings.
- [ ] Move thresholds into one typed settings contract; remove the duplicated hard-coded `30`.
- [ ] Add pure unit tests for every scoring rule and boundary value.
- [ ] Add thread-local duplicate and near-duplicate detection before considering any model.
- [ ] Keep account popularity and inferred demographic proxies out of the first scorer.

Gate: every negative score has visible reasons and a deterministic test.

## Phase 5: settings, review, and local learning

- [ ] Persist enabled state, mode (`off`, `label`, `collapse`), thresholds, and user rules with extension storage.
- [ ] Start new installs in label-only mode.
- [ ] Add review actions: show, keep collapsed, always show this account, and dismiss reason.
- [ ] Store decisions locally with scorer version and feature values; avoid full reply text unless the user enables it.
- [ ] Add local data view, export, and delete controls.
- [ ] Add allowlists before denylists so a false positive can be corrected permanently.
- [ ] Bound the review buffer and avoid rendering an unlimited list.
- [ ] Version the settings schema and add migration tests before releasing the first stored configuration; never assume future defaults can replace existing user choices.

Gate: popup settings change live behavior, survive a restart, and can be reset.

## Phase 6: evaluation before automation

- [ ] Create a manually reviewed fixture dataset that includes non-native English, several languages, slang, short replies, and accessibility-related writing patterns.
- [ ] Separate training/tuning examples from held-out evaluation examples.
- [ ] Measure collapse precision, restore rate, coverage, and extraction failure rate.
- [ ] Set the first automatic-collapse threshold from measured precision, not intuition.
- [ ] Keep rules in label-only mode until the held-out set meets the chosen precision target.
- [ ] Add regression fixtures for every observed false positive.

Gate: the user chooses the target, but false positives must be rare enough that collapse feels trustworthy; account actions remain manual regardless of score.

## Phase 7: packaging and browser support

- [ ] Remove any redundant manifest permissions and explain every remaining warning in the UI/store listing.
- [ ] Add icons, versioning, a plain-language privacy policy, and local-data deletion instructions.
- [ ] Test Chrome and Brave first; add Firefox only after choosing MV2 versus MV3 and declaring Firefox data collection correctly.
- [ ] Add release smoke tests for install, popup, X route navigation, label, collapse, restore, disable, and uninstall.
- [ ] Produce zipped builds only after checks and smoke tests pass.
- [ ] Add CI jobs that build both targets and archive their generated manifests for inspection.
- [ ] Compare generated Chromium and Firefox manifests against reviewed snapshots, including permissions, host patterns, background form, content scripts, and browser-specific settings.
- [ ] Run Mozilla's `web-ext lint` against the Firefox release directory and inspect Chrome's unpacked-extension errors before packaging.
- [ ] Add the Firefox extension ID and truthful minimum-version/data-collection declarations before any Add-ons submission.

Gate: a release candidate passes the safety checklist and cannot leave hidden content behind after disable/uninstall plus page refresh.

## Quarantined ideas: do not implement in the main build

- [ ] Official X API blocking: research only after the local product has users asking for it; require a new policy review, explicit consent design, API access/cost analysis, audit log, rate limits, and kill switch.
- [ ] Remote classifier: research only with explicit opt-in, field-level disclosure, retention limits, deletion, and a local-only default.
- [ ] DOM-click blocking, muting, reporting, following, or unfollowing: permanently rejected under the account-safety requirement.
