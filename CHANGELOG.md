# Changelog

## Unreleased

- "You miss 100 percent of the chances you don't take. — Wayne Gretzky" — Michael Scott

## 7.70.0

### Important Changes

- **feat: Add Bun SDK (#9029)**

This release contains the beta version of `@sentry/bun`, our SDK for the [Bun JavaScript runtime](https://bun.sh/)! For details on how to use it, please see the [README](./packages/bun/README.md). Any feedback/bug reports are greatly appreciated, please [reach out on GitHub](https://github.com/getsentry/sentry-javascript/discussions/7979).

Note that as of now the Bun runtime does not support global error handlers. This is being actively worked on, see [the tracking issue in Bun's GitHub repo](https://github.com/oven-sh/bun/issues/5091).

- **feat(remix): Add Remix 2.x release support. (#8940)**

The Sentry Remix SDK now officially supports Remix v2! See [our Remix docs for more details](https://docs.sentry.io/platforms/javascript/guides/remix/).

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

Special thanks for @isaacharrisholt for helping us implement a Vercel Edge Runtime SDK which we use under the hood for our Next.js SDK.

## 7.69.0

### Important Changes

- **New Performance APIs**
  - feat: Update span performance API names (#8971)
  - feat(core): Introduce startSpanManual (#8913)

This release introduces a new set of top level APIs for the Performance Monitoring SDKs. These aim to simplify creating spans and reduce the boilerplate needed for performance instrumentation. The three new methods introduced are `Sentry.startSpan`, `Sentry.startInactiveSpan`, and `Sentry.startSpanManual`. These methods are available in the browser and node SDKs.

`Sentry.startSpan` wraps a callback in a span. The span is automatically finished when the callback returns. This is the recommended way to create spans.

```js
// Start a span that tracks the duration of expensiveFunction
const result = Sentry.startSpan({ name: 'important function' }, () => {
  return expensiveFunction();
});

// You can also mutate the span wrapping the callback to set data or status
Sentry.startSpan({ name: 'important function' }, (span) => {
  // span is undefined if performance monitoring is turned off or if
  // the span was not sampled. This is done to reduce overhead.
  span?.setData('version', '1.0.0');
  return expensiveFunction();
});
```

If you don't want the span to finish when the callback returns, use `Sentry.startSpanManual` to control when the span is finished. This is useful for event emitters or similar.

```js
// Start a span that tracks the duration of middleware
function middleware(_req, res, next) {
  return Sentry.startSpanManual({ name: 'middleware' }, (span, finish) => {
    res.once('finish', () => {
      span?.setHttpStatus(res.status);
      finish();
    });
    return next();
  });
}
```

`Sentry.startSpan` and `Sentry.startSpanManual` create a span and make it active for the duration of the callback. Any spans created while this active span is running will be added as a child span to it. If you want to create a span without making it active, use `Sentry.startInactiveSpan`. This is useful for creating parallel spans that are not related to each other.

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
- feat(redux): Add 'attachReduxState' option  (#8953)
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

This release fixes inconsistent behaviour of when our SDKs classify captured errors as unhandled.
Previously, some of our instrumentations correctly set unhandled, while others set handled.
Going forward, all errors caught automatically from our SDKs will be marked as unhandled.
If you manually capture errors (e.g. by calling `Sentry.captureException`), your errors will continue to be reported as handled.

This change might lead to a decrease in reported crash-free sessions and consequently in your release health score.
If you have concerns about this, feel free to open an issue.

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
- fix(nextjs): Execute sentry config independently of `autoInstrumentServerFunctions` and `autoInstrumentAppDirectory` (#8781)
- fix(replay): Ensure we do not flush if flush took too long (#8784)
- fix(replay): Ensure we do not try to flush when we force stop replay (#8783)
- fix(replay): Fix `hasCheckout` handling (#8782)
- fix(replay): Handle multiple clicks in a short time (#8773)
- ref(replay): Skip events being added too long after initial segment (#8768)

## 7.62.0

### Important Changes

- **feat(integrations): Add `ContextLines` integration for html-embedded JS stack frames (#8699)**

This release adds the `ContextLines` integration as an optional integration for the Browser SDKs to `@sentry/integrations`.

This integration adds source code from inline JavaScript of the current page's HTML (e.g. JS in `<script>` tags) to stack traces of captured errors.
It _can't_ collect source code from assets referenced by your HTML (e.g. `<script src="..." />`).

The `ContextLines` integration is useful when you have inline JS code in HTML pages that can't be accessed by Sentry's backend, for example, due to a login-protected page.

```js
import { ContextLines } from "@sentry/integrations";

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

This introduces a new, *experimental* package, `@sentry/node-experimental`.
This is a variant of the Node SDK which uses OpenTelemetry under the hood for performance instrumentation.

Note that this package is very much WIP, considered unstable and may change at any time.
**No SemVer guarantees apply whatsoever.** Still, if you're brave enough you can give it a try.
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

We will not send replays that are <5s long anymore. Additionally, we also added further safeguards to avoid overly long (>1h) replays.
You can optionally configure the min. replay duration (defaults to 5s):

```js
new Replay({
  minReplayDuration: 10000 // in ms - note that this is capped at 15s max!
})
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

No changes. This release was published to fix publishing issues with 7.59.0 and 7.59.1.
Please see [7.59.0](#7590) for the changes in that release.

## 7.59.1

No changes. This release was published to fix a publishing issue with 7.59.0.
Please see [7.59.0](#7590) for the changes in that release.

## 7.59.0

### Important Changes

- **- feat(remix): Add Remix v2 support (#8415)**

This release adds support for Remix v2 future flags, in particular for new error handling utilities of Remix v2. We heavily recommend you switch to using `v2_errorBoundary` future flag to get the best error handling experience with Sentry.

To capture errors from [v2 client-side ErrorBoundary](https://remix.run/docs/en/main/route/error-boundary-v2), you should define your own `ErrorBoundary` in `root.tsx` and use `Sentry.captureRemixErrorBoundaryError` helper to capture the error.

```typescript
// root.tsx
import { captureRemixErrorBoundaryError } from "@sentry/remix";

export const ErrorBoundary: V2_ErrorBoundaryComponent = () => {
  const error = useRouteError();

  captureRemixErrorBoundaryError(error);

  return <div> ... </div>;
};
```

For server-side errors, define a [`handleError`](https://remix.run/docs/en/main/file-conventions/entry.server#handleerror) function in your server entry point and use the `Sentry.captureRemixServerException` helper to capture the error.

```ts
// entry.server.tsx
export function handleError(
  error: unknown,
  { request }: DataFunctionArgs
): void {
  if (error instanceof Error) {
    Sentry.captureRemixServerException(error, "remix.server", request);
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

This release adds support for [distributed tracing](https://docs.sentry.io/platforms/javascript/usage/distributed-tracing/) without requiring performance monitoring to be active on the JavaScript SDKs (browser and node). This means even if there is no sampled transaction/span, the SDK will still propagate traces to downstream services. Distributed Tracing can be configured with the `tracePropagationTargets` option, which controls what requests to attach the `sentry-trace` and `baggage` HTTP headers to (which is what propagates tracing information).

```js
Sentry.init({
  tracePropagationTargets: ["third-party-site.com", /^https:\/\/yourserver\.io\/api/],
});
```

- feat(tracing): Add tracing without performance to browser and client Sveltekit (#8458)
- feat(node): Add tracing without performance to Node http integration (#8450)
- feat(node): Add tracing without performance to Node Undici (#8449)
- feat(node): Populate propagation context using env variables (#8422)

- **feat(core): Support `AggregateErrors` in `LinkedErrors` integration (#8463)**

This release adds support for [`AggregateErrors`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError). AggregateErrors are considered as Exception Groups by Sentry, and will be visualized and grouped differently. See the [Exception Groups Changelog Post](https://changelog.getsentry.com/announcements/exception-groups-now-supported-for-python-and-net) for more details.

Exception Group support requires Self-Hosted Sentry [version 23.5.1](https://github.com/getsentry/self-hosted/releases/tag/23.5.1) or newer.

- **feat(replay): Add a new option `networkDetailDenyUrls` (#8439)**

This release adds a new option `networkDetailDenyUrls` to the `Replay` integration. This option allows you to specify a list of URLs that should not be captured by the `Replay` integration, which can be used alongside the existing `networkDetailAllowUrls` for finely grained control of which URLs should have network details captured.

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

This release version [bumps the internally used typescript version from 3.8.x to 4.9.x](https://github.com/getsentry/sentry-javascript/pull/8255).
We use ds-downlevel to generate two versions of our types, one for >=3.8, one for >=4.9.
This means that this change should be fully backwards compatible and not have any noticable user impact,
but if you still encounter issues please let us know.

- **feat(types): Add tracePropagationTargets to top level options (#8395)**

Instead of passing `tracePropagationTargets` to the `BrowserTracing` integration, you can now define them on the top level:

```js
Sentry.init({
  tracePropagationTargets: ['api.site.com'],
});
```

- **fix(angular): Filter out `TryCatch` integration by default (#8367)**

The Angular and Angular-ivy SDKs will not install the TryCatch integration anymore by default.
This integration conflicted with the `SentryErrorHander`, sometimes leading to duplicated errors and/or missing data on events.

- **feat(browser): Better event name handling for non-Error objects (#8374)**

When capturing non-errors via `Sentry.captureException()`, e.g. `Sentry.captureException({ prop: "custom object" })`,
we now generate a more helpful value for the synthetic exception. Instead of e.g. `Non-Error exception captured with keys: currentTarget, isTrusted, target, type`, you'll now get messages like:

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

  All SDKs now filter out health check transactions by default.
  These are transactions where the transaction name matches typical API health check calls, such as `/^.*healthy.*$/` or `/^.  *heartbeat.*$/`. Take a look at [this list](https://github.com/getsentry/sentry-javascript/blob/8c6ad156829f7c4eec34e4a67e6dd866ba482d5d/packages/core/src/integrations/inboundfilters.ts#L8C2-L16) to learn which regexes we currently use to match transaction names.
  We believe that these transactions do not provide value in most cases and we want to save you some of your quota by   filtering them out by default.
  These filters are implemented as default values for the top level `ignoreTransactions` option.

  You can disable this filtering by manually specifiying the `InboundFilters` integration and setting the   `disableTransactionDefaults` option:
  ```js
  Sentry.init({
    //...
    integrations: [new InboundFilters({ disableTransactionDefaults: true })],
  })
  ```

- **feat(replay): Add `mutationBreadcrumbLimit` and `mutationLimit` to Replay Options (#8228)**

  The previously experimental options `mutationBreadcumbLimit` and `mutationLimit` have been promoted to regular Replay   integration options.

  A high number of DOM mutations (in a single event loop) can cause performance regressions in end-users' browsers.
  Use `mutationBreadcrumbLimit` to send a breadcrumb along with your recording if the mutation limit was reached.
  Use `mutationLimit` to stop recording if the mutation limit was reached.

- **feat(sveltekit): Add source maps support for Vercel (lambda) (#8256)**
  - feat(sveltekit): Auto-detect SvelteKit adapters (#8193)

  The SvelteKit SDK can now be used if you deploy your SvelteKit app to Vercel.
  By default, the SDK's Vite plugin will detect the used adapter and adjust the source map uploading config as necessary.
  If you want to override the default adapter detection, you can specify the `adapter` option in the `sentrySvelteKit`  options:

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

  Currently, the Vite plugin will configure itself correctly for `@sveltejs/adapter-auto`, `@sveltejs/adapter-vercel` and `@sveltejs/adapter-node`.

  **Important:** The SvelteKit SDK is not yet compatible with Vercel's edge runtime.
  It will only work for lambda functions.

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

This release adds support Vercel Cron Jobs in the Next.js SDK.
The SDK will automatically create [Sentry Cron Monitors](https://docs.sentry.io/product/crons/) for your [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) configured via `vercel.json` when deployed on Vercel.

You can opt out of this functionality by setting the `automaticVercelMonitors` option to `false`:

```js
// next.config.js
const nextConfig = {
  sentry: {
    automaticVercelMonitors: false,
  },
};
```

(Note: Sentry Cron Monitoring is currently in beta and subject to change. Help us make it better by letting us know what you think. Respond on [GitHub](https://github.com/getsentry/sentry/discussions/42283) or write to us at crons-feedback@sentry.io)

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
- fix(replay): Move error sampling to before send  (#8057)
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

* `+(page|layout).(ts|js)` files (universal loads)
* `+(page|layout).server.(ts|js)` files (server-only loads)

This means that you don't have to manually add the `wrapLoadWithSentry` and `wrapServerLoadWithSentry` functions around your load functions. The SDK will not interfere with already wrapped `load` functions.

For more details, take a look at the [Readme](https://github.com/getsentry/sentry-javascript/blob/develop/packages/sveltekit/README.md#configure-auto-instrumentation)

- **chore(angular): Upgrade `peerDependencies` to Angular 16 (#8035)**

We now officially support Angular 16 in `@sentry/angular-ivy`.
Note that `@sentry/angular` _does not_ support Angular 16.

- **feat(node): Add ability to send cron monitor check ins (#8039)**

**Note: This release contains a bug with generating cron monitors. We recommend you upgrade the JS SDK to 7.51.1 or above to use cron monitoring functionality**

This release adds [Sentry cron monitoring](https://docs.sentry.io/product/crons/) support to the Node SDK.

Check-in monitoring allows you to track a job's progress by completing two check-ins: one at the start of your job and another at the end of your job. This two-step process allows Sentry to notify you if your job didn't start when expected (missed) or if it exceeded its maximum runtime (failed).

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

With this release, the Sveltekit SDK ([@sentry/sveltekit](./packages/sveltekit/README.md)) is promoted to Beta.
This means that we do not expect any more breaking changes.

The final breaking change is that `sentryHandle` is now a function.
So in order to update to 7.50.0, you have to update your `hooks.server.js` file:

```js
// hooks.server.js

// Old:
export const handle = sentryHandle;
// New:
export const handle = sentryHandle();
```

- **feat(replay): Allow to configure URLs to capture network bodies/headers (#7953)**

You can now capture request/response bodies & headers of network requests in Replay.
You have to define an allowlist of URLs you want to capture additional information for:

```js
new Replay({
  networkDetailAllowUrls: ['https://sentry.io/api'],
});
```

By default, we will capture request/response bodies, as well as the request/response headers `content-type`, `content-length` and `accept`.
You can configure this with some additional configuration:

```js
new Replay({
  networkDetailAllowUrls: ['https://sentry.io/api'],
  // opt-out of capturing bodies
  networkCaptureBodies: false,
  // These headers are captured _in addition to_ the default headers
  networkRequestHeaders: ['X-Custom-Header'],
  networkResponseHeaders: ['X-Custom-Header', 'X-Custom-Header-2']
});
```

Note that bodies will be truncated to a max length of ~150k characters.

**- feat(replay): Changes of sampling behavior & public API**
  - feat(replay): Change the behavior of error-based sampling (#7768)
  - feat(replay): Change `flush()` API to record current event buffer (#7743)
  - feat(replay): Change `stop()` to flush and remove current session (#7741)

We have changed the behavior of error-based sampling, as well as adding & adjusting APIs a bit to be more aligned with expectations.
See [Sampling](./packages/replay/README.md#sampling) for details.

We've also revamped some public APIs in order to be better aligned with expectations. See [Stoping & Starting Replays manually](./packages/replay/README.md#stopping--starting-replays-manually) for details.

- **feat(core): Add multiplexed transport (#7926)**

We added a new transport to support multiplexing.
With this, you can configure Sentry to send events to different DSNs, depending on a logic of your choosing:

```js
import { makeMultiplexedTransport } from '@sentry/core';
import { init, captureException, makeFetchTransport } from '@sentry/browser';

function dsnFromFeature({ getEvent }) {
  const event = getEvent();
  switch(event?.tags?.feature) {
    case 'cart':
      return ['__CART_DSN__'];
    case 'gallery':
      return ['__GALLERY_DSN__'];
  }
  return []
}

init({
  dsn: '__FALLBACK_DSN__',
  transport: makeMultiplexedTransport(makeFetchTransport, dsnFromFeature)
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

Our source maps upload plugin is now able to read `svelte.config.js`. This is necessary to automatically find the output directory that users can specify when setting up the Node adapter.

- **fix(replay): Ensure we normalize scope breadcrumbs to max. depth to avoid circular ref (#7915)**

This release fixes a potential problem with how Replay captures console logs.
Any objects logged will now be cut off after a maximum depth of 10, as well as cutting off any properties after the 1000th.
This should ensure we do not accidentally capture massive console logs, where a stringified object could reach 100MB or more.

- **fix(utils): Normalize HTML elements as string (#7916)**

We used to normalize references to HTML elements as POJOs.
This is both not very easily understandable, as well as potentially large, as HTML elements may have properties attached to them.
With this change, we now normalize them to e.g. `[HTMLElement: HTMLInputElement]`.

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

This release switches the SDK to use [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage) as the async context isolation mechanism in the SDK for Node 14+. For Node 10 - 13, we continue to use the Node [`domain`](https://nodejs.org/api/domain.html) standard library, since `AsyncLocalStorage` is not supported there. **Preliminary testing showed [a 30% improvement in latency and rps](https://github.com/getsentry/sentry-javascript/issues/7691#issuecomment-1504009089) when making the switch from domains to `AsyncLocalStorage` on Node 16.**

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
          })
        )
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

In addition to exporting `runWithAsyncContext` publicly, the SDK also uses it internally where we previously used domains.

- **feat(sveltekit): Remove `withSentryViteConfig` (#7789)**
  - feat(sveltekit): Remove SDK initialization via dedicated files (#7791)

This release removes our `withSentryViteConfig` wrapper we previously instructed you to add to your `vite.config.js` file. It is replaced Vite plugins which you simply add to your Vite config, just like the `sveltekit()` Vite plugins. We believe this is a more transparent and Vite/SvelteKit-native way of applying build time modifications. Here's how to use the plugins:

```js
// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

export default {
  plugins: [sentrySvelteKit(), sveltekit()],
  // ... rest of your Vite config
};
```

Take a look at the [`README`](https://github.com/getsentry/sentry-javascript/blob/develop/packages/sveltekit/README.md) for updated instructions!

Furthermore, with this transition, we removed the possibility to intialize the SDK in dedicated `sentry.(client|server).config.js` files. Please use SvelteKit's [hooks files](https://github.com/getsentry/sentry-javascript/blob/develop/packages/sveltekit/README.md#2-client-side-setup) to initialize the SDK.

Please note that these are **breaking changes**! We're sorry for the inconvenience but the SvelteKit SDK is still in alpha stage and we want to establish a clean and SvelteKit-friendly API before making the SDK stable. You have been [warned](https://github.com/getsentry/sentry-javascript/blob/eb921275f9c572e72c2348a91cb39fcbb8275b8d/packages/sveltekit/README.md#L20-L24) ;)

- **feat(sveltekit): Add Sentry Vite Plugin to upload source maps (#7811)**

This release adds automatic upload of source maps to the SvelteKit SDK. No need to configure anything other than adding our Vite plugins to your SDK. The example above shows you how to do this.

Please make sure to follow the [`README`](https://github.com/getsentry/sentry-javascript/blob/develop/packages/sveltekit/README.md#uploading-source-maps) to specify your Sentry auth token, as well as org and project slugs.

**- feat(replay): Capture request & response headers (#7816)**

Replay now captures the `content-length`, `content-type`, and `accept` headers from requests and responses automatically.

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

This release adds a new API, `Sentry.captureUserFeedback`, to browser-side SDKs that allows you to send user feedback to Sentry without loading and opening Sentry's user feedback dialog. This allows you to obtain user feedback however and whenever you want to and simply send it to Sentry using the SDK.

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

Note that feedback needs to be coupled to an event but as in the example above, you can just use `Sentry.captureMessage` to generate one.

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

With this release, we officially deprecate all exports from the `@sentry/tracing` package, in favour of using them directly from the main SDK package. The `@sentry/tracing` package will be removed in a future major release.

Please take a look at the [Migration docs](./MIGRATION.md/#remove-requirement-for-sentrytracing-package-since-7460) for more details.

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
- fix(remix): Remove unnecessary dependencies  (#7708)
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

This release adds support for Performance Monitoring in our SvelteKit SDK for the client/server. We've also changed how you should initialize your SDK. Please read our updated [SvelteKit README instructions](./packages/sveltekit/README.md) for more details.

- **feat(core)**: Add `ignoreTransactions` option (#7594)

You can now easily filter out certain transactions from being sent to Sentry based on their name.

```ts
Sentry.init({
  ignoreTransactions: ['/api/healthcheck', '/ping'],
})
```

- **feat(node)**: Undici integration (#7582)
  - feat(nextjs): Add Undici integration automatically (#7648)
  - feat(sveltekit): Add Undici integration by default (#7650)

We've added an integration that automatically instruments [Undici](https://github.com/nodejs/undici) and Node server side fetch. This supports Undici `v4.7.0` or higher and requires Node `v16.7.0` or higher. After adding the integration outgoing requests made by Undici will have associated spans and breadcrumbs in Sentry.

```ts
Sentry.init({
  integrations: [new Sentry.Integrations.Undici()],
})
```

In our Next.js and SvelteKit SDKs, this integration is automatically added.

- **feat(node)**: Add Sentry tRPC middleware (#7511)

We've added a new middleware for [trpc](https://trpc.io/) that automatically adds TRPC information to Sentry transactions. This middleware is meant to be used in combination with a Sentry server integration (Next.js, Express, etc).

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

With `7.46.0` you no longer require the `@sentry/tracing` package to use tracing and performance monitoring with the Sentry JavaScript SDKs. The `@sentry/tracing` package will be removed in a future major release, but can still be used with no changes.

Please see the [Migration docs](./MIGRATION.md/#remove-requirement-for-sentrytracing-package-since-7460) for more details.

- **fix(node)**: Convert debugging code to callbacks to fix memory leak in `LocalVariables` integration (#7637)

This fixes a memory leak in the opt-in [`LocalVariables` integration](https://blog.sentry.io/2023/02/01/local-variables-for-nodejs-in-sentry/), which adds local variables to the stacktraces sent to Sentry. The minimum recommended version to use the `LocalVariables` is now `7.46.0`.

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

This release introduces the first alpha version of `@sentry/sveltekit`, our newest JavaScript SDK for Sveltekit. Check out the [README](./packages/sveltekit/README.md) for usage instructions and what to expect from this alpha release.

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

This release adds a new package, `@sentry/angular-ivy`, which is our Angular SDK with full support for Angular's rendering engine, Ivy.

This release also adds a new `enableTracing` option, which can be used instead of `tracesSampleRate` for an easier setup.
Related to this, the `hasTracingEnabled` utility function was moved from `@sentry/tracing` to `@sentry/core`.
The old export from `@sentry/tracing` has been deprecated and will be removed in v8.

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

This release includes changes and fixes around text masking and blocking in Replay's `rrweb` dependency. See versions [1.102.0](https://github.com/getsentry/rrweb/releases/tag/1.102.0) and [1.103.0](https://github.com/getsentry/rrweb/releases/tag/1.103.0).

- feat: Check `blockSelector` for blocking elements as well
- feat: With maskAllText, mask the attributes: placeholder, title, `aria-label`
- feat: fix masking on `textarea`
- feat: Add `maskAllText` option

SDK Changes:

- fix(replay): Fix svgs not getting unblocked  (#7132)

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

Session Replay is deprecating privacy options in favor of a more streamlined API. Please see the [Replay migration guide](https://github.com/getsentry/sentry-javascript/blob/master/packages/replay/MIGRATION.md) for further information.
Additionally, the following configuration options will no longer be configurable: `slimDOMOptions`, `recordCanvas`, `inlineStylesheet`, `collectFonts`, `inlineImages`.

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

This release adds automatic injection of the Next.js SDK into serverside `app` directory bundles, allowing users to call the Sentry SDK in server components.

- feat(nextjs): Add SDK to serverside `app` directory (#6927)
- fix(replay): Do not renew session in error mode (#6948)
- fix(replay): Handle compression worker errors more gracefully (#6936)
- fix(replay): fix path separator substitution to replay all `\` (#6932)
- fix(replay): ignore errors in CSSStyleSheetObserver (getsentry/rrweb#16)

Work in this release contributed by @mdtro. Thank you for your contribution!

## 7.33.0

With this release, the sample rate for Session Replays will default to 0. We recommend explicitly setting the sample rate via the `replaysSessionSampleRate` and `replaysOnErrorSampleRate` options.

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

The Next.js SDK now supports error and performance monitoring for Next.js [middleware](https://nextjs.org/docs/advanced-features/middleware) and [Edge API routes](https://nextjs.org/docs/api-routes/edge-api-routes).
To set it up, add a `sentry.edge.config.js` or `sentry.edge.config.ts` file to the root of your project and initialize the SDK:

```js
// sentry.edge.config.js or sentry.edge.config.ts

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN || "YOUR DSN HERE",
  tracesSampleRate: 1.0,
});
```

The Next.js will automatically instrument Edge API routes and middleware.
If you want to opt out of automatic instrumentation of middleware can use the `autoInstrumentMiddleware` option in the `sentry` object of your Next.js configuration:

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
deployed to Vercel or AWS lambdas to ensure that error events are sent consistently.
Additionally, Next.js applications deployed to Vercel or AWS lambdas may also see an uptick in sent transactions. (for
more information see #6578)

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
Going forward, the `@sentry/replay` package doesn't have to be installed explicitly to use Replay.
Furthermore, this release increases the maximim replay session duration from 30 minutes to 1 hour.

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

This patch corrects an oversight on our end which caused the Sentry Replay integration CDN bundles to be ignored when uploading bundles to our CDN.
If you want to use the Replay CDN bundles, please use version 7.24.1 or newer.

- fix(react): Add type for React Router's `encodeLocation` method (#6439)
- fix(replay): Add CDN bundle path to release artifacts (#6452)
- fix(tracing): Instrument cursors returned from MongoDB operations. (#6437)
- ref(angular): Extract zonejs error unwrapper into a dedicated function (#6443)

Work in this release contributed by @theofidry. Thank you for your contribution!

## 7.24.0

This release bumps the [`@sentry/replay`](https://github.com/getsentry/sentry-javascript/blob/master/packages/replay/README.md) package from version 0.x to 7.24.0.
Along with this version bump, we're introducing a few breaking changes.
Take a look at the [Replay migration guide](https://github.com/getsentry/sentry-javascript/blob/master/packages/replay/MIGRATION.md) for further information.
The Replay version bump is the result of moving the package into the Sentry JavaScript SDK monorepo which aligns the version with our other JS SDK packages.
**Important:** If you're using Replay with version 7.24.x or newer, make sure to also upgrade your other `@sentry/*` packages to this version.

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

This release adds a new SDK, [@sentry/opentelemetry-node](./packages/opentelemetry-node/),
which is available as an alpha release to integrate OpenTelemetry performance tracing with Sentry.
Give it a try and let us know if you have any feedback or problems with using it. (#6000)

This release also deprecates the `tracingOrigins` option in favor of using `shouldCreateSpanForRequest` and `tracePropagationTargets`.
 See [#6176](https://github.com/getsentry/sentry-javascript/pull/6176) for details.

- feat(node): Allow keepAlive override (#6161)
- feat(tracing): Add `transaction.setContext` method (#6154)
- feat(tracing): Allow to set `instrumenter` on Span & Transaction (#6136)
- fix(integrations): Remove erroneous WINDOW exports (#6185)
- fix(react): Guard against non-error obj in ErrorBoundary (#6181)
- perf(core): Prevent creation of new contexts object on scope (#6156)
- ref(tracing): Deprecate `tracingOrigins` (#6176)

## 7.18.0

This release adds the `beforeSendTransaction` callback to all JS SDKs, letting you make changes to or drop transactions before they're sent to Sentry. This callback works identically to `beforeSend`, just for transactions.

- feat(core): Add `beforeSendTransaction` (#6121)
- feat(node): Add option to `OnUncaughtException` integration that allows mimicking native uncaught error exit behaviour (#6137)
- feat(tracing): Add `tracePropagationTargets` option to browser routing instrumentation (#6080)
- fix(nextjs): Allow `onUncaughtException` integration to remain excluded (#6148)
- fix(nextjs): Do not exit process when errors bubble up while additional `uncaughtException`-handlers are registered (#6138)
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

This release standardizes our SDKs to use the MIT License, which is our [standard license for Sentry SDKs](https://open.sentry.io/licensing/). We were previously using the BSD 3-Clause License in `@sentry/browser`,`@sentry/core`, `@sentry/gatsby`, `@sentry/hub`, `@sentry/integrations`, `@sentry/node`, `@sentry/react`, `@sentry/types`, `@sentry/typescript`, and `@sentry/utils`.

This release also updates the behaviour of [`tracingOrigins`](https://docs.sentry.io/platforms/javascript/performance/instrumentation/automatic-instrumentation/#tracingorigins) to no longer affect span creation. `tracingOrigins` will only affect if `sentry-trace` and `baggage` headers are attached to outgoing requests. To control span creation, use the [`shouldCreateSpanForRequest`](https://docs.sentry.io/platforms/javascript/performance/instrumentation/automatic-instrumentation/#shouldcreatespanforrequest) option.

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

Work in this release contributed by @philipatkinson, @Rockergmail, @ys-zhifu, and @koenpunt. Thank you for your contributions!

Special shoutout to @Tofandel who helped [fix a bug in Jest](https://github.com/facebook/jest/pull/13513) that was affecting the Sentry JavaScript SDKs!

## 7.16.0

This release adds the `withSentryConfig` feature to the Svelte SDK. It replaces the now deprecated Svelte `componentTrackingPreprocessor` which will be removed in the next major release.

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

This release deprecates `@sentry/hub` and all of it's exports. All of the `@sentry/hub` exports have moved to `@sentry/core`. `@sentry/hub` will be removed in the next major release.

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
- fix(gatsby): Include app-* entrypoints as they may include user source code (#5685)
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

This release adds an environment check in `@sentry/nextjs` for Vercel deployments (using the `VERCEL_ENV` env variable), and only enables `SentryWebpackPlugin` if the environment is `production`. To override this, [setting `disableClientWebpackPlugin` or `disableServerWebpackPlugin` to `false`](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#disable-sentrywebpackplugin) now takes precedence over other checks, rather than being a no-op. Note: Overriding this is not recommended! It can increase build time and clog Release Health data in Sentry with inaccurate noise.

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

This release introduces updates the [`tracingOrigins` option](https://docs.sentry.io/platforms/javascript/performance/instrumentation/automatic-instrumentation/#tracingorigins) to not attach any headers/create an spans when supplied with an empty array (`[]`). Previously, we would supply the default `tracingOrigins` if an empty array was set as the `tracingOrigins` option.

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

This release introduces the first alpha version of `@sentry/svelte`, our newest JavaScript SDK! For details on how to use it, please see the [README](./packages/svelte/README.md) and [the tracking GitHub issue](https://github.com/getsentry/sentry-javascript/issues/5492).

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

This release adds the [`tracePropagationTargets`](https://docs.sentry.io/platforms/node/configuration/options/#trace-propagation-targets) option to the Sentry Node SDK.

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
- fix(node): Ensure that self._handler exists before calling it in LinkedErrors (#5497)
- ref(tracing): Simplify sample_rate serialization for DSC (#5475)

## 7.8.0

This release adds the `transpileClientSDK` flag to the Next.JS SDK Webpack config. This option makes WebPack transpile the SDK code to the same transpilation level as the user code. By specifying this option, the Next.JS SDK works in older browsers that do not support ES6 or ES6+ (e.g. object spread) features.

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

This release adds [the `source` field](https://develop.sentry.dev/sdk/event-payloads/properties/transaction_info/) to all outgoing transactions.
See the [tracking GH issue](https://github.com/getsentry/sentry-javascript/issues/5345) for more details.

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

This release removes the `user_id` and the `transaction` field from the dynamic sampling context data that is attached to outgoing requests as well as sent to Relay.

- ref(tracing): Remove transaction name and user_id from DSC (#5363)

## 7.5.0

This release adds the `sendDefaultPii` flag to the `Sentry.init` options.
When using performance monitoring capabilities of the SDK, it controls whether user IDs (set via `Sentry.setUser`) are propagated in the `baggage` header of outgoing HTTP requests.
This flag is set to `false` per default, and acts as an opt-in mechanism for sending potentially sensitive data.
If you want to attach user IDs to Sentry transactions and traces, set this flag to `true` but keep in mind that this is potentially sensitive information.

- feat(sdk): Add sendDefaultPii option to the JS SDKs (#5341)
- fix(remix): Sourcemaps upload script is missing in the tarball (#5356)
- fix(remix): Use cjs for main entry point (#5352)
- ref(tracing): Only add `user_id` to DSC if `sendDefaultPii` is `true` (#5344)

Work in this release contributed by @jkcorrea and @nfelger. Thank you for your contributions!

## 7.4.1

This release includes the first *published* version of `@sentry/remix`.

- build(remix): Make remix package public (#5349)

## 7.4.0

This release contains the alpha version of `@sentry/remix`, our newest JavaScript SDK! For details on how to use
it, please see the [README](./packages/remix/README.md) and [the tracking GitHub issue](https://github.com/getsentry/sentry-javascript/issues/4894).

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

Version 7 of the Sentry JavaScript SDK brings a variety of features and fixes including bundle size and performance improvements, brand new integrations, support for the attachments API, and key bug fixes.

This release does not change or remove any top level public API methods (`captureException`, `captureMessage`), and only requires changes to certain configuration options or custom clients/integrations/transports.

**Note: The v7 version of the JavaScript SDK requires a self-hosted version of Sentry 20.6.0 or higher. If you are using a version of [self-hosted Sentry](https://develop.sentry.dev/self-hosted/) (aka onpremise) older than `20.6.0` then you will need to [upgrade](https://develop.sentry.dev/self-hosted/releases/).**

For detailed overview of all the changes, please see our [v7 migration guide](./MIGRATION.md#upgrading-from-6x-to-7x).

### Breaking Changes

If you are a regular consumer of the Sentry JavaScript SDK you only need to focus on the general items. The internal breaking changes are aimed at libraries that build on top of and extend the JavaScript SDK (like [`@sentry/electron`](https://github.com/getsentry/sentry-electron/) or [`@sentry/react-native`](https://github.com/getsentry/sentry-react-native/)).

#### General

- [Updated CommonJS distributions to use ES6 by default](./MIGRATION.md#moving-to-es6-for-commonjs-files). If you need to support Internet Explorer 11 or old Node.js versions, we recommend using a preprocessing tool like [Babel](https://babeljs.io/) to convert Sentry packages to ES5. (#5005)
- Default `bundle.min.js` to ES6 instead of ES5. [ES5 bundles are still available at `bundle.es5.min.js`](./MIGRATION.md#renaming-of-cdn-bundles). (#4958)
- Updated build system to use TypeScript 3.8.3 (#4895)
- Deprecated `Severity` enum for bundle size reasons. [Please use string literals instead](./MIGRATION.md#severity-severitylevel-and-severitylevels). (#4926)
- Removed `critical` Severity level. (#5032)
- `whitelistUrls` and `blacklistUrls` have been renamed to `allowUrls` and `denyUrls` in the `Sentry.init()` options. (#4850)
- `BaseClient` and it's child classes now require `transport`, `stackParser`, and `integrations` to be [explicitly passed in](./MIGRATION.md#explicit-client-options). This was done to improve tree-shakability. (#4927)
- Updated package distribution structure and stopped distributing CDN bundles through `@sentry/*` npm packages. [See details in our migration docs.](./MIGRATION.md#restructuring-of-package-content). (#4900) (#4901)
- [Simplified `Transport` API](./MIGRATION.md#transport-changes). This means [custom transports will have to be adjusted accordingly.](./MIGRATION.md#custom-transports).
- Updated how [Node Transport Options are passed down](./MIGRATION.md#node-transport-changes).
- Start propogating [`baggage` HTTP header](https://www.w3.org/TR/baggage/) alongside `sentry-trace` header to [propogate additional tracing related information.](./MIGRATION.md#propagation-of-baggage-header). (#5133)
- Renamed `registerRequestInstrumentation` export to `instrumentOutgoingRequests` in `@sentry/tracing`. (#4859)
- Renamed `UserAgent` integration to `HttpContext`. (#5027)
- Replaced `BrowserTracing` integration's `maxTransactionDuration` option with `finalTimeout` option in the `@sentry/tracing` package and reset `idleTimeout` based on activities count. This should improve accuracy of web-vitals like LCP by 20-30%. (#5044)
- [Updated `@sentry/angular` to be compiled by the angular compiler](./MIGRATION.md#sentry-angular-sdk-changes). (#4641)
- Made tracing package treeshakable (#5166)
- Removed support for [Node v6](./MIGRATION.md#dropping-support-for-nodejs-v6). (#4851)
- Removed `@sentry/minimal` package in favour of using [`@sentry/hub`](./MIGRATION.md#removal-of-sentryminimal). (#4971)
- Removed support for Opera browser pre v15 (#4923)
- Removed `ignoreSentryErrors` option from AWS lambda SDK. Errors originating from the SDK will now *always* be caught internally. (#4994)
- Removed `Integrations.BrowserTracing` export from `@sentry/nextjs`. Please import `BrowserTracing` from `@sentry/nextjs` directly.
- Removed static `id` property from `BrowserTracing` integration.
- Removed `SDK_NAME` export from `@sentry/browser`, `@sentry/node`, `@sentry/tracing` and `@sentry/vue` packages. (#5040)
- Removed `Angular`, `Ember`, and `Vue` integrations from `@sentry/integrations` [in favour of the explicit framework packages: `@sentry/angular`, `@sentry/ember`, and `@sentry/vue`](./MIGRATION.md#removal-of-old-platform-integrations-from-sentryintegrations-package). (#4893)
- Removed [enums `Status`, `RequestSessionStatus`, and `SessionStatus`.](./MIGRATION.md#removed-enums). Deprecated [enums `SpanStatus` and `Severity`](./MIGRATION.md#deprecated-enums). This was done to save on bundle size. (#4891) (#4889) (#4890)
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
- Removed `Backend` class in favour of moving functionality into the `Client` class (for more details, see [#4911](https://github.com/getsentry/sentry-javascript/pull/4911) and [#4919](https://github.com/getsentry/sentry-javascript/pull/4919)).
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
- fix(nextjs): Update webpack-plugin and change how cli binary is detected. This should reduce bundle size of NextJS applications. (#4988)
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

## 6.19.7

- fix(react): Add children prop type to ErrorBoundary component (#4966)
- fix(serverless): Re-add missing modules in Node AWS Lambda Layer (#4982)
- fix(tracing): Target tracing bundles for side effects (#4955)

Work in this release contributed by @cameronaziz and @kpdecker. Thank you for your contributions!

## 6.19.6

- fix(typing): Fix typing API in CaptureConsle (#4879)

## 6.19.5

- ref(build): Add debug constants in each package individually (#4842)
- ref(build): Introduce central build directory to packages with bundles (#4838) (#4854) (#4868)
- feat(utils): Introduce getGlobalSingleton helper (#4860)

## 6.19.4

- feat(react): Add React 18 as peer dep (#4819)
- ref(build): Add `build/types` to tarballs and adjust `types` entry points (#4824)

Work in this release contributed by @MikevPeeren. Thank you for your contribution!

## 6.19.3

- feat(browser): Add new v7 Fetch Transport (#4765)
- feat(browser): Add new v7 XHR Transport (#4803)
- fix(core): Use correct version of event when tagging normalization (#4780)
- fix(core): Stop mangling _experiments (#4807)
- feat(node): Add new v7 http/s Transports (#4781)

## 6.19.2

- feat(core): Add new transports to base backend (#4752)
- feat(utils): Add `isNaN` function (#4759)
- fix(integrations): Emit ES5 code in ES5 bundles (#4769)
- fix(vue): Drop vue-router peerDep (#4764)
- ref(core): Reduce inboundfilters bundle size (#4625)
- ref(integrations): Make ReportTypes a union type
- ref(node): Add source code context when using LinkedErrors (#4753)
- ref(utils): Introduce getEnvelopeType helper (#4751)
- ref(utils): Split normalization code into separate module (#4760)

## 6.19.1

This release fixes a bug from 6.19.0 causing type import errors in most JS SDKs.

- fix(types): Point to type definitions in dist folder (#4745)

## 6.19.0

This release makes a change to the data normalization process, limiting the number of entries or properties which will be included in any given array or object to 1000. Previously there was no limit, so in rare cases you may notice a change in your context data. If this is a problem, you can increase the limit with the new `maxNormalizationBreadth` setting. See [#4689](https://github.com/getsentry/sentry-javascript/pull/4689) for details.

- feat(build): Create debug versions of minified bundles (#4699)
- feat(integrations): Make ES6 integration bundles (#4718)
- feat(utils): Limit `normalize` maximum properties/elements (#4689)
- feat(various): Apply debug guard to logger everywhere (#4698)
- fix(browser): Use `apply` rather than `call` in `try-catch` integration (#4695)
- fix(ember): Fix merging env config (#4714)
- fix(nextjs): Add env var to suppress API non-response meta-warning (#4706)
- fix(nextjs): Widen scope for client file upload (#4705)
- fix(node): Fix async stack parsing (#4721)
- ref(browser): Use ratelimit utils in base transport (#4686)
- ref(build): Introduce root build directory in `@sentry/browser` (#4688)
- ref(minimal): Simplify `syntheticException` creation (#4691)
- ref(tracing): Remove `BrowserTracing` logging flag default value (#4708)
- ref(utils): Simplify `isDebugBuild` logging guard (#4696)

Work in this release contributed by @Turbo87. Thank you for your contribution!

## 6.18.2

If you are using `@sentry-internal/eslint-config-sdk`, please note that this release turns on the [quotes rule](https://eslint.org/docs/rules/quotes) to enforce usage of single quotes.

This release also removes `@sentry/tracing` as a dependency of `@sentry/node`. Please explicitly install and import `@sentry/tracing` if you want to use performance monitoring capabilities. For more details, [see our docs on setting up Node Performance Monitoring](https://docs.sentry.io/platforms/node/performance/).

We also now produce an ES6 version of our [CDN tracing bundle](https://docs.sentry.io/platforms/javascript/install/cdn/#performance-bundle), which can be accessed with `bundle.tracing.es6.min.js`.

- chore(eslint): Turn on quotes rules (#4671)
- fix(node): prevent errors thrown on flush from breaking response (#4667)
- ref(node): Remove dependency on @sentry/tracing (#4647)
- fix(tracing): Make method required in transactionSampling type (#4657)
- feat(tracing): Add ES6 tracing bundle (#4674)

Work in this release contributed by @Ignigena. Thank you for your contribution!

## 6.18.1

- fix(ember): use _backburner if it exists (#4603)
- feat(gatsby): Upgrade Sentry Webpack Plugin to 1.18.8 (#4636)
- feat(nextjs): Upgrade Sentry Webpack Plugin to 1.18.8 (#4643)
- fix(nextjs): webpack as optional peer-dependency (#4634)

Work in this release contributed by @belgattitude, @pbernery, and @kylemh. Thank you for your contributions!

## 6.18.0

This patch deprecates the `frameContextLines` option for the Node SDK. The [migration documentation](./MIGRATION.md#upgrading-from-6.17.x-to-6.18.0) details how to migrate off the deprecated `frameContextLines` option.

- fix(browser): Only set event.stacktrace if we have 1 or more frames (#4614)
- fix(hub): keep hint event id if it's provided (#4577)
- fix(nextjs): Use env variable for build detection (#4608)
- ref(node): Refactor node source fetching into integration (#3729)
- feat(serverless): Added `ignoreSentryErrors` option for AWS lambda (#4620)

Work in this release contributed by @GoshaEgorian and @ichina. Thank you for your contributions!

## 6.17.9

- fix(gatsby): Add missing React peer dependency (#4576)
- fix(types): Use Sentry event type instead of dom one (#4584)

Work in this release contributed by @aaronadamsCA. Thank you for your contribution!

## 6.17.8

- feat(types): Add Envelope types (#4527)
- fix(build): Remove node code from CDN bundles (#4548)
- fix(build): Prevent unused utils code in integration bundles (#4547)
- fix(tracing): Export BrowserTracing directly in CDN bundle (#4570)
- fix(utils): Use apply in console instrumentation (#4568)
- ref(core): Log `normalizeDepth` when normalization is skipped(#4574)

Work in this release contributed by @mydea. Thank you for your contribution!

## 6.17.7

- fix(utils): Make new non-enumerable properties mutable (#4528)
- fix(vue): Check if route name is defined before casting (#4530)

Work in this release contributed by @connorjclark. Thank you for your contribution!

## 6.17.6

- fix(angular): Add check for global.location in angular universal (#4513)
- fix(nextjs): Stop injecting sentry into API middleware (#4517)
- fix(nextjs): Revert #4139 - remove manipulation of res.finished value (#4516)

Work in this release contributed by @mobilestar1. Thank you for your contribution!

## 6.17.5

This release deprecates the `Severity` enum, the `SeverityLevel` type, and the internal `SeverityLevels` array, all from `@sentry/types`. In v7, `Severity` will disappear (in favor of `SeverityLevel`) and `SeverityLevel` and `SeverityLevels` will live in `@sentry/utils`. If you are using any of the three, we encourage you to migrate your usage now, using our [migration guide](./MIGRATION.md#upgrading-from-6.x-to-6.17.x).

- ref: Export Session class from core/browser/node (#4508)
- chore(nextjs): Bump`@sentry/webpack-plugin` to 1.18.5 (#4501)
- ref(types): Move SeverityLevel and SeverityLevels to `@sentry/utils` (#4492)
- fix(vue): Cast name parameter to string (#4483)

Work in this release contributed by @Bobakanoosh and @ssnielsen. Thank you for your contributions!

## 6.17.4

- chore(deps): Bump `@sentry/webpack-plugin` from 1.18.3 to 1.18.4 (#4464)
- fix(browser): Set severity level for events captured by the global error handler (#4460)
- fix(integrations): Add default for `ExtraErrorData`'s `depth` option (#4487)
- fix(nextjs): Export `BrowserTracing` integration directly (#4480)
- fix(tracing): Export `SpanStatus` enum (#4478)
- fix(vue): Property `_isVue` not defined in Vue3 (#4461)

Work in this release contributed by @7inspire, @jaeseokk, and @rchl. Thank you for your contributions!

## 6.17.3

- fix(nextjs): Unwrap `req` and `res` if necessary when instrumenting server (#4467)

## 6.17.2

This patch contains a breaking change for anyone setting the undocumented `rethrowAfterCapture` option for `@sentry/serverless`'s AWS wrapper to `false`, as its functionality has been removed. For backwards compatibility with anyone setting it to `true` (which is also the default), the option remains in the `WrapperOptions` type for now. It will be removed in the next major release, though, so we recommend removing it from your code.

- ref(serverless): Remove `rethrowAfterCapture` use in AWS lambda wrapper (#4448)
- fix(utils): Remove dom `is` casting (#4451)

## 6.17.1

- ref(core): Renormalize event only after stringification errors (#4425)
- feat(nextjs): Add option to use `hidden-source-map` as webpack devtool value (#4436)
- fix(tracing): ignore the xhr/fetch response if its request is not being tracked (#4428)
- fix(vue): prevent after hook from starting new span (#4438)

Work in this release contributed by @datbth. Thank you for your contribution!

## 6.17.0

This release contains several internal refactors that help reduce the bundle size of the SDK and help prep for our [upcoming major release](https://github.com/getsentry/sentry-javascript/issues/4240). There are no breaking changes in this patch unless you are using our internal `Dsn` class, which has been removed. We also deprecated a few of our typescript enums and our internal `API` class. We've detailed in our [migration documentation](./MIGRATION.md#upgrading-from-6.x-to-6.17.x) how to update your sdk usage if you are using any of these in your code.

- feat: Remove Dsn class (#4325)
- feat(core): Add processing metadata to scope and event (#4252)
- feat(core): Deprecate API class (#4281)
- feat(ember): Update ember dependencies (#4253)
- fix(nextjs): Inject sentry.x.config.js into pages/_error (#4397)
- fix(nextjs): Add sentry-cli existence check for enabling webpack plugin #4311
- ref(tracing): deprecate span status enum (#4299)
- ref(tracing): Remove script evaluation span (#4433)
- ref(types): drop unused logLevel (#4317)
- ref(types): deprecate request status enum (#4316)
- ref(types): deprecate outcome enum (#4315)
- ref(types): deprecate transactionmethod enum (#4314)
- ref(types): deprecate status enum (#4298)
- ref(utils): improve invalid dsn error message (#4430)
- fix(vue): Prioritize app variable to avoid duplicate name pollution (#4437)

Work in this release contributed by @yordis, @Badisi, and @lh1me. Thank you for your contribution!

## 6.16.1

- feat(nextjs): Support Next.js v12 (#4093)
- fix(nextjs): Disable server instrumentation on Vercel (#4255)
- feat(tracing): Add metadata around idleTimeout (#4251)

Work in this release contributed by @KATT. Thank you for your contribution!

## 6.16.0

- feat(angular): Add Angular 13 to peer dep (#4183)
- fix(angular): Finish routing span before starting another one (#4191)
- fix(angular): Use ui category for span operations (#4222)
- feat(ember): Use @types/ember__debug (#4173)
- fix(ember): Use ui category for span operations (#4221)
- feat(eslint-config): Enable array-callback-return rule (#4229)
- ref(eslint-config): Update spaced-comment rule (#4235)
- fix(integrations): Use ui category for vue span operations (#4219)
- fix(nextjs): Add sideEffects flag to NextJS SDK (#4216)
- fix(node): Make http integration spans have http span operation (#4224)
- fix(react): Mark react package as having no side effects (#4213)
- fix(react): Use ui category for operations (#4218)
- fix(tracing): Add express category to express middleware spans (#4223)
- fix(tracing): Treat HTTP status code below 100 as UnknownError (#4131)
- fix(types): Make Options type method params contravariant (#4234)
- fix(vue): Mark Vue as having no side effects. (#4217)
- fix(vue): Use ui category for span operations (#4220)

Work in this release contributed by @jherdman and @travigd. Thank you for your contribution!

## 6.15.0

- fix(browser): Capture stacktrace on `DOMExceptions`, if possible (#4160)
- fix(nextjs): Delay error propagation until `withSentry` is done (#4027)

Work in this release contributed by @nowylie. Thank you for your contribution!

## 6.14.3

- Revert: ref(utils): Use type predicates in `is` utility functions (#4124)

## 6.14.2

- feat(awslambda) : Capture errors individually on sqs partial batch failure (#4130)
- feat(gatsby): Upload source maps automatically when sentry-cli is configured (#4109)
- fix(nextjs): Prevent `false API resolved without sending a response` warning (#4139)
- fix(vue): Merge default and manual hooks while creating mixins. (#4132)
- ref(utils): Use type predicates in `is` utility functions (#4124)

Work in this release contributed by @J4YF7O. Thank you for your contribution!

## 6.14.1

- feat(gatsby): Support Gatsby v4 (#4120)
- fix(nextjs): Stop sending transactions for requests that 404 (#4095)
- fix(nextjs): Prevent infinite recompilation in dev (#4123)
- fix(node): Prioritize globalAgent while figuring out protocol (#4087)

## 6.14.0

- chore(deps): Bump @sentry/webpack-plugin to 1.18.1 (#4063)
- feat(awslambda): Add requestId filter to aws.cloudwatch.logs URL (#4032)
- feat(gatsby): Support non-serializable SDK options (#4064)
- feat(gatsby): Support user integrations as a function (#4050)
- feat(integrations): Call toJSON of originalException to extract more data (#4038)
- feat(integrations): Capture console.error as an exception (#4034)
- feat(nextjs): Add mechanism to error-logger-caught errors (#4061)
- feat(nextjs): Add mechanism to withSentry-caught errors (#4046)
- feat(nextjs): Tag backend events when running on vercel (#4091)
- fix(browser): Send client outcomes through tunnel if configured (#4031)
- fix(core): Be stricter about mechanism values (#4068)
- fix(core): Prevent exception recapturing (#4067)
- fix(nextjs): Always initialize SDK with global hub (#4086)
- fix(nextjs): Fix types in config code (#4057)
- fix(nextjs): Remove logic merging include values in withSentryConfig (#4056)
- fix(node): Check for potentially undefined httpModule (#4037)
- fix(tracing): Update paths for DB drivers auto-instrumentation (#4083)
- fix(vue): Move ROOT_SPAN_TIMER into Vue context. (#4081)

Work in this release contributed by @tmilar, @deammer, and @freekii. Thank you for your contributions!

## 6.13.3

- feat(nextjs): Add ability for integration tests to use linked `@sentry/xxxx` packages (#4019)
- feat(nextjs): Support `distDir` Next.js option (#3990)
- fix(tracing): Call hasTracingEnabled with correct options when invoking startTransaction (#4020)
- ref(browser): Refactor sending client reports w. fetch fallback (#4008)
- ref(core): Make getTransport method on client optional (#4013)
- ref(ember): Update htmlbars dependency (#4026)
- ref(integrations): Minor simplification of ExtraErrorData code (#4024)
- ref(react): Rely on error.cause to link ErrorBoundary errors (#4005)

## 6.13.2

- fix(browser): Use getGlobalObject for document check (#3996)
- misc(all): Disallow direct usage of globals (#3999)

## 6.13.1

- fix(browser): Check for document when sending outcomes (#3993)

## 6.13.0

- feat(browser): Client Report Support (#3955)
- feat(perf): Add experimental option to improve LCP collection (#3879)
- fix(browser): Make sure that `document.head` or `document.body` exists for `injectReportDialog` (#3972)
- fix(browser): Parse frames-only `safari(-web)-extension` stack (#3929)
- fix(ember): Move `ember-source` to `devDependencies` (#3962)
- fix(hub): Don't set `lastEventID` for transactions (#3966)
- fix(nextjs): Include nextjs config's `basePath` on `urlPrefix` (#3922)
- fix(node): Add protocol detection for get/request calls without explict protocol (#3950)
- fix(node): Disable `autoSessionTracking` if dsn undefined (#3954)
- fix(vue): Check for matched route existence before starting transaction (#3973)
- ref(browser): Migrate unit tests from Chai and Karma to Jest (#3965)
- ref(nextjs): Exclude cross-platform tracing code from bundles (#3978)
- ref(tracing): Idle transaction refactoring (#3988)

## 6.12.0

- fix(nextjs): Differentiate between webpack 4 and 5 in server builds (#3878)
- fix(core): Skip native frames while searching frame URLs. (#3897)
- fix(vue): Attach props only if VM is available (#3902)
- feat(tracing): Add pg-native support to Postgres integration. (#3894)
- ref(ember): Update addon to support Ember 4.0.0 (beta) (#3915)
- feat(react): Make Profiler _mountSpan attribute protected (#3904)
- fix(ember): allow ember-beta to fail (#3910)
- fix(tracing): Prevent metrics erroring module load in web workers (#3941)
- misc(browser): Log when event is dropped by Dedupe integration (#3943)

## 6.11.0

- feat(nextjs): Allow for TypeScript user config files (#3847)
- fix(browser): Make sure handler exists for LinkedErrors Integration (#3861)
- fix(core): Skip anonymous callbacks while searching frame URLs. (#3842)
- fix(core): Stop rejecting in `flush` and `close` when client undefined (#3846)
- fix(nextjs): Stop `SentryWebpackPlugin` from uploading unnecessary files (#3845)
- fix(react): Require ReactElement in ErrorBoundary props and render (#3857)
- fix(tests): Allow tests to run on Windows without WSL (#3813)
- fix(utils): Fix false-positive circular references when normalizing `Event` objects (#3864)
- fix(vue): Make Router.name type optional to match VueRouter (#3843)
- ref(core): Prevent redundant setup work (#3862)
- ref(nextjs): Stop reinitializing the server SDK unnecessarily (#3860)

## 6.10.0

- feat(vue): Rework tracing and add support for `Vue 3` (#3804)
- feat(tracing): Upgrade to `web-vitals 2.1.0` (#3781)
- fix(ember): Make argument to `InitSentryForEmber` optional (#3802)
- fix(nextjs): Do not start a navigation if the from URL is the same (#3814)
- fix(nextjs): Let `flush` finish in API routes (#3811)
- fix(nextjs): Use `domains` to prevent scope bleed (#3788)
- fix(react): Make `Route` typing more generic (#3809)
- ref(tracing): Update span op for outgoing HTTP requests (#3821)
- ref(tracing): Remove updated CLS from web-vitals (#3822)

## 6.9.0

- feat(browser): Use scope data in report dialog (#3792)
- feat(core): Add `ensureNoCircularStructures` experiment to help debug serialization bugs (#3776)
- feat(nextjs): Add options to disable webpack plugin (#3771)
- feat(react): Support render props in `ErrorBoundary` (#3793)
- fix(ember): Correctly cache ember types from prepublish hook (#3749)
- fix(ember): Fix runtime config options not being merged (#3791)
- fix(metrics): Check for cls entry sources (#3775)
- fix(nextjs): Make `withSentryConfig` return type match given config type (#3760)
- fix(node): Check if `captureRequestSession` is available before its called (#3773)
- fix(node): Enable `autoSessionTracking` correctly (#3758)
- fix(react): `allRoutes` cannot triple equal a new array instance (#3779)
- fix(tracing): Add check for `document.scripts` in metrics (#3766)
- fix(types): Update `ExtractedNodeRequestData` to include valid `query_params` for `tracesSampler` (#3715)
- ref(gatsby): Default release to empty string (#3759)
- ref(nextjs): Inject init code in `_app` and API routes (#3786)
- ref(nextjs): Pre-disable-plugin-option config cleanup (#3770)
- ref(nextjs): Stop setting redundant `productionBrowserSourceMaps` in config (#3765)

## 6.8.0

- [browser] feat: Enable serialization of multiple DOM attributes for breadcrumbs. (#3755)
- [browser] feat: Make dedupe integration default for browser (#3730)
- [core] fix: Correctly limit Buffer requests (#3736)
- [ember] ref: Allow initing Ember without config entry (#3745)
- [serverless] fix: wrapEventFunction does not await for async code (#3740)

## 6.7.2

- [core] fix: Do not track sessions if not enabled (#3686)
- [core] fix: Prevent sending terminal status session updates (#3701)
- [core] ref: Make `beforeSend` more strict (#3713)
- [browser] ref: Log which request type has been limited (#3687)
- [nextjs] feat: Auto enable node http integration on server (#3675)
- [nextjs] fix: Correctly handle functional next config in `withSentryConfig` (#3698)
- [nextjs] fix: Fix conflict with other libraries modifying webpack `entry` property (#3703)
- [nextjs] fix: Update @sentry/webpack-plugin to 1.15.1 in @sentry/nextjs to resolve build timeouts issue (#3708)
- [nextjs] ref: Split up config code and add tests (#3693)

## 6.7.1

- [core] fix: Add event type to item header when envelopes are forced (#3676)
- [core] fix: Include DSN in envelope header for sessions (#3680)
- [core] fix: Prevent scope from storing more than 100 breadcrumbs at the time (#3677)
- [node] ref: Remove default http(s) import from http-module (#3681)
- [nextjs] feat: Add body data to transaction `request` context (#3672)

## 6.7.0

- [core] feat: Add `tunnel` option to support request tunneling for dealing with ad-blockers (#3521)

## 6.6.0

- [node] feat: Allow for overriding custom `UrlParser` in Node.js transports (#3612)
- [browser] feat: Add `serializeAttribute` option to DOM breadcrumbs. (#3620)
- [nextjs] fix: `Improve NextConfigExports` compatibility (#3592)
- [nextjs] fix: Use correct abs path for server init (#3649)
- [angular] fix: Do not run change detection when capturing the exception (#3618)
- [angular] fix: Do not run change detection when finishing transaction (#3622)
- [angular] fix: Provide a single compilation unit for the `trace` directive (#3617)
- [utils] fix: Check for `performance.now` when calculating browser timing (#3657)
- [integrations] fix: Run rewriting for both `exception` and `stacktrace` events (#3653)
- [node] ref: Replace old-style `require(console)` with a global object (#3623)
- [node] ref: Make `HTTPModule` more abstract to be able to use it in non-Node.JS environments (#3655)
- [nextjs] ref: Export `BrowserTracing` integration directly from `@sentry/nextjs` (#3647)

## 6.5.1

- [nextjs] fix: Prevent webpack 5 from crashing server (#3642)
- [eslint] build: Upgrade to eslint 7.27.0 (#3639)
- [nextjs] test: Add nextjs integration tests for Server and Browser (#3632)
- [browser] ref: Don't send session duration in browser environments (#3616)
- [hub] fix: Correctly compute session durations (#3616)

## 6.5.0

- [angular] fix: prevent memory leak when the root view is removed (#3594)
- [browser] fix: Do not trigger session on meaningless navigation (#3608)
- [nextjs] feat: Frontend + withSentry Performance Monitoring (#3580)
- [react] fix: Use history object for init transaction name (#3609)

## 6.4.1

- [ember] ref: Fix merging of runtime config with environment config. (#3563)
- [angular] ref: Allow angular v12 as a peer dependency. (#3569)
- [tracing] fix: Avoid browser tracing initialization on node environment (#3548)
- [react] ref: Make RouteProps typing more generic (#3570)
- [tracing] fix: Correctly handle pg.Cursor in pg query method (#3567)
- [types] fix: Add attachment to SentryRequestType (#3561)
- [nextjs] ref: Disable node session for next.js (#3558)
- [eslint] feat: Add new eslint rules (#3545)

## 6.4.0

- [core] feat: initialScope in SDK Options (#3544)
- [node] feat: Release Health for Node (Session Aggregates) (#3319)
- [node] feat: Autoload Database Integrations in Node environment (#3483)
- [react] feat: Add support for React 17 Error Boundaries (#3532)
- [tracing] fix: Generate TTFB (Time to first byte) from span data (#3515)

## 6.3.6

- [nextjs] fix: Fix error logging (#3512)
- [nextjs] fix: Add environment automatically (#3495)
- [node] feat: Implement category based rate limiting (#3435)
- [node] fix: Set handled to false when it is a crash (#3493)
- [tracing] fix: Mark tracing distributables as side effects (#3519)

## 6.3.5

- [nextjs] fix: Add tslib dependecy; change inject order (#3487)

## 6.3.4

- [nextjs] fix: API routes logging (#3479)

## 6.3.3

- [nextjs] fix: User server types (#3471)

## 6.3.2

- [nextjs] ref: Remove next.js plugin (#3462)
- [core] fix: Prevent InboundFilters mergeOptions method from breaking users code (#3458)

## 6.3.1

- [angular] fix: Make SentryErrorHandler extensible and export it publicly (#3438)
- [browser] feat: Capture information about the LCP element culprit (#3427)
- [core] fix: Correctly attach installed integrations to sdkinfo (#3447)
- [ember] fix: Add guards to ensure marks exist (#3436)
- [nextjs] fix: Fix incomplete merging of user config with Sentry config (#3434)
- [nextjs] ref: Use resolved paths for `require` calls in config code (#3426)
- [node] fix: Fix for manual tests in node (#3428)
- [transports] feat: Honor no_proxy env variable (#3412)

## 6.3.0

- [browser] feat: Parse safari-extension and safari-web-extension errors (#3374)
- [browser] fix: Provide better descriptions for the performance navigation timing spans (#3245)
- [browser] test: Replace Authorization with Accept header (#3400)
- [ci] ci: Add CodeQL scanning
- [core] Drop session if release is not a string or is missing and log (#3396)
- [docs] Document how to publish a new release (#3361)
- [gatsby] fix: Specify gatsby peer dep (#3385)
- [gatsby] chore(docs): Update @sentry/gatsby README (#3384)
- [integrations] feat(integrations): add prefix support for RewriteFrames (#3416)
- [integrations] ref: Use esm imports with localforage and add esModuleInterop (#3403)
- [nextjs] feat: Next.js SDK + Plugin (#3301)
- [node] fix: Generate a Sentry Release string from env if its not provided (#3393)
- [tracing] fix: Replace performance.timeOrigin in favour of browserPerformanceTimeOrigin (#3397)
- [tracing] fix: Mark span as failed when fetch API call fails (#3351)
- [utils] fix: Use the more reliable timeOrigin (#3398)
- [utils] fix: Wrap oldOnPopState.apply call in try/catch to prevent Firefox from crashing (#3377)

## 6.2.5

- [utils] fix: Avoid performance.timeOrigin if too skewed (#3356)

## 6.2.4

- [browser] fix: Add `SentryRequestType` to `RateLimitingCategory` mapping (#3328)
- [browser] ref: Add fast-path to `fetchImpl` and cleanup redundant iframe (#3341)
- [node] fix: Fallback to empty string if `req.baseUrl` is empty (#3329)
- [node] ref: Remove circular dependency in `@sentry/node` (#3335)
- [tracing] fix: Attach mysql tracing to `Connection.createQuery` instead of `Connection.prototype.query` (#3353)
- [tracing] ref: Clarify naming in `BrowserTracing` integration (#3338)
- [ember] ref: Fix tests to be forward compatible with component changes (#3347)
- [ember] ref: Silence deprecation warnings in beta (#3346)

## 6.2.3

- [gatsby] fix: Update Vercel environment variables to match their current system variables (#3337)

## 6.2.2

- [hub] fix: Only create sessions if the correct methods are defined (#3281)
- [core] fix: Don't override SDK metadata (#3304)
- [browser] fix: Prevent fetch errors loops with invalid fetch implementations (#3318)
- [serverless] ref: Add compatible runtime nodejs14.x to building awslambda layer (#3303)
- [ember] fix: Keep route hook context when performance-wrapping (#3274)
- [integrations] fix: Normalized Event before caching. (#3305)

## 6.2.1

- [core] fix: Moves SDK metadata-setting into the `NodeClient/BrowserClient` to protect it from being overwritten by other classes extending `BaseClient` like @sentry/serverless (#3279)

## 6.2.0

- [tracing] feat: Mongoose tracing support added to MongoDB (#3252)
- [tracing] fix: Add missing `find` method from mongo tracing list (#3253)
- [tracing] fix: Create `spanRecorder` whenever transactions are sampled (#3255)
- [node] fix: Parse ESM based frames with `file://` protocol (#3264)
- [react] fix: Remove react-dom peer dependency for RN (#3250)
- [ember] fix: Fixing fetching config during build step (#3246)
- [serverless]: fix: Handle incoming `sentry-trace` header (#3261)

## 6.1.0

We updated the way how we calculate errored and crashed sessions with this update. Please be aware that some numbers might change for you and they now should reflect the actual reality. Visit [our docs](https://docs.sentry.io/platforms/javascript/configuration/releases/#release-health) for more information.

- [browser] feat: Rework how we track sessions (#3224)
- [hub] ref: Simplify getting hub from active domain (#3227)
- [core] ref: Rename `user` to `publicKey` in `Dsn` type and class (#3225)
- [ember] fix: Fix backwards compatibility with Embroider changes (#3230)

## 6.0.4

- [browser] fix: Don't break when function call context is undefined (#3222)
- [tracing] fix: Set default sampling context data where `startTransaction` is called (#3210)
- [tracing] fix: Remove stray sampling data tags (#3197)
- [tracing] fix: Clear activeTransaction from the scope and always start idle timers (#3215)
- [angular] ref: Add Angular 11 to possible peerDependencies list (#3201)
- [vue] ref: Add `vue-router` to peerDependencies list (#3214)

## 6.0.3

- [tracing] ref: feat(tracing): Add context update methods to Span and Transaction (#3192)
- [node] ref: Make ExpressRequest not extend http.IncomingMessage anymore (#3211)
- [browser] deps: Allow for LocalForage >=1.8.1 (#3205)
- [ember] fix(ember): Fix location url for 'hash' location type (#3195)
- [ember] fix(ember): Fix Ember to work with Embroider and Fastboot (#3181)

## 6.0.2

- [browser] fix: Disable session tracking in non-browser environments (#3194)

## 6.0.1

- [vue] fix: Make sure that error is present before logging it in Vue (#3183)
- [serverless] fix: Fix issue when `/dist` didn't exist before building (#3190)

## 6.0.0

_This major version release doesn't contain any breaking API/code changes._ Starting from the version `6.0.0`, all SDKs
that support sending sessions data will do so by default. See our
[Release Health](https://docs.sentry.io/product/releases/health/) docs to learn more. As of this version, it applies to
all Browser SDKs (Browser, React, Angular, Vue, Gatsby etc.). Node.js and other related Server SDKs will follow soon
after, in the minor `6.x` release. You can opt-out of this behavior by setting `autoSessionTracking: false` option
during SDK initialization.

---

- [wasm] feat: Introduce a `@sentry/wasm` package (#3080)
- [tracing] feat: Turn Sessions Tracking on by default (#3099)
- [tracing] feat: Create session on history change (#3179)
- [core] feat: Attach SDK metadata to options and pass it to the API and transports (#3177)
- [build] feat: AWS Lambda layer target config for Craft (#3175)
- [tracing] fix: Make sure that mongo method is thenable before calling it (#3173)

## 5.30.0

- [node] fix: esbuild warning dynamic require (#3164)
- [tracing] ref: Expose required things for React Native auto tracing (#3144)
- [ember] fix: rootURL breaking route recognition (#3166)
- [serverless] feat: Zip serverless dependencies for AWS Lambda (#3110)
- [build] feat: Target to deploy on AWS Lambda (#3165)
- [build] ref: Remove TravisCI (#3149)
- [build] ref: Upgrade action-prepare-release to latest version

## 5.29.2

- Fix version

## 5.29.1

- [types] ref: Loosen tag types, create new `Primitive` type (#3108)
- [tracing] feat: Send sample rate and type in transaction item header in envelope (#3068)
- [tracing] fix(web-vitals): Fix TTFB capture in Safari (#3106)

## 5.29.0

- [tracing] feat: MongoDB Tracing Support (#3072)
- [tracing] feat: MySQL Tracing Support (#3088)
- [tracing] feat: PostgreSQL Tracing Support (#3064)
- [tracing] fix: Add `sentry-trace` header to outgoing http(s) requests in node (#3053)
- [node] fix: Revert express tracing integration type to use any (#3093)

## 5.28.0

- [browser] fix: Handle expo file dir stack frames (#3070)
- [vue] feat: @sentry/vue (#2953)
- [node] ref: Revamp express route info extraction (#3084)
- [browser] fix: Dont append dsn twice to report dialog calls (#3079)
- [ember] fix: Use correct import from `@sentry/browser` (#3077)
- [node] ref: Express integration span name change and path unification (#3078)

## 5.27.6

- [hub] fix: Don't invoke scope updates in scope listeners

## 5.27.5

- [hub] fix: Sync ScopeListeners (#3065)
- [tracing] fix: Typo in constant name in @sentry/tracing (#3058)

## 5.27.4

- [core] fix: Remove globalThis usage (#3033)
- [react] ref: Add React 17.x to peerDependencies (#3034)
- [tracing] fix: Express transaction name (#3048)
- [serverless] fix: AWS Execution duration (#3032)
- [serverless] fix: Add `optional` parameter to AWSServices integration (#3030)
- [serverless] fix: Wrap google cloud functions with a Proxy(). (#3035)
- [hub] fix: stop using @types/node in @sentry/hub (#3050)

## 5.27.3

- [hub] fix: Make sure that `getSession` exists before calling it (#3017)
- [browser] feat: Add `DOMException.code` as tag if it exists (#3018)
- [browser] fix: Call `removeEventListener` twice only when necessary (#3016)
- [tracing] fix: Schedule the execution of the finish to let all the spans being closed first (#3022)
- [tracing] fix: Adjust some web vitals to be relative to fetchStart and some other improvements (#3019)
- [tracing] fix: Add transaction name as tag on error events (#3024)

## 5.27.2

- [apm] ref: Delete sentry/apm package (#2990)
- [types] fix: make requestHandler options an own type (#2995)
- [core] fix: Use 'production' as default value for environment key (#3013)

## 5.27.1

- [hub] fix: Preserve original user data for explicitly updated scopes (#2991)
- [ember] fix: prevent unexpected errors on transition (#2988)

## 5.27.0

- [browser] feat: Sessions Health Tracking (#2973)
- [core] fix: Correct `processing` flag in `BaseClient` (#2983)
- [node] feat: use `req.cookies` if available instead of parsing (#2985)
- [core] ref: Use SentryError for `prepareEvent` rejections (#2973)
- [core] ref: Errors handling in `prepareEvent` pipeline (#2987)
- [serverless] feat: Implement tracing of Google Cloud Requests (#2981)
- [serverless] ref: Set global event processor and pass scope data for transactions (#2975)
- [tracing] feat: Add secure connect navigation timing (#2980)
- [tracing] feat: Capture time spent redirecting before loading the current page (#2986)
- [tracing] feat: Capture browser navigator information (#2966)
- [tracing] feat: Express router methods tracing (#2972)
- [tracing] ref: Only report FCP or FP if the page wasn't hidden prior to their instrumentation (#2979)

## 5.26.0

- [serverless] feat: Implement error handling and tracing for `Google Cloud Functions` (#2945)
- [serverless] feat: Enable tracing for `AWSLambda` (#2945)
- [serverless] feat: Add `AWSResources` integration (#2945)
- [browser] feat: Implement `X-Sentry-Rate-Limits` handling for transports (#2962)
- [tracing] feat: Add measurements support and web vitals (#2909)
- [tracing] feat: Add web vitals: CLS and TTFB (#2964)
- [angular] ref: Make `@angular/common` a peerDependency instead of dependency (#2961)
- [ember] feat: Add more render instrumentation (#2902)
- [ember] ref: Use `@embroider/macros` instead of `runInDebug` (#2873)
- [hub] ref: Do not allow for popping last layer and unify getter methods (#2955)

## 5.25.0

- [tracing] fix: Expose `startTransaction` in CDN bundle (#2938)
- [tracing] fix: Allow unsampled transactions to be findable by `getTransaction()` (#2952)
- [tracing] fix: Reimplement timestamp computation (#2947)
- [tracing] ref: Clean up sampling decision inheritance (#2921) (#2944)
- [react] fix: Makes `normalizeTransactionName` take a callback function in router-v3 (#2946)
- [ember] feat: Add more render instrumentation to @sentry/ember (#2902)
- [types] ref: Use correct types for `event.context` and allow for context removal (#2910)
- [types] ref: Make name required on transaction class (#2949)
- [build] feat: Update to use extends w. Volta (#2930)

## 5.24.2

- [utils] fix: Check that performance is available before calling it in RN (#2924)

## 5.24.1

- [types] fix: Remove Location type to avoid dom lib dependency (#2922)

## 5.24.0

- [angular] fix: Make sure that message exist before returning it in angular error handler (#2903)
- [integrations] feat: Add referrer to data collected by UserAgent integration (#2912)
- [core] fix: Make sure that body is not exposed in the breadcrumb by default (#2911)
- [core] feat: Give access to XHR requests body in breadcrumb hint (#2904)
- [core] fix: Add a wrapper around performance for React Native (#2915)
- [integrations] fix: Make Vue tracing options optional (#2897)
- [integrations] ref: Remove unnecessary eventID check in offline integration (#2890)
- [tracing] feat: Add hook for trace sampling function to SDK options (#2820)

## 5.23.0

- [serverless] feat: Introduce `@sentry/serverless` with `AWSLambda` support (#2886)
- [ember] feat: Add performance instrumentation for routes (#2784)
- [node] ref: Remove query strings from transaction and span names (#2857)
- [angular] ref: Strip query and fragment from Angular tracing URLs (#2874)
- [tracing] ref: Simplify `shouldCreateSpanForRequest` (#2867)

## 5.22.3

- [integrations] fix: Window type (#2864)

## 5.22.2

- [integrations] fix: localforage typing (#2861)

## 5.22.1

- [integrations] fix: Add localforage typing (#2856)
- [tracing] fix: Make sure BrowserTracing is exported in CDN correctly (#2855)

## 5.22.0

- [browser] ref: Recognize `Capacitor` scheme as `Gecko` (#2836)
- [node]: fix: Save `string` exception as a message for `syntheticException` (#2837)
- [tracing] feat: Add `build` dir in npm package (#2846)
- [tracing] fix: Fix typo in `addPerformanceEntries` method name (#2847)
- [apm] ref: Deprecate `@sentry/apm` package (#2844)
- [angular] fix: Allow for empty DSN/disabling with `AngularJS` integration (#2842)
- [gatsby] ref: Make `@sentry/tracing` mandatory + add tests (#2841)
- [integrations] feat: Add integration for offline support (#2778)
- [utils] ref: Revert the usage of `globalThis` for `getGlobalObject` util (#2851)
- [build] fix: Lock in `TypeScript` to `3.7.5` (#2848)
- [build] misc: Upgrade `Prettier` to `1.19.0` (#2850)

## 5.21.4

- [ci] fix: Actually release correct code

## 5.21.3

- [tracing] feat: Track span status for fetch requests (#2835)
- [react] fix: Return an any from createReduxEnhancer to avoid type conflicts (#2834)
- [react] fix: Make sure profiler is typed with any (#2838)

## 5.21.2

- [tracing] fix: Normalize transaction names for express methods to match those of other SDKs (#2832)
- [tracing] feat: Change resource span op name and add data (#2816)
- [tracing] ref: Make sure error status is set on transactions (#2818)
- [apm/tracing] fix: Make sure Performance Observer takeRecords() is defined (#2825)

## 5.21.1

- [ember] fix: Make the package public and fix the build by bumping TypeScript to v3.9 (#2811)
- [eslint] test: Don't test eslint config/plugin on Node <= v8

## 5.21.0

- [all] feat: Convert `sentry-javascript` to `ESLint` (#2786)
- [internal/eslint] feat: Add `@sentry-internal/eslint-config-sdk` (#2807)
- [ember] feat: Add `@sentry/ember` (#2739)
- [angular] feat: Add `@sentry/angular` (#2787)
- [react] feat: Add routing instrumentation for `React Router v4/v5` (#2780)
- [gatsby] feat: support `process.env.SENTRY_RELEASE` (#2776)
- [apm/tracing] feat: Export `addExtensionMethods` for SDKs to use (#2805)
- [apm/tracing] ref: Remove `express` typing (#2803)
- [node] fix: `Retry-After` header in node should be lower-case (#2779)

## 5.20.1

- [core] ref: Expose sentry request for electron (#2774)
- [browser] fix: Make sure that DSN is always passed to report dialog (#2770)
- [apm/tracing] fix: Make sure fetch requests are being timed correctly (#2772)
- [apm/tracing] fix: Make sure pageload transactions start timestamps are correctly generated (#2773)
- [react] feat: Add instrumentation for React Router v3 (#2759)
- [react] ref: Use inline types to avoid redux dependency. (#2768)
- [node] fix: Set transaction on scope in node for request (#2769)

## 5.20.0

- [browser] feat: Make `@sentry/browser` more treeshakeable (#2747)
- [browser] fix: Make sure that handler exists in `LinkedErrors` integration (#2742)
- [tracing] feat: Introduce `@sentry/tracing` (#2719)
- [tracing] ref: Use `idleTimout` if no activities occur in idle transaction (#2752)
- [react] feat: Export `createReduxEnhancer` to log redux actions as breadcrumbs, and attach state as an extra. (#2717)
- [react] feat: Add `beforeCapture` option to ErrorBoundary (#2753)
- [react] fix: Change import of `hoist-non-react-statics` (#2755)
- [gatsby] fix: Make `@sentry/apm` optional in `@sentry/gatsby` package (#2752)

## 5.19.2

- [gatsby] fix: Include correct gatsby files in npm tarball (#2731)
- [browser] fix: Correctly detach event listeners (#2737)
- [browser] fix: Drop initial frame for production react errors (#2728)
- [node] chore: Upgrade https-proxy-agent to v5 (#2702)
- [types] ref: Define type for Extra(s) (#2727)

## 5.19.1

- [browser] fix: Correctly remove all event listeners (#2725)
- [tracing] fix: APM CDN bundle expose startTransaction (#2726)
- [tracing] fix: Add manual `DOMStringList` typing (#2718)

## 5.19.0

- [react] feat: Expose eventId on ErrorBoundary component (#2704)
- [node] fix: Extract transaction from nested express paths correctly (#2714)
- [tracing] feat: Pick up sentry-trace in JS `<meta/>` tag (#2703)
- [tracing] fix: Respect fetch headers (#2712) (#2713)
- [tracing] fix: Check if performance.getEntries() exists (#2710)
- [tracing] fix: Add manual Location typing (#2700)
- [tracing] fix: Respect sample decision when continuing trace from header in node (#2703)
- [tracing] fix: All options of adding fetch headers (#2712)
- [gatsby] fix: Add gatsby SDK identifier (#2709)
- [gatsby] fix: Package gatsby files properly (#2711)

## 5.18.1

- [react] feat: Update peer dependencies for `react` and `react-dom` (#2694)
- [react] ref: Change Profiler prop names (#2699)

## 5.18.0

- [core] ref: Rename `whitelistUrls/blacklistUrls` to `allowUrls/denyUrls` (#2671)
- [core] feat: Export `makeMain` (#2665)
- [core] fix: Call `bindClient` when creating new `Hub` to make integrations work automatically (#2665)
- [react] feat: Add @sentry/react package (#2631)
- [react] feat: Add Error Boundary component (#2647)
- [react] feat: Add useProfiler hook (#2659)
- [react] ref: Refactor Profiler to account for update and render (#2677)
- [gatsby] feat: Add @sentry/gatsby package (#2652)
- [apm] feat: Add ability to get span from activity using `getActivitySpan` (#2677)
- [apm] fix: Check if `performance.mark` exists before calling it (#2680)
- [tracing] feat: Add `scope.getTransaction` to return a Transaction if it exists (#2668)
- [tracing] ref: Deprecate `scope.setTransaction` in favor of `scope.setTransactionName` (#2668)
- [tracing] feat: Add `beforeNavigate` option (#2691)
- [tracing] ref: Create navigation transactions using `window.location.pathname` instead of `window.location.href`
  (#2691)

## 5.17.0

- [browser] feat: Support `fetchParameters` (#2567)
- [apm] feat: Report LCP metric on pageload transactions (#2624)
- [core] fix: Normalize Transaction and Span consistently (#2655)
- [core] fix: Handle DSN qs and show better error messages (#2639)
- [browser] fix: Change XHR instrumentation order to handle `onreadystatechange` breadcrumbs correctly (#2643)
- [apm] fix: Re-add TraceContext for all events (#2656)
- [integrations] fix: Change Vue interface to be inline with the original types (#2634)
- [apm] ref: Use startTransaction where appropriate (#2644)

## 5.16.1

- [node] fix: Requests to old `/store` endpoint need the `x-sentry-auth` header in node (#2637)

## 5.16.0

_If you are a `@sentry/apm` and did manual instrumentation using `hub.startSpan` please be aware of the changes we did
to the API. The recommended entry point for manual instrumentation now is `Sentry.startTransaction` and creating child
Span by calling `startChild` on it. We have internal workarounds in place so the old code should still work but will be
removed in the future. If you are only using the `Tracing` integration there is no need for action._

- [core] feat: Send transactions in envelopes (#2553)
- [core] fix: Send event timestamp (#2575)
- [browser] feat: Allow for configuring TryCatch integration (#2601)
- [browser] fix: Call wrapped `RequestAnimationFrame` with correct context (#2570)
- [node] fix: Prevent reading the same source file multiple times (#2569)
- [integrations] feat: Vue performance monitoring (#2571)
- [apm] fix: Use proper type name for op (#2584)
- [core] fix: sent_at for envelope headers to use same clock (#2597)
- [apm] fix: Improve bundle size by moving span status to @sentry/apm (#2589)
- [apm] feat: No longer discard transactions instead mark them deadline exceeded (#2588)
- [apm] feat: Introduce `Sentry.startTransaction` and `Transaction.startChild` (#2600)
- [apm] feat: Transactions no longer go through `beforeSend` (#2600)
- [browser] fix: Emit Sentry Request breadcrumbs from inside the client (#2615)
- [apm] fix: No longer debounce IdleTransaction (#2618)
- [apm] feat: Add pageload transaction option + fixes (#2623)
- [minimal/core] feat: Allow for explicit scope through 2nd argument to `captureException/captureMessage` (#2627)

## 5.15.5

- [browser/node] Add missing `BreadcrumbHint` and `EventHint` types exports (#2545)
- [utils] fix: Prevent `isMatchingPattern` from failing on invalid input (#2543)

## 5.15.4

- [node] fix: Path domain onto global extension method to not use require (#2527)

## 5.15.3

- [hub] fix: Restore dynamicRequire, but for `perf_hooks` only (#2524)

## 5.15.2

- [hub] fix: Remove dynamicRequire, Fix require call (#2521)

## 5.15.1

- [browser] fix: Prevent crash for react native instrumenting fetch (#2510)
- [node] fix: Remove the no longer required dynamicRequire hack to fix scope memory leak (#2515)
- [node] fix: Guard against invalid req.user input (#2512)
- [node] ref: Move node version to runtime context (#2507)
- [utils] fix: Make sure that SyncPromise handler is called only once (#2511)

## 5.15.0

- [apm] fix: Sampling of traces work now only depending on the client option `tracesSampleRate` (#2500)
- [apm] fix: Remove internal `forceNoChild` parameter from `hub.startSpan` (#2500)
- [apm] fix: Made constructor of `Span` internal, only use `hub.startSpan` (#2500)
- [apm] ref: Remove status from tags in transaction (#2497)
- [browser] fix: Respect breadcrumbs sentry:false option (#2499)
- [node] ref: Skip body parsing for GET/HEAD requests (#2504)

## 5.14.2

- [apm] fix: Use Performance API for timings when available, including Web Workers (#2492)
- [apm] fix: Remove Performance references (#2495)
- [apm] fix: Set `op` in node http.server transaction (#2496)

## 5.14.1

- [apm] fix: Check for performance.timing in webworkers (#2491)
- [apm] ref: Remove performance clear entry calls (#2490)

## 5.14.0

- [apm] feat: Add a simple heartbeat check, if activities don't change in 3 beats, finish the transaction (#2478)
- [apm] feat: Make use of the `performance` browser API to provide better instrumentation (#2474)
- [browser] ref: Move global error handler + unhandled promise rejection to instrument (#2475)
- [apm] ref: Always use monotonic clock for time calculations (#2485)
- [apm] fix: Add trace context to all events (#2486)

## 5.13.2

- [apm] feat: Add `discardBackgroundSpans` to discard background spans by default

## 5.13.1

- [node] fix: Restore engines back to `>= 6`

## 5.13.0

- [apm] feat: Add `options.autoPopAfter` parameter to `pushActivity` to prevent never-ending spans (#2459)
- [apm] fix: Use monotonic clock to compute durations (#2441)
- [core] ref: Remove unused `sentry_timestamp` header (#2458)
- [node] ref: Drop Node v6, add Node v12 to test matrix, move all scripts to Node v12 (#2455)
- [utils] ref: Prevent instantiating unnecessary Date objects in `timestampWithMs` (#2442)
- [browser] fix: Mark transactions as event.transaction in breadcrumbs correctly

## 5.12.5

- [browser] ref: Mark transactions as event.transaction in breadcrumbs (#2450)
- [node] fix: Dont overwrite servername in requestHandler (#2449)
- [utils] ref: Move creation of iframe into try/catch in fetch support check (#2447)

## 5.12.4

- [browser] ref: Rework XHR wrapping logic to make sure it always triggers (#2438)
- [browser] fix: Handle PromiseRejectionEvent-like CustomEvents (#2429)
- [core] ref: Notify user when event failed to deliver because of digestion pipeline issue (#2416)
- [node] fix: Improve incorrect `ParseRequest` typing (#2433)
- [apm] fix: Remove auto unknown_error transaction status (#2440)
- [apm] fix: Properly remove undefined keys from apm payload (#2414)

## 5.12.3

- [apm] fix: Remove undefined keys from trace.context (#2413)

## 5.12.2

- [apm] ref: Check if Tracing integration is enabled before dropping transaction

## 5.12.1

- [apm] ref: If `maxTransactionTimeout` = `0` there is no timeout (#2410)
- [apm] fix: Make sure that the `maxTransactionTimeout` is always enforced on transaction events (#2410)
- [browser] fix: Support for Hermes stacktraces (#2406)

## 5.12.0

- [core] feat: Provide `normalizeDepth` option and sensible default for scope methods (#2404)
- [browser] fix: Export `EventHint` type (#2407)

## 5.11.2

- [apm] fix: Add new option to `Tracing` `maxTransactionTimeout` determines the max length of a transaction (#2399)
- [hub] ref: Always also set transaction name on the top span in the scope
- [core] fix: Use `event_id` from hint given by top-level hub calls

## 5.11.1

- [apm] feat: Add build bundle including @sentry/browser + @sentry/apm
- [utils] ref: Extract adding source context incl. tests

## 5.11.0

- [apm] fix: Always attach `contexts.trace` to finished transaction (#2353)
- [integrations] fix: Make RewriteFrame integration process all exceptions (#2362)
- [node] ref: Update agent-base to 5.0 to remove http/s patching (#2355)
- [browser] feat: Set headers from options in XHR/fetch transport (#2363)

## 5.10.2

- [browser] fix: Always trigger default browser onerror handler (#2348)
- [browser] fix: Restore correct `functionToString` behavior for updated `fill` method (#2346)
- [integrations] ref: Allow for backslashes in unix paths (#2319)
- [integrations] feat: Support Windows-style path in RewriteFrame iteratee (#2319)

## 5.10.1

- [apm] fix: Sent correct span id with outgoing requests (#2341)
- [utils] fix: Make `fill` and `wrap` work nicely together to prevent double-triggering instrumentations (#2343)
- [node] ref: Require `https-proxy-agent` only when actually needed (#2334)

## 5.10.0

- [hub] feat: Update `span` implementation (#2161)
- [apm] feat: Add `@sentry/apm` package
- [integrations] feat: Change `Tracing` integration (#2161)
- [utils] feat: Introduce `instrument` util to allow for custom handlers
- [utils] Optimize `supportsNativeFetch` with a fast path that avoids DOM I/O (#2326)
- [utils] feat: Add `isInstanceOf` util for safety reasons

## 5.9.1

- [browser] ref: Fix regression with bundle size

## 5.9.0

- [node] feat: Added `mode` option for `OnUnhandledRejection` integration that changes how we log errors and what we do
  with the process itself
- [browser] ref: Both global handlers now always return `true` to call default implementations (error logging)

## 5.8.0

- [browser/node] feat: 429 http code handling in node/browser transports (#2300)
- [core] feat: Make sure that Debug integration is always setup as the last one (#2285)
- [browser] fix: Gracefuly handle incorrect input from onerror (#2302)
- [utils] fix: Safer normalizing for input with `domain` key (#2305)
- [utils] ref: Remove dom references from utils for old TS and env interop (#2303)

## 5.7.1

- [core] ref: Use the smallest possible interface for our needs - `PromiseLike` (#2273)
- [utils] fix: Add TS dom reference to make sure its in place for compilation (#2274)

## 5.7.0

- [core] ref: Use `Promise` as the interface, but `SyncPromise` as the implementation in all the places we need
  `thenable` API
- [browser] fix: Capture only failed `console.assert` calls
- [browser] ref: Major `TraceKit` and `GlobalHandlers` refactor
- [browser] ref: Remove _all_ required IE10-11 polyfills
- [browser] ref: Remove `Object.assign` method usage
- [browser] ref: Remove `Number.isNaN` method usage
- [browser] ref: Remove `includes` method usage
- [browser] ref: Improve usage of types in `addEventListener` breadcrumbs wrapper
- [browser] ci: Use Galaxy S9 Plus for Android 9
- [browser] ci: Increase timeouts and retries between Travis and BrowserStack
- [node] fix: Update https-proxy-agent to 3.0.0 for security reasons (#2262)
- [node] feat: Extract prototyped data in `extractUserData` (#2247)
- [node] ref: Use domain Hub detection only in Node environment
- [integrations] feat: Use `contexts` to handle ExtraErrorData (#2208)
- [integrations] ref: Remove `process.env.NODE_ENV` from Vue integration (#2263)
- [types] fix: Breadcrumb `data` needs to be an object
- [utils] ref: Make `Event` instances somewhat serializeable

## 5.6.3

- [browser] fix: Don't capture our own XHR events that somehow bubbled-up to global handler (#2221)

## 5.6.2

- [browser] feat: Use framesToPop for InvaliantViolations in React errors (#2204)
- [browser] fix: Apply crossorigin attribute with setAttribute tag for userReport dialog (#2196)
- [browser] fix: Make sure that falsy values are captured in unhandledrejections (#2207)
- [loader] fix: Loader should also retrigger falsy values as errors (#2207)

## 5.6.1

- [core] fix: Correctly detect when client is enabled before installing integrations (#2193)
- [browser] ref: Loosen typings in `wrap` method

## 5.6.0

- [core] fix: When using enabled:false integrations shouldnt be installed (#2181)
- [browser] feat: Add support for custom schemes to Tracekit
- [browser] ref: Return function call result from `wrap` method
- [browser] ref: Better UnhandledRejection messages (#2185)
- [browser] test: Complete rewrite of Browser Integration Tests (#2176)
- [node] feat: Add cookies as an optional property in the request handler (#2167)
- [node] ref: Unify method name casing in breadcrumbs (#2183)
- [integrations] feat: Add logErrors option to Vue integration (#2182)

## 5.5.0

- [core] fix: Store processing state for each `flush` call separately (#2143)
- [scope] feat: Generate hint if not provided in the Hub calls (#2142)
- [browser] feat: Read `window.SENTRY_RELEASE` to set release by default (#2132)
- [browser] fix: Don't call `fn.handleEvent.bind` if `fn.handleEvent` does not exist (#2138)
- [browser] fix: Correctly handle events that utilize `handleEvent` object (#2149)
- [node] feat: Provide optional `shouldHandleError` option for node `errorHandler` (#2146)
- [node] fix: Remove unsafe `any` from `NodeOptions` type (#2111)
- [node] fix: Merge `transportOptions` correctly (#2151)
- [utils] fix: Add polyfill for `Object.setPrototypeOf` (#2127)
- [integrations] feat: `SessionDuration` integration (#2150)

## 5.4.3

- [core] feat: Expose `Span` class
- [node] fix: Don't overwrite transaction on event in express handler

## 5.4.2

- [core] fix: Allow `Integration<T>` constructor to have arguments
- [browser] fix: Vue breadcrumb recording missing in payload
- [node] fix: Force agent-base to be at version 4.3.0 to fix various issues. Fix #1762, fix #2085
- [integrations] fix: Tracing integration fetch headers bug where trace header is not attached if there are no options.
- [utils] fix: Better native `fetch` detection via iframes. Fix #1601

## 5.4.1

- [integrations] fix: Tracing integration fetch headers bug.

## 5.4.0

- [global] feat: Exposed new simplified scope API. `Sentry.setTag`, `Sentry.setTags`, `Sentry.setExtra`,
  `Sentry.setExtras`, `Sentry.setUser`, `Sentry.setContext`

## 5.3.1

- [integrations] fix: Tracing integration CDN build.

## 5.3.0

- [browser] fix: Remove `use_strict` from `@sentry/browser`
- [utils] fix: Guard string check in `truncate`
- [browser] fix: TraceKit fix for eval frames

## 5.2.1

- [browser] feat: Expose `wrap` function in `@sentry/browser`
- [browser] feat: Added `onLoad` callback to `showReportDialog`
- [browser] fix: Use 'native code' as a filename for some frames

## 5.2.0

- [opentracing] ref: Removed opentracing package
- [integrations] feat: Add tracing integration
- [hub] feat: Add tracing related function to scope and hub (`Scope.startSpan`, `Scope.setSpan`, `Hub.traceHeaders`)
- [hub] feat: Add new function to Scope `setContext`
- [hub] feat: Add new function to Scope `setTransaction`
- [integrations] fix: Update ember integration to include original error in `hint` in `beforeSend`
- [integrations] fix: Ember/Vue fix integration

## 5.1.3

- [browser] fix: GlobalHandler integration sometimes receives Event objects as message: Fix #1949

## 5.1.2

- [browser] fix: Fixed a bug if Sentry was initialized multiple times: Fix #2043
- [browser] ref: Mangle more stuff, reduce bundle size
- [browser] fix: Support for ram bundle frames
- [node] fix: Expose lastEventId method

## 5.1.1

- [browser] fix: Breadcrumb Integration: Fix #2034

## 5.1.0

- [hub] feat: Add `setContext` on the scope
- [browser] fix: Breacrumb integration ui clicks
- [node] feat: Add `flushTimeout` to `requestHandler` to auto flush requests

## 5.0.8

- [core] fix: Don't disable client before flushing
- [utils] fix: Remove node types
- [hub] fix: Make sure all breadcrumbs have a timestamp
- [hub] fix: Merge event with scope breadcrumbs instead of only using event breadcrumbs

## 5.0.7

- [utils] ref: Move `htmlTreeAsString` to `@sentry/browser`
- [utils] ref: Remove `Window` typehint `getGlobalObject`
- [core] fix: Make sure that flush/close works as advertised
- [integrations] feat: Added `CaptureConsole` integration

## 5.0.6

- [utils]: Change how we use `utils` and expose `esm` build
- [utils]: Remove `store` and `fs` classes -> moved to @sentry/electron where this is used
- [hub]: Allow to pass `null` to `setUser` to reset it

## 5.0.5

- [esm]: `module` in `package.json` now provides a `es5` build instead of `es2015`

## 5.0.4

- [integrations] fix: Not requiring angular types

## 5.0.3

- [hub] fix: Don't reset registry when there is no hub on the carrier #1969
- [integrations] fix: Export dedupe integration

## 5.0.2

- [browser] fix: Remove `browser` field from `package.json`

## 5.0.1

- [browser] fix: Add missing types

## 5.0.0

This major bump brings a lot of internal improvements. Also, we extracted some integrations out of the SDKs and put them
in their own package called `@sentry/integrations`. For a detailed guide how to upgrade from `4.x` to `5.x` refer to our
[migration guide](https://github.com/getsentry/sentry-javascript/blob/master/MIGRATION.md).

### Migration from v4

If you were using the SDKs high level API, the way we describe it in the docs, you should be fine without any code
changes. This is a **breaking** release since we removed some methods from the public API and removed some classes from
the default export.

- **breaking** [node] fix: Events created from exception shouldn't have top-level message attribute
- [utils] ref: Update wrap method to hide internal sentry flags
- [utils] fix: Make internal Sentry flags non-enumerable in fill utils
- [utils] ref: Move `SentryError` + `PromiseBuffer` to utils
- **breaking** [core] ref: Use `SyncPromise` internally, this reduces memory pressure by a lot.
- ref: Move internal `ExtendedError` to a types package
- **breaking** [browser] ref: Removed `BrowserBackend` from default export.
- **breaking** [node] ref: Removed `BrowserBackend` from default export.
- **breaking** [core] feat: Disable client once flushed using `close` method
- **breaking** [core] ref: Pass `Event` to `sendEvent` instead of already stringified data
- [utils] feat: Introduce `isSyntheticEvent` util
- **breaking** [utils] ref: remove `isArray` util in favor of `Array.isArray`
- **breaking** [utils] ref: Remove `isNaN` util in favor of `Number.isNaN`
- **breaking** [utils] ref: Remove `isFunction` util in favor of `typeof === 'function'`
- **breaking** [utils] ref: Remove `isUndefined` util in favor of `=== void 0`
- **breaking** [utils] ref: Remove `assign` util in favor of `Object.assign`
- **breaking** [utils] ref: Remove `includes` util in favor of native `includes`
- **breaking** [utils] ref: Rename `serializeKeysToEventMessage` to `keysToEventMessage`
- **breaking** [utils] ref: Rename `limitObjectDepthToSize` to `normalizeToSize` and rewrite its internals
- **breaking** [utils] ref: Rename `safeNormalize` to `normalize` and rewrite its internals
- **breaking** [utils] ref: Remove `serialize`, `deserialize`, `clone` and `serializeObject` functions
- **breaking** [utils] ref: Rewrite normalization functions by removing most of them and leaving just `normalize` and
  `normalizeToSize`
- **breaking** [core] ref: Extract all pluggable integrations into a separate `@sentry/integrations` package
- **breaking** [core] ref: Move `extraErrorData` integration to `@sentry/integrations` package
- [core] feat: Add `maxValueLength` option to adjust max string length for values, default is 250.
- [hub] feat: Introduce `setExtras`, `setTags`, `clearBreadcrumbs`.
- **breaking** [all] feat: Move `Mechanism` to `Exception`
- [browser/node] feat: Add `synthetic` to `Mechanism` in exception.
- [browser/node] fix: Use `addExceptionTypeValue` in helpers
- [browser] ref: Remove unused TraceKit code
- **breaking** [all] build: Expose `module` in `package.json` as entry point for esm builds.
- **breaking** [all] build: Use `es6` target instead of esnext for ESM builds
- [all] feat: Prefix all private methods with `_`
- [all] build: Use terser instead of uglify
- [opentracing] feat: Introduce `@sentry/opentracing` providing functions to attach opentracing data to Sentry Events
- **breaking** [core] ref: `Dedupe` Integration is now optional, it is no longer enabled by default.
- **breaking** [core] ref: Removed default client fingerprinting for messages
- [node] ref: Remove stack-trace dependencies
- **breaking** [core] ref: Transport function `captureEvent` was renamed to `sendEvent`
- [node] fix: Check if buffer isReady before sending/creating Promise for request.
- [browser] fix: Remove beacon transport.
- [browser] fix: Don't mangle names starting with two `__`
- [utils] fix: Ensure only one logger instance
- [node] feat: Add esm build
- [integrations] feat: Fix build and prepare upload to cdn
- [integrations] fix: Bug in vue integration with `attachProps`
- **breaking** [core] ref: Remove SDK information integration
- **breaking** [core] ref: Remove `install` function on integration interface
- [node] feat: Add esm build
- [integrations] feat: Fix build and prepare upload to cdn
- [integrations] fix: Bug in vue integration with `attachProps`

## 5.0.0-rc.3

- [browser] fix: Don't mangle names starting with two `__`
- [utils] fix: Ensure only one logger instance

## 5.0.0-rc.2

- [browser] fix: Remove beacon transport.

## 5.0.0-rc.1

- [node] fix: Check if buffer isReady before sending/creating Promise for request.

## 5.0.0-rc.0

- Fix: Tag npm release with `next` to not make it latest

## 5.0.0-beta.2

- Fix: NPM release

## 5.0.0-beta1

### Migration from v4

This major bump brings a lot of internal improvements. This is a **breaking** release since we removed some methods from
the public API and removed some classes from the default export.

- **breaking** [node] fix: Events created from exception shouldn't have top-level message attribute
- [utils] ref: Update wrap method to hide internal sentry flags
- [utils] fix: Make internal Sentry flags non-enumerable in fill utils
- [utils] ref: Move `SentryError` + `PromiseBuffer` to utils
- **breaking** [core] ref: Use `SyncPromise` internally, this reduces memory pressure by a lot.
- **breaking** [browser] ref: Removed `BrowserBackend` from default export.
- **breaking** [node] ref: Removed `BrowserBackend` from default export.
- **breaking** [core] feat: Disable client once flushed using `close` method
- ref: Move internal `ExtendedError` to a types package
- **breaking** [core] ref: Pass `Event` to `sendEvent` instead of already stringified data
- [utils] feat: Introduce `isSyntheticEvent` util
- **breaking** [utils] ref: remove `isArray` util in favor of `Array.isArray`
- **breaking** [utils] ref: Remove `isNaN` util in favor of `Number.isNaN`
- **breaking** [utils] ref: Remove `isFunction` util in favor of `typeof === 'function'`
- **breaking** [utils] ref: Remove `isUndefined` util in favor of `=== void 0`
- **breaking** [utils] ref: Remove `assign` util in favor of `Object.assign`
- **breaking** [utils] ref: Remove `includes` util in favor of native `includes`
- **breaking** [utils] ref: Rename `serializeKeysToEventMessage` to `keysToEventMessage`
- **breaking** [utils] ref: Rename `limitObjectDepthToSize` to `normalizeToSize` and rewrite its internals
- **breaking** [utils] ref: Rename `safeNormalize` to `normalize` and rewrite its internals
- **breaking** [utils] ref: Remove `serialize`, `deserialize`, `clone` and `serializeObject` functions
- **breaking** [utils] ref: Rewrite normalization functions by removing most of them and leaving just `normalize` and
  `normalizeToSize`
- **breaking** [core] ref: Extract all pluggable integrations into a separate `@sentry/integrations` package
- **breaking** [core] ref: Move `extraErrorData` integration to `@sentry/integrations` package
- [core] feat: Add `maxValueLength` option to adjust max string length for values, default is 250.
- [hub] feat: Introduce `setExtras`, `setTags`, `clearBreadcrumbs`.
- **breaking** [all] feat: Move `Mechanism` to `Exception`
- [browser/node] feat: Add `synthetic` to `Mechanism` in exception.
- [browser/node] fix: Use `addExceptionTypeValue` in helpers
- [browser] ref: Remove unused TraceKit code
- **breaking** [all] build: Expose `module` in `package.json` as entry point for esm builds.
- **breaking** [all] build: Use `es6` target instead of esnext for ESM builds
- [all] feat: Prefix all private methods with `_`
- [all] build: Use terser instead of uglify
- [opentracing] feat: Introduce `@sentry/opentracing` providing functions to attach opentracing data to Sentry Events
- **breaking** [core] ref: `Dedupe` Integration is now optional, it is no longer enabled by default.
- **breaking** [core] ref: Removed default client fingerprinting for messages
- [node] ref: Remove stack-trace dependencies
- **breaking** [core] ref: Transport function `captureEvent` was renamed to `sendEvent`

## 4.6.4

- [utils] fix: Prevent decycling from referencing original objects
- [utils] fix: Preserve correct name when wrapping
- [raven-node] test: Update raven-node tests for new node version

## 4.6.3

- [utils] fix: Normalize value before recursively walking down the tree
- [browser] ref: Check whether client is enabled for reportDialog and log instead of throw

## 4.6.2

- [utils] fix: Preserve function prototype when filling
- [utils] fix: use a static object as fallback of the global object
- [node] feat: Read from `SENTRY_RELEASE` and `SENTRY_ENVIRONMENT` if present

## 4.6.1

- [utils] fix: Patch `tslib_1__default` regression and add additional tests around it

## 4.6.0

- [loader] fix: Detect if `init` has been called in an onload callback
- [core] fix: Use correct frame for `inboundFilter` methods
- [core] ref: Multiple `init` calls have been changed to "latest wins" instead of "ignore all after first"
- [core] feat: Introduce `flush` method which currently is an alias for `close`
- [node] feat: If `options.dsn` is undefined when calling `init` we try to load it from `process.env.SENTRY_DSN`
- [node] feat: Expose `flush` and `close` on `Sentry.*`
- [node] feat: Add `sentry` to express error handler response which contains the `event_id` of the error

## 4.5.4

- [browser] fix: `DOMError` and `DOMException` should be error level events
- [browser] ref: Log error if Ember/Vue instances are not provided
- [utils] fix: Dont mutate original input in `decycle` util function
- [utils] fix: Skip non-enumerable properties in `decycle` util function
- [utils] ref: Update `wrap` method to hide internal Sentry flags
- [utils] fix: Make internal Sentry flags non-enumerable in `fill` util

## 4.5.3

- [browser]: fix: Fix UnhandledPromise: [object Object]
- [core]: fix: Error in extraErrorData integration where event would not be send in case of non assignable object
  property.
- [hub]: feat: Support non async event processors

## 4.5.2

- [utils] fix: Decycling for objects to no produce an endless loop
- [browser] fix: `<unlabeled>` event for unhandledRejection
- [loader] fix: Handle unhandledRejection the same way as it would be thrown

## 4.5.1

- [utils] fix: Don't npm ignore esm for utils

## 4.5.0

- [core] feat: Deprecate `captureEvent`, prefer `sendEvent` for transports. `sendEvent` now takes a string (body)
  instead of `Event` object.
- [core] feat: Use correct buffer for requests in transports
- [core] feat: (beta) provide esm build
- [core] ref: Change way how transports are initialized
- [core] ref: Rename `RequestBuffer` to `PromiseBuffer`, also introduce limit
- [core] ref: Make sure that captureMessage input is a primitive
- [core] fix: Check if value is error object in extraErrorData integration
- [browser] fix: Prevent empty exception values
- [browser] fix: Permission denied to access property name
- [node] feat: Add file cache for providing pre/post context in frames
- [node] feat: New option `frameContextLines`, if set to `0` we do not provide source code pre/post context, default is
  `7` lines pre/post
- [utils] fix: Use custom serializer inside `serialize` method to prevent circular references

## 4.4.2

- [node] Port memory-leak tests from raven-node
- [core] feat: ExtraErrorData integration
- [hub] ref: use safeNormalize on any data we store on Scope
- [utils] feat: Introduce safeNormalize util method to unify stored data
- [loader] Support multiple onLoad callbacks

## 4.4.1

- [core] Bump dependencies to remove flatmap-stream

## 4.4.0

- [node] HTTP(S) Proxy support
- [node] Expose lastEventId method
- [browser] Correctly detect and remove wrapped function frames

## 4.3.4

- [utils] fix: Broken tslib import - Fixes #1757

## 4.3.3

- [build] ref: Dont emit TypeScript helpers in every file separately
- [node] fix: Move stacktrace types from devDeps to deps as its exposed
- [browser] misc: Added browser examples page

## 4.3.2

- [browser] fix: Typings for npm package

## 4.3.1

- [browser] ref: Breadcrumbs will now be logged only to a max object depth of 2
- [core] feat: Filter internal Sentry errors from transports/sdk
- [core] ref: Better fingerprint handling
- [node] ref: Expose Parsers functions

## 4.3.0

- [browser]: Move `ReportingObserver` integration to "pluggable" making it an opt-in integration
- [utils]: Use node internal `path` / `fs` for `store.ts`

## 4.2.4

- [browser]: Use `withScope` in `Ember` integration instead of manual `pushPop/popScope` calls
- [browser] fix: rethrow errors in testing mode with `Ember` integration (#1696)
- [browser/node]: Fix `LinkedErrors` integration to send exceptions in correct order and take main exception into the
  `limit` count
- [browser/node] ref: Re-export `addGlobalEventProcessor`
- [core]: Fix `InboundFilters` integration so that it reads and merge configuration from the `init` call as well

## 4.2.3

- [utils]: `bundlerSafeRequire` renamed to `dynamicRequire` now takes two arguments, first is should be `module`, second
  `request` / `moduleName`.

## 4.2.2

- [core]: Several internal fixes regarding integration, exports and domain.
- [core]: "De-deprecate" name of `Integration` interface.
- [node]: Export `parseRequest` on `Handlers`.

## 4.2.1

- [core] Invert logger logic the explicitly enable it.
- [hub] Require `domain` in `getCurrentHub` in try/catch - Fixed #1670
- [hub] Removed exposed getter on the Scope.

## 4.2.0

- [browser] fix: Make `addBreadcrumb` sync internally, `beforeBreadcrumb` is now only sync
- [browser] fix: Remove internal `console` guard in `beforeBreadcrumb`
- [core] feat: Integrations now live on the `Client`. This means that when binding a new Client to the `Hub` the client
  itself can decide which integration should run.
- [node] ref: Simplify Node global handlers code

## 4.1.1

- [browser] fix: Use our own path utils instead of node built-ins
- [node] fix: Add colon to node base protocol to follow http module
- [utils] feat: Create internal path module

## 4.1.0

- [browser] feat: Better mechanism detection in TraceKit
- [browser] fix: Change loader to use getAttribute instead of dataset
- [browser] fix: Remove trailing commas from loader for IE10/11
- [browser] ref: Include md5 lib and transcript it to TypeScript
- [browser] ref: Remove all trailing commas from integration tests cuz IE10/11
- [browser] ref: Remove default transaction from browser
- [browser] ref: Remove redundant debug.ts file from browser integrations
- [browser] test: Fix all integration tests in IE10/11 and Android browsers
- [browser] test: Run integration tests on SauceLabs
- [browser] test: Stop running raven-js saucelabs tests in favour of @sentry/browser
- [browser] test: Store breadcrumbs in the global variable in integration tests
- [browser] test: Update polyfills for integration tests
- [build] ref: Use Mocha v4 instead of v5, as it's not supporting IE10
- [core] feat: Introduce stringify and debugger options in Debug integration
- [core] feat: RewriteFrames pluggable integration
- [core] feat: getRequestheaders should handle legacy DSNs
- [core] fix: correct sampleRate behaviour
- [core] misc: Warn user when beforeSend doesnt return an event or null
- [core] ref: Check for node-env first and return more accurate global object
- [core] ref: Remove Repo interface and repos attribute from Event
- [core] ref: Rewrite RequestBuffer using Array instead of Set for IE10/11
- [hub] fix: Scope level overwrites level on the event
- [hub] fix: Correctly store and retrieve Hub from domain when one is active
- [hub] fix: Copy over user data when cloning scope
- [node] feat: Allow requestHandler to be configured
- [node] feat: Allow pick any user attributes from requestHandler
- [node] feat: Make node transactions a pluggable integration with tests
- [node] feat: Transactions handling for RequestHandler in Express/Hapi
- [node] fix: Dont wrap native modules more than once to prevent leaks
- [node] fix: Add the same protocol as dsn to base transport option
- [node] fix: Use getCurrentHub to retrieve correct hub in requestHandler
- [utils] ref: implemented includes, assign and isNaN polyfills

## 4.0.6

- [browser] fix: Fallback to Error object when rejection `reason` is not available
- [browser] feat: Support Bluebird's `detail.reason` for promise rejections
- [types] fix: Use correct type for event's repos attribute

## 4.0.5

- [browser] ref: Expose `ReportDialogOptions`
- [browser] ref: Use better default message for ReportingObserver
- [browser] feat: Capture wrapped function arguments as extra
- [browser] ref: Unify integrations options and set proper defaults
- [browser] fix: Array.from is not available in old mobile browsers
- [browser] fix: Check for anonymous function before getting its name for mechanism
- [browser] test: Add loader + integration tests
- [core] ref: Move SDKInformation integration into core prepareEvent method
- [core] ref: Move debug initialization as the first step
- [node] fix: Make handlers types compatibile with Express
- [utils] fix: Dont break when non-string is passed to truncate
- [hub] feat: Add `run` function that makes `this` hub the current global one

## 4.0.4

- [browser] feat: Add `forceLoad` and `onLoad` function to be compatible with loader API

## 4.0.3

- [browser] feat: Better dedupe integration event description
- [core] ref: Move Dedupe, FunctionString, InboundFilters and SdkInformation integrations to the core package
- [core] feat: Provide correct platform and make a place to override event internals
- [browser] feat: UserAgent integration

## 4.0.2

- [browser] fix: Dont filter captured messages when they have no stacktraces

## 4.0.1

- [browser] feat: Show dropped event url in `blacklistUrl`/`whitelistUrl` debug mode
- [browser] feat: Use better event description instead of `event_id` for user-facing logs
- [core] ref: Create common integrations that are exposed on `@sentry/core` and reexposed through `browser`/`node`
- [core] feat: Debug integration
- [browser] ref: Port TraceKit to TypeScript and disable TraceKit's remote fetching for now

## 4.0.0

This is the release of our new SDKs, `@sentry/browser`, `@sentry/node`. While there are too many changes to list for
this release, we will keep a consistent changelog for upcoming new releases. `raven-js` (our legacy JavaScript/Browser
SDK) and `raven` (our legacy Node.js SDK) will still reside in this repo, but they will receive their own changelog.

We generally guide people to use our new SDKs from this point onward. The migration should be straightforward if you
were only using the basic features of our previous SDKs.

`raven-js` and `raven` will both still receive bugfixes but all the new features implemented will only work in the new
SDKs. The new SDKs are completely written in TypeScript, which means all functions, classes and properties are typed.

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

### Migration

Here are some examples of how the new SDKs work. Please note that the API for all JavaScript SDKs is the same.

#### Installation

_Old_:

```js
Raven.config('___PUBLIC_DSN___', {
  release: '1.3.0',
}).install();
```

_New_:

```js
Sentry.init({
  dsn: '___PUBLIC_DSN___',
  release: '1.3.0',
});
```

#### Set a global tag

_Old_:

```js
Raven.setTagsContext({ key: 'value' });
```

_New_:

```js
Sentry.configureScope((scope) => {
  scope.setTag('key', 'value');
});
```

#### Capture custom exception

_Old_:

```js
try {
  throwingFunction();
} catch (e) {
  Raven.captureException(e, { extra: { debug: false } });
}
```

_New_:

```js
try {
  throwingFunction();
} catch (e) {
  Sentry.withScope((scope) => {
    scope.setExtra('debug', false);
    Sentry.captureException(e);
  });
}
```

#### Capture a message

_Old_:

```js
Raven.captureMessage('test', 'info', { extra: { debug: false } });
```

_New_:

```js
Sentry.withScope((scope) => {
  scope.setExtra('debug', false);
  Sentry.captureMessage('test', 'info');
});
```

#### Breadcrumbs

_Old_:

```js
Raven.captureBreadcrumb({
  message: 'Item added to shopping cart',
  category: 'action',
  data: {
    isbn: '978-1617290541',
    cartSize: '3',
  },
});
```

_New_:

```js
Sentry.addBreadcrumb({
  message: 'Item added to shopping cart',
  category: 'action',
  data: {
    isbn: '978-1617290541',
    cartSize: '3',
  },
});
```
