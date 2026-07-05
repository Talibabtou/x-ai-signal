# Development checklist

Current product: a read-only indicator beside every visible X/Twitter post. The extension never hides content, clicks X controls, or changes the user's account.

Work in order. Later phases stay intentionally short until the indicator proves useful.

## Phase 0: gray-avatar-border vertical slice

- [x] Keep WXT and one TypeScript codebase for Chromium and Firefox.
- [x] Disable WXT's browser launcher so development uses the existing logged-in Brave profile.
- [x] Remove the old popup, background worker, review buffer, hiding logic, thresholds, storage permission, and placeholder scorer.
- [x] Add one gray, non-interactive border around every rendered tweet profile picture.
- [x] Process newly rendered tweets without rescanning the full document.
- [x] Prevent duplicate indicators and remove injected UI when WXT invalidates the content script.
- [x] Document one-time manual installation and the save/reload loop for Brave.
- [x] Load `extension-builds/chrome-mv3-dev` in the main Brave profile and verify the indicator on home, a post thread, search, and a profile.
- [x] Confirm that saving `src/entrypoints/content.ts`, `src/content/tweet-indicator.ts`, or `src/ui/tweet-indicator.css` updates the loaded development extension.

Gate: every visible tweet receives exactly one gray profile-picture border, infinite scrolling adds new borders, X controls still work, and normal source edits do not require reinstalling the extension.

## Phase 1: extract rendered evidence

- [x] Extract the tweet's own text without mixing in author labels, counters, quoted tweets, or surrounding UI.
- [x] Extract only account information already rendered with the tweet: handle, display name, visible badge, and visible relationship label when present.
- [x] Return `unknown` when text or the author anchor cannot be extracted; never guess from missing data.
- [x] Keep all X selectors in `src/content/` and document what each selector identifies.
- [x] Add small sanitized HTML fixtures for a normal tweet, reply, quote, promoted item, media-only tweet, and missing-text state.
- [x] Verify extraction tests and both Chromium and Firefox builds through `pnpm verify`.
- [x] In live Brave, confirm text tweets expose `data-taib-ai-indicator="ready"` and missing-text tweets remain `unknown`.

Gate: fixture extraction matches what a person sees and never makes an X request.

## Phase 2: content-only suspicion score

- [x] Define four results: `unknown`, `low`, `medium`, and `high` suspicion.
- [x] Return reasons with the result; never label a post or account as confirmed AI or confirmed human.
- [x] Start with a few deterministic text signals and one small test per signal.
- [x] Map results to gray, green, amber, and red indicators with an accessible label in X's profile hover card.
- [x] Keep the score pure and local. Do not add a remote model, settings screen, or storage yet.
- [x] In live Brave, confirm borders use the four states and the profile hover card shows a matching dot and explanation.

Gate: every colored indicator can explain itself, while short or unsupported text remains gray.

## Phase 3: local evolving account score

The account score has two outputs: suspicion and coverage. More observations improve coverage;
they do not automatically increase suspicion. Keep the algorithm deterministic until replay
tests show that a trained model materially reduces errors.

### 3A: observation and storage foundation

- [ ] Define versioned `PostObservationV1`, `PostSignatureV1`, `ProfileSnapshotV1`,
  `AccountEvidenceV1`, and `AccountScoreV1` types.
- [ ] Add the extension `storage` permission and restore the background service worker as the
  sole owner of persistent account evidence.
- [ ] Send sanitized typed observations from the content script to the worker; never pass DOM
  nodes or page objects.
- [ ] Use a stable X user ID only when an approved source exposes it; otherwise key temporary
  records by normalized handle and treat handle changes as identity uncertainty.
- [ ] Deduplicate repeated renders and tabs by post ID, with a fallback session key when no ID is
  available.
- [ ] Store derived signatures and bounded aggregates, not full post text by default.
- [ ] Cap recent history per account by count and age; start with 50 signatures or 30 days and
  tune from measured storage use.
- [ ] Batch storage writes and expose storage bytes, record count, retention policy, and a
  “delete all local evidence” control.
- [ ] Add schema migration tests and corrupt-record recovery before shipping persistence.

Gate: reload and browser restart preserve valid evidence; duplicate renders do not change
counts; deleting evidence removes every account record; normal browsing stays within the default
storage quota.

### 3B: cheap incremental behavior features

- [ ] Freeze the Phase 2 content scorer as a weak, capped evidence family.
- [ ] Add normalized exact hashes per account and detect copies across distinct posts.
- [ ] Add 64-bit character n-gram SimHash and compare only against that account's bounded recent
  signatures.
- [ ] Record post kind, published and observed timestamps, conversation ID when rendered, link
  domains, mention count, language, text length, media presence, and whether the visible reply
  has a usable parent context.
- [ ] Maintain online aggregates without rescanning history: distinct conversations, duplicate
  counts, post-kind counts, link-domain counts, active-hour bins, gap bins, and text-length mean
  and variance.
- [ ] Do not compare timing until at least 8 timestamped posts span 6 hours; represent the result
  as sampled observations, not a complete posting rate.
- [ ] Extract human-compatible observations without calling them proof: short fragments, varied
  style, corrections, parent-specific replies, reciprocal conversation, media variety, and
  irregular activity sessions.
- [ ] Treat one-word and media-only posts as insufficient for text scoring rather than automatic
  low suspicion.
- [ ] Do not synthesize hovers, visit profiles, scroll pages, call hidden X endpoints, or make X
  requests to fill missing fields.
- [ ] Benchmark processing time on a long feed and set a per-observation target before adding
  another feature family.

Gate: each post is processed once; normal updates are constant time except for a fixed-size
same-account similarity check; no feature can infer a negative value from missing DOM.

### 3C: suspicion, coverage, and explanations

- [ ] Implement pure family scorers for content, repetition, temporal behavior, conversation
  behavior, account context, and relationship context.
- [ ] Let every family contain raising evidence and family-specific counterevidence; do not build
  one global pool of “human points.”
- [ ] Allow counterevidence to reduce only the family it contradicts: spelling variation affects
  content, varied replies affect repetition/conversation, and varied gaps affect temporal
  evidence.
- [ ] Cap every lowering effect so typos, slang, media, or irregular delays cannot erase strong
  evidence from another family.
- [ ] Give content and profile metadata low maximum influence; neither can produce high
  suspicion alone.
- [ ] Calculate coverage from eligible post count, distinct conversations, elapsed time,
  available profile context, and independent evidence families.
- [ ] Keep insufficient evidence `unknown`, even when one weak family produces a high raw score.
- [ ] Require one strong behavioral signal or independent medium signals for `medium`.
- [ ] Require at least two independent families, including behavior, for `high`.
- [ ] Require at least 5 posts from 2 conversations before showing an account-level `low`; test
  this starting threshold rather than treating it as final.
- [ ] Return concrete reasons with counts, such as “4 near-duplicate replies across 3
  conversations,” and show the observation count in the hover card.
- [ ] Show meaningful counterevidence when it affects the result, such as “replies were specific
  to 6 different conversations.”
- [ ] Expire old signatures and decay old aggregates so an account does not receive a permanent
  label.
- [ ] Keep user labels separate from inferred evidence; blocking, muting, or following is not an
  authorship label.

Gate: every non-gray color reports its evidence and sample size; high suspicion cannot be caused
by text style, follower count, verification, account age, or missing data alone; cosmetic
human-like features cannot conceal independent behavioral evidence.

### 3D: user-opened profile enrichment

- [ ] Extract a profile snapshot only after the user naturally opens a rendered hover card or
  profile page.
- [ ] Parse follower/following counts with locale-aware fixtures and preserve `unknown` on a
  failed parse.
- [ ] Record snapshot time, visible relationship, common-follow count, verification, bio/link
  presence, and account age only when rendered.
- [ ] Never replace a known field with a missing field from a smaller card variant.
- [ ] Cap profile and relationship influence and make every adjustment visible in score reasons.
- [ ] Test card variants, SPA navigation, repeated hovering, and stale snapshots in Brave and
  Firefox.

Gate: profile context can refine an existing score but cannot independently create medium or
high suspicion, and opening no profile card remains a supported state.

### 3E: chronological evaluation and calibration

- [ ] Create lawful, reviewed account sequences with human, generated, edited, repetitive,
  automated, and unknown labels.
- [ ] Replay observations chronologically and record results after 1, 3, 5, 10, and 20 posts.
- [ ] Split fixtures by author, conversation, time, and generator to prevent leakage.
- [ ] Report true-positive rate at 0.1% and 1% false-positive rates, precision, abstention, and
  coverage rather than headline accuracy.
- [ ] Audit false positives for quotations, memes, brands, support accounts, scheduled posts,
  non-native writing, one-word posts, media posts, spelling errors, and harmless repeated phrases.
- [ ] Build adversarial sequences where automation adds typos, slang, media, corrections, and
  irregular delays; confirm these only affect the evidence family they contradict.
- [ ] Add ablation tests for each counterevidence rule and remove rules that lower false positives
  only by making the detector broadly insensitive.
- [ ] Tune high suspicion for precision first; use medium for concerning but incomplete evidence.
- [ ] Compare one cheap character n-gram baseline and one published detector offline before
  considering model weights in the extension.

Gate: thresholds are backed by replay results, high suspicion meets the chosen false-positive
budget, and the score does not become overconfident after one or two posts.

## Phase 4: browser and release checks

- [ ] Decide and document the Firefox MV2 versus MV3 target.
- [ ] Add truthful Firefox extension ID, minimum version, and data-collection declarations before store submission.
- [ ] Compare generated Chromium and Firefox manifests for unexpected permissions and host patterns.
- [ ] Run `web-ext lint` on the Firefox release directory.
- [ ] Add one release smoke checklist: install, indicator, infinite scroll, SPA navigation, disable, and uninstall.
- [ ] Add a privacy policy stating that no tweet or account data leaves the browser.

Gate: both release packages pass their browser smoke checks with no account-changing capability.

## Future phase: opt-in shared learning

This is not part of the first local release. Shared model training and a shared account list are
separate systems with different privacy and abuse risks.

- [ ] Version derived feature and deliberate user-label schemas so an export can be designed
  without changing local records.
- [ ] Complete X policy, data-redistribution, privacy, and legal review before any collection.
- [ ] For model improvement, design explicit opt-in contribution of derived features and labels;
  exclude raw text and handles by default.
- [ ] State plainly that hashing a public handle does not make it anonymous.
- [ ] Add validation, deduplication, rate limits, poisoning resistance, deletion, held-out review
  data, model versioning, and rollback on the server.
- [ ] Ship executable scoring code inside the extension; downloaded artifacts may be signed data
  interpreted by that code, not remote JavaScript or WASM.
- [ ] Treat any account-level common list as a reputation product requiring stable IDs,
  independent reporters, evidence expiry, anti-brigading controls, moderation, correction, and
  appeals.
- [ ] Keep networking absent and contribution disabled by default until the full system passes
  its own review.

Gate: no shared-data feature ships merely because the local schema can support one.

## Explicitly out of scope

- Hiding, collapsing, blurring, or moving tweets
- Review queues and block lists
- Clicking, blocking, muting, reporting, following, or unfollowing
- Private X APIs or simulated UI interaction
- Remote classification
- Settings and analytics before the basic indicator is proven

## Reference repositories

- [WXT](https://github.com/wxt-dev/wxt) and [WXT examples](https://github.com/wxt-dev/examples) for framework behavior and packaging
- [Control Panel for Twitter](https://github.com/insin/control-panel-for-twitter) for X breakage history and browser releases, not for its large injected script
- [Refined GitHub](https://github.com/refined-github/refined-github) for duplicate-load protection and abortable SPA cleanup
- [MDN WebExtension examples](https://github.com/mdn/webextensions-examples) and [Chrome extension samples](https://github.com/GoogleChrome/chrome-extensions-samples) for individual browser APIs
