# http integration conversion log

## Summary

Converted `@opentelemetry/instrumentation-http` (outgoing request span creation and trace propagation) to a portable Sentry SDK integration.

## What was done

### Core integration (`packages/core/src/integrations/http/`)

Created the following files:

- `types.ts` — Minimal platform-portable interfaces: `HttpOutgoingRequest`, `HttpIncomingResponse`, `HttpExport`, `HttpModuleExport`, `HttpModulePatchOptions`
- `constants.ts` — Shared symbols (`ORIGINAL_REQUEST`, `ORIGINAL_GET`) and log prefix
- `get-request-url.ts` — Reconstructs the full URL from a `ClientRequest` object
- `get-outgoing-span-data.ts` — Builds span name/attributes for outgoing requests and responses
- `merge-baggage.ts` — Merges existing and incoming baggage headers (sentry- entries take precedence)
- `inject-trace-propagation-headers.ts` — Injects `sentry-trace`, `traceparent`, `baggage` headers based on `tracePropagationTargets`
- `instrument-outgoing-request.ts` — Attaches span tracking and optional trace header injection to an already-created `ClientRequest`
- `index.ts` — Exports `patchHttpModule`, `patchHttpsModule`, `addOutgoingRequestBreadcrumb`

Key decisions:

- **No unpatch functions** — per project convention, patches are permanent once applied
- **Breadcrumbs are NOT in patchHttpModule** — `SentryHttpInstrumentation` already handles breadcrumbs via `http.client.response.finish` diagnostics channel on all Node 18+
- `patchHttpsModule` applies HTTPS defaults (`protocol: 'https:'`, `port: 443`) for plain object args only (not URL instances or strings)
- Span status uses numeric literals (`{ code: 0 }`, `{ code: 2 }`) to satisfy TypeScript's literal type constraints

### Node integration (`packages/node/src/integrations/http.ts`)

- Removed `HttpInstrumentation` from `@opentelemetry/instrumentation-http`
- Added `HttpOutgoingInstrumentation extends InstrumentationBase<HttpOutgoingInstrumentationConfig>` which calls `patchHttpModule`/`patchHttpsModule` from `@sentry/core`
- Added `instrumentHttpOutgoing = generateInstrumentOnce(...)` singleton
- Replaced `_shouldUseOtelHttpInstrumentation` with `_shouldUseHttpOutgoingInstrumentation` — same semantics: returns `false` on Node 22.12+, respects explicit `spans` option, returns `false` when `skipOpenTelemetrySetup: true`
- Removed `@opentelemetry/instrumentation-http` from `packages/node/package.json`
- Updated `packages/node/src/integrations/tracing/index.ts` to use `instrumentHttpOutgoing`

### Unit tests (`packages/core/test/lib/integrations/http/`)

6 test files, 97 tests total, all passing:

- `get-request-url.test.ts` — 6 tests
- `merge-baggage.test.ts` — 9 tests
- `get-outgoing-span-data.test.ts` — 18 tests
- `inject-trace-propagation-headers.test.ts` — 18 tests
- `instrument-outgoing-request.test.ts` — 22 tests
- `index.test.ts` — 24 tests

## Notes

- The `FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL` flag (Node 22.12+) remains unchanged — on those versions, `SentryHttpInstrumentation` handles everything via diagnostics channels and `HttpOutgoingInstrumentation` is not used
- The `HttpOutgoingInstrumentationConfig` extends `InstrumentationConfig` from `@opentelemetry/instrumentation` to satisfy `generateInstrumentOnce` type constraints
