# Project direction report

> Update, 2026-07-03: the first product milestone is now indicator-only on every visible tweet. Hiding, collapsing, review queues, storage, and account actions are out of scope. See `README.md` and `TODO.md` for the current plan; the filtering discussion below records the earlier analysis.

Reviewed: 2026-07-01

## Decision

Keep the extension, but change the promise.

Do not build a DOM-driven autoblocker. Build a local, reversible reply filter that helps a person spend less time on low-value replies. Call AI-likeness one signal among several, never a fact about the author. Leave mute, block, report, follow, and unfollow actions to the person inside X.

That direction preserves the useful part of the idea while matching the project's stated risk tolerance. It also gives the product a better target. A reply can waste time whether it came from an LLM, a copy-paste farm, an engagement bot, or a person posting boilerplate. Conversely, a useful reply does not become harmful because someone used writing assistance.

## Why autoblocking fails the account-safety requirement

X's automation rules, updated in April 2026, say that non-API automation such as scripting the X website may result in permanent account suspension. The same page says automated activity can lead to account suspension and that OAuth alone does not count as consent for automated account actions. See [X's automation rules](https://help.x.com/en/rules-and-policies/x-automation?lang=browser).

An official API integration removes the web-clicking problem, but it does not make the feature risk-free. X requires clear, informed consent before an app acts for a user, monitors API use against the approved use case, and requires a privacy policy before install or signup. See the [X Developer Policy](https://docs.x.com/developer-terms/policy) and [Blocks API documentation](https://docs.x.com/x-api/users/blocks/introduction).

Blocking also changes account relationships. Blocking an account that either party follows breaks those follow relationships, and unblocking does not restore them. See [Blocking on X](https://help.x.com/using-twitter/blocking-and-unblocking-accounts).

Given the user's priority, the decision is straightforward:

- Never click X controls from code.
- Never call an account-mutation endpoint in the main product.
- Do not read cookies, tokens, or passwords.
- Keep all filtering local and recoverable.
- If API blocking gets researched later, put it in a separate build and require a fresh policy review before any implementation.

## Why “AI detector” is the wrong product claim

Short social replies do not contain enough stable evidence to establish authorship. Detectors can work on a particular benchmark, then fail under new models, domains, languages, prompts, or paraphrasing. Research has also found false-positive bias against non-native English writing. The problem gets harder on X because replies are short, slang-heavy, multilingual, and frequently edited from templates.

Two useful references are [Can AI-Generated Text be Reliably Detected?](https://arxiv.org/abs/2303.11156), which stress-tests detectors against paraphrasing and spoofing, and [GPT detectors are biased against non-native English writers](https://arxiv.org/abs/2304.02819).

The extension should score “likely low-value for me,” not “written by AI.” That score can include generic phrasing, repeated text, link or hashtag spam, semantic mismatch with the parent post, account repetition seen locally, and the user's past decisions. The UI should show the reasons and admit uncertainty.

## Current repository state

The repository contains a small WXT/TypeScript prototype. Production builds complete for Chrome and Firefox, and the Chrome bundle is about 11 KB. There are no runtime dependencies and the manifest asks only for storage plus X/Twitter host access. No code currently mutates the X account, makes network requests, or sends content to a third party. Those are good constraints to keep.

The working tree already had uncommitted changes when this review started. They appear to be the paused build-process work: moving the popup script, setting `srcDir`, adding `.nvmrc`, updating WXT preparation, and removing the unused storage module. This report did not rewrite those files.

What the prototype currently does:

1. A content script watches the full X page with a `MutationObserver`.
2. Every unseen `article[data-testid="tweet"]` gets scored from its full `textContent`.
3. A score at or below 30 sets `display: none` on the whole article.
4. The hidden text appears in a floating review list.

This proves that WXT can inject code and modify the page. It does not yet prove reply detection, useful scoring, safe hiding, or review.

## Problems in the current implementation

### The scanner does not identify replies

`src/content/reply-scanner.ts:13` scans every tweet article on every matching X page. That can include the parent post, timeline posts, quoted posts, ads, and unrelated conversation items. The roadmap says “detect a post detail page,” but the code does not do that.

`article.textContent` also mixes the reply with display names, handles, timestamps, counters, labels, and quoted content. The scorer is judging a noisy concatenation rather than the reply text.

### Hiding is not reversible

`src/content/reply-scanner.ts:22` writes an inline `display: none`. The review buffer has no restore action, no placeholder in the thread, and no cleanup method. The `HTMLElement` remains in memory through `ReplyVerdict`, but the UI cannot put it back. This violates the project's strongest product principle.

### The score does not support the product claim

`src/scoring/score-reply.ts` starts every reply at 75 and subtracts points for length, five phrases, emoji, and hashtags. It does not use the parent post, author, reply URL, repetition, language, user history, or model version. It returns only a number, so the UI cannot explain a verdict.

There is no labeled fixture set or measurement. A threshold of 30 therefore has no meaning beyond being a hard-coded guess. The “human pass threshold” shown in the popup is unused.

### Settings and review are mock UI

The popup inputs do not load or save anything. The project requests `storage`, but no code uses it. The review rows have no allow, keep-collapsed, or dismiss actions, and decisions are not recorded. The high-score path and middle review band described in the README do not exist.

### X is an unstable single-page application

The observer rescans the entire document for every relevant DOM change. A `WeakSet` prevents a second look at an element even if X reuses or changes it. There is no route lifecycle, batching, teardown, root guard, or handling for virtualized replies. Selectors live in the right folder, but extraction, observation, and rendering still sit in one function.

### Testing and release gates are absent

There are no unit, fixture, integration, or browser tests. `pnpm check` currently stops on a Biome formatting error at the end of `src/popup/main.ts`; both production builds still pass when run separately.

The Firefox command currently emits a Firefox MV2 bundle, despite `AGENTS.md` describing Manifest V3. Firefox also warns that new extensions need `data_collection_permissions`. That target needs an explicit decision instead of assuming parity.

## Recommended product

Working name: **Reply Filter** or **Attention Filter for X**.

The first release should do four things well:

- Run only on conversation pages and extract actual replies.
- Label suspicious replies first; let the user choose collapse mode later.
- Collapse locally with an inline placeholder and one-click restore.
- Learn local preferences from “show,” “keep collapsed,” and “always show this account” decisions.

Do not put “block” in the first release UI. A later review panel can offer “open profile” or “open reply” so the person can use X's own controls. The extension must not click those controls or queue actions after the click.

### Better signals

Separate the score into evidence that a user can inspect:

- Content: boilerplate phrases, repeated formatting, excessive promotion, suspicious links, or a reply that says little beyond agreement.
- Context: semantic relation to the parent post, duplicate text already observed in the same thread, and repeated reply templates observed locally.
- Preference: accounts the user has allowed before, terms they choose to filter, and reasons they have dismissed.
- Uncertainty: short replies, unknown language, missing context, and extraction errors should force “leave visible,” not a confident negative verdict.

Account metadata scraped from the page should wait. It is often absent from the reply DOM, changes frequently, and can turn harmless style differences into proxies for language, region, or popularity.

### A safer score contract

Use a result shaped roughly like this:

```ts
type ScoreResult = {
  disposition: 'allow' | 'label' | 'collapse';
  confidence: 'low' | 'medium' | 'high';
  score: number;
  reasons: Array<{ code: string; weight: number; message: string }>;
  scorerVersion: string;
};
```

Keep the score pure. DOM elements belong in a separate map owned by the content script, not inside a verdict that may later enter storage.

## Technical shape

Split the content path into small boundaries:

```text
X DOM -> extractor -> normalized reply -> scorer -> policy -> reversible renderer
                                      \-> local decision/evaluation store
```

The extractor should return a stable reply ID, reply URL, author handle, exact reply text, parent-post text when available, and extraction warnings. The policy decides whether to label or collapse. The renderer adds namespaced classes and an inline placeholder; it owns restoration and teardown.

Store settings, decisions, allowlists, and aggregate counters locally. Retaining full reply text should be optional and off by default; a manual export can create an evaluation file when the user chooses. If a remote classifier ever ships, require a separate opt-in screen that states exactly what leaves the browser and how long it remains stored.

## Development process with the main Brave profile

Do not ask WXT to open another browser profile. WXT documents a manual mode for this exact case by setting `webExt.disabled: true`; its dev server still builds the development extension. See [WXT browser startup](https://wxt.dev/guide/essentials/config/browser-startup.html) and [WXT FAQ](https://wxt.dev/guide/resources/faq).

Use this configuration when the paused `wxt.config.ts` work is ready to edit:

```ts
export default defineConfig({
  srcDir: 'src',
  webExt: {
    disabled: true,
  },
  // existing manifest config
});
```

Then use this loop:

1. Run `nvm use`, `pnpm install`, and `pnpm dev:chrome`.
2. In the main Brave profile, open `brave://extensions`, turn on Developer mode, click **Load unpacked**, and select `extension-builds/chrome-mv3-dev`.
3. Keep the dev command running. Load the extension only once; WXT writes updates to the same directory.
4. After content-script or manifest changes, reload the extension and refresh the X tab. Popup-only changes normally need only reopening the popup. WXT also adds `Alt+R` in development.
5. Before a manual test session, run `pnpm check` and `pnpm build:chrome`.

Brave supports Chromium-compatible extensions, and Chromium's documented local flow uses Developer mode plus **Load unpacked**. See [Brave extension support](https://support.brave.app/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave) and [Chrome's unpacked-extension instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

Use the production output `extension-builds/chrome-mv3` only for release smoke tests. The development output is `extension-builds/chrome-mv3-dev` in WXT 0.20.

## Safety specification

Treat these as release-blocking invariants:

- The extension makes no account-changing X request.
- It never simulates a click, keyboard action, or menu selection in X.
- Every local collapse has an inline recovery control.
- Turning the extension off restores the page without a reload when feasible.
- Extraction uncertainty leaves content visible.
- No reply text, handle, or account metadata leaves the browser by default.
- Stored decisions can be viewed, exported, and deleted.
- The extension displays “suspicious” or “low-value,” never “this account is AI.”

Add a small automated guard that fails if production source starts using `fetch` against X, cookie APIs, debugger APIs, or synthetic click/keyboard calls. It is not a policy proof, but it catches accidental erosion of the boundary.

## How to measure whether this works

Accuracy alone will hide the failure mode that matters. Track:

- Collapse precision: of replies collapsed, how many did the user keep collapsed?
- Restore rate: how often does a user immediately reveal one?
- Coverage: what fraction gets collapsed at the chosen precision target?
- Time saved: collapsed replies and estimated reading volume, shown as a rough local counter.
- Reliability: duplicate UI, extraction failures, lost replies, and failure to restore should all stay at zero in test fixtures.

Start in label-only mode and collect local decisions. Promote a rule to automatic collapse only after it has enough reviewed examples and meets a strict precision threshold on held-out fixtures. There should always be an abstain path.

## Alternatives worth building

If reply classification remains too noisy, the same extension foundation can support safer products:

1. **User-owned reply rules.** Collapse exact phrases, link patterns, keywords, or accounts selected by the user. This is predictable and easy to explain.
2. **Duplicate-cluster filter.** Detect repeated or near-repeated replies inside the current thread. This attacks spam behavior without claiming who wrote the text.
3. **Conversation reading mode.** Show replies from followed, previously allowed, or directly engaged accounts first; collapse the rest into sections without judging authorship.
4. **Local block-review notebook.** Record accounts the user may want to review, with evidence and links. Export the list, but require each account action in X.
5. **Research tool.** Build an opt-in, local dataset and evaluation harness for reply-quality signals. This may become more defensible than a consumer autoblocker.

The best first product is a combination of 1, 2, and a conservative quality score. It solves the time problem now and creates labeled data for later work.

## Immediate recommendation

Spend the next milestone on safety and observability, not a stronger classifier. Finish manual Brave development, extract replies correctly, add label-only mode, make collapse reversible, persist settings, and create fixtures. Once those pieces work, label real examples and learn which signals deserve automation.

Autoblocking should leave the roadmap. If the product eventually proves that users want account actions, revisit only the official API with separate consent, policy, cost, and privacy work.
