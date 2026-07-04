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
- [ ] Load `extension-builds/chrome-mv3-dev` in the main Brave profile and verify the indicator on home, a post thread, search, and a profile.
- [ ] Confirm that saving `src/entrypoints/content.ts`, `src/content/tweet-indicator.ts`, or `src/ui/tweet-indicator.css` updates the loaded development extension.

Gate: every visible tweet receives exactly one gray profile-picture border, infinite scrolling adds new borders, X controls still work, and normal source edits do not require reinstalling the extension.

## Phase 1: extract rendered evidence

- [ ] Extract the tweet's own text without mixing in author labels, counters, quoted tweets, or surrounding UI.
- [ ] Extract only account information already rendered with the tweet: handle, display name, visible badge, and visible relationship label when present.
- [ ] Return `unknown` when text or the author anchor cannot be extracted; never guess from missing data.
- [ ] Keep all X selectors in `src/content/` and document what each selector identifies.
- [ ] Add small sanitized HTML fixtures for a normal tweet, reply, quote, promoted item, media-only tweet, and missing-text state.
- [ ] Verify extraction against both Chromium and Firefox builds.

Gate: fixture extraction matches what a person sees and never makes an X request.

## Phase 2: content-only suspicion score

- [ ] Define four results: `unknown`, `low`, `medium`, and `high` suspicion.
- [ ] Return reasons with the result; never label a post or account as confirmed AI or confirmed human.
- [ ] Start with a few deterministic text signals and one small test per signal.
- [ ] Map results to gray, green, amber, and red indicators with an accessible label and native tooltip.
- [ ] Keep the score pure and local. Do not add a remote model, settings screen, or storage yet.
- [ ] Add regression fixtures whenever a real human tweet gets a misleading result.

Gate: every colored indicator can explain itself, while short or unsupported text remains gray.

## Phase 3: locally observed account signals

- [ ] Track repeated text and near-duplicate posts seen during the current page session.
- [ ] Consider local history only after the content-only score has been evaluated.
- [ ] If persistence becomes useful, add one versioned storage record and a delete control at the same time.
- [ ] Do not simulate profile visits, open hover cards, call private X endpoints, or scrape data absent from the rendered tweet.
- [ ] Research the official API separately before using account age, total post count, common followers, or reliable relationship data.

Gate: account evidence comes from rendered data, local observation, or a separately approved official source.

## Phase 4: browser and release checks

- [ ] Decide and document the Firefox MV2 versus MV3 target.
- [ ] Add truthful Firefox extension ID, minimum version, and data-collection declarations before store submission.
- [ ] Compare generated Chromium and Firefox manifests for unexpected permissions and host patterns.
- [ ] Run `web-ext lint` on the Firefox release directory.
- [ ] Add one release smoke checklist: install, indicator, infinite scroll, SPA navigation, disable, and uninstall.
- [ ] Add a privacy policy stating that no tweet or account data leaves the browser.

Gate: both release packages pass their browser smoke checks with no account-changing capability.

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
