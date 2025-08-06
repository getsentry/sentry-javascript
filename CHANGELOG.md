# Changelog

## Unreleased

- "You miss 100 percent of the chances you don't take. — Wayne Gretzky" — Michael Scott

## 10.2.0

### Important Changes

- **feat(core): Add `ignoreSpans` option ([#17078](https://github.com/getsentry/sentry-javascript/pull/17078))**

This release adds a new top-level `Sentry.init` option, `ignoreSpans`, that can be used as follows:

```js
Sentry.init({
  ignoreSpans: [
    'partial match', // string matching on the span name
    /regex/, // regex matching on the span name
    {
      name: 'span name',
      op: /http.client/,
    },
  ],
});
```

Spans matching the filter criteria will not be recorded. Potential child spans of filtered spans will be re-parented, if possible.

- **feat(cloudflare,vercel-edge): Add support for OpenAI instrumentation ([#17338](https://github.com/getsentry/sentry-javascript/pull/17338))**

Adds support for OpenAI manual instrumentation in `@sentry/cloudflare` and `@sentry/vercel-edge`.

To instrument the OpenAI client, wrap it with `Sentry.instrumentOpenAiClient` and set recording settings.

```js
import * as Sentry from '@sentry/cloudflare';
import OpenAI from 'openai';

const openai = new OpenAI();
const client = Sentry.instrumentOpenAiClient(openai, { recordInputs: true, recordOutputs: true });

// use the wrapped client
```

- **ref(aws): Remove manual span creation ([#17310](https://github.com/getsentry/sentry-javascript/pull/17310))**

The `startTrace` option is deprecated and will be removed in a future major version. If you want to disable tracing, set `SENTRY_TRACES_SAMPLE_RATE` to `0.0`. instead. As of today, the flag does not affect traces anymore.

### Other Changes

- feat(astro): Streamline build logs ([#17301](https://github.com/getsentry/sentry-javascript/pull/17301))
- feat(browser): Handles data URIs in chrome stack frames ([#17292](https://github.com/getsentry/sentry-javascript/pull/17292))
- feat(core): Accumulate tokens for `gen_ai.invoke_agent` spans from child LLM calls ([#17281](https://github.com/getsentry/sentry-javascript/pull/17281))
- feat(deps): Bump @prisma/instrumentation from 6.12.0 to 6.13.0 ([#17315](https://github.com/getsentry/sentry-javascript/pull/17315))
- feat(deps): Bump @sentry/cli from 2.50.0 to 2.50.2 ([#17316](https://github.com/getsentry/sentry-javascript/pull/17316))
- feat(deps): Bump @sentry/rollup-plugin from 4.0.0 to 4.0.2 ([#17317](https://github.com/getsentry/sentry-javascript/pull/17317))
- feat(deps): Bump @sentry/webpack-plugin from 4.0.0 to 4.0.2 ([#17314](https://github.com/getsentry/sentry-javascript/pull/17314))
- feat(nuxt): Do not inject trace meta-tags on cached HTML pages ([#17305](https://github.com/getsentry/sentry-javascript/pull/17305))
- feat(nuxt): Streamline build logs ([#17308](https://github.com/getsentry/sentry-javascript/pull/17308))
- feat(react-router): Add support for Hydrogen with RR7 ([#17145](https://github.com/getsentry/sentry-javascript/pull/17145))
- feat(react-router): Streamline build logs ([#17303](https://github.com/getsentry/sentry-javascript/pull/17303))
- feat(solidstart): Streamline build logs ([#17304](https://github.com/getsentry/sentry-javascript/pull/17304))
- fix(nestjs): Add missing `sentry.origin` span attribute to `SentryTraced` decorator ([#17318](https://github.com/getsentry/sentry-javascript/pull/17318))
- fix(node): Assign default export of `openai` to the instrumented fn ([#17320](https://github.com/getsentry/sentry-javascript/pull/17320))
- fix(replay): Call `sendBufferedReplayOrFlush` when opening/sending feedback ([#17236](https://github.com/getsentry/sentry-javascript/pull/17236))

## 10.1.0

- feat(nuxt): Align build-time options to follow bundler plugins structure ([#17255](https://github.com/getsentry/sentry-javascript/pull/17255))
- fix(browser-utils): Ensure web vital client hooks unsubscribe correctly ([#17272](https://github.com/getsentry/sentry-javascript/pull/17272))
- fix(browser): Ensure request from `diagnoseSdkConnectivity` doesn't create span ([#17280](https://github.com/getsentry/sentry-javascript/pull/17280))

## 10.0.0

Version `10.0.0` marks a release of the Sentry JavaScript SDKs that contains breaking changes. The goal of this release is to primarily upgrade the underlying OpenTelemetry dependencies to v2 with minimal breaking changes.

### How To Upgrade

Please carefully read through the migration guide in the Sentry docs on how to upgrade from version 9 to version 10. Make sure to select your specific platform/framework in the top left corner: https://docs.sentry.io/platforms/javascript/migration/v9-to-v10/

A comprehensive migration guide outlining all changes can be found within the Sentry JavaScript SDK Repository: https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md

### Breaking Changes

- feat!: Bump to OpenTelemetry v2 ([#16872](https://github.com/getsentry/sentry-javascript/pull/16872))
- feat(browser)!: Remove FID web vital collection ([#17076](https://github.com/getsentry/sentry-javascript/pull/17076))
- feat(core)!: Remove `BaseClient` ([#17071](https://github.com/getsentry/sentry-javascript/pull/17071))
- feat(core)!: Remove `enableLogs` and `beforeSendLog` experimental options ([#17063](https://github.com/getsentry/sentry-javascript/pull/17063))
- feat(core)!: Remove `hasTracingEnabled` ([#17072](https://github.com/getsentry/sentry-javascript/pull/17072))
- feat(core)!: Remove deprecated logger ([#17061](https://github.com/getsentry/sentry-javascript/pull/17061))
- feat(replay)!: Promote `_experiments.autoFlushOnFeedback` option as default ([#17220](https://github.com/getsentry/sentry-javascript/pull/17220))
- chore(deps)!: Bump bundler plugins to v4 ([#17089](https://github.com/getsentry/sentry-javascript/pull/17089))

### Other Changes

- feat(astro): Implement Request Route Parametrization for Astro 5 ([#17105](https://github.com/getsentry/sentry-javascript/pull/17105))
- feat(astro): Parametrize routes on client-side ([#17133](https://github.com/getsentry/sentry-javascript/pull/17133))
- feat(aws): Add `SentryNodeServerlessSDKv10` v10 AWS Lambda Layer ([#17069](https://github.com/getsentry/sentry-javascript/pull/17069))
- feat(aws): Create unified lambda layer for ESM and CJS ([#17012](https://github.com/getsentry/sentry-javascript/pull/17012))
- feat(aws): Detect SDK source for AWS Lambda layer ([#17128](https://github.com/getsentry/sentry-javascript/pull/17128))
- feat(core): Add missing openai tool calls attributes ([#17226](https://github.com/getsentry/sentry-javascript/pull/17226))
- feat(core): Add shared `flushIfServerless` function ([#17177](https://github.com/getsentry/sentry-javascript/pull/17177))
- feat(core): Implement `strictTraceContinuation` ([#16313](https://github.com/getsentry/sentry-javascript/pull/16313))
- feat(core): MCP server instrumentation without breaking Miniflare ([#16817](https://github.com/getsentry/sentry-javascript/pull/16817))
- feat(deps): bump @prisma/instrumentation from 6.11.1 to 6.12.0 ([#17117](https://github.com/getsentry/sentry-javascript/pull/17117))
- feat(meta): Unify detection of serverless environments and add Cloud Run ([#17168](https://github.com/getsentry/sentry-javascript/pull/17168))
- feat(nestjs): Switch to OTel core instrumentation ([#17068](https://github.com/getsentry/sentry-javascript/pull/17068))
- feat(node-native): Upgrade `@sentry-internal/node-native-stacktrace` to `0.2.2` ([#17207](https://github.com/getsentry/sentry-javascript/pull/17207))
- feat(node): Add `shouldHandleError` option to `fastifyIntegration` ([#16845](https://github.com/getsentry/sentry-javascript/pull/16845))
- feat(node): Add firebase integration ([#16719](https://github.com/getsentry/sentry-javascript/pull/16719))
- feat(node): Instrument stream responses for openai ([#17110](https://github.com/getsentry/sentry-javascript/pull/17110))
- feat(react-router): Add `createSentryHandleError` ([#17235](https://github.com/getsentry/sentry-javascript/pull/17235))
- feat(react-router): Automatically flush on serverless for loaders/actions ([#17234](https://github.com/getsentry/sentry-javascript/pull/17234))
- feat(react-router): Automatically flush on Vercel for request handlers ([#17232](https://github.com/getsentry/sentry-javascript/pull/17232))
- fix(astro): Construct parametrized route during runtime ([#17190](https://github.com/getsentry/sentry-javascript/pull/17190))
- fix(aws): Add layer build output to nx cache ([#17148](https://github.com/getsentry/sentry-javascript/pull/17148))
- fix(aws): Fix path to packages directory ([#17112](https://github.com/getsentry/sentry-javascript/pull/17112))
- fix(aws): Resolve all Sentry packages to local versions in layer build ([#17106](https://github.com/getsentry/sentry-javascript/pull/17106))
- fix(aws): Use file link in dependency version ([#17111](https://github.com/getsentry/sentry-javascript/pull/17111))
- fix(cloudflare): Allow non uuid workflow instance IDs ([#17121](https://github.com/getsentry/sentry-javascript/pull/17121))
- fix(cloudflare): Avoid turning DurableObject sync methods into async ([#17184](https://github.com/getsentry/sentry-javascript/pull/17184))
- fix(core): Fix OpenAI SDK private field access by binding non-instrumented fns ([#17163](https://github.com/getsentry/sentry-javascript/pull/17163))
- fix(core): Fix operation name for openai responses API ([#17206](https://github.com/getsentry/sentry-javascript/pull/17206))
- fix(core): Update ai.response.object to gen_ai.response.object ([#17153](https://github.com/getsentry/sentry-javascript/pull/17153))
- fix(nextjs): Flush in route handlers ([#17223](https://github.com/getsentry/sentry-javascript/pull/17223))
- fix(nextjs): Handle async params in url extraction ([#17162](https://github.com/getsentry/sentry-javascript/pull/17162))
- fix(nextjs): Update stackframe calls for next v15.5 ([#17156](https://github.com/getsentry/sentry-javascript/pull/17156))
- fix(node): Add mechanism to `fastifyIntegration` error handler ([#17208](https://github.com/getsentry/sentry-javascript/pull/17208))
- fix(node): Ensure tool errors for `vercelAiIntegration` have correct trace connected ([#17132](https://github.com/getsentry/sentry-javascript/pull/17132))
- fix(node): Fix exports for openai instrumentation ([#17238](https://github.com/getsentry/sentry-javascript/pull/17238))
- fix(node): Handle stack traces with data URI filenames ([#17218](https://github.com/getsentry/sentry-javascript/pull/17218))
- fix(react): Memoize wrapped component to prevent rerenders ([#17230](https://github.com/getsentry/sentry-javascript/pull/17230))
- fix(remix): Ensure source maps upload fails silently if Sentry CLI fails ([#17082](https://github.com/getsentry/sentry-javascript/pull/17082))
- fix(replay): Fix re-sampled sessions after a click ([#17008](https://github.com/getsentry/sentry-javascript/pull/17008))
- fix(svelte): Do not insert preprocess code in script module in Svelte 5 ([#17114](https://github.com/getsentry/sentry-javascript/pull/17114))
- fix(sveltekit): Align error status filtering and mechanism in `handleErrorWithSentry` ([#17157](https://github.com/getsentry/sentry-javascript/pull/17157))

Work in this release was contributed by @richardjelinek-fastest. Thank you for your contribution!

## 9.44.2

This release is publishing the AWS Lambda Layer under `SentryNodeServerlessSDKv9`. The previous release `9.44.1` accidentally published the layer under `SentryNodeServerlessSDKv10`.

## 9.44.1

- fix(replay/v9): Call sendBufferedReplayOrFlush when opening/sending feedback ([#17270](https://github.com/getsentry/sentry-javascript/pull/17270))

## 9.44.0

- feat(replay/v9): Deprecate `_experiments.autoFlushOnFeedback` ([#17219](https://github.com/getsentry/sentry-javascript/pull/17219))
- feat(v9/core): Add shared `flushIfServerless` function ([#17239](https://github.com/getsentry/sentry-javascript/pull/17239))
- feat(v9/node-native): Upgrade `@sentry-internal/node-native-stacktrace` to `0.2.2` ([#17256](https://github.com/getsentry/sentry-javascript/pull/17256))
- feat(v9/react-router): Add `createSentryHandleError` ([#17244](https://github.com/getsentry/sentry-javascript/pull/17244))
- feat(v9/react-router): Automatically flush on serverless for loaders/actions ([#17243](https://github.com/getsentry/sentry-javascript/pull/17243))
- feat(v9/react-router): Automatically flush on serverless for request handler ([#17242](https://github.com/getsentry/sentry-javascript/pull/17242))
- fix(v9/astro): Construct parametrized route during runtime ([#17227](https://github.com/getsentry/sentry-javascript/pull/17227))
- fix(v9/nextjs): Flush in route handlers ([#17245](https://github.com/getsentry/sentry-javascript/pull/17245))
- fix(v9/node): Fix exports for openai instrumentation ([#17238](https://github.com/getsentry/sentry-javascript/pull/17238)) (#17241)

## 9.43.0

- feat(v9/core): add MCP server instrumentation ([#17196](https://github.com/getsentry/sentry-javascript/pull/17196))
- feat(v9/meta): Unify detection of serverless environments and add Cloud Run ([#17204](https://github.com/getsentry/sentry-javascript/pull/17204))
- fix(v9/node): Add mechanism to `fastifyIntegration` error handler ([#17211](https://github.com/getsentry/sentry-javascript/pull/17211))
- fix(v9/replay): Fix re-sampled sessions after a click ([#17195](https://github.com/getsentry/sentry-javascript/pull/17195))

## 9.42.1

- fix(v9/astro): Revert Astro v5 storing route data to `globalThis` ([#17185](https://github.com/getsentry/sentry-javascript/pull/17185))
- fix(v9/cloudflare): Avoid turning DurableObject sync methods into async ([#17187](https://github.com/getsentry/sentry-javascript/pull/17187))
- fix(v9/nextjs): Handle async params in url extraction ([#17176](https://github.com/getsentry/sentry-javascript/pull/17176))
- fix(v9/sveltekit): Align error status filtering and mechanism in `handleErrorWithSentry` ([#17174](https://github.com/getsentry/sentry-javascript/pull/17174))

## 9.42.0

- feat(v9/aws): Detect SDK source for AWS Lambda layer ([#17150](https://github.com/getsentry/sentry-javascript/pull/17150))
- fix(v9/core): Fix OpenAI SDK private field access by binding non-instrumented fns ([#17167](https://github.com/getsentry/sentry-javascript/pull/17167))
- fix(v9/core): Update ai.response.object to gen_ai.response.object ([#17155](https://github.com/getsentry/sentry-javascript/pull/17155))
- fix(v9/nextjs): Update stackframe calls for next v15.5 ([#17161](https://github.com/getsentry/sentry-javascript/pull/17161))

## 9.41.0

### Important Changes

- **feat(v9/core): Deprecate experimental `enableLogs` and `beforeSendLog` option ([#17092](https://github.com/getsentry/sentry-javascript/pull/17092))**

Sentry now has support for [structured logging](https://docs.sentry.io/product/explore/logs/getting-started/). Previously to enable structured logging, you had to use the `_experiments.enableLogs` and `_experiments.beforeSendLog` options. These options have been deprecated in favor of the top-level `enableLogs` and `beforeSendLog` options.

```js
// before
Sentry.init({
  _experiments: {
    enableLogs: true,
    beforeSendLog: log => {
      return log;
    },
  },
});

// after
Sentry.init({
  enableLogs: true,
  beforeSendLog: log => {
    return log;
  },
});
```

- **feat(astro): Implement parameterized routes**
  - feat(v9/astro): Parametrize dynamic server routes ([#17141](https://github.com/getsentry/sentry-javascript/pull/17141))
  - feat(v9/astro): Parametrize routes on client-side ([#17143](https://github.com/getsentry/sentry-javascript/pull/17143))

Server-side and client-side parameterized routes are now supported in the Astro SDK. No configuration changes are required.

### Other Changes

- feat(v9/node): Add shouldHandleError option to fastifyIntegration ([#17123](https://github.com/getsentry/sentry-javascript/pull/17123))
- fix(v9/cloudflare) Allow non UUID workflow instance IDs ([#17135](https://github.com/getsentry/sentry-javascript/pull/17135))
- fix(v9/node): Ensure tool errors for `vercelAiIntegration` have correct trace ([#17142](https://github.com/getsentry/sentry-javascript/pull/17142))
- fix(v9/remix): Ensure source maps upload fails silently if Sentry CLI fails ([#17095](https://github.com/getsentry/sentry-javascript/pull/17095))
- fix(v9/svelte): Do not insert preprocess code in script module in Svelte 5 ([#17124](https://github.com/getsentry/sentry-javascript/pull/17124))

Work in this release was contributed by @richardjelinek-fastest. Thank you for your contribution!

## 9.40.0

### Important Changes

- **feat(browser): Add debugId sync APIs between web worker and main thread ([#16981](https://github.com/getsentry/sentry-javascript/pull/16981))**

This release adds two Browser SDK APIs to let the main thread know about debugIds of worker files:

- `webWorkerIntegration({worker})` to be used in the main thread
- `registerWebWorker({self})` to be used in the web worker

```js
// main.js
Sentry.init({...})

const worker = new MyWorker(...);

Sentry.addIntegration(Sentry.webWorkerIntegration({ worker }));

worker.addEventListener('message', e => {...});
```

```js
// worker.js
Sentry.registerWebWorker({ self });

self.postMessage(...);
```

- **feat(core): Deprecate logger in favor of debug ([#17040](https://github.com/getsentry/sentry-javascript/pull/17040))**

The internal SDK `logger` export from `@sentry/core` has been deprecated in favor of the `debug` export. `debug` only exposes `log`, `warn`, and `error` methods but is otherwise identical to `logger`. Note that this deprecation does not affect the `logger` export from other packages (like `@sentry/browser` or `@sentry/node`) which is used for Sentry Logging.

```js
import { logger, debug } from '@sentry/core';

// before
logger.info('This is an info message');

// after
debug.log('This is an info message');
```

- **feat(node): Add OpenAI integration ([#17022](https://github.com/getsentry/sentry-javascript/pull/17022))**

This release adds official support for instrumenting OpenAI SDK calls in with Sentry tracing, following OpenTelemetry semantic conventions for Generative AI. It instruments:

- `client.chat.completions.create()` - For chat-based completions
- `client.responses.create()` - For the responses API

```js
// The integration respects your `sendDefaultPii` option, but you can override the behavior in the integration options

Sentry.init({
  dsn: '__DSN__',
  integrations: [
    Sentry.openAIIntegration({
      recordInputs: true, // Force recording prompts
      recordOutputs: true, // Force recording responses
    }),
  ],
});
```

### Other Changes

- feat(node-core): Expand `@opentelemetry/instrumentation` range to cover `0.203.0` ([#17043](https://github.com/getsentry/sentry-javascript/pull/17043))
- fix(cloudflare): Ensure errors get captured from durable objects ([#16838](https://github.com/getsentry/sentry-javascript/pull/16838))
- fix(sveltekit): Ensure server errors from streamed responses are sent ([#17044](https://github.com/getsentry/sentry-javascript/pull/17044))

Work in this release was contributed by @0xbad0c0d3 and @tommy-gilligan. Thank you for your contributions!

## 9.39.0

### Important Changes

- **feat(browser): Add `afterStartPageloadSpan` hook to improve spanId assignment on web vital spans ([#16893](https://github.com/getsentry/sentry-javascript/pull/16893))**

This PR adds a new afterStartPageloadSpan lifecycle hook to more robustly assign the correct pageload span ID to web vital spans, replacing the previous unreliable "wait for a tick" approach with a direct callback that fires when the pageload span becomes available.

- **feat(nextjs): Client-side parameterized routes ([#16934](https://github.com/getsentry/sentry-javascript/pull/16934))**

This PR implements client-side parameterized routes for Next.js by leveraging an injected manifest within the existing app-router instrumentation to automatically parameterize all client-side transactions (e.g. `users/123` and `users/456` now become become `users/:id`).

- **feat(node): Drop 401-404 and 3xx status code spans by default ([#16972](https://github.com/getsentry/sentry-javascript/pull/16972))**

This PR changes the default behavior in the Node SDK to drop HTTP spans with 401-404 and 3xx status codes by default to reduce noise in tracing data.

### Other Changes

- feat(core): Prepend vercel ai attributes with `vercel.ai.X` ([#16908](https://github.com/getsentry/sentry-javascript/pull/16908))
- feat(nextjs): Add `disableSentryWebpackConfig` flag ([#17013](https://github.com/getsentry/sentry-javascript/pull/17013))
- feat(nextjs): Build app manifest ([#16851](https://github.com/getsentry/sentry-javascript/pull/16851))
- feat(nextjs): Inject manifest into client for turbopack builds ([#16902](https://github.com/getsentry/sentry-javascript/pull/16902))
- feat(nextjs): Inject manifest into client for webpack builds ([#16857](https://github.com/getsentry/sentry-javascript/pull/16857))
- feat(node-native): Add option to disable event loop blocked detection ([#16919](https://github.com/getsentry/sentry-javascript/pull/16919))
- feat(react-router): Ensure http.server route handling is consistent ([#16986](https://github.com/getsentry/sentry-javascript/pull/16986))
- fix(core): Avoid prolonging idle span when starting standalone span ([#16928](https://github.com/getsentry/sentry-javascript/pull/16928))
- fix(core): Remove side-effect from `tracing/errors.ts` ([#16888](https://github.com/getsentry/sentry-javascript/pull/16888))
- fix(core): Wrap `beforeSendLog` in `consoleSandbox` ([#16968](https://github.com/getsentry/sentry-javascript/pull/16968))
- fix(node-core): Apply correct SDK metadata ([#17014](https://github.com/getsentry/sentry-javascript/pull/17014))
- fix(react-router): Ensure that all browser spans have `source=route` ([#16984](https://github.com/getsentry/sentry-javascript/pull/16984))

Work in this release was contributed by @janpapenbrock. Thank you for your contribution!

## 9.38.0

### Important Changes

- **chore: Add craft entry for @sentry/node-native ([#16907](https://github.com/getsentry/sentry-javascript/pull/16907))**

This release publishes the `@sentry/node-native` SDK.

### Other Changes

- feat(core): Introduce `debug` to replace `logger` ([#16906](https://github.com/getsentry/sentry-javascript/pull/16906))
- fix(browser): Guard `nextHopProtocol` when adding resource spans ([#16900](https://github.com/getsentry/sentry-javascript/pull/16900))

## 9.37.0

### Important Changes

- **feat(nuxt): Parametrize SSR routes ([#16843](https://github.com/getsentry/sentry-javascript/pull/16843))**

  When requesting dynamic or catch-all routes in Nuxt, those will now be shown as parameterized routes in Sentry.
  For example, `/users/123` will be shown as `/users/:userId()` in Sentry. This will make it easier to identify patterns and make grouping easier.

### Other Changes

- feat(astro): Deprecate passing runtime config to astro integration ([#16839](https://github.com/getsentry/sentry-javascript/pull/16839))
- feat(browser): Add `beforeStartNavigationSpan` lifecycle hook ([#16863](https://github.com/getsentry/sentry-javascript/pull/16863))
- feat(browser): Detect redirects when emitting navigation spans ([#16324](https://github.com/getsentry/sentry-javascript/pull/16324))
- feat(cloudflare): Add option to opt out of capturing errors in `wrapRequestHandler` ([#16852](https://github.com/getsentry/sentry-javascript/pull/16852))
- feat(feedback): Return the eventId into the onSubmitSuccess callback ([#16835](https://github.com/getsentry/sentry-javascript/pull/16835))
- feat(vercel-edge): Do not vendor in all OpenTelemetry dependencies ([#16841](https://github.com/getsentry/sentry-javascript/pull/16841))
- fix(browser): Ensure standalone CLS and LCP spans have traceId of pageload span ([#16864](https://github.com/getsentry/sentry-javascript/pull/16864))
- fix(nextjs): Use value injection loader on `instrumentation-client.ts|js` ([#16855](https://github.com/getsentry/sentry-javascript/pull/16855))
- fix(sveltekit): Avoid capturing `redirect()` calls as errors in Cloudflare ([#16853](https://github.com/getsentry/sentry-javascript/pull/16853))
- docs(nextjs): Update `deleteSourcemapsAfterUpload` jsdoc default value ([#16867](https://github.com/getsentry/sentry-javascript/pull/16867))

Work in this release was contributed by @zachkirsch. Thank you for your contribution!

## 9.36.0

### Important Changes

- **feat(node-core): Add node-core SDK ([#16745](https://github.com/getsentry/sentry-javascript/pull/16745))**

This release adds a new SDK `@sentry/node-core` which ships without any OpenTelemetry instrumententation out of the box. All OpenTelemetry dependencies are peer dependencies and OpenTelemetry has to be set up manually.

Use `@sentry/node-core` when:

- You already have OpenTelemetry set up
- You need custom OpenTelemetry configuration
- You want minimal dependencies
- You need fine-grained control over instrumentation

Use `@sentry/node` when:

- You want an automatic setup
- You're new to OpenTelemetry
- You want sensible defaults
- You prefer convenience over control

* **feat(node): Deprecate ANR integration ([#16832](https://github.com/getsentry/sentry-javascript/pull/16832))**

The ANR integration has been deprecated and will be removed in future versions. Use `eventLoopBlockIntegration` from `@sentry/node-native` instead.

- **feat(replay): Add `_experiments.ignoreMutations` option ([#16816](https://github.com/getsentry/sentry-javascript/pull/16816))**

This replay option allows to configure a selector list of elements to not capture mutations for.

```js
Sentry.replayIntegration({
  _experiments: {
    ignoreMutations: ['.dragging'],
  },
});
```

### Other changes

- feat(deps): bump @prisma/instrumentation from 6.10.1 to 6.11.1 ([#16833](https://github.com/getsentry/sentry-javascript/pull/16833))
- feat(nextjs): Add flag for suppressing router transition warning ([#16823](https://github.com/getsentry/sentry-javascript/pull/16823))
- feat(nextjs): Automatically skip middleware requests for tunnel route ([#16812](https://github.com/getsentry/sentry-javascript/pull/16812))
- feat(replay): Export compression worker from `@sentry/replay-internal` ([#16794](https://github.com/getsentry/sentry-javascript/pull/16794))
- fix(browser): Avoid 4xx response for succesful `diagnoseSdkConnectivity` request ([#16840](https://github.com/getsentry/sentry-javascript/pull/16840))
- fix(browser): Guard against undefined nextHopProtocol ([#16806](https://github.com/getsentry/sentry-javascript/pull/16806))
- fix(cloudflare): calculate retries not attempts ([#16834](https://github.com/getsentry/sentry-javascript/pull/16834))
- fix(nuxt): Parametrize routes on the server-side ([#16785](https://github.com/getsentry/sentry-javascript/pull/16785))
- fix(vue): Make pageload span handling more reliable ([#16799](https://github.com/getsentry/sentry-javascript/pull/16799))

Work in this release was contributed by @Spice-King and @stayallive. Thank you for your contributions!

## 9.35.0

- feat(browser): Add ElementTiming instrumentation and spans ([#16589](https://github.com/getsentry/sentry-javascript/pull/16589))
- feat(browser): Export `Context` and `Contexts` types ([#16763](https://github.com/getsentry/sentry-javascript/pull/16763))
- feat(cloudflare): Add user agent to cloudflare spans ([#16793](https://github.com/getsentry/sentry-javascript/pull/16793))
- feat(node): Add `eventLoopBlockIntegration` ([#16709](https://github.com/getsentry/sentry-javascript/pull/16709))
- feat(node): Export server-side feature flag integration shims ([#16735](https://github.com/getsentry/sentry-javascript/pull/16735))
- feat(node): Update vercel ai integration attributes ([#16721](https://github.com/getsentry/sentry-javascript/pull/16721))
- fix(astro): Handle errors in middlewares better ([#16693](https://github.com/getsentry/sentry-javascript/pull/16693))
- fix(browser): Ensure explicit `parentSpan` is considered ([#16776](https://github.com/getsentry/sentry-javascript/pull/16776))
- fix(node): Avoid using dynamic `require` for fastify integration ([#16789](https://github.com/getsentry/sentry-javascript/pull/16789))
- fix(nuxt): Add `@sentry/cloudflare` as optional peerDependency ([#16782](https://github.com/getsentry/sentry-javascript/pull/16782))
- fix(nuxt): Ensure order of plugins is consistent ([#16798](https://github.com/getsentry/sentry-javascript/pull/16798))
- fix(nestjs): Fix exception handling in `@Cron` decorated tasks ([#16792](https://github.com/getsentry/sentry-javascript/pull/16792))

Work in this release was contributed by @0xbad0c0d3 and @alSergey. Thank you for your contributions!

## 9.34.0

### Important Changes

- **feat(nuxt): Add Cloudflare Nitro plugin ([#15597](https://github.com/getsentry/sentry-javascript/pull/15597))**

  A Nitro plugin for `@sentry/nuxt` which initializes Sentry when deployed to Cloudflare (`cloudflare-pages` preset).

  1. Remove the previous server config file: `sentry.server.config.ts`
  2. Add a plugin in `server/plugins` (e.g. `server/plugins/sentry-cloudflare-setup.ts`)
  3. Add this code in your plugin file

     ```javascript
     // server/plugins/sentry-cloudflare-setup.ts (filename does not matter)
     import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins';

     export default defineNitroPlugin(
       sentryCloudflareNitroPlugin({
         dsn: 'https://dsn',
         tracesSampleRate: 1.0,
       }),
     );
     ```

     or with access to `nitroApp`:

     ```javascript
     // server/plugins/sentry-cloudflare-setup.ts (filename does not matter)
     import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins';

     export default defineNitroPlugin(sentryCloudflareNitroPlugin((nitroApp: NitroApp) => {
       // You can access nitroApp here if needed
       return  ({
         dsn: 'https://dsn',
         tracesSampleRate: 1.0,
       })
     }))
     ```

### Other Changes

- feat(browser): Record standalone LCP spans ([#16591](https://github.com/getsentry/sentry-javascript/pull/16591))
- fix(nuxt): Only add OTel alias in dev mode ([#16756](https://github.com/getsentry/sentry-javascript/pull/16756))

## 9.33.0

### Important Changes

- **feat: Add opt-in `vercelAiIntegration` to cloudflare & vercel-edge ([#16732](https://github.com/getsentry/sentry-javascript/pull/16732))**

The `vercelAiIntegration` is now available as opt-in for the Cloudflare and the Next.js SDK for Vercel Edge.
To use it, add the integration in `Sentry.init`

```js
Sentry.init({
  tracesSampleRate: 1.0,
  integrations: [Sentry.vercelAIIntegration()],
});
```

And enable telemetry for Vercel AI calls

```js
const result = await generateText({
  model: openai('gpt-4o'),
  experimental_telemetry: {
    isEnabled: true,
  },
});
```

- **feat(node): Add postgresjs instrumentation ([#16665](https://github.com/getsentry/sentry-javascript/pull/16665))**

The Node.js SDK now includes instrumentation for [Postgres.js](https://www.npmjs.com/package/postgres).

- **feat(node): Use diagnostics channel for Fastify v5 error handling ([#16715](https://github.com/getsentry/sentry-javascript/pull/16715))**

If you're on Fastify v5, you no longer need to call `setupFastifyErrorHandler`. It is done automatically by the node SDK. Older versions still rely on calling `setupFastifyErrorHandler`.

### Other Changes

- feat(cloudflare): Allow interop with OpenTelemetry emitted spans ([#16714](https://github.com/getsentry/sentry-javascript/pull/16714))
- feat(cloudflare): Flush after `waitUntil` ([#16681](https://github.com/getsentry/sentry-javascript/pull/16681))
- fix(nextjs): Remove `ai` from default server external packages ([#16736](https://github.com/getsentry/sentry-javascript/pull/16736))

Work in this release was contributed by @0xbad0c0d3. Thank you for your contribution!

## 9.32.0

### Important Changes

- feat(browser): Add CLS sources to span attributes ([#16710](https://github.com/getsentry/sentry-javascript/pull/16710))

Enhances CLS (Cumulative Layout Shift) spans by adding attributes detailing the elements that caused layout shifts.

- feat(cloudflare): Add `instrumentWorkflowWithSentry` to instrument workflows ([#16672](https://github.com/getsentry/sentry-javascript/pull/16672))

We've added support for Cloudflare Workflows, enabling comprehensive tracing for your workflow runs. This integration uses the workflow's instanceId as the Sentry trace_id and for sampling, linking all steps together. You'll now be able to see full traces, including retries with exponential backoff.

- feat(pino-transport): Add functionality to send logs to sentry ([#16667](https://github.com/getsentry/sentry-javascript/pull/16667))

Adds the ability to send logs to Sentry via a pino transport.

### Other Changes

- feat(nextjs): Expose top level buildTime `errorHandler` option ([#16718](https://github.com/getsentry/sentry-javascript/pull/16718))
- feat(node): update pipeline spans to use agent naming ([#16712](https://github.com/getsentry/sentry-javascript/pull/16712))
- feat(deps): bump @prisma/instrumentation from 6.9.0 to 6.10.1 ([#16698](https://github.com/getsentry/sentry-javascript/pull/16698))
- fix(sveltekit): Export logger from sveltekit worker ([#16716](https://github.com/getsentry/sentry-javascript/pull/16716))
- fix(google-cloud-serverless): Make `CloudEventsContext` compatible with `CloudEvent` ([#16705](https://github.com/getsentry/sentry-javascript/pull/16705))
- fix(nextjs): Stop injecting release value when create release options is set to `false` ([#16695](https://github.com/getsentry/sentry-javascript/pull/16695))
- fix(node): account for Object. syntax with local variables matching ([#16702](https://github.com/getsentry/sentry-javascript/pull/16702))
- fix(nuxt): Add alias for `@opentelemetry/resources` ([#16727](https://github.com/getsentry/sentry-javascript/pull/16727))

Work in this release was contributed by @flaeppe. Thank you for your contribution!

## 9.31.0

### Important Changes

- feat(nextjs): Add option for auto-generated random tunnel route ([#16626](https://github.com/getsentry/sentry-javascript/pull/16626))

Adds an option to automatically generate a random tunnel route for the Next.js SDK. This helps prevent ad blockers and other tools from blocking Sentry requests by using a randomized path instead of the predictable `/monitoring` endpoint.

- feat(core): Allow to pass `scope` & `client` to `getTraceData` ([#16633](https://github.com/getsentry/sentry-javascript/pull/16633))

Adds the ability to pass custom `scope` and `client` parameters to the `getTraceData` function, providing more flexibility when generating trace data for distributed tracing.

### Other Changes

- feat(core): Add support for `x-forwarded-host` and `x-forwarded-proto` headers ([#16687](https://github.com/getsentry/sentry-javascript/pull/16687))
- deps: Remove unused `@sentry/opentelemetry` dependency ([#16677](https://github.com/getsentry/sentry-javascript/pull/16677))
- deps: Update all bundler plugin instances to latest & allow caret ranges ([#16641](https://github.com/getsentry/sentry-javascript/pull/16641))
- feat(deps): Bump @prisma/instrumentation from 6.8.2 to 6.9.0 ([#16608](https://github.com/getsentry/sentry-javascript/pull/16608))
- feat(flags): add node support for generic featureFlagsIntegration and move utils to core ([#16585](https://github.com/getsentry/sentry-javascript/pull/16585))
- feat(flags): capture feature flag evaluations on spans ([#16485](https://github.com/getsentry/sentry-javascript/pull/16485))
- feat(pino): Add initial package for `@sentry/pino-transport` ([#16652](https://github.com/getsentry/sentry-javascript/pull/16652))
- fix: Wait for the correct clientWidth/clientHeight when showing Feedback Screenshot previews ([#16648](https://github.com/getsentry/sentry-javascript/pull/16648))
- fix(browser): Remove usage of Array.at() method ([#16647](https://github.com/getsentry/sentry-javascript/pull/16647))
- fix(core): Improve `safeJoin` usage in console logging integration ([#16658](https://github.com/getsentry/sentry-javascript/pull/16658))
- fix(google-cloud-serverless): Make `CloudEvent` type compatible ([#16661](https://github.com/getsentry/sentry-javascript/pull/16661))
- fix(nextjs): Fix lookup of `instrumentation-client.js` file ([#16637](https://github.com/getsentry/sentry-javascript/pull/16637))
- fix(node): Ensure graphql errors result in errored spans ([#16678](https://github.com/getsentry/sentry-javascript/pull/16678))

## 9.30.0

- feat(nextjs): Add URL to tags of server components and generation functions issues ([#16500](https://github.com/getsentry/sentry-javascript/pull/16500))
- feat(nextjs): Ensure all packages we auto-instrument are externalized ([#16552](https://github.com/getsentry/sentry-javascript/pull/16552))
- feat(node): Automatically enable `vercelAiIntegration` when `ai` module is detected ([#16565](https://github.com/getsentry/sentry-javascript/pull/16565))
- feat(node): Ensure `modulesIntegration` works in more environments ([#16566](https://github.com/getsentry/sentry-javascript/pull/16566))
- feat(core): Don't gate user on logs with `sendDefaultPii` ([#16527](https://github.com/getsentry/sentry-javascript/pull/16527))
- feat(browser): Add detail to measure spans and add regression tests ([#16557](https://github.com/getsentry/sentry-javascript/pull/16557))
- feat(node): Update Vercel AI span attributes ([#16580](https://github.com/getsentry/sentry-javascript/pull/16580))
- fix(opentelemetry): Ensure only orphaned spans of sent spans are sent ([#16590](https://github.com/getsentry/sentry-javascript/pull/16590))

## 9.29.0

### Important Changes

- **feat(browser): Update `web-vitals` to 5.0.2 ([#16492](https://github.com/getsentry/sentry-javascript/pull/16492))**

This release upgrades the `web-vitals` library to version 5.0.2. This upgrade could slightly change the collected web vital values and potentially also influence alerts and performance scores in the Sentry UI.

### Other Changes

- feat(deps): Bump @sentry/rollup-plugin from 3.4.0 to 3.5.0 ([#16524](https://github.com/getsentry/sentry-javascript/pull/16524))
- feat(ember): Stop warning for `onError` usage ([#16547](https://github.com/getsentry/sentry-javascript/pull/16547))
- feat(node): Allow to force activate `vercelAiIntegration` ([#16551](https://github.com/getsentry/sentry-javascript/pull/16551))
- feat(node): Introduce `ignoreLayersType` option to koa integration ([#16553](https://github.com/getsentry/sentry-javascript/pull/16553))
- fix(browser): Ensure `suppressTracing` does not leak when async ([#16545](https://github.com/getsentry/sentry-javascript/pull/16545))
- fix(vue): Ensure root component render span always ends ([#16488](https://github.com/getsentry/sentry-javascript/pull/16488))

## 9.28.1

- feat(deps): Bump @sentry/cli from 2.45.0 to 2.46.0 ([#16516](https://github.com/getsentry/sentry-javascript/pull/16516))
- fix(nextjs): Avoid tracing calls to symbolication server on dev ([#16533](https://github.com/getsentry/sentry-javascript/pull/16533))
- fix(sveltekit): Add import attribute for node exports ([#16528](https://github.com/getsentry/sentry-javascript/pull/16528))

Work in this release was contributed by @eltigerchino. Thank you for your contribution!

## 9.28.0

### Important Changes

- **feat(nestjs): Stop creating spans for `TracingInterceptor` ([#16501](https://github.com/getsentry/sentry-javascript/pull/16501))**

With this change we stop creating spans for `TracingInterceptor` as this interceptor only serves as an internal helper and adds noise for the user.

- **feat(node): Update vercel ai spans as per new conventions ([#16497](https://github.com/getsentry/sentry-javascript/pull/16497))**

This feature ships updates to the span names and ops to better match OpenTelemetry. This should make them more easily accessible to the new agents module view we are building.

### Other Changes

- fix(sveltekit): Export `vercelAIIntegration` from `@sentry/node` ([#16496](https://github.com/getsentry/sentry-javascript/pull/16496))

Work in this release was contributed by @agrattan0820. Thank you for your contribution!

## 9.27.0

- feat(node): Expand how vercel ai input/outputs can be set ([#16455](https://github.com/getsentry/sentry-javascript/pull/16455))
- feat(node): Switch to new semantic conventions for Vercel AI ([#16476](https://github.com/getsentry/sentry-javascript/pull/16476))
- feat(react-router): Add component annotation plugin ([#16472](https://github.com/getsentry/sentry-javascript/pull/16472))
- feat(react-router): Export wrappers for server loaders and actions ([#16481](https://github.com/getsentry/sentry-javascript/pull/16481))
- fix(browser): Ignore unrealistically long INP values ([#16484](https://github.com/getsentry/sentry-javascript/pull/16484))
- fix(react-router): Conditionally add `ReactRouterServer` integration ([#16470](https://github.com/getsentry/sentry-javascript/pull/16470))

## 9.26.0

- feat(react-router): Re-export functions from `@sentry/react` ([#16465](https://github.com/getsentry/sentry-javascript/pull/16465))
- fix(nextjs): Skip re instrumentating on generate phase of experimental build mode ([#16410](https://github.com/getsentry/sentry-javascript/pull/16410))
- fix(node): Ensure adding sentry-trace and baggage headers via SentryHttpInstrumentation doesn't crash ([#16473](https://github.com/getsentry/sentry-javascript/pull/16473))

## 9.25.1

- fix(otel): Don't ignore child spans after the root is sent ([#16416](https://github.com/getsentry/sentry-javascript/pull/16416))

## 9.25.0

### Important Changes

- **feat(browser): Add option to ignore `mark` and `measure` spans ([#16443](https://github.com/getsentry/sentry-javascript/pull/16443))**

This release adds an option to `browserTracingIntegration` that lets you ignore
`mark` and `measure` spans created from the `performance.mark(...)` and `performance.measure(...)` browser APIs:

```js
Sentry.init({
  integrations: [
    Sentry.browserTracingIntegration({
      ignorePerformanceApiSpans: ['measure-to-ignore', /mark-to-ignore/],
    }),
  ],
});
```

### Other Changes

- feat(browser): Export getTraceData from the browser sdks ([#16433](https://github.com/getsentry/sentry-javascript/pull/16433))
- feat(node): Add `includeServerName` option ([#16442](https://github.com/getsentry/sentry-javascript/pull/16442))
- fix(nuxt): Remove setting `@sentry/nuxt` external ([#16444](https://github.com/getsentry/sentry-javascript/pull/16444))

## 9.24.0

### Important Changes

- feat(angular): Bump `@sentry/angular` peer dependencies to add Angular 20 support ([#16414](https://github.com/getsentry/sentry-javascript/pull/16414))

This release adds support for Angular 20 to the Sentry Angular SDK `@sentry/angular`.

### Other Changes

- feat(browser): Add `unregisterOriginalCallbacks` option to `browserApiErrorsIntegration` ([#16412](https://github.com/getsentry/sentry-javascript/pull/16412))
- feat(core): Add user to logs ([#16399](https://github.com/getsentry/sentry-javascript/pull/16399))
- feat(core): Make sure Supabase db query insights are populated ([#16169](https://github.com/getsentry/sentry-javascript/pull/16169))

## 9.23.0

### Important changes

- **feat(browser): option to ignore certain resource types ([#16389](https://github.com/getsentry/sentry-javascript/pull/16389))**

Adds an option to opt out of certain `resource.*` spans via `ignoreResourceSpans`.

For example, to opt out of `resource.script` spans:

```js
Sentry.browserTracingIntegration({
  ignoreResourceSpans: ['resource.script'],
}),
```

### Other changes

- feat: Export `isEnabled` from all SDKs ([#16405](https://github.com/getsentry/sentry-javascript/pull/16405))
- feat(browser): Disable client when browser extension is detected in `init()` ([#16354](https://github.com/getsentry/sentry-javascript/pull/16354))
- feat(core): Allow re-use of `captureLog` ([#16352](https://github.com/getsentry/sentry-javascript/pull/16352))
- feat(core): Export `_INTERNAL_captureSerializedLog` ([#16387](https://github.com/getsentry/sentry-javascript/pull/16387))
- feat(deps): bump @opentelemetry/semantic-conventions from 1.32.0 to 1.34.0 ([#16393](https://github.com/getsentry/sentry-javascript/pull/16393))
- feat(deps): bump @prisma/instrumentation from 6.7.0 to 6.8.2 ([#16392](https://github.com/getsentry/sentry-javascript/pull/16392))
- feat(deps): bump @sentry/cli from 2.43.0 to 2.45.0 ([#16395](https://github.com/getsentry/sentry-javascript/pull/16395))
- feat(deps): bump @sentry/webpack-plugin from 3.3.1 to 3.5.0 ([#16394](https://github.com/getsentry/sentry-javascript/pull/16394))
- feat(nextjs): Include `static/chunks/main-*` files for `widenClientFileUpload` ([#16406](https://github.com/getsentry/sentry-javascript/pull/16406))
- feat(node): Do not add HTTP & fetch span instrumentation if tracing is disabled ([#15730](https://github.com/getsentry/sentry-javascript/pull/15730))
- feat(nuxt): Added support for nuxt layers ([#16372](https://github.com/getsentry/sentry-javascript/pull/16372))
- fix(browser): Ensure logs are flushed when sendClientReports=false ([#16351](https://github.com/getsentry/sentry-javascript/pull/16351))
- fix(browser): Move `browserTracingIntegration` code to `setup` hook ([#16386](https://github.com/getsentry/sentry-javascript/pull/16386))
- fix(cloudflare): Capture exceptions thrown in hono ([#16355](https://github.com/getsentry/sentry-javascript/pull/16355))
- fix(node): Don't warn about Spotlight on empty NODE_ENV ([#16381](https://github.com/getsentry/sentry-javascript/pull/16381))
- fix(node): Suppress Spotlight calls ([#16380](https://github.com/getsentry/sentry-javascript/pull/16380))
- fix(nuxt): Add `@sentry/nuxt` as external in Rollup ([#16407](https://github.com/getsentry/sentry-javascript/pull/16407))
- fix(opentelemetry): Ensure `withScope` keeps span active & `_getTraceInfoFromScope` works ([#16385](https://github.com/getsentry/sentry-javascript/pull/16385))

Work in this release was contributed by @Xenossolitarius. Thank you for your contribution!

## 9.22.0

### Important changes

- **Revert "feat(browser): Track measure detail as span attributes" ([#16348](https://github.com/getsentry/sentry-javascript/pull/16348))**

This is a revert of a feature introduced in `9.20.0` with [#16240](https://github.com/getsentry/sentry-javascript/pull/16240). This feature was causing crashes in firefox, so we are reverting it. We will re-enable this functionality in the future after fixing the crash.

### Other changes

- feat(deps): bump @sentry/rollup-plugin from 3.1.2 to 3.2.1 ([#15511](https://github.com/getsentry/sentry-javascript/pull/15511))
- fix(remix): Use generic types for `ServerBuild` argument and return ([#16336](https://github.com/getsentry/sentry-javascript/pull/16336))

## 9.21.0

- docs: Fix v7 migration link ([#14629](https://github.com/getsentry/sentry-javascript/pull/14629))
- feat(node): Vendor in `@fastify/otel` ([#16328](https://github.com/getsentry/sentry-javascript/pull/16328))
- fix(nestjs): Handle multiple `OnEvent` decorators ([#16306](https://github.com/getsentry/sentry-javascript/pull/16306))
- fix(node): Avoid creating breadcrumbs for suppressed requests ([#16285](https://github.com/getsentry/sentry-javascript/pull/16285))
- fix(remix): Add missing `client` exports to `server` and `cloudflare` entries ([#16341](https://github.com/getsentry/sentry-javascript/pull/16341))

Work in this release was contributed by @phthhieu. Thank you for your contribution!

## 9.20.0

### Important changes

- **feat(browser): Track measure detail as span attributes ([#16240](https://github.com/getsentry/sentry-javascript/pull/16240))**

The SDK now automatically collects details passed to `performance.measure` options.

### Other changes

- feat(node): Add `maxIncomingRequestBodySize` ([#16225](https://github.com/getsentry/sentry-javascript/pull/16225))
- feat(react-router): Add server action instrumentation ([#16292](https://github.com/getsentry/sentry-javascript/pull/16292))
- feat(react-router): Filter manifest requests ([#16294](https://github.com/getsentry/sentry-javascript/pull/16294))
- feat(replay): Extend default list for masking with `aria-label` ([#16192](https://github.com/getsentry/sentry-javascript/pull/16192))
- fix(browser): Ensure pageload & navigation spans have correct data ([#16279](https://github.com/getsentry/sentry-javascript/pull/16279))
- fix(cloudflare): Account for static fields in wrapper type ([#16303](https://github.com/getsentry/sentry-javascript/pull/16303))
- fix(nextjs): Preserve `next.route` attribute on root spans ([#16297](https://github.com/getsentry/sentry-javascript/pull/16297))
- feat(node): Fork isolation scope in tRPC middleware ([#16296](https://github.com/getsentry/sentry-javascript/pull/16296))
- feat(core): Add `orgId` option to `init` and DSC (`sentry-org_id` in baggage) ([#16305](https://github.com/getsentry/sentry-javascript/pull/16305))

## 9.19.0

- feat(react-router): Add otel instrumentation for server requests ([#16147](https://github.com/getsentry/sentry-javascript/pull/16147))
- feat(remix): Vendor in `opentelemetry-instrumentation-remix` ([#16145](https://github.com/getsentry/sentry-javascript/pull/16145))
- fix(browser): Ensure spans auto-ended for navigations have `cancelled` reason ([#16277](https://github.com/getsentry/sentry-javascript/pull/16277))
- fix(node): Pin `@fastify/otel` fork to direct url to allow installing without git ([#16287](https://github.com/getsentry/sentry-javascript/pull/16287))
- fix(react): Handle nested parameterized routes in reactrouterv3 transaction normalization ([#16274](https://github.com/getsentry/sentry-javascript/pull/16274))

Work in this release was contributed by @sidx1024. Thank you for your contribution!

## 9.18.0

### Important changes

- **feat: Support Node 24 ([#16236](https://github.com/getsentry/sentry-javascript/pull/16236))**

We now also publish profiling binaries for Node 24.

### Other changes

- deps(node): Bump `import-in-the-middle` to `1.13.1` ([#16260](https://github.com/getsentry/sentry-javascript/pull/16260))
- feat: Export `consoleLoggingIntegration` from vercel edge sdk ([#16228](https://github.com/getsentry/sentry-javascript/pull/16228))
- feat(cloudflare): Add support for email, queue, and tail handler ([#16233](https://github.com/getsentry/sentry-javascript/pull/16233))
- feat(cloudflare): Improve http span data ([#16232](https://github.com/getsentry/sentry-javascript/pull/16232))
- feat(nextjs): Add more attributes for generation functions ([#16214](https://github.com/getsentry/sentry-javascript/pull/16214))
- feat(opentelemetry): Widen peer dependencies to support Otel v2 ([#16246](https://github.com/getsentry/sentry-javascript/pull/16246))
- fix(core): Gracefully handle invalid baggage entries ([#16257](https://github.com/getsentry/sentry-javascript/pull/16257))
- fix(node): Ensure traces are propagated without spans in Node 22+ ([#16221](https://github.com/getsentry/sentry-javascript/pull/16221))
- fix(node): Use sentry forked `@fastify/otel` dependency with pinned Otel v1 deps ([#16256](https://github.com/getsentry/sentry-javascript/pull/16256))
- fix(remix): Remove vendored types ([#16218](https://github.com/getsentry/sentry-javascript/pull/16218))

## 9.17.0

- feat(node): Migrate to `@fastify/otel` ([#15542](https://github.com/getsentry/sentry-javascript/pull/15542))

## 9.16.1

- fix(core): Make sure logs get flushed in server-runtime-client ([#16222](https://github.com/getsentry/sentry-javascript/pull/16222))
- ref(node): Remove vercel flushing code that does nothing ([#16217](https://github.com/getsentry/sentry-javascript/pull/16217))

## 9.16.0

### Important changes

- **feat: Create a Vite plugin that injects sentryConfig into the global config ([#16197](https://github.com/getsentry/sentry-javascript/pull/16197))**

Add a new plugin `makeConfigInjectorPlugin` within our existing vite plugin that updates the global vite config with sentry options

- **feat(browser): Add option to sample linked traces consistently ([#16037](https://github.com/getsentry/sentry-javascript/pull/16037))**

This PR implements consistent sampling across traces as outlined in ([#15754](https://github.com/getsentry/sentry-javascript/pull/15754))

- **feat(cloudflare): Add support for durable objects ([#16180](https://github.com/getsentry/sentry-javascript/pull/16180))**

This PR introduces a new `instrumentDurableObjectWithSentry` method to the SDK, which instruments durable objects. We capture both traces and errors automatically.

- **feat(node): Add Prisma integration by default ([#16073](https://github.com/getsentry/sentry-javascript/pull/16073))**

[Prisma integration](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/integrations/prisma/) is enabled by default, it should work for both ESM and CJS.

- **feat(react-router): Add client-side router instrumentation ([#16185](https://github.com/getsentry/sentry-javascript/pull/16185))**

Adds client-side instrumentation for react router's `HydratedRouter`. To enable it, simply replace `browserTracingIntegration()` with `reactRouterTracingIntegration()` in your client-side init call.

- **fix(node): Avoid double-wrapping http module ([#16177](https://github.com/getsentry/sentry-javascript/pull/16177))**

When running your application in ESM mode, there have been scenarios that resulted in the `http`/`https` emitting duplicate spans for incoming requests. This was apparently caused by us double-wrapping the modules for incoming request isolation.

In order to solve this problem, the modules are no longer monkey patched by us for request isolation. Instead, we register diagnostics*channel hooks to handle request isolation now.
While this is generally not expected to break anything, there is one tiny change that \_may* affect you if you have been relying on very specific functionality:

The `ignoreOutgoingRequests` option of `httpIntegration` receives the `RequestOptions` as second argument. This type is not changed, however due to how the wrapping now works, we no longer pass through the full RequestOptions, but re-construct this partially based on the generated request. For the vast majority of cases, this should be fine, but for the sake of completeness, these are the only fields that may be available there going forward - other fields that _may_ have existed before may no longer be set:

```ts
ignoreOutgoingRequests(url: string, {
  method: string;
  protocol: string;
  host: string;
  hostname: string; // same as host
  path: string;
  headers: OutgoingHttpHeaders;
})
```

### Other changes

- feat(cloudflare): Add logs exports ([#16165](https://github.com/getsentry/sentry-javascript/pull/16165))
- feat(vercel-edge): Add logs export ([#16166](https://github.com/getsentry/sentry-javascript/pull/16166))
- feat(cloudflare): Read `SENTRY_RELEASE` from `env` ([#16201](https://github.com/getsentry/sentry-javascript/pull/16201))
- feat(node): Drop `http.server` spans with 404 status by default ([#16205](https://github.com/getsentry/sentry-javascript/pull/16205))
- fix(browser): Respect manually set sentry tracing headers in XHR requests ([#16184](https://github.com/getsentry/sentry-javascript/pull/16184))
- fix(core): Respect manually set sentry tracing headers in fetch calls ([#16183](https://github.com/getsentry/sentry-javascript/pull/16183))
- fix(feedback): Prevent `removeFromDom()` from throwing ([#16030](https://github.com/getsentry/sentry-javascript/pull/16030))
- fix(node): Use class constructor in docstring for winston transport ([#16167](https://github.com/getsentry/sentry-javascript/pull/16167))
- fix(node): Fix vercel flushing logic & add test for it ([#16208](https://github.com/getsentry/sentry-javascript/pull/16208))
- fix(node): Fix 404 route handling in express 5 ([#16211](https://github.com/getsentry/sentry-javascript/pull/16211))
- fix(logs): Ensure logs can be flushed correctly ([#16216](https://github.com/getsentry/sentry-javascript/pull/16216))
- ref(core): Switch to standardized log envelope ([#16133](https://github.com/getsentry/sentry-javascript/pull/16133))

## 9.15.0

### Important Changes

- **feat: Export `wrapMcpServerWithSentry` from server packages ([#16127](https://github.com/getsentry/sentry-javascript/pull/16127))**

Exports the wrapMcpServerWithSentry which is our MCP server instrumentation from all the server packages.

- **feat(core): Associate resource/tool/prompt invocations with request span instead of response span ([#16126](https://github.com/getsentry/sentry-javascript/pull/16126))**

Adds a best effort mechanism to associate handler spans for `resource`, `tool` and `prompt` with the incoming message requests instead of the outgoing SSE response.

### Other Changes

- fix: Vercel `ai` ESM patching ([#16152](https://github.com/getsentry/sentry-javascript/pull/16152))
- fix(node): Update version range for `module.register` ([#16125](https://github.com/getsentry/sentry-javascript/pull/16125))
- fix(react-router): Spread `unstable_sentryVitePluginOptions` correctly ([#16156](https://github.com/getsentry/sentry-javascript/pull/16156))
- fix(react): Fix Redux integration failing with reducer injection ([#16106](https://github.com/getsentry/sentry-javascript/pull/16106))
- fix(remix): Add ESM-compatible exports ([#16124](https://github.com/getsentry/sentry-javascript/pull/16124))
- fix(remix): Avoid rewrapping root loader. ([#16136](https://github.com/getsentry/sentry-javascript/pull/16136))

Work in this release was contributed by @AntoineDuComptoirDesPharmacies. Thank you for your contribution!

## 9.14.0

### Important Changes

- **feat: Add Supabase Integration ([#15719](https://github.com/getsentry/sentry-javascript/pull/15719))**

This PR adds Supabase integration to `@sentry/core`, allowing automatic instrumentation of Supabase client operations (database queries and authentication) for performance monitoring and error tracking.

- **feat(nestjs): Gracefully handle RPC scenarios in `SentryGlobalFilter` ([#16066](https://github.com/getsentry/sentry-javascript/pull/16066))**

This PR adds better RPC exception handling to `@sentry/nestjs`, preventing application crashes while still capturing errors and warning users when a dedicated filter is needed. The implementation gracefully handles the 'rpc' context type in `SentryGlobalFilter` to improve reliability in hybrid applications.

- **feat(react-router): Trace propagation ([#16070](https://github.com/getsentry/sentry-javascript/pull/16070))**

This PR adds trace propagation to `@sentry/react-router` by providing utilities to inject trace meta tags into HTML headers and offering a pre-built Sentry-instrumented request handler, improving distributed tracing capabilities across page loads.

### Other Changes

- feat(deps): Bump @prisma/instrumentation from 6.5.0 to 6.6.0 ([#16102](https://github.com/getsentry/sentry-javascript/pull/16102))
- feat(nextjs): Improve server component data ([#15996](https://github.com/getsentry/sentry-javascript/pull/15996))
- feat(nuxt): Log when adding HTML trace meta tags ([#16044](https://github.com/getsentry/sentry-javascript/pull/16044))
- fix(node): Make body capturing more robust ([#16105](https://github.com/getsentry/sentry-javascript/pull/16105))
- ref(node): Log when incoming request bodies are being captured ([#16104](https://github.com/getsentry/sentry-javascript/pull/16104))

## 9.13.0

### Important Changes

- **feat(node): Add support for winston logger ([#15983](https://github.com/getsentry/sentry-javascript/pull/15983))**

  Sentry is adding support for [structured logging](https://github.com/getsentry/sentry-javascript/discussions/15916). In this release we've added support for sending logs to Sentry via the [winston](https://github.com/winstonjs/winston) logger to the Sentry Node SDK (and SDKs that use the Node SDK under the hood like `@sentry/nestjs`). The Logging APIs in the Sentry SDK are still experimental and subject to change.

  ```js
  const winston = require('winston');
  const Transport = require('winston-transport');

  const transport = Sentry.createSentryWinstonTransport(Transport);

  const logger = winston.createLogger({
    transports: [transport],
  });
  ```

- **feat(core): Add `wrapMcpServerWithSentry` to instrument MCP servers from `@modelcontextprotocol/sdk` ([#16032](https://github.com/getsentry/sentry-javascript/pull/16032))**

  The Sentry SDK now supports instrumenting MCP servers from the `@modelcontextprotocol/sdk` package. Compatible with versions `^1.9.0` of the `@modelcontextprotocol/sdk` package.

  ```js
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

  // Create an MCP server
  const server = new McpServer({
    name: 'Demo',
    version: '1.0.0',
  });

  // Use the instrumented server in your application
  const instrumentedServer = Sentry.wrapMcpServerWithSentry(server);
  ```

- **feat(core): Move console integration into core and add to cloudflare/vercel-edge ([#16024](https://github.com/getsentry/sentry-javascript/pull/16024))**

  Console instrumentation has been added to `@sentry/cloudflare` and `@sentry/nextjs` Edge Runtime and is enabled by default. Now calls to the console object will be captured as breadcrumbs for those SDKs.

- **feat(bun): Support new `Bun.serve` APIs ([#16035](https://github.com/getsentry/sentry-javascript/pull/16035))**

  Bun `1.2.6` and above have a new `Bun.serve` API, which the Bun SDK now supports. The SDK instruments the new routes object that can be used to define routes for the server.

  Thanks to @Jarred-Sumner for helping us get this supported!

### Other Changes

- feat(browser): Warn on duplicate `browserTracingIntegration` ([#16042](https://github.com/getsentry/sentry-javascript/pull/16042))
- feat(core): Allow delayed sending with offline transport ([#15937](https://github.com/getsentry/sentry-javascript/pull/15937))
- feat(deps): Bump @sentry/webpack-plugin from 3.2.4 to 3.3.1 ([#16057](https://github.com/getsentry/sentry-javascript/pull/16057))
- feat(vue): Apply stateTransformer to attachments in Pinia Plugin ([#16034](https://github.com/getsentry/sentry-javascript/pull/16034))
- fix(core): Run `beforeSendLog` after we process log ([#16019](https://github.com/getsentry/sentry-javascript/pull/16019))
- fix(nextjs): Don't show turbopack warning for newer Next.js canaries ([#16065](https://github.com/getsentry/sentry-javascript/pull/16065))
- fix(nextjs): Include patch version 0 for min supported 15.3.0 ([#16026](https://github.com/getsentry/sentry-javascript/pull/16026))
- fix(node): Ensure late init works with all integrations ([#16016](https://github.com/getsentry/sentry-javascript/pull/16016))
- fix(react-router): Pass `unstable_sentryVitePluginOptions` to cli instance ([#16033](https://github.com/getsentry/sentry-javascript/pull/16033))
- fix(serverless-aws): Overwrite root span name with GraphQL if set ([#16010](https://github.com/getsentry/sentry-javascript/pull/16010))

## 9.12.0

### Important Changes

- **feat(feedback): Implement highlighting and hiding controls for screenshots ([#15951](https://github.com/getsentry/sentry-javascript/pull/15951))**

  The Sentry SDK now supports highlighting and hiding controls for screenshots in [user feedback reports](https://docs.sentry.io/platforms/javascript/user-feedback/). This functionality is enabled by default.

- **feat(node): Add `ignoreIncomingRequestBody` callback to `httpIntegration` ([#15959](https://github.com/getsentry/sentry-javascript/pull/15959))**

  The `httpIntegration` now supports an optional `ignoreIncomingRequestBody` callback that can be used to skip capturing the body of incoming requests.

  ```ts
  Sentry.init({
    integrations: [
      Sentry.httpIntegration({
        ignoreIncomingRequestBody: (url, request) => {
          return request.method === 'GET' && url.includes('/api/large-payload');
        },
      }),
    ],
  });
  ```

  The `ignoreIncomingRequestBody` callback receives the URL of the request and should return `true` if the body should be ignored.

- **Logging Improvements**

  Sentry is adding support for [structured logging](https://github.com/getsentry/sentry-javascript/discussions/15916). In this release we've made a variety of improvements to logging functionality in the Sentry SDKs.

  - feat(node): Add server.address to nodejs logs ([#16006](https://github.com/getsentry/sentry-javascript/pull/16006))
  - feat(core): Add sdk name and version to logs ([#16005](https://github.com/getsentry/sentry-javascript/pull/16005))
  - feat(core): Add sentry origin attribute to console logs integration ([#15998](https://github.com/getsentry/sentry-javascript/pull/15998))
  - fix(core): Do not abbreviate message parameter attribute ([#15987](https://github.com/getsentry/sentry-javascript/pull/15987))
  - fix(core): Prefix release and environment correctly ([#15999](https://github.com/getsentry/sentry-javascript/pull/15999))
  - fix(node): Make log flushing logic more robust ([#15991](https://github.com/getsentry/sentry-javascript/pull/15991))

### Other Changes

- build(aws-serverless): Include debug logs in lambda layer SDK bundle ([#15974](https://github.com/getsentry/sentry-javascript/pull/15974))
- feat(astro): Add tracking of errors during HTML streaming ([#15995](https://github.com/getsentry/sentry-javascript/pull/15995))
- feat(browser): Add `onRequestSpanStart` hook to browser tracing integration ([#15979](https://github.com/getsentry/sentry-javascript/pull/15979))
- feat(deps): Bump @sentry/cli from 2.42.3 to 2.43.0 ([#16001](https://github.com/getsentry/sentry-javascript/pull/16001))
- feat(nextjs): Add `captureRouterTransitionStart` hook for capturing navigations ([#15981](https://github.com/getsentry/sentry-javascript/pull/15981))
- feat(nextjs): Mark clientside prefetch request spans with `http.request.prefetch: true` attribute ([#15980](https://github.com/getsentry/sentry-javascript/pull/15980))
- feat(nextjs): Un experimentify `clientInstrumentationHook` ([#15992](https://github.com/getsentry/sentry-javascript/pull/15992))
- feat(nextjs): Warn when client was initialized more than once ([#15971](https://github.com/getsentry/sentry-javascript/pull/15971))
- feat(node): Add support for `SENTRY_DEBUG` env variable ([#15972](https://github.com/getsentry/sentry-javascript/pull/15972))
- fix(tss-react): Change `authToken` type to `string` ([#15985](https://github.com/getsentry/sentry-javascript/pull/15985))

Work in this release was contributed by @Page- and @Fryuni. Thank you for your contributions!

## 9.11.0

- feat(browser): Add `http.redirect_count` attribute to `browser.redirect` span ([#15943](https://github.com/getsentry/sentry-javascript/pull/15943))
- feat(core): Add `consoleLoggingIntegration` for logs ([#15955](https://github.com/getsentry/sentry-javascript/pull/15955))
- feat(core): Don't truncate error messages ([#15818](https://github.com/getsentry/sentry-javascript/pull/15818))
- feat(core): Emit debug log when transport execution fails ([#16009](https://github.com/getsentry/sentry-javascript/pull/16009))
- feat(nextjs): Add release injection in Turbopack ([#15958](https://github.com/getsentry/sentry-javascript/pull/15958))
- feat(nextjs): Record `turbopack` as tag ([#15928](https://github.com/getsentry/sentry-javascript/pull/15928))
- feat(nuxt): Base decision on source maps upload only on Nuxt source map settings ([#15859](https://github.com/getsentry/sentry-javascript/pull/15859))
- feat(react-router): Add `sentryHandleRequest` ([#15787](https://github.com/getsentry/sentry-javascript/pull/15787))
- fix(node): Use `module` instead of `require` for CJS check ([#15927](https://github.com/getsentry/sentry-javascript/pull/15927))
- fix(remix): Remove mentions of deprecated `ErrorBoundary` wrapper ([#15930](https://github.com/getsentry/sentry-javascript/pull/15930))
- ref(browser): Temporarily add `sentry.previous_trace` span attribute ([#15957](https://github.com/getsentry/sentry-javascript/pull/15957))
- ref(browser/core): Move all log flushing logic into clients ([#15831](https://github.com/getsentry/sentry-javascript/pull/15831))
- ref(core): Improve URL parsing utilities ([#15882](https://github.com/getsentry/sentry-javascript/pull/15882))

## 9.10.1

- fix: Correct @sentry-internal/feedback docs to match the code ([#15874](https://github.com/getsentry/sentry-javascript/pull/15874))
- deps: Bump bundler plugins to version `3.2.4` ([#15909](https://github.com/getsentry/sentry-javascript/pull/15909))

## 9.10.0

### Important Changes

- **feat: Add support for logs**

  - feat(node): Add logging public APIs to Node SDKs ([#15764](https://github.com/getsentry/sentry-javascript/pull/15764))
  - feat(core): Add support for `beforeSendLog` ([#15814](https://github.com/getsentry/sentry-javascript/pull/15814))
  - feat(core): Add support for parameterizing logs ([#15812](https://github.com/getsentry/sentry-javascript/pull/15812))
  - fix: Remove critical log severity level ([#15824](https://github.com/getsentry/sentry-javascript/pull/15824))

  All JavaScript SDKs other than `@sentry/cloudflare` and `@sentry/deno` now support sending logs via dedicated methods as part of Sentry's [upcoming logging product](https://github.com/getsentry/sentry/discussions/86804).

  Logging is gated by an experimental option, `_experiments.enableLogs`.

  ```js
  Sentry.init({
    dsn: 'PUBLIC_DSN',
    // `enableLogs` must be set to true to use the logging features
    _experiments: { enableLogs: true },
  });

  const { trace, debug, info, warn, error, fatal, fmt } = Sentry.logger;

  trace('Starting database connection', { database: 'users' });
  debug('Cache miss for user', { userId: 123 });
  error('Failed to process payment', { orderId: 'order_123', amount: 99.99 });
  fatal('Database connection pool exhausted', { database: 'users', activeConnections: 100 });

  // Structured logging via the `fmt` helper function. When you use `fmt`, the string template and parameters are sent separately so they can be queried independently in Sentry.

  info(fmt(`Updated profile for user ${userId}`));
  warn(fmt(`Rate limit approaching for endpoint ${endpoint}. Requests: ${requests}, Limit: ${limit}`));
  ```

  With server-side SDKs like `@sentry/node`, `@sentry/bun` or server-side of `@sentry/nextjs` or `@sentry/sveltekit`, you can do structured logging without needing the `fmt` helper function.

  ```js
  const { info, warn } = Sentry.logger;

  info('User %s logged in successfully', [123]);
  warn('Failed to load user %s data', [123], { errorCode: 404 });
  ```

  To filter logs, or update them before they are sent to Sentry, you can use the `_experiments.beforeSendLog` option.

- **feat(browser): Add `diagnoseSdkConnectivity()` function to programmatically detect possible connectivity issues ([#15821](https://github.com/getsentry/sentry-javascript/pull/15821))**

  The `diagnoseSdkConnectivity()` function can be used to programmatically detect possible connectivity issues with the Sentry SDK.

  ```js
  const result = await Sentry.diagnoseSdkConnectivity();
  ```

  The result will be an object with the following properties:

  - `"no-client-active"`: There was no active client when the function was called. This possibly means that the SDK was not initialized yet.
  - `"sentry-unreachable"`: The Sentry SaaS servers were not reachable. This likely means that there is an ad blocker active on the page or that there are other connection issues.
  - `undefined`: The SDK is working as expected.

- **SDK Tracing Performance Improvements for Node SDKs**

  - feat: Stop using `dropUndefinedKeys` ([#15796](https://github.com/getsentry/sentry-javascript/pull/15796))
  - feat(node): Only add span listeners for instrumentation when used ([#15802](https://github.com/getsentry/sentry-javascript/pull/15802))
  - ref: Avoid `dropUndefinedKeys` for `spanToJSON` calls ([#15792](https://github.com/getsentry/sentry-javascript/pull/15792))
  - ref: Avoid using `SentryError` for PromiseBuffer control flow ([#15822](https://github.com/getsentry/sentry-javascript/pull/15822))
  - ref: Stop using `dropUndefinedKeys` in SpanExporter ([#15794](https://github.com/getsentry/sentry-javascript/pull/15794))
  - ref(core): Avoid using `SentryError` for event processing control flow ([#15823](https://github.com/getsentry/sentry-javascript/pull/15823))
  - ref(node): Avoid `dropUndefinedKeys` in Node SDK init ([#15797](https://github.com/getsentry/sentry-javascript/pull/15797))
  - ref(opentelemetry): Avoid sampling work for non-root spans ([#15820](https://github.com/getsentry/sentry-javascript/pull/15820))

  We've been hard at work making performance improvements to the Sentry Node SDKs (`@sentry/node`, `@sentry/aws-serverless`, `@sentry/nestjs`, etc.). We've seen that upgrading from `9.7.0` to `9.10.0` leads to 30-40% improvement in request latency for HTTP web-server applications that use tracing with high sample rates. Non web-server applications and non-tracing applications will see smaller improvements.

### Other Changes

- chore(deps): Bump `rrweb` to `2.35.0` ([#15825](https://github.com/getsentry/sentry-javascript/pull/15825))
- deps: Bump bundler plugins to `3.2.3` ([#15829](https://github.com/getsentry/sentry-javascript/pull/15829))
- feat: Always truncate stored breadcrumb messages to 2kb ([#15819](https://github.com/getsentry/sentry-javascript/pull/15819))
- feat(nextjs): Disable server webpack-handling for static builds ([#15751](https://github.com/getsentry/sentry-javascript/pull/15751))
- fix(nuxt): Don't override Nuxt options if undefined ([#15795](https://github.com/getsentry/sentry-javascript/pull/15795))

## 9.9.0

### Important Changes

- **feat(nextjs): Support `instrumentation-client.ts` ([#15705](https://github.com/getsentry/sentry-javascript/pull/15705))**

  Next.js recently added a feature to support [client-side (browser) instrumentation via a `instrumentation-client.ts` file](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client).

  To be forwards compatible, the Sentry Next.js SDK will now pick up `instrumentation-client.ts` files even on older Next.js versions and add them to your client bundles.
  It is suggested that you either rename your `sentry.client.config.ts` file to `instrumentation-client.ts`, or if you already happen to have a `instrumentation-client.ts` file move the contents of `sentry.client.config.ts` to `instrumentation-client.ts`.

- **feat(browser): Add `previous_trace` span links ([#15569](https://github.com/getsentry/sentry-javascript/pull/15569))**

  The `@sentry/browser` SDK and SDKs based on `@sentry/browser` now emits a link from the first root span of a newly started trace to the root span of a previously started trace. You can control this feature via an option in `browserTracingIntegration()`:

  ```js
  Sentry.init({
    dsn: 'your-dsn-here'
    integrations: [
      Sentry.browserTracingIntegration({
        // Available settings:
        // - 'in-memory' (default): Stores previous trace information in memory
        // - 'session-storage': Stores previous trace information in the browser's `sessionStorage`
        // - 'off': Disable storing and sending previous trace information
        linkPreviousTrace: 'in-memory',
      }),
    ],
  });
  ```

- **feat(browser): Add `logger.X` methods to browser SDK ([#15763](https://github.com/getsentry/sentry-javascript/pull/15763))**

  For Sentry's [upcoming logging product](https://github.com/getsentry/sentry/discussions/86804), the SDK now supports sending logs via dedicated methods.

  ```js
  Sentry.init({
    dsn: 'your-dsn-here',
    _experiments: {
      enableLogs: true, // This is required to use the logging features
    },
  });

  Sentry.logger.info('This is a trace message', { userId: 123 });
  // See PR for better documentation
  ```

  Please note that the logs product is still in early access. See the link above for more information.

### Other Changes

- feat(browser): Attach host as part of error message to "Failed to fetch" errors ([#15729](https://github.com/getsentry/sentry-javascript/pull/15729))
- feat(core): Add `parseStringToURL` method ([#15768](https://github.com/getsentry/sentry-javascript/pull/15768))
- feat(core): Optimize `dropUndefinedKeys` ([#15760](https://github.com/getsentry/sentry-javascript/pull/15760))
- feat(node): Add fastify `shouldHandleError` ([#15771](https://github.com/getsentry/sentry-javascript/pull/15771))
- fix(nuxt): Delete no longer needed Nitro 'close' hook ([#15790](https://github.com/getsentry/sentry-javascript/pull/15790))
- perf(nestjs): Remove usage of `addNonEnumerableProperty` ([#15766](https://github.com/getsentry/sentry-javascript/pull/15766))
- ref: Avoid some usage of `dropUndefinedKeys()` ([#15757](https://github.com/getsentry/sentry-javascript/pull/15757))
- ref: Remove some usages of `dropUndefinedKeys()` ([#15781](https://github.com/getsentry/sentry-javascript/pull/15781))
- ref(nextjs): Fix Next.js vercel-edge runtime package information ([#15789](https://github.com/getsentry/sentry-javascript/pull/15789))

## 9.8.0

- feat(node): Implement new continuous profiling API spec ([#15635](https://github.com/getsentry/sentry-javascript/pull/15635))
- feat(profiling): Add platform to chunk envelope ([#15758](https://github.com/getsentry/sentry-javascript/pull/15758))
- feat(react): Export captureReactException method ([#15746](https://github.com/getsentry/sentry-javascript/pull/15746))
- fix(node): Check for `res.end` before passing to Proxy ([#15776](https://github.com/getsentry/sentry-javascript/pull/15776))
- perf(core): Add short-circuits to `eventFilters` integration ([#15752](https://github.com/getsentry/sentry-javascript/pull/15752))
- perf(node): Short circuit flushing on Vercel only for Vercel ([#15734](https://github.com/getsentry/sentry-javascript/pull/15734))

## 9.7.0

- feat(core): Add `captureLog` method ([#15717](https://github.com/getsentry/sentry-javascript/pull/15717))
- feat(remix/cloudflare): Export `sentryHandleError` ([#15726](https://github.com/getsentry/sentry-javascript/pull/15726))
- fix(node): Always flush on Vercel before Lambda freeze ([#15602](https://github.com/getsentry/sentry-javascript/pull/15602))
- fix(node): Ensure incoming traces are propagated without HttpInstrumentation ([#15732](https://github.com/getsentry/sentry-javascript/pull/15732))
- fix(node): Use `fatal` level for unhandled rejections in `strict` mode ([#15720](https://github.com/getsentry/sentry-javascript/pull/15720))
- fix(nuxt): Delete Nuxt server template injection ([#15749](https://github.com/getsentry/sentry-javascript/pull/15749))

## 9.6.1

- feat(deps): bump @prisma/instrumentation from 6.4.1 to 6.5.0 ([#15714](https://github.com/getsentry/sentry-javascript/pull/15714))
- feat(deps): bump @sentry/cli from 2.42.2 to 2.42.3 ([#15711](https://github.com/getsentry/sentry-javascript/pull/15711))
- fix(nextjs): Re-patch router if it is overridden by Next.js ([#15721](https://github.com/getsentry/sentry-javascript/pull/15721))
- fix(nuxt): Add Nitro Rollup plugin to inject Sentry server config ([#15710](https://github.com/getsentry/sentry-javascript/pull/15710))
- chore(deps): Bump rollup to 4.35.0 ([#15651](https://github.com/getsentry/sentry-javascript/pull/15651))

## 9.6.0

### Important Changes

- **feat(tanstackstart): Add `@sentry/tanstackstart-react` package and make `@sentry/tanstackstart` package a utility package ([#15629](https://github.com/getsentry/sentry-javascript/pull/15629))**

  Since TanStack Start is supposed to be a generic framework that supports libraries like React and Solid, the `@sentry/tanstackstart` SDK package was renamed to `@sentry/tanstackstart-react` to reflect that the SDK is specifically intended to be used for React TanStack Start applications.
  Note that the TanStack Start SDK is still in alpha status and may be subject to breaking changes in non-major package updates.

### Other Changes

- feat(astro): Accept all vite-plugin options ([#15638](https://github.com/getsentry/sentry-javascript/pull/15638))
- feat(deps): bump @sentry/webpack-plugin from 3.2.1 to 3.2.2 ([#15627](https://github.com/getsentry/sentry-javascript/pull/15627))
- feat(tanstackstart): Refine initial API ([#15574](https://github.com/getsentry/sentry-javascript/pull/15574))
- fix(core): Ensure `fill` only patches functions ([#15632](https://github.com/getsentry/sentry-javascript/pull/15632))
- fix(nextjs): Consider `pageExtensions` when looking for instrumentation file ([#15701](https://github.com/getsentry/sentry-javascript/pull/15701))
- fix(remix): Null-check `options` ([#15610](https://github.com/getsentry/sentry-javascript/pull/15610))
- fix(sveltekit): Correctly parse angle bracket type assertions for auto instrumentation ([#15578](https://github.com/getsentry/sentry-javascript/pull/15578))
- fix(sveltekit): Guard process variable ([#15605](https://github.com/getsentry/sentry-javascript/pull/15605))

Work in this release was contributed by @angelikatyborska and @nwalters512. Thank you for your contributions!

## 9.5.0

### Important Changes

We found some issues with the new feedback screenshot annotation where screenshots are not being generated properly. Due to this issue, we are reverting the feature.

- Revert "feat(feedback) Allowing annotation via highlighting & masking ([#15484](https://github.com/getsentry/sentry-javascript/pull/15484))" (#15609)

### Other Changes

- Add cloudflare adapter detection and path generation ([#15603](https://github.com/getsentry/sentry-javascript/pull/15603))
- deps(nextjs): Bump rollup to `4.34.9` ([#15589](https://github.com/getsentry/sentry-javascript/pull/15589))
- feat(bun): Automatically add performance integrations ([#15586](https://github.com/getsentry/sentry-javascript/pull/15586))
- feat(replay): Bump rrweb to 2.34.0 ([#15580](https://github.com/getsentry/sentry-javascript/pull/15580))
- fix(browser): Call original function on early return from patched history API ([#15576](https://github.com/getsentry/sentry-javascript/pull/15576))
- fix(nestjs): Copy metadata in custom decorators ([#15598](https://github.com/getsentry/sentry-javascript/pull/15598))
- fix(react-router): Fix config type import ([#15583](https://github.com/getsentry/sentry-javascript/pull/15583))
- fix(remix): Use correct types export for `@sentry/remix/cloudflare` ([#15599](https://github.com/getsentry/sentry-javascript/pull/15599))
- fix(vue): Attach Pinia state only once per event ([#15588](https://github.com/getsentry/sentry-javascript/pull/15588))

Work in this release was contributed by @msurdi-a8c, @namoscato, and @rileyg98. Thank you for your contributions!

## 9.4.0

- feat(core): Add types for logs protocol and envelope ([#15530](https://github.com/getsentry/sentry-javascript/pull/15530))
- feat(deps): Bump `@sentry/cli` from 2.41.1 to 2.42.2 ([#15510](https://github.com/getsentry/sentry-javascript/pull/15510))
- feat(deps): Bump `@sentry/webpack-plugin` from 3.1.2 to 3.2.1 ([#15512](https://github.com/getsentry/sentry-javascript/pull/15512))
- feat(feedback) Allowing annotation via highlighting & masking ([#15484](https://github.com/getsentry/sentry-javascript/pull/15484))
- feat(nextjs): Add `use client` directive to client SDK entrypoints ([#15575](https://github.com/getsentry/sentry-javascript/pull/15575))
- feat(nextjs): Allow silencing of instrumentation warning ([#15555](https://github.com/getsentry/sentry-javascript/pull/15555))
- feat(sveltekit): Ensure `AsyncLocalStorage` async context strategy is used in Cloudflare Pages ([#15557](https://github.com/getsentry/sentry-javascript/pull/15557))
- fix(cloudflare): Make `@cloudflare/workers-types` an optional peer dependency ([#15554](https://github.com/getsentry/sentry-javascript/pull/15554))
- fix(core): Don't reverse values in event filters ([#15584](https://github.com/getsentry/sentry-javascript/pull/15584))
- fix(core): Handle normalization of null prototypes correctly ([#15556](https://github.com/getsentry/sentry-javascript/pull/15556))
- fix(nextjs): Only warn on missing `onRequestError` in version 15 ([#15553](https://github.com/getsentry/sentry-javascript/pull/15553))
- fix(node): Allow for `undefined` transport to be passed in ([#15560](https://github.com/getsentry/sentry-javascript/pull/15560))
- fix(wasm): Fix wasm integration stacktrace parsing for filename ([#15572](https://github.com/getsentry/sentry-javascript/pull/15572))
- perf(node): Store normalized request for processing ([#15570](https://github.com/getsentry/sentry-javascript/pull/15570))

## 9.3.0

### Important Changes

With this release we're publishing two new SDKs in **experimental alpha** stage:

- **feat(tanstackstart): Add TanStack Start SDK ([#15523](https://github.com/getsentry/sentry-javascript/pull/15523))**

For details please refer to the [README](https://github.com/getsentry/sentry-javascript/tree/develop/packages/tanstackstart)

- **feat(react-router): Add React Router SDK ([#15524](https://github.com/getsentry/sentry-javascript/pull/15524))**

For details please refer to the [README](https://github.com/getsentry/sentry-javascript/tree/develop/packages/react-router)

- **feat(remix): Add support for Hydrogen ([#15450](https://github.com/getsentry/sentry-javascript/pull/15450))**

This PR adds support for Shopify Hydrogen applications running on MiniOxygen runtime.

### Other Changes

- feat(core): Add `forceTransaction` to trpc middleware options ([#15519](https://github.com/getsentry/sentry-javascript/pull/15519))
- feat(core): Default filter unactionable error ([#15527](https://github.com/getsentry/sentry-javascript/pull/15527))
- feat(core): Rename `inboundFiltersIntegration` to `eventFiltersIntegration` ([#15434](https://github.com/getsentry/sentry-javascript/pull/15434))
- feat(deps): bump @prisma/instrumentation from 6.2.1 to 6.4.1 ([#15480](https://github.com/getsentry/sentry-javascript/pull/15480))
- feat(react-router): Add build-time config ([#15406](https://github.com/getsentry/sentry-javascript/pull/15406))
- feat(replay): Bump rrweb to 2.33.0 ([#15514](https://github.com/getsentry/sentry-javascript/pull/15514))
- fix(core): Fix `allowUrls` and `denyUrls` for linked and aggregate exceptions ([#15521](https://github.com/getsentry/sentry-javascript/pull/15521))
- fix(nextjs): Don't capture devmode server-action redirect errors ([#15485](https://github.com/getsentry/sentry-javascript/pull/15485))
- fix(nextjs): warn about missing onRequestError handler [#15488](https://github.com/getsentry/sentry-javascript/pull/15488))
- fix(nextjs): Prevent wrong culprit from showing up for clientside error events [#15475](https://github.com/getsentry/sentry-javascript/pull/15475))
- fix(nuxt): Ignore 300-400 status codes on app errors in Nuxt ([#15473](https://github.com/getsentry/sentry-javascript/pull/15473))
- fix(react): Add support for cross-usage of React Router instrumentations ([#15283](https://github.com/getsentry/sentry-javascript/pull/15283))
- fix(sveltekit): Guard `process` check when flushing events ([#15516](https://github.com/getsentry/sentry-javascript/pull/15516))

Work in this release was contributed by @GerryWilko and @leoambio. Thank you for your contributions!

## 9.2.0

### Important Changes

- **feat(node): Support Express v5 ([#15380](https://github.com/getsentry/sentry-javascript/pull/15380))**

This release adds full tracing support for Express v5, and improves tracing support for Nest.js 11 (which uses Express v5) in the Nest.js SDK.

- **feat(sveltekit): Add Support for Cloudflare ([#14672](https://github.com/getsentry/sentry-javascript/pull/14672))**

This release adds support for deploying SvelteKit applications to Cloudflare Pages.
A docs update with updated instructions will follow shortly.
Until then, you can give this a try by setting up the SvelteKit SDK as usual and then following the instructions outlined in the PR.

Thank you @SG60 for contributing this feature!

### Other Changes

- feat(core): Add `addLink(s)` to Sentry span ([#15452](https://github.com/getsentry/sentry-javascript/pull/15452))
- feat(core): Add links to span options ([#15453](https://github.com/getsentry/sentry-javascript/pull/15453))
- feat(deps): Bump @sentry/webpack-plugin from 2.22.7 to 3.1.2 ([#15328](https://github.com/getsentry/sentry-javascript/pull/15328))
- feat(feedback): Disable Feedback submit & cancel buttons while submitting ([#15408](https://github.com/getsentry/sentry-javascript/pull/15408))
- feat(nextjs): Add experimental flag to not strip origin information from different origin stack frames ([#15418](https://github.com/getsentry/sentry-javascript/pull/15418))
- feat(nuxt): Add `enableNitroErrorHandler` to server options ([#15444](https://github.com/getsentry/sentry-javascript/pull/15444))
- feat(opentelemetry): Add `addLink(s)` to span ([#15387](https://github.com/getsentry/sentry-javascript/pull/15387))
- feat(opentelemetry): Add `links` to span options ([#15403](https://github.com/getsentry/sentry-javascript/pull/15403))
- feat(replay): Expose rrweb recordCrossOriginIframes under \_experiments ([#14916](https://github.com/getsentry/sentry-javascript/pull/14916))
- fix(browser): Ensure that `performance.measure` spans have a positive duration ([#15415](https://github.com/getsentry/sentry-javascript/pull/15415))
- fix(bun): Includes correct sdk metadata ([#15459](https://github.com/getsentry/sentry-javascript/pull/15459))
- fix(core): Add Google `gmo` error to Inbound Filters ([#15432](https://github.com/getsentry/sentry-javascript/pull/15432))
- fix(core): Ensure `http.client` span descriptions don't contain query params or fragments ([#15404](https://github.com/getsentry/sentry-javascript/pull/15404))
- fix(core): Filter out unactionable Facebook Mobile browser error ([#15430](https://github.com/getsentry/sentry-javascript/pull/15430))
- fix(nestjs): Pin dependency on `@opentelemetry/instrumentation` ([#15419](https://github.com/getsentry/sentry-javascript/pull/15419))
- fix(nuxt): Only use filename with file extension from command ([#15445](https://github.com/getsentry/sentry-javascript/pull/15445))
- fix(nuxt): Use `SentryNuxtServerOptions` type for server init ([#15441](https://github.com/getsentry/sentry-javascript/pull/15441))
- fix(sveltekit): Avoid loading vite config to determine source maps setting ([#15440](https://github.com/getsentry/sentry-javascript/pull/15440))
- ref(profiling-node): Bump chunk interval to 60s ([#15361](https://github.com/getsentry/sentry-javascript/pull/15361))

Work in this release was contributed by @6farer, @dgavranic and @SG60. Thank you for your contributions!

## 9.1.0

- feat(browser): Add `graphqlClientIntegration` ([#13783](https://github.com/getsentry/sentry-javascript/pull/13783))
- feat(core): Allow for nested trpc context ([#15379](https://github.com/getsentry/sentry-javascript/pull/15379))
- feat(core): Create types and utilities for span links ([#15375](https://github.com/getsentry/sentry-javascript/pull/15375))
- feat(deps): bump @opentelemetry/instrumentation-pg from 0.50.0 to 0.51.0 ([#15273](https://github.com/getsentry/sentry-javascript/pull/15273))
- feat(node): Extract Sentry-specific node-fetch instrumentation ([#15231](https://github.com/getsentry/sentry-javascript/pull/15231))
- feat(vue): Support Pinia v3 ([#15383](https://github.com/getsentry/sentry-javascript/pull/15383))
- fix(sveltekit): Avoid request body double read errors ([#15368](https://github.com/getsentry/sentry-javascript/pull/15368))
- fix(sveltekit): Avoid top-level `vite` import ([#15371](https://github.com/getsentry/sentry-javascript/pull/15371))

Work in this release was contributed by @Zen-cronic and @filips-alpe. Thank you for your contribution!

## 9.0.1

- ref(flags): rename unleash integration param ([#15343](https://github.com/getsentry/sentry-javascript/pull/15343))

## 9.0.0

Version `9.0.0` marks a release of the Sentry JavaScript SDKs that contains breaking changes.
The goal of this release is to trim down on unused and potentially confusing APIs, prepare the SDKs for future framework versions to build deeper instrumentation, and remove old polyfills to reduce the packages' size.

### How To Upgrade

Please carefully read through the migration guide in the Sentry docs on how to upgrade from version 8 to version 9.
Make sure to select your specific platform/framework in the top left corner: https://docs.sentry.io/platforms/javascript/migration/v8-to-v9/

A comprehensive migration guide outlining all changes for all the frameworks can be found within the Sentry JavaScript SDK Repository: https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md

### Breaking Changes

- doc(deno)!: Make Deno v2 the minimum supported version (#15085)
- feat!: Bump typescript to `~5.0.0` (#14758)
- feat!: Drop `nitro-utils` package (#14998)
- feat!: Only collect ip addresses with `sendDefaultPii: true` (#15084)
- feat!: Remove `autoSessionTracking` option (#14802)
- feat!: Remove `enableTracing` (#15078)
- feat!: Remove `getCurrentHub()`, `Hub`, and `getCurrentHubShim()` (#15122)
- feat!: Remove `spanId` from propagation context (#14733)
- feat!: Remove deprecated and unused code (#15077)
- feat!: Remove metrics API from the JS SDK (#14745)
- feat!: Require Node `>=18` as minimum supported version (#14749)
- feat(astro)!: Respect user-specified source map setting (#14941)
- feat(browser)!: Remove `captureUserFeedback` method (#14820)
- feat(build)!: Drop pre-ES2020 polyfills (#14882)
- feat(core)!: Add `normalizedRequest` to `samplingContext` (#14902)
- feat(core)!: Always use session from isolation scope (#14860)
- feat(core)!: Pass root spans to `beforeSendSpan` and disallow returning `null` (#14831)
- feat(core)!: Remove `BAGGAGE_HEADER_NAME` export (#14785)
- feat(core)!: Remove `TransactionNamingScheme` type (#14865)
- feat(core)!: Remove `addOpenTelemetryInstrumentation` method (#14792)
- feat(core)!: Remove `arrayify` method (#14782)
- feat(core)!: Remove `debugIntegration` and `sessionTimingIntegration` (#14747)
- feat(core)!: Remove `flatten` method (#14784)
- feat(core)!: Remove `getDomElement` method (#14797)
- feat(core)!: Remove `makeFifoCache` method (#14786)
- feat(core)!: Remove `memoBuilder` export & `WeakSet` fallback (#14859)
- feat(core)!: Remove `transactionContext` from `samplingContext` (#14904)
- feat(core)!: Remove `urlEncode` method (#14783)
- feat(core)!: Remove deprecated `Request` type (#14858)
- feat(core)!: Remove deprecated request data methods (#14896)
- feat(core)!: Remove standalone `Client` interface & deprecate `BaseClient` (#14800)
- feat(core)!: Remove validSeverityLevels export (#14765)
- feat(core)!: Stop accepting `event` as argument for `recordDroppedEvent` (#14999)
- feat(core)!: Stop setting user in `requestDataIntegration` (#14898)
- feat(core)!: Type sdkProcessingMetadata more strictly (#14855)
- feat(core)!: Update `hasTracingEnabled` to consider empty trace config (#14857)
- feat(core)!: Update `requestDataIntegration` handling (#14806)
- feat(deno)!: Remove deno prepack (#14829)
- feat(ember)!: Officially drop support for ember `<=3.x` (#15032)
- feat(nestjs)!: Move `nestIntegration` into nest sdk and remove `setupNestErrorHandler` (#14751)
- feat(nestjs)!: Remove `@WithSentry` decorator (#14762)
- feat(nestjs)!: Remove `SentryService` (#14759)
- feat(nextjs)!: Don't rely on Next.js Build ID for release names (#14939)
- feat(nextjs)!: Remove `experimental_captureRequestError` (#14607)
- feat(nextjs)!: Respect user-provided source map generation settings (#14956)
- feat(node)!: Add support for Prisma v6 and drop v5 support (#15120)
- feat(node)!: Avoid http spans by default for custom OTEL setups (#14678)
- feat(node)!: Collect request sessions via HTTP instrumentation (#14658)
- feat(node)!: Remove `processThreadBreadcrumbIntegration` (#14666)
- feat(node)!: Remove fine grained `registerEsmLoaderHooks` (#15002)
- feat(opentelemetry)!: Exclusively pass root spans through sampling pipeline (#14951)
- feat(pinia)!: Include state of all stores in breadcrumb (#15312)
- feat(react)!: Raise minimum supported TanStack Router version to `1.63.0` (#15030)
- feat(react)!: Remove deprecated `getNumberOfUrlSegments` method (#14744)
- feat(react)!: Remove deprecated react router methods (#14743)
- feat(react)!: Update `ErrorBoundary` `componentStack` type (#14742)
- feat(remix)!: Drop support for Remix v1 (#14988)
- feat(remix)!: Remove `autoInstrumentRemix` option (#15074)
- feat(solidstart)!: Default to `--import` setup and add `autoInjectServerSentry` (#14862)
- feat(solidstart)!: No longer export `sentrySolidStartVite` (#15143)
- feat(solidstart)!: Respect user-provided source map setting (#14979)
- feat(svelte)!: Disable component update tracking by default (#15265)
- feat(sveltekit)!: Drop support for SvelteKit @1.x (#15037)
- feat(sveltekit)!: Remove `fetchProxyScriptNonce` option (#15123)
- feat(sveltekit)!: Respect user-provided source map generation settings (#14886)
- feat(utils)!: Remove `@sentry/utils` package (#14830)
- feat(vue)!: Remove configuring Vue tracing options anywhere else other than through the `vueIntegration`'s `tracingOptions` option (#14856)
- feat(vue/nuxt)!: No longer create `"update"` spans for component tracking by default (#14602)
- fix(node)!: Fix name of `vercelAIIntegration` to `VercelAI` (#15298)
- fix(vue)!: Remove `logError` from `vueIntegration` (#14958)
- ref!: Don't polyfill optional chaining and nullish coalescing (#14603)
- ref(core)!: Cleanup internal types, including `ReportDialogOptions` (#14861)
- ref(core)!: Mark exceptions from `captureConsoleIntegration` as `handled: true` by default (#14734)
- ref(core)!: Move `shutdownTimeout` option type from core to node (#15217)
- ref(core)!: Remove `Scope` type interface in favor of using `Scope` class (#14721)
- ref(core)!: Remove backwards compatible SentryCarrier type (#14697)

### Other Changes

- chore(browser): Export ipAddress helpers for use in other SDKs (#15079)
- deps(node): Bump `import-in-the-middle` to `1.12.0` (#14796)
- feat(aws): Rename AWS lambda layer name to `SentryNodeServerlessSDKv9` (#14927)
- feat(aws-serverless): Upgrade OTEL deps (#15091)
- feat(browser): Set `user.ip_address` explicitly to `{{auto}}` (#15008)
- feat(core): Add `inheritOrSampleWith` helper to `traceSampler` (#15277)
- feat(core): Emit client reports for unsampled root spans on span start (#14936)
- feat(core): Rename `hasTracingEnabled` to `hasSpansEnabled` (#15309)
- feat(core): Streamline `SpanJSON` type (#14693)
- feat(deno): Don't bundle `@sentry/deno` (#15014)
- feat(deno): Don't publish to `deno.land` (#15016)
- feat(deno): Stop inlining types from core (#14729)
- feat(deps): Bump @opentelemetry/instrumentation-amqplib from 0.45.0 to 0.46.0 (#14835)
- feat(deps): Bump @opentelemetry/instrumentation-aws-lambda from 0.49.0 to 0.50.0 (#14833)
- feat(deps): Bump @opentelemetry/instrumentation-express from 0.46.0 to 0.47.0 (#14834)
- feat(deps): Bump @opentelemetry/instrumentation-mysql2 from 0.44.0 to 0.45.0 (#14836)
- feat(deps): Bump @opentelemetry/propagation-utils from 0.30.14 to 0.30.15 (#14832)
- feat(deps): bump @opentelemetry/context-async-hooks from 1.29.0 to 1.30.0 (#14869)
- feat(deps): bump @opentelemetry/instrumentation-generic-pool from 0.42.0 to 0.43.0 (#14870)
- feat(deps): bump @opentelemetry/instrumentation-knex from 0.43.0 to 0.44.0 (#14872)
- feat(deps): bump @opentelemetry/instrumentation-mongodb from 0.50.0 to 0.51.0 (#14871)
- feat(deps): bump @opentelemetry/instrumentation-tedious from 0.17.0 to 0.18.0 (#14868)
- feat(deps): bump @sentry/cli from 2.39.1 to 2.41.1 (#15173)
- feat(flags): Add Statsig browser integration (#15319)
- feat(gatsby): Preserve user-provided source map settings (#15006)
- feat(nestjs): Remove `SentryTracingInterceptor`, `SentryGlobalGraphQLFilter`, `SentryGlobalGenericFilter` (#14761)
- feat(nextjs): Directly forward `sourcemaps.disable` to webpack plugin (#15109)
- feat(node): Add `processSessionIntegration` (#15081)
- feat(node): Add missing `vercelAIIntegration` export (#15318)
- feat(node): Capture exceptions from `worker_threads` (#15105)
- feat(nuxt): Add enabled to disable Sentry module (#15337)
- feat(nuxt): add `silent`, `errorHandler`, `release` to `SourceMapsOptions` (#15246)
- feat(profiling-node): Use `@sentry-internal/node-cpu-profiler` (#15208)
- feat(replay): Update fflate to 0.8.2 (#14867)
- feat(solidstart): Add `autoInjectServerSentry: 'experimental_dynamic-import` (#14863)
- feat(sveltekit): Only inject fetch proxy script for SvelteKit < 2.16.0 (#15126)
- feat(user feedback): Adds draw tool for UF screenshot annotations (#15062)
- feat(user feedback): Adds toolbar for cropping and annotating (#15282)
- feat: Avoid class fields all-together (#14887)
- feat: Only emit `__esModule` properties in CJS modules when there is a default export (#15018)
- feat: Pass `parentSampleRate` to `tracesSampler` (#15024)
- feat: Propagate and use a sampling random (#14989)
- fix(browser): Remove `browserPerformanceTimeOrigin` side-effects (#14025)
- fix(core): Ensure debugIds are applied to all exceptions in an event (#14881)
- fix(core): Fork scope if custom scope is passed to `startSpanManual` (#14901)
- fix(core): Fork scope if custom scope is passed to `startSpan` (#14900)
- fix(core): Only fall back to `sendDefaultPii` for IP collection in `requestDataIntegration` (#15125)
- fix(nextjs): Flush with `waitUntil` in `captureRequestError` (#15146)
- fix(nextjs): Use batched devserver symbolication endpoint (#15335)
- fix(node): Don't leak `__span` property into breadcrumbs (#14798)
- fix(node): Fix sample rand propagation for negative sampling decisions (#15045)
- fix(node): Missing `release` from ANR sessions (#15138)
- fix(node): Set the correct fallback URL fields for outgoing https requests if they are not defined (#15316)
- fix(nuxt): Detect Azure Function runtime for flushing with timeout (#15288)
- fix(react): From location can be undefined in Tanstack Router Instrumentation (#15235)
- fix(react): Import default for hoistNonReactStatics (#15238)
- fix(react): Support lazy-loaded routes and components. (#15039)
- fix(solidstart): Do not copy release-injection map file (#15302)
- ref(browser): Improve active span handling for `browserTracingIntegration` (#14959)
- ref(browser): Improve setting of propagation scope for navigation spans (#15108)
- ref(browser): Skip browser extension warning in non-debug builds (#15310)
- ref(browser): Update `supportsHistory` check & history usage (#14696)
- ref(core): Ensure non-recording root spans have frozen DSC (#14964)
- ref(core): Log debug message when capturing error events (#14701)
- ref(core): Move log message about invalid sample rate (#15215)
- ref(node): Streamline check for adding performance integrations (#15021)
- ref(react): Adapt tanstack router type (#15241)
- ref(svelte): Remove SvelteKit detection (#15313)
- ref(sveltekit): Clean up sub-request check (#15251)

Work in this release was contributed by @aloisklink, @arturovt, @aryanvdesh, @benjick, @chris-basebone, @davidturissini, @GrizliK1988, @jahands, @jrandolf, @kunal-511, @maximepvrt, @maxmaxme, @mstrokin, @nathankleyn, @nwalters512, @tannerlinsley, @tjhiggins, and @Zen-cronic. Thank you for your contributions!

## 9.0.0-alpha.2

This is an alpha release of the upcoming major release of version 9.
This release does not yet entail a comprehensive changelog as version 9 is not yet stable.

For this release's iteration of the migration guide, see the [Migration Guide as per `9.0.0-alpha.2`](https://github.com/getsentry/sentry-javascript/blob/fbedd59954d378264d11b879b6eb2a482fbc0d1b/MIGRATION.md).
Please note that the migration guide is work in progress and subject to change.

## 9.0.0-alpha.1

This is an alpha release of the upcoming major release of version 9.
This release does not yet entail a comprehensive changelog as version 9 is not yet stable.

For this release's iteration of the migration guide, see the [Migration Guide as per `9.0.0-alpha.1`](https://github.com/getsentry/sentry-javascript/blob/e4333e5ce2d65be319ee6a5a5976f7c93983a417/docs/migration/v8-to-v9.md).
Please note that the migration guide is work in progress and subject to change.

## 9.0.0-alpha.0

This is an alpha release of the upcoming major release of version 9.
This release does not yet entail a comprehensive changelog as version 9 is not yet stable.

For this release's iteration of the migration guide, see the [Migration Guide as per `9.0.0-alpha.0`](https://github.com/getsentry/sentry-javascript/blob/6e4b593adcc4ce951afa8ae0cda0605ecd226cda/docs/migration/v8-to-v9.md).
Please note that the migration guide is work in progress and subject to change.

## 8.x

A full list of changes in the `8.x` release of the SDK can be found in the [8.x Changelog](./docs/changelog/v8.md).

## 7.x

A full list of changes in the `7.x` release of the SDK can be found in the [7.x Changelog](./docs/changelog/v7.md).

## 6.x

A full list of changes in the `6.x` release of the SDK can be found in the [6.x Changelog](./docs/changelog/v6.md).

## 5.x

A full list of changes in the `5.x` release of the SDK can be found in the [5.x Changelog](./docs/changelog/v5.md).

## 4.x

A full list of changes in the `4.x` release of the SDK can be found in the [4.x Changelog](./docs/changelog/v4.md).
