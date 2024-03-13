# Changelog

## Unreleased

- "You miss 100 percent of the chances you don't take. — Wayne Gretzky" — Michael Scott

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

## 7.107.0

This release fixes issues with INP instrumentation with the Next.js SDK and adds support for the `enableInp` option in
the deprecated `BrowserTracing` integration for backwards compatibility.

- feat(performance): Port INP span instrumentation to old browser tracing (#11085)
- fix(ember): Ensure browser tracing is correctly lazy loaded (#11027)
- fix(node): Do not assert in vendored proxy code (v7 backport) (#11009)
- fix(react): Set `handled` value in ErrorBoundary depending on fallback [v7] (#11037)

## 7.106.1

- fix(nextjs/v7): Use passthrough `createReduxEnhancer` on server (#11010)

## 7.106.0

- feat(nextjs): Support Hybrid Cloud DSNs with `tunnelRoute` option (#10958)
- feat(remix): Add Vite dev-mode support to Express instrumentation (#10811)
- fix(core): Undeprecate `setTransactionName`
- fix(browser): Don't use chrome variable name (#10874)
- fix(nextjs): Client code should not use Node `global` (#10925)
- fix(node): support undici headers as strings or arrays (#10938)
- fix(types): Add `AttachmentType` and use for envelope `attachment_type` property (#10946)
- ref(ember): Avoid namespace import to hopefully resolve minification issue (#10885)
- chore(sveltekit): Fix punctuation in a console.log (#10895)

Work in this release contributed by @jessezhang91 and @bfontaine. Thank you for your contributions!

## 7.105.0

### Important Changes

- **feat: Ensure `withActiveSpan` is exported everywhere (#10877)**

You can use the `withActiveSpan` method to ensure a certain span is the active span in a given callback. This can be
used to create a span as a child of a specific span with the `startSpan` API methods:

```js
const parentSpan = Sentry.startInactiveSpan({ name: 'parent' });
if (parentSpan) {
  withActiveSpan(parentSpan, () => {
    // This will be a direct child of parentSpan
    const childSpan = Sentry.startInactiveSpan({ name: 'child' });
  });
}
```

## 7.104.0

### Important Changes

- **feat(performance): create Interaction standalone spans on inp events (#10709)**

This release adds support for the INP web vital. This is currently only supported for Saas Sentry, and product support
is released with the upcoming `24.3.0` release of self-hosted.

To opt-in to this feature, you can use the `enableInp` option in the `browserTracingIntegration`:

```js
Sentry.init({
  integrations: [
    Sentry.browserTracingIntegration({
      enableInp: true,
    });
  ]
})
```

### Other Changes

- feat(feedback): Flush replays when feedback form opens (#10567)
- feat(profiling-node): Expose `nodeProfilingIntegration` (#10864)
- fix(profiling-node): Fix dependencies to point to current versions (#10861)
- fix(replay): Add `errorHandler` for replayCanvas integration (#10796)

## 7.103.0

### Important Changes

- **feat(core): Allow to pass `forceTransaction` to `startSpan()` APIs (#10819)**

You can now pass `forceTransaction: true` to `startSpan()`, `startSpanManual()` and `startInactiveSpan()`. This allows
you to start a span that you want to be a transaction, if possible. Under the hood, the SDK will connect this span to
the running active span (if there is one), but still send the new span as a transaction to the Sentry backend, if
possible, ensuring it shows up as a transaction throughout the system.

Please note that setting this to `true` does not _guarantee_ that this will be sent as a transaction, but that the SDK
will try to do so. You can enable this flag if this span is important to you and you want to ensure that you can see it
in the Sentry UI.

### Other Changes

- fix: Make breadcrumbs option optional in WinterCGFetch integration (#10792)

## 7.102.1

- fix(performance): Fixes latest route name and source for interactions not updating properly on navigation (#10702)
- fix(tracing): Guard against missing `window.location` (#10659)
- ref: Make span types more robust (#10660)
- ref(remix): Make `@remix-run/router` a dependency (v7) (#10779)

## 7.102.0

- fix: Export session API (#10712)
- fix(core): Fix scope capturing via `captureContext` function (#10737)

## 7.101.1

In version 7.101.0 the `@sentry/hub` package was missing due to a publishing issue. This release contains the package
again.

- fix(nextjs): Remove `webpack://` prefix more broadly from source map `sources` field (#10641)

## 7.101.0

- feat: Export semantic attribute keys from SDK packages (#10637)
- feat(core): Add metric summaries to spans (#10554)
- feat(core): Deprecate the `Hub` constructor (#10584)
- feat(core): Make custom tracing methods return spans & set default op (#10633)
- feat(replay): Add `getReplay` utility function (#10510)
- fix(angular-ivy): Add `exports` field to `package.json` (#10569)
- fix(sveltekit): Avoid capturing Http 4xx errors on the client (#10571)
- fix(sveltekit): Properly await sourcemaps flattening (#10602)

## 7.100.1

This release contains build fixes for profiling-node.

- build(profiling-node): make sure debug build plugin is used #10534
- build: Only run profiling e2e test if bindings have changed #10542
- fix(feedback): Replay breadcrumb for feedback events was incorrect #10536

## 7.100.0

### Important Changes

#### Deprecations

This release includes some deprecations. For more details please look at our
[migration guide](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md).

The deprecation most likely to affect you is the one of `BrowserTracing`. Instead of `new BrowserTracing()`, you should
now use `browserTracingIntegration()`, which will also handle framework-specific instrumentation out of the box for
you - no need to pass a custom `routingInstrumentation` anymore. For `@sentry/react`, we expose dedicated integrations
for the different react-router versions:

- `reactRouterV6BrowserTracingIntegration()`
- `reactRouterV5BrowserTracingIntegration()`
- `reactRouterV4BrowserTracingIntegration()`
- `reactRouterV3BrowserTracingIntegration()`

See the
[migration guide](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md#depreacted-browsertracing-integration)
for details.

- feat(angular): Export custom `browserTracingIntegration()` (#10353)
- feat(browser): Deprecate `BrowserTracing` integration (#10493)
- feat(browser): Export `browserProfilingIntegration` (#10438)
- feat(bun): Export `bunServerIntegration()` (#10439)
- feat(nextjs): Add `browserTracingIntegration` (#10397)
- feat(react): Add `reactRouterV3BrowserTracingIntegration` for react router v3 (#10489)
- feat(react): Add `reactRouterV4/V5BrowserTracingIntegration` for react router v4 & v5 (#10488)
- feat(react): Add `reactRouterV6BrowserTracingIntegration` for react router v6 & v6.4 (#10491)
- feat(remix): Add custom `browserTracingIntegration` (#10442)
- feat(node): Expose functional integrations to replace classes (#10356)
- feat(vercel-edge): Replace `WinterCGFetch` with `winterCGFetchIntegration` (#10436)
- feat: Deprecate non-callback based `continueTrace` (#10301)
- feat(vue): Deprecate `new VueIntegration()` (#10440)
- feat(vue): Implement vue `browserTracingIntegration()` (#10477)
- feat(sveltekit): Add custom `browserTracingIntegration()` (#10450)

#### Profiling Node

`@sentry/profiling-node` has been ported into the monorepo. Future development for it will happen here!

- pkg(profiling-node): port profiling-node repo to monorepo (#10151)

### Other Changes

- feat: Export `setHttpStatus` from all packages (#10475)
- feat(bundles): Add pluggable integrations on CDN to `Sentry` namespace (#10452)
- feat(core): Pass `name` & `attributes` to `tracesSampler` (#10426)
- feat(feedback): Add `system-ui` to start of font family (#10464)
- feat(node-experimental): Add koa integration (#10451)
- feat(node-experimental): Update opentelemetry packages (#10456)
- feat(node-experimental): Update tracing integrations to functional style (#10443)
- feat(replay): Bump `rrweb` to 2.10.0 (#10445)
- feat(replay): Enforce masking of credit card fields (#10472)
- feat(utils): Add `propagationContextFromHeaders` (#10313)
- fix: Make `startSpan`, `startSpanManual` and `startInactiveSpan` pick up the scopes at time of creation instead of
  termination (#10492)
- fix(feedback): Fix logo color when colorScheme is "system" (#10465)
- fix(nextjs): Do not report redirects and notFound calls as errors in server actions (#10474)
- fix(nextjs): Fix navigation tracing on app router (#10502)
- fix(nextjs): Apply server action data to correct isolation scope (#10514)
- fix(node): Use normal `require` call to import Undici (#10388)
- ref(nextjs): Remove internally used deprecated APIs (#10453)
- ref(vue): use startInactiveSpan in tracing mixin (#10406)

## 7.99.0

### Important Changes

#### Deprecations

This release includes some deprecations for span related methods and integrations in our Deno SDK, `@sentry/deno`. For
more details please look at our
[migration guide](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md).

- feat(core): Deprecate `Span.setHttpStatus` in favor of `setHttpStatus` (#10268)
- feat(core): Deprecate `spanStatusfromHttpCode` in favour of `getSpanStatusFromHttpCode` (#10361)
- feat(core): Deprecate `StartSpanOptions.origin` in favour of passing attribute (#10274)
- feat(deno): Expose functional integrations to replace classes (#10355)

### Other Changes

- feat(bun): Add missing `@sentry/node` re-exports (#10396)
- feat(core): Add `afterAllSetup` hook for integrations (#10345)
- feat(core): Ensure `startSpan()` can handle spans that require parent (#10386)
- feat(core): Read propagation context off scopes in `startSpan` APIs (#10300)
- feat(remix): Export missing `@sentry/node` functions (#10385, #10391)
- feat(serverless): Add missing `@sentry/node` re-exports (#10390)
- feat(sveltekit): Add more missing `@sentry/node` re-exports (#10392)
- feat(tracing): Export proper type for browser tracing (#10411)
- feat(tracing): Expose new `browserTracingIntegration` (#10351)
- fix: Ensure `afterAllSetup` is called when using `addIntegration()` (#10372)
- fix(core): Export `spanToTraceContext` function from span utils (#10364)
- fix(core): Make `FunctionToString` integration use SETUP_CLIENTS weakmap (#10358)
- fix(deno): Call function if client is not setup (#10354)
- fix(react): Fix attachReduxState option (#10381)
- fix(spotlight): Use unpatched http.request (#10369)
- fix(tracing): Only create request span if there is active span (#10375)
- ref: Read propagation context off of scope and isolation scope when propagating and applying trace context (#10297)

Work in this release contributed by @AleshaOleg. Thank you for your contribution!

## 7.98.0

This release primarily fixes some type declaration errors:

- feat(core): Export `IntegrationIndex` type (#10337)
- fix(nextjs): Fix Http integration type declaration (#10338)
- fix(node): Fix type definitions (#10339)

## 7.97.0

Note: The 7.96.0 release was incomplete. This release is partially encompassing changes from `7.96.0`.

- feat(react): Add `stripBasename` option for React Router 6 (#10314)

## 7.96.0

Note: This release was incomplete. Not all Sentry SDK packages were released for this version. Please upgrade to 7.98.0
directly.

### Important Changes

#### Deprecations

This release includes some deprecations for integrations in `@sentry/browser` and frontend framework SDKs
(`@sentry/react`, `@sentry/vue`, etc.). Please take a look at our
[migration guide](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md) for more details.

- feat(browser): Export functional integrations & deprecate classes (#10267)

#### Web Vitals Fix for LCP and CLS

This release fixes an issue with the Web Vitals integration where LCP and CLS were not being captured correctly,
increasing capture rate by 10-30% for some apps. LCP and CLS capturing issues were introduced with version `7.75.0`.

- fix(tracing): Ensure web vitals are correctly stopped/captured (#10323)

### Other Changes

- fix(node): Fix `node-cron` types and add test (#10315)
- fix(node): Fix downleveled types entry point (#10321)
- fix(node): LocalVariables integration should use setupOnce (#10307)
- fix(replay): Fix type for options of replayIntegration (#10325)

Work in this release contributed by @Shubhdeep12. Thank you for your contribution!

## 7.95.0

### Important Changes

#### Deprecations

This release includes some deprecations in preparation for v8.

Most notably, it deprecates the `Replay` & `Feedback` classes in favor of a functional replacement:

```js
import * as Sentry from '@sentry/browser';

Sentry.init({
  integrations: [
    // Instead of
    new Sentry.Replay(),
    new Sentry.Feedback(),
    // Use the functional replacement:
    Sentry.replayIntegration(),
    Sentry.feedbackIntegration(),
  ],
});
```

- feat(core): Deprecate `Span.origin` in favor of `sentry.origin` attribute (#10260)
- feat(core): Deprecate `Span.parentSpanId` (#10244)
- feat(core): Expose `isInitialized()` to replace checking via `getClient` (#10296)
- feat(replay): Deprecate `Replay`, `ReplayCanvas`, `Feedback` classes (#10270)
- feat(wasm): Deprecate `Wasm` integration class (#10230)

### Other Changes

- feat: Make `parameterize` function available through browser and node API (#10085)
- feat(feedback): Configure feedback border radius (#10289)
- feat(sveltekit): Update default integration handling & deprecate `addOrUpdateIntegration` (#10263)
- fix(replay-canvas): Add missing dependency on @sentry/utils (#10279)
- fix(tracing): Don't send negative ttfb (#10286)

Work in this release contributed by @AleshaOleg. Thank you for your contribution!

## 7.94.1

This release fixes a publishing issue.

## 7.94.0

### Important Changes

#### Deprecations

As we're moving closer to the next major version of the SDK, more public APIs were deprecated.

To get a head start on migrating to the replacement APIs, please take a look at our
[migration guide](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md).

- feat: Deprecate user segment field (#10210)
- feat(core): Deprecate `finish` on `Span` interface in favour of `end` (#10161)
- feat(core): Deprecate `getCurrentHub()` (#10200)
- feat(core): Deprecate `hub.bindClient()` & `makeMain()` (#10188)
- feat(core): Deprecate `Span.instrumenter` (#10139)
- feat(core): Deprecate `Span.isSuccess()` in favor of reading span status (#10213)
- feat(core): Deprecate `Span.op` in favor of op attribute (#10189)
- feat(core): Deprecate `Span.spanRecorder` (#10199)
- feat(core): Deprecate `Span.status` (#10208)
- feat(core): Deprecate `Span.transaction` in favor of `getRootSpan` (#10134)
- feat(core): Deprecate `Transaction.instrumenter` (#10162)
- feat(core): Deprecate `Transaction.setMeasurement` in favor of `setMeasurement` (#10182)
- feat(core): Deprecate integration classes & `Integrations.X` (#10198)
- feat(core): Deprecate methods on `Hub` (#10124)
- feat(core): Deprecate remaining `setName` declarations on `Transaction` and `Span` (#10164)
- feat(core): Deprecate span `startTimestamp` & `endTimestamp` (#10192)
- feat(core): Deprecate `hub.bindClient()` and `makeMain()` (#10118)
- feat(types): Deprecate `op` on `Span` interface (#10217)
- feat(integrations): Deprecate `Transaction` integration (#10178)
- feat(integrations): Deprecate pluggable integration classes (#10211)

#### Replay & Canvas

We have added a new `ReplayCanvas` integration (#10112), which you can add to capture the contents of canvas elements
with Replay.

Just add it _in addition_ to the regular replay integration:

```js
Sentry.init({
  integrations: [new Sentry.Replay(), new Sentry.ReplayCanvas()],
});
```

### Other Changes

- feat(core): Add `client.getIntegrationByName()` (#10130)
- feat(core): Add `client.init()` to replace `client.setupIntegrations()` (#10118)
- feat(core): Add `withActiveSpan` (#10195)
- feat(core): Add `withIsolationScope` (#10141)
- feat(core): Streamline integration function results to be compatible (#10135)
- feat(core): Write data from `setUser`, `setTags`, `setExtras`, `setTag`, `setExtra`, and `setContext` to isolation
  scope (#10163)
- feat(core): Add domain information to resource span data #10205
- feat(feedback): Export sendFeedback from @sentry/browser (#10231)
- feat(node): Update and vendor https-proxy-agent (#10088)
- feat(node-experimental): Add `withActiveSpan` (#10194)
- feat(replays): Add snapshot function to replay canvas integration (#10066)
- feat(types): Add `SerializedEvent` interface (pre v8) (#10240)
- feat(types): Add support for new monitor config thresholds (#10225)
- fix: Ensure all integration classes have correct types (#10183)
- fix(astro): Fix import path when using external init files with default path (#10214)
- fix(cdn): Emit console warning instead of error for integration shims (#10193)
- fix(core): Take user from current scope when starting a session (#10153)
- fix(node-experimental): Ensure `http.status_code` is always a string (#10177)
- fix(node): Guard against `process.argv[1]` being undefined (#10155)
- fix(node): Module name resolution (#10144)
- fix(node): Remove leading slash in Windows filenames (#10147)
- fix(remix): Capture thrown fetch responses. (#10166)
- fix(tracing): Gate mongo operation span data behind sendDefaultPii (#10227)
- fix(tracing-internal): Delay pageload transaction finish until document is interactive (#10215)
- fix(tracing-internal): Only collect request/response spans when browser performance timing is available (#10207)
- fix(tracing-internal): Prefer `fetch` init headers over `fetch` input headers (#10176)
- fix(utils): Ensure dropUndefinedKeys() does not break class instances (#10245)

## 7.93.0

### Important Changes

#### Deprecations

As we're moving closer to the next major version of the SDK, more public APIs were deprecated.

To get a head start on migrating to the replacement APIs, please take a look at our
[migration guide](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md).

- feat(core): Deprecate `getActiveTransaction()` & `scope.getTransaction()` (#10098)
- feat(core): Deprecate `Hub.shouldSendDefaultPii` (#10062)
- feat(core): Deprecate `new Transaction()` (#10125)
- feat(core): Deprecate `scope.getSpan()` & `scope.setSpan()` (#10114)
- feat(core): Deprecate `scope.setTransactionName()` (#10113)
- feat(core): Deprecate `span.startChild()` (#10091)
- feat(core): Deprecate `startTransaction()` (#10073)
- feat(core): Deprecate `Transaction.getDynamicSamplingContext` in favor of `getDynamicSamplingContextFromSpan` (#10094)
- feat(core): Deprecate arguments for `startSpan()` (#10101)
- feat(core): Deprecate hub capture APIs and add them to `Scope` (#10039)
- feat(core): Deprecate session APIs on hub and add global replacements (#10054)
- feat(core): Deprecate span `name` and `description` (#10056)
- feat(core): Deprecate span `tags`, `data`, `context` & setters (#10053)
- feat(core): Deprecate transaction metadata in favor of attributes (#10097)
- feat(core): Deprecate `span.sampled` in favor of `span.isRecording()` (#10034)
- ref(node-experimental): Deprecate `lastEventId` on scope (#10093)

#### Cron Monitoring Support for `node-schedule` library

This release adds auto instrumented check-ins for the `node-schedule` library.

```ts
import * as Sentry from '@sentry/node';
import * as schedule from 'node-schedule';

const scheduleWithCheckIn = Sentry.cron.instrumentNodeSchedule(schedule);

const job = scheduleWithCheckIn.scheduleJob('my-cron-job', '* * * * *', () => {
  console.log('You will see this message every minute');
});
```

- feat(node): Instrumentation for `node-schedule` library (#10086)

### Other Changes

- feat(core): Add `span.spanContext()` (#10037)
- feat(core): Add `spanToJSON()` method to get span properties (#10074)
- feat(core): Allow to pass `scope` to `startSpan` APIs (#10076)
- feat(core): Allow to pass start/end timestamp for spans flexibly (#10060)
- feat(node): Make `getModuleFromFilename` compatible with ESM (#10061)
- feat(replay): Update rrweb to 2.7.3 (#10072)
- feat(utils): Add `parameterize` function (#9145)
- fix(astro): Use correct package name for CF (#10099)
- fix(core): Do not run `setup` for integration on client multiple times (#10116)
- fix(core): Ensure we copy passed in span data/tags/attributes (#10105)
- fix(cron): Make name required for instrumentNodeCron option (#10070)
- fix(nextjs): Don't capture not-found and redirect errors in generation functions (#10057)
- fix(node): `LocalVariables` integration should have correct name (#10084)
- fix(node): Anr events should have an `event_id` (#10068)
- fix(node): Revert to only use sync debugger for `LocalVariables` (#10077)
- fix(node): Update ANR min node version to v16.17.0 (#10107)

## 7.92.0

### Important Changes

#### Deprecations

- feat(core): Add `span.updateName()` and deprecate `span.setName()` (#10018)
- feat(core): Deprecate `span.getTraceContext()` (#10032)
- feat(core): Deprecate `span.toTraceparent()` in favor of `spanToTraceHeader()` util (#10031)
- feat(core): Deprecate `trace` in favor of `startSpan` (#10012)
- feat(core): Deprecate span `toContext()` and `updateWithContext()` (#10030)
- ref: Deprecate `deepReadDirSync` (#10016)
- ref: Deprecate `lastEventId()` (#10043)

Please take a look at the [Migration docs](./MIGRATION.md) for more details. These methods will be removed in the
upcoming [v8 major release](https://github.com/getsentry/sentry-javascript/discussions/9802).

#### Cron Monitoring Support for `cron` and `node-cron` libraries

- feat(node): Instrumentation for `cron` library (#9999)
- feat(node): Instrumentation for `node-cron` library (#9904)

This release adds instrumentation for the `cron` and `node-cron` libraries. This allows you to monitor your cron jobs
with [Sentry cron monitors](https://docs.sentry.io/product/crons/).

For [`cron`](https://www.npmjs.com/package/cron):

```js
import * as Sentry from '@sentry/node';
import { CronJob } from 'cron';

const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, 'my-cron-job');

// use the constructor
const job = new CronJobWithCheckIn('* * * * *', () => {
  console.log('You will see this message every minute');
});

// or from
const job = CronJobWithCheckIn.from({
  cronTime: '* * * * *',
  onTick: () => {
    console.log('You will see this message every minute');
  },
});
```

For [`node-cron`](https://www.npmjs.com/package/node-cron):

```js
import * as Sentry from '@sentry/node';
import cron from 'node-cron';

const cronWithCheckIn = Sentry.cron.instrumentNodeCron(cron);

cronWithCheckIn.schedule(
  '* * * * *',
  () => {
    console.log('running a task every minute');
  },
  { name: 'my-cron-job' },
);
```

### Other Changes

- feat(astro): Add `enabled` option to Astro integration options (#10007)
- feat(core): Add `attributes` to `Span` (#10008)
- feat(core): Add `setClient()` and `getClient()` to `Scope` (#10055)
- feat(integrations): Capture error cause with `captureErrorCause` in `ExtraErrorData` integration (#9914)
- feat(node-experimental): Allow to pass base span options to trace methods (#10006)
- feat(node): Local variables via async inspector in node 19+ (#9962)
- fix(astro): handle commonjs related issues (#10042)
- fix(astro): Handle non-utf8 encoded streams in middleware (#9989)
- fix(astro): prevent sentry from externalized (#9994)
- fix(core): Ensure `withScope` sets current scope correctly with async callbacks (#9974)
- fix(node): ANR fixes and additions (#9998)
- fix(node): Anr should not block exit (#10035)
- fix(node): Correctly resolve module name (#10001)
- fix(node): Handle inspector already open (#10025)
- fix(node): Make `NODE_VERSION` properties required (#9964)
- fix(node): Anr doesn't block exit (#10064)
- fix(utils): use correct typeof URL validation (#10028)
- perf(astro): reduce unnecessary path resolutions (#10021)
- ref(astro): Use astro logger instead of console (#9995)
- ref(remix): Isolate Express instrumentation from server auto-instrumentation. (#9966)

Work in this release contributed by @joshkel. Thank you for your contribution!

## 7.91.0

### Important Changes

- **feat: Add server runtime metrics aggregator (#9894)**

The release adds alpha support for [Sentry developer metrics](https://github.com/getsentry/sentry/discussions/58584) in
the server runtime SDKs (`@sentry/node`, `@sentry/deno`, `@sentry/nextjs` server-side, etc.). Via the newly introduced
APIs, you can now flush metrics directly to Sentry.

To enable capturing metrics, you first need to add the `metricsAggregator` experiment to your `Sentry.init` call.

```js
Sentry.init({
  dsn: '__DSN__',
  _experiments: {
    metricsAggregator: true,
  },
});
```

Then you'll be able to add `counters`, `sets`, `distributions`, and `gauges` under the `Sentry.metrics` namespace.

```js
// Add 4 to a counter named `hits`
Sentry.metrics.increment('hits', 4);

// Add 2 to gauge named `parallel_requests`, tagged with `type: "a"`
Sentry.metrics.gauge('parallel_requests', 2, { tags: { type: 'a' } });

// Add 4.6 to a distribution named `response_time` with unit seconds
Sentry.metrics.distribution('response_time', 4.6, { unit: 'seconds' });

// Add 2 to a set named `valuable.ids`
Sentry.metrics.set('valuable.ids', 2);
```

- **feat(node): Rework ANR to use worker script via an integration (#9945)**

The [ANR tracking integration for Node](https://docs.sentry.io/platforms/node/configuration/application-not-responding/)
has been reworked to use an integration. ANR tracking now requires a minimum Node version of 16 or higher. Previously
you had to call `Sentry.enableANRDetection` before running your application, now you can simply add the `Anr`
integration to your `Sentry.init` call.

```js
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Sentry.Integrations.Anr({ captureStackTrace: true, anrThreshold: 200 })],
});
```

### Other Changes

- feat(breadcrumbs): Send component names on UI breadcrumbs (#9946)
- feat(core): Add `getGlobalScope()` method (#9920)
- feat(core): Add `getIsolationScope()` method (#9957)
- feat(core): Add `span.end()` to replace `span.finish()` (#9954)
- feat(core): Ensure `startSpan` & `startSpanManual` fork scope (#9955)
- feat(react): Send component name on spans (#9949)
- feat(replay): Send component names in replay breadcrumbs (#9947)
- feat(sveltekit): Add options to configure fetch instrumentation script for CSP (#9969)
- feat(tracing): Send component name on interaction spans (#9948)
- feat(utils): Add function to extract relevant component name (#9921)
- fix(core): Rethrow caught promise rejections in `startSpan`, `startSpanManual`, `trace` (#9958)

## 7.90.0

- feat(replay): Change to use preset quality values (#9903)
- fix(replay): Adjust development hydration error messages (#9922)
- fix(sveltekit): Add `types` field to package.json `exports` (#9926)

## 7.89.0

### Important Changes

#### Deprecations

- **feat(core): Deprecate `configureScope` (#9887)**
- **feat(core): Deprecate `pushScope` & `popScope` (#9890)**

This release deprecates `configureScope`, `pushScope`, and `popScope`, which will be removed in the upcoming v8 major
release.

#### Hapi Integration

- **feat(node): Add Hapi Integration (#9539)**

This release adds an integration for Hapi. It can be used as follows:

```ts
const Sentry = require('@sentry/node');
const Hapi = require('@hapi/hapi');

const init = async () => {
  const server = Hapi.server({
    // your server configuration ...
  });

  Sentry.init({
    dsn: '__DSN__',
    tracesSampleRate: 1.0,
    integrations: [new Sentry.Integrations.Hapi({ server })],
  });

  server.route({
    // your route configuration ...
  });

  await server.start();
};
```

#### SvelteKit 2.0

- **chore(sveltekit): Add SvelteKit 2.0 to peer dependencies (#9861)**

This release adds support for SvelteKit 2.0 in the `@sentry/sveltekit` package. If you're upgrading from SvelteKit 1.x
to 2.x and already use the Sentry SvelteKit SDK, no changes apart from upgrading to this (or a newer) version are
necessary.

### Other Changes

- feat(core): Add type & utility for function-based integrations (#9818)
- feat(core): Update `withScope` to return callback return value (#9866)
- feat(deno): Support `Deno.CronSchedule` for cron jobs (#9880)
- feat(nextjs): Auto instrument generation functions (#9781)
- feat(nextjs): Connect server component transactions if there is no incoming trace (#9845)
- feat(node-experimental): Update to new Scope APIs (#9799)
- feat(replay): Add `canvas.type` setting (#9877)
- fix(nextjs): Export `createReduxEnhancer` (#9854)
- fix(remix): Do not capture thrown redirect responses. (#9909)
- fix(sveltekit): Add conditional exports (#9872)
- fix(sveltekit): Avoid capturing 404 errors on client side (#9902)
- fix(utils): Do not use `Event` type in worldwide (#9864)
- fix(utils): Support crypto.getRandomValues in old Chromium versions (#9251)
- fix(utils): Update `eventFromUnknownInput` to avoid scope pollution & `getCurrentHub` (#9868)
- ref: Use `addBreadcrumb` directly & allow to pass hint (#9867)

Work in this release contributed by @adam187, and @jghinestrosa. Thank you for your contributions!

## 7.88.0

### Important Changes

- **feat(browser): Add browser metrics sdk (#9794)**

The release adds alpha support for [Sentry developer metrics](https://github.com/getsentry/sentry/discussions/58584) in
the Browser SDKs (`@sentry/browser` and related framework SDKs). Via the newly introduced APIs, you can now flush
metrics directly to Sentry.

To enable capturing metrics, you first need to add the `MetricsAggregator` integration.

```js
Sentry.init({
  dsn: '__DSN__',
  integrations: [new Sentry.metrics.MetricsAggregator()],
});
```

Then you'll be able to add `counters`, `sets`, `distributions`, and `gauges` under the `Sentry.metrics` namespace.

```js
// Add 4 to a counter named `hits`
Sentry.metrics.increment('hits', 4);

// Add 2 to gauge named `parallel_requests`, tagged with `happy: "no"`
Sentry.metrics.gauge('parallel_requests', 2, { tags: { happy: 'no' } });

// Add 4.6 to a distribution named `response_time` with unit seconds
Sentry.metrics.distribution('response_time', 4.6, { unit: 'seconds' });

// Add 2 to a set named `valuable.ids`
Sentry.metrics.set('valuable.ids', 2);
```

In a future release we'll add support for server runtimes (Node, Deno, Bun, Vercel Edge, etc.)

- **feat(deno): Optionally instrument `Deno.cron` (#9808)**

This releases add support for instrumenting [Deno cron's](https://deno.com/blog/cron) with
[Sentry cron monitors](https://docs.sentry.io/product/crons/). This requires v1.38 of Deno run with the `--unstable`
flag and the usage of the `DenoCron` Sentry integration.

```ts
// Import from the Deno registry
import * as Sentry from 'https://deno.land/x/sentry/index.mjs';

Sentry.init({
  dsn: '__DSN__',
  integrations: [new Sentry.DenoCron()],
});
```

### Other Changes

- feat(replay): Bump `rrweb` to 2.6.0 (#9847)
- fix(nextjs): Guard against injecting multiple times (#9807)
- ref(remix): Bump Sentry CLI to ^2.23.0 (#9773)

## 7.87.0

- feat: Add top level `getCurrentScope()` method (#9800)
- feat(replay): Bump `rrweb` to 2.5.0 (#9803)
- feat(replay): Capture hydration error breadcrumb (#9759)
- feat(types): Add profile envelope types (#9798)
- fix(astro): Avoid RegExp creation during route interpolation (#9815)
- fix(browser): Avoid importing from `./exports` (#9775)
- fix(nextjs): Catch rejecting flushes (#9811)
- fix(nextjs): Fix devserver CORS blockage when `assetPrefix` is defined (#9766)
- fix(node): Capture errors in tRPC middleware (#9782)

## 7.86.0

- feat(core): Use SDK_VERSION for hub API version (#9732)
- feat(nextjs): Emit warning if your app directory doesn't have a global-error.js file (#9753)
- feat(node): Add cloudflare pages commit sha (#9751)
- feat(remix): Bump @sentry/cli to 2.22.3 (#9741)
- fix(nextjs): Don't accidentally trigger static generation bailout (#9749)
- fix(node): Guard `process.env.NODE_ENV` access in Spotlight integration (#9748)
- fix(utils): Fix XHR instrumentation early return (#9770)
- ref(remix): Rework Error Handling (#9725)

## 7.85.0

- feat(core): Add `addEventProcessor` method (#9554)
- feat(crons): Add interface for heartbeat checkin (#9706)
- feat(feedback): Include Feedback package in browser SDK (#9586)
- fix(astro): Isolate request instrumentation in middleware (#9709)
- fix(replay): Capture JSON XHR response bodies (#9623)
- ref(feedback): Change form `box-shadow` to use CSS var (#9630)

## 7.84.0

### Important Changes

- **ref(nextjs): Set `automaticVercelMonitors` to be `false` by default (#9697)**

From this version onwards the default for the `automaticVercelMonitors` option in the Next.js SDK is set to false.
Previously, if you made use of Vercel Crons the SDK automatically instrumented the relevant routes to create Sentry
monitors. Because this feature will soon be generally available, we are now flipping the default to avoid situations
where quota is used unexpectedly.

If you want to continue using this feature, make sure to set the `automaticVercelMonitors` flag to `true` in your
`next.config.js` Sentry settings.

### Other Changes

- chore(astro): Add 4.0.0 preview versions to `astro` peer dependency range (#9696)
- feat(metrics): Add interfaces for metrics (#9698)
- feat(web-vitals): Vendor in INP from web-vitals library (#9690)
- fix(astro): Avoid adding the Sentry Vite plugin in dev mode (#9688)
- fix(nextjs): Don't match files called `middleware` in node_modules (#9686)
- fix(remix): Don't capture error responses that are not 5xx on Remix v2. (#9655)
- fix(tracing): Don't attach resource size if null (#9669)
- fix(utils): Regex match port to stop accidental replace (#9676)
- fix(utils): Try catch new URL when extracting query params (#9675)

## 7.83.0

- chore(astro): Allow Astro 4.0 in peer dependencies (#9683)
- feat(astro): Add `assets` option to source maps upload options (#9668)
- feat(react): Support `exactOptionalPropertyTypes` on `ErrorBoundary` (#9098)
- fix: Don't depend on browser types in `types` (#9682)
- fix(astro): Configure sourcemap assets directory for Vercel adapter (#9665)
- fix(remix): Check the error data before spreading. (#9664)

## 7.82.0

- feat(astro): Automatically add Sentry middleware in Astro integration (#9532)
- feat(core): Add optional `setup` hook to integrations (#9556)
- feat(core): Add top level `getClient()` method (#9638)
- feat(core): Allow to pass `mechanism` as event hint (#9590)
- feat(core): Allow to use `continueTrace` without callback (#9615)
- feat(feedback): Add onClose callback to showReportDialog (#9433) (#9550)
- feat(nextjs): Add request data to all edge-capable functionalities (#9636)
- feat(node): Add Spotlight option to Node SDK (#9629)
- feat(utils): Refactor `addInstrumentationHandler` to dedicated methods (#9542)
- fix: Make full url customizable for Spotlight (#9652)
- fix(astro): Remove Auth Token existence check (#9651)
- fix(nextjs): Fix middleware detection logic (#9637)
- fix(remix): Skip capturing aborted requests (#9659)
- fix(replay): Add `BODY_PARSE_ERROR` warning & time out fetch response load (#9622)
- fix(tracing): Filter out invalid resource sizes (#9641)
- ref: Hoist `RequestData` integration to `@sentry/core` (#9597)
- ref(feedback): Rename onDialog* to onForm*, remove onActorClick (#9625)

Work in this release contributed by @arya-s. Thank you for your contribution!

## 7.81.1

- fix(astro): Remove method from span op (#9603)
- fix(deno): Make sure files get published (#9611)
- fix(nextjs): Use `globalThis` instead of `global` in edge runtime (#9612)
- fix(node): Improve error handling and shutdown handling for ANR (#9548)
- fix(tracing-internal): Fix case when originalURL contain query params (#9531)

Work in this release contributed by @powerfulyang, @LubomirIgonda1, @joshkel, and @alexgleason. Thank you for your
contributions!

## 7.81.0

### Important Changes

**- feat(nextjs): Add instrumentation utility for server actions (#9553)**

This release adds a utility function `withServerActionInstrumentation` to the `@sentry/nextjs` SDK for instrumenting
your Next.js server actions with error and performance monitoring.

You can optionally pass form data and headers to record them, and configure the wrapper to record the Server Action
responses:

```tsx
import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';

export default function ServerComponent() {
  async function myServerAction(formData: FormData) {
    'use server';
    return await Sentry.withServerActionInstrumentation(
      'myServerAction', // The name you want to associate this Server Action with in Sentry
      {
        formData, // Optionally pass in the form data
        headers: headers(), // Optionally pass in headers
        recordResponse: true, // Optionally record the server action response
      },
      async () => {
        // ... Your Server Action code

        return { name: 'John Doe' };
      },
    );
  }

  return (
    <form action={myServerAction}>
      <input type="text" name="some-input-value" />
      <button type="submit">Run Action</button>
    </form>
  );
}
```

### Other Changes

- docs(feedback): Example docs on `sendFeedback` (#9560)
- feat(feedback): Add `level` and remove breadcrumbs from feedback event (#9533)
- feat(vercel-edge): Add fetch instrumentation (#9504)
- feat(vue): Support Vue 3 lifecycle hooks in mixin options (#9578)
- fix(nextjs): Download CLI binary if it can't be found (#9584)
- ref: Deprecate `extractTraceParentData` from `@sentry/core` & downstream packages (#9158)
- ref(replay): Add further logging to network body parsing (#9566)

Work in this release contributed by @snoozbuster. Thank you for your contribution!

## 7.80.1

- fix(astro): Adjust Vite plugin config to upload server source maps (#9541)
- fix(nextjs): Add tracing extensions in all serverside wrappers (#9537)
- fix(nextjs): Fix serverside transaction names on Windows (#9526)
- fix(node): Fix tRPC middleware typing (#9540)
- fix(replay): Add additional safeguards for capturing network bodies (#9506)
- fix(tracing): Update prisma span to be `db.prisma` (#9512)

## 7.80.0

- feat(astro): Add distributed tracing via `<meta>` tags (#9483)
- feat(node): Capture internal server errors in trpc middleware (#9482)
- feat(remix): Export a type to use for `MetaFunction` parameters (#9493)
- fix(astro): Mark SDK package as Astro-external (#9509)
- ref(nextjs): Don't initialize Server SDK during build (#9503)

## 7.79.0

- feat(tracing): Add span `origin` to trace context (#9472)
- fix(deno): Emit .mjs files (#9485)
- fix(nextjs): Flush servercomponent events for edge (#9487)

## 7.78.0

### Important Changes

- **Replay Bundle Size improvements**

We've dramatically decreased the bundle size of our Replay package, reducing the minified & gzipped bundle size by ~20
KB! This was possible by extensive use of tree shaking and a host of small changes to reduce our footprint:

- feat(replay): Update rrweb to 2.2.0 (#9414)
- ref(replay): Use fflate instead of pako for compression (#9436)

By using [tree shaking](https://docs.sentry.io/platforms/javascript/configuration/tree-shaking/) it is possible to shave
up to 10 additional KB off the bundle.

### Other Changes

- feat(astro): Add Sentry middleware (#9445)
- feat(feedback): Add "outline focus" and "foreground hover" vars (#9462)
- feat(feedback): Add `openDialog` and `closeDialog` onto integration interface (#9464)
- feat(feedback): Implement new user feedback embeddable widget (#9217)
- feat(nextjs): Add automatic sourcemapping for edge part of the SDK (#9454)
- feat(nextjs): Add client routing instrumentation for app router (#9446)
- feat(node-experimental): Add hapi tracing support (#9449)
- feat(replay): Allow to configure `beforeErrorSampling` (#9470)
- feat(replay): Stop fixing truncated JSONs in SDK (#9437)
- fix(nextjs): Fix sourcemaps resolving for local dev when basePath is set (#9457)
- fix(nextjs): Only inject basepath in dev mode (#9465)
- fix(replay): Ensure we stop for rate limit headers (#9420)
- ref(feedback): Add treeshaking for logger statements (#9475)
- ref(replay): Use rrweb for slow click detection (#9408)
- build(polyfills): Remove output format specific logic (#9467)

## 7.77.0

### Security Fixes

- fix(nextjs): Match only numbers as orgid in tunnelRoute (#9416) (CVE-2023-46729)
- fix(nextjs): Strictly validate tunnel target parameters (#9415) (CVE-2023-46729)

### Other Changes

- feat: Move LinkedErrors integration to @sentry/core (#9404)
- feat(remix): Update sentry-cli version to ^2.21.2 (#9401)
- feat(replay): Allow to treeshake & configure compression worker URL (#9409)
- fix(angular-ivy): Adjust package entry points to support Angular 17 with SSR config (#9412)
- fix(feedback): Fixing feedback import (#9403)
- fix(utils): Avoid keeping a reference of last used event (#9387)

## 7.76.0

### Important Changes

- **feat(core): Add cron monitor wrapper helper (#9395)**

This release adds `Sentry.withMonitor()`, a wrapping function that wraps a callback with a cron monitor that will
automatically report completions and failures:

```ts
import * as Sentry from '@sentry/node';

// withMonitor() will send checkin when callback is started/finished
// works with async and sync callbacks.
const result = Sentry.withMonitor(
  'dailyEmail',
  () => {
    // withCheckIn return value is same return value here
    return sendEmail();
  },
  // Optional upsert options
  {
    schedule: {
      type: 'crontab',
      value: '0 * * * *',
    },
    // 🇨🇦🫡
    timezone: 'Canada/Eastern',
  },
);
```

### Other Changes

- chore(angular-ivy): Allow Angular 17 in peer dependencies (#9386)
- feat(nextjs): Instrument SSR page components (#9346)
- feat(nextjs): Trace errors in page component SSR (#9388)
- fix(nextjs): Instrument route handlers with `jsx` and `tsx` file extensions (#9362)
- fix(nextjs): Trace with performance disabled (#9389)
- fix(replay): Ensure `replay_id` is not added to DSC if session expired (#9359)
- fix(replay): Remove unused parts of pako from build (#9369)
- fix(serverless): Don't mark all errors as unhandled (#9368)
- fix(tracing-internal): Fix case when middleware contain array of routes with special chars as @ (#9375)
- meta(nextjs): Bump peer deps for Next.js 14 (#9390)

Work in this release contributed by @LubomirIgonda1. Thank you for your contribution!

## 7.75.1

- feat(browser): Allow collecting of pageload profiles (#9317)
- fix(browser): Correct timestamp on pageload profiles (#9350)
- fix(nextjs): Use webpack plugin release value to inject release (#9348)

## 7.75.0

### Important Changes

- **feat(opentelemetry): Add new `@sentry/opentelemetry` package (#9238)**

This release publishes a new package, `@sentry/opentelemetry`. This is a runtime agnostic replacement for
`@sentry/opentelemetry-node` and exports a couple of useful utilities which can be used to use Sentry together with
OpenTelemetry.

You can read more about
[@sentry/opentelemetry in the Readme](https://github.com/getsentry/sentry-javascript/tree/develop/packages/opentelemetry).

- **feat(replay): Allow to treeshake rrweb features (#9274)**

Starting with this release, you can configure the following build-time flags in order to reduce the SDK bundle size:

- `__RRWEB_EXCLUDE_CANVAS__`
- `__RRWEB_EXCLUDE_IFRAME__`
- `__RRWEB_EXCLUDE_SHADOW_DOM__`

You can read more about
[tree shaking in our docs](https://docs.sentry.io/platforms/javascript/configuration/tree-shaking/).

### Other Changes

- build(deno): Prepare Deno SDK for release on npm (#9281)
- feat: Remove tslib (#9299)
- feat(node): Add abnormal session support for ANR (#9268)
- feat(node): Remove `lru_map` dependency (#9300)
- feat(node): Vendor `cookie` module (#9308)
- feat(replay): Share performance instrumentation with tracing (#9296)
- feat(types): Add missing Profiling types (macho debug image, profile measurements, stack frame properties) (#9277)
- feat(types): Add statsd envelope types (#9304)
- fix(astro): Add integration default export to types entry point (#9337)
- fix(astro): Convert SDK init file import paths to POSIX paths (#9336)
- fix(astro): Make `Replay` and `BrowserTracing` integrations tree-shakeable (#9287)
- fix(integrations): Fix transaction integration (#9334)
- fix(nextjs): Restore `autoInstrumentMiddleware` functionality (#9323)
- fix(nextjs): Guard for case where `getInitialProps` may return undefined (#9342)
- fix(node-experimental): Make node-fetch support optional (#9321)
- fix(node): Check buffer length when attempting to parse ANR frame (#9314)
- fix(replay): Fix xhr start timestamps (#9341)
- fix(tracing-internal): Remove query params from urls with a trailing slash (#9328)
- fix(types): Remove typo with CheckInEnvelope (#9303)

## 7.74.1

- chore(astro): Add `astro-integration` keyword (#9265)
- fix(core): Narrow filters for health check transactions (#9257)
- fix(nextjs): Fix HMR by inserting new entrypoints at the end (#9267)
- fix(nextjs): Fix resolution of request async storage module (#9259)
- fix(node-experimental): Guard against missing `fetch` (#9275)
- fix(remix): Update `defer` injection logic. (#9242)
- fix(tracing-internal): Parameterize express middleware parameters (#8668)
- fix(utils): Move Node specific ANR impl. out of utils (#9258)

Work in this release contributed by @LubomirIgonda1. Thank you for your contribution!

## 7.74.0

### Important Changes

- **feat(astro): Add `sentryAstro` integration (#9218)**

This Release introduces the first alpha version of our new SDK for Astro. At this time, the SDK is considered
experimental and things might break and change in future versions.

The core of the SDK is an Astro integration which you easily add to your Astro config:

```js
// astro.config.js
import { defineConfig } from 'astro/config';
import sentry from '@sentry/astro';

export default defineConfig({
  integrations: [
    sentry({
      dsn: '__DSN__',
      sourceMapsUploadOptions: {
        project: 'astro',
        authToken: process.env.SENTRY_AUTH_TOKEN,
      },
    }),
  ],
});
```

Check out the [README](./packages/astro/README.md) for usage instructions and what to expect from this alpha release.

### Other Changes

- feat(core): Add `addIntegration` utility (#9186)
- feat(core): Add `continueTrace` method (#9164)
- feat(node-experimental): Add NodeFetch integration (#9226)
- feat(node-experimental): Use native OTEL Spans (#9161, #9214)
- feat(node-experimental): Sample in OTEL Sampler (#9203)
- feat(serverlesss): Allow disabling transaction traces (#9154)
- feat(tracing): Allow direct pg module to enable esbuild support (#9227)
- feat(utils): Move common node ANR code to utils (#9191)
- feat(vue): Expose `VueIntegration` to initialize vue app later (#9180)
- fix: Don't set `referrerPolicy` on serverside fetch transports (#9200)
- fix: Ensure we never mutate options passed to `init` (#9162)
- fix(ember): Avoid pulling in utils at build time (#9221)
- fix(ember): Drop undefined config values (#9175)
- fix(node): Ensure mysql integration works without callback (#9222)
- fix(node): Only require `inspector` when needed (#9149)
- fix(node): Remove ANR `debug` option and instead add logger.isEnabled() (#9230)
- fix(node): Strip `.mjs` and `.cjs` extensions from module name (#9231)
- fix(replay): bump rrweb to 2.0.1 (#9240)
- fix(replay): Fix potential broken CSS in styled-components (#9234)
- fix(sveltekit): Flush in server wrappers before exiting (#9153)
- fix(types): Update signature of `processEvent` integration hook (#9151)
- fix(utils): Dereference DOM events after they have servered their purpose (#9224)
- ref(integrations): Refactor pluggable integrations to use `processEvent` (#9021)
- ref(serverless): Properly deprecate `rethrowAfterCapture` option (#9159)
- ref(utils): Deprecate `walk` method (#9157)

Work in this release contributed by @aldenquimby. Thank you for your contributions!

## 7.73.0

### Important Changes

- **feat(replay): Upgrade to rrweb2**

This is fully backwards compatible with prior versions of the Replay SDK. The only breaking change that we will making
is to not be masking `aria-label` by default. The reason for this change is to align with our core SDK which also does
not mask `aria-label`. This change also enables better support of searching by clicks.

Another change that needs to be highlighted is the 13% bundle size increase. This bundle size increase is necessary to
bring improved recording performance and improved replay fidelity, especially in regards to web components and iframes.
We will be investigating the reduction of the bundle size in
[this PR](https://github.com/getsentry/sentry-javascript/issues/8815).

Here are benchmarks comparing the version 1 of rrweb to version 2

| metric    | v1         | v2         |
| --------- | ---------- | ---------- |
| lcp       | 1486.06 ms | 1529.11 ms |
| cls       | 0.40 ms    | 0.40 ms    |
| fid       | 1.53 ms    | 1.50 ms    |
| tbt       | 3207.22 ms | 3036.80 ms |
| memoryAvg | 131.83 MB  | 124.84 MB  |
| memoryMax | 324.8 MB   | 339.03 MB  |
| netTx     | 282.67 KB  | 272.51 KB  |
| netRx     | 8.02 MB    | 8.07 MB    |

### Other Changes

- feat: Always assemble Envelopes (#9101)
- feat(node): Rate limit local variables for caught exceptions and enable `captureAllExceptions` by default (#9102)
- fix(core): Ensure `tunnel` is considered for `isSentryUrl` checks (#9130)
- fix(nextjs): Fix `RequestAsyncStorage` fallback path (#9126)
- fix(node-otel): Suppress tracing for generated sentry spans (#9142)
- fix(node): fill in span data from http request options object (#9112)
- fix(node): Fixes and improvements to ANR detection (#9128)
- fix(sveltekit): Avoid data invalidation in wrapped client-side `load` functions (#9071)
- ref(core): Refactor `InboundFilters` integration to use `processEvent` (#9020)
- ref(wasm): Refactor Wasm integration to use `processEvent` (#9019)

Work in this release contributed by @vlad-zhukov. Thank you for your contribution!

## 7.72.0

### Important Changes

- **feat(node): App Not Responding with stack traces (#9079)**

This release introduces support for Application Not Responding (ANR) errors for Node.js applications. These errors are
triggered when the Node.js main thread event loop of an application is blocked for more than five seconds. The Node SDK
reports ANR errors as Sentry events and can optionally attach a stacktrace of the blocking code to the ANR event.

To enable ANR detection, import and use the `enableANRDetection` function from the `@sentry/node` package before you run
the rest of your application code. Any event loop blocking before calling `enableANRDetection` will not be detected by
the SDK.

Example (ESM):

```ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: '___PUBLIC_DSN___',
  tracesSampleRate: 1.0,
});

await Sentry.enableANRDetection({ captureStackTrace: true });
// Function that runs your app
runApp();
```

Example (CJS):

```ts
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: '___PUBLIC_DSN___',
  tracesSampleRate: 1.0,
});

Sentry.enableANRDetection({ captureStackTrace: true }).then(() => {
  // Function that runs your app
  runApp();
});
```

### Other Changes

- fix(nextjs): Filter `RequestAsyncStorage` locations by locations that webpack will resolve (#9114)
- fix(replay): Ensure `replay_id` is not captured when session is expired (#9109)

## 7.71.0

- feat(bun): Instrument Bun.serve (#9080)
- fix(core): Ensure global event processors are always applied to event (#9064)
- fix(core): Run client eventProcessors before global ones (#9032)
- fix(nextjs): Use webpack module paths to attempt to resolve internal request async storage module (#9100)
- fix(react): Add actual error name to boundary error name (#9065)
- fix(react): Compare location against `basename`-prefixed route. (#9076)
- ref(browser): Refactor browser integrations to use `processEvent` (#9022)

Work in this release contributed by @jorrit. Thank you for your contribution!

## 7.70.0

### Important Changes

- **feat: Add Bun SDK (#9029)**

This release contains the beta version of `@sentry/bun`, our SDK for the [Bun JavaScript runtime](https://bun.sh/)! For
details on how to use it, please see the [README](./packages/bun/README.md). Any feedback/bug reports are greatly
appreciated, please [reach out on GitHub](https://github.com/getsentry/sentry-javascript/discussions/7979).

Note that as of now the Bun runtime does not support global error handlers. This is being actively worked on, see
[the tracking issue in Bun's GitHub repo](https://github.com/oven-sh/bun/issues/5091).

- **feat(remix): Add Remix 2.x release support. (#8940)**

The Sentry Remix SDK now officially supports Remix v2! See
[our Remix docs for more details](https://docs.sentry.io/platforms/javascript/guides/remix/).

### Other Changes

- chore(node): Upgrade cookie to ^0.5.0 (#9013)
- feat(core): Introduce `processEvent` hook on `Integration` (#9017)
- feat(node): Improve non-error messages (#9026)
- feat(vercel-edge): Add Vercel Edge Runtime package (#9041)
- fix(remix): Use `React.ComponentType` instead of `React.FC` as `withSentry`'s generic type. (#9043)
- fix(replay): Ensure replay events go through `preprocessEvent` hook (#9034)
- fix(replay): Fix typo in Replay types (#9028)
- fix(sveltekit): Adjust `handleErrorWithSentry` type (#9054)
- fix(utils): Try-catch monkeypatching to handle frozen objects/functions (#9031)

Work in this release contributed by @Dima-Dim, @krist7599555 and @lifeiscontent. Thank you for your contributions!

Special thanks for @isaacharrisholt for helping us implement a Vercel Edge Runtime SDK which we use under the hood for
our Next.js SDK.

## 7.69.0

### Important Changes

- **New Performance APIs**
  - feat: Update span performance API names (#8971)
  - feat(core): Introduce startSpanManual (#8913)

This release introduces a new set of top level APIs for the Performance Monitoring SDKs. These aim to simplify creating
spans and reduce the boilerplate needed for performance instrumentation. The three new methods introduced are
`Sentry.startSpan`, `Sentry.startInactiveSpan`, and `Sentry.startSpanManual`. These methods are available in the browser
and node SDKs.

`Sentry.startSpan` wraps a callback in a span. The span is automatically finished when the callback returns. This is the
recommended way to create spans.

```js
// Start a span that tracks the duration of expensiveFunction
const result = Sentry.startSpan({ name: 'important function' }, () => {
  return expensiveFunction();
});

// You can also mutate the span wrapping the callback to set data or status
Sentry.startSpan({ name: 'important function' }, span => {
  // span is undefined if performance monitoring is turned off or if
  // the span was not sampled. This is done to reduce overhead.
  span?.setData('version', '1.0.0');
  return expensiveFunction();
});
```

If you don't want the span to finish when the callback returns, use `Sentry.startSpanManual` to control when the span is
finished. This is useful for event emitters or similar.

```js
// Start a span that tracks the duration of middleware
function middleware(_req, res, next) {
  return Sentry.startSpanManual({ name: 'middleware' }, (span, finish) => {
    res.once('finish', () => {
      setHttpStatus(span, res.status);
      finish();
    });
    return next();
  });
}
```

`Sentry.startSpan` and `Sentry.startSpanManual` create a span and make it active for the duration of the callback. Any
spans created while this active span is running will be added as a child span to it. If you want to create a span
without making it active, use `Sentry.startInactiveSpan`. This is useful for creating parallel spans that are not
related to each other.

```js
const span1 = Sentry.startInactiveSpan({ name: 'span1' });

someWork();

const span2 = Sentry.startInactiveSpan({ name: 'span2' });

moreWork();

const span3 = Sentry.startInactiveSpan({ name: 'span3' });

evenMoreWork();

span1?.finish();
span2?.finish();
span3?.finish();
```

### Other Changes

- feat(core): Export `BeforeFinishCallback` type (#8999)
- build(eslint): Enforce that ts-expect-error is used (#8987)
- feat(integration): Ensure `LinkedErrors` integration runs before all event processors (#8956)
- feat(node-experimental): Keep breadcrumbs on transaction (#8967)
- feat(redux): Add 'attachReduxState' option (#8953)
- feat(remix): Accept `org`, `project` and `url` as args to upload script (#8985)
- fix(utils): Prevent iterating over VueViewModel (#8981)
- fix(utils): uuidv4 fix for cloudflare (#8968)
- fix(core): Always use event message and exception values for `ignoreErrors` (#8986)
- fix(nextjs): Add new potential location for Next.js request AsyncLocalStorage (#9006)
- fix(node-experimental): Ensure we only create HTTP spans when outgoing (#8966)
- fix(node-experimental): Ignore OPTIONS & HEAD requests (#9001)
- fix(node-experimental): Ignore outgoing Sentry requests (#8994)
- fix(node-experimental): Require parent span for `pg` spans (#8993)
- fix(node-experimental): Use Sentry logger as Otel logger (#8960)
- fix(node-otel): Refactor OTEL span reference cleanup (#9000)
- fix(react): Switch to props in `useRoutes` (#8998)
- fix(remix): Add `glob` to Remix SDK dependencies. (#8963)
- fix(replay): Ensure `handleRecordingEmit` aborts when event is not added (#8938)
- fix(replay): Fully stop & restart session when it expires (#8834)

Work in this release contributed by @Duncanxyz and @malay44. Thank you for your contributions!

## 7.68.0

- feat(browser): Add `BroadcastChannel` and `SharedWorker` to TryCatch EventTargets (#8943)
- feat(core): Add `name` to `Span` (#8949)
- feat(core): Add `ServerRuntimeClient` (#8930)
- fix(node-experimental): Ensure `span.finish()` works as expected (#8947)
- fix(remix): Add new sourcemap-upload script files to prepack assets. (#8948)
- fix(publish): Publish downleveled TS3.8 types and fix types path (#8954)

## 7.67.0

### Important Changes

- **feat: Mark errors caught by the SDK as unhandled**
  - feat(browser): Mark errors caught from `TryCatch` integration as unhandled (#8890)
  - feat(integrations): Mark errors caught from `HttpClient` and `CaptureConsole` integrations as unhandled (#8891)
  - feat(nextjs): Mark errors caught from NextJS wrappers as unhandled (#8893)
  - feat(react): Mark errors captured from ErrorBoundary as unhandled (#8914)
  - feat(remix): Add debugid injection and map deletion to sourcemaps script (#8814)
  - feat(remix): Mark errors caught from Remix instrumentation as unhandled (#8894)
  - feat(serverless): Mark errors caught in Serverless handlers as unhandled (#8907)
  - feat(vue): Mark errors caught by Vue wrappers as unhandled (#8905)

This release fixes inconsistent behaviour of when our SDKs classify captured errors as unhandled. Previously, some of
our instrumentations correctly set unhandled, while others set handled. Going forward, all errors caught automatically
from our SDKs will be marked as unhandled. If you manually capture errors (e.g. by calling `Sentry.captureException`),
your errors will continue to be reported as handled.

This change might lead to a decrease in reported crash-free sessions and consequently in your release health score. If
you have concerns about this, feel free to open an issue.

### Other Changes

- feat(node-experimental): Implement new performance APIs (#8911)
- feat(node-experimental): Sync OTEL context with Sentry AsyncContext (#8797)
- feat(replay): Allow to configure `maxReplayDuration` (#8769)
- fix(browser): Add replay and profiling options to `BrowserClientOptions` (#8921)
- fix(browser): Check for existence of instrumentation targets (#8939)
- fix(nextjs): Don't re-export default in route handlers (#8924)
- fix(node): Improve mysql integration (#8923)
- fix(remix): Guard against missing default export for server instrument (#8909)
- ref(browser): Deprecate top-level `wrap` function (#8927)
- ref(node-otel): Avoid exporting internals & refactor attribute adding (#8920)

Work in this release contributed by @SorsOps. Thank you for your contribution!

## 7.66.0

- fix: Defer tracing decision to downstream SDKs when using SDK without performance (#8839)
- fix(nextjs): Fix `package.json` exports (#8895)
- fix(sveltekit): Ensure target file exists before applying auto instrumentation (#8881)
- ref: Use consistent console instrumentation (#8879)
- ref(browser): Refactor sentry breadcrumb to use hook (#8892)
- ref(tracing): Add `origin` to spans (#8765)

## 7.65.0

- build: Remove build-specific polyfills (#8809)
- build(deps): bump protobufjs from 6.11.3 to 6.11.4 (#8822)
- deps(sveltekit): Bump `@sentry/vite-plugin` (#8877)
- feat(core): Introduce `Sentry.startActiveSpan` and `Sentry.startSpan` (#8803)
- fix: Memoize `AsyncLocalStorage` instance (#8831)
- fix(nextjs): Check for validity of API route handler signature (#8811)
- fix(nextjs): Fix `requestAsyncStorageShim` path resolution on windows (#8875)
- fix(node): Log entire error object in `OnUncaughtException` (#8876)
- fix(node): More relevant warning message when tracing extensions are missing (#8820)
- fix(replay): Streamline session creation/refresh (#8813)
- fix(sveltekit): Avoid invalidating data on route changes in `wrapServerLoadWithSentry` (#8801)
- fix(tracing): Better guarding for performance observer (#8872)
- ref(sveltekit): Remove custom client fetch instrumentation and use default instrumentation (#8802)
- ref(tracing-internal): Deprecate `tracePropagationTargets` in `BrowserTracing` (#8874)

## 7.64.0

- feat(core): Add setMeasurement export (#8791)
- fix(nextjs): Check for existence of default export when wrapping pages (#8794)
- fix(nextjs): Ensure imports are valid relative paths (#8799)
- fix(nextjs): Only re-export default export if it exists (#8800)

## 7.63.0

- build(deps): bump @opentelemetry/instrumentation from 0.41.0 to 0.41.2
- feat(eventbuilder): Export `exceptionFromError` for use in hybrid SDKs (#8766)
- feat(node-experimental): Re-export from node (#8786)
- feat(tracing): Add db connection attributes for mysql spans (#8775)
- feat(tracing): Add db connection attributes for postgres spans (#8778)
- feat(tracing): Improve data collection for mongodb spans (#8774)
- fix(nextjs): Execute sentry config independently of `autoInstrumentServerFunctions` and `autoInstrumentAppDirectory`
  (#8781)
- fix(replay): Ensure we do not flush if flush took too long (#8784)
- fix(replay): Ensure we do not try to flush when we force stop replay (#8783)
- fix(replay): Fix `hasCheckout` handling (#8782)
- fix(replay): Handle multiple clicks in a short time (#8773)
- ref(replay): Skip events being added too long after initial segment (#8768)

## 7.62.0

### Important Changes

- **feat(integrations): Add `ContextLines` integration for html-embedded JS stack frames (#8699)**

This release adds the `ContextLines` integration as an optional integration for the Browser SDKs to
`@sentry/integrations`.

This integration adds source code from inline JavaScript of the current page's HTML (e.g. JS in `<script>` tags) to
stack traces of captured errors. It _can't_ collect source code from assets referenced by your HTML (e.g.
`<script src="..." />`).

The `ContextLines` integration is useful when you have inline JS code in HTML pages that can't be accessed by Sentry's
backend, for example, due to a login-protected page.

```js
import { ContextLines } from '@sentry/integrations';

Sentry.init({
  // ...
  integrations: [
    new ContextLines({
      // The number of lines to collect before and after each stack frame's line number
      // Defaults to 7
      frameContextLines: 7,
    }),
  ],
});
```

### Other Changes

- fix(nextjs): Make all wrappers isomorphic and available in all runtimes (#8743)
- fix(replay): Cancel debounce when replay is too short/long (#8742)
- fix(utils): `dirname` and `basename` should handle Windows paths (#8737)
- ref: Hoist `flush`, `close`, and `lastEventId` into `@sentry/core` (#8731)
- ref(node): Don't call `JSON.stringify` on prisma client when logging (#8745)

## 7.61.1

- feat(nextjs): Add `AsyncLocalStorage` async context strategy to edge SDK (#8720)
- fix(core): Filter internal API frames for synthetic frames (#8710)
- fix(integrations): Capture exception if any arg to console method is an error (#8671)
- fix(node-experimental): Update auto integration lookup & readme (#8690)
- fix(node): Add availablility check on current hub to Node `ContextLines` integration (#8715)
- fix(replay): Ensure buffer sessions end after capturing an error (#8713)
- fix(replay): Ensure buffer->session switch is reliable (#8712)
- fix(replay): Ensure we debounce flush if replay too short (#8716)
- fix(replay): Improve capture of errorIds/traceIds (#8678)
- fix(tracing): Set correct parent span id on fetch sentry-trace header (#8687)
- fix(utils): Avoid `pre_context` and `context_line` overlap if frame lineno is out of bounds (#8722)
- ref(replay): Improve status logging (#8709)
- ref(nextjs): Allow withSentryConfig to accept async config function (#8721)

## 7.61.0

### Important Changes

- **feat(node-experimental): Add `@sentry/node-experimental` package as MVP for POTEL (#8609)**

This introduces a new, _experimental_ package, `@sentry/node-experimental`. This is a variant of the Node SDK which uses
OpenTelemetry under the hood for performance instrumentation.

Note that this package is very much WIP, considered unstable and may change at any time. **No SemVer guarantees apply
whatsoever.** Still, if you're brave enough you can give it a try.
[Read more about @sentry/node-experimental](./packages/node-experimental/README.md)

### Other Changes

- fix(node): Don't set extra baggage headers (#8657)
- fix(tracing): Trim idle transaction spans if they exceed final timeout (#8653)

## 7.60.1

- fix(nextjs): Match folder paths with trailing separator (#8615)
- fix(replay): Ignore clicks with `shift` pressed (#8648)
- fix(replay): Use `session.started` for min/max duration check (#8617)

## 7.60.0

### Important Changes

- **feat(replay): Ensure min/max duration when flushing (#8596)**

We will not send replays that are <5s long anymore. Additionally, we also added further safeguards to avoid overly long
(>1h) replays. You can optionally configure the min. replay duration (defaults to 5s):

```js
new Replay({
  minReplayDuration: 10000, // in ms - note that this is capped at 15s max!
});
```

### Other Changes

- fix(profiling): Align to SDK selected time origin (#8599)
- fix(replay): Ensure multi click has correct timestamps (#8591)
- fix(utils): Truncate aggregate exception values (LinkedErrors) (#8593)

## 7.59.3

- fix(browser): 0 is a valid index (#8581)
- fix(nextjs): Ensure Webpack plugin is available after dynamic require (#8584)
- types(browser): Add browser profiling client options (#8565)

## 7.59.2

No changes. This release was published to fix publishing issues with 7.59.0 and 7.59.1. Please see [7.59.0](#7590) for
the changes in that release.

## 7.59.1

No changes. This release was published to fix a publishing issue with 7.59.0. Please see [7.59.0](#7590) for the changes
in that release.

## 7.59.0

### Important Changes

- **- feat(remix): Add Remix v2 support (#8415)**

This release adds support for Remix v2 future flags, in particular for new error handling utilities of Remix v2. We
heavily recommend you switch to using `v2_errorBoundary` future flag to get the best error handling experience with
Sentry.

To capture errors from [v2 client-side ErrorBoundary](https://remix.run/docs/en/main/route/error-boundary-v2), you
should define your own `ErrorBoundary` in `root.tsx` and use `Sentry.captureRemixErrorBoundaryError` helper to capture
the error.

```typescript
// root.tsx
import { captureRemixErrorBoundaryError } from "@sentry/remix";

export const ErrorBoundary: V2_ErrorBoundaryComponent = () => {
  const error = useRouteError();

  captureRemixErrorBoundaryError(error);

  return <div> ... </div>;
};
```

For server-side errors, define a
[`handleError`](https://remix.run/docs/en/main/file-conventions/entry.server#handleerror) function in your server entry
point and use the `Sentry.captureRemixServerException` helper to capture the error.

```ts
// entry.server.tsx
export function handleError(error: unknown, { request }: DataFunctionArgs): void {
  if (error instanceof Error) {
    Sentry.captureRemixServerException(error, 'remix.server', request);
  } else {
    // Optionally capture non-Error objects
    Sentry.captureException(error);
  }
}
```

For more details, see the Sentry [Remix SDK](https://docs.sentry.io/platforms/javascript/guides/remix/) documentation.

### Other Changes

- feat(core): Add `ModuleMetadata` integration (#8475)
- feat(core): Allow multiplexed transport to send to multiple releases (#8559)
- feat(tracing): Add more network timings to http calls (#8540)
- feat(tracing): Bring http timings out of experiment (#8563)
- fix(nextjs): Avoid importing `SentryWebpackPlugin` in dev mode (#8557)
- fix(otel): Use `HTTP_URL` attribute for client requests (#8539)
- fix(replay): Better session storage check (#8547)
- fix(replay): Handle errors in `beforeAddRecordingEvent` callback (#8548)
- fix(tracing): Improve network.protocol.version (#8502)

## 7.58.1

- fix(node): Set propagation context even when tracingOptions are not defined (#8517)

## 7.58.0

### Important Changes

- **Performance Monitoring not required for Distributed Tracing**

This release adds support for
[distributed tracing](https://docs.sentry.io/platforms/javascript/usage/distributed-tracing/) without requiring
performance monitoring to be active on the JavaScript SDKs (browser and node). This means even if there is no sampled
transaction/span, the SDK will still propagate traces to downstream services. Distributed Tracing can be configured with
the `tracePropagationTargets` option, which controls what requests to attach the `sentry-trace` and `baggage` HTTP
headers to (which is what propagates tracing information).

```js
Sentry.init({
  tracePropagationTargets: ['third-party-site.com', /^https:\/\/yourserver\.io\/api/],
});
```

- feat(tracing): Add tracing without performance to browser and client Sveltekit (#8458)
- feat(node): Add tracing without performance to Node http integration (#8450)
- feat(node): Add tracing without performance to Node Undici (#8449)
- feat(node): Populate propagation context using env variables (#8422)

- **feat(core): Support `AggregateErrors` in `LinkedErrors` integration (#8463)**

This release adds support for
[`AggregateErrors`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError).
AggregateErrors are considered as Exception Groups by Sentry, and will be visualized and grouped differently. See the
[Exception Groups Changelog Post](https://changelog.getsentry.com/announcements/exception-groups-now-supported-for-python-and-net)
for more details.

Exception Group support requires Self-Hosted Sentry
[version 23.5.1](https://github.com/getsentry/self-hosted/releases/tag/23.5.1) or newer.

- **feat(replay): Add a new option `networkDetailDenyUrls` (#8439)**

This release adds a new option `networkDetailDenyUrls` to the `Replay` integration. This option allows you to specify a
list of URLs that should not be captured by the `Replay` integration, which can be used alongside the existing
`networkDetailAllowUrls` for finely grained control of which URLs should have network details captured.

```js
Sentry.init({
  integrations: [
    new Sentry.Integrations.Replay({
      networkDetailDenyUrls: [/^http:\/\/example.com\/test$/],
    }),
  ],
});
```

### Other Changes

- feat(core): Add helpers to get module metadata from injected code (#8438)
- feat(core): Add sampling decision to trace envelope header (#8483)
- feat(node): Add trace context to checkin (#8503)
- feat(node): Export `getModule` for Electron SDK (#8488)
- feat(types): Allow `user.id` to be a number (#8330)
- fix(browser): Set anonymous `crossorigin` attribute on report dialog (#8424)
- fix(nextjs): Ignore `tunnelRoute` when doing static exports (#8471)
- fix(nextjs): Use `basePath` option for `tunnelRoute` (#8454)
- fix(node): Apply source context to linked errors even when it is uncached (#8453)
- fix(node): report errorMiddleware errors as unhandled (#8048)
- fix(react): Add support for `basename` option of `createBrowserRouter` (#8457)
- fix(remix): Add explicit `@sentry/node` exports. (#8509)
- fix(remix): Don't inject trace/baggage to `redirect` and `catch` responses (#8467)
- fix(replay): Adjust slow/multi click handling (#8380)

Work in this release contributed by @mrdulin, @donaldxdonald & @ziyad-elabid-nw. Thank you for your contributions!

## 7.57.0

### Important Changes

- **build: Update typescript from 3.8.3 to 4.9.5 (#8255)**

This release version
[bumps the internally used typescript version from 3.8.x to 4.9.x](https://github.com/getsentry/sentry-javascript/pull/8255).
We use ds-downlevel to generate two versions of our types, one for >=3.8, one for >=4.9. This means that this change
should be fully backwards compatible and not have any noticable user impact, but if you still encounter issues please
let us know.

- **feat(types): Add tracePropagationTargets to top level options (#8395)**

Instead of passing `tracePropagationTargets` to the `BrowserTracing` integration, you can now define them on the top
level:

```js
Sentry.init({
  tracePropagationTargets: ['api.site.com'],
});
```

- **fix(angular): Filter out `TryCatch` integration by default (#8367)**

The Angular and Angular-ivy SDKs will not install the TryCatch integration anymore by default. This integration
conflicted with the `SentryErrorHander`, sometimes leading to duplicated errors and/or missing data on events.

- **feat(browser): Better event name handling for non-Error objects (#8374)**

When capturing non-errors via `Sentry.captureException()`, e.g. `Sentry.captureException({ prop: "custom object" })`, we
now generate a more helpful value for the synthetic exception. Instead of e.g.
`Non-Error exception captured with keys: currentTarget, isTrusted, target, type`, you'll now get messages like:

```
Object captured as exception with keys: prop1, prop2
Event `MouseEvent` (type=click) captured as exception
Event `ErrorEvent` captured as exception with message `Script error.`
```

### Other Changes

- feat(browser): Send profiles in same envelope as transactions (#8375)
- feat(profiling): Collect timings on profiler stop calls (#8409)
- feat(replay): Do not capture replays < 5 seconds (GA) (#8277)
- feat(tracing): Add experiment to capture http timings (#8371)
- feat(tracing): Add `http.response.status_code` to `span.data` (#8366)
- fix(angular): Stop routing spans on navigation cancel and error events (#8369)
- fix(core): Only start spans in `trace` if tracing is enabled (#8357)
- fix(nextjs): Inject init calls via loader instead of via entrypoints (#8368)
- fix(replay): Mark ui.slowClickDetected `clickCount` as optional (#8376)
- fix(serverless): Export `autoDiscoverNodePerformanceMonitoringIntegrations` from SDK (#8382)
- fix(sveltekit): Check for cached requests in client-side fetch instrumentation (#8391)
- fix(sveltekit): Only instrument SvelteKit `fetch` if the SDK client is valid (#8381)
- fix(tracing): Instrument Prisma client in constructor of integration (#8383)
- ref(replay): More graceful `sessionStorage` check (#8394)
- ref(replay): Remove circular dep in replay eventBuffer (#8389)

## 7.56.0

- feat(replay): Rework slow click & multi click detection (#8322)
- feat(replay): Stop replay when event buffer exceeds max. size (#8315)
- feat(replay): Consider `window.open` for slow clicks (#8308)
- fix(core): Temporarily store debug IDs in stack frame and only put them into `debug_meta` before sending (#8347)
- fix(remix): Extract deferred responses correctly in root loaders. (#8305)
- fix(vue): Don't call `next` in Vue router 4 instrumentation (#8351)

## 7.55.2

- fix(replay): Stop exporting `EventType` from `@sentry-internal/rrweb` (#8334)
- fix(serverless): Export captureCheckIn (#8333)

## 7.55.1

- fix(replay): Do not export types from `@sentry-internal/rrweb` (#8329)

## 7.55.0

- feat(replay): Capture slow clicks (GA) (#8298)
- feat(replay): Improve types for replay recording events (#8224)
- fix(nextjs): Strip query params from transaction names of navigations to unknown routes (#8278)
- fix(replay): Ignore max session life for buffered sessions (#8258)
- fix(sveltekit): Export captureCheckIn (#8313)
- ref(svelte): Add Svelte 4 as a peer dependency (#8280)

## 7.54.0

### Important Changes

- **feat(core): Add default entries to `ignoreTransactions` for Healthchecks #8191**

  All SDKs now filter out health check transactions by default. These are transactions where the transaction name
  matches typical API health check calls, such as `/^.*healthy.*$/` or `/^.  *heartbeat.*$/`. Take a look at
  [this list](https://github.com/getsentry/sentry-javascript/blob/8c6ad156829f7c4eec34e4a67e6dd866ba482d5d/packages/core/src/integrations/inboundfilters.ts#L8C2-L16)
  to learn which regexes we currently use to match transaction names. We believe that these transactions do not provide
  value in most cases and we want to save you some of your quota by filtering them out by default. These filters are
  implemented as default values for the top level `ignoreTransactions` option.

  You can disable this filtering by manually specifiying the `InboundFilters` integration and setting the
  `disableTransactionDefaults` option:

  ```js
  Sentry.init({
    //...
    integrations: [new InboundFilters({ disableTransactionDefaults: true })],
  });
  ```

- **feat(replay): Add `mutationBreadcrumbLimit` and `mutationLimit` to Replay Options (#8228)**

  The previously experimental options `mutationBreadcumbLimit` and `mutationLimit` have been promoted to regular Replay
  integration options.

  A high number of DOM mutations (in a single event loop) can cause performance regressions in end-users' browsers. Use
  `mutationBreadcrumbLimit` to send a breadcrumb along with your recording if the mutation limit was reached. Use
  `mutationLimit` to stop recording if the mutation limit was reached.

- **feat(sveltekit): Add source maps support for Vercel (lambda) (#8256)**

  - feat(sveltekit): Auto-detect SvelteKit adapters (#8193)

  The SvelteKit SDK can now be used if you deploy your SvelteKit app to Vercel. By default, the SDK's Vite plugin will
  detect the used adapter and adjust the source map uploading config as necessary. If you want to override the default
  adapter detection, you can specify the `adapter` option in the `sentrySvelteKit` options:

  ```js
  // vite.config.js
  export default defineConfig({
    plugins: [
      sentrySvelteKit({
        adapter: 'vercel',
      }),
      sveltekit(),
    ],
  });
  ```

  Currently, the Vite plugin will configure itself correctly for `@sveltejs/adapter-auto`, `@sveltejs/adapter-vercel`
  and `@sveltejs/adapter-node`.

  **Important:** The SvelteKit SDK is not yet compatible with Vercel's edge runtime. It will only work for lambda
  functions.

### Other Changes

- feat(replay): Throttle breadcrumbs to max 300/5s (#8086)
- feat(sveltekit): Add option to control handling of unknown server routes (#8201)
- fix(node): Strip query and fragment from request URLs without route parameters (#8213)
- fix(remix): Don't log missing parameters warning on server-side. (#8269)
- fix(remix): Pass `loadContext` through wrapped document request function (#8268)
- fix(replay): Guard against missing key (#8246)
- fix(sveltekit): Avoid capturing redirects and 4xx Http errors in request Handlers (#8215)
- fix(sveltekit): Bump `magicast` to support `satisfied` keyword (#8254)
- fix(wasm): Avoid throwing an error when WASM modules are loaded from blobs (#8263)

## 7.53.1

- chore(deps): bump socket.io-parser from 4.2.1 to 4.2.3 (#8196)
- chore(svelte): Bump magic-string to 0.30.0 (#8197)
- fix(core): Fix racecondition that modifies in-flight sessions (#8203)
- fix(node): Catch `os.uptime()` throwing because of EPERM (#8206)
- fix(replay): Fix buffered replays creating replay w/o error occuring (#8168)

## 7.53.0

- feat(replay): Add `beforeAddRecordingEvent` Replay option (#8124)
- feat(replay): Do not capture replays < 5 seconds (#7949)
- fix(nextjs): Guard for non-absolute paths when injecting sentry config (#8151)
- fix(nextjs): Import path issue on Windows (#8142)
- fix(nextjs): Make `withSentryConfig` isomorphic (#8166)
- fix(node): Add debug logging for node checkin (#8131)
- fix(node): Add LRU map for tracePropagationTargets calculation (#8130)
- fix(node): Remove new URL usage in Undici integration (#8147)
- fix(replay): Show the correct Replay config option name `maskFn`
- fix(sveltekit): Avoid double-wrapping load functions (#8094)
- fix(tracing): Change where content-length gets added (#8139)
- fix(tracing): Use integer for content length (#8152)
- fix(utils): Fail silently if the provided Dsn is invalid (#8121)
- ref(node): Cache undici trace propagation decisions (#8136)
- ref(serverless): Remove relay extension from AWS Layer (#8080)

## 7.52.1

- feat(replay): Capture slow clicks (experimental) (#8052)

## 7.52.0

### Important Next.js SDK changes:

This release adds support Vercel Cron Jobs in the Next.js SDK. The SDK will automatically create
[Sentry Cron Monitors](https://docs.sentry.io/product/crons/) for your
[Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) configured via `vercel.json` when deployed on Vercel.

You can opt out of this functionality by setting the `automaticVercelMonitors` option to `false`:

```js
// next.config.js
const nextConfig = {
  sentry: {
    automaticVercelMonitors: false,
  },
};
```

(Note: Sentry Cron Monitoring is currently in beta and subject to change. Help us make it better by letting us know what
you think. Respond on [GitHub](https://github.com/getsentry/sentry/discussions/42283) or write to us at
crons-feedback@sentry.io)

- feat(nextjs): Add API method to wrap API routes with crons instrumentation (#8084)
- feat(nextjs): Add automatic monitors for Vercel Cron Jobs (#8088)

### Other changes

- feat(replay): Capture keyboard presses for special characters (#8051)
- fix(build): Don't mangle away global debug ID map (#8096)
- fix(core): Return checkin id from client (#8116)
- fix(core): Use last error for `ignoreErrors` check (#8089)
- fix(docs): Change to `addTracingExtensions` was not documented in MIGRATION.md (#8101)
- fix(replay): Check relative URLs correctly (#8024)
- fix(tracing-internal): Avoid classifying protocol-relative URLs as same-origin urls (#8114)
- ref: Hoist `createCheckinEnvelope` to core package (#8082)

## 7.51.2

- fix(nextjs): Continue traces in data fetchers when there is an already active transaction on the hub (#8073)
- fix(sveltekit): Avoid creating the Sentry Vite plugin in dev mode (#8065)

## 7.51.1

- feat(replay): Add event to capture options on checkouts (#8011)
- feat(replay): Improve click target detection (#8026)
- fix(node): Make sure we use same ID for checkIns (#8050)
- fix(replay: Keep session active on key press (#8037)
- fix(replay): Move error sampling to before send (#8057)
- fix(sveltekit): Wrap `load` when typed explicitly (#8049)

**Replay `rrweb` changes:**

`@sentry-internal/rrweb` was updated from 1.106.0 to 1.108.0:

- fix: Fix some input masking (esp for radio buttons) ([#85](https://github.com/getsentry/rrweb/pull/85))
- fix: Unescaped `:` in CSS rule from Safari ([#86](https://github.com/getsentry/rrweb/pull/86))
- feat: Define custom elements (web components) ([#87](https://github.com/getsentry/rrweb/pull/87))

Work in this release contributed by @sreetamdas. Thank you for your contribution!

## 7.51.0

### Important Changes

- **feat(sveltekit): Auto-wrap `load` functions with proxy module (#7994)**

`@sentry/sveltekit` now auto-wraps `load` functions in

- `+(page|layout).(ts|js)` files (universal loads)
- `+(page|layout).server.(ts|js)` files (server-only loads)

This means that you don't have to manually add the `wrapLoadWithSentry` and `wrapServerLoadWithSentry` functions around
your load functions. The SDK will not interfere with already wrapped `load` functions.

For more details, take a look at the
[Readme](https://github.com/getsentry/sentry-javascript/blob/develop/packages/sveltekit/README.md#configure-auto-instrumentation)

- **chore(angular): Upgrade `peerDependencies` to Angular 16 (#8035)**

We now officially support Angular 16 in `@sentry/angular-ivy`. Note that `@sentry/angular` _does not_ support
Angular 16.

- **feat(node): Add ability to send cron monitor check ins (#8039)**

**Note: This release contains a bug with generating cron monitors. We recommend you upgrade the JS SDK to 7.51.1 or
above to use cron monitoring functionality**

This release adds [Sentry cron monitoring](https://docs.sentry.io/product/crons/) support to the Node SDK.

Check-in monitoring allows you to track a job's progress by completing two check-ins: one at the start of your job and
another at the end of your job. This two-step process allows Sentry to notify you if your job didn't start when expected
(missed) or if it exceeded its maximum runtime (failed).

```ts
const Sentry = require('@sentry/node');

// 🟡 Notify Sentry your job is running:
const checkInId = Sentry.captureCheckIn({
  monitorSlug: '<monitor-slug>',
  status: 'in_progress',
});

// Execute your scheduled task here...

// 🟢 Notify Sentry your job has completed successfully:
Sentry.captureCheckIn({
  // make sure you pass in the checkInId generated by the first call to captureCheckIn
  checkInId,
  monitorSlug: '<monitor-slug>',
  status: 'ok',
});
```

If your job execution fails, you can notify Sentry about the failure:

```javascript
// 🔴 Notify Sentry your job has failed:
Sentry.captureCheckIn({
  checkInId,
  monitorSlug: '<monitor-slug>',
  status: 'error',
});
```

### Additional Features and Fixes

- feat(browser): Export makeMultiplexedTransport from browser SDK (#8012)
- feat(node): Add `http.method` to node http spans (#7991)
- feat(tracing): add body size for fetch requests (#7935)
- feat(tracing): Use http.method for span data (#7990)
- fix(integrations): Handle windows paths with no prefix or backslash prefix in `RewriteFrames` (#7995)
- fix(node): Mark stack frames with url protocol as in-app frames (#8008)
- fix(remix): Export `Integration` type declaration as union type (#8016)
- fix(replay): Do not add replay_id to DSC while buffering (#8020)
- fix(tracing): Don't set method multiple times (#8014)
- fix(utils): Normalize `undefined` to `undefined` instead of `"[undefined]"` (#8017)

Work in this release contributed by @srubin and @arjenbrandenburgh. Thank you for your contributions!

## 7.50.0

### Important Changes

- **doc(sveltekit): Promote the SDK to beta state (#7976)**
  - feat(sveltekit): Convert `sentryHandle` to a factory function (#7975)

With this release, the Sveltekit SDK ([@sentry/sveltekit](./packages/sveltekit/README.md)) is promoted to Beta. This
means that we do not expect any more breaking changes.

The final breaking change is that `sentryHandle` is now a function. So in order to update to 7.50.0, you have to update
your `hooks.server.js` file:

```js
// hooks.server.js

// Old:
export const handle = sentryHandle;
// New:
export const handle = sentryHandle();
```

- **feat(replay): Allow to configure URLs to capture network bodies/headers (#7953)**

You can now capture request/response bodies & headers of network requests in Replay. You have to define an allowlist of
URLs you want to capture additional information for:

```js
new Replay({
  networkDetailAllowUrls: ['https://sentry.io/api'],
});
```

By default, we will capture request/response bodies, as well as the request/response headers `content-type`,
`content-length` and `accept`. You can configure this with some additional configuration:

```js
new Replay({
  networkDetailAllowUrls: ['https://sentry.io/api'],
  // opt-out of capturing bodies
  networkCaptureBodies: false,
  // These headers are captured _in addition to_ the default headers
  networkRequestHeaders: ['X-Custom-Header'],
  networkResponseHeaders: ['X-Custom-Header', 'X-Custom-Header-2'],
});
```

Note that bodies will be truncated to a max length of ~150k characters.

**- feat(replay): Changes of sampling behavior & public API**

- feat(replay): Change the behavior of error-based sampling (#7768)
- feat(replay): Change `flush()` API to record current event buffer (#7743)
- feat(replay): Change `stop()` to flush and remove current session (#7741)

We have changed the behavior of error-based sampling, as well as adding & adjusting APIs a bit to be more aligned with
expectations. See [Sampling](./packages/replay/README.md#sampling) for details.

We've also revamped some public APIs in order to be better aligned with expectations. See
[Stoping & Starting Replays manually](./packages/replay/README.md#stopping--starting-replays-manually) for details.

- **feat(core): Add multiplexed transport (#7926)**

We added a new transport to support multiplexing. With this, you can configure Sentry to send events to different DSNs,
depending on a logic of your choosing:

```js
import { makeMultiplexedTransport } from '@sentry/core';
import { init, captureException, makeFetchTransport } from '@sentry/browser';

function dsnFromFeature({ getEvent }) {
  const event = getEvent();
  switch (event?.tags?.feature) {
    case 'cart':
      return ['__CART_DSN__'];
    case 'gallery':
      return ['__GALLERY_DSN__'];
  }
  return [];
}

init({
  dsn: '__FALLBACK_DSN__',
  transport: makeMultiplexedTransport(makeFetchTransport, dsnFromFeature),
});
```

### Additional Features and Fixes

- feat(nextjs): Add `disableLogger` option that automatically tree shakes logger statements (#7908)
- feat(node): Make Undici a default integration. (#7967)
- feat(replay): Extend session idle time until expire to 15min (#7955)
- feat(tracing): Add `db.system` span data to DB spans (#7952)
- fix(core): Avoid crash when Function.prototype is frozen (#7899)
- fix(nextjs): Fix inject logic for Next.js 13.3.1 canary (#7921)
- fix(replay): Ensure console breadcrumb args are truncated (#7917)
- fix(replay): Ensure we do not set replayId on dsc if replay is disabled (#7939)
- fix(replay): Ensure we still truncate large bodies if they are failed JSON (#7923)
- fix(utils): default normalize() to a max. of 100 levels deep instead of Inifnity (#7957)

Work in this release contributed by @Jack-Works. Thank you for your contribution!

## 7.49.0

### Important Changes

- **feat(sveltekit): Read adapter output directory from `svelte.config.js` (#7863)**

Our source maps upload plugin is now able to read `svelte.config.js`. This is necessary to automatically find the output
directory that users can specify when setting up the Node adapter.

- **fix(replay): Ensure we normalize scope breadcrumbs to max. depth to avoid circular ref (#7915)**

This release fixes a potential problem with how Replay captures console logs. Any objects logged will now be cut off
after a maximum depth of 10, as well as cutting off any properties after the 1000th. This should ensure we do not
accidentally capture massive console logs, where a stringified object could reach 100MB or more.

- **fix(utils): Normalize HTML elements as string (#7916)**

We used to normalize references to HTML elements as POJOs. This is both not very easily understandable, as well as
potentially large, as HTML elements may have properties attached to them. With this change, we now normalize them to
e.g. `[HTMLElement: HTMLInputElement]`.

### Additional Features and Fixes

- feat(browser): Simplify stack parsers (#7897)
- feat(node): Add monitor upsert types (#7914)
- feat(replay): Truncate network bodies to max size (#7875)
- fix(gatsby): Don't crash build when auth token is missing (#7858)
- fix(gatsby): Use `import` for `gatsby-browser.js` instead of `require` (#7889)
- fix(nextjs): Handle braces in stack frame URLs (#7900)
- fix(nextjs): Mark value injection loader result as uncacheable (#7870)
- fix(node): Correct typo in trpc integration transaciton name (#7871)
- fix(node): reduce deepReadDirSync runtime complexity (#7910)
- fix(sveltekit): Avoid capturing "Not Found" errors in server `handleError` wrapper (#7898)
- fix(sveltekit): Detect sentry release before creating the Vite plugins (#7902)
- fix(sveltekit): Use `sentry.properties` file when uploading source maps (#7890)
- fix(tracing): Ensure we use s instead of ms for startTimestamp (#7877)
- ref(deprecate): Deprecate `timestampWithMs` (#7878)
- ref(nextjs): Don't use Sentry Webpack Plugin in dev mode (#7901)

## 7.48.0

### Important Changes

- **feat(node): Add `AsyncLocalStorage` implementation of `AsyncContextStrategy` (#7800)**
  - feat(core): Extend `AsyncContextStrategy` to allow reuse of existing context (#7778)
  - feat(core): Make `runWithAsyncContext` public API (#7817)
  - feat(core): Add async context abstraction (#7753)
  - feat(node): Adds `domain` implementation of `AsyncContextStrategy` (#7767)
  - feat(node): Auto-select best `AsyncContextStrategy` for Node.js version (#7804)
  - feat(node): Migrate to domains used through `AsyncContextStrategy` (#7779)

This release switches the SDK to use
[`AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage) as the async context isolation
mechanism in the SDK for Node 14+. For Node 10 - 13, we continue to use the Node
[`domain`](https://nodejs.org/api/domain.html) standard library, since `AsyncLocalStorage` is not supported there.
**Preliminary testing showed
[a 30% improvement in latency and rps](https://github.com/getsentry/sentry-javascript/issues/7691#issuecomment-1504009089)
when making the switch from domains to `AsyncLocalStorage` on Node 16.**

If you want to manually add async context isolation to your application, you can use the new `runWithAsyncContext` API.

```js
import * as Sentry from '@sentry/node';

const requestHandler = (ctx, next) => {
  return new Promise((resolve, reject) => {
    Sentry.runWithAsyncContext(async () => {
      const hub = Sentry.getCurrentHub();

      hub.configureScope(scope =>
        scope.addEventProcessor(event =>
          Sentry.addRequestDataToEvent(event, ctx.request, {
            include: {
              user: false,
            },
          }),
        ),
      );

      try {
        await next();
      } catch (err) {
        reject(err);
      }
      resolve();
    });
  });
};
```

If you're manually using domains to isolate Sentry data, we strongly recommend switching to this API!

In addition to exporting `runWithAsyncContext` publicly, the SDK also uses it internally where we previously used
domains.

- **feat(sveltekit): Remove `withSentryViteConfig` (#7789)**
  - feat(sveltekit): Remove SDK initialization via dedicated files (#7791)

This release removes our `withSentryViteConfig` wrapper we previously instructed you to add to your `vite.config.js`
file. It is replaced Vite plugins which you simply add to your Vite config, just like the `sveltekit()` Vite plugins. We
believe this is a more transparent and Vite/SvelteKit-native way of applying build time modifications. Here's how to use
the plugins:

```js
// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

export default {
  plugins: [sentrySvelteKit(), sveltekit()],
  // ... rest of your Vite config
};
```

Take a look at the [`README`](https://github.com/getsentry/sentry-javascript/blob/develop/packages/sveltekit/README.md)
for updated instructions!

Furthermore, with this transition, we removed the possibility to intialize the SDK in dedicated
`sentry.(client|server).config.js` files. Please use SvelteKit's
[hooks files](https://github.com/getsentry/sentry-javascript/blob/develop/packages/sveltekit/README.md#2-client-side-setup)
to initialize the SDK.

Please note that these are **breaking changes**! We're sorry for the inconvenience but the SvelteKit SDK is still in
alpha stage and we want to establish a clean and SvelteKit-friendly API before making the SDK stable. You have been
[warned](https://github.com/getsentry/sentry-javascript/blob/eb921275f9c572e72c2348a91cb39fcbb8275b8d/packages/sveltekit/README.md#L20-L24)
;)

- **feat(sveltekit): Add Sentry Vite Plugin to upload source maps (#7811)**

This release adds automatic upload of source maps to the SvelteKit SDK. No need to configure anything other than adding
our Vite plugins to your SDK. The example above shows you how to do this.

Please make sure to follow the
[`README`](https://github.com/getsentry/sentry-javascript/blob/develop/packages/sveltekit/README.md#uploading-source-maps)
to specify your Sentry auth token, as well as org and project slugs.

**- feat(replay): Capture request & response headers (#7816)**

Replay now captures the `content-length`, `content-type`, and `accept` headers from requests and responses
automatically.

### Additional Features and Fixes

- feat(browser): Export request instrumentation options (#7818)
- feat(core): Add async context abstraction (#7753)
- feat(core): Add DSC to all outgoing envelopes (#7820)
- feat(core): Cache processed stacks for debug IDs (#7825)
- feat(node): Add checkin envelope types (#7777)
- feat(replay): Add `getReplayId()` method (#7822)
- fix(browser): Adjust `BrowserTransportOptions` to support offline transport options (#7775)
- fix(browser): DOMException SecurityError stacktrace parsing bug (#7821)
- fix(core): Log warning when tracing extensions are missing (#7601)
- fix(core): Only call `applyDebugMetadata` for error events (#7824)
- fix(integrations): Ensure httpclient integration works with Request (#7786)
- fix(node): `reuseExisting` does not need to call bind on domain (#7780)
- fix(node): Fix domain scope inheritance (#7799)
- fix(node): Make `trpcMiddleware` factory synchronous (#7802)
- fix(serverless): Account when transaction undefined (#7829)
- fix(utils): Make xhr instrumentation independent of parallel running SDK versions (#7836)

## 7.47.0

### Important Changes

- **feat(browser)**: Add captureUserFeedback (#7729)

This release adds a new API, `Sentry.captureUserFeedback`, to browser-side SDKs that allows you to send user feedback to
Sentry without loading and opening Sentry's user feedback dialog. This allows you to obtain user feedback however and
whenever you want to and simply send it to Sentry using the SDK.

For instance, you can collect feedback, whenever convenient as shown in this example:

```js
const eventId = Sentry.captureMessage('User Feedback');
const user = Sentry.getCurrentHub().getScope().getUser();
const userFeedback = {
  event_id: eventId;
  email: user.email
  name: user.username
  comments: 'I really like your App, thanks!'
}
Sentry.captureUserFeedback(userFeedback);
```

Note that feedback needs to be coupled to an event but as in the example above, you can just use `Sentry.captureMessage`
to generate one.

You could also collect feedback in a custom way if an error happens and use the SDK to send it along:

```js
Sentry.init({
  dsn: '__DSN__',
  beforeSend: event => {
    const userFeedback = collectYourUserFeedback();
    const feedback = {
      ...userFeedback,
      event_id: event.event_id.
    }
    Sentry.captureUserFeedback(feedback);
    return event;
  }
})
```

- **feat(tracing)**: Deprecate `@sentry/tracing` exports (#7611)

With this release, we officially deprecate all exports from the `@sentry/tracing` package, in favour of using them
directly from the main SDK package. The `@sentry/tracing` package will be removed in a future major release.

Please take a look at the [Migration docs](./MIGRATION.md/#remove-requirement-for-sentrytracing-package-since-7460) for
more details.

### Additional Features and Fixes

- feat(sveltekit): Add partial instrumentation for client-side `fetch` (#7626)
- fix(angular): Handle routes with empty path (#7686)
- fix(angular): Only open report dialog if error was sent (#7750)
- fix(core): Determine debug ID paths from the top of the stack (#7722)
- fix(ember): Ensure only one client is created & Replay works (#7712)
- fix(integrations): Ensure HttpClient integration works with Axios (#7714)
- fix(loader): Ensure JS loader works with tracing & add tests (#7662)
- fix(nextjs): Restore tree shaking capabilities (#7710)
- fix(node): Disable `LocalVariables` integration on Node < v18 (#7748)
- fix(node): Redact URL authority only in breadcrumbs and spans (#7740)
- fix(react): Only show report dialog if event was sent to Sentry (#7754)
- fix(remix): Remove unnecessary dependencies (#7708)
- fix(replay): Ensure circular references are handled (#7752)
- fix(sveltekit): Don't capture thrown `Redirect`s as exceptions (#7731)
- fix(sveltekit): Log error to console by default in `handleErrorWithSentry` (#7674)
- fix(tracing): Make sure idle transaction does not override other transactions (#7725)

Work in this release contributed by @de-don and @TrySound. Thank you for your contributions!

## 7.46.0

### Important Changes

- **feat(sveltekit)**: Add Performance Monitoring for SvelteKit
  - feat(sveltekit): Add meta tag for backend -> frontend (#7574)
  - fix(sveltekit): Explicitly export Node SDK exports (#7644)
  - fix(sveltekit): Handle nested server calls in `sentryHandle` (#7598)
  - ref(sveltekit): Split up universal and server load wrappers (#7652)

This release adds support for Performance Monitoring in our SvelteKit SDK for the client/server. We've also changed how
you should initialize your SDK. Please read our updated [SvelteKit README instructions](./packages/sveltekit/README.md)
for more details.

- **feat(core)**: Add `ignoreTransactions` option (#7594)

You can now easily filter out certain transactions from being sent to Sentry based on their name.

```ts
Sentry.init({
  ignoreTransactions: ['/api/healthcheck', '/ping'],
});
```

- **feat(node)**: Undici integration (#7582)
  - feat(nextjs): Add Undici integration automatically (#7648)
  - feat(sveltekit): Add Undici integration by default (#7650)

We've added an integration that automatically instruments [Undici](https://github.com/nodejs/undici) and Node server
side fetch. This supports Undici `v4.7.0` or higher and requires Node `v16.7.0` or higher. After adding the integration
outgoing requests made by Undici will have associated spans and breadcrumbs in Sentry.

```ts
Sentry.init({
  integrations: [new Sentry.Integrations.Undici()],
});
```

In our Next.js and SvelteKit SDKs, this integration is automatically added.

- **feat(node)**: Add Sentry tRPC middleware (#7511)

We've added a new middleware for [trpc](https://trpc.io/) that automatically adds TRPC information to Sentry
transactions. This middleware is meant to be used in combination with a Sentry server integration (Next.js, Express,
etc).

```ts
import { initTRPC } from '@trpc/server';
import * as Sentry from '@sentry/node';

const t = initTRPC.context().create();
const sentryMiddleware = t.middleware(
  Sentry.Handlers.trpcMiddleware({
    attachRpcInput: true,
  }),
);

const sentrifiedProcedure = t.procedure.use(sentryMiddleware);
```

- **feat(tracing)**: Remove requirement for `@sentry/tracing` package

With `7.46.0` you no longer require the `@sentry/tracing` package to use tracing and performance monitoring with the
Sentry JavaScript SDKs. The `@sentry/tracing` package will be removed in a future major release, but can still be used
with no changes.

Please see the [Migration docs](./MIGRATION.md/#remove-requirement-for-sentrytracing-package-since-7460) for more
details.

- **fix(node)**: Convert debugging code to callbacks to fix memory leak in `LocalVariables` integration (#7637)

This fixes a memory leak in the opt-in
[`LocalVariables` integration](https://blog.sentry.io/2023/02/01/local-variables-for-nodejs-in-sentry/), which adds
local variables to the stacktraces sent to Sentry. The minimum recommended version to use the `LocalVariables` is now
`7.46.0`.

### Additional Features and Fixes

- feat(node): Auto discovery only returns integrations where dependency loads (#7603)
- feat(node): Sanitize URLs in Span descriptions and breadcrumbs (PII) (#7667)
- feat(replay): Add `responseStatus`, `decodedBodySize` to perf entries (#7613)
- feat(replay): Add experiment to capture request/response bodies (#7589)
- feat(replay): Capture replay mutation breadcrumbs & add experiment (#7568)
- feat(tracing): Ensure `pageload` transaction starts at timeOrigin (#7632)
- fix(core): Remove `abs_path` from stack trace (reverting #7167) (#7623)
- fix(nextjs): Add loading component type to server component wrapping (#7639)
- fix(nextjs): Don't report `NEXT_NOT_FOUND` and `NEXT_REDIRECT` errors (#7642)
- fix(nextjs): Rewrite `abs_path` frames (#7619)
- fix(nextjs): Show errors and warnings only once during build (#7651)
- fix(nextjs): Use Next.js internal AsyncStorage (#7630)
- fix(nextjs): Gracefully handle undefined `beforeFiles` in rewrites (#7649)

Work in this release contributed by @aldenquimby and @bertho-zero. Thank you for your contributions!

## 7.45.0

- build(cdn): Ensure ES5 bundles do not use non-ES5 code (#7550)
- feat(core): Add trace function (#7556)
- feat(hub): Make scope always defined on the hub (#7551)
- feat(replay): Add `replay_id` to transaction DSC (#7571)
- feat(replay): Capture fetch body size for replay events (#7524)
- feat(sveltekit): Add performance monitoring for client load (#7537)
- feat(sveltekit): Add performance monitoring for server load (#7536)
- feat(sveltekit): Add performance monitoring to Sveltekit server handle (#7532)
- feat(sveltekit): Add SvelteKit routing instrumentation (#7565)
- fix(browser): Ensure keepalive flag is correctly set for parallel requests (#7553)
- fix(core): Ensure `ignoreErrors` only applies to error events (#7573)
- fix(node): Consider tracing error handler for process exit (#7558)
- fix(otel): Make sure we use correct hub on finish (#7577)
- fix(react): Handle case where error.cause already defined (#7557)

## 7.44.2

- fix(cdn): Fix ES5 CDN bundles (#7544)

## 7.44.1

- ref(core): Move beforeEnvelope to client (#7527)

## 7.44.0

This release introduces the first alpha version of `@sentry/sveltekit`, our newest JavaScript SDK for Sveltekit. Check
out the [README](./packages/sveltekit/README.md) for usage instructions and what to expect from this alpha release.

- feat(replay): Add `request_body_size` & `response_body_size` to fetch/xhr (#7407)
- feat(replay): Add additional properties for UI clicks (#7395)
- feat(replay): Reduce time limit before pausing a recording (#7356)
- feat(replay): Upgrade `rrweb` and `rrweb-player` (#7508)
- feat(replay): Use new afterSend hook to improve error linking (#7390)
- feat(serverless): Publish lambda layer for Node 16/18 (#7483)
- feat(sveltekit): Add wrapper for client load function (#7447)
- feat(sveltekit): Add wrapper for server load function (#7416)
- feat(sveltekit): Add server-side `handleError` wrapper (#7411)
- feat(sveltekit): Introduce client-side `handleError` wrapper (#7406)
- feat(sveltekit): Add SvelteKit client and server `init` functions (#7408)
- feat(sveltekit): Inject `Sentry.init` calls into server and client bundles (#7391)
- feat(tracing): Expose `BrowserTracing` in non-tracing bundles (#7479)
- fix(core): Permanent idle timeout cancel finishes the transaction with the last finished child
- fix(integrations): Handle lower-case prefix windows paths in `RewriteFrames` (#7506)
- fix(next): Guard against missing serverSideProps (#7517)
- fix(nextjs): Fix broken server component wrapping because of interrupted promise chain (#7456)
- fix(nextjs): Fix runtime error for static pages (#7476)
- fix(profiling): Catch sendProfile rejection (#7446)
- fix(replay): Never capture file input changes (#7485)
- fix(serverless): Explicitly export node package exports (#7457)
- fix(vue): Do not depend on `window.location` for SSR environments (#7518)

**Replay `rrweb` changes:**

`@sentry-internal/rrweb` was updated from 1.105.0 to 1.106.0:

- feat: Ensure password inputs are always masked ([#78](https://github.com/getsentry/rrweb/pull/78))
- fix: Ensure text masking for updated attributes works ([#83](https://github.com/getsentry/rrweb/pull/83))
- fix: Ensure unmaskTextSelector is used for masked attributes ([#81](https://github.com/getsentry/rrweb/pull/81))
- fix: Mask <option> values for selects & radio/checkbox value ([#75](https://github.com/getsentry/rrweb/pull/75))

Work in this release contributed by @woochanleee and @baked-dev. Thank you for your contribution!

## 7.43.0

- feat(nextjs): Run source map upload in Vercel develop and preview environments (#7436)
- feat(types): Add `profilesSampler` option to node client type (#7385)
- fix(core): Avoid using `Array.findIndex()` as it is ES5 incompatible (#7400)
- fix(nextjs): Add better error messages for missing params during next build (#7434)
- fix(nextjs): Don't crash build when auth token is missing
- fix(node): Revert to dynamic `require` call to fix monkey patching (#7430)
- fix(types): Fix node types & add E2E test (#7429)

## 7.42.0

- feat(core): Add lifecycle hooks (#7370)
- feat(core): Emit hooks for transaction start/finish (#7387)
- feat(nextjs): Connect traces for server components (#7320)
- feat(replay): Attach an error `cause` to send exceptions (#7350)
- feat(replay): Consider user input in form field as "user activity" (#7355)
- feat(replay): Update rrweb to 1.105.0 & add breadcrumb when encountering large mutation (#7314)
- feat(tracing): Expose cancelIdleTimeout and add option to make it permanent (#7236)
- feat(tracing): Track PerformanceObserver interactions as spans (#7331)
- fix(core): Ensure `originalException` has type `unknown` (#7361)
- fix(core): Avoid using `Object.values()` (#7360)
- fix(react): Make redux integration be configurable via `normalizeDepth` (#7379)
- fix(tracing): Record LCP and CLS on transaction finish (#7386)
- ref(browser): Improve type safety of breadcrumbs integration (#7382)
- ref(node): Parallelize disk io when reading source files for context lines (#7374)
- ref(node): Partially remove dynamic `require` calls (#7377)

**Replay `rrweb` changes:**

`@sentry-internal/rrweb` was updated from 1.104.1 to 1.105.0 (#7314):

- feat: Add `onMutation` option to record ([#70](https://github.com/getsentry/rrweb/pull/69))
- fix: Ensure `<input type='submit' value='Btn text'>` is masked ([#69](https://github.com/getsentry/rrweb/pull/69))

## 7.41.0

- feat: Ensure we use the same default `environment` everywhere (#7327)
- feat(profiling): Add JS self profiling in the browser (#7273)
- feat(vue): Allow to set `routeLabel: 'path'` to opt-out of using name (#7326)
- fix(profiling): Guard from throwing if profiler constructor throws (#7328)
- fix(react): Use namespace import for react router v6 (#7330)
- fix(remix): Correctly parse `X-Forwarded-For` Http header (#7329)

Work in this release contributed by @OliverJAsh. Thank you for your contribution!

## 7.40.0

- feat(nextjs): Automatically resolve source of errors in dev mode (#7294)
- feat(vue): Log errors to the console by default (#7310)
- fix(ember): Disable performance in FastBoot (#7282)
- fix(serverless): Capture custom tags in error events of GCP functions (#7298)
- fix(serverless): Capture custom tags in GCP Background and CloudEvent function error events (#7301)

## 7.39.0

This release adds a new package, `@sentry/angular-ivy`, which is our Angular SDK with full support for Angular's
rendering engine, Ivy.

This release also adds a new `enableTracing` option, which can be used instead of `tracesSampleRate` for an easier
setup. Related to this, the `hasTracingEnabled` utility function was moved from `@sentry/tracing` to `@sentry/core`. The
old export from `@sentry/tracing` has been deprecated and will be removed in v8.

- feat(angular): Add Ivy-compatible Angular SDK package (#7264)
- feat(core): Add source map images to `debug_meta` (#7168)
- feat(loader): Make lazy-loading configurable (#7232)
- feat(nextjs): Add performance monitoring to server components (#7242)
- feat(nextjs): Default to `VERCEL_ENV` as environment (#7227)
- feat(replay): Add more default block filters (#7233)
- feat(tracing): Add `enableTracing` option (#7238)
- fix(core): Exclude client reports from offline queuing (#7226)
- fix(nextjs): Export serverside data-fetcher wrappers from client (#7256)
- fix(replay): Fix timestamps on LCP (#7225)

**Replay `rrweb` changes:**

`@sentry-internal/rrweb` was updated from 1.103.0 to 1.104.1 (#7238):

- feat: Export `typings/types` ([#60](https://github.com/getsentry/rrweb/pull/60))
- feat: Remove `autoplay` attribute from audio/video tags ([#59](https://github.com/getsentry/rrweb/pull/59))
- fix: Exclude `modulepreload` as well ([#52](https://github.com/getsentry/rrweb/pull/52))
- fix: Handle removed attributes ([#65](https://github.com/getsentry/rrweb/pull/65))
- fix: Masking inputs on change when `maskAllInputs:false` ([#61](https://github.com/getsentry/rrweb/pull/61))
- fix: More robust `rootShadowHost` check ([#50](https://github.com/getsentry/rrweb/pull/50))
- fix: Textarea value is being duplicated ([#62](https://github.com/getsentry/rrweb/pull/62))

## 7.38.0

- feat: Put `abs_path` into stack frame object (#7167)
- feat(integrations): Deprecate `Offline` integration (#7063)
- feat(otel): Convert exception otel events to sentry errors (#7165)
- feat(replay): Change LCP calculation (#7187)
- feat(tracing): Support Apollo/GraphQL with NestJS (#7194)
- feat(tracing): Track `PerformanceResourceTiming.renderBlockingStatus` (#7127)
- feat(tracing|core): Remove transaction name change recording (#7197)
- fix(browser): Ensure dedupe integration ignores non-errors (#7172)
- fix(core): Skip empty integrations (#7204)
- fix(nextjs): Fix faulty import in Next.js .d.ts (#7175)
- fix(otel): Make otel.kind be a string (#7182)
- fix(react): Make fallback render types more accurate (#7198)
- fix(replay): Debounced flushes not respecting `maxWait` (#7207, #7208)
- ref(replay): Improve logging for stopped replay (#7174)

Work in this release contributed by @lucas-zimermann. Thank you for your contribution!

## 7.37.2

This release includes changes and fixes around text masking and blocking in Replay's `rrweb` dependency. See versions
[1.102.0](https://github.com/getsentry/rrweb/releases/tag/1.102.0) and
[1.103.0](https://github.com/getsentry/rrweb/releases/tag/1.103.0).

- feat: Check `blockSelector` for blocking elements as well
- feat: With maskAllText, mask the attributes: placeholder, title, `aria-label`
- feat: fix masking on `textarea`
- feat: Add `maskAllText` option

SDK Changes:

- fix(replay): Fix svgs not getting unblocked (#7132)

## 7.37.1

- fix(browser): Support `async` in stack frame urls (#7131)
- fix(nextjs): Make api route identifier stricter (#7126)
- fix(node): Don't rely on `this` in http integration (#7135)
- fix(replay): Fix missing fetch/xhr requests (#7134)
- fix(tracing): Export `defaultStackParser` from tracing CDN bundles (#7116)

## 7.37.0

- feat: Add source map debug ids (#7068)
- feat(browser): Add IndexedDb offline transport store (#6983)
- feat(nextjs): Add auto-wrapping for server components (#6953)
- feat(nextjs): Improve client stack traces (#7097)
- feat(replay): Improve rrweb error ignoring (#7087 & #7094)
- feat(replay): Send client_report when replay sending fails (#7093)
- fix(node): `LocalVariables`, Improve frame matching for ESM (#7049)
- fix(node): Add lru cache to http integration span map (#7064)
- fix(replay): Export Replay from Sentry namespace in full CDN bundle (#7119)

Work in this release contributed by @JamesHenry. Thank you for your contribution!

## 7.36.0

This Release re-introduces the accidentally removed but still deprecated `maskInputOptions` option for Session Replay.
Furthermore, replays are now stopped instead of paused when a rate limit is encountered.

- feat(replay): Add back deprecated `maskInputOptions` (#6981)
- feat(replay): Stop recording when hitting a rate limit (#7018)
- fix(integrations): Report `BaseClient` integrations added after init (#7011)
- fix(replay): Don't mangle private rrweb property (#7033)
- fix(replay): Fix feature detection of PerformanceObserver (#7029)

## 7.35.0

Session Replay is deprecating privacy options in favor of a more streamlined API. Please see the
[Replay migration guide](https://github.com/getsentry/sentry-javascript/blob/master/packages/replay/MIGRATION.md) for
further information. Additionally, the following configuration options will no longer be configurable: `slimDOMOptions`,
`recordCanvas`, `inlineStylesheet`, `collectFonts`, `inlineImages`.

- feat(browser): Track if cdn or npm bundle (#6976)
- feat(core): Add aria label to breadcrumb attributes (#6955)
- feat(core): Add Offline Transport wrapper (#6884)
- feat(loader): Add SENTRY_SDK_SOURCE to track loader stats (#6985)
- feat(loader): Sync loader with Sentry template (#7001)
- feat(replay): Deprecate privacy options in favor of a new API, remove some recording options (#6645)
- feat(replay): Move sample rate tags into event context (#6659)
- fix(nextjs): Add isomorphic versions of `ErrorBoundary`, `withErrorBoundary` and `showReportDialog` (#6987)
- fix(nextjs): Don't modify require calls in wrapping loader (#6979)
- fix(nextjs): Don't share I/O resources in between requests (#6980)
- fix(nextjs): Inject client config into `_app` instead of `main` (#7009)
- fix(nextjs): Use Proxies to wrap to preserve static methods (#7002)
- fix(replay): Catch style mutation handling & null events in rrweb (#7010)
- fix(replay): Handle compression failures more robustly (#6988)
- fix(replay): Only call `scope.getLastBreadcrumb` if available (#6969)
- fix(utils): Account for null prototype during normalization (#6925)
- ref(replay): Log warning if sample rates are all undefined (#6959)

Work in this release contributed by @boblauer. Thank you for your contribution!

## 7.34.0

This release adds automatic injection of the Next.js SDK into serverside `app` directory bundles, allowing users to call
the Sentry SDK in server components.

- feat(nextjs): Add SDK to serverside `app` directory (#6927)
- fix(replay): Do not renew session in error mode (#6948)
- fix(replay): Handle compression worker errors more gracefully (#6936)
- fix(replay): fix path separator substitution to replay all `\` (#6932)
- fix(replay): ignore errors in CSSStyleSheetObserver (getsentry/rrweb#16)

Work in this release contributed by @mdtro. Thank you for your contribution!

## 7.33.0

With this release, the sample rate for Session Replays will default to 0. We recommend explicitly setting the sample
rate via the `replaysSessionSampleRate` and `replaysOnErrorSampleRate` options.

- feat(replay): Remove default sample rates for replay (#6878)
- feat(replay): try/catch around stopRecording (#6856)
- fix(nextjs): Mark multiplexer targets as entrypoints (#6919)

## 7.32.1

- fix(nextjs): Make SDK multiplexer more resilient (#6905)

## 7.32.0

- build(replay): Stop preserving modules (#6817)
- feat(nextjs): Add browser SDK to `app` directory browser bundle (#6812)
- feat(node): Use `includeLocalVariables` option to enable `LocalVariables` integration (#6874)
- feat(node): Add option to capture local variables for caught exceptions via LocalVariables integration (#6876)
- feat(replay): Add `flush` method to integration (#6776)
- feat(replay): Handle worker loading errors (#6827)
- feat(replay): Lower the flush max delay from 15 seconds to 5 seconds (#6761)
- feat(tracing): Promote `enableLongTask` to option of `BrowserTracing` (#6837)
- fix(core): Fix replay client report data category (#6891)
- fix(nextjs): Fix SDK multiplexer loader on Windows (#6866)
- fix(otel): Use http/grpc status over span status (#6879)
- fix(react): Add children prop for Profiler (#6828)
- fix(react): Make wrapCreateBrowserRouter generic (#6862)
- fix(remix): Make sure the domain is created before running. (#6852)
- ref(nextjs): Remove NFT build time exclusions (#6846)
- ref(replay): Avoid duplicate debounce timers (#6863)
- ref(replay): Remove unused `initialFlushDelay` option (#6867)
- ref(replay): Send SDK version in Replay events (#6814)

Work in this release contributed by @h3rmanj. Thank you for your contribution!

## 7.31.1

- build(replay): Provide full browser+tracing+replay bundle (#6793)
- feat(nextjs): Disable NextJS perf monitoring when using otel (#6820)
- fix(nextjs): Add back browser field in package.json (#6809)
- fix(nextjs): Connect Edge API route errors to span (#6806)
- fix(nextjs): Correctly handle ts middleware files (#6816)

## 7.31.0

The Next.js SDK now supports error and performance monitoring for Next.js
[middleware](https://nextjs.org/docs/advanced-features/middleware) and
[Edge API routes](https://nextjs.org/docs/api-routes/edge-api-routes). To set it up, add a `sentry.edge.config.js` or
`sentry.edge.config.ts` file to the root of your project and initialize the SDK:

```js
// sentry.edge.config.js or sentry.edge.config.ts

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN || 'YOUR DSN HERE',
  tracesSampleRate: 1.0,
});
```

The Next.js will automatically instrument Edge API routes and middleware. If you want to opt out of automatic
instrumentation of middleware can use the `autoInstrumentMiddleware` option in the `sentry` object of your Next.js
configuration:

```javascript
const moduleExports = {
  sentry: {
    autoInstrumentMiddleware: false,
  },
};
```

Middleware can be manually instrumented by using the `wrapMiddlewareWithSentry` function.

- feat(nextjs): Add Edge Runtime SDK (#6752)
- feat(nextjs): Add optional options argument to `withSentryConfig` as an alternative to the `sentry` property (#6721)
- feat(nextjs): Add edge route and middleware wrappers (#6771)
- feat(nextjs): Auto-wrap edge-routes and middleware (#6746)
- feat(replay): Update rrweb & rrweb-snapshot (#6749)
- feat(replay): Stop recording when retry fails (#6765)
- feat(replay): Stop without retry when receiving bad API response (#6773)
- feat(types): Add Trace Context type (#6714)
- fix(nextjs): Export isomorphic data fetching wrappers from client SDK (#6790)
- fix(nextjs): Make Next.js types isomorphic (#6707)
- fix(node): Handle node build without inspector in LocalVariables integration (#6780)
- fix(otel): Set trace context via Otel Span instead of Sentry span (#6724)
- fix(otel): Prevent baggage from being overwritten (#6709)
- fix(otel): Make sure we handle when sentry-trace is an empty array (#6781)
- fix(remix): Make remix SDK type exports isomorphic (#6715)
- fix(replay): Fix `checkoutEveryNms` (#6722)
- fix(replay): Fix incorrect uncompressed recording size due to encoding (#6740)
- fix(tracing): Attach request instrumentation span to active span instead of current transaction (#6778)
- ref(nextjs): Deprecate `isBuild()` and `IS_BUILD` (#6727)

## 7.30.0

- feat(core): Add `addIntegration` method to client (#6651)
- feat(core): Add `replay_event` type for events (#6481)
- feat(gatsby): Support Gatsby v5 (#6635)
- feat(integrations): Add HTTPClient integration (#6500)
- feat(node): Add `LocalVariables` integration to capture local variables to stack frames (#6478)
- feat(node): Check for invalid url in node transport (#6623)
- feat(replay): Remove `replayType` from tags and into `replay_event` (#6658)
- feat(transport): Return result through Transport send (#6626)
- fix(nextjs): Don't wrap `res.json` and `res.send` (#6674)
- fix(nextjs): Don't write to `res.end` to fix `next export` (#6682)
- fix(nextjs): Exclude SDK from Edge runtime bundles (#6683)
- fix(replay): Allow Replay to be used in Electron renderers with nodeIntegration enabled (#6644)
- fix(utils): Ignore stack frames over 1kb (#6627)
- ref(angular) Add error-like objects handling (#6446)
- ref(nextjs): Remove `instrumentSever` (#6592)

Work in this release contributed by @rjoonas, @Naddiseo, and @theofidry. Thank you for your contributions!

## 7.29.0

This update includes a change to the `@sentry/nextjs` SDK that may increase response times of requests in applications
deployed to Vercel or AWS lambdas to ensure that error events are sent consistently. Additionally, Next.js applications
deployed to Vercel or AWS lambdas may also see an uptick in sent transactions. (for more information see #6578)

- feat(core): Add `getSdkMetadata` to `Client` (#6643)
- feat(nextjs): Send events consistently on platforms that don't support streaming (#6578)
- feat(replay): Use new `prepareEvent` util & ensure dropping replays works (#6522)
- feat(types): Upstream some replay types (#6506)
- fix(replay): Envelope send should be awaited in try/catch (#6625)
- fix(replay): Improve handling of `maskAllText` selector (#6637)
- fix(tracing): Don't finish React Router 6 `pageload` transactions early (#6609)

## 7.28.1

- fix(replay): Do not mangle `_metadata` in client options (#6600)
- fix(replay): Cater for event processor returning null (#6576)

## 7.28.0

- feat(nextjs): Check for Vercel Edge Function GA (#6565)
- feat(utils): Improved envelope parser (#6580)
- fix(nextjs): Export Replay from `index.server.ts` to avoid TS error (#6577)
- fix(nextjs): Pass `this` through wrappers (#6572)
- ref(types): Add `undefined` as possible event type (#6584)

## 7.27.0

This release exports the Session Replay integration via `@sentry/browser` and all framework SDKs building on top of it.
Going forward, the `@sentry/replay` package doesn't have to be installed explicitly to use Replay. Furthermore, this
release increases the maximim replay session duration from 30 minutes to 1 hour.

- feat(browser): Export `Replay` integration from Browser SDK (#6508)
- feat(replay): Change `MAX_SESSION_LIFE` to 1 hour (#6561)
- feat(replay): Do not capture errors originating from rrweb (#6521)
- feat(replay): Flush immediately on DOM checkouts (#6463)
- fix(core): Make `beforeSend` handling defensive for different event types (#6507)
- fix(replay): Ensure lodash.debounce does not trigger next.js warning (#6551)
- fix(replay): Make `maskAllText` selector more specific (#6544)
- fix(replay): Send `dsn` in envelope header if tunneling is active (#6568)
- fix(utils): Don't attach context lines to stack frames without line number (#6549)
- ref(replay): Send SDK's name in replay event (#6514)

Work in this release contributed by @theofidry. Thank you for your contribution!

## 7.26.0

- feat(browser): Export event builder methods for use in other SDKs (#6515)
- feat(types): Add threads to Event (#6516)
- feat(nextjs): Add option to automatically tunnel events (#6425)
- fix(nextjs): Fix automatic release value discovery (#6513)
- ref(nextjs): Use generic loader to inject global values (#6484)

Work in this release contributed by @theofidry. Thank you for your contribution!

## 7.25.0

- feat(core): Add `scope.getLastBreadcrumb()` (#6495)
- feat(replay): Allow to opt-in to capture replay exceptions (#6482)
- feat(tracing): Add interaction transaction as an experiment (#6210)
- feat(types): Add profile envelope item type (#6468)
- fix(replay): Replace `_waitForError` with `recordingMode` (#6489)
- ref(replay): Inline lodash dependency into build (#6483)
- build(core): Do not mangle private methods used by Replay (#6493)

## 7.24.2

- fix(replay): Add missing rrweb type declarations (#6464)
- fix(tracing): Check for otel before loading db module (#6461)
- fix(tracing): Deprecate and remove `reportAllChanges` option (#6456)
- ref(replay): Extract integration to clarify public API (#6457)

## 7.24.1

This patch corrects an oversight on our end which caused the Sentry Replay integration CDN bundles to be ignored when
uploading bundles to our CDN. If you want to use the Replay CDN bundles, please use version 7.24.1 or newer.

- fix(react): Add type for React Router's `encodeLocation` method (#6439)
- fix(replay): Add CDN bundle path to release artifacts (#6452)
- fix(tracing): Instrument cursors returned from MongoDB operations. (#6437)
- ref(angular): Extract zonejs error unwrapper into a dedicated function (#6443)

Work in this release contributed by @theofidry. Thank you for your contribution!

## 7.24.0

This release bumps the
[`@sentry/replay`](https://github.com/getsentry/sentry-javascript/blob/master/packages/replay/README.md) package from
version 0.x to 7.24.0. Along with this version bump, we're introducing a few breaking changes. Take a look at the
[Replay migration guide](https://github.com/getsentry/sentry-javascript/blob/master/packages/replay/MIGRATION.md) for
further information. The Replay version bump is the result of moving the package into the Sentry JavaScript SDK monorepo
which aligns the version with our other JS SDK packages. **Important:** If you're using Replay with version 7.24.x or
newer, make sure to also upgrade your other `@sentry/*` packages to this version.

- feat(browser): Support dom.maxStringLength configuration (#6311)
- feat(nextjs): Don't init SDK on Vercel Edge Runtime (#6408)
- feat(nextjs): Parameterize prefix loader values (#6377)
- feat(nextjs): Support `assetPrefix` option (#6388)
- fix(nextjs): Inject SDK in dev mode (#6368)
- fix(nextjs): Use `basePath` for `assetPrefix` if needed (#6424)
- fix(node): Move `profilesSampleRate` into `BaseNodeOptions` (#6409)
- ref(nextjs): Clean up client-side integrations code (#6382)
- ref(nextjs): Use loader for rather than webpack plugin for injecting release (#6404)
- ref(remix): Do not fail silently if `getClientIpAddress` throws error. (#6400)

Work in this release contributed by @tomgrossman and @ZachGawlik. Thank you for your contributions!

## 7.23.0

- feat(browser): Add `__SENTRY_RELEASE__` magic string (#6322)
- fix(node): Add `profilesSampleRate` (#6318)
- fix(otel): Account for number status code (#6345)
- fix(otel): Add trace info to error events (#6364)
- fix(otel): Set root transaction name to be route (#6334)
- ref(core): Move sentry breadcrumb logic into integration (#6195)
- ref(tracing): Remove `sentry_reportAllChanges` tag (#6360)

Work in this release contributed by @zhiyan114. Thank you for your contributions!

## 7.22.0

- feat(core): Pass `event` as third argument to `recordDroppedEvent` (#6289)
- fix(nextjs): Apply Webpack configuration in dev mode (#6291)
- fix(react): Relax React Router 6 `RouteObject` typing. (#6274)
- fix(remix): Prevent crashes from failed `normalizeRemixRequest` calls. (#6296)
- fix(remix): Attempt to extract user IP from request headers. (#6263)
- fix(remix): Pass transaction name as route to `RequestData`. (#6276)

## 7.21.1

- fix(nextjs): Stop excluding `withSentryConfig` from serverless bundles (#6267)

## 7.21.0

- feat(react): Add tracing support for React Router 6.4 `createBrowserRouter`. (#6172)
- fix(core): Add guard against scope.getAttachments (#6258)
- fix(core): Only generate eventIds in client (#6247)
- fix(express): Support multiple routers with common paths. (#6253)
- fix(tracing): Pass `tracePropagationTargets` to `instrumentOutgoingRequests` (#6259)

## 7.20.1

- fix(angular): Set `<unknown>` component name default in TraceDirective (#6222)
- fix(core): Include `_sdkProcessingMetadata` when cloning scope (#6218)
- fix(tracing): Make `shouldAttachHeaders` not fall back to default values (#6238)
- ref(vue): Check if SDK is initialized before app is mounted (#6227)

## 7.20.0

- feat(angular): Add Angular 15 Peer Dependencies (#6220)
- feat(nextjs): Add `excludeServerRoutes` config option (#6207)
- feat(node): Move tracing options to `Http` integration (#6191)
- fix(nextjs): Use absolute path for `distDir` in webpack plugin options (#6214)
- fix(remix): Resolve Remix Request API compatibility issues. (#6215)
- ref(nextjs): Invert serverside injection criteria (#6206)

## 7.19.0

This release adds a new SDK, [@sentry/opentelemetry-node](./packages/opentelemetry-node/), which is available as an
alpha release to integrate OpenTelemetry performance tracing with Sentry. Give it a try and let us know if you have any
feedback or problems with using it. (#6000)

This release also deprecates the `tracingOrigins` option in favor of using `shouldCreateSpanForRequest` and
`tracePropagationTargets`. See [#6176](https://github.com/getsentry/sentry-javascript/pull/6176) for details.

- feat(node): Allow keepAlive override (#6161)
- feat(tracing): Add `transaction.setContext` method (#6154)
- feat(tracing): Allow to set `instrumenter` on Span & Transaction (#6136)
- fix(integrations): Remove erroneous WINDOW exports (#6185)
- fix(react): Guard against non-error obj in ErrorBoundary (#6181)
- perf(core): Prevent creation of new contexts object on scope (#6156)
- ref(tracing): Deprecate `tracingOrigins` (#6176)

## 7.18.0

This release adds the `beforeSendTransaction` callback to all JS SDKs, letting you make changes to or drop transactions
before they're sent to Sentry. This callback works identically to `beforeSend`, just for transactions.

- feat(core): Add `beforeSendTransaction` (#6121)
- feat(node): Add option to `OnUncaughtException` integration that allows mimicking native uncaught error exit behaviour
  (#6137)
- feat(tracing): Add `tracePropagationTargets` option to browser routing instrumentation (#6080)
- fix(nextjs): Allow `onUncaughtException` integration to remain excluded (#6148)
- fix(nextjs): Do not exit process when errors bubble up while additional `uncaughtException`-handlers are registered
  (#6138)
- fix(remix): Prevent capturing pending promises as exceptions. (#6129)

## 7.17.4

- fix(aws): Move relay to port 5333 to avoid collisions (#6093)
- fix(nextjs): Await Next.js server in patched `getServerRequestHandler` (#6072)
- fix(nextjs): CLI binary not found on Windows (#6096)
- fix(nextjs): Escape Windows paths when writing wrapper templates (#6101)

## 7.17.3

- chore(ember): Show warning when using invalid config (#6032)
- fix(nextjs): Log false positive warning only if request is unfinished. (#6070)
- fix(tracing): Add an extra conditional check to web vitals `onCLS()` (#6091)

## 7.17.2

- fix(tracing): Fix `tracingOrigins` not applying (#6079)

## 7.17.1

This release standardizes our SDKs to use the MIT License, which is our
[standard license for Sentry SDKs](https://open.sentry.io/licensing/). We were previously using the BSD 3-Clause License
in `@sentry/browser`,`@sentry/core`, `@sentry/gatsby`, `@sentry/hub`, `@sentry/integrations`, `@sentry/node`,
`@sentry/react`, `@sentry/types`, `@sentry/typescript`, and `@sentry/utils`.

This release also updates the behaviour of
[`tracingOrigins`](https://docs.sentry.io/platforms/javascript/performance/instrumentation/automatic-instrumentation/#tracingorigins)
to no longer affect span creation. `tracingOrigins` will only affect if `sentry-trace` and `baggage` headers are
attached to outgoing requests. To control span creation, use the
[`shouldCreateSpanForRequest`](https://docs.sentry.io/platforms/javascript/performance/instrumentation/automatic-instrumentation/#shouldcreatespanforrequest)
option.

- chore: Standardize SDKs on MIT License (#5993)
- feat(nextjs): Add Next 13 to peer dependencies and integration tests (#6042)
- feat(remix): Enable `RequestData` integration for server-side requests (#6007)
- feat(tracing): Update to Web Vitals v3 (#5987)
- feat(tracing): Allow for spanId to be passed into startChild (#6028)
- fix(browser): Handle case where fetch can be undefined (#5973)
- fix(build): Prevent Rollup from adding `[Symbol.toStringTag]: 'Module'` to CJS files (#6043)
- fix(nextjs): Match loader files exactly (#6013)
- fix(react): Update types to match react router 6.4 updates (#5992)
- fix(tracing): Align missing express span operation names (#6036)
- fix(tracing): Don't consider `tracingOrigins` when creating spans (#6039)
- fix(utils): Remove `WINDOW` from utils (#6024)
- fix(vue): Fix vue3 render warning loop (#6014)
- fix(vue): Don't overwrite custom transaction names of pageload transactions (#6060)
- ref(node): Make `RequestData` integration default (#5980)
- ref(node): Use `RequestData` integration in express handlers (#5990)
- ref(serverless): Use RequestData integration in GCP wrapper (#5991)

Work in this release contributed by @philipatkinson, @Rockergmail, @ys-zhifu, and @koenpunt. Thank you for your
contributions!

Special shoutout to @Tofandel who helped [fix a bug in Jest](https://github.com/facebook/jest/pull/13513) that was
affecting the Sentry JavaScript SDKs!

## 7.16.0

This release adds the `withSentryConfig` feature to the Svelte SDK. It replaces the now deprecated Svelte
`componentTrackingPreprocessor` which will be removed in the next major release.

- feat(node): Export Span type from `@sentry/types` (#5982)
- feat(svelte): Add `withSentryConfig` function to wrap User Svelte Configuration (#5936)
- fix(nextjs): Correctly apply auto-instrumentation to pages in `src` folder (#5984)
- fix(nextjs): Fix typing issue with `withSentryConfig` and `NextConfig` (#5967)
- fix(react): Support root and wildcard routes in react router v6 (#5971)
- fix(remix): Add yargs dependency for uploading sourcemaps (#5926)
- fix(svelte): Track components without script tags (#5957)
- fix(utils): Rename `global.ts` -> `worldwide.ts` (#5969)
- fix(vue): Start pageload transaction earlier to capture missing spans (#5983)
- ref(build): Remove `constToVarPlugin` (#5970)
- ref(nextjs): Don't assert existance of `pageProps` in `_app` (#5945)
- ref(utils): Deprecate `getGlobalObject` as it's no longer used (#5949)

Work in this release contributed by @jeengbe. Thank you for your contribution!

## 7.15.0

This release deprecates `@sentry/hub` and all of it's exports. All of the `@sentry/hub` exports have moved to
`@sentry/core`. `@sentry/hub` will be removed in the next major release.

- feat(ember): Add ember-engine-router support (#5905)
- feat(nextjs): Enable `autoInstrumentServerFunctions` per default (#5919)
- feat(tracing): Make BrowserTracing heartbeat interval configurable (#5867)
- fix(node): Remove Cookie header from requestdata.headers if cookies should not be sent to Sentry (#5898)
- fix(remix): Rework dynamic imports of `react-router-dom` (#5897)
- fix(utils): Accept DSN URLs with empty password (#5902)
- fix(vue): Finish spans in component tracking before starting new ones for same operation (#5918)
- ref(hub): Move `@sentry/hub` code to `@sentry/core` (#5823)

Work in this release contributed by @outsideris and @JonasKruckenberg. Thank you for your contributions!

## 7.14.2

- fix(ember): Align span operations to new operations (#5883)
- fix(nextjs): Consider pageExtensions option in auto instrumentation (#5881)
- fix(remix): Align span operations to new operations (#5889)
- fix(serverless): Align span operations to new operations (#5890)
- fix(tracing): Align span operations to new operations (#5891)
- fix(vue): Align span operations to new operations (#5892)
- ref(hub): Remove hard cap from maxBreadcrumbs (#5873)
- ref(nextjs): Make build-phase check more robust (#5857)

Work in this release contributed by @outsideris. Thank you for your contributions!

## 7.14.1

- fix(nextjs): Handle CJS API route exports (#5865)
- fix(node): Only set `DeviceContext.boot_time` if `os.uptime()` is valid (#5859)
- fix(tracing): Warn if `resolvers` is not defined in `ApolloServer` config (#5850)
- fix(utils): Normalize when serializing envelope (#5851)
- ref(react): Improve React Router v6 error message (#5853)

## 7.14.0

- feat(nextjs): Add status to data-fetcher spans (#5777)
- feat(nextjs): Auto-wrap API routes (#5778)
- feat(nextjs): Promote option to automatically wrap data fetchers and API routes to non-experimental (#5793)
- feat(utils): Modern implementation of `getGlobalObject` (#5809)
- fix(gatsby): Include app-\* entrypoints as they may include user source code (#5685)
- fix(nextjs): Handle `pathname` being passed in object in `instrumentServer` (#5782)
- fix(nextjs): Pass request in sampling context of data fetchers wrapper transaction (#5784)
- fix(nextjs): Reverse order of checks for instrumenting server (#5828)
- fix(nextjs): Rename `nextjs.data.server` ops (#5830)
- fix(remix): Do not skip error handling if tracing is not enabled. (#5811)
- fix(remix): Use import() to get `react-router-dom` in Express wrapper. (#5810)
- fix(tracing): Remove `connection.downlink` measurement (#5794)
- ref(browser): Use configured transport as fallback for client reports (#5797)
- ref(nextjs): Use flush code from `withSentry` in all backend wrappers (#5814)
- ref(nextjs): Use integration to add request data to transaction events (#5703)
- ref(nextjs): Use`RequestData` integration for errors (#5729)
- ref(node): Move request data functions back to `@sentry/node` (#5759)
- ref(tracing): Don't track transaction sampling method (#5775)
- ref(types): Use intersections instead of extend in envelope types (#5788)

Work in this release contributed by @Auspicus and @dagroe. Thank you for your contributions!

## 7.13.0

- feat(browser): Use fetch `keepalive` flag (#5697)
- feat(core): Set custom transaction source for event processors (#5722)
- feat(nextjs): Trace navigation transactions (#5676)
- feat(node): Add Modules integration to default integrations (#5706)
- fix(browser): Use `normalizeDepth` option when creating an event from a plain object
- fix(core): Fix integration deduping (#5696)
- fix(node): Use `normalizeDepth` when creating an event from unknown input
- fix(nextjs): Make NextApiHandler type version-agnostic (#5737)
- fix(tracing): Set sample rate in transaction metadata and DSC (#5691)
- ref: Make dynamic sampling context mutable (#5710)
- ref(tracing): Record transaction name changes (#5723)
- chore(nextjs): Remove obsolete dataFetchers loader (#5713)

## 7.12.1

- feat(nextjs): Connect trace between data-fetching methods and pageload (#5655)
- feat(react): Support useRoutes hook of React Router 6 (#5624)
- feat(remix): Continue transaction from request headers (#5600)
- feat(utils): Add function for ensuring input is an array (#5668)
- fix(utils): Remove Element dom type (#5675)
- fix(node): `contexts` cannot be overridden and `culture` never included (#5677)
- chore: Remove typedoc from READMEs (#5678)

## 7.12.0

This release adds an environment check in `@sentry/nextjs` for Vercel deployments (using the `VERCEL_ENV` env variable),
and only enables `SentryWebpackPlugin` if the environment is `production`. To override this,
[setting `disableClientWebpackPlugin` or `disableServerWebpackPlugin` to `false`](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#disable-sentrywebpackplugin)
now takes precedence over other checks, rather than being a no-op. Note: Overriding this is not recommended! It can
increase build time and clog Release Health data in Sentry with inaccurate noise.

- feat(nextjs): Create transactions in `getInitialProps` and `getServerSideProps` (#5593)
- feat(nextjs): Instrument server-side `getInitialProps` of `_app`, `_document` and `_error` (#5604)
- feat(node): Populate `event.contexts` for Node.js (#5512)
- feat(svelte): Add Component Tracking (#5612)
- fix(browser): use valid urls in Request checks (#5630)
- fix(integrations): Don't add empty stack trace in `RewriteFrames` (#5625)
- fix(nextjs): Start navigation transactions on same-route navigations (#5642)
- fix(nextjs): Don't run webpack plugin on non-prod Vercel deployments (#5603)
- fix(node): Avoid catching domain errors in request handler (#5627)
- fix(serverless): Check for existence of callback in GCP event handler before calling (#5608)
- ref(nextjs): Add warning about non-hidden sourcemaps (#5649)
- ref(nextjs): Use proxy loader for wrapping all data-fetching functions (#5602)
- ref(tracing): Remove mark measurements (#5605)
- ref(tracing): Update long task description (#5601)
- chore(svelte): Detect and report SvelteKit usage (#5594)

Work in this release contributed by @lucas-zimerman, @GJZwiers, and @mohd-akram. Thank you for your contributions!

## 7.11.1

- fix(remix): Store transaction on express req (#5595)

## 7.11.0

This release introduces updates the
[`tracingOrigins` option](https://docs.sentry.io/platforms/javascript/performance/instrumentation/automatic-instrumentation/#tracingorigins)
to not attach any headers/create an spans when supplied with an empty array (`[]`). Previously, we would supply the
default `tracingOrigins` if an empty array was set as the `tracingOrigins` option.

- fix(core): Suppress stack when `SentryError` isn't an error (#5562)
- feat(nextjs): Wrap server-side getInitialProps (#5546)
- feat(nextjs): Improve pageload transaction creation (#5574)
- feat(nextjs): Add spans and route parameterization in data fetching wrappers (#5564)
- feat(nextjs): Create spans and route parameterization in server-side `getInitialProps` (#5587)
- fix(remix): Use domains to prevent scope bleed (#5570)
- fix(remix): Wrap domains properly on instrumentServer (#5590)
- feat(remix): Add route ID to remix routes (#5568)
- feat(remix): Export a manual wrapper for custom Express servers (#5524)
- feat(tracing): Add long task collection (#5529)
- feat(tracing): Allow for setting of an empty array (#5583)

## 7.10.0

This release introduces the first alpha version of `@sentry/svelte`, our newest JavaScript SDK! For details on how to
use it, please see the [README](./packages/svelte/README.md) and
[the tracking GitHub issue](https://github.com/getsentry/sentry-javascript/issues/5492).

- feat(react): Track duration of React component updates (#5531)
- feat(svelte): Add Error and Performance Instrumentation from Browser SDK (#5543)
- feat(svelte): Add Svelte SDK Package Boilerplate (#5535)
- fix(integration): Don't mangle localforage internals (#5534)
- fix(react): Set redux state context properly (#5550)
- fix(remix): Support merging `json` responses from root loader functions. (#5548)
- fix(remix): Return response if detected in root loader (#5558)
- ref(nextjs): Move `autoWrapDataFetchers` option into `experiments` object (#5540)
- ref(nextjs): Wrap server-side data-fetching methods during build (#5503)

Work in this release contributed by @augustuswm. Thank you for your contribution!

## 7.9.0

This release adds the
[`tracePropagationTargets`](https://docs.sentry.io/platforms/node/configuration/options/#trace-propagation-targets)
option to the Sentry Node SDK.

- feat(node): Add `tracePropagationTargets` option (#5521)
- fix(browser): Parse Chrome stack frames without full paths (#5519)
- fix(browser): Set `:` as a part of gecko protocol regex group. (#4153)
- fix(browser): Strip webpack wrapping from stack frames (#5522)
- fix(nextjs): Pull `transpileClientSDK` option from correct location (#5516)
- fix(node): Handle colons in stack trace paths (#5517)
- fix(react): Fix React Router v6 paramaterization (#5515)
- fix(remix): Paramaterize server side transactions (#5491)
- fix(remix): Provide `sentry-trace` and `baggage` via root loader. (#5509)
- ref(nextjs): Prework for wrapping data-fetching functions (#5508)
- ref(nextjs): Simplify `NextConfigObject` type (#5514)

## 7.8.1

- fix(nextjs): Add default `distDir` value back into `index.server.ts` (#5479)
- fix(node): Add conditions to TracingHandler.startTransaction (#5485)
- fix(node): Adjust Express URL parameterization for array routes (#5495)
- fix(node): Adjust Express URL parameterization for RegEx routes (#5483)
- fix(node): Check if router exists before it is instrumented (#5502)
- fix(node): Correctly handle Windows paths when resolving module name (#5476)
- fix(node): Ensure that self.\_handler exists before calling it in LinkedErrors (#5497)
- ref(tracing): Simplify sample_rate serialization for DSC (#5475)

## 7.8.0

This release adds the `transpileClientSDK` flag to the Next.JS SDK Webpack config. This option makes WebPack transpile
the SDK code to the same transpilation level as the user code. By specifying this option, the Next.JS SDK works in older
browsers that do not support ES6 or ES6+ (e.g. object spread) features.

- feat(react): Use state context for Redux integration (#5471)
- feat(remix): Set sentry-trace and baggage <meta> tags on server-side (#5440)
- feat(tracing): Allow storing span metadata (#5464)
- feat(tracing): Log start and end of span (#5446)
- fix(nextjs): Add transpileClientSDK option (#5472)
- fix(nextjs): Move userNextConfig.sentry to closure (#5473)
- fix(nextjs): Remove index signaure in `captureUnderscoreErrorException` argument type (#5463)
- fix(nextjs): Stop using `eval` when checking for `sentry-cli` binary (#5447)
- fix(remix): Clone erroneous responses not to consume their body streams. (#5429)
- fix(remix): Do not capture 4xx codes from thrown responses. (#5441)
- ref(angular): Set ErrorHandler Exception Mechanism to be unhandled by default(#3844)
- ref(nextjs): Extract `isBuild` into an exported function (#5444)
- ref(nextjs): Remove compensation for workaround in `_error.js` (#5378)
- ref(nextjs): Use loader to set `RewriteFrames` helper value (#5445)
- ref(node): Improve Express URL Parameterization (#5450)
- ref(utils): Improve uuid generation (#5426)

Work in this release contributed by @mitchheddles. Thank you for your contribution!

## 7.7.0

- feat(angular): Add URL parameterization of transaction names (#5416)
- fix(core): Add `sentry_client` to auth headers (#5413)
- fix(remix): Add `documentRequest` function name. (#5404)
- fix(remix): Skip capturing `ok` responses as errors. (#5405)
- ref(remix): Add transaction source (#5398)

## 7.6.0

This release adds [the `source` field](https://develop.sentry.dev/sdk/event-payloads/properties/transaction_info/) to
all outgoing transactions. See the [tracking GH issue](https://github.com/getsentry/sentry-javascript/issues/5345) for
more details.

This release also re-enables lambda layer releases for the Node Serverless SDK.

- ref(angular): Add transaction source for Angular Router (#5382)
- ref(build): Reenable lambda layer release in craft (#5207)
- feat(nextjs): Record transaction name source when creating transactions (#5391)
- ref(react): Add source to react-router-v3 (#5377)
- ref(react): Add transaction source for react router v4/v5 (#5384)
- ref(react): Add transaction source for react router v6 (#5385)
- feat(remix): Wrap root with ErrorBoundary (#5365)
- fix(remix): Move hook checks inside the wrapper component (#5371)
- fix(remix): Strip query params from transaction names (#5368)
- fix(remix): Make peer deps less restrictive (#5369)
- fix(remix): Wrap handleDocumentRequest functions (#5387)
- ref(serverless): Add transaction source (#5394)
- feat(tracing): Add transaction source field (#5367)
- feat(tracing): Record transaction name source when name set directly (#5396)
- ref(tracing): Add transaction source to default router (#5386)
- ref(tracing): Include transaction in DSC if transaction source is not an unparameterized URL (#5392)
- feat(vue): Add transaction source to VueRouter instrumentation (#5381)

Work in this release contributed by @moishinetzer. Thank you for your contribution!

## 7.5.1

This release removes the `user_id` and the `transaction` field from the dynamic sampling context data that is attached
to outgoing requests as well as sent to Relay.

- ref(tracing): Remove transaction name and user_id from DSC (#5363)

## 7.5.0

This release adds the `sendDefaultPii` flag to the `Sentry.init` options. When using performance monitoring capabilities
of the SDK, it controls whether user IDs (set via `Sentry.setUser`) are propagated in the `baggage` header of outgoing
HTTP requests. This flag is set to `false` per default, and acts as an opt-in mechanism for sending potentially
sensitive data. If you want to attach user IDs to Sentry transactions and traces, set this flag to `true` but keep in
mind that this is potentially sensitive information.

- feat(sdk): Add sendDefaultPii option to the JS SDKs (#5341)
- fix(remix): Sourcemaps upload script is missing in the tarball (#5356)
- fix(remix): Use cjs for main entry point (#5352)
- ref(tracing): Only add `user_id` to DSC if `sendDefaultPii` is `true` (#5344)

Work in this release contributed by @jkcorrea and @nfelger. Thank you for your contributions!

## 7.4.1

This release includes the first _published_ version of `@sentry/remix`.

- build(remix): Make remix package public (#5349)

## 7.4.0

This release contains the alpha version of `@sentry/remix`, our newest JavaScript SDK! For details on how to use it,
please see the [README](./packages/remix/README.md) and
[the tracking GitHub issue](https://github.com/getsentry/sentry-javascript/issues/4894).

Attention: Due to an oversight, the `@sentry/remix` package is only published as part of the `7.4.1` release.

- feat(remix): Enable Remix SDK (#5327)
- feat(remix): Add release / sourcemap upload script. (#5312)
- feat(remix): Add Remix server SDK (#5269)
- feat(remix): Add Remix client SDK (#5264)
- feat(remix): Add Remix SDK package boilerplate (#5256)
- fix(utils): Handle toJSON methods that return circular references (#5323)

Work in this release contributed by @MichaelDeBoey. Thank you for your contribution!

Special thank you to @jacob-ebey for pointing us in the right direction while we were working on the Remix SDK:
https://github.com/jacob-ebey/remix-sentry.

## 7.3.1

- feat(react): expose FallbackRender as top-level type (#5307)
- fix(core): Remove optional chaining usage (#5304)
- fix(ember): Restore ember package contents (#5318)
- fix(ember): Update README docs to match sentry-docs (#5315)
- ref(hub): Reduce hub bundle size (#5306)
- ref(tracing): Ignore third party baggage entries from incoming requests (#5319)
- ref(types): Add type for measurement unit (#5313)

Work in this release contributed by @MasterOdin. Thank you for your contribution!

## 7.3.0

- feat(nextjs): Add exception handler for `_error.js` (#5259)
- feat(tracing): Add additional Dynamic Sampling Context items to baggage and envelope headers (#5292)
- fix(node): Allow `ParseRequestOptions` to be passed to request handler (#5287)
- fix(tracing): Baggage parsing fails when input is not of type string (#5276)
- fix(tracing): Report the right units for CLS and TTFB (#5303)
- fix(vue): Property access on undefined in errorHandler (#5279)
- ref(node): Move stack parser to utils so it can be used from Electron (#5286)
- ref(tracing): Move getBaggage() from Span to Transaction class (#5299)
- ref(tracing): Unify DSC key names in envelope and baggage headers (#5302)

Work in this release contributed by @Arinono. Thank you for your contribution!

## 7.2.0

- feat(angular): Add Angular 14 support (#5253)
- feat(tracing): GraphQL and Apollo Integrations (#3953)
- fix(docs): Adjust hash-link to propagation-of-baggage-header (#5235)
- fix(docs): Update MIGRATION for SeverityLevel (#5225)
- fix(nextjs): Export `showReportDialog` from NextJS SDK (#5242)
- fix(vue): Accounts for undefined options when formatting component name (#5254)
- ref(node): Move request-data-extraction functions to`@sentry/utils` (#5257)
- ref(tracing): Check and set mutability of baggage (#5205)
- ref(tracing): Sync baggage data in Http and envelope headers (#5218)
- chore(angular): Add Angular version to event contexts (#5260)
- chore(core): Remove circular JSON debugging hacks (#5267)
- chore(integrations): Add trace to CONSOLE_LEVELS (#5249)

Work in this release contributed by @Arinono and @slaesh. Thank you for your contributions!

## 7.1.1

- **Revert** "ref(node): Move non-handler code out of handlers module" (#5223)
- fix(types): Vendor in TextEncoderCommon type (#5221)

## 7.1.0

- feat(tracing): Propagate environment and release values in baggage Http headers (#5193)
- feat(node): Compression support for `http` transport (#5209)
- fix(serverless): Do not change DSN in Serverless integration (#5212)
- fix(core): Normalize trace context (#5171)
- fix(utils): Fix faulty references in `dropUndefinedKeys` (#5201)
- fix(build): Add missing debug logger plugin in `debug.min` bundle variant config (#5192)
- fix(tracing): Fix missing page load metrics in Electron renderer (#5187)
- ref(node): Move non-handler code out of `handlers` module (#5190)
- ref: Switch to magic string for logger statements (#5155)
- chore(build): Only upload lambda layer when releasing (#5208)

## 7.0.0

Version 7 of the Sentry JavaScript SDK brings a variety of features and fixes including bundle size and performance
improvements, brand new integrations, support for the attachments API, and key bug fixes.

This release does not change or remove any top level public API methods (`captureException`, `captureMessage`), and only
requires changes to certain configuration options or custom clients/integrations/transports.

**Note: The v7 version of the JavaScript SDK requires a self-hosted version of Sentry 20.6.0 or higher. If you are using
a version of [self-hosted Sentry](https://develop.sentry.dev/self-hosted/) (aka onpremise) older than `20.6.0` then you
will need to [upgrade](https://develop.sentry.dev/self-hosted/releases/).**

For detailed overview of all the changes, please see our [v7 migration guide](./MIGRATION.md#upgrading-from-6x-to-7x).

### Breaking Changes

If you are a regular consumer of the Sentry JavaScript SDK you only need to focus on the general items. The internal
breaking changes are aimed at libraries that build on top of and extend the JavaScript SDK (like
[`@sentry/electron`](https://github.com/getsentry/sentry-electron/) or
[`@sentry/react-native`](https://github.com/getsentry/sentry-react-native/)).

#### General

- [Updated CommonJS distributions to use ES6 by default](./MIGRATION.md#moving-to-es6-for-commonjs-files). If you need
  to support Internet Explorer 11 or old Node.js versions, we recommend using a preprocessing tool like
  [Babel](https://babeljs.io/) to convert Sentry packages to ES5. (#5005)
- Default `bundle.min.js` to ES6 instead of ES5.
  [ES5 bundles are still available at `bundle.es5.min.js`](./MIGRATION.md#renaming-of-cdn-bundles). (#4958)
- Updated build system to use TypeScript 3.8.3 (#4895)
- Deprecated `Severity` enum for bundle size reasons.
  [Please use string literals instead](./MIGRATION.md#severity-severitylevel-and-severitylevels). (#4926)
- Removed `critical` Severity level. (#5032)
- `whitelistUrls` and `blacklistUrls` have been renamed to `allowUrls` and `denyUrls` in the `Sentry.init()` options.
  (#4850)
- `BaseClient` and it's child classes now require `transport`, `stackParser`, and `integrations` to be
  [explicitly passed in](./MIGRATION.md#explicit-client-options). This was done to improve tree-shakability. (#4927)
- Updated package distribution structure and stopped distributing CDN bundles through `@sentry/*` npm packages.
  [See details in our migration docs.](./MIGRATION.md#restructuring-of-package-content). (#4900) (#4901)
- [Simplified `Transport` API](./MIGRATION.md#transport-changes). This means
  [custom transports will have to be adjusted accordingly.](./MIGRATION.md#custom-transports).
- Updated how [Node Transport Options are passed down](./MIGRATION.md#node-transport-changes).
- Start propogating [`baggage` HTTP header](https://www.w3.org/TR/baggage/) alongside `sentry-trace` header to
  [propogate additional tracing related information.](./MIGRATION.md#propagation-of-baggage-header). (#5133)
- Renamed `registerRequestInstrumentation` export to `instrumentOutgoingRequests` in `@sentry/tracing`. (#4859)
- Renamed `UserAgent` integration to `HttpContext`. (#5027)
- Replaced `BrowserTracing` integration's `maxTransactionDuration` option with `finalTimeout` option in the
  `@sentry/tracing` package and reset `idleTimeout` based on activities count. This should improve accuracy of
  web-vitals like LCP by 20-30%. (#5044)
- [Updated `@sentry/angular` to be compiled by the angular compiler](./MIGRATION.md#sentry-angular-sdk-changes). (#4641)
- Made tracing package treeshakable (#5166)
- Removed support for [Node v6](./MIGRATION.md#dropping-support-for-nodejs-v6). (#4851)
- Removed `@sentry/minimal` package in favour of using [`@sentry/hub`](./MIGRATION.md#removal-of-sentryminimal). (#4971)
- Removed support for Opera browser pre v15 (#4923)
- Removed `ignoreSentryErrors` option from AWS lambda SDK. Errors originating from the SDK will now _always_ be caught
  internally. (#4994)
- Removed `Integrations.BrowserTracing` export from `@sentry/nextjs`. Please import `BrowserTracing` from
  `@sentry/nextjs` directly.
- Removed static `id` property from `BrowserTracing` integration.
- Removed `SDK_NAME` export from `@sentry/browser`, `@sentry/node`, `@sentry/tracing` and `@sentry/vue` packages.
  (#5040)
- Removed `Angular`, `Ember`, and `Vue` integrations from `@sentry/integrations`
  [in favour of the explicit framework packages: `@sentry/angular`, `@sentry/ember`, and `@sentry/vue`](./MIGRATION.md#removal-of-old-platform-integrations-from-sentryintegrations-package).
  (#4893)
- Removed [enums `Status`, `RequestSessionStatus`, and `SessionStatus`.](./MIGRATION.md#removed-enums). Deprecated
  [enums `SpanStatus` and `Severity`](./MIGRATION.md#deprecated-enums). This was done to save on bundle size. (#4891)
  (#4889) (#4890)
- Removed support for deprecated `@sentry/apm` package. (#4845)
- Removed deprecated `user` field from DSN interface. `publicKey` should be used instead. (#4864)
- Removed deprecated `getActiveDomain` method and `DomainAsCarrier` type from `@sentry/hub`. (#4858)
- Removed `eventStatusFromHttpCode` to save on bundle size.
- Removed usage of deprecated `event.stacktrace` field. (#4885)
- Removed raven-node backward-compat code (#4942)
- Removed `showReportDialog` method on `BrowserClient` (#4973)
- Removed deprecated `startSpan` and `child` methods (#4849)
- Removed deprecated `frameContextLines` options (#4884)
- Removed `Sentry` from window in the Gatsby SDK (#4857)

#### Internal

- Removed support for the store endpoint (#4969)
- Made hint callback argument non-optional (#5141)
- Switched to using new transports internally (#4943)
- [Removed `API` class from `@sentry/core`.](./MIGRATION.md#removing-the-api-class-from-sentrycore). (#4848)
- [Refactored `Session` class to use a more functional approach.](./MIGRATION.md#session-changes). (#5054)
- Removed `Backend` class in favour of moving functionality into the `Client` class (for more details, see
  [#4911](https://github.com/getsentry/sentry-javascript/pull/4911) and
  [#4919](https://github.com/getsentry/sentry-javascript/pull/4919)).
- Removed forget async utility function (#4941)
- Removed tslint from `@sentry-internal/typescript` (#4940)
- Removed `_invokeClient` function from `@sentry/hub` (#4972)
- Removed top level eventbuilder exports (#4887)
- Added baggage API helpers in `@sentry/utils` (#5066)

### Other Changes

#### Features

- feat(tracing): Add Prisma ORM integration. (#4931)
- feat(react): Add react-router-v6 integration (#5042)
- feat: Add attachments API (#5004)
- feat: Add `name` field to `EventProcessor` (#4932)
- feat: Expose configurable stack parser (#4902)
- feat(tracing): Make `setMeasurement` public API (#4933)
- feat(tracing): Add GB unit to device memory tag value (#4935)
- feat: Export browser integrations individually (#5028)
- feat(core): Send Baggage in Envelope Header (#5104)

#### Fixes

- fix(browser): Fix memory leak in `addEventListener` instrumentation (#5147)
- fix(build): Fix express import in `gcpfunction` (#5097)
- fix(ember): Export sha hashes of injected scripts (#5089)
- fix(hub): Add missing parameter to captureException docstring (#5001)
- fix(integrations): Mark ExtraErrorData as already normalized (#5053)
- fix(serverless): Adjust v6 Lambda layer hotfix for v7 (#5006)
- fix(tracing): Adjust sideEffects package.json entry for v7 (#4987)
- fix(tracing): Remove isInstanceOf check in Hub constructor (#5046)
- fix(tracing): Don't use `querySelector` when not available (#5160)
- fix(nextjs): Update webpack-plugin and change how cli binary is detected. This should reduce bundle size of NextJS
  applications. (#4988)
- fix(utils): Fix infinite recursion in `dropUndefinedKeys` (#5163)

#### Misc

- feat(build): Vendor polyfills injected during build (#5051)
- ref(build): Use rollup to build AWS lambda layer (#5146)
- ref(core): Make event processing log warnings instead of errors (#5010)
- ref(node): Allow node stack parser to work in browser context (#5135)
- ref(serverless): Point DSN to relay in lambda extension (#5126)
- ref(serverless): Do not throw on flush error (#5090)
- ref(utils): Clean up dangerous type casts in object helper file (#5047)
- ref(utils): Add logic to enable skipping of normalization (#5052)

## 6.x

A full list of changes in the `6.x` release of the SDK can be found in the [6.x Changelog](./docs/changelog/v6.md).

## 5.x

A full list of changes in the `5.x` release of the SDK can be found in the [5.x Changelog](./docs/changelog/v5.md).

## 4.x

A full list of changes in the `4.x` release of the SDK can be found in the [4.x Changelog](./docs/changelog/v4.md).
