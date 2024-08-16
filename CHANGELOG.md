# Changelog

<!-- prettier-ignore-start -->
> [!IMPORTANT]
> If you are upgrading to the `8.x` versions of the SDK from `7.x` or below, make sure you follow our
> [migration guide](https://docs.sentry.io/platforms/javascript/migration/) first.
<!-- prettier-ignore-end -->

## Unreleased

- "You miss 100 percent of the chances you don't take. — Wayne Gretzky" — Michael Scott

Work in this release was contributed by @charpeni. Thank you for your contribution!

## 8.26.0

### Important Changes

- **feat(node): Add `fsInstrumentation` (#13291)**

  This release adds `fsIntegration`, an integration that instruments the `fs` API to the Sentry Node SDK. The
  integration creates spans with naming patterns of `fs.readFile`, `fs.unlink`, and so on.

  This integration is not enabled by default and needs to be registered in your `Sentry.init` call. You can configure
  via options whether to include path arguments or error messages as span attributes when an fs call fails:

  ```js
  Sentry.init({
    integrations: [
      Sentry.fsIntegration({
        recordFilePaths: true,
        recordErrorMessagesAsSpanAttributes: true,
      }),
    ],
  });
  ```

  **WARNING:** This integration may add significant overhead to your application. Especially in scenarios with a lot of
  file I/O, like for example when running a framework dev server, including this integration can massively slow down
  your application.

### Other Changes

- feat(browser): Add spotlightBrowser integration (#13263)
- feat(browser): Allow sentry in safari extension background page (#13209)
- feat(browser): Send CLS as standalone span (experimental) (#13056)
- feat(core): Add OpenTelemetry-specific `getTraceData` implementation (#13281)
- feat(nextjs): Always add `browserTracingIntegration` (#13324)
- feat(nextjs): Always transmit trace data to the client (#13337)
- feat(nextjs): export SentryBuildOptions (#13296)
- feat(nextjs): Update `experimental_captureRequestError` to reflect `RequestInfo.path` change in Next.js canary
  (#13344)

- feat(nuxt): Always add tracing meta tags (#13273)
- feat(nuxt): Set transaction name for server error (#13292)
- feat(replay): Add a replay-specific logger (#13256)
- feat(sveltekit): Add bundle size optimizations to plugin options (#13318)
- feat(sveltekit): Always add browserTracingIntegration (#13322)
- feat(tracing): Make long animation frames opt-out (#13255)
- fix(astro): Correctly extract request data (#13315)
- fix(astro): Only track access request headers in dynamic page requests (#13306)
- fix(nuxt): Add import line for disabled `autoImport` (#13342)
- fix(nuxt): Add vue to excludeEsmLoaderHooks array (#13346)
- fix(opentelemetry): Do not overwrite http span name if kind is internal (#13282)
- fix(remix): Ensure `origin` is correctly set for remix server spans (#13305)

Work in this release was contributed by @MonstraG, @undead-voron and @Zen-cronic. Thank you for your contributions!

## 8.25.0

### Important Changes

- **Alpha release of Official Solid Start SDK**

This release contains the alpha version of `@sentry/solidstart`, our SDK for [Solid Start](https://start.solidjs.com/)!
For details on how to use it, please see the [README](./packages/solidstart/README.md). Any feedback/bug reports are
greatly appreciated, please [reach out on GitHub](https://github.com/getsentry/sentry-javascript/issues/12538).

### Other Changes

- feat(astro): Add `bundleSizeOptimizations` vite options to integration (#13250)
- feat(astro): Always add BrowserTracing (#13244)
- feat(core): Add `getTraceMetaTags` function (#13201)
- feat(nestjs): Automatic instrumentation of nestjs exception filters (#13230)
- feat(node): Add `useOperationNameForRootSpan` to`graphqlIntegration` (#13248)
- feat(sveltekit): Add `wrapServerRouteWithSentry` wrapper (#13247)
- fix(aws-serverless): Extract sentry trace data from handler `context` over `event` (#13266)
- fix(browser): Initialize default integration if `defaultIntegrations: undefined` (#13261)
- fix(utils): Streamline IP capturing on incoming requests (#13272)

## 8.24.0

- feat(nestjs): Filter RPC exceptions (#13227)
- fix: Guard getReader function for other fetch implementations (#13246)
- fix(feedback): Ensure feedback can be lazy loaded in CDN bundles (#13241)

## 8.23.0

### Important Changes

- **feat(cloudflare): Add Cloudflare D1 instrumentation (#13142)**

This release includes support for Cloudflare D1, Cloudflare's serverless SQL database. To instrument your Cloudflare D1
database, use the `instrumentD1WithSentry` method as follows:

```ts
// env.DB is the D1 DB binding configured in your `wrangler.toml`
const db = instrumentD1WithSentry(env.DB);
// Now you can use the database as usual
await db.prepare('SELECT * FROM table WHERE id = ?').bind(1).run();
```

### Other Changes

- feat(cloudflare): Allow users to pass handler to sentryPagesPlugin (#13192)
- feat(cloudflare): Instrument scheduled handler (#13114)
- feat(core): Add `getTraceData` function (#13134)
- feat(nestjs): Automatic instrumentation of nestjs interceptors before route execution (#13153)
- feat(nestjs): Automatic instrumentation of nestjs pipes (#13137)
- feat(nuxt): Filter out Nuxt build assets (#13148)
- feat(profiling): Attach sdk info to chunks (#13145)
- feat(solidstart): Add sentry `onBeforeResponse` middleware to enable distributed tracing (#13221)
- feat(solidstart): Filter out low quality transactions for build assets (#13222)
- fix(browser): Avoid showing browser extension error message in non-`window` global scopes (#13156)
- fix(feedback): Call dialog.close() in dialog close callbacks in `\_loadAndRenderDialog` (#13203)
- fix(nestjs): Inline Observable type to resolve missing 'rxjs' dependency (#13166)
- fix(nuxt): Detect pageload by adding flag in Vue router (#13171)
- fix(utils): Handle when requests get aborted in fetch instrumentation (#13202)
- ref(browser): Improve browserMetrics collection (#13062)

Work in this release was contributed by @horochx. Thank you for your contribution!

## 8.22.0

### Important Changes

- **feat(cloudflare): Add plugin for cloudflare pages (#13123)**

This release adds support for Cloudflare Pages to `@sentry/cloudflare`, our SDK for the
[Cloudflare Workers JavaScript Runtime](https://developers.cloudflare.com/workers/)! For details on how to use it,
please see the [README](./packages/cloudflare/README.md). Any feedback/bug reports are greatly appreciated, please
[reach out on GitHub](https://github.com/getsentry/sentry-javascript/issues/12620).

```javascript
// functions/_middleware.js
import * as Sentry from '@sentry/cloudflare';

export const onRequest = Sentry.sentryPagesPlugin({
  dsn: __PUBLIC_DSN__,
  // Set tracesSampleRate to 1.0 to capture 100% of spans for tracing.
  tracesSampleRate: 1.0,
});
```

### Other Changes

- feat(meta-sdks): Remove runtime tags (#13105)
- feat(nestjs): Automatic instrumentation of nestjs guards (#13129)
- feat(nestjs): Filter all HttpExceptions (#13120)
- feat(replay): Capture exception when `internal_sdk_error` client report happens (#13072)
- fix: Use `globalThis` for code injection (#13132)

## 8.21.0

### Important Changes

- **Alpha release of Official Cloudflare SDK**
  - feat(cloudflare): Add `withSentry` method (#13025)
  - feat(cloudflare): Add cloudflare sdk scaffolding (#12953)
  - feat(cloudflare): Add basic cloudflare package and tests (#12861)

This release contains the alpha version of `@sentry/cloudflare`, our SDK for the
[Cloudflare Workers JavaScript Runtime](https://developers.cloudflare.com/workers/)! For details on how to use it,
please see the [README](./packages/cloudflare/README.md). Any feedback/bug reports are greatly appreciated, please
[reach out on GitHub](https://github.com/getsentry/sentry-javascript/issues/12620).

Please note that only Cloudflare Workers are tested and supported - official Cloudflare Pages support will come in an
upcoming release.

### Other Changes

- feat(feedback): Make cropped screenshot area draggable (#13071)
- feat(core): Adapt spans for client-side fetch to streaming responses (#12723)
- feat(core): Capture # of dropped spans through `beforeSendTransaction` (#13022)
- feat(deps): bump `@opentelemetry/instrumentation-aws-sdk` from 0.43.0 to 0.43.1 (#13089)
- feat(deps): bump `@opentelemetry/instrumentation-express` from 0.41.0 to 0.41.1 (#13090)
- feat(nestjs): Automatic instrumentation of nestjs middleware (#13065)
- feat(node): Upgrade `import-in-the-middle` to 1.11.0 (#13107)
- feat(nuxt): Add connected tracing meta tags (#13098)
- feat(nuxt): Add vue-router instrumentation (#13054)
- feat(solidstart): Add server action instrumentation helper (#13035)
- fix(feedback): Ensure pluggable feedback CDN bundle is correctly built (#13081)
- fix(nextjs): Only delete clientside bundle source maps with `sourcemaps.deleteFilesAfterUpload` (#13102)
- fix(node): Improve OTEL validation logic (#13079)

## 8.20.0

### Important Changes

- **feat(node): Allow to pass `registerEsmLoaderHooks` to preload (#12998)**

You can write your own custom preload script and configure this in the preload options. `registerEsmLoaderHooks` can be
passed as an option to `preloadOpenTelemetry`, which allows to exclude/include packages in the preload.

- **fix(node): Do not emit fetch spans when tracing is disabled (#13003)**

Sentry will not emit "fetch" spans if tracing is disabled. This is relevant for user who use their own sampler.

### Other Changes

- feat(feedback): Trigger button aria label configuration (#13008)
- feat(nestjs): Change nest sdk setup (#12920)
- feat(node): Extend ESM hooks options for iitm v1.10.0 (#13016)
- feat(node): Send client reports (#12951)
- feat(nuxt): Automatically add BrowserTracing (#13005)
- feat(nuxt): Setup source maps with vite config (#13018)
- feat(replay): Improve public Replay APIs (#13000)

## 8.19.0

- feat(core): Align Span interface with OTEL (#12898)
- fix(angular): Remove `afterSendEvent` listener once root injector is destroyed (#12786)
- fix(browser): Fix bug causing unintentional dropping of transactions (#12933)
- fix(feedback): Add a missing call of Actor.appendToDom method when DOMContentLoaded event is triggered (#12973)
- feat(vercel-edge): Add dedupe as default integration (#12957)
- fix(node): Pass inferred name & attributes to `tracesSampler` (#12945)
- feat(express): Allow to pass options to `setupExpressErrorHandler` (#12952)

Work in this release was contributed by @jaspreet57 and @arturovt. Thank you for your contribution!

## 8.18.0

### Important Changes

- **ref: Deprecate `enableTracing` (12897)**

The `enableTracing` option has been deprecated and will be removed in the next major version. We recommend removing it
in favor of the `tracesSampleRate` and `tracesSampler` options. If you want to enable performance monitoring, please set
the `tracesSampleRate` to a sample rate of your choice, or provide a sampling function as `tracesSampler` option
instead. If you want to disable performance monitoring, remove the `tracesSampler` and `tracesSampleRate` options.

### Other Changes

- feat(node): Expose `exclude` and `include` options for ESM loader (#12910)
- feat(browser): Add user agent to INP standalone span attributes (#12896)
- feat(nextjs): Add `experimental_captureRequestError` for `onRequestError` hook (#12885)
- feat(replay): Bump `rrweb` to 2.25.0 (#12478)
- feat(tracing): Add long animation frame tracing (#12646)
- fix: Cleanup hooks when they are not used anymore (#12852)
- fix(angular): Guard `ErrorEvent` check in ErrorHandler to avoid throwing in Node environments (#12892)
- fix(inp): Ensure INP spans have correct transaction (#12871)
- fix(nestjs): Do not make SentryTraced() decorated functions async (#12879)
- fix(nextjs): Support automatic instrumentation for app directory with custom page extensions (#12858)
- fix(node): Ensure correct URL is passed to `ignoreIncomingRequests` callback (#12929)
- fix(otel): Do not add `otel.kind: INTERNAL` attribute (#12841)
- fix(solidstart): Set proper sentry origin for solid router integration when used in solidstart sdk (#12919)
- fix(sveltekit): Add Vite peer dep for proper type resolution (#12926)
- fix(tracing): Ensure you can pass `null` as `parentSpan` in `startSpan*` (#12928)
- ref(core): Small bundle size improvement (#12830)

Work in this release was contributed by @GitSquared, @ziyadkhalil and @mcous. Thank you for your contributions!

## 8.17.0

- feat: Upgrade OTEL deps (#12809)
- fix(nuxt): Add module to build:transpile script (#12843)
- fix(browser): Allow SDK initialization in NW.js apps (#12846)

## 8.16.0

### Important Changes

- **feat(nextjs): Use spans generated by Next.js for App Router (#12729)**

Previously, the `@sentry/nextjs` SDK automatically recorded spans in the form of transactions for each of your top-level
server components (pages, layouts, ...). This approach had a few drawbacks, the main ones being that traces didn't have
a root span, and more importantly, if you had data stream to the client, its duration was not captured because the
server component spans had finished before the data could finish streaming.

With this release, we will capture the duration of App Router requests in their entirety as a single transaction with
server component spans being descendants of that transaction. This means you will get more data that is also more
accurate. Note that this does not apply to the Edge runtime. For the Edge runtime, the SDK will emit transactions as it
has before.

Generally speaking, this change means that you will see less _transactions_ and more _spans_ in Sentry. You will no
longer receive server component transactions like `Page Server Component (/path/to/route)` (unless using the Edge
runtime), and you will instead receive transactions for your App Router SSR requests that look like
`GET /path/to/route`.

If you are on Sentry SaaS, this may have an effect on your quota consumption: Less transactions, more spans.

- **- feat(nestjs): Add nest cron monitoring support (#12781)**

The `@sentry/nestjs` SDK now includes a `@SentryCron` decorator that can be used to augment the native NestJS `@Cron`
decorator to send check-ins to Sentry before and after each cron job run:

```typescript
import { Cron } from '@nestjs/schedule';
import { SentryCron, MonitorConfig } from '@sentry/nestjs';
import type { MonitorConfig } from '@sentry/types';

const monitorConfig: MonitorConfig = {
  schedule: {
    type: 'crontab',
    value: '* * * * *',
  },
  checkinMargin: 2, // In minutes. Optional.
  maxRuntime: 10, // In minutes. Optional.
  timezone: 'America/Los_Angeles', // Optional.
};

export class MyCronService {
  @Cron('* * * * *')
  @SentryCron('my-monitor-slug', monitorConfig)
  handleCron() {
    // Your cron job logic here
  }
}
```

### Other Changes

- feat(node): Allow to pass instrumentation config to `httpIntegration` (#12761)
- feat(nuxt): Add server error hook (#12796)
- feat(nuxt): Inject sentry config with Nuxt `addPluginTemplate` (#12760)
- fix: Apply stack frame metadata before event processors (#12799)
- fix(feedback): Add missing `h` import in `ScreenshotEditor` (#12784)
- fix(node): Ensure `autoSessionTracking` is enabled by default (#12790)
- ref(feedback): Let CropCorner inherit the existing h prop (#12814)
- ref(otel): Ensure we never swallow args for ContextManager (#12798)

## 8.15.0

- feat(core): allow unregistering callback through `on` (#11710)
- feat(nestjs): Add function-level span decorator to nestjs (#12721)
- feat(otel): Export & use `spanTimeInputToSeconds` for otel span exporter (#12699)
- fix(core): Pass origin as referrer for `lazyLoadIntegration` (#12766)
- fix(deno): Publish from build directory (#12773)
- fix(hapi): Specify error channel to filter boom errors (#12725)
- fix(react): Revert back to `jsxRuntime: 'classic'` to prevent breaking react 17 (#12775)
- fix(tracing): Report dropped spans for transactions (#12751)
- ref(scope): Delete unused public `getStack()` (#12737)

Work in this release was contributed by @arturovt and @jaulz. Thank you for your contributions!

## 8.14.0

### Important Changes

- **feat(nestjs): Filter 4xx errors (#12695)**

The `@sentry/nestjs` SDK no longer captures 4xx errors automatically.

### Other Changes

- chore(react): Remove private namespace `JSX` (#12691)
- feat(deps): bump @opentelemetry/propagator-aws-xray from 1.25.0 to 1.25.1 (#12719)
- feat(deps): bump @prisma/instrumentation from 5.16.0 to 5.16.1 (#12718)
- feat(node): Add `registerEsmLoaderHooks` option (#12684)
- feat(opentelemetry): Expose sampling helper (#12674)
- fix(browser): Make sure measure spans have valid start timestamps (#12648)
- fix(hapi): Widen type definitions (#12710)
- fix(nextjs): Attempt to ignore critical dependency warnings (#12694)
- fix(react): Fix React jsx runtime import for esm (#12740)
- fix(replay): Start replay in `afterAllSetup` instead of next tick (#12709)

Work in this release was contributed by @quisido. Thank you for your contribution!

## 8.13.0

### Important Changes

- **feat(nestjs): Add Nest SDK** This release adds a dedicated SDK for [NestJS](https://nestjs.com/) (`@sentry/nestjs`)
  in alpha state. The SDK is a drop-in replacement for the Sentry Node SDK (`@sentry/node`) supporting the same set of
  features. See the [docs](https://docs.sentry.io/platforms/javascript/guides/nestjs/) for how to use the SDK.

### Other Changes

- deps: Bump bundler plugins to `2.20.1` (#12641)
- deps(nextjs): Remove react peer dep and allow rc (#12670)
- feat: Update OTEL deps (#12635)
- feat(deps): bump @prisma/instrumentation from 5.15.0 to 5.15.1 (#12627)
- feat(node): Add context info for missing instrumentation (#12639)
- fix(feedback): Improve feedback error message (#12647)

## 8.12.0

### Important Changes

- **feat(solid): Remove need to pass router hooks to solid integration** (breaking)

This release introduces breaking changes to the `@sentry/solid` package (which is currently out in alpha).

We've made it easier to get started with the solid router integration by removing the need to pass **use\*** hooks
explicitly to `solidRouterBrowserTracingIntegration`. Import `solidRouterBrowserTracingIntegration` from
`@sentry/solid/solidrouter` and add it to `Sentry.init`

```js
import * as Sentry from '@sentry/solid';
import { solidRouterBrowserTracingIntegration, withSentryRouterRouting } from '@sentry/solid/solidrouter';
import { Router } from '@solidjs/router';

Sentry.init({
  dsn: '__PUBLIC_DSN__',
  integrations: [solidRouterBrowserTracingIntegration()],
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
});

const SentryRouter = withSentryRouterRouting(Router);
```

- **feat(core): Return client from init method (#12585)**

`Sentry.init()` now returns a client directly, so you don't need to explicitly call `getClient()` anymore:

```js
const client = Sentry.init();
```

- **feat(nextjs): Add `deleteSourcemapsAfterUpload` option (#12457)**

This adds an easy way to delete sourcemaps immediately after uploading them:

```js
module.exports = withSentryConfig(nextConfig, {
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
```

- **feat(node): Allow to configure `maxSpanWaitDuration` (#12610)**

Adds configuration option for the max. duration in seconds that the SDK will wait for parent spans to be finished before
discarding a span. The SDK will automatically clean up spans that have no finished parent after this duration. This is
necessary to prevent memory leaks in case of parent spans that are never finished or otherwise dropped/missing. However,
if you have very long-running spans in your application, a shorter duration might cause spans to be discarded too early.
In this case, you can increase this duration to a value that fits your expected data.

### Other Changes

- feat(feedback): Extra check for iPad in screenshot support (#12593)
- fix(bundle): Ensure CDN bundles do not overwrite `window.Sentry` (#12580)
- fix(feedback): Inject preact from feedbackModal into feedbackScreenshot integration (#12535)
- fix(node): Re-throw errors from koa middleware (#12609)
- fix(remix): Mark `isRemixV2` as optional in exposed types. (#12614)
- ref(node): Add error message to NodeFetch log (#12612)

Work in this release was contributed by @n4bb12. Thank you for your contribution!

## 8.11.0

### Important Changes

- **feat(core): Add `parentSpan` option to `startSpan*` APIs (#12567)**

We've made it easier to create a span as a child of a specific span via the startSpan\* APIs. This should allow you to
explicitly manage the parent-child relationship of your spans better.

```js
Sentry.startSpan({ name: 'root' }, parent => {
  const span = Sentry.startInactiveSpan({ name: 'xxx', parentSpan: parent });

  Sentry.startSpan({ name: 'xxx', parentSpan: parent }, () => {});

  Sentry.startSpanManual({ name: 'xxx', parentSpan: parent }, () => {});
});
```

### Other Changes

- feat(node): Detect release from more providers (#12529)
- fix(profiling-node): Use correct getGlobalScope import (#12564)
- fix(profiling-node) sample timestamps need to be in seconds (#12563)
- ref: Align `@sentry/node` exports from framework SDKs. (#12589)

## 8.10.0

### Important Changes

- **feat(remix): Migrate to `opentelemetry-instrumentation-remix`. (#12110)**

You can now simplify your remix instrumentation by opting-in like this:

```js
const Sentry = require('@sentry/remix');

Sentry.init({
  dsn: YOUR_DSN
  // opt-in to new auto instrumentation
  autoInstrumentRemix: true,
});
```

With this setup, you do not need to add e.g. `wrapExpressCreateRequestHandler` anymore. Additionally, the quality of the
captured data improves. The old way to use `@sentry/remix` continues to work, but it is encouraged to use the new setup.

### Other Changes

- feat(browser): Export `thirdPartyErrorFilterIntegration` from `@sentry/browser` (#12512)
- feat(feedback): Allow passing `tags` field to any feedback config param (#12197)
- feat(feedback): Improve screenshot quality for retina displays (#12487)
- feat(feedback): Screenshots don't resize after cropping (#12481)
- feat(node) add max lineno and colno limits (#12514)
- feat(profiling) add global profile context while profiler is running (#12394)
- feat(react): Add React version to events (#12390)
- feat(replay): Add url to replay hydration error breadcrumb type (#12521)
- fix(core): Ensure standalone spans respect sampled flag (#12533)
- fix(core): Use maxValueLength in extra error data integration (#12174)
- fix(feedback): Fix scrolling after feedback submission (#12499)
- fix(feedback): Send feedback rejects invalid responses (#12518)
- fix(nextjs): Update @rollup/plugin-commonjs (#12527)
- fix(node): Ensure status is correct for http server span errors (#12477)
- fix(node): Unify`getDynamicSamplingContextFromSpan` (#12522)
- fix(profiling): continuous profile chunks should be in seconds (#12532)
- fix(remix): Add nativeFetch support for accessing request headers (#12479)
- fix(remix): Export no-op as `captureRemixServerException` from client SDK (#12497)
- ref(node) refactor contextlines to use readline (#12221)

Work in this release was contributed by @AndreyKovanov and @kiliman. Thank you for your contributions!

## 8.9.2

- fix(profiling): Update exports so types generate properly (#12469)

## 8.9.1

### Important changes

- **feat(solid): Add Solid SDK**

  This release adds a dedicated SDK for [Solid JS](https://www.solidjs.com/) in alpha state with instrumentation for
  [Solid Router](https://docs.solidjs.com/solid-router) and a custom `ErrorBoundary`. See the
  [package README](https://github.com/getsentry/sentry-javascript/blob/develop/packages/solid/README.md) for how to use
  the SDK.

### Other changes

- feat(deps): bump @opentelemetry/instrumentation-express from 0.40.0 to 0.40.1 (#12438)
- feat(deps): bump @opentelemetry/instrumentation-mongodb from 0.44.0 to 0.45.0 (#12439)
- feat(deps): bump @opentelemetry/propagator-aws-xray from 1.24.1 to 1.25.0 (#12437)
- feat(nextjs): Allow for suppressing warning about missing global error handler file (#12369)
- feat(redis): Add cache logic for redis-4 (#12429)
- feat(replay): Replay Web Vital Breadcrumbs (#12296)
- fix: Fix types export order (#12404)
- fix(astro): Ensure server-side exports work correctly (#12453)
- fix(aws-serverless): Add `op` to Otel-generated lambda function root span (#12430)
- fix(aws-serverless): Only auto-patch handler in CJS when loading `awslambda-auto` (#12392)
- fix(aws-serverless): Only start root span in Sentry wrapper if Otel didn't wrap handler (#12407)
- fix(browser): Fix INP span creation & transaction tagging (#12372)
- fix(nextjs): correct types conditional export ordering (#12355)
- fix(replay): Fix guard for exception event (#12441)
- fix(vue): Handle span name assignment for nested routes in VueRouter (#12398)

Work in this release was contributed by @soch4n. Thank you for your contribution!

## 8.9.0

This release failed to publish correctly, please use `8.9.1` instead.

## 8.8.0

- **feat: Upgrade OTEL dependencies (#12388)**

This upgrades the OpenTelemetry dependencies to the latest versions and makes OTEL use `import-in-the-middle` `v1.8.0`.
This should fix numerous issues with using OTEL instrumentation with ESM.

High level issues fixed with OTEL + ESM:

- incompatibilities with using multiple loaders, commonly encountered while using `tsx` or similar libraries.
- incompatibilities with libraries that use duplicate namespace exports like `date-fns`.
- incompatibilities with libraries that use self-referencing namespace imports like `openai`.
- incompatibilities with dynamic export patterns like exports with function calls.
- `ENOENT: no such file or directory` bugs that libraries like [`discord.js`](https://github.com/discordjs/discord.js)
  surface.

If you are still encountering issues with OpenTelemetry instrumentation and ESM, please let us know.

- deps: Bump Sentry bundler plugins to version `2.18.0` (#12381)
- feat: Add `thirdPartyErrorFilterIntegration` (#12267)
- feat(core): Filter out error events with exception values and no stacktraces, values, or types (#12387)
- feat(core): Ignore additional common but inactionable errors (#12384)
- feat(deps): Bump @opentelemetry/propagator-aws-xray from 1.3.1 to 1.24.1 (#12333)
- feat(deps): Bump @sentry/cli from 2.31.2 to 2.32.1 (#12332)
- feat(redis): Support `mget` command in caching functionality (#12380)
- feat(vercel-edge): Export core integrations from Vercel edge SDK (#12308)
- fix(browser): Fix idle span ending (#12306)
- fix(browser): Fix parenthesis parsing logic for chromium (#12373)
- fix(browser): Fix types export path for CJS (#12305)
- fix(feedback): Override TriggerLabel Option (#12316)
- fix(feedback): Wait for document to be ready before doing autoinject (#12294)
- fix(nextjs): Fix memory leak (#12335)
- fix(nextjs): Fix version detection and option insertion logic for `clientTraceMetadata` option (#12323)
- fix(nextjs): Update argument name in log message about `sentry` property on Next.js config object (#12366)
- fix(node): Do not manually finish / update root Hapi spans. (#12287)
- fix(node): Fix virtual parent span ID handling & update create-next-app E2E test (#12368)
- fix(node): Skip capturing Hapi Boom responses v8. (#12288)
- fix(performance): Fix LCP not getting picked up on initial pageload transaction by setting reportAllChanges to true
  (#12360)
- fix(replay): Avoid infinite loop of logs (#12309)
- fix(replay): Ignore old events when manually starting replay (#12349)
- ref(browser): Ensure idle span ending is consistent (#12310)
- ref(profiling): unref timer (#12340)

Work in this release contributed by @dohooo, @mohd-akram, and @ykzts. Thank you for your contributions!

## 8.7.0

### Important Changes

- **feat(react): Add TanStack Router integration (#12095)**

  This release adds instrumentation for TanStack router with a new `tanstackRouterBrowserTracingIntegration` in the
  `@sentry/react` SDK:

  ```javascript
  import * as Sentry from '@sentry/react';
  import { createRouter } from '@tanstack/react-router';

  const router = createRouter({
    // Your router options...
  });

  Sentry.init({
    dsn: '___PUBLIC_DSN___',
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 1.0,
  });
  ```

### Other Changes

- fix(nextjs): Do not hide `sourceMappingURL` comment on client when `nextConfig.productionBrowserSourceMaps: true` is
  set (#12278)

## 8.6.0

### Important Changes

- **feat(metrics): Add `timings` method to metrics (#12226)**

  This introduces a new method, `metrics.timing()`, which can be used in two ways:

  1. With a numeric value, to simplify creating a distribution metric. This will default to `second` as unit:

  ```js
  Sentry.metrics.timing('myMetric', 100);
  ```

  2. With a callback, which will wrap the duration of the callback. This can accept a sync or async callback. It will
     create an inactive span around the callback and at the end emit a metric with the duration of the span in seconds:

  ```js
  const returnValue = Sentry.metrics.timing('myMetric', measureThisFunction);
  ```

- **feat(react): Add `Sentry.reactErrorHandler` (#12147)**

  This PR introduces `Sentry.reactErrorHandler`, which you can use in React 19 as follows:

  ```js
  import * as Sentry from '@sentry/react';
  import { hydrateRoot } from 'react-dom/client';

  ReactDOM.hydrateRoot(
    document.getElementById('root'),
    <React.StrictMode>
      <App />
    </React.StrictMode>,
    {
      onUncaughtError: Sentry.reactErrorHandler(),
      onCaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
        // optional callback if users want custom config.
      }),
    },
  );
  ```

  For more details, take a look at [the PR](https://github.com/getsentry/sentry-javascript/pull/12147). Our
  documentation will be updated soon!

### Other Changes

- feat(sveltekit): Add request data to server-side events (#12254)
- fix(core): Pass in cron monitor config correctly (#12248)
- fix(nextjs): Don't capture suspense errors in server components (#12261)
- fix(tracing): Ensure sent spans are limited to 1000 (#12252)
- ref(core): Use versioned carrier on global object (#12206)

## 8.5.0

### Important Changes

- **feat(react): Add React 19 to peer deps (#12207)**

This release adds support for React 19 in the `@sentry/react` SDK package.

- **feat(node): Add `@sentry/node/preload` hook (#12213)**

This release adds a new way to initialize `@sentry/node`, which allows you to use the SDK with performance
instrumentation even if you cannot call `Sentry.init()` at the very start of your app.

First, run the SDK like this:

```bash
node --require @sentry/node/preload ./app.js
```

Now, you can initialize and import the rest of the SDK later or asynchronously:

```js
const express = require('express');
const Sentry = require('@sentry/node');

const dsn = await getSentryDsn();
Sentry.init({ dsn });
```

For more details, head over to the
[PR Description of the new feature](https://github.com/getsentry/sentry-javascript/pull/12213). Our docs will be updated
soon with a new guide.

### Other Changes

- feat(browser): Do not include metrics in base CDN bundle (#12230)
- feat(core): Add `startNewTrace` API (#12138)
- feat(core): Allow to pass custom scope to `captureFeedback()` (#12216)
- feat(core): Only allow `SerializedSession` in session envelope items (#11979)
- feat(nextjs): Use Vercel's `waitUntil` to defer freezing of Vercel Lambdas (#12133)
- feat(node): Ensure manual OTEL setup works (#12214)
- fix(aws-serverless): Avoid minifying `Module._resolveFilename` in Lambda layer bundle (#12232)
- fix(aws-serverless): Ensure lambda layer uses default export from `ImportInTheMiddle` (#12233)
- fix(browser): Improve browser extension error message check (#12146)
- fix(browser): Remove optional chaining in INP code (#12196)
- fix(nextjs): Don't report React postpone errors (#12194)
- fix(nextjs): Use global scope for generic event filters (#12205)
- fix(node): Add origin to redis span (#12201)
- fix(node): Change import of `@prisma/instrumentation` to use default import (#12185)
- fix(node): Only import `inspector` asynchronously (#12231)
- fix(replay): Update matcher for hydration error detection to new React docs (#12209)
- ref(profiling-node): Add warning when using non-LTS node (#12211)

## 8.4.0

### Important Changes

- **feat(nextjs): Trace pageloads in App Router (#12157)**

If you are using Next.js version `14.3.0-canary.64` or above, the Sentry Next.js SDK will now trace clientside pageloads
with React Server Components. This means, that client-side errors like
`Error: An error occurred in the Server Components render.`, which previously didn't give you much information on how
that error was caused, can now be traced back to a specific error in a server component.

- **feat(angular): Add Support for Angular 18 (#12183)**

This release guarantees support for Angular 18 with `@sentry/angular`.

### Other Changes

- feat(deps): Bump @opentelemetry/instrumentation-aws-lambda from 0.41.0 to 0.41.1 (#12078)
- fix(metrics): Ensure string values are interpreted for metrics (#12165)

## 8.3.0

### Important Changes

- **Better Node Framework Span Data**

This release improves data quality of spans emitted by Express, Fastify, Connect, Koa, Nest.js and Hapi.

- feat(node): Ensure connect spans have better data (#12130)
- feat(node): Ensure express spans have better data (#12107)
- feat(node): Ensure fastify spans have better data (#12106)
- feat(node): Ensure hapi spans have better data (#12140)
- feat(node): Ensure koa spans have better data (#12108)
- feat(node): Ensure Nest.js spans have better data (#12139)
- feat(deps): Bump @opentelemetry/instrumentation-express from 0.38.0 to 0.39.0 (#12079)

- **feat(node): No-code init via `--import=@sentry/node/init` (#11999)**

When using Sentry in ESM mode, you can now use Sentry without manually calling init like this:

```bash
 SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 node --import=@sentry/node/init app.mjs
```

When using CommonJS, you can do:

```bash
 SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 node --require=@sentry/node/init app.js
```

### Other Changes

- chore: Align and update MIT license dates (#12143)
- chore: Resolve or postpone a random assortment of TODOs (#11977)
- doc(migration): Add entry for runWithAsyncContext (#12153)
- docs: Add migration docs to point out that default import does not work (#12100)
- docs(sveltekit): process.env.SENTRY_AUTH_TOKEN (#12118)
- feat(browser): Ensure `browserProfilingIntegration` is published to CDN (#12158)
- feat(google-cloud): Expose ESM build (#12149)
- feat(nextjs): Ignore Prisma critical dependency warnings (#12144)
- feat(node): Add app.free_memory info to events (#12150)
- feat(node): Do not create GraphQL resolver spans by default (#12097)
- feat(node): Use `node:` prefix for node built-ins (#11895)
- feat(replay): Use unwrapped `setTimeout` to avoid e.g. angular change detection (#11924)
- fix(core): Add dsn to span envelope header (#12096)
- fix(feedback): Improve feedback border color in dark-mode, and prevent auto-dark mode when a theme is picked (#12126)
- fix(feedback): Set optionOverrides to be optional in TS definition (#12125)
- fix(nextjs): Don't put `undefined` values in props (#12131)
- fix(nextjs): Fix legacy configuration method detection for emitting warning (#12136)
- fix(node): Ensure fetch/http breadcrumbs are created correctly (#12137)
- fix(node): Update `@prisma/instrumentation` from 5.13.0 to 5.14.0 (#12081)
- ref(node): Add log for running in ESM/CommonJS mode (#12134)
- ref(node): Handle failing hook registration gracefully (#12135)
- ref(node): Only show instrumentation warning when tracing is enabled (#12141)

Work in this release contributed by @pboling. Thank you for your contribution!

## 8.2.1

- fix(aws-serverless): Fix build of lambda layer (#12083)
- fix(nestjs): Broaden nest.js type (#12076)

## 8.2.0

- feat(redis-cache): Create cache-span with prefixed keys (get/set commands) (#12070)
- feat(core): Add `beforeSendSpan` hook (#11886)
- feat(browser): Improve idle span handling (#12065)
- fix(node): Set transactionName for unsampled spans in httpIntegration (#12071)
- fix(core): Export Scope interface as `Scope` (#12067)
- fix(core): Avoid looking up client for `hasTracingEnabled()` if possible (#12066)
- fix(browser): Use consistent timestamps (#12063)
- fix(node): Fix check for performance integrations (#12043)
- ref(sveltekit): Warn to delete source maps if Sentry plugin enabled source maps generation (#12072)

## 8.1.0

This release mainly fixes a couple of bugs from the initial [8.0.0 release](#800). In addition to the changes below, we
updated some initially missed points in our migration guides and documentation.

- feat(aws-serverless): Fix tree-shaking for aws-serverless package (#12017)
- feat(node): Bump opentelemetry instrumentation to latest version (#12028)
- feat(scope): Bring back `lastEventId` on isolation scope (#11951) (#12022)
- fix(aws-serverless): Export `awslambda-auto`
- fix(node): Do not warn for missing instrumentation if SDK is disabled (#12041)
- fix(react): Set dependency-injected functions as early as possible (#12019)
- fix(react): Warn and fall back gracefully if dependency injected functions are not available (#12026)
- ref(core): Streamline `parseSampleRate` utility function (#12024)
- ref(feedback): Make `eventId` optional and use `lastEventId` in report dialog (#12029)

## 8.0.0

The Sentry JS SDK team is proud to announce the release of version `8.0.0` of Sentry's JavaScript SDKs - it's been a
long time coming! Thanks to everyone for your patience and a special shout out to the brave souls testing preview builds
and reporting issues - we appreciate your support!

---

### How to Upgrade to Version 8:

We recommend reading the
[migration guide docs](https://docs.sentry.io/platforms/javascript/migration/v7-to-v8/#migration-codemod) to find out
how to address any breaking changes in your code for your specific platform or framework.

To automate upgrading to v8 as much as possible, use our migration codemod `@sentry/migr8`:

```sh
npx @sentry/migr8@latest
```

All deprecations from the v7 cycle, with the exception of `getCurrentHub()`, have been removed and can no longer be used
in v8. If you have an advanced Sentry SDK setup, we additionally recommend reading the
[in-depth migration guide](./MIGRATION.md) in our repo which highlights all changes with additional details and
information.

The rest of this changelog highlights the most important (breaking) changes and links to more detailed information.

### Version Support

With v8, we dropped support for several old runtimes and browsers

**Node SDKs:** The Sentry JavaScript SDK v8 now supports **Node.js 14.8.0 or higher**. This applies to `@sentry/node`
and all of our node-based server-side sdks (`@sentry/nextjs`, `@sentry/remix`, etc.). Furthermore, version 8 now ships
with full support for ESM-based node apps using **Node.js 18.19.0 or higher**.

**Browser SDKs:** The browser SDKs now require
[**ES2018+**](https://caniuse.com/?feats=mdn-javascript_builtins_regexp_dotall,js-regexp-lookbehind,mdn-javascript_builtins_regexp_named_capture_groups,mdn-javascript_builtins_regexp_property_escapes,mdn-javascript_builtins_symbol_asynciterator,mdn-javascript_functions_method_definitions_async_generator_methods,mdn-javascript_grammar_template_literals_template_literal_revision,mdn-javascript_operators_destructuring_rest_in_objects,mdn-javascript_operators_destructuring_rest_in_arrays,promise-finally)
compatible browsers. New minimum browser versions:

- Chrome 63
- Edge 79
- Safari/iOS Safari 12
- Firefox 58
- Opera 50
- Samsung Internet 8.2

For more details, please see the
[version support section in our migration guide](./MIGRATION.md#1-version-support-changes).

### Initializing Server-side SDKs (Node, Bun, Deno, Serverless):

In v8, we support a lot more node-based packages than before. In order to ensure auto-instrumentation works, the SDK now
needs to be imported and initialized before any other import in your code.

We recommend creating a new file (e.g. `instrumentation.js`) to import and initialize the SDK. Then, import the file on
top of your entry file or detailed instructions, check our updated SDK setup docs
[initializing the SDK in v8](https://docs.sentry.io/platforms/javascript/guides/node/).

### Performance Monitoring Changes

The API around performance monitoring and tracing has been streamlined, and we've added support for more integrations
out of the box.

- [Performance Monitoring API](./MIGRATION.md#performance-monitoring-api)
- [Performance Monitoring Integrations](./MIGRATION.md#performance-monitoring-integrations)

### Functional Integrations

Integrations are now simple functions instead of classes. Class-based integrations
[have been removed](./MIGRATION.md#removal-of-class-based-integrations):

```javascript
// old (v7)
Sentry.init({
  integrations: [new Sentry.BrowserTracing()],
});

// new (v8)
Sentry.init({
  integrations: [Sentry.browserTracingIntegration()],
});
```

### Package removal

The following packages have been removed or replaced and will no longer be published:

- [`@sentry/hub`](./MIGRATION.md#sentryhub)
- [`@sentry/tracing`](./MIGRATION.md#sentrytracing)
- [`@sentry/integrations`](./MIGRATION.md#sentryintegrations)
- [`@sentry/serverless`](./MIGRATION.md#sentryserverless)
- [`@sentry/replay`](./MIGRATION.md#sentryreplay)

### Changes since `8.0.0-rc.3`

- **feat(nextjs): Remove `transpileClientSDK` (#11978)**

  As we are dropping support for Internet Explorer 11 and other other older browser versions wih version `8.0.0`, we are
  also removing the `transpileClientSDK` option from the Next.js SDK. If you need to support these browser versions,
  please configure Webpack and Next.js to down-compile the SDK.

- **feat(serverless): Do not include performance integrations by default (#11998)**

  To keep Lambda bundle size reasonable, the SDK no longer ships with all performance (database) integrations by
  default. Add the Sentry integrations of the databases and other tools you're using manually to your `Sentry.init` call
  by following
  [this guide](https://docs.sentry.io/platforms/javascript/configuration/integrations/#modifying-default-integrations).
  Note that this change does not apply if you use the SDK with the Sentry AWS Lambda layer.

- feat(feedback): Simplify public css configuration for feedback (#11985)
- fix(feedback): Check for empty user (#11993)
- fix(replay): Fix type for `replayCanvasIntegration` (#11995)
- fix(replay): Fix user activity not being updated in `start()` (#12001)

## 8.0.0-rc.3

### Important Changes

- **feat(bun): Add Bun Global Unhandled Handlers (#11960)**

The Bun SDK will now capture global unhandled errors.

### Other Changes

- feat(node): Log process and thread info on initialisation (#11972)
- fix(aws-serverless): Include ESM artifacts in package (#11973)
- fix(browser): Only start `http.client` spans if there is an active parent span (#11974)
- fix(feedback): Improve CSS theme variable names and layout (#11964)
- fix(node): Ensure `execArgv` are not sent to worker threads (#11963)
- ref(feedback): Simplify feedback function params (#11957)

## 8.0.0-rc.2

### Important Changes

- **feat(node): Register ESM patching hooks in init for supported Node.js versions**

This release includes adds support for ESM when `Sentry.init()` is called within a module imported via the `--import`
Node.js flag:

```sh
node --import ./your-file-with-sentry-init.mjs your-app.mjs
```

Note that the SDK only supports ESM for node versions `18.19.0` and above, and `20.6.0` above.

### Other Changes

- deps(node): Bump `@opentelemetry/core` to `1.24.1` and `@opentelemetry/instrumentation` to `0.51.1` (#11941)
- feat(connect): Warn if connect is not instrumented (#11936)
- feat(express): Warn if express is not instrumented (#11930)
- feat(fastify): Warn if fastify is not instrumented (#11917)
- feat(hapi): Warn if hapi is not instrumented (#11937)
- feat(koa): Warn if koa is not instrumented (#11931)
- fix(browser): Continuously record CLS web vital (#11934)
- fix(feedback): Pick user from any scope (#11928)
- fix(node): Fix cron instrumentation and add tests (#11811)

## 8.0.0-rc.1

This release contains no changes and was done for technical purposes. This version is considered stable.

For the sake of completeness this changelog entry includes the changes from the previous release candidate:

We recommend to read the detailed [migration guide](https://docs.sentry.io/platforms/javascript/migration/v7-to-v8/) in
the docs.

### Important Changes

- **feat(node): Support hapi v21 & fix E2E test (#11906)**

We now support hapi v21 and added tests for it.

- **feat(node): Warn if ESM mode is detected (#11914)**

When running Sentry in ESM mode, we will now warn you that this is not supported as of now. We are working on ensuring
support with ESM builds.

### Other Changes

- feat(feedback): Iterate on css for better scrolling & resizing when browser is small (#11893)
- fix(node): Ensure prisma integration creates valid DB spans (#11908)
- fix(node): Include loader hook files in package.json (#11911)

## 8.0.0-rc.0

This is the first release candidate of Sentry JavaScript SDK v8.

We recommend to read the detailed [migration guide](https://docs.sentry.io/platforms/javascript/migration/v7-to-v8/) in
the docs.

### Important Changes

- **feat(node): Support hapi v21 & fix E2E test (#11906)**

We now support hapi v21 and added tests for it.

- **feat(node): Warn if ESM mode is detected (#11914)**

When running Sentry in ESM mode, we will now warn you that this is not supported as of now. We are working on ensuring
support with ESM builds.

### Other Changes

- feat(feedback): Iterate on css for better scrolling & resizing when browser is small (#11893)
- fix(node): Ensure prisma integration creates valid DB spans (#11908)
- fix(node): Include loader hook files in package.json (#11911)

## 8.0.0-beta.6

This beta release contains various bugfixes and improvements for the v8 beta cycle.

- feat: Add `tunnel` support to multiplexed transport (#11806)
- feat: Export `spanToBaggageHeader` utility (#11881)
- feat(browser): Disable standalone `http.client` spans (#11879)
- feat(ember): Update ember dependencies (#11753)
- feat(fedback): Convert CDN bundles to use async feedback for lower bundle sizes (#11791)
- feat(feedback): Add `captureFeedback` method (#11428)
- feat(feedback): Have screenshot by default (#11839)
- feat(integrations): Add zod integration (#11144)
- feat(ioredis): Add integration for `ioredis` (#11856)
- feat(nextjs): Add transaction name to scope of server component (#11850)
- feat(nextjs): Be smarter in warning about old ways of init configuration (#11882)
- feat(nextjs): Set transaction names on scope for route handlers and generation functions (#11869)
- feat(node): Support Node 22 (#11871)
- fix(angular): Run tracing calls outside Angular (#11748)
- fix(feedback): Be consistent about whether screenshot should and can render (#11859)
- fix(nestjs): Ensure Nest.js interceptor works with non-http context (#11880)
- fix(node): Fix nest.js error handler (#11874)
- fix(react): Fix react router v4/v5 instrumentation (#11855)
- ref: Add geo location types (#11847)

## 8.0.0-beta.5

This beta release contains various bugfixes and improvements for the v8 beta cycle.

### Important Changes

- **feat(svelte): Add Svelte 5 support (#11807)**

We now officially support Svelte 5.

- **feat(browser): Send standalone fetch and XHR spans if there's no active parent span (#11783)**

Starting with this version, spans for outgoing fetch/xhr requests will be captured even if no pageload/navigation span
is ongoing. This means that you will be able to have a more complete trace, especially for web applications that make a
lot of HTTP requests on longer lived pages.

### Other Changes

- feat(astro): Add `transactionName` to isolation scope for requests (#11786)
- feat(browser): Create standalone INP spans via `startInactiveSpan` (#11788)
- feat(core): Add `trace` envelope header to span envelope (#11699)
- feat(core): Add options to start standalone (segment) spans via `start*Span` APIs (#11696)
- feat(core): Set default scope for BaseClient methods (#11775)
- feat(core): Wrap cron `withMonitor` callback in `withIsolationScope` (#11797)
- feat(feedback): New feedback button design (#11641)
- feat(nextjs): Add `transactionName` to isolation scope for Next.js server side features (#11782)
- feat(nextjs): Mute webpack warnings about critical dependencies inside `@opentelemetry/instrumentation` (#11810)
- feat(node): Upgrade @prisma/instrumentation to 5.13.0 (#11779)
- feat(react): type error as unknown in ErrorBoundary (#11819)
- feat(remix): Add `wrapHandleErrorWithSentry` (#10370)
- feat(remix): Set `formData` as `action` span data. (#10836)
- feat(remix): Update scope `transactionName` for Remix server features (#11784)
- fix(angular): Call `showReportDialog` in root context (#11703)
- fix(core): Capture only failed console.assert calls (#11799)
- fix(ember): Ensure unnecessary spans are avoided (#11846)
- fix(feedback): Clarify the difference between createWidget and create Form in the feedback public api (#11838)
- fix(feedback): Fix feedback type (#11787)
- fix(feedback): Vendor preact into bundle (#11845)
- fix(remix): Rethrow `loader`, `action` and `documentRequest` errors (#11793)
- ref: Always return an immediately generated event ID from `captureException()`, `captureMessage()`, and
  `captureEvent()` (#11805)
- ref(core): Remove transaction name extraction from `requestDataIntegration` (#11513)
- ref(svelte): Use `onlyIfParent` for recording component update spans (#11809)

## 8.0.0-beta.4

### Important Changes

- **feat(browser): Add INP support for v8 (#11650)**

INP web vital support was now forward-ported to version 8. Recording of INP data is enabled by default.

- **feat(core): Increase default transport buffer size from 30 to 64 (#11764)**

The default limit of queued events to be sent was increased from 30 to 64 events. You may observe a higher memory
footprint of the SDK. You can override this limit by setting the `transportOptions.bufferSize` option in
`Sentry.init()`.

- **feat(replay): Add "maxCanvasSize" option for replay canvases (#11617)**

A `maxCanvasSize` option was added to the `replayCanvasIntegration` to disallow capturing of canvases larger than a
certain size. This value defaults to `1280` which will not capture canvases bigger than 1280x1280 pixels.

### Other Changes

- deps: Downgrade `@opentelemetry/instrumentation-http` to `0.48.0` (#11745)
- deps(nextjs): Remove unnecessary and faulty `@opentelemetry/api` dependency from Next.js package (#11717)
- feat(aws): Add OTEL based integrations (#11548)
- feat(core): Ensure trace context only includes relevant data (#11713)
- feat(deps): Bump @opentelemetry/instrumentation-fastify from 0.33.0 to 0.35.0 (#11690)
- feat(deps): Bump @opentelemetry/instrumentation-graphql from 0.37.0 to 0.39.0 (#11692)
- feat(deps): Bump @opentelemetry/instrumentation-http from 0.48.0 to 0.50.0 (#11725)
- feat(deps): Bump @opentelemetry/instrumentation-mongoose from 0.35.0 to 0.37.0 (#11693)
- feat(deps): Bump @opentelemetry/instrumentation-mysql2 from 0.35.0 to 0.37.0 (#11726)
- feat(deps): Bump @opentelemetry/instrumentation-nestjs-core from 0.34.0 to 0.36.0 (#11727)
- feat(deps): Bump @opentelemetry/sdk-metrics from 1.21.0 to 1.23.0 (#11695)
- feat(deps): Bump @prisma/instrumentation from 5.9.0 to 5.12.1 (#11724)
- feat(feedback): Create async bundles and code to resolve helper integrations (#11621)
- feat(nextjs): Sample out low-quality spans on older Next.js versions (#11722)
- feat(opentelemetry): Support new http method attribute (#11756)
- feat(opentelemetry): Use rest args for addOpenTelemetryInstrumentation (#11721)
- feat(replay): Upgrade rrweb packages to 2.15.0 (#11736)
- fix(browser): Ensure `lazyLoadIntegration` works in NPM mode (#11673)
- fix(browser): Set custom sentry source correctly (#11735)
- fix(ember): Do not create rendering spans without transaction (#11749)
- fix(serverless): Check if cloud event callback is a function (#9044) (#11701)
- ref(nextjs): Remove unnecessary logic to filter symbolification/sentry spans (#11714)

## 8.0.0-beta.3

### Important Changes

- **feat(opentelemetry): Add `addOpenTelemetryInstrumentation` (#11667)**

A utility function `addOpenTelemetryInstrumentation` was added that allows for the registration of instrumentations that
conform to the OpenTelemetry JS API without having to specify `@opentelemetry/instrumentation` as a dependency.

- **ref(core): Don't start transaction for trpc middleware (#11697)**

Going forward, the Sentry `trpcMiddleware` will only create spans. Previously it used to always create a transaction.
This change was made to integrate more nicely with the HTTP instrumentation added in earlier versions to avoid creating
unnecessary transactions.

### Other Changes

- feat(nextjs): Instrument outgoing http requests (#11685)
- feat(opentelemetry): Remove setupGlobalHub (#11668)
- fix: Missing ErrorEvent export are added to node, browser, bun, deno, vercel-edge sub-packages (#11649)
- fix(nextjs): Do not sample next spans if they have remote parent (#11680)
- fix(nextjs): Re-enable OTEL fetch instrumentation and disable Next.js fetch instrumentation (#11686)
- fix(node): Ensure DSC on envelope header uses root span (#11683)
- ref(browser): Streamline pageload span creation and scope handling (#11679)
- ref(core): Directly use endSession (#11669)

## 8.0.0-beta.2

### Important Changes

- **feat(browser): Update `propagationContext` on `spanEnd` to keep trace consistent**

To ensure consistency throughout a route's duration, we update the scope's propagation context when the initial page
load or navigation span ends. This keeps span-specific attributes like the sampled decision and dynamic sampling context
on the scope, even after the transaction has ended.

- **fix(browser): Don't assume window.document is available (#11602)**

We won't assume `window.dodument` is available in the browser SDKs anymore. This should prevent errors in environments
where `window.document` is not available (such as web workers).

### Other changes

- feat(core): Add `server.address` to browser `http.client` spans (#11634)
- feat(opentelemetry): Update OTEL packages & relax some version ranges (#11580)
- feat(deps): bump @opentelemetry/instrumentation-hapi from 0.34.0 to 0.36.0 (#11496)
- feat(deps): bump @opentelemetry/instrumentation-koa from 0.37.0 to 0.39.0 (#11495)
- feat(deps): bump @opentelemetry/instrumentation-pg from 0.38.0 to 0.40.0 (#11494)
- feat(nextjs): Skip OTEL root spans emitted by Next.js (#11623)
- feat(node): Collect Local Variables via a worker (#11586)
- fix(nextjs): Escape Next.js' OpenTelemetry instrumentation (#11625)
- fix(feedback): Fix timeout on feedback submission (#11619)
- fix(node): Allow use of `NodeClient` without calling `init` (#11585)
- fix(node): Ensure DSC is correctly set in envelope headers (#11628)

## 8.0.0-beta.1

This is the first beta release of Sentry JavaScript SDK v8. With this release, there are no more planned breaking
changes for the v8 cycle.

Read the [in-depth migration guide](./MIGRATION.md) to find out how to address any breaking changes in your code. All
deprecations from the v7 cycle, with the exception of `getCurrentHub()`, have been removed and can no longer be used in
v8.

### Version Support

The Sentry JavaScript SDK v8 now supports Node.js 14.8.0 or higher. This applies to `@sentry/node` and all of our
node-based server-side sdks (`@sentry/nextjs`, `@sentry/remix`, etc.).

The browser SDKs now require
[ES2018+](https://caniuse.com/?feats=mdn-javascript_builtins_regexp_dotall,js-regexp-lookbehind,mdn-javascript_builtins_regexp_named_capture_groups,mdn-javascript_builtins_regexp_property_escapes,mdn-javascript_builtins_symbol_asynciterator,mdn-javascript_functions_method_definitions_async_generator_methods,mdn-javascript_grammar_template_literals_template_literal_revision,mdn-javascript_operators_destructuring_rest_in_objects,mdn-javascript_operators_destructuring_rest_in_arrays,promise-finally)
compatible browsers. New minimum browser versions:

- Chrome 63
- Edge 79
- Safari/iOS Safari 12
- Firefox 58
- Opera 50
- Samsung Internet 8.2

For more details, please see the [version support section in migration guide](./MIGRATION.md#1-version-support-changes).

### Package removal

The following packages will no longer be published

- [@sentry/hub](./MIGRATION.md#sentryhub)
- [@sentry/tracing](./MIGRATION.md#sentrytracing)
- [@sentry/integrations](./MIGRATION.md#sentryintegrations)
- [@sentry/serverless](./MIGRATION.md#sentryserverless)
- [@sentry/replay](./MIGRATION.md#sentryreplay)

### Initializing Server-side SDKs (Node, Bun, Next.js, SvelteKit, Astro, Remix):

Initializing the SDKs on the server-side has been simplified. More details in our migration docs about
[initializing the SDK in v8](./MIGRATION.md/#initializing-the-node-sdk).

### Performance Monitoring Changes

The API around performance monitoring and tracing has been vastly improved, and we've added support for more
integrations out of the box.

- [Performance Monitoring API](./MIGRATION.md#performance-monitoring-api)
- [Performance Monitoring Integrations](./MIGRATION.md#performance-monitoring-integrations)

### Important Changes since v8.0.0-alpha.9

- **feat(browser): Create spans as children of root span by default (#10986)**

Because execution context isolation in browser environments does not work reliably, we deciced to keep a flat span
hierarchy by default in v8.

- **feat(core): Deprecate `addTracingExtensions` (#11579)**

Instead of calling `Sentry.addTracingExtensions()` if you want to use performance in a browser SDK without using
`browserTracingIntegration()`, you should now call `Sentry.registerSpanErrorInstrumentation()`.

- **feat(core): Implement `suppressTracing` (#11468)**

You can use the new `suppressTracing` API to ensure a given callback will not generate any spans:

```js
return Sentry.suppressTracing(() => {
  // Ensure this fetch call does not generate a span
  return fetch('/my-url');
});
```

- **feat: Rename ESM loader hooks to `import` and `loader` (#11498)**

We renamed the loader hooks for better clarity:

```sh
# For Node.js <= 18.18.2
node --loader=@sentry/node/loader app.js

# For Node.js >= 18.19.0
node --import=@sentry/node/import app.js
```

- **feat(node): Do not exit process by default when other `onUncaughtException` handlers are registered in
  `onUncaughtExceptionIntegration` (#11532)**

In v8, we will no longer exit the node process by default if other uncaught exception handlers have been registered by
the user.

- **Better handling of transaction name for errors**

We improved the way we keep the transaction name for error events, even when spans are not sampled or performance is
disabled.

- feat(fastify): Update scope `transactionName` when handling request (#11447)
- feat(hapi): Update scope `transactionName` when handling request (#11448)
- feat(koa): Update scope `transactionName` when creating router span (#11476)
- feat(sveltekit): Update scope transactionName when handling server-side request (#11511)
- feat(nestjs): Update scope transaction name with parameterized route (#11510)

### Removal/Refactoring of deprecated functionality

- feat(core): Remove `getCurrentHub` from `AsyncContextStrategy` (#11581)
- feat(core): Remove `getGlobalHub` export (#11565)
- feat(core): Remove `Hub` class export (#11560)
- feat(core): Remove most Hub class exports (#11536)
- feat(nextjs): Remove webpack 4 support (#11605)
- feat(vercel-edge): Stop using hub (#11539)

### Other Changes

- feat: Hoist `getCurrentHub` shim to core as `getCurrentHubShim` (#11537)
- feat(core): Add default behaviour for `rewriteFramesIntegration` in browser (#11535)
- feat(core): Ensure replay envelopes are sent in order when offline (#11413)
- feat(core): Extract errors from props in unkown inputs (#11526)
- feat(core): Update metric normalization (#11518)
- feat(feedback): Customize feedback placeholder text color (#11417)
- feat(feedback): Maintain v7 compat in the @sentry-internal/feedback package (#11461)
- feat(next): Handle existing root spans for isolation scope (#11479)
- feat(node): Ensure tracing without performance (TWP) works (#11564)
- feat(opentelemetry): Export `getRequestSpanData` (#11508)
- feat(opentelemetry): Remove otel.attributes in context (#11604)
- feat(ratelimit): Add metrics rate limit (#11538)
- feat(remix): Skip span creation for `OPTIONS` and `HEAD` requests. (#11149)
- feat(replay): Merge packages together & ensure bundles are built (#11552)
- feat(tracing): Adds span envelope and datacategory (#11534)
- fix(browser): Ensure pageload trace remains active after pageload span finished (#11600)
- fix(browser): Ensure tracing without performance (TWP) works (#11561)
- fix(nextjs): Fix `tunnelRoute` matching logic for hybrid cloud (#11576)
- fix(nextjs): Remove Http integration from Next.js (#11304)
- fix(node): Ensure isolation scope is correctly cloned for non-recording spans (#11503)
- fix(node): Make fastify types more broad (#11544)
- fix(node): Send ANR events without scope if event loop blocked indefinitely (#11578)
- fix(tracing): Fixes latest route name and source not updating correctly (#11533)
- ref(browser): Move browserTracing into browser pkg (#11484)
- ref(feedback): Configure font size (#11437)
- ref(feedback): Refactor Feedback types into @sentry/types and reduce the exported surface area (#11355)

## 8.0.0-beta.0

This release failed to publish correctly. Use 8.0.0-beta.1 instead.

## 8.0.0-alpha.9

This is the eighth alpha release of Sentry JavaScript SDK v8, which includes a variety of breaking changes.

Read the [in-depth migration guide](./MIGRATION.md) to find out how to address any breaking changes in your code.

### Important Changes

- **feat: Add @sentry-internal/browser-utils (#11381)**

A big part of the browser-runtime specific exports of the internal `@sentry/utils` package were moved into a new package
`@sentry-internal/browser-utils`. If you imported any API from `@sentry/utils` (which is generally not recommended but
necessary for some workarounds), please check that your import statements still point to existing exports after
upgrading.

- **feat: Add loader file to node-based SDKs to support ESM monkeypatching (#11338)**

When using ESM, it is necessary to use a "loader" to be able to instrument certain third-party packages and Node.js API.
The server-side SDKs now ship with a set of ESM loader hooks, that should be used when using ESM. Use them as follows:

```sh
# For Node.js <= 18.18.2
node --experimental-loader=@sentry/node/hook your-app.js

# For Node.js >= 18.19.0
node --import=@sentry/node/register your-app.js
```

Please note that due to an upstream bug, these loader hooks will currently crash or simply not work. We are planning to
fix this in upcoming versions of the SDK - definitely before a stable version 8 release.

- **feat(node): Add Koa error handler (#11403)**
- **feat(node): Add NestJS error handler (#11375)**

The Sentry SDK now exports integrations and error middlewares for Koa (`koaIntegration()`, `setupKoaErrorHandler()`) and
NestJS (`setupNestErrorHandler()`) that can be used to instrument your Koa and NestJS applications with error
monitoring.

### Removal/Refactoring of deprecated functionality

- feat(core): Remove hub check in isSentryRequestUrl (#11407)
- feat(opentelemetry): Remove top level startActiveSpan (#11380)
- feat(types): `beforeSend` and `beforeSendTransaction` breaking changes (#11354)
- feat(v8): Remove all class based integrations (#11345)
- feat(v8/core): Remove span.attributes top level field (#11378)
- ref: Remove convertIntegrationFnToClass (#11343)
- ref(node): Remove the old `node` package (#11322)
- ref(tracing): Remove `span.startChild()` (#11376)
- ref(v8): Remove `addRequestDataToTransaction` util (#11369)
- ref(v8): Remove `args` on `HandlerDataXhr` (#11373)
- ref(v8): Remove `getGlobalObject` utility method (#11372)
- ref(v8): Remove `metadata` on transaction (#11397)
- ref(v8): Remove `pushScope`, `popScope`, `isOlderThan`, `shouldSendDefaultPii` from hub (#11404)
- ref(v8): Remove `shouldCreateSpanForRequest` from vercel edge options (#11371)
- ref(v8): Remove deprecated `_reportAllChanges` option (#11393)
- ref(v8): Remove deprecated `scope.getTransaction()` (#11365)
- ref(v8): Remove deprecated methods on scope (#11366)
- ref(v8): Remove deprecated span & transaction properties (#11400)
- ref(v8): Remove Transaction concept (#11422)

### Other Changes

- feat: Add `trpcMiddleware` back to serverside SDKs (#11374)
- feat: Implement timed events & remove `transaction.measurements` (#11398)
- feat(browser): Bump web-vitals to 3.5.2 (#11391)
- feat(feedback): Add `getFeedback` utility to get typed feedback instance (#11331)
- feat(otel): Do not sample `options` and `head` requests (#11467)
- feat(remix): Update scope `transactionName` when resolving route (#11420)
- feat(replay): Bump `rrweb` to 2.12.0 (#11314)
- feat(replay): Use data sentry element as fallback for the component name (#11383)
- feat(sveltekit): Update scope `transactionName` when pageload route name is updated (#11406)
- feat(tracing-internal): Reset propagation context on navigation (#11401)
- feat(types): Add View Hierarchy types (#11409)
- feat(utils): Use `globalThis` (#11351)
- feat(vue): Update scope's `transactionName` when resolving a route (#11423)
- fix(core): unref timer to not block node exit (#11430)
- fix(node): Fix baggage propagation (#11363)
- fix(web-vitals): Check for undefined navigation entry (#11311)
- ref: Set preserveModules to true for browser packages (#11452)
- ref(core): Remove duplicate logic in scope.update (#11384)
- ref(feedback): Add font family style to actor (#11432)
- ref(feedback): Add font family to buttons (#11414)
- ref(gcp-serverless): Remove setting `.__sentry_transaction` (#11346)
- ref(nextjs): Replace multiplexer with conditional exports (#11442)

## 8.0.0-alpha.8

This is a partially broken release and was superseded by version `8.0.0-alpha.9`.

## 8.0.0-alpha.7

This is the seventh alpha release of Sentry JavaScript SDK v8, which includes a variety of breaking changes.

Read the [in-depth migration guide](./MIGRATION.md) to find out how to address any breaking changes in your code.

### Important Changes

- **feat(nextjs): Use OpenTelemetry for performance monitoring and tracing (#11016)**

We now use OpenTelemetry under the hood to power performance monitoring and tracing in the Next.js SDK.

- **feat(v8/gatsby): Update SDK initialization for gatsby (#11292)**

In v8, you cannot initialize the SDK anymore via Gatsby plugin options. Instead, you have to configure the SDK in a
`sentry.config.js` file.

We also removed the automatic initialization of `browserTracingIntegration`. You now have to add this integration
yourself.

### Removal/Refactoring of deprecated functionality

- feat(v8): Remove addGlobalEventProcessor (#11255)
- feat(v8): Remove deprecated span id fields (#11180)
- feat(v8): Remove makeMain export (#11278)
- feat(v8/core): Remove deprecated span.sampled (#11274)
- feat(v8/core): Remove getActiveTransaction (#11280)
- feat(v8/core): Remove spanMetadata field (#11271)
- feat(v8/ember): Remove deprecated StartTransactionFunction (#11270)
- feat(v8/replay): Remove deprecated replay options (#11268)
- feat(v8/svelte): Remove deprecated componentTrackingPreprocessor export (#11277)
- ref: Remove more usages of getCurrentHub in the codebase (#11281)
- ref(core): Remove `scope.setSpan()` and `scope.getSpan()` methods (#11051)
- ref(profiling-node): Remove usage of getCurrentHub (#11275)
- ref(v8): change integration.setupOnce signature (#11238)
- ref: remove node-experimental references (#11290)

### Other Changes

- feat(feedback): Make "required" text for input elements configurable (#11152) (#11153)
- feat(feedback): Update user feedback screenshot and cropping to align with designs (#11227)
- feat(nextjs): Remove `runtime` and `vercel` tags (#11291)
- feat(node): Add scope to ANR events (#11256)
- feat(node): Do not include `prismaIntegration` by default (#11265)
- feat(node): Ensure `tracePropagationTargets` are respected (#11285)
- feat(node): Simplify `SentrySpanProcessor` (#11273)
- feat(profiling): Use OTEL powered node package (#11239)
- feat(utils): Allow text encoder/decoder polyfill from global **SENTRY** (#11283)
- fix(nextjs): Show misconfiguration warning (no `instrumentation.ts`) (#11266)
- fix(node): Add logs when node-fetch cannot be instrumented (#11289)
- fix(node): Skip capturing Hapi Boom error responses. (#11151)
- fix(node): Use `suppressTracing` to avoid capturing otel spans (#11288)
- fix(opentelemetry): Do not stomp span status when `startSpan` callback throws (#11170)

## 8.0.0-alpha.6

This version did not publish correctly due to a configuration issue.

## 8.0.0-alpha.5

This is the fifth alpha release of Sentry JavaScript SDK v8, which includes a variety of breaking changes.

Read the [in-depth migration guide](./MIGRATION.md) to find out how to address any breaking changes in your code.

### Important Changes

- **feat(nextjs): Remove `client.(server|client).config.ts` functionality in favor of `instrumentation.ts` (#11059)**
  - feat(nextjs): Bump minimum required Next.js version to `13.2.0` (#11097)

With version 8 of the SDK we will no longer support the use of `sentry.server.config.ts` and `sentry.edge.config.ts`
files. Instead, please initialize the Sentry Next.js SDK for the serverside in a
[Next.js instrumentation hook](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation).
**`sentry.client.config.ts|js` is still supported and encouraged for initializing the clientside SDK.** Please see the
[Migration Guide](./MIGRATION.md#updated-the-recommended-way-of-calling-sentryinit) for more details.

In addition, the Next.js SDK now requires a minimum Next.js version of `13.2.0`.

- **feat(v8/angular): Merge angular and angular-ivy packages and start Angular support at v14 (#11091)**

The `@sentry/angular-ivy` package has been removed. The `@sentry/angular` package now supports Ivy by default and
requires at least Angular 14. See the [Migration Guide](./MIGRATION.md#removal-of-sentryangular-ivy-package) for more
details.

### Removal/Refactoring of deprecated functionality

- feat(aws-serverless): Remove deprecated `rethrowAfterCapture` option (#11126)
- feat(node): Remove deprecated/duplicate/unused definitions (#11120)
- feat(v8): Remove deprecated integration methods on client (#11134)
- feat(v8/browser): Remove class export for linked errors (#11129)
- feat(v8/browser): Remove deprecated wrap export (#11127)
- feat(v8/core): Remove deprecated client.setupIntegrations method (#11179)
- feat(v8/core): Remove deprecated integration classes (#11132)
- feat(v8/ember): Remove InitSentryForEmber export (#11202)
- feat(v8/nextjs): Remove usage of class integrations (#11182)
- feat(v8/replay): Delete deprecated types (#11177)
- feat(v8/utils): Remove deprecated util functions (#11143)
- ref(node): Remove class based export for local variable integration (#11128)

### Other Changes

- feat(browser): Make fetch the default transport for offline (#11209)
- feat(core): Filter out noisy GoogleTag error by default (#11208)
- feat(deps): Bump @sentry/cli from 2.30.0 to 2.30.2 (#11168)
- feat(nextjs): Prefix webpack plugin log messages with runtime (#11173)
- feat(node-profiling): Output ESM and remove Sentry deps from output (#11135)
- feat(node): Allow Anr worker to be stopped and restarted (#11214)
- feat(node): Support `tunnel` option for ANR (#11163)
- feat(opentelemetry): Do not capture exceptions for timed events (#11221)
- feat(serverless): Add Node.js 20 to compatible runtimes (#11103)
- feat(sveltekit): Switch to Otel-based `@sentry/node` package (#11075)
- fix(attachments): Add missing `view_hierarchy` attachment type (#11197)
- fix(build): Ensure tree shaking works properly for ESM output (#11122)
- fix(feedback): Only allow screenshots in secure contexts (#11188)
- fix(feedback): Reduce force layout in screenshots (#11181)
- fix(feedback): Smoother cropping experience and better UI (#11165)
- fix(feedback): Fix screenshot black bars in Safari (#11233)
- fix(metrics): use correct statsd data category (#11184)
- fix(metrics): use web-vitals ttfb calculation (#11185)
- fix(node): Export `initOpenTelemetry` (#11158)
- fix(node): Clear ANR timer on stop (#11229)
- fix(node): Time zone handling for `cron` (#11225)
- fix(node): Use unique variable for ANR context transfer (#11161)
- fix(opentelemetry): Do not stomp span error status (#11169)
- fix(types): Fix incorrect `sampled` type on `Transaction` (#11115)

## 8.0.0-alpha.4

This is the fourth Alpha release of the v8 cycle, which includes a variety of breaking changes.

Read the [in-depth migration guide](./MIGRATION.md) to find out how to address any breaking changes in your code.

### Important Changes

- **feat: Set required node version to >=14.18.0 for all packages (#10968)**

The minimum Node version required for the SDK is now `14.18.0`.

- **Serverless SDK Changes**
  - feat(google-cloud): Add @sentry/google-cloud package (#10993)
  - feat(v8): Add @sentry/aws-serverless package (#11052)
  - feat(v8): Rename gcp package to `@sentry/google-cloud-serverless` (#11065)

`@sentry/serverless` is no longer published, and is replaced by two new packages: `@sentry/google-cloud-serverless` and
`@sentry/aws-serverless`. These packages are now the recommended way to instrument serverless functions. See the
[migration guide](./MIGRATION.md#sentryserverless) for more details.

- **build(bundles): Use ES2017 for bundles (drop ES5 support) (#10911)**

The Browser SDK and CDN bundles now emits ES2017 compatible code and drops support for IE11. This also means that the
Browser SDKs (`@sentry/browser`, `@sentry/react`, `@sentry/vue`, etc.) requires the fetch API to be available in the
environment. If you need to support older browsers, please transpile your code to ES5 using babel or similar and add
required polyfills.

New minimum supported browsers:

- Chrome 58
- Edge 15
- Safari/iOS Safari 11
- Firefox 54
- Opera 45
- Samsung Internet 7.2

### Removal/Refactoring of deprecated functionality

- feat(browser): Remove IE parser from the default stack parsers (#11035)
- feat(bun/v8): Remove all deprecations from Bun SDK (#10971)
- feat(core): Remove `startTransaction` export (#11015)
- feat(v8/core): Move addTracingHeadersToFetchRequest and instrumentFetchRequest to core (#10918)
- feat(v8/deno): Remove deprecations from deno SDK (#10972)
- feat(v8/remix): Remove remixRouterInstrumentation (#10933)
- feat(v8/replay): Opt-in options for `unmask` and `unblock` (#11049)
- feat(v8/tracing): Delete BrowserTracing class (#10919)
- feat(v8/vercel-edge): Remove vercel-edge sdk deprecations (#10974)
- feat(replay/v8): Delete deprecated `replaySession` and `errorSampleRates` (#11045)
- feat(v8): Remove deprecated Replay, Feedback, ReplayCanvas exports (#10814)
- ref: Remove `spanRecorder` and all related code (#10977)
- ref: Remove deprecated `origin` field on span start options (#11058)
- ref: Remove deprecated properties from `startSpan` options (#11054)
- ref(core): Remove `startTransaction` & `finishTransaction` hooks (#11008)
- ref(nextjs): Remove `sentry` field in Next.js config as a means of configuration (#10839)
- ref(nextjs): Remove last internal deprecations (#11019)
- ref(react): Streamline browser tracing integrations & remove old code (#11012)
- ref(svelte): Remove `startChild` deprecations (#10956)
- ref(sveltekit): Update trace propagation & span options (#10838)
- ref(v8/angular): Remove instrumentAngularRouting and fix tests (#11021)

### Other Changes

- feat: Ensure `getRootSpan()` does not rely on transaction (#10979)
- feat: Export `getSpanDescendants()` everywhere (#10924)
- feat: Make ESM output valid Node ESM (#10928)
- feat: Remove tags from spans & transactions (#10809)
- feat(angular): Update scope `transactionName` when route is resolved (#11043)
- feat(angular/v8): Change decorator naming and add `name` parameter (#11057)
- feat(astro): Update `@sentry/astro` to use OpenTelemetry (#10960)
- feat(browser): Remove `HttpContext` integration class (#10987)
- feat(browser): Use idle span for browser tracing (#10957)
- feat(build): Allow passing Sucrase options for rollup (#10747)
- feat(build): Core packages into single output files (#11030)
- feat(core): Allow custom tracing implementations (#11003)
- feat(core): Allow metrics aggregator per client (#10949)
- feat(core): Decouple `scope.transactionName` from root spans (#10991)
- feat(core): Ensure trace APIs always return a span (#10942)
- feat(core): Implement `startIdleSpan` (#10934)
- feat(core): Move globals to `__SENTRY__` singleton (#11034)
- feat(core): Move more scope globals to `__SENTRY__` (#11074)
- feat(core): Undeprecate setTransactionName (#10966)
- feat(core): Update `continueTrace` to be callback-only (#11044)
- feat(core): Update `spanToJSON` to handle OTEL spans (#10922)
- feat(deps): bump @sentry/cli from 2.29.1 to 2.30.0 (#11024)
- feat(feedback): New feedback integration with screenshots (#10590)
- feat(nextjs): Bump Webpack Plugin to version 2 and rework config options (#10978)
- feat(nextjs): Support Hybrid Cloud DSNs with `tunnelRoute` option (#10959)
- feat(node): Add `setupFastifyErrorHandler` utility (#11061)
- feat(node): Rephrase wording in http integration JSDoc (#10947)
- feat(opentelemetry): Do not use SentrySpan & Transaction classes (#10982)
- feat(opentelemetry): Remove hub from context (#10983)
- feat(opentelemetry): Use core `getRootSpan` functionality (#11004)
- feat(profiling-node): Refactor deprecated methods & non-hook variant (#10984)
- feat(react): Update scope's `transactionName` in React Router instrumentations (#11048)
- feat(remix): Refactor to use new performance APIs (#10980)
- feat(remix): Update remix SDK to be OTEL-powered (#11031)
- feat(sveltekit): Export `unstable_sentryVitePluginOptions` for full Vite plugin customization (#10930)
- feat(v8/bun): Update @sentry/bun to use OTEL node (#10997)
- fix(ember): Ensure browser tracing is correctly lazy loaded (#11026)
- fix(nextjs): Use passthrough `createReduxEnhancer` on server (#11005)
- fix(node): Add missing core re-exports (#10931)
- fix(node): Correct SDK name (#10961)
- fix(node): Do not assert in vendored proxy code (#11011)
- fix(node): Export spotlightIntegration from OTEL node (#10973)
- fix(node): support undici headers as strings or arrays (#10938)
- fix(opentelemetry): Fix span & sampling propagation (#11092)
- fix(react): Passes the fallback function through React's createElement function (#10623)
- fix(react): Set `handled` value in ErrorBoundary depending on fallback (#10989)
- fix(types): Add `addScopeListener` to `Scope` interface (#10952)
- fix(types): Add `AttachmentType` and use for envelope `attachment_type` property (#10946)
- fix(types): Remove usage of `allowSyntheticDefaultImports` (#11073)
- fix(v8/utils): Stack parser skip frames (not lines of stack string) (#10560)
- ref(angular): Refactor usage of `startChild` (#11056)
- ref(browser): Store browser metrics as attributes instead of tags (#10823)
- ref(browser): Update `scope.transactionName` on pageload and navigation span creation (#10992)
- ref(browser): Update browser metrics to avoid deprecations (#10943)
- ref(browser): Update browser profiling to avoid deprecated APIs (#11007)
- ref(feedback): Move UserFeedback type into feedback.ts (#11032)
- ref(nextjs): Clean up browser tracing integration (#11022)
- ref(node-experimental): Refactor usage of `startChild()` (#11047)
- ref(node): Use new performance APIs in legacy `http` & `undici` (#11055)
- ref(opentelemetry): Remove parent span map (#11014)
- ref(opentelemetry): Remove span metadata handling (#11020)

Work in this release contributed by @MFoster and @jessezhang91. Thank you for your contributions!

## 8.0.0-alpha.3

This alpha was released in an incomplete state. We recommend skipping this release and using the `8.0.0-alpha.4` release
instead.

## 8.0.0-alpha.2

This alpha release fixes a build problem that prevented 8.0.0-alpha.1 from being properly released.

### Important Changes

- **feat: Remove `@sentry/opentelemetry-node` package (#10906)**

The `@sentry/opentelemetry-node` package has been removed. Instead, you can either use `@sentry/node` with built-in
OpenTelemetry support, or use `@sentry/opentelemetry` to manually connect Sentry with OpenTelemetry.

### Removal/Refactoring of deprecated functionality

- ref: Refactor some deprecated `startSpan` options (#10825)
- feat(v8/core): remove void from transport return (#10794)
- ref(integrations): Delete deprecated class integrations (#10887)

### Other Changes

- feat(core): Use serialized spans in transaction event (#10912)
- feat(deps): bump @sentry/cli from 2.28.6 to 2.29.1 (#10908)
- feat(node): Allow to configure `skipOpenTelemetrySetup` (#10907)
- feat(esm): Import rather than require `inspector` (#10910)
- fix(browser): Don't use chrome variable name (#10874)
- chore(sveltekit): Fix punctuation in a console.log (#10895)
- fix(opentelemetry): Ensure DSC propagation works correctly (#10904)
- feat(browser): Exclude span exports from non-performance CDN bundles (#10879)
- ref: Refactor span status handling to be OTEL compatible (#10871)
- feat(core): Fix span scope handling & transaction setting (#10886)
- ref(ember): Avoid namespace import to hopefully resolve minification issue (#10885)

Work in this release contributed by @harish-talview & @bfontaine. Thank you for your contributions!

## 8.0.0-alpha.1

This is the first Alpha release of the v8 cycle, which includes a variety of breaking changes.

Read the [in-depth migration guide](./MIGRATION.md) to find out how to address any breaking changes in your code.

### Important Changes

**- feat(node): Make `@sentry/node` powered by OpenTelemetry (#10762)**

The biggest change is the switch to use OpenTelemetry under the hood in `@sentry/node`. This brings with it a variety of
changes:

- There is now automated performance instrumentation for Express, Fastify, Nest.js and Koa. You can remove any
  performance and request isolation code you previously wrote manually for these frameworks.
- All performance instrumention is enabled by default, and will only take effect if the instrumented package is used.
  You don't need to use `autoDiscoverNodePerformanceMonitoringIntegrations()` anymore.
- You need to ensure to call `Sentry.init()` _before_ you import any other packages. Otherwise, the packages cannot be
  instrumented:

```js
const Sentry = require('@sentry/node');
Sentry.init({
  dsn: '...',
  // ... other config here
});
// now require other things below this!
const http = require('http');
const express = require('express');
// ....
```

- Currently, we only support CJS-based Node application out of the box. There is experimental ESM support, see
  [the instructions](./packages/node-experimental/README.md#esm-support).
- `startTransaction` and `span.startChild()` are no longer supported. This is due to the underlying change to
  OpenTelemetry powered performance instrumentation. See
  [docs on the new performance APIs](./docs/v8-new-performance-apis.md) for details.

Related changes:

- feat(node-experimental): Add missing re-exports (#10679)
- feat(node-experimental): Move `defaultStackParser` & `getSentryRelease` (#10722)
- feat(node-experimental): Move `errorHandler` (#10728)
- feat(node-experimental): Move cron code over (#10742)
- feat(node-experimental): Move integrations from node (#10743)
- feat(node-experimental): Properly set request & session on http requests (#10676)
- feat(opentelemetry): Support `forceTransaction` in OTEL (#10807)
- feat(opentelemetry): Align span options with core span options (#10761)
- feat(opentelemetry): Do not capture span events as breadcrumbs (#10612)
- feat(opentelemetry): Ensure DSC & attributes are correctly set (#10806)
- feat(opentelemetry): Fix & align isolation scope usage in node-experimental (#10570)
- feat(opentelemetry): Merge node-experimental changes into opentelemetry (#10689)
- ref(node-experimental): Cleanup re-exports (#10741)
- ref(node-experimental): Cleanup tracing intergations (#10730)
- ref(node-experimental): Copy transport & client to node-experimental (#10720)
- ref(node-experimental): Remove custom `isInitialized` (#10607)
- ref(node-experimental): Remove custom hub & scope (#10616)
- ref(node-experimental): Remove deprecated class integrations (#10675)
- ref(node-experimental): Rename `errorHandler` to `expressErrorHandler` (#10746)
- ref(node-integration-tests): Migrate to new Http integration (#10765)
- ref(node): Align semantic attribute handling (#10827)

**- feat: Remove `@sentry/integrations` package (#10799)**

This package is no longer published. You can instead import these pluggable integrations directly from your SDK package
(e.g. `@sentry/browser` or `@sentry/react`).

**- feat: Remove `@sentry/hub` package (#10783)**

This package is no longer published. You can instead import directly from your SDK package (e.g. `@sentry/react` or
`@sentry/node`).

**- feat(v8): Remove @sentry/tracing (#10625)**

This package is no longer published. You can instead import directly from your SDK package (e.g. `@sentry/react` or
`@sentry/node`).

**- feat: Set required node version to >=14.8.0 for all packages (#10834)**

The minimum required node version is now 14.8+. If you need support for older node versions, you can stay on the v7
branch.

**- Removed class-based integrations**

We have removed most of the deprecated class-based integrations. Instead, you can use the functional styles:

```js
import * as Sentry from '@sentry/browser';
// v7
Sentry.init({
  integrations: [new Sentry.BrowserTracing()],
});
// v8
Sentry.init({
  integrations: [new Sentry.browserTracingIntegration()],
});
```

- ref: Remove `BrowserTracing` (#10653)
- feat(v8/node): Remove LocalVariables class integration (#10558)
- feat(v8/react): Delete react router exports (#10532)
- feat(v8/vue): Remove all deprecated exports from vue (#10533)
- feat(v8/wasm): Remove deprecated exports (#10552)

**- feat(v8/browser): Remove XHR transport (#10703)**

We have removed the XHR transport, and are instead using the fetch-based transport now by default. This means that if
you are using Sentry in a browser environment without fetch, you'll need to either provide a fetch polyfill, or provide
a custom transport to Sentry.

**- feat(sveltekit): Update `@sentry/vite-plugin` to 2.x and adjust options API (#10813)**

We have updated `@sentry/sveltekit` to use the latest version of `@sentry/vite-plugin`, which lead to changes in
configuration options.

### Other Changes

- feat: Ensure `withActiveSpan` is exported everywhere (#10878)
- feat: Allow passing `null` to `withActiveSpan` (#10717)
- feat: Implement new Async Context Strategy (#10647)
- feat: Remove `hub` from global, `hub.run` & hub utilities (#10718)
- feat: Update default trace propagation targets logic in the browser (#10621)
- feat: Ignore ResizeObserver and undefined error (#10845)
- feat(browser): Export `getIsolationScope` and `getGlobalScope` (#10658)
- feat(browser): Prevent initialization in browser extensions (#10844)
- feat(core): Add metric summaries to spans (#10554)
- feat(core): Decouple metrics aggregation from client (#10628)
- feat(core): Lookup client on current scope, not hub (#10635)
- feat(core): Make `setXXX` methods set on isolation scope (#10678)
- feat(core): Make custom tracing methods return spans & set default op (#10633)
- feat(core): Make global `addBreadcrumb` write to the isolation scope instead of current scope (#10586)
- feat(core): Remove health check transaction filters (#10818)
- feat(core): Streamline custom hub creation for node-experimental (#10555)
- feat(core): Update `addEventProcessor` to add to isolation scope (#10606)
- feat(core): Update `Sentry.addBreadcrumb` to skip hub (#10601)
- feat(core): Use global `TextEncoder` and `TextDecoder` (#10701)
- feat(deps): bump @sentry/cli from 2.26.0 to 2.28.0 (#10496)
- feat(deps): bump @sentry/cli from 2.28.0 to 2.28.5 (#10620)
- feat(deps): bump @sentry/cli from 2.28.5 to 2.28.6 (#10727)
- feat(integrations): Capture error arguments as exception regardless of level in `captureConsoleIntegration` (#10744)
- feat(metrics): Remove metrics method from `BaseClient` (#10789)
- feat(node): Remove unnecessary URL imports (#10860)
- feat(react): Drop support for React 15 (#10115)
- feat(remix): Add Vite dev-mode support to Express instrumentation. (#10784)
- fix: Export session API (#10711)
- fix(angular-ivy): Add `exports` field to `package.json` (#10569)
- fix(angular): Ensure navigations always create a transaction (#10646)
- fix(core): Add lost scope tests & fix update case (#10738)
- fix(core): Fix scope capturing via `captureContext` function (#10735)
- fix(feedback): Replay breadcrumb for feedback events was incorrect (#10536)
- fix(nextjs): Remove `webpack://` prefix more broadly from source map `sources` field (#10642)
- fix(node): import `worker_threads` and fix node v14 types (#10791)
- fix(node): Record local variables with falsy values, `null` and `undefined` (#10821)
- fix(stacktrace): Always use `?` for anonymous function name (#10732)
- fix(sveltekit): Avoid capturing Http 4xx errors on the client (#10571)
- fix(sveltekit): Ensure navigations and redirects always create a new transaction (#10656)
- fix(sveltekit): Properly await sourcemaps flattening (#10602)
- fix(types): Improve attachment type (#10832)
- fx(node): Fix anr worker check (#10719)
- ref: Cleanup browser profiling integration (#10766)
- ref: Collect child spans references via non-enumerable on Span object (#10715)
- ref: Make scope setters on hub only write to isolation scope (#10572)
- ref: Store runtime on isolation scope (#10657)
- ref(astro): Put request as SDK processing metadata instead of span data (#10840)
- ref(core): Always use a (default) ACS (#10644)
- ref(core): Make `on` and `emit` required on client (#10603)
- ref(core): Make remaining client methods required (#10605)
- ref(core): Rename `Span` class to `SentrySpan` (#10687)
- ref(core): Restructure hub exports (#10639)
- ref(core): Skip hub in top level `captureXXX` methods (#10688)
- ref(core): Allow `number` as span `traceFlag` (#10855)
- ref(core): Remove `status` field from Span (#10856)
- ref(remix): Make `@remix-run/router` a dependency. (#10479)
- ref(replay): Use `beforeAddBreadcrumb` hook instead of scope listener (#10600)
- ref(sveltekit): Hard-pin Vite plugin version (#10843)

### Other Deprecation Removals/Changes

We have also removed or updated a variety of deprecated APIs.

- feat(v8): Remove `extractTraceparentData` export (#10559)
- feat(v8): Remove defaultIntegrations deprecated export (#10691)
- feat(v8): Remove deprecated `span.isSuccess` method (#10699)
- feat(v8): Remove deprecated `traceHeaders` method (#10776)
- feat(v8): Remove deprecated addInstrumentationHandler (#10693)
- feat(v8): Remove deprecated configureScope call (#10565)
- feat(v8): Remove deprecated runWithAsyncContext API (#10780)
- feat(v8): Remove deprecated spanStatusfromHttpCode export (#10563)
- feat(v8): Remove deprecated trace and startActiveSpan methods (#10593)
- feat(v8): Remove requestData deprecations (#10626)
- feat(v8): Remove Severity enum (#10551)
- feat(v8): Remove span.origin (#10753)
- feat(v8): Remove span.toTraceparent method (#10698)
- feat(v8): Remove usage of span.description and span.name (#10697)
- feat(v8): Update eventFromUnknownInput to only use client (#10692)
- feat(v8/astro): Remove deprecated exports from Astro SDK (#10611)
- feat(v8/browser): Remove `_eventFromIncompleteOnError` usage (#10553)
- feat(v8/browser): Remove XHR transport (#10703)
- feat(v8/browser): Rename TryCatch integration to `browserApiErrorsIntegration` (#10755)
- feat(v8/core): Remove deprecated setHttpStatus (#10774)
- feat(v8/core): Remove deprecated updateWithContext method (#10800)
- feat(v8/core): Remove getters for span.op (#10767)
- feat(v8/core): Remove span.finish call (#10773)
- feat(v8/core): Remove span.instrumenter and instrumenter option (#10769)
- feat(v8/ember): Remove deprecated exports (#10535)
- feat(v8/integrations): Remove deprecated exports (#10556)
- feat(v8/node): Remove deepReadDirSync export (#10564)
- feat(v8/node): Remove deprecated anr methods (#10562)
- feat(v8/node): Remove getModuleFromFilename export (#10754)
- feat(core): Remove deprecated props from `Span` interface (#10854)
- fix(v8): Remove deprecated tracing config (#10870)
- ref: Make `setupOnce` optional in integrations (#10729)
- ref: Migrate transaction source from metadata to attributes (#10674)
- ref: Refactor remaining `makeMain` usage (#10713)
- ref(astro): Remove deprecated Replay and BrowserTracing (#10768)
- feat(core): Remove deprecated `scope.applyToEvent()` method (#10842)
- ref(integrations): Remove offline integration (#9456)
- ref(nextjs): Remove all deprecated API (#10549)
- ref: Remove `lastEventId` (#10585)
- ref: Remove `reuseExisting` option for ACS (#10645)
- ref: Remove `tracingOrigins` options (#10614)
- ref: Remove deprecated `showReportDialog` APIs (#10609)
- ref: Remove usage of span tags (#10808)
- ref: Remove user segment (#10575)

## 7.x

A full list of changes in the `7.x` release of the SDK can be found in the [7.x Changelog](./docs/changelog/v7.md).

## 6.x

A full list of changes in the `6.x` release of the SDK can be found in the [6.x Changelog](./docs/changelog/v6.md).

## 5.x

A full list of changes in the `5.x` release of the SDK can be found in the [5.x Changelog](./docs/changelog/v5.md).

## 4.x

A full list of changes in the `4.x` release of the SDK can be found in the [4.x Changelog](./docs/changelog/v4.md).
