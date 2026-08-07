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

A new optional OpenTelemetry integration lets you connect Sentry events such as Errors, Logs, Crons and Metrics to your OpenTelemetry traces, if you need to. See [Connecting Sentry to your OpenTelemetry traces](#connecting-sentry-to-your-opentelemetry-traces).

Only `@sentry/nextjs` and `@sentry/sveltekit` still set up an OpenTelemetry compatible light tracer provider to capture spans the underlying frameworks emit.

This means you can run your own OpenTelemetry setup cleanly alongside Sentry without having Sentry spans leak into your pipeline anymore. Your OpenTelemetry setup will no longer be required to use Sentry components for exporting, context management and trace propagation.

With this, we also heavily reduced our OpenTelemetry dependencies, with `@opentelemetry/api` being the only remaining package we abide by. These changes also mean `@sentry/node-core` no longer serves any purpose and was [merged back into `@sentry/node`](#sentrynode-core-was-merged-back-into-sentrynode).

For most users, day-to-day tracing is **unchanged**.

#### Choosing an OpenTelemetry setup

There are three ways to run the two together, and which one you want depends on who should own spans. This is controlled by the existing `skipOpenTelemetrySetup` option, whose default was flipped in v11: it is now `true` for most server SDKs (including `@sentry/node`, `@sentry/bun`, the serverless SDKs and `@sentry/cloudflare`) and `false` for `@sentry/nextjs` and `@sentry/sveltekit`.

##### 1. Sentry only

The default, and what most users want. Tracing works out of the box:

```js
Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
});
```

If a library you depend on emits its own OpenTelemetry spans and you want those in Sentry too, use setup 2.

##### 2. OpenTelemetry-compatible mode, everything goes to Sentry

Set `skipOpenTelemetrySetup: false`:

```js
Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
  skipOpenTelemetrySetup: false,
});
```

Sentry registers a minimal OpenTelemetry-compatible tracer provider, context manager and propagator. Just enough OpenTelemetry to pick up spans created through `@opentelemetry/api`, which become native Sentry spans.

Everything goes to Sentry and only to Sentry. This is not a general OpenTelemetry pipeline: there is no exporter, no OTLP output, and no way to fan spans out to another backend. Sentry also refuses to register its provider if you already registered one of your own, logging a warning instead. If you want a real OpenTelemetry pipeline, use setup 3.

##### 3. Your own OpenTelemetry, Sentry linked to it

Leave `skipOpenTelemetrySetup` unset or set it to `true`, turn Sentry tracing off, use your own OpenTelemetry setup, and add the Sentry `otlpIntegration()`:

```js
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import * as Sentry from '@sentry/node';

const provider = new NodeTracerProvider({
  spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter(Sentry.getOtlpTracesEndpoint('__DSN__')))],
});

provider.register();

Sentry.init({
  dsn: '__DSN__',
  // no tracesSampleRate: OpenTelemetry owns spans, Sentry owns errors and logs
  integrations: [Sentry.otlpIntegration()],
});
```

`skipOpenTelemetrySetup` already defaults to `true` on most server SDKs, so there is nothing to set. On `@sentry/nextjs` and `@sentry/sveltekit` it defaults to `false`, so you have to set it explicitly. Otherwise Sentry registers its own tracer provider and you end up in setup 2 rather than this one.

OpenTelemetry owns spans end to end. Sentry captures errors and logs, and `otlpIntegration()` attaches them to whatever OpenTelemetry span is active so they land on the same trace. `getOtlpTracesEndpoint()` turns your DSN into the URL and auth headers for Sentry's OTLP endpoint, so you can point your own exporter at Sentry, at your own collector, or at both.

Sentry does not touch your pipeline: no exporter, no span processor, no tracer provider, and outgoing trace propagation is left to your propagator. See [Connecting Sentry to your OpenTelemetry traces](#connecting-sentry-to-your-opentelemetry-traces) for the details, including what changed if you used the v10 integration.

##### Avoiding duplicate spans

Leaving `tracesSampleRate` unset is what keeps setup 3 clean. Sentry instruments many of the same libraries OpenTelemetry does (Express, Postgres, Redis, Prisma, Kafka and so on), so enabling Sentry tracing on top of your own instrumentation gives you two spans for every operation. With tracing off, Sentry's instrumentation stays installed and keeps doing request isolation, but emits no spans, so there is nothing to collide.

Note that this changed since v10, where setting `skipOpenTelemetrySetup: true` also turned Sentry's HTTP and fetch spans off by default. Sentry now emits those whenever tracing is enabled, regardless of `skipOpenTelemetrySetup`.

If you do want Sentry spans alongside your own, drop the integrations that overlap. HTTP and fetch are the exception: keep those two and turn off only their spans, because `httpIntegration` also provides request isolation, request data and session tracking.

```js
Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
  integrations: integrations => [
    // your own OpenTelemetry instrumentation already covers these
    ...integrations.filter(integration => integration.name !== 'Postgres'),
    Sentry.httpIntegration({ spans: false }),
    Sentry.nativeNodeFetchIntegration({ spans: false }),
  ],
});
```

##### The v10 bridge is gone

If you previously wired Sentry into your own OpenTelemetry setup with `SentryContextManager`, `SentrySampler` and `SentrySpanProcessor`, that path no longer exists. Those components were removed, so there is no longer a way to route spans from your own provider into Sentry as Sentry spans. Export them over OTLP instead, as shown in setup 3.

#### Connecting Sentry to your OpenTelemetry traces

`Sentry.otlpIntegration()` attaches everything Sentry sends that carries trace information (errors, logs, metrics and crons) to the OpenTelemetry span that is active when it happens. It takes no options, and is available from every server-side SDK, so there is nothing extra to install or import. See [setup 3](#3-your-own-opentelemetry-sentry-linked-to-it) above for a complete example.

It does not set up a span exporter, span processor, or tracer provider. You keep full ownership of your OpenTelemetry pipeline, and outgoing request propagation is left to your OpenTelemetry propagator. To send your spans to Sentry, point your own exporter at the URL and auth headers that `Sentry.getOtlpTracesEndpoint()` derives from your DSN.

An active Sentry span still takes precedence, so this only changes what happens when Sentry has no span of its own, which is the usual setup when OpenTelemetry owns tracing.

If you used the v10 integration from `@sentry/node-core/light/otlp`, three things changed: it moved to the main export of every server SDK, it [no longer sets up an exporter for you and lost its options](#3-removed-apis), and it [reports itself as `Otlp` rather than `OtlpIntegration`](#otlpintegration-integration-renamed-to-otlp). Configure your own exporter as shown in setup 3, pointing it at your collector's URL if you route through one.

> **TODO(v11):** Link to the upcoming guide covering common use cases with the new OpenTelemetry setup
> (running your own OpenTelemetry setup alongside Sentry, connecting Sentry events to OTel traces, etc.).

### `sendDefaultPii` is replaced by `dataCollection`

Affected SDKs: All SDKs.

> **Heads up — this is a behavior change, not just a renamed option.**
> In v10, leaving `sendDefaultPii` unset behaved like `sendDefaultPii: false` (restrictive).
> In v11, leaving `dataCollection` unset collects the categories below **by default**.
> Review this before upgrading if you'd rather not collect HTTP request data, database queries, or GenAI inputs/outputs.

We've replaced `sendDefaultPii` with `dataCollection`, which controls each category of collected data individually. The default is now more permissive than in v10.

| Category              | v10 default (`sendDefaultPii` off) | v11 default          |
| --------------------- | ---------------------------------- | -------------------- |
| `userInfo`            | `false`                            | `true`               |
| `cookies`             | not collected                      | `true`               |
| `httpHeaders`         | request + response, PII scrubbed   | request + response   |
| `httpBodies`          | not collected (size only)          | all request/response |
| `urlQueryParams`      | `true`                             | `true`               |
| `genAI`               | inputs + outputs not collected     | inputs + outputs     |
| `databaseQueryData`   | `false`                            | `true`               |
| `stackFrameVariables` | `true`                             | `true`               |
| `frameContextLines`   | `7`                                | `5`                  |

> Sentry's built-in sensitive-data filtering still applies. Review your data-scrubbing config for categories that may contain sensitive values — especially request/response bodies.

#### If you previously set `sendDefaultPii: true`

The v11 default matches this, so just remove the option:

```js
// v10
Sentry.init({ sendDefaultPii: true });

// v11 — same behavior is now the default
Sentry.init({});
```

#### If you want to keep the v10 default behavior

Set the baseline explicitly. **Don't leave `dataCollection` unset** — that now enables broader collection.

```js
// v11 — preserves the v10 default
Sentry.init({
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
    httpBodies: [],
    urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    graphQL: { document: false, variables: false },
  },
});
```

Each key-value field (`cookies`, `urlQueryParams`, `httpHeaders.request`, `httpHeaders.response`) accepts
`true`, `false`, `{ allow: string[] }`, or `{ deny: string[] }` for fine-grained control.

See the [`dataCollection` docs](https://docs.sentry.io/platforms/javascript/configuration/options/#dataCollection) for the full option list.

#### RequestData

The `requestDataIntegration`'s `include` options remain an integration-level override. An explicit `false`
prevents that category from being attached, while an explicit `true` enables it even when the corresponding
`dataCollection` category is disabled. For cookies, headers, and query parameters, any configured `allow` or
`deny` filtering continues to apply: When `include` enables a category which `dataCollection` disabled, the
default sensitive-value denylist is applied.

User IP address inference, which was previously gated on `sendDefaultPii`, is now controlled by
`dataCollection.userInfo`. An explicit `requestDataIntegration({ include: { ip: true } })` overrides
`dataCollection.userInfo: false` for data collected by that integration.

#### Remix action form data

`captureActionFormDataKeys` is an integration-level override, so it no longer requires
`dataCollection.httpBodies` to also include `'incomingRequest'`:

```js
// v10 — both were required
Sentry.init({
  captureActionFormDataKeys: { username: true },
  dataCollection: { httpBodies: ['incomingRequest'] },
});

// v11 — the option opts in on its own
Sentry.init({
  captureActionFormDataKeys: { username: true },
});
```

If `captureActionFormDataKeys` is not set, all form fields are captured when
`dataCollection.httpBodies` includes `'incomingRequest'` (the v11 default). Values whose field name
looks sensitive (`password`, `token`, …) are replaced with `[Filtered]`, including explicitly
allowlisted ones.

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

### Span streaming is now the default

Affected SDKs: All SDKs.

Spans are now sent to Sentry in small batches instead of being buffered until the root span completes.
This means spans are no longer bound by the 1000-span per transaction limit and their individual payload-size limits have been increased.

The new model comes with some changes to Sentry hooks such as `beforeSendSpan` or options like `ignoreSpans` and requires manual migration.
The `beforeSendTransaction` and `ignoreTransactions` options will **no-op**.
If you cannot migrate to span streaming yet, you can opt into the previous transaction-based static model.

#### `beforeSendSpan` receives the streamed span format

Your `beforeSendSpan` callback now receives a `StreamedSpanJSON` object and is invoked as each span finishes, rather than for all spans of a transaction right before that transaction is sent. As in v10, it is invoked for the root span as well as for child spans.

The payload fields were renamed:

| Before (`SpanJSON`) | After (`StreamedSpanJSON`)     |
| ------------------- | ------------------------------ |
| `description`       | `name`                         |
| `data`              | `attributes`                   |
| `op`                | `attributes['sentry.op']`      |
| `timestamp`         | `end_timestamp`                |
| `status` (`string`) | `status` (`'ok'` or `'error'`) |

The `status` field, now only contains two statuses: `'ok'` and `'error'`.
Streamed spans always have a status (while status was optional on transaction-based spans).
Previously more fine-grained error statuses are now mapped to `'error'`.
Additional error information may be set via span attributes (e.g. `sentry.status.message`).

```js
// Before
Sentry.init({
  beforeSendSpan: span => {
    if (span.op === 'db.query') {
      span.description = scrub(span.description);
      span.data['db.statement'] = scrub(span.data['db.statement']);
    }
    return span;
  },
});

// After
Sentry.init({
  beforeSendSpan: span => {
    if (span.attributes?.['sentry.op'] === 'db.query') {
      span.name = scrub(span.name);
      span.attributes['db.statement'] = scrub(span.attributes['db.statement']);
    }
    return span;
  },
});
```

Returning `null` to drop a span was already disallowed in v9 and remains a no-op. Use `ignoreSpans` to filter spans.

If you cannot migrate the callback yet, opt out of span streaming and wrap `beforeSendSpan` with `Sentry.withStaticSpan()`:

```js
Sentry.init({
  traceLifecycle: 'static',
  beforeSendSpan: Sentry.withStaticSpan(span => {
    span.description = scrub(span.description);
    return span;
  }),
});
```

A `beforeSendSpan` callback that does not match the configured `traceLifecycle` is **never invoked** — an unwrapped callback is ignored in `'static'` mode, and a `withStaticSpan`-wrapped callback is ignored in `'stream'` mode. Enable debug logging to surface a warning about the mismatch. Previously, an incompatible callback silently downgraded the SDK to the static lifecycle instead.

The `withStreamedSpan()` helper is now a no-op, since streamed payloads are the default. It is deprecated and will be removed in v12. You can remove the wrapper:

```js
// Before
beforeSendSpan: Sentry.withStreamedSpan(span => span);

// After
beforeSendSpan: span => span;
```

The internal `isStreamedBeforeSendSpanCallback()` function from `@sentry/core` was removed.

#### Replacing `beforeSendTransaction`

`beforeSendTransaction` no-ops because no transaction events are produced.
For **scrubbing and data modification**, move the logic to `beforeSendSpan` and guard on `is_segment` to target what used to be the transaction
For **dropping** a transaction or child spans, use `ignoreSpans` (see below). The `beforeSendSpan` callback cannot drop spans.

```js
// Before
Sentry.init({
  beforeSendTransaction: event => {
    if (event.transaction === 'GET /health') {
      return null;
    }
    event.transaction = scrubIds(event.transaction);
    return event;
  },
});

// After
Sentry.init({
  ignoreSpans: [
    'GET /health'
  ]
  beforeSendSpan: span => {
    if (span.is_segment) {
      span.name = scrubIds(span.name);
    }
    return span;
  },
});
```

Note that scope `tags` and `extra` are not carried over to streamed spans, since spans only have attributes. Use `Sentry.setAttribute()` / `Sentry.setAttributes()` instead.

#### Replacing `ignoreTransactions` with `ignoreSpans`

`ignoreTransactions` no-ops. Use `ignoreSpans` to match the segment span instead: when a segment span is ignored, all of its child spans are dropped with it, which is equivalent to dropping the whole transaction.

```js
// Before
Sentry.init({
  ignoreTransactions: ['GET /health'],
});

// After
Sentry.init({
  ignoreSpans: ['GET /health'],
});
```

`ignoreSpans` matches on the span `name` (formerly `description`). Because it applies to every span rather than just to root spans, consider narrowing the filter with the object form so that child spans sharing a name are not dropped as collateral:

```js
Sentry.init({
  ignoreSpans: [{ name: 'GET /health', attributes: { 'sentry.op': 'http.server' } }],
});
```

`ignoreSpans` itself is unchanged in shape, but it now takes effect when a span **starts** rather than when the transaction is sent. Matched spans are never recorded at all, which means a matched non-segment span's children are re-parented to its parent instead of being dropped.

#### Opting out of span streaming

To keep the previous transaction-based model, set `traceLifecycle: 'static'`:

```js
Sentry.init({
  traceLifecycle: 'static',

  // `beforeSendSpan` MUST be wrapped with Sentry.withStaticSpan:
  beforeSendSpan: Sentry.withStaticSpan(span => {
    span.description = scrub(span.description);
    return span;
  }),
});
```

In Node, Bun, Vercel Edge and Cloudflare you can also set the `SENTRY_TRACE_LIFECYCLE=static` environment variable instead. The static lifecycle only exists for backwards compatibility and is planned for removal in a future major version, so treat this as a temporary measure.

### Logs are enabled by default

Affected SDKs: All SDKs.

Logging follows an opt-in-by-usage model similar to metrics: you are opted in when you call `Sentry.logger.*` or explicitly enable a logging integration. The default value of `enableLogs` is now `true`, and logging integrations do not emit logs unless explicitly enabled.

To opt out of logging entirely, set `enableLogs` to `false`:

```js
Sentry.init({
  enableLogs: false,
});
```

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
- The `gen_ai.system` span attribute was renamed to `gen_ai.provider.name` across all AI integrations.
- The `gen_ai.request.available_tools` span attribute was renamed to `gen_ai.tool.definitions` across all AI integrations.
- The `gen_ai.tool.input` span attribute was renamed to `gen_ai.tool.call.arguments` across all AI integrations.
- The `gen_ai.tool.output` span attribute was renamed to `gen_ai.tool.call.result` across all AI integrations.
- The Vercel AI token attributes `gen_ai.usage.input_tokens.cached`, `gen_ai.usage.input_tokens.cache_write`, and `gen_ai.usage.output_tokens.reasoning` were renamed to `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.cache_creation.input_tokens`, and `gen_ai.usage.reasoning.output_tokens`.
- The deprecated `gen_ai.tool.type` span attribute is no longer set on tool spans.
- Span attributes now use the shared `@sentry/conventions` package under the hood.

If you reference these attributes in custom instrumentation, `beforeSendSpan`, dashboards, or alerts, update them to the new names.

### Span operation (`op`) changes

Affected SDKs: All SDKs.

Span ops are now aligned to a smaller, framework-neutral, convention-backed set. The detail that used to live in the op (framework, library, method name, trigger, or lifecycle phase) is preserved in span attributes such as `code.function.name`, `sentry.origin`, `db.system.name`, `db.operation.name`, `faas.trigger`, and framework-specific attributes.

These changes are not caught by TypeScript. If you filter, group, or alert on span ops — in dashboards, dynamic sampling rules, `ignoreSpans`, or `beforeSendSpan` — update them to the new ops below.

**Backend HTTP, handlers, middleware & routers:**

| Area                                                                 | Before                                                                                                                                                                                                                     | After         |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Request handlers (Express, Koa, Connect, Fastify, Elysia, NestJS, …) | `request_handler.<library>`, `handler.nestjs`                                                                                                                                                                              | `handler`     |
| Hono `app.request()` in-process dispatch                             | `hono.request`                                                                                                                                                                                                             | `http.server` |
| Web-server middleware                                                | `middleware.express`, `middleware.koa`, `middleware.hono`, `middleware.elysia`, `middleware.nestjs`, `middleware.nuxt`, `middleware.nitro`, `middleware.tanstackstart`, `hook.fastify`, `http.server.middleware` (Next.js) | `middleware`  |
| Backend router layers                                                | `router.express`, `router.koa`, `router.hapi`                                                                                                                                                                              | `router`      |
| Hapi server extensions                                               | `server.ext.hapi`                                                                                                                                                                                                          | `middleware`  |
| NestJS setup & lifecycle handlers                                    | `app_creation.nestjs`, `request_context.nestjs`, `event.nestjs`                                                                                                                                                            | `function`    |

**Framework functions:**

| Area                                                                                                      | Before                                                                                                                                                                                              | After      |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Loaders, actions & server functions (Next.js, Remix, React Router, SvelteKit, SolidStart, TanStack Start) | `function.nextjs`, `function.sveltekit.load`, `function.react_router.loader`, `function.remix.document_request`, `loader.remix`, `action.remix`, `function.server_action`, `function.tanstackstart` | `function` |

**Frontend & UI:**

| Area                                     | Before                                                                                                                               | After                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Frontend routing                         | `ui.angular.routing`, `ui.sveltekit.routing`, `ui.ember.transition`                                                                  | `router`                                                 |
| React, Vue & Svelte component lifecycles | `ui.react.mount`/`render`/`update`, `ui.svelte.init`/`update`, Vue `render`/`update`/`mount`/`create`/`activate`/`unmount`/`destroy` | `ui.mount`, `ui.render`, `ui.update`, `ui.unmount`       |
| Angular tracing decorators               | `ui.angular.init` (`TraceDirective`/`TraceClass`), `ui.angular.<method>` (`TraceMethod`)                                             | `ui.mount`, `function`                                   |
| Ember route hooks, runloop & components  | `ui.ember.route.<hook>`, `ui.ember.runloop.<queue>`, `ui.ember.component.render`/`definition`/`init`                                 | `function`, `ui.task`, `ui.render`/`function`/`ui.mount` |
| Browser paint entries                    | `paint`                                                                                                                              | `browser.paint`                                          |

**Databases, cache & messaging:**

| Area                                  | Before                                                                                                                                              | After                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Redis commands / connect              | `db.redis`, `db.redis.connect`                                                                                                                      | `db.query`, `db`                                  |
| Nuxt & Nitro storage (unstorage)      | `cache.has_item`, `cache.get_item`, `cache.get_items`, `cache.get_keys`, `cache.set_item`, `cache.set_items`, `cache.remove_item`, `cache.clear`, … | `cache.get`, `cache.put`, `cache.remove`          |
| Kafka, AMQP & OTel-inferred messaging | `message`, `message.produce`, `message.consume`                                                                                                     | `queue.publish`, `queue.receive`, `queue.process` |

**RPC & Gen AI:**

| Area                                                     | Before                                      | After                                |
| -------------------------------------------------------- | ------------------------------------------- | ------------------------------------ |
| tRPC                                                     | `rpc.server`                                | `rpc`                                |
| GCP gRPC calls                                           | `grpc.<service>`                            | `grpc`                               |
| AWS Bedrock inference                                    | `rpc`                                       | `gen_ai.chat`, `gen_ai.invoke_model` |
| Gen AI fallbacks & model metadata (Vercel AI, LangGraph) | `gen_ai.unknown`, `ai.run`, `gen_ai.models` | `function`                           |

**FaaS, serverless & HTTP clients:**

| Area                                           | Before                                                                | After                                      |
| ---------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| AWS Lambda functions                           | `function.aws.lambda`                                                 | `function.aws`                             |
| GCP functions                                  | `function.gcp.http`, `function.gcp.event`, `function.gcp.cloud_event` | `function.gcp`                             |
| Firebase functions                             | `http.request`                                                        | `function.gcp`                             |
| Cloudflare cron, email & workflow steps        | `faas.cron`, `faas.email`, `function.step.do`                         | `function`                                 |
| OTel-inferred FaaS spans (from `faas.trigger`) | arbitrary trigger strings used verbatim                               | `http.server`, `queue.process`, `function` |
| GCP HTTP client                                | `http.client.<service>`                                               | `http.client`                              |
| Prefetch HTTP requests                         | `http.client.prefetch`, `http.server.prefetch`                        | `http.client`, `http.server`               |

**Casing normalized to snake_case:** Some `browser.*` and `ui.*` ops used inconsistent casing and are now aligned to snake_case:

| Before                          | After                              |
| ------------------------------- | ---------------------------------- |
| `ui.long-task`                  | `ui.long_task`                     |
| `ui.long-animation-frame`       | `ui.long_animation_frame`          |
| `browser.unloadEvent`           | `browser.unload_event`             |
| `browser.domContentLoadedEvent` | `browser.dom_content_loaded_event` |
| `browser.loadEvent`             | `browser.load_event`               |
| `browser.TLS/SSL`               | `browser.tls_ssl`                  |
| `browser.DNS`                   | `browser.dns`                      |

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
- The `@sentry/node/init` and `@sentry/node/preload` entry points were removed. Create your own instrument file that calls `Sentry.init()` and preload it with `node --import ./instrument.mjs app.js` instead.
- The `preloadOpenTelemetry()` function was removed. All instrumentation is now channel-based via `orchestrion` and is set up when the instrumented module loads, so preloading is no longer needed.
- The `@sentry/node/loader` entry point was removed. Use `node --import @sentry/node/import` instead.
- (Astro) The `@sentry/astro/loader` entry point was removed. Use `node --import @sentry/astro/import` instead.
- (AWS Lambda) The `@sentry/aws-serverless/loader` entry point was removed. Use `node --import @sentry/aws-serverless/import` instead.
- (Google Cloud) The `@sentry/google-cloud-serverless/loader` entry point was removed. Use `node --import @sentry/google-cloud-serverless/import` instead.
- (Next.js) The `@sentry/nextjs/loader` entry point was removed. Use `node --import @sentry/nextjs/import` instead.
- (Remix) The `@sentry/remix/loader` entry point was removed. Use `node --import @sentry/remix/import` instead.
- (TanStack Start) The `@sentry/tanstackstart-react/loader` entry point was removed. Use `node --import @sentry/tanstackstart-react/import` instead.
- (Fastify) The deprecated `setShouldHandleError` method was removed.
- (AWS Lambda) The deprecated `disableAwsContextPropagation` option was removed. It no longer had any effect.
- (AWS Lambda) The deprecated `startTrace` option was removed. It no longer had any effect; to disable tracing, set `tracesSampleRate` to `0`.
- (AWS Lambda) The deprecated `tryPatchHandler` function was removed. It was no longer used.
- (Express) The deprecated `patchExpressModule(options)` signature was removed. Use `patchExpressModule(moduleExports, getOptions)` instead.
- The `@sentry/node-core/light/otlp` entry point was removed, along with its optional `@opentelemetry/exporter-trace-otlp-http` peer dependency. `otlpIntegration` is now exported directly from every server-side SDK, so `Sentry.otlpIntegration()` needs no extra import or install.
- The `otlpIntegration` options `setupOtlpTracesExporter` and `collectorUrl` were removed, and the integration no longer sets up a span exporter, span processor, or tracer provider. Configure your own exporter and point it at `Sentry.getOtlpTracesEndpoint(dsn)`, or at your collector's URL if you route through one. See [Connecting Sentry to your OpenTelemetry traces](#connecting-sentry-to-your-opentelemetry-traces).

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

- The `enableRpcTracePropagation` option now defaults to `true`. Trace context is propagated across RPC calls (service bindings, Durable Objects, WorkerEntrypoints) unless you explicitly set `enableRpcTracePropagation: false`.

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

- `getTraceContextForScope` was removed. Scope-to-trace-context resolution now goes through the shared core implementation.
- `OpenTelemetryServerRuntimeOptions` was removed.
- The `@opentelemetry/core` peer dependency was removed; its APIs are now vendored internally.
- `getSentryResource` was removed.
- OpenTelemetry resources are no longer collected, and `contexts.otel.resource` was dropped from events. As a result, the `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES` environment variables are no longer read by the SDK.

### `@sentry/core` span attributes

- The deprecated `semanticAttributes` re-export was removed. Import span attribute constants from `@sentry/core` directly.

### AI integrations

- The `enableTruncation` and `streamGenAiSpans` flags were removed. The new default is no truncation and to always stream gen AI spans.
- The internal `sentry.sdk_meta.gen_ai.input.messages.original_length` span attribute was removed.
- (Vercel AI) The internal JSON-stringify workaround for array span attributes was removed.
- AI integrations are no longer available in the browser SDK. They remain available in the server-side SDKs.
- The AI instrumentation code moved out of `@sentry/core` into `@sentry/server-utils`. If you imported any AI helper **directly from `@sentry/core`**, import it from `@sentry/server-utils` instead (or keep importing it from your platform SDK, e.g. `@sentry/node`, if it re-exported that helper before — platform SDK availability is unchanged from v10). Affected helpers: `instrumentOpenAiClient`, `instrumentAnthropicAiClient`, `instrumentGoogleGenAIClient`, `instrumentWorkersAiClient`, `createLangChainCallbackHandler`, `instrumentLangChainEmbeddings`, `instrumentStateGraph`, `instrumentStateGraphCompile`, `instrumentCreateReactAgent`, `addVercelAiProcessors`.
- The following low-level AI exports are no longer part of the public API (they were provider-instrumentation internals exported from `@sentry/core`):
  - Attribute/stream/util helpers: `extractOpenAiRequestAttributes`, `addOpenAiRequestAttributes`, `addOpenAiResponseAttributes`, `extractOpenAiRequestParameters`, `instrumentOpenAiStream`, `extractAnthropicRequestAttributes`, `addAnthropicRequestAttributes`, `addAnthropicResponseAttributes`, `instrumentAsyncIterableStream`, `instrumentMessageStream`, `extractGoogleGenAIRequestAttributes`, `addGoogleGenAIRequestAttributes`, `addGoogleGenAIResponseAttributes`, `instrumentGoogleGenAIStream`, `getProviderMetadataAttributes`, `getTruncatedJsonString`, `shouldEnableTruncation`, `resolveAIRecordingOptions`, `wrapToolsWithSpans`, `extractLLMFromParams`, `extractAgentNameFromParams`, `instrumentCompiledGraphInvoke`.
  - Integration-name constants: `OPENAI_INTEGRATION_NAME`, `ANTHROPIC_AI_INTEGRATION_NAME`, `GOOGLE_GENAI_INTEGRATION_NAME`, `LANGCHAIN_INTEGRATION_NAME`, `LANGGRAPH_INTEGRATION_NAME`.
  - Types: `OpenAiClient`, `OpenAiOptions`, `InstrumentedMethod`, `AnthropicAiClient`, `AnthropicAiOptions`, `AnthropicAiResponse`, `AnthropicAiInstrumentedMethod`, `GoogleGenAIClient`, `GoogleGenAIChat`, `GoogleGenAIOptions`, `GoogleGenAIResponse`, `GoogleGenAIInstrumentedMethod`, `GoogleGenAIIstrumentedMethod`, `WorkersAiClient`, `WorkersAiOptions`, `LangChainOptions`, `LangChainIntegration`, `LangGraphOptions`, `LangGraphIntegration`, `CompiledGraph`.

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

### `@sentry/nuxt`

The deprecated `sourceMapsUploadOptions` module option was removed. Move its fields to the root level of the `sentry` module options. Note that `url` was renamed to `sentryUrl`, and `enabled` was replaced by `sourcemaps.disable` (inverted: `enabled: false` becomes `sourcemaps: { disable: true }`).

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@sentry/nuxt/module'],
  sentry: {
    // before
    sourceMapsUploadOptions: {
      org: 'my-org',
      project: 'my-project',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      url: 'https://my-sentry.example.com',
      sourcemaps: {
        assets: ['./dist/**/*'],
      },
    },

    // after
    org: 'my-org',
    project: 'my-project',
    authToken: process.env.SENTRY_AUTH_TOKEN,
    sentryUrl: 'https://my-sentry.example.com',
    sourcemaps: {
      assets: ['./dist/**/*'],
    },
  },
});
```

### `@sentry/sveltekit`

The deprecated `sourceMapsUploadOptions` option was removed from `sentrySvelteKit()`. Move its fields to the root level of the `sentrySvelteKit()` options. Note that `url` was renamed to `sentryUrl`.

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    sentrySvelteKit({
      // before
      sourceMapsUploadOptions: {
        org: 'my-org',
        project: 'my-project',
        authToken: process.env.SENTRY_AUTH_TOKEN,
        url: 'https://my-sentry.example.com',
        sourcemaps: {
          assets: ['./build/**/*'],
        },
      },

      // after
      org: 'my-org',
      project: 'my-project',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sentryUrl: 'https://my-sentry.example.com',
      sourcemaps: {
        assets: ['./build/**/*'],
      },
    }),
    sveltekit(),
  ],
});
```

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

All SDKs now also set up `eventFiltersIntegration` instead of `inboundFiltersIntegration` as a default
integration, so the integration reports itself as `EventFilters` (e.g. in the `sdk.integrations` payload of
events). If you disable the integration by its previous name, update the reference:

```js
// before
Sentry.init({
  integrations: integrations => integrations.filter(integration => integration.name !== 'InboundFilters'),
});

// after
Sentry.init({
  integrations: integrations => integrations.filter(integration => integration.name !== 'EventFilters'),
});
```

The same applies when looking the integration up by name, e.g. via `client.getIntegrationByName('InboundFilters')`.

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

### `OtlpIntegration` integration renamed to `Otlp`

Affected SDKs: Server-side SDKs (`@sentry/node` and all dependents).

The OTLP integration reports itself as `Otlp` rather than `OtlpIntegration`, matching every other integration in the SDKs, none of which carry an `Integration` suffix in their name. The `otlpIntegration()` export itself is unchanged. This only matters if you reference the integration by name:

```js
// before
Sentry.init({
  integrations: integrations => integrations.filter(integration => integration.name !== 'OtlpIntegration'),
});

// after
Sentry.init({
  integrations: integrations => integrations.filter(integration => integration.name !== 'Otlp'),
});
```

The same applies when looking the integration up by name, e.g. via `client.getIntegrationByName('OtlpIntegration')`.

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
