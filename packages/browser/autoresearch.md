# Autoresearch: Browser CDN Bundle Size Reduction

## Objective
Reduce the gzipped size of the `@sentry/browser` base CDN bundle (`build/bundles/bundle.min.js`).
This bundle is built from `src/index.bundle.ts` → `src/index.bundle.base.ts` → `src/exports.ts`.
It includes `@sentry/core` and `@sentry-internal/integration-shims` (for tracing/replay/feedback stubs).

Current baseline: ~27.85 kB gzipped, ~81.4 kB raw (minified).

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
(nothing yet — this is the initial session)
