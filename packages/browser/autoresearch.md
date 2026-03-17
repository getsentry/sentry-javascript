# Autoresearch: Browser CDN Bundle Size Reduction

## Objective
Reduce the gzipped size of the `@sentry/browser` base CDN bundle (`build/bundles/bundle.min.js`).
This bundle is built from `src/index.bundle.ts` → `src/index.bundle.base.ts` → `src/exports.ts`.
It includes `@sentry/core` and `@sentry-internal/integration-shims` (for tracing/replay/feedback stubs).

Original baseline: ~27.85 kB gzipped, ~81.4 kB raw (minified).
Current best: ~27.47 kB gzipped, ~79.1 kB raw (minified). (-1.3%)

## Metrics
- **Primary**: gzip_kb (kB, lower is better) — gzipped size of bundle.min.js
- **Secondary**: raw_kb — raw minified size, gzip_bytes — exact byte count

## How to Run
`./autoresearch.sh` — builds bundle.min.js only (~5s), outputs `METRIC name=number` lines.

## Files in Scope
Any file in these packages that contributes to the bundle:

### packages/browser/src/
- `exports.ts` — main exports for the base bundle
- `index.bundle.ts` / `index.bundle.base.ts` — CDN bundle entry points
- `client.ts` — BrowserClient
- `sdk.ts` — init(), getDefaultIntegrations()
- `eventbuilder.ts` — event construction
- `stack-parsers.ts` — stack trace parsing
- `helpers.ts` — WINDOW helper
- `transports/fetch.ts` — fetch transport
- `integrations/` — breadcrumbs, globalhandlers, httpcontext, linkederrors, browserapierrors, browsersession
- `userfeedback.ts` — createUserFeedbackEnvelope
- `report-dialog.ts` — showReportDialog
- `utils/lazyLoadIntegration.ts`
- `profiling/` — uiProfiler (exported from base bundle)

### packages/core/src/
- Core SDK functionality pulled into the bundle: Scope, Client, Hub, transports, integrations
- `scope.ts`, `client.ts`, `sdk.ts`, `envelope.ts`, `api.ts`
- `integrations/` — functionToString, inboundFilters/eventFilters, dedupe
- `metrics/` — metrics API
- `tracing/` — span utilities (getActiveSpan, startSpan, etc.)
- `exports.ts` — re-exported functions
- `utils/` — various utilities

### packages/browser-utils/src/
- Browser instrumentation utilities used by integrations

### dev-packages/rollup-utils/
- Bundle configuration and plugins (modify with caution)

## Off Limits
- Do NOT change public API signatures or remove public exports
- Do NOT modify test files to make tests pass (fix the source instead)
- Do NOT change package.json, yarn.lock, or build tooling versions
- Do NOT remove functionality — only reduce code size for same behavior
- `rollup.bundle.config.mjs` — the main bundle config should stay as-is
- Replay, feedback, canvas packages — not in the base bundle

## Constraints
- Tests must pass: `yarn test` in packages/browser
- No new dependencies
- Bundle must remain functionally equivalent
- Changes to core must not break other packages (but we only test browser here)

## What's Been Tried

### Terser Config Optimizations (kept)
- `compress.passes: 3` — multi-pass dead code elimination (+0.5%)
- `compress.ecma: 2017` — modern JS optimizations (tiny)
- `compress.toplevel: true` — better inlining
- `compress.unsafe_comps: true` — comparison optimizations
- `compress.unsafe_math: true` — math optimizations
- `compress.pure_getters: true` — assumes getters have no side effects
- `compress.unsafe_arrows: true` — converts functions to arrows (~1.3KB raw savings)
- `compress.unsafe_methods: true` — shorthand methods
- `mangle.toplevel: true` — mangle top-level variables

### Terser Config (discarded)
- `hoist_funs + hoist_vars` — worse gzipped despite better raw (hurts gzip patterns)
- `unsafe_proto + unsafe_regexp` — no gzip improvement
- `compress.module: true` — no improvement

### Source Optimizations (kept)
- Removed unused `breadcrumbData` variable in fetch breadcrumb handler
- Simplified `_enhanceEventWithInitialFrame` — removed redundant variable aliases
- `LazyLoadableIntegrations`: derive bundle names from key names instead of storing both key+value (~72 bytes gzipped)

### Source Optimizations (discarded)
- `getReportDialogEndpoint` URLSearchParams — no size improvement
- `LazyLoadableIntegrations` full derivation with hyphens — CDN filenames don't match (some are `httpclient` not `http-client`)

### Additional Kept Changes
- `isNativeFunction`: simplified regex from exact whitespace match to just `[native code]` check
- Extension protocol check: replaced array.some with regex test
- `DEFAULT_EVENT_TARGET`: use comma-separated string.split instead of array literal (51B raw savings)
- `LAZY_LOADABLE_NAMES`: same string.split technique (31B raw savings)
- terser compress passes: 5 (up from 3)
- terser compress ecma: 2020 (up from 2017)

### Dead Ends
- SyncPromise and AsyncContextStack already tree-shaken from min bundle
- Debug logging properly stripped via DEBUG_BUILD flag
- Node-specific code properly tree-shaken via __SENTRY_BROWSER_BUNDLE__
- Spotlight integration stripped by rollup-include-development-only comment
- `hoist_funs`/`hoist_vars` terser options — hurt gzip patterns
- `unsafe_proto`/`unsafe_regexp`/`module`/`unsafe_undefined`/`collapse_vars` terser options — no improvement
- `output.ecma: 2020` — no additional benefit over `compress.ecma`
- `getReportDialogEndpoint` URLSearchParams — no size improvement
- Inlining arrays (e.g. allowedAttrs) — terser already handles this
- Object.keys(x).length patterns — too many small instances, gzip handles repetition
