# Sentry JavaScript SDK Migration Docs

These docs walk through how to migrate our JavaScript SDKs through different major versions.

- Upgrading from [SDK 4.x to 5.x/6.x](./docs/migration/v4-to-v5_v6.md)
- Upgrading from [SDK 6.x to 7.x](./docs/migration/v6-to-v7.md)
- Upgrading from [SDK 7.x to 8.x](./docs/migration/v7-to-v8.md)
- Upgrading from [SDK 8.x to 9.x](./docs/migration/v8-to-v9.md)
- Upgrading from [SDK 9.x to 10.x](./docs/migration/v9-to-v10.md)
- Upgrading from [SDK 10.x to 11.x](#upgrading-from-10x-to-11x)

# Upgrading from 10.x to 11.x

Version 11 of the Sentry JavaScript SDK primarily focuses on better OpenTelemetry interoperability, more flexible instrumentation, and better out-of-the-box defaults. The biggest changes are:

- **Better OpenTelemetry interoperability:** Sentry no longer takes over your OpenTelemetry setup.
- **Better instrumentation:** It is now possible to instrument at run and build time, unlocking proper tracing on platform providers like Vercel and Netlify.
- **Broader runtime support:** Our integrations are now usable on Cloudflare, Bun and Deno.
- **Span streaming:** Streaming spans becomes the new default, bypassing size and span volume limits of legacy transactions.
- **Data collection:** `sendDefaultPii` is replaced by a more granular `dataCollection` option with more permissive defaults.
- **Node and TypeScript versions:** Node **20.19.0** is the new minimum and we raised the minimum TypeScript version.
- **Framework versions:** We raised the minimum version of various supported frameworks.

Since some of these changes are not caught by TypeScript or other tooling, we recommend reading through this entire guide before upgrading. For an early overview see [#22056 "What's coming in v11"](https://github.com/getsentry/sentry-javascript/issues/22056).

Version 11 of the SDK is compatible with Sentry self-hosted versions 24.4.2 or higher (unchanged from v10).
Lower versions may continue to work, but may not support all features.

## 1. Version Support Changes:

Version 11 of the Sentry SDK has new compatibility ranges for runtimes and frameworks.

### General Runtime Support Changes

**Node.js:** The minimum supported Node.js version is now **20.19.0**. Node.js 18 is no longer supported.

**Deno:** The minimum supported Deno version is now **2.8.3**.

**Browsers:** Support for **Safari 14** was dropped. Sentry now requires Safari 15 or higher. For the rest of the browser support matrix, refer to the [Sentry docs](https://docs.sentry.io/platforms/javascript/#browser-support).

### TypeScript Version Policy

The minimum required TypeScript version is increased to version `5.0.4`. We also no longer emit down-leveled types.

Older TypeScript versions _may_ continue to be compatible, but no guarantees apply.

### Framework and Library Support Changes

We raised the minimum supported versions of several frameworks and libraries:

- **Next.js:** dropped Next.js 13 (minimum is now 14).
- **React:** dropped React 16 (minimum is now 17).
- **Astro:** dropped Astro 3 (minimum is now 4).
- **React Router (framework mode):** minimum is now 7.15.
- **Remix:** dropped `@remix-run/node` v1 (minimum is now v2).
- **Fastify:** dropped Fastify 3.0 through 3.20 (minimum is now 3.21).

<!-- TODO(v11): Evaluate whether we can move to Sentry CLI v4 already. -->

### Sentry CLI v3

The SDK and bundler plugins now use Sentry CLI v3. This is an internal change for most users. If you pin or invoke `@sentry/cli` directly, upgrade your usage to v3.

### AWS Lambda Layer Changes

A new AWS Lambda Layer for version 11 will be published as `SentryNodeServerlessSDKv11`.
The ARN will be published in the [Sentry docs](https://docs.sentry.io/platforms/javascript/guides/aws-lambda/install/cjs-layer/) once available.

Updates and fixes for version 10 will be published as `SentryNodeServerlessSDKv10`.

## 2. Behaviour Changes

### Better OpenTelemetry interoperability

Affected SDKs: Server-side SDKs (`@sentry/node` and all dependents).

By default, v11 no longer sets up an OpenTelemetry tracer provider for **most** SDKs. SDKs now own the full span lifecycle, producing native Sentry spans.

A new optional OpenTelemetry integration lets you connect Sentry events such as Errors, Logs, Crons and Metrics to your OpenTelemetry traces, if you need to.

Only `@sentry/nextjs` and `@sentry/sveltekit` still set up an OpenTelemetry compatible light tracer provider to capture spans the underlying frameworks emit.

This means you can run your own OpenTelemetry setup cleanly alongside Sentry without having Sentry spans leak into your pipeline anymore. Your OpenTelemetry setup will no longer be required to use Sentry components for exporting, context management and trace propagation.

With this, we also heavily reduced our OpenTelemetry dependencies, with `@opentelemetry/api` being the only remaining package we abide by. These changes also mean `@sentry/node-core` no longer serves any purpose and was [merged back into `@sentry/node`](#sentrynode-core-was-merged-back-into-sentrynode).

For most users, day-to-day tracing is **unchanged**.

> **TODO(v11):** Document the new optional OpenTelemetry integration once its final name and signature
> are locked in — add the `Sentry.init` example.

> **TODO(v11):** Link to the upcoming guide covering common use cases with the new OpenTelemetry setup
> (running your own OpenTelemetry setup alongside Sentry, connecting Sentry events to OTel traces, etc.).

### Channel-based instrumentation is the default

Affected SDKs: `@sentry/node` and all dependents.

The new channel-based instrumentations (using `orchestrion` instead of `import-in-the-middle`) are now the default. They were available opt-in in v10. This unlocks instrumenting at run and build time, which enables instrumentation at deployment targets like Vercel and Netlify, as well as using instrumentations on non-Node runtimes like Cloudflare, Bun and Deno. For most users this requires no changes.

### Initializing via `--require` is no longer supported

Affected SDKs: `@sentry/node` and all dependents.

Node re-runs `--require` preloads on the internal module loader thread it spawns for `Module.register()` — which the SDK triggers itself when it installs its instrumentation hooks. A `--require`d instrument file therefore ran `Sentry.init()` a second time, on a thread that never executes any of your code. The SDK now skips initialization on that thread and warns when it detects that it was loaded through `--require`.

Use [`--import`](https://nodejs.org/api/cli.html#--importmodule) instead. It is not re-run on the loader thread, and it works for CommonJS apps too — the instrument file's extension (`.cjs`, or `.js` in a package without `"type": "module"`) is what decides that it loads as CommonJS:

```bash
# Before
node --require ./instrument.js app.js

# After
node --import ./instrument.js app.js
```

The same applies to the no-code entry points, e.g. `node --import=@sentry/node/init app.js` and `node --import @sentry/node/preload app.js`.

### Span streaming is now the default

Affected SDKs: All SDKs.

Each span is sent to Sentry the moment it finishes instead of being buffered until the root span completes. This means spans are no longer bound by the 1000-span per transaction limit and their individual payload-size limits have been increased.

The new model comes with some changes to Sentry hooks such as `beforeSendSpan` or options like `ignoreSpans` and requires manual migration. `beforeSendTransaction` and `ignoreTransactions` will **no-op**. Users who cannot migrate yet can opt into the previous transaction-based static model.

> **TODO(v11):** The migration path for span streaming is still being defined. Document:
>
> - the concrete before/after for `beforeSendSpan` and `ignoreSpans`,
> - the exact replacement for `beforeSendTransaction` / `ignoreTransactions`,
> - how to opt back into the transaction-based model (option name + example).

### Logs are enabled by default

Affected SDKs: All SDKs.

Logging follows an opt-in-by-usage model similar to metrics: you are opted in when you call `Sentry.logger.*` or explicitly enable a logging integration. The default value of `enableLogs` is now `true`, and logging integrations do not emit logs unless explicitly enabled.

To opt out of logging entirely, set `enableLogs` to `false`:

```js
Sentry.init({
  enableLogs: false,
});
```

### `sendDefaultPii` is replaced by `dataCollection`

Affected SDKs: All SDKs.

The `sendDefaultPii` option was **removed** and replaced by a more granular `dataCollection` option that controls each category of collected data individually.

The **default behaviour is now more permissive**. In v10, with neither `sendDefaultPii` nor `dataCollection` set, the SDK behaved like `sendDefaultPii: false`. In v11, the `dataCollection` defaults apply out of the box:

| Category              | v10 default (no `sendDefaultPii`) | v11 default          |
| --------------------- | --------------------------------- | -------------------- |
| `userInfo`            | `false`                           | `true`               |
| `cookies`             | sensitive keys denied             | `true`               |
| `httpHeaders`         | sensitive keys denied             | request + response   |
| `httpBodies`          | none (`[]`)                       | all request/response |
| `urlQueryParams`      | sensitive keys denied             | `true`               |
| `genAI`               | inputs/outputs off                | inputs + outputs on  |
| `stackFrameVariables` | `true`                            | `true`               |
| `frameContextLines`   | `5`                               | `5`                  |

> Sensitive values (keys, tokens, auth headers, etc.) are always filtered out regardless of these settings.

Migration:

```js
// before (v10) — collect the default set of PII
Sentry.init({
  sendDefaultPii: true,
});

// after (v11) — this is now the default; you can remove the option entirely,
// or opt into specific categories explicitly:
Sentry.init({
  dataCollection: {
    userInfo: true,
    cookies: true,
    httpHeaders: { request: true, response: true },
    urlQueryParams: true,
    genAI: { inputs: true, outputs: true },
  },
});
```

If you previously relied on the restrictive default (`sendDefaultPii: false` or unset) and want to
keep collecting as little data as possible, you now need to opt out explicitly:

```js
// after (v11) — restrict data collection to the v10-like minimum
Sentry.init({
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
  },
});
```

Each key-value field (`cookies`, `urlQueryParams`, `httpHeaders.request`, `httpHeaders.response`) accepts
`true`, `false`, `{ allow: string[] }`, or `{ deny: string[] }` for fine-grained control.

#### RequestData

The `requestDataIntegration`'s `include` options remain an integration-level override. An explicit `false`
prevents that category from being attached, while an explicit `true` enables it even when the corresponding
`dataCollection` category is disabled. For cookies, headers, and query parameters, any configured `allow` or
`deny` filtering continues to apply: When `include` enables a category which `dataCollection` disabled, the
default sensitive-value denylist is applied.

User IP address inference, which was previously gated on `sendDefaultPii`, is now controlled by
`dataCollection.userInfo`. An explicit `requestDataIntegration({ include: { ip: true } })` overrides
`dataCollection.userInfo: false` for data collected by that integration.

### Browser sessions use `unhandled` instead of `crashed`

Affected SDKs: All SDKs running in the browser.

Browser sessions affected by an uncaught error are now recorded as `unhandled` rather than `crashed`. If you track crash-free session rates in Release Health or have alerts built on them, expect the crash-free rate to shift after upgrading.

### `page` is the default browser session lifecycle mode

Affected SDKs: All SDKs running in the browser.

The default `lifecycle` mode of `browserSessionIntegration` changed from `'route'` to `'page'`. In `'page'` mode a session is created once when the page loads and is **not** renewed on navigation. To restore the previous behaviour (a new session on load and on every navigation):

```js
Sentry.init({
  integrations: [Sentry.browserSessionIntegration({ lifecycle: 'route' })],
});
```

### `attachStacktrace` defaults to `true`

Affected SDKs: All SDKs.

`attachStacktrace` now defaults to `true`. Events captured with `Sentry.captureMessage`, and non-`Error` values passed to `Sentry.captureException`, now attach a synthetic stack trace pointing to the call site. Pass `attachStacktrace: false` in `Sentry.init` to restore the previous behavior.

Two consequences to be aware of when upgrading:

- **Issue grouping:** Grouping in Sentry differs for events with and without stack traces, so you may see new issue groups after upgrading.
- **Release health:** Events with a stack trace are counted as errors, so a `captureMessage` call (including messages emitted by `captureConsoleIntegration`) now marks the current session as _errored_. This affects errored-session counts but does **not** mark sessions as crashed, so crash-free session rate is unaffected. If you use `captureMessage` for purely informational output, consider using Sentry Logs instead, which is better suited and does not affect release health.

### `tracePropagationTargets` matching is now case-insensitive

Affected SDKs: All SDKs.

String and regular-expression matching for `tracePropagationTargets` is now case-insensitive.

### Span attribute changes

Affected SDKs: All SDKs.

- The `http.query` and `http.fragment` span attributes were renamed to `url.query` and `url.fragment`.
- `network.*` span attributes were aligned across SDKs.
- Legacy messaging (`messaging.*`) and database (`db.statement`, …) span attributes on the AMQP and Redis instrumentations were replaced by their current semantic-convention equivalents.
- The gen_ai cache token attributes `gen_ai.usage.cache_creation_input_tokens` and `gen_ai.usage.cache_read_input_tokens` were renamed to `gen_ai.usage.cache_creation.input_tokens` and `gen_ai.usage.cache_read.input_tokens`.
- Span attributes now use the shared `@sentry/conventions` package under the hood.

If you reference these attributes in custom instrumentation, `beforeSendSpan`, dashboards, or alerts, update them to the new names.

### LangGraph no longer emits `create_agent` spans

Affected SDKs: All server-side SDKs.

The LangGraph instrumentation no longer emits `gen_ai.create_agent` spans when a graph is compiled. `gen_ai.invoke_agent` and `gen_ai.execute_tool` spans are unaffected. If you reference `create_agent` spans in dashboards or alerts, update them accordingly.

### `thirdPartyErrorFilterIntegration` filters internal frames by default

Affected SDKs: All SDKs.

`ignoreSentryInternalFrames` is now the default behaviour for `thirdPartyErrorFilterIntegration`.

### Console breadcrumbs handled by `consoleIntegration`

Affected SDKs: `@sentry/browser` and `@sentry/deno` (and their dependents).

The `console` option of `breadcrumbsIntegration` was removed. Use the `consoleIntegration` from `@sentry/core` to capture console breadcrumbs instead.

### `@sentry/nextjs`

**Tracing removed from generated templates:** Tracing was removed from the generated Pages Router API handler, Edge API handler, and Middleware wrapper templates. Route handlers and middleware are still instrumented automatically, so no action is required for most users.

**Middleware span op changed to `middleware`:** Next.js middleware spans now use the `middleware` span op instead of `http.server.middleware`. If you filter or alert on the previous op (e.g. in dashboards or dynamic sampling rules), update it to `middleware`.

### Cloudflare: `nodejs_compat` compatibility flag is now required

Affected SDKs: `@sentry/cloudflare`.

The SDK now requires the `nodejs_compat` compatibility flag instead of `nodejs_als`. Update your `wrangler.toml` (or `wrangler.jsonc`):

```diff
- compatibility_flags = ["nodejs_als"]
+ compatibility_flags = ["nodejs_compat"]
```

### Cloudflare: `wrapRequestHandler` moved to `@sentry/cloudflare/request`

> **TODO(v11):** This needs to be clarified with #22367

Affected SDKs: `@sentry/cloudflare`.

`wrapRequestHandler` is no longer available from the main `@sentry/cloudflare` entry point. Import it from the dedicated subpath instead:

```diff
- import { wrapRequestHandler } from '@sentry/cloudflare';
+ import { wrapRequestHandler } from '@sentry/cloudflare/request';
```

## 3. Removed APIs

### `@sentry/core` / All SDKs

- The internal, deprecated `addAutoIpAddressToUser` export was removed.
- The `createSpanEnvelope` function and the `SpanEnvelope` / `SpanItem` types were removed. They existed only to send standalone (v1) spans as their own segment envelope, which the SDK no longer does. Standalone spans are gone; spans are sent either on their transaction or, with span streaming, as streamed spans (`StreamedSpanEnvelope`).
- The `disableInstrumentationWarnings` option and the `MissingInstrumentationContext` type were removed. Now that instrumentation is channel-based, the SDK can no longer detect the "you imported a framework before `Sentry.init()`" case, so the warning it gated and the context it attached no longer exist.
- The deprecated `sendDefaultPii` option was removed. Use [`dataCollection`](#senddefaultpii-is-replaced-by-datacollection) instead.
- The `_experiments.enableMetrics` and `_experiments.beforeSendMetric` options were removed, use the top-level `enableMetrics` and `beforeSendMetric` options instead.

```js
// before
Sentry.init({
  _experiments: {
    enableMetrics: true,
    beforeSendMetric: metric => {
      return metric;
    },
  },
});

// after
Sentry.init({
  enableMetrics: true,
  beforeSendMetric: metric => {
    return metric;
  },
});
```

- The `_experiments.enableLogs` option was removed. Logs are now enabled by default, so if you were opting in via `_experiments.enableLogs: true` you can simply omit the option. Use the top-level `enableLogs: false` to opt out.

```js
// before
Sentry.init({
  _experiments: {
    enableLogs: true,
  },
});

// after: logs are enabled by default, no option needed
Sentry.init({});

// or, to opt out
Sentry.init({
  enableLogs: false,
});
```

- The deprecated `trackFetchStreamPerformance` option of `browserTracingIntegration` was removed. To track the duration of streamed fetch response bodies, add `fetchStreamPerformanceIntegration()` to your `integrations` array instead.

```js
// before
Sentry.init({
  integrations: [Sentry.browserTracingIntegration({ trackFetchStreamPerformance: true })],
});

// after
Sentry.init({
  integrations: [Sentry.browserTracingIntegration(), Sentry.fetchStreamPerformanceIntegration()],
});
```

### `@sentry/browser`

- The experimental `_experiments.enableStandaloneClsSpans` and `_experiments.enableStandaloneLcpSpans` options were removed from both `browserTracingIntegration` and `webVitalsIntegration`. CLS and LCP are no longer configurable: they are recorded as measurements on the pageload span, unless span streaming is enabled (`traceLifecycle: 'stream'`), in which case they are sent as dedicated spans.
- INP is now always sent as a web vital span (streamed when span streaming is enabled, standalone otherwise) that carries its value as a `browser.web_vital.inp.value` attribute. Previously, with span streaming disabled, INP was sent as a standalone span that carried its value as a span measurement.

- `browserTracingIntegration` no longer captures spans created by `performance.mark()` and `performance.measure()` by default. Add `userTimingIntegration()` to continue capturing them. The `ignorePerformanceApiSpans` option moved to the new integration as `ignore`.

```js
// before
Sentry.init({
  integrations: [
    Sentry.browserTracingIntegration({
      ignorePerformanceApiSpans: ['third-party-mark'],
    }),
  ],
});

// after
Sentry.init({
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.userTimingIntegration({
      ignore: ['third-party-mark'],
    }),
  ],
});
```

### `@sentry/node` / Server-side SDKs

- `SentryContextManager` is no longer exported. It is no longer needed now that Sentry does not set up OpenTelemetry by default.
- The deprecated `honoIntegration` was removed. Use the [`@sentry/hono`](https://www.npmjs.com/package/@sentry/hono) SDK to instrument Hono.
- The `connect` instrumentation was removed.
- The deprecated `prismaInstrumentation` option was removed. It was no longer used, as Prisma works out of the box.
- The `registerEsmLoaderHooks` option was removed. All instrumentation is now channel-based (via `@sentry/server-utils`), so the SDK no longer registers `import-in-the-middle` ESM loader hooks and the option no longer had any effect.
- The deprecated `SentryHttpInstrumentation` and `SentryNodeFetchInstrumentation` exports were removed. Use `instrumentHttpOutgoingRequests()` and the `nativeNodeFetchIntegration` respectively.
- The `generateInstrumentOnce` export was removed (from `@sentry/node` and the framework SDKs that re-exported it). It wrapped OpenTelemetry's `registerInstrumentations` and is no longer needed now that instrumentation is channel-based.
- The `@sentry/node/loader` entry point was removed. Use `node --import @sentry/node/import` instead.
- (Fastify) The deprecated `setShouldHandleError` method was removed.
- (AWS Lambda) The deprecated `disableAwsContextPropagation` option was removed. It no longer had any effect.
- (AWS Lambda) The deprecated `startTrace` option was removed. It no longer had any effect; to disable tracing, set `tracesSampleRate` to `0`.
- (AWS Lambda) The deprecated `tryPatchHandler` function was removed. It was no longer used.
- (Express) The deprecated `patchExpressModule(options)` signature was removed. Use `patchExpressModule(moduleExports, getOptions)` instead.

### `@sentry/cloudflare`

- The `@sentry/cloudflare/nodejs_compat` subpath export was removed. Since `nodejs_compat` is now required for all users, the main `@sentry/cloudflare` entry point includes everything that was previously only available via the subpath.

```diff
- import * as Sentry from '@sentry/cloudflare/nodejs_compat';
+ import * as Sentry from '@sentry/cloudflare';
```

- The deprecated `instrumentD1WithSentry` export was removed. `withSentry()` automatically instruments all D1 bindings via `env`.

```diff
  import * as Sentry from '@sentry/cloudflare';

  export default withSentry(
    (env) => ({ dsn: env.SENTRY_DSN }),
    {
      async fetch(request, env, ctx) {
-       const db = Sentry.instrumentD1WithSentry(env.DB);
-       const result = await db.prepare('SELECT * FROM users').all();
+       const result = await env.DB.prepare('SELECT * FROM users').all();
      },
    },
  );
```

> **TODO(v11):** This might change to `enableRpcTracePropagation: true` by default. This depends on the outcomes of #20525

- The `instrumentPrototypeMethods` option of `instrumentDurableObjectWithSentry` was removed. Use `enableRpcTracePropagation` instead, which was introduced as its replacement in v10.

```diff
  export const MyDO = Sentry.instrumentDurableObjectWithSentry(
    (env) => ({
      dsn: env.SENTRY_DSN,
-     instrumentPrototypeMethods: true,
+     enableRpcTracePropagation: true,
    }),
    MyDOBase,
  );
```

- The `honoIntegration` was removed. Use the dedicated [`@sentry/hono`](https://www.npmjs.com/package/@sentry/hono) package instead, which provides a middleware that handles error capturing automatically.

```diff
- import * as Sentry from '@sentry/cloudflare';
+ import { sentry } from '@sentry/hono/cloudflare';

  const app = new Hono();
+ app.use(sentry());
```

### `@sentry/opentelemetry`

- `SentryPropagator` was removed. It is no longer needed now that Sentry does not manage OpenTelemetry trace propagation by default.
- `OpenTelemetryServerRuntimeOptions` was removed.
- The `@opentelemetry/core` peer dependency was removed; its APIs are now vendored internally.
- OpenTelemetry resources are no longer collected, and `contexts.otel.resource` was dropped from events.

### `@sentry/core` span attributes

- The deprecated `semanticAttributes` re-export was removed. Import span attribute constants from `@sentry/core` directly.

### AI integrations

- The `enableTruncation` and `streamGenAiSpans` flags were removed. The new default is no truncation and to always stream gen AI spans.
- The internal `sentry.sdk_meta.gen_ai.input.messages.original_length` span attribute was removed.
- (Vercel AI) The internal JSON-stringify workaround for array span attributes was removed.
- AI integrations are no longer available in the browser SDK. They remain available in the server-side SDKs.

### `@sentry/react-router`

- The deprecated server wrappers `wrapServerLoader` and `wrapServerAction` were removed. Loaders and
  actions are instrumented automatically via the instrumentation API - export
  `instrumentations = [Sentry.createSentryServerInstrumentation()]` from your `entry.server.tsx`
  instead of wrapping them individually.

### `@sentry/profiling-node`

- The `prune-profiler-binaries` script was removed.

### `@sentry/nextjs`

The following long-deprecated options in `withSentryConfig` / the `sentry` config were removed:

- `unstable_sentryWebpackPluginOptions`
- `autoInstrumentServerFunctions`
- `autoInstrumentMiddleware`
- `autoInstrumentAppDirectory`
- `disableLogger`
- `automaticVercelMonitors`
- `disableManifestInjection`
- `disableSentryWebpackConfig`
- `turbopackApplicationKey`

Remove these options from your `next.config.js` / `next.config.ts`.

### Meta-framework build options

The deprecated `sourceMapsUploadOptions` and other deprecated Vite/build plugin options were removed from `@sentry/astro`, `@sentry/nuxt`, `@sentry/sveltekit`, and `@sentry/react-router`. Use the top-level equivalents (e.g. `sourcemaps`, `release`, `authToken`, `org`, `project`, `telemetry`) instead.

## 4. Package Removals

### `@sentry/types` is no longer published

Import all types from `@sentry/core` instead. `@sentry/types` has only re-exported from `@sentry/core`
since v8 and has been deprecated since then.

```js
// before
import type { Event } from '@sentry/types';

// after
import type { Event } from '@sentry/core';
```

### `@sentry/node-core` was merged back into `@sentry/node`

With the reduced OpenTelemetry footprint in v11, `@sentry/node-core` no longer serves a purpose and was removed. Import everything from `@sentry/node` instead.

```js
// before
import { init } from '@sentry/node-core';

// after
import { init } from '@sentry/node';
```

### `@sentry/tanstackstart` was removed

The utility `@sentry/tanstackstart` package was removed. Use the `@sentry/tanstackstart-react` package for your setup.

### Metrics moved out of the base CDN bundle

Affected SDKs: `@sentry/browser` (CDN bundles).

Metrics are no longer included in the base CDN bundle. Metrics are now shipped only in the dedicated `*.metrics` CDN bundles. If you use metrics via the CDN, switch to a `*.metrics` bundle.

## 5. Renames

### `InboundFilters` integration renamed to `EventFilters`

Affected SDKs: All SDKs.

The `InboundFilters` integration was renamed to `EventFilters`, and `inboundFiltersIntegration` to
`eventFiltersIntegration`. The old `inboundFiltersIntegration` export (deprecated in v10) was removed.

```js
// before
import { inboundFiltersIntegration } from '@sentry/browser';

// after
import { eventFiltersIntegration } from '@sentry/browser';
```

### `instrumentLangGraph` renamed to `instrumentStateGraph`

Affected SDKs: SDKs with LangGraph instrumentation.

`instrumentLangGraph` only instruments the `StateGraph` class, so it was renamed to
`instrumentStateGraph` to avoid confusion with the separate ReactAgent instrumentation.

```js
// before
import { instrumentLangGraph } from '@sentry/node';

// after
import { instrumentStateGraph } from '@sentry/node';
```

### `childProcess` integration split into `childProcess` and `worker`

Affected SDKs: `@sentry/node` and dependents.

The `childProcessIntegration` was split into a `childProcessIntegration` (for `child_process`) and a separate `workerIntegration` (for `worker_threads`).

> **TODO(v11):** Document how the two integrations are configured and what users who customized
> `childProcessIntegration` need to change.

### Deno default integrations renamed to match the other SDKs

Affected SDKs: `@sentry/deno`.

Several default integrations were renamed to match the names used by the other SDKs. The old `deno*Integration` exports are kept as deprecated aliases. If you relied on the old names (for example, to disable an integration), update them:

- `DenoAmqplib` => `Amqplib`
- `DenoKoa` => `Koa`
- `DenoMongodb` => `Mongodb`
- `DenoMongoose` => `Mongoose`
- `DenoMysql` => `Mysql`
- `DenoPostgres` => `Postgres`

## 6. Type Changes

- Several public types that used `any` now use `unknown` — including `StackFrame`, `SamplingContext`,
  `SentryError`, and `User`. You may need to narrow types explicitly where you previously relied on
  `any`.
- Attribute typing and serialization were unified across the SDK.
- The `SentrySpanArguments` interface and related dead code in `SentrySpan` were cleaned up.
- `BrowserOptions` now supports the `TransportOptions` generic.
- (Cloudflare) The `env` types and the generics on `withSentry` and `instrumentDurableObjectWithSentry` were reworked for better type safety. If you were not passing explicit generic type parameters, no changes are needed.

```diff
- export default withSentry<Env>(
+ export default withSentry(
    (env) => ({ dsn: env.SENTRY_DSN }),
    {
      async fetch(request, env, ctx) {
        // env is correctly typed based on the handler
      },
    } satisfies ExportedHandler<Env>,
  );
```

```diff
- export const MyDO = Sentry.instrumentDurableObjectWithSentry<Env, MyDOBase, typeof MyDOBase>(
+ export const MyDO = Sentry.instrumentDurableObjectWithSentry(
    (env) => ({ dsn: env.SENTRY_DSN }),
    MyDOBase,
  );
```

## No Version Support Timeline

Version support timelines are stressful for everybody using the SDK, so we won't be defining one.
Instead, we will be applying bug fixes and features to older versions as long as there is demand.

Additionally, we hold ourselves accountable to any security issues, meaning that if any vulnerabilities are found, we will in almost all cases backport them.

Note, that it is decided on a case-per-case basis, what gets backported or not.
If you need a fix or feature in a previous version of the SDK, please reach out via a GitHub Issue.
