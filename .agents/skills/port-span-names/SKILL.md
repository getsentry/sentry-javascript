---
name: port-span-names
description: Port a span op to low-cardinality span names, applied only when span streaming is enabled. Use when asked to make a span op's names low cardinality, remove raw URLs/IDs from span names, apply the Sentry span name conventions to an op, or "port <op> spans to low cardinality names". Trigger phrases include "low cardinality span name", "span name conventions", "span name fallback", "Pageload/Navigation span name".
argument-hint: '<span-op> [constraints]  # e.g. navigation, or "db.query --only packages/node"'
---

# Port a span op to low-cardinality span names

Span names must be low cardinality, per the [Sentry span name conventions](https://getsentry.github.io/sentry-conventions/names/): a raw URL, id, or query must never end up in a span name. Where the SDK has no low-cardinality value for a span, it uses a **static fallback name** for that op instead.

This only applies when span streaming is enabled. With `traceLifecycle: 'static'` every span name must stay byte-identical to before.

`pageload` was ported first. Read it as the reference implementation before starting:
`packages/core/src/tracing/spans/spanNames.ts` (the constant), `packages/browser/src/tracing/browserTracingIntegration.ts`
(a start site plus the scope guard in `startBrowserTracingPageLoadSpan`), and
`grep -rn PAGELOAD_SPAN_NAME_FALLBACK packages/*/src` for the full set of call sites.

## Inputs

- **`<span-op>`** (required): the op to port, e.g. `navigation`, `db.query`, `http.client`.
- **`[constraints]`** (optional): free-form narrowing, e.g. `--only packages/node`, `just the vue router instrumentation`, `skip tanstack`. Honor them literally: touch nothing outside the named scope, and say in your summary which sites you deliberately left for a follow-up.

If the op is missing, ask for it. Do not guess.

## Rules

These are non-negotiable. Every one of them was arrived at by rejecting the alternative.

1. **Gate on span streaming at each site.** `hasSpanStreamingEnabled(client)` (from `@sentry/core`) must appear inline where the name is chosen, so a reader can see the gate without following a call chain. Never gate centrally.
2. **Set the low-cardinality name when the span _starts_** — and at every later site that could write a high-cardinality name onto it. Never rewrite names retroactively (not in `captureSpan`, not in `spanToJSON`, not in a `processSpan`/`preprocessSpan` hook). A span must never carry a raw URL.
3. **Check span name updates** to ensure every name update is low-cardinality if span streaming is enabled.
4. **Only the name changes.** Do not touch `sentry.source`, `url.template`, `http.route`, or any other attribute. They keep describing where the name came from.
5. **Do not derive the name from attributes in code.** The conventions describe names as attribute templates, but you implement them by reusing the value the site _already_ has for `url.template` / `http.route`. No attribute lookups, no generic template resolver.
6. **No helpers, no abstraction.** An inline ternary at each site. A shared `const` for the fallback string is fine (and required, see rule 6); a function that sets names or attributes is not.
7. **The fallback must never reach `scope.setTransactionName`.** The scope's transaction name is what error events are grouped by, so it keeps the raw URL or the parameterized route — never `Pageload`/`Navigation`/etc. Export the fallback as a constant from `packages/core/src/tracing/spans/spanNames.ts` so the guard cannot drift.
8. **`sentry.segment.name` must never diverge from the segment span's name.** Any code that stamps it on a child span has to read it off the segment span, not off the scope.

## 1. Look up the convention

Read <https://getsentry.github.io/sentry-conventions/names/> and find the op. Each op lists attribute templates in priority order, ending in a static fallback — that fallback is your name. Examples: `pageload` → `Pageload`, `navigation` → `Navigation`, database ops → `Database operation`.

Add it next to `PAGELOAD_SPAN_NAME_FALLBACK` in `packages/core/src/tracing/spans/spanNames.ts` and export it from `shared-exports.ts`. Every package imports it from `@sentry/core` directly — no re-export from `@sentry/browser` is needed.

## 2. Find every site that names a span with this op

Be exhaustive; a missed site is a raw URL in production.

```bash
# span starts
grep -rn "SEMANTIC_ATTRIBUTE_SENTRY_OP\]: '<op>'\|SENTRY_OP\]: '<op>'\|op: '<op>'" packages/*/src
# for browser routing ops, also the dedicated starters
grep -rn "startBrowserTracingNavigationSpan\|startBrowserTracingPageLoadSpan" packages/*/src

# later name writes
grep -rn "\.updateName(\|updateSpanName(" packages/*/src

# readers that compare a span name against a URL or route (these break, see step 4)
grep -rn "spanToJSON(.*)\.name" packages/*/src
```

Classify each write site: does it set a low cardinality value? Low cardinality values are for example:

- a paramterized route (i.e. one without dynamic parameters)
- an http origin without url path, query or fragment parameters
- a component name
- a static string

In cases, where we already set a low-cardinality value, likely only the fallback branch changes. For example, when a route is known the name is identical in both lifecycles. But when it's unknown, transaction mode falls back to the raw URL. Span streaming mode falls back to a static "Pageload" string.

Note: For a lot of route/URL cases, the `sentry.source` attribute having the value `"url"` strongly hints that the span name is high-cardinality. Use this as a strong indicator but not as definitive proof. Sometimes this attribute is incorrectly set. If you find such a case, flag it rather than following the rule.

## 3. Apply the fallback

The whole change per site is the else-branch of a ternary:

```ts
// With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
name: parameterizedRoute ?? (hasSpanStreamingEnabled(client) ? NAVIGATION_SPAN_NAME_FALLBACK : pathname),
```

Where a site computes `[name, source]` together, gate on the source (but see the note above!):

```ts
name: source === 'route' || !hasSpanStreamingEnabled(client) ? name : NAVIGATION_SPAN_NAME_FALLBACK,
```

At update sites, keep the surrounding `setAttribute` calls exactly as they were:

```ts
const client = getClient();
const isUnparameterizedStreamedSpan = source !== 'route' && !!client && hasSpanStreamingEnabled(client);
span.updateName(isUnparameterizedStreamedSpan ? NAVIGATION_SPAN_NAME_FALLBACK : name);
span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source); // unchanged
```

`hasSpanStreamingEnabled` takes a non-optional `Client`, so guard `getClient()` with `!!client` where no client is in scope.

## 4. Fix readers, never work around them

Some instrumentation reads a span's name back and compares it to a pathname or route to decide whether an event belongs to that span. Those silently stop matching once the name is a fallback — the span then never gets parameterized at all, with no error.

Re-point them at the attribute that holds the real value (`url.path`, `url.full`, `url.template`). Reading an attribute here is correct; only _writing_ attributes is out of scope.

```ts
// Matched against `url.path` rather than the span name, which is low cardinality.
const spanPath = spanToJSON(span).attributes[URL_PATH];
```

## 5. Guard the scope transaction name

Find every `setTransactionName` reachable from a span you renamed:

```bash
grep -rn "setTransactionName" packages/*/src
```

Most calls pass a route and are fine. The dangerous ones pass a span name through. Guard those:

```ts
// `Navigation` is a low-cardinality span name, not a description of the page. The scope's
// transaction name is what error events are grouped by, so it keeps the URL instead.
const isFallbackSpanName = spanOptions.name === NAVIGATION_SPAN_NAME_FALLBACK;
getCurrentScope().setTransactionName(isFallbackSpanName ? WINDOW.location?.pathname : spanOptions.name);
```

Pin this with a test asserting the span name is the fallback **and** `scope.transactionName` is not.

## 6. Keep `sentry.segment.name` consistent

`captureSpan` derives `sentry.segment.name` from the real segment span, but any code that pre-sets the attribute wins over it (`safeSetSpanJSONAttributes` does not overwrite). If a child-span emitter copies the name from the scope, it will diverge as soon as the segment span is renamed. Read it off the segment span instead:

```ts
const segmentSpan = parentSpan && getRootSpan(parentSpan);
const segmentName = segmentSpan ? spanToJSON(segmentSpan).name : getCurrentScope().getScopeData().transactionName;
```

The scope is only a valid fallback for standalone spans, which are sent without their segment span. `packages/browser-utils/src/web-vitals/spans.ts` is the worked example.

## 7. Verify

**Build first.** Framework packages and the Playwright suites resolve `@sentry/core` from `build/`, not `src/`. A stale build produces failures that look like your bug but aren't.

```bash
yarn build:dev:filter @sentry/browser   # plus each package you touched
npx vitest run --root packages/<pkg> --coverage.enabled=false
cd dev-packages/browser-integration-tests && npx playwright test --project=chromium suites/tracing
```

Before assuming a failure is yours, baseline it: `git stash`, re-run, `git stash pop`. Commonly pre-existing in a dev checkout: `packages/core` `test/types/typedef.test.ts` (needs a full prod build), the `@sentry/ember` build, and `packages/nuxt` lint errors.

Expect to update, and read each one to confirm the new value is _correct_ rather than just green:

- unit assertions on the span name and on `scope.transactionName`
- `dev-packages/browser-integration-tests` suites whose `init.js` does **not** set `traceLifecycle: 'static'` (the static ones must not change — that is your regression check)
- `sentry.segment.name` / `sentry.transaction` on child spans of a renamed segment span
- span mocks missing `spanContext`/`setAttribute` once code paths shift

Finish with `yarn format` and `yarn lint`.

## 8. Document it in MIGRATION.md

Extend the existing **"Span name changes"** section under `## 2. Behaviour Changes` — add a row to its table rather than starting a new section:

| Span op | Before                                     | After                                          |
| ------- | ------------------------------------------ | ---------------------------------------------- |
| `<op>`  | what the name was, with a concrete example | the route, or `<Fallback>` if the SDK has none |

Also note, if they apply: that `ignoreSpans` is evaluated at span **start** (so filters matching a URL no longer match a fallback-named span, and users should match on attributes instead), any child-span attribute that follows the new name, and any span of a _different_ op that inherits the name (e.g. `ui.action.click` spans are named after the current route).

## Rejected approaches

Do not propose these; they were each tried and rejected in the `pageload` port.

- **Rewriting names at capture/serialization time.** Correct output, but the span carries a raw URL for its whole lifetime, and anything reading the name mid-flight sees it.
- **A `updateRouteSpanName(span, name, source, attributes)` helper.** It set attributes as a side effect, which is out of scope, and hid the streaming check.
- **Deriving the name from `url.template` via a generic convention resolver.** Over-abstracted; the call site already has the value.
- **Tracking a second `segmentName` on the scope.** Looks like it fixes `sentry.segment.name`, but it diverges the moment a routing instrumentation renames the span — unless every rename site also updates the scope, which is the same duplicated-truth bug moved elsewhere.
