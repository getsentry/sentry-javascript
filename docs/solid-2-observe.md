# Solid 2's observe tier — what `@sentry/solid-2` builds on

A reviewer's brief for the Solid 2 SDK (`packages/solid-2`): what the runtime exposes, what the integration relies
on, and where the trust boundaries are. The normative text lives in the Solid repo
([RFC 08, dev diagnostics](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/08-dev-diagnostics.md),
[RFC 12, SSR/HTTP](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/12-ssr-http.md),
[RFC 10, server functions](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/10-server-functions.md));
this is the map.

## Three build tiers

Solid 2 ships three builds of every runtime package, selected by export condition:

| Tier      | Condition     | Contains                                                                         | Size (brotli, CSR app)   |
| --------- | ------------- | -------------------------------------------------------------------------------- | ------------------------ |
| `prod`    | default       | The runtime. `OBSERVE` and `DEV` are `undefined`.                                | 15.2 KB                  |
| `observe` | `observe`     | prod + the structured channels and hook slots: `OBSERVE`. No console, no checks. | 16.7 KB (+1.3 KB wiring) |
| `dev`     | `development` | observe + the dev checks and the console face: `DEV`. Unminified.                | —                        |

The tiers nest: whatever works on `observe` works on `dev`. An app opts in with `solid({ observe: true })` in
`@solidjs/vite-plugin`, which sets the condition for every environment and turns on the compiler's `componentNames`
(component labels survive minification — the `<App> › <Feed>` paths below). In `vite dev` the `development`
condition still wins, by design: the dev build is a superset.

What this means for the SDK:

- **Error reporting works in every tier.** The error hooks are part of the runtime, not of `OBSERVE`. A production
  app with no observability tooling gets error events from `init()` alone.
- **Tracing needs the observe build.** Without it `OBSERVE` is `undefined`, the tracing integrations log once in
  debug mode and do nothing. There is no partial mode.
- The attribution engine (`solid-js/attribution`) is a separate 10.5 KB entry the observe build carries only when
  imported — `solidTracingIntegration` imports it, so enabling tracing costs that plus the 1.3 KB wiring. Idle
  wiring cost with no hooks installed is capped by Solid's suite at 1.25× the prod build on a graph-heavy workload
  (measured 1.03–1.09).

## The surface the integration touches

Everything is imported from `solid-js` and `@solidjs/web`. The SDK never imports `@solidjs/signals` (the engine
package underneath), and never touches a `_`-prefixed field.

### Error hooks (every tier)

```ts
// solid-js
configureClientErrors({ onError(error, { ownerPath, boundaryPath }) {} });
// @solidjs/web (server)
configureServerErrors({
  onError(error, { kind, handling, boundary, boundaryPath, functionId, direct, ownerPath, event }) {},
});
```

- Called **once per error object**, at first sight. A boundary re-collecting the same failure after `reset()` says
  nothing new.
- **Client**: fires when an `<Errored>` renders its fallback — the one road a rendered failure took that no global
  handler saw. Uncaught errors keep reaching `window.onerror` / `unhandledrejection`, which the browser SDK already
  handles; the hook does not duplicate them.
- **Server**: fires for every failure the runtime handles or fails on. `kind`/`handling` say which:
  `render/fallback` (an `<Errored>` rendered its fallback), `render/client` (a `<Loading>` fragment rejected; the
  client re-renders the subtree), `render/failed` (nothing contained it; the request fails), `render/serialize` (a
  hydration value would not serialize), `server-function/thrown`, `server-function/channel` (a rejection escaping
  through a returned promise/iterable/stream after the head committed). `direct: true` marks an in-process
  server-function call made during SSR.
- The hook receives the error **as thrown**. The wire — the fallback's serialized error, the RPC error body — gets
  Solid's sanitized value (a generic `Error` outside dev) unless the hook **returns** a replacement. That return is
  what `solidServerErrorsIntegration({ mapError })` exposes; the SDK itself never returns one.
- `ownerPath` is where the error was **thrown** (labels up the owner chain of the computation that threw);
  `boundaryPath` is where it was **met** (the boundary's own chain). Both only where the runtime keeps owner names —
  observe and dev; production owners carry none, so in prod these are `undefined` and grouping falls back to the
  stack.
- Per-root hooks exist (`render(fn, el, { onError })`, `renderToStream(fn, { onError })`) and win over the ambient
  one. The SDK uses the ambient one.

### `OBSERVE.records` (observe tier)

One process-wide channel, on both platforms, delivering **completed** records by type:

| Type           | Platform | One per                                           | Joins by                                        |
| -------------- | -------- | ------------------------------------------------- | ----------------------------------------------- |
| `"call"`       | client   | server-function call the page made                | `id` with the server's `"invocation"`; `origin` |
| `"invocation"` | server   | server-function execution (HTTP or direct)        | `id`; `boundary` with the boundary record       |
| `"boundary"`   | server   | `<Loading>` that waited during a render           | `id` (hydration id); `revealGroup`              |
| `"frame"`      | both     | frame stream produced (server) / applied (client) | `id` + `version` across the two sides           |

The contract that shapes the integration:

- A record is **plain data**: ids, names, `outcome`, `at`, `durationMs`, counts. Anything live — the request, the
  response, the arguments, the result, the error as thrown — travels in a second `live` argument to the listener,
  never on the record. Record attributes never carry values. The integration does not capture `live.error` either:
  the same error object reaches an error hook (an `<Errored>` fallback, the server hook), and Sentry's once-per-object
  guard means whichever ran first would win — the record beat the hook and misreported a handled boundary catch as
  an unhandled crash before the e2e app caught it. Records set span status; hooks report errors.
- Records arrive **settled**, with `at` on the `performance.now()` clock and durations from it, so spans are built
  after the fact with explicit `startTime`/`end`. `epochSeconds(at) = (performance.timeOrigin + at) / 1000`.
- A `"call"` carries `origin`: the engine's interaction/navigation frame, read at dispatch. It is the **same object**
  the attribution engine puts on its `InteractionEvent`, so a call is joined to the click that made it by identity,
  not by time (`Tracer.claimCall`).
- Listeners run **inside the runtime**, synchronously. They must not throw (a throwing listener is reported and does
  not stop others) and must not write signals — hence every span is built in `queueMicrotask`.
- Server records are delivered inside the request's async context, so under `@sentry/node` they parent on the active
  `http.server` span without anything passing a parent around.

### The attribution engine (observe tier, `solid-js/attribution`)

`attribution.enable(options)` installs the engine into the core's single hook slot; `attribution.subscribe(type, fn)`
delivers `InteractionEvent`, `NavigationEvent`, `HoldEvent` and `RerunEvent` as they settle, bottom-up (a hold before
the navigation it held, before the interaction that performed it). The SDK uses only those two calls. The engine's
folds (`costs()`, `feedback()`, `why()`, `subscriptions()`) are named exports the SDK never imports, so they
tree-shake out of an app that only ships the integration.

- `InteractionEvent`: one per user event the web runtime stamped (`click`, `keydown`, …), with the handler's
  duration, the writes it made, the re-runs and creations it caused, `settledMs` (dispatch → last effect that traces
  back to it), and its `holds` and `navigations`. The integration's root span.
- `NavigationEvent`: declared by the router via `withOrigin` — route pattern as `name`, concrete `to`/`from`,
  `params`, redirect hops, `outcome`. Router-agnostic: any router that wraps its location write gets these; the SDK
  has no router code.
- `HoldEvent`: a write that landed behind async work, with what blocked it, how long, and which affordance
  acknowledged the wait (`isPending`, `latest`, an optimistic value) or none — Solid's INP-shaped fact.
- `RerunEvent`: per re-run, `nodeId` (no live node), causes, self-time. The integration folds these into a per-
  interaction hot list; it never sends one per run.
- The engine also emits **diagnostics** (`OBSERVE.diagnostics`): `SILENT_HOLD`, `LONG_HOLD`, `HOT_SCOPE_RERUNS`,
  `ASYNC_WATERFALL`, and the server's `SSR_RENDER_ERROR_CONTAINED`, `SSR_ERROR_SANITIZED`, … A finding is an
  **issue**, not a span: it has a stable identity and recurs, so the SDK fingerprints it by `[code, ...ownerPath]`.
  Severity is Solid's: `info` is advisory and not reported by default; `error` findings do not exist in the observe
  build (they are dev-only checks) except the server's contained-render-error family.

### `OBSERVE.server.trace` (observe tier, server)

`OBSERVE.server.trace.provide(request => TraceContext)` installs one provider, called once per request inside the
request's async context. Whatever it answers — trace/span ids, `sampled`, and named `entries` — the runtime emits on
**two carriers** it already owns: a `Server-Timing: traceparent;desc="…"` header on **every** response, and the
`<meta name="sentry-trace">` / `<meta name="baggage">` pair in an HTML shell. So the browser `pageload` parents under
the server request with no middleware and no body rewriting, and it works for frame streams and RPC responses that
have no `<head>` at all (the 1.x `sentryBeforeResponseMiddleware` rewrite was silently a no-op for those).

The provider answers from `getActiveSpan()` / `getTraceData()` and **overrides `parentId`**: the browser sends
`sentry-trace` and `traceparent` with different span ids, `@sentry/node` continues from the former while the runtime
derives its parent from the latter; the provider is where Sentry's view wins.

## What the integration decides, and what it does not

- **Sampling** is the SDK's (`tracesSampleRate` / `tracesSampler`). An unsampled session still pays Solid's 1.3 KB
  wiring, but not the engine's work: `attribution.enable()` is called regardless today — a follow-up can gate it on
  the sampling decision.
- **Span topology.** A user interaction is a **root** span (`parentSpan: null`); its navigations, holds and calls are
  children; a navigation or hold no interaction claims is a root of its own; an orphan navigation whose request time
  falls inside a settled interaction's handler window gets a span **link** to it rather than a guessed parent. Whether
  an interaction should instead parent under an active `pageload`/`navigation` idle span is an open product question
  (`forceTransaction` is deprecated; span streaming makes "root or child" the only distinction).
- **Calls after the interaction settled.** `onClick={async () => set(await call())}` makes no synchronous write, so
  the engine settles the interaction as `idle` at once and the call it dispatched lands afterwards — carrying the
  interaction's frame. It becomes a child of the interaction's (already ended) span by that identity, marked
  `solid.server_function.after_settle`, rather than a root: the causal tree is right, the timing tells the truth.
  Whether the engine should keep an interaction open across the handler's returned promise is a Solid-side question.
- **Mechanism types** follow the `auto.function.solid.*` family; `sentry.origin` is `auto.ui.solid.attribution`,
  `auto.http.solid.call`, `auto.ui.solid.frame`, `auto.function.solid.server`.
- **Process-wide channels vs. per-client integrations.** Solid's channels are singletons; the integrations keep an
  `uninstall` so a second `init()` (tests, HMR) replaces subscriptions instead of stacking them. The `Integration`
  interface has no teardown hook, so this is module state.

## PII

Solid's records name things — owner paths, `name` options, store paths, route patterns, function ids — and are
otherwise numbers, kinds and outcomes. The complete list of fields that carry user data is in RFC 08 ("Values in
records — the PII surface"); what the integration does with each:

| Field                                                 | Content                                             | Integration                                                             |
| ----------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| `InteractionRef.target` / `ChangeOrigin.target`       | `tag#id "text"` with up to 30 chars of text content | Text stripped from names and attributes unless `targetText: true`       |
| `ChangeRecord.prev`/`value`, `HeldWrite.prev`/`value` | Value previews (strings cut at 40 chars)            | Never sent — re-runs are folded to names and counts                     |
| `ChangeOrigin`/`NavigationEvent` `to`/`from`/`params` | Concrete paths and bound params                     | Sent as span attributes (URLs are already in the trace)                 |
| `DiagnosticEvent.data.error` (server error findings)  | The error as thrown, unsanitized                    | Not forwarded as an extra; the error hook captured it as an exception   |
| `DiagnosticEvent.data`, `.message` (responsiveness)   | Interaction target, navigation paths                | Forwarded as extras / issue title, target text subject to the same gate |

No `dataCollection` category fits UI text today; `targetText` is the integration's own switch until one exists.

## Where the proofs are

- Unit tests in `packages/solid-2/test` run against the **built observe artifacts** of the published Solid (aliased
  explicitly — Vitest's resolver always prefers `development`), in jsdom for the client and Node for the server,
  through the real `BrowserClient`/`NodeClient` under span streaming.
- The join-by-identity of a call to its interaction, the trace provider answering from a real span, a waiting
  `<Loading>` becoming a span with its component path, and the thrown-vs-met split are each pinned there.
- The e2e app (`dev-packages/e2e-tests/test-applications/solid-2`) runs a built `@solidjs/vite-plugin` start-mode
  app — observe build, server SDK through `start.instrument`, a bare `node:http` host — through Playwright against the
  packed tarballs and proves what the units cannot: boundary and invocation spans parenting under OTel's
  `http.server` span, the browser `pageload` continuing the server trace with no middleware, a click's call becoming
  its child through a real fetch, and both error hooks firing once with component paths.

Two things to know when reading the e2e app's config: the client module imports `@sentry/solid-2/client` explicitly
because the module is reachable from the server graph (behind an `isServer` guard), where the bare specifier resolves
to the server half; and the app declares `@sentry/node` as a direct dependency. The plugin inlines this package into
the server bundle (it consumes the Solid runtime; an externalized copy would load Solid's prod build through Node and
see no `OBSERVE`), and under pnpm's isolated layout a transitive `@sentry/node` is not resolvable from the app root,
so Vite bundles it too — where `import-in-the-middle` cannot find itself and logs a registration failure (core-module
instrumentation still works; the `http.server` spans show it). Declared by the app, `@sentry/node` resolves, is
externalized, and the warning is gone. Worth a line in the SDK's install docs.
