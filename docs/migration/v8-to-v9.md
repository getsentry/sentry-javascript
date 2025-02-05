# Upgrading from 8.x to 9.x

Version 9 of the Sentry JavaScript SDK concerns API cleanup and version support changes.
This update contains behavioral changes that will not be caught by type checkers, linters or tests, so we recommend carefully reading through the entire migration guide instead of purely relying on automatic tooling.

`v9` of the SDK is compatible with Sentry self-hosted versions 24.4.2 or higher (unchanged from v8).
Lower versions may continue to work, but may not support all features.

## 1. Version Support Changes:

Version 9 of the Sentry SDK has new compatibility ranges for runtimes and frameworks.

### General Runtime Support Changes

**ECMAScript Version:** All the JavaScript code in the Sentry SDK packages may now contain ECMAScript 2020 features.
This includes features like Nullish Coalescing (`??`), Optional Chaining (`?.`), `String.matchAll()`, Logical Assignment Operators (`&&=`, `||=`, `??=`), and `Promise.allSettled()`.

If you observe failures due to syntax or features listed above, it may indicate that your current runtime does not support ES2020.
If your runtime does not support ES2020, we recommend transpiling the SDK using Babel or similar tooling.

**Node.js:** The minimum supported Node.js version is **18.0.0**, except for ESM-only SDKs (`@sentry/astro`, `@sentry/nuxt`, `@sentry/sveltekit`) which require Node.js version **18.19.1** or higher.

**Browsers:** Due to SDK code now including ES2020 features, the minimum supported browser list now looks as follows:

- Chrome 80
- Edge 80
- Safari 14, iOS Safari 14.4
- Firefox 74
- Opera 67
- Samsung Internet 13.0

If you need to support older browsers, we recommend transpiling your code using SWC, Babel or similar tooling.

**Deno:** The minimum supported Deno version is now **2.0.0**.

### Framework and Library Support Changes

Support for the following frameworks and library versions are dropped:

- **Remix**: Version `1.x`
- **TanStack Router**: Version `1.63.0` and lower (relevant when using `tanstackRouterBrowserTracingIntegration`)
- **SvelteKit**: Version `1.x`
- **Ember.js**: Version `3.x` and lower (minimum supported version is `4.x`)
- **Prisma**: Version `5.x`

### TypeScript Version Policy

In preparation for v2 of the OpenTelemetry SDK, which will raise the minimum required TypeScript version, the minimum required TypeScript version is increased to version `5.0.4`.

Additionally, like the OpenTelemetry SDK, the Sentry JavaScript SDK will follow [DefinitelyType's version support policy](https://github.com/DefinitelyTyped/DefinitelyTyped#support-window) which has a support time frame of 2 years for any released version of TypeScript.

Older Typescript versions _may_ continue to be compatible, but no guarantees apply.

## 2. Behavior Changes

### `@sentry/core` / All SDKs

- Passing `undefined` as a `tracesSampleRate` option value will now be treated the same as if the option was not defined at all.
  In previous versions, it was checked whether `tracesSampleRate` or `traceSampler` are _defined_ at all, in `Sentry.init()` to determine whether tracing should be enabled.
  Passing `undefined` to `tracesSampleRate` previously would enable tracing without the performance monitoring aspect (=tracing being enabled, though no spans would be started).
  If you want to preserve having tracing enabled without creating spans, set `tracesSampleRate: 0`:

  ```diff
  Sentry.init({
  -  tracesSampleRate: undefined,
  +  tracesSampleRate: 0,
  });
  ```

- Dropping spans in the `beforeSendSpan` hook is no longer possible.
  This means you can no longer return `null` from the `beforeSendSpan` hook.
  This hook is intended to be used to add additional data to spans or remove unwanted attributes (for example for PII stripping).
  To control which spans are recorded, we recommend configuring [integrations](https://docs.sentry.io/platforms/javascript/configuration/integrations/) instead.

- The `beforeSendSpan` hook now receives the root span as well as the child spans.
  We recommend checking your `beforeSendSpan` to account for this change.

- If you use the optional `captureConsoleIntegration` and set `attachStackTrace: true` in your `Sentry.init` call, console messages will no longer be marked as unhandled (i.e. `handled: false`) but as handled (i.e. `handled: true`).
  If you want to keep sending them as unhandled, configure the `handled` option when adding the integration:

  ```js
  Sentry.init({
    integrations: [Sentry.captureConsoleIntegration({ handled: false })],
    attachStackTrace: true,
  });
  ```

- The `request` property on the `samplingContext` argument passed to the `tracesSampler` and `profilesSampler` options has been removed.
  `samplingContext.normalizedRequest` can be used instead.
  Note that the type of `normalizedRequest` differs from `request`.

- The `startSpan` behavior was changed if you pass a custom `scope`:
  While in v8, the passed scope was set active directly on the passed scope, in v9, the scope is cloned. This behavior change does not apply to `@sentry/node` where the scope was already cloned.
  This change was made to ensure that the span only remains active within the callback and to align behavior between `@sentry/node` and all other SDKs.
  As a result of the change, span hierarchy should be more accurate.
  However, modifying the scope (e.g. set tags) within the `startSpan` callback behaves a bit differently now.

  ```js
  startSpan({ name: 'example', scope: customScope }, () => {
    getCurrentScope().setTag('tag-a', 'a'); // this tag will only remain within the callback
    // set the tag directly on customScope in addition, if you want to to persist the tag outside of the callback
    customScope.setTag('tag-a', 'a');
  });
  ```

### `@sentry/node`

- The `tracesSampler` hook will no longer be called for _every_ span.
  Root spans may however have incoming trace data from a different service, for example when using distributed tracing.

- The `requestDataIntegration` will no longer automatically set the user from `request.user` when `express` is used.
  Starting in v9, you'll need to manually call `Sentry.setUser()` e.g. in a middleware to set the user on Sentry events.

- The `processThreadBreadcrumbIntegration` was renamed to `childProcessIntegration`.

- The `childProcessIntegration`'s (previously `processThreadBreadcrumbIntegration`) `name` value has been changed from `"ProcessAndThreadBreadcrumbs"` to `"ChildProcess"`.
  Any filtering logic for registered integrations should be updated to account for the changed name.

- The Prisma integration no longer supports Prisma v5 and supports Prisma v6 by default. As per Prisma v6, the `previewFeatures = ["tracing"]` client generator option in your Prisma Schema is no longer required to use tracing with the Prisma integration.

  For performance instrumentation using other/older Prisma versions:

  1. Install the `@prisma/instrumentation` package with the desired version.
  1. Pass a `new PrismaInstrumentation()` instance as exported from `@prisma/instrumentation` to the `prismaInstrumentation` option of this integration:

     ```js
     import { PrismaInstrumentation } from '@prisma/instrumentation';
     Sentry.init({
       integrations: [
         prismaIntegration({
           // Override the default instrumentation that Sentry uses
           prismaInstrumentation: new PrismaInstrumentation(),
         }),
       ],
     });
     ```

     The passed instrumentation instance will override the default instrumentation instance the integration would use, while the `prismaIntegration` will still ensure data compatibility for the various Prisma versions.

  1. Depending on your Prisma version (prior to Prisma version 6), add `previewFeatures = ["tracing"]` to the client generator block of your Prisma schema:

     ```
     generator client {
       provider = "prisma-client-js"
       previewFeatures = ["tracing"]
     }
     ```

- When `skipOpenTelemetrySetup: true` is configured, `httpIntegration({ spans: false })` will be configured by default.
  You no longer have to specify this manually.
  With this change, no spans are emitted once `skipOpenTelemetrySetup: true` is configured, without any further configuration being needed.

### `@sentry/browser`

- The SDK no longer instructs the Sentry backend to automatically infer IP addresses by default.
  This means that places where you previously saw IP addresses in Sentry may now be grouped to anonymous users.
  Set the `sendDefaultPii` option in `Sentry.init()` to true to instruct the Sentry backend to infer IP addresses.

### `@sentry/nextjs`

- By default, client-side source maps will now be automatically deleted after being uploaded to Sentry during the build.
  You can opt out of this behavior by explicitly setting `sourcemaps.deleteSourcemapsAfterUpload` to `false` in your Sentry config.

- The Sentry Next.js SDK will no longer use the Next.js Build ID as fallback identifier for releases.
  The SDK will continue to attempt to read CI-provider-specific environment variables and the current git SHA to automatically determine a release name.
  If you examine that you no longer see releases created in Sentry, it is recommended to manually provide a release name to `withSentryConfig` via the `release.name` option.

  This behavior was changed because the Next.js Build ID is non-deterministic, causing build artifacts to be non-deterministic, because the release name is injected into client bundles.

- Source maps are now automatically enabled for both client and server builds unless explicitly disabled via `sourcemaps.disable`.
  Client builds use `hidden-source-map` while server builds use `source-map` as their webpack `devtool` setting unless any other value than `false` or `undefined` has been assigned already.

- The `sentry` property on the Next.js config object has officially been discontinued.
  Pass options to `withSentryConfig` directly.

### All Meta-Framework SDKs (`@sentry/astro`, `@sentry/nextjs`, `@sentry/nuxt`, `@sentry/sveltekit`, `@sentry/solidstart`)

- SDKs no longer transform user-provided values for source map generation in build configurations (like Vite config, Rollup config, or `next.config.js`).

  If source maps are explicitly disabled, the SDK will not enable them. If source maps are explicitly enabled, the SDK will not change how they are emitted. **However,** the SDK will also _not_ delete source maps after uploading them. If source map generation is not configured, the SDK will turn it on and delete them after the upload.

  To customize which files are deleted after upload, define the `filesToDeleteAfterUpload` array with globs.

### `@sentry/react`

- The `componentStack` field in the `ErrorBoundary` component is now typed as `string` instead of `string | null | undefined` for the `onError` and `onReset` lifecycle methods. This more closely matches the actual behavior of React, which always returns a `string` whenever a component stack is available.

  In the `onUnmount` lifecycle method, the `componentStack` field is now typed as `string | null`. The `componentStack` is `null` when no error has been thrown at time of unmount.

## 3. Package Removals

The `@sentry/utils` package will no longer be published.

The `@sentry/types` package will continue to be published, however, it is deprecated and its API will not be extended.
It will not be published as part of future major versions.

All exports and APIs of `@sentry/utils` and `@sentry/types` (except for the ones that are explicitly called out in this migration guide to be removed) have been moved into the `@sentry/core` package.

## 4. Removed APIs

### `@sentry/core` / All SDKs

- **The metrics API has been removed from the SDK.**

  The Sentry metrics beta has ended and the metrics API has been removed from the SDK. Learn more in the Sentry [help center docs](https://sentry.zendesk.com/hc/en-us/articles/26369339769883-Metrics-Beta-Ended-on-October-7th).

- The `enableTracing` option was removed.
  Instead, set `tracesSampleRate: 1` or `tracesSampleRate: 0`.

- The `autoSessionTracking` option was removed.

  To enable session tracking, ensure that either, in browser environments the `browserSessionIntegration` is added, or in server environments the `httpIntegration` is added. (both are added by default)

  To disable session tracking, remove the `browserSessionIntegration` in browser environments, or in server environments configure the `httpIntegration` with the `trackIncomingRequestsAsSessions` option set to `false`.
  Additionally, in Node.js environments, a session was automatically created for every node process when `autoSessionTracking` was set to `true`. This behavior has been replaced by the `processSessionIntegration` which is configured by default.

- The `getCurrentHub()`, `Hub` and `getCurrentHubShim()` APIs have been removed. They were on compatibility life support since the release of v8 and have now been fully removed from the SDK.

- The `addOpenTelemetryInstrumentation` method has been removed. Use the `openTelemetryInstrumentations` option in `Sentry.init()` or your custom Sentry Client instead.

  ```js
  import * as Sentry from '@sentry/node';

  // before
  Sentry.addOpenTelemetryInstrumentation(new GenericPoolInstrumentation());

  // after
  Sentry.init({
    openTelemetryInstrumentations: [new GenericPoolInstrumentation()],
  });
  ```

- The `transactionContext` property on the `samplingContext` argument passed to the `tracesSampler` and `profilesSampler` options has been removed. All object attributes are available in the top-level of `samplingContext`.

- The `debugIntegration` has been removed. To log outgoing events, use [Hook Options](https://docs.sentry.io/platforms/javascript/configuration/options/#hooks) (`beforeSend`, `beforeSendTransaction`, ...).

- The `sessionTimingIntegration` has been removed. To capture session durations alongside events, use [Context](https://docs.sentry.io/platforms/javascript/enriching-events/context/) (`Sentry.setContext()`).

### Server-side SDKs (`@sentry/node` and all dependents)

- The `addOpenTelemetryInstrumentation` method was removed.
  Use the `openTelemetryInstrumentations` option in `Sentry.init()` or your custom Sentry Client instead.

- `registerEsmLoaderHooks` now only accepts `true | false | undefined`.
  The SDK will default to wrapping modules that are used as part of OpenTelemetry Instrumentation.

- The `nestIntegration` was removed.
  Use the NestJS SDK (`@sentry/nestjs`) instead.

- The `setupNestErrorHandler` was removed.
  Use the NestJS SDK (`@sentry/nestjs`) instead.

### `@sentry/browser`

- The `captureUserFeedback` method has been removed. Use the `captureFeedback` method instead and update the `comments` field to `message`.

### `@sentry/nextjs`

- The `hideSourceMaps` option was removed without replacements.
  The SDK emits hidden sourcemaps by default.

### `@sentry/solidstart`

- The `sentrySolidStartVite` plugin is no longer exported. Instead, wrap the SolidStart config with `withSentry` and
  provide Sentry options as the second parameter.

  ```ts
  // app.config.ts
  import { defineConfig } from '@solidjs/start/config';
  import { withSentry } from '@sentry/solidstart';

  export default defineConfig(
    withSentry(
      {
        /* SolidStart config */
      },
      {
        /* Sentry build-time config (like project and org) */
      },
    ),
  );
  ```

### `@sentry/nestjs`

- Removed `@WithSentry` decorator.
  Use the `@SentryExceptionCaptured` decorator as a drop-in replacement.

- Removed `SentryService`.

  - If you are using `@sentry/nestjs` you can safely remove any references to the `SentryService`.
  - If you are using another package migrate to `@sentry/nestjs` and remove the `SentryService` afterward.

- Removed `SentryTracingInterceptor`.

  - If you are using `@sentry/nestjs` you can safely remove any references to the `SentryTracingInterceptor`.
  - If you are using another package migrate to `@sentry/nestjs` and remove the `SentryTracingInterceptor` afterward.

- Removed `SentryGlobalGenericFilter`.
  Use the `SentryGlobalFilter` as a drop-in replacement.

- Removed `SentryGlobalGraphQLFilter`.
  Use the `SentryGlobalFilter` as a drop-in replacement.

### `@sentry/react`

- The `wrapUseRoutes` method has been removed.
  Depending on what version of react router you are using, use the `wrapUseRoutesV6` or `wrapUseRoutesV7` methods instead.

- The `wrapCreateBrowserRouter` method has been removed.
  Depending on what version of react router you are using, use the `wrapCreateBrowserRouterV6` or `wrapCreateBrowserRouterV7` methods instead.

### `@sentry/vue`

- The options `tracingOptions`, `trackComponents`, `timeout`, `hooks` have been removed everywhere except in the `tracingOptions` option of `vueIntegration()`.

  These options should now be configured as follows:

  ```js
  import * as Sentry from '@sentry/vue';

  Sentry.init({
    integrations: [
      Sentry.vueIntegration({
        tracingOptions: {
          trackComponents: true,
          timeout: 1000,
          hooks: ['mount', 'update', 'unmount'],
        },
      }),
    ],
  });
  ```

- The option `logErrors` in the `vueIntegration` has been removed. The Sentry Vue error handler will always propagate the error to a user-defined error handler or re-throw the error (which will log the error without modifying).

### `@sentry/nuxt`

- The `tracingOptions` option in `Sentry.init()` was removed in favor of passing the `vueIntegration()` to `Sentry.init({ integrations: [...] })` and setting `tracingOptions` there.

### `@sentry/vue` and `@sentry/nuxt`

- When component tracking is enabled, "update" spans are no longer created by default.

  Add an `"update"` item to the `tracingOptions.hooks` option via the `vueIntegration()` to restore this behavior.

  ```ts
  Sentry.init({
    integrations: [
      Sentry.vueIntegration({
        tracingOptions: {
          trackComponents: true,
          hooks: [
            'mount',
            'update', // add this line to re-enable update spans
            'unmount',
          ],
        },
      }),
    ],
  });
  ```

### `@sentry/remix`

- The `autoInstrumentRemix` option was removed.
  The SDK now always behaves as if the option were set to `true`.

### `@sentry/sveltekit`

- The `fetchProxyScriptNonce` option in `sentryHandle()` was removed due to security concerns. If you previously specified this option for your CSP policy, specify a [script hash](https://docs.sentry.io/platforms/javascript/guides/sveltekit/manual-setup/#configure-csp-for-client-side-fetch-instrumentation) in your CSP config or [disable](https://docs.sentry.io/platforms/javascript/guides/sveltekit/manual-setup/#disable-client-side-fetch-proxy-script) the injection of the script entirely.

### `@sentry/core`

- A `sampleRand` field on `PropagationContext` is now required. This is relevant if you used `scope.setPropagationContext(...)`

- The `DEFAULT_USER_INCLUDES` constant has been removed. There is no replacement.

- The `BAGGAGE_HEADER_NAME` export has been removed. Use a `"baggage"` string constant directly instead.

- The `extractRequestData` method has been removed. Manually extract relevant data of request objects instead.

- The `addRequestDataToEvent` method has been removed. Use `httpRequestToRequestData` instead and put the resulting object directly on `event.request`.

- The `addNormalizedRequestDataToEvent` method has been removed. Use `httpRequestToRequestData` instead and put the resulting object directly on `event.request`.

- The `generatePropagationContext()` method was removed.
  Use `generateTraceId()` directly.

- The `spanId` field on `propagationContext` was removed.
  It was replaced with an **optional** field `propagationSpanId` having the same semantics but only being defined when a unit of execution should be associated with a particular span ID.

- The `initSessionFlusher` method on the `ServerRuntimeClient` was removed without replacements.
  Any mechanisms creating sessions will flush themselves.

- The `IntegrationClass` type was removed.
  Instead, use `Integration` or `IntegrationFn`.

- The following exports have been removed without replacement:

  - `getNumberOfUrlSegments`
  - `validSeverityLevels`
  - `makeFifoCache`
  - `arrayify`
  - `flatten`
  - `urlEncode`
  - `getDomElement`
  - `memoBuilder`
  - `extractPathForTransaction`
  - `_browserPerformanceTimeOriginMode`
  - `addTracingHeadersToFetchRequest`
  - `SessionFlusher`

- The following types have been removed without replacement:

  - `Request`
    `RequestEventData`
  - `TransactionNamingScheme`
  - `RequestDataIntegrationOptions`
  - `SessionFlusherLike`
  - `RequestSession`
  - `RequestSessionStatus`

### `@sentry/opentelemetry`

- Removed `getPropagationContextFromSpan` without replacement.
- Removed `generateSpanContextForPropagationContext` without replacement.

#### Other/Internal Changes

The following changes are unlikely to affect users of the SDK. They are listed here only for completion sake, and to alert users that may be relying on internal behavior.

- `client._prepareEvent()` now requires both `currentScope` and `isolationScope` to be passed as arguments.
- `client.recordDroppedEvent()` no longer accepts an `event` as third argument.
  The event was no longer used for some time, instead you can (optionally) pass a count of dropped events as third argument.

## 5. Build Changes

- The CJS code for the SDK now only contains compatibility statements for CJS/ESM in modules that have default exports:

  ```js
  Object.defineProperty(exports, '__esModule', { value: true });
  ```

  Let us know if this is causing issues in your setup by opening an issue on GitHub.

- `@sentry/deno` is no longer published on the `deno.land` registry so you'll need to import the SDK from npm:

  ```javascript
  import * as Sentry from 'npm:@sentry/deno';

  Sentry.init({
    dsn: '__DSN__',
    // ...
  });
  ```

## 6. Type Changes

- `Scope` usages now always expect `Scope` instances

- `Client` usages now always expect `BaseClient` instances.
  The abstract `Client` class was removed.
  Client classes now have to extend from `BaseClient`.

These changes should not affect most users unless you relied on passing things with a similar shape to internal methods.

In v8, interfaces have been exported from `@sentry/types`, while implementations have been exported from other packages.

# No Version Support Timeline

Version support timelines are stressful for everybody using the SDK, so we won't be defining one.
Instead, we will be applying bug fixes and features to older versions as long as there is demand.

Additionally, we hold ourselves accountable to any security issues, meaning that if any vulnerabilities are found, we will in almost all cases backport them.

Note, that it is decided on a case-per-case basis, what gets backported or not.
If you need a fix or feature in a previous version of the SDK, please reach out via a GitHub Issue.
