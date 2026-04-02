# Convert OTel Integration: connect

## Overview

Converted `@opentelemetry/instrumentation-connect` from a Node-only OTel-based integration to a portable, OTel-free implementation that works in any JavaScript environment.

## Changes

### New: `packages/core/src/integrations/connect/index.ts`

Portable integration derived from the OTel connect instrumentation. Key exports:

- **`patchConnectModule(connect, options?)`** — wraps the connect factory so every app it creates is automatically patched. Returns the wrapped factory.
- **`patchConnectApp(app, options?)`** — patches an already-created connect app instance's `use` and `handle` methods directly.
- **`setupConnectErrorHandler(app)`** — adds a 4-argument error middleware that captures exceptions via `captureException`.
- **`ConnectIntegrationOptions`** — interface with optional `onRouteResolved` callback, used by platform integrations (e.g. Node.js) to propagate the resolved route to OTel RPC metadata.

Implementation notes:

- Route stack tracking is ported from OTel's `utils.js` — a per-request symbol property holds a stack of route path segments that is combined into a full HTTP route string via `generateRoute`.
- Spans are created with `startSpanManual` and Sentry attributes are set directly (`sentry.op`, `sentry.origin`) — no `spanStart` hook needed.
- Origin changed from `'auto.http.otel.connect'` → `'auto.http.connect'` (no longer OTel-based).
- `withActiveSpan(parentSpan, ...)` is called when invoking `next()` so subsequent middleware spans are siblings of the parent rather than children of the current span.
- Middleware arity (`length`) is preserved on the patched function so connect can distinguish error middlewares (4 args) from regular ones (3 args).

### New: `packages/core/test/lib/integrations/connect/index.test.ts`

20 unit tests covering:

- `patchConnectModule` factory wrapping
- Anonymous and named middleware span creation
- `onRouteResolved` callback behavior
- Span lifecycle (ends on `next()` or response `close` event, not both)
- No span when no active parent span
- Error middleware argument positions
- Handle route stack tracking
- Double-patch debug error logging
- `setupConnectErrorHandler` error capture

### Modified: `packages/core/src/index.ts`

Added exports:

```typescript
export { patchConnectModule, setupConnectErrorHandler } from './integrations/connect/index';
export type { ConnectIntegrationOptions, ConnectModule } from './integrations/connect/index';
```

### Rewritten: `packages/node/src/integrations/tracing/connect.ts`

Replaced the OTel-instrumentation-based implementation with one that:

- Defines `ConnectInstrumentation extends InstrumentationBase` whose `init()` method calls `patchConnectModule` via `InstrumentationNodeModuleDefinition`.
- Sets OTel RPC metadata route via the `onRouteResolved` callback (preserving existing OTel route-tracking behavior for Node users).
- `setupConnectErrorHandler` delegates to `coreSetupConnectErrorHandler` and calls `ensureIsWrapped` to verify the instrumentation is active.
- Removed the `spanStart` hook (`addConnectSpanAttributes`) — no longer needed since attributes are set directly when spans are created.

### Modified: `packages/node/package.json`

Removed dependency:

```
"@opentelemetry/instrumentation-connect": "0.56.0"
```

### Modified: `dev-packages/node-integration-tests/suites/tracing/connect/test.ts`

Updated expected `sentry.origin` value:

- Before: `'auto.http.otel.connect'`
- After: `'auto.http.connect'`

## Verification

- `yarn fix` — no lint or format issues
- `yarn build` — full production build succeeds
- `yarn install` — lockfile updated, removing the OTel connect package
- `packages/core` connect unit tests: **20/20 passed**
- `packages/node` unit tests: **324/325 passed** (1 pre-existing skip)
- `node-integration-tests` connect suite: **6/6 passed** (ESM + CJS)
- Hono test failures confirmed pre-existing on base branch, unrelated to this change
