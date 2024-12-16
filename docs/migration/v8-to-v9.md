# Upgrading from 8.x to 9.x

**DISCLAIMER: THIS MIGRATION GUIDE IS WORK IN PROGRESS**

Version 9 of the Sentry SDK concerns itself with API cleanup and compatibility updates.
This update contains behavioral changes that will not be caught by TypeScript or linters, so we recommend carefully reading the section on [Behavioral Changes](#2-behavior-changes).

Before updating to version `9.x` of the SDK, we recommend upgrading to the latest version of `8.x`.
You can then go through the [Deprecations in 8.x](#deprecations-in-8x) and remove and migrate usages of deprecated APIs in your code before upgrading to `9.x`.

Version 9 of the JavaScript SDK is compatible with Sentry self-hosted versions 24.4.2 or higher (unchanged from last major).
Lower versions may continue to work, but may not support all features.

## 1. Version Support Changes:

Version 9 of the Sentry SDK has new compatibility ranges for runtimes and frameworks.
We periodically update the compatibility ranges in major versions to increase reliability and quality of APIs and instrumentation data.

### General Runtime Support Changes

**ECMAScript Version:** All of the JavaScript code in the Sentry SDK packages may now contain ECMAScript 2020 features.
This includes features like Nullish Coalescing (`??`), Optional Chaining (`?.`), `String.matchAll()`, Logical Assignment Operators (`&&=`, `||=`, `??=`), and `Promise.allSettled()`.

If you observe failures due to syntax or features listed above, it may be an indicator that your current runtime does not support ES2020.
If your runtime does not support ES2020, we recommend transpiling the SDK using Babel or similar tooling.

**Node.js:** The minimum supported Node.js versions are TBD, TBD, and TBD.
We no longer test against Node TBD, TBD, or TBD and cannot guarantee that the SDK will work as expected on these versions.

**Browsers:** Due to SDK code now including ES2020 features, the minimum supported browser list now looks as follows:

- Chrome 80
- Edge 80
- Safari 14, iOS Safari 14.4
- Firefox 74
- Opera 67
- Samsung Internet 13.0

If you need to support older browsers, we recommend transpiling your code using Babel or similar tooling.

### Framework Support Changes

Support for the following Framework versions is dropped:

- **Remix**: Version `1.x`
- **TanStack Router**: Version `1.63.0` and lower
- **SvelteKit**: SvelteKit version `1.x`
- **Ember.js**: Ember.js version `3.x` and lower

### TypeScript Version Policy

In preparation for the OpenTelemetry SDK v2, which will raise the minimum required TypeScript version, the minimum required TypeScript version is increased to version `5.0.4` (TBD https://github.com/open-telemetry/opentelemetry-js/pull/5145).

Additionally, like the OpenTelemetry SDK, the Sentry JavaScript SDK will follow [DefinitelyType's version support policy](https://github.com/DefinitelyTyped/DefinitelyTyped#support-window) which has a support time frame of 2 years for any released version of TypeScript.

## 2. Behavior Changes

### `@sentry/core` / All SDKs

- If you use the optional `captureConsoleIntegration` and set `attachStackTrace: true` in your `Sentry.init` call, console messages will no longer be marked as unhandled (i.e. `handled: false`) but as handled (i.e. `handled: true`). If you want to keep sending them as unhandled, configure the `handled` option when adding the integration:

```js
Sentry.init({
  integrations: [Sentry.captureConsoleIntegration({ handled: false })],
  attachStackTrace: true,
});
```

### `@sentry/node`

- When `skipOpenTelemetrySetup: true` is configured, `httpIntegration({ spans: false })` will be configured by default. This means that you no longer have to specify this yourself in this scenario. With this change, no spans are emitted once `skipOpenTelemetrySetup: true` is configured, without any further configuration being needed.

### Uncategorized (TODO)

TODO

## 3. Package Removals

As part of an architectural cleanup we deprecated the following packages:

- `@sentry/utils`
- `@sentry/types`

All of these packages exports and APIs have been moved into the `@sentry/core` package.

The `@sentry/utils` package will no longer be published.

The `@sentry/types` package will continue to be published but it is deprecated and we don't plan on extending its APi.
You may experience slight compatibility issues in the future by using it.
We decided to keep this package around to temporarily lessen the upgrade burden.
It will be removed in a future major version.

## 4. Removal of Deprecated APIs (TODO)

TODO

## 5. Build Changes

Previously the CJS versions of the SDK code (wrongfully) contained compatibility statements for default exports in ESM:

```js
Object.defineProperty(exports, '__esModule', { value: true });
```

The SDK no longer contains these statements.
Let us know if this is causing issues in your setup by opening an issue on GitHub.

## 6. Type Changes

In v8, types have been exported from `@sentry/types`, while implementations have been exported from other classes.
This lead to some duplication, where we had to keep an interface in `@sentry/types`, while the implementation mirroring that interface was kept e.g. in `@sentry/core`.
Since in v9 the types have been merged into `@sentry/core`, we can get rid of some of this duplication. This means that certain things that used to be a separate interface, will not expect an actual instance of the class/concrete implementation. This should not affect most users, unless you relied on passing things with a similar shape to internal methods. The following types are affected:

- `Scope` now always expects the `Scope` class

# No Version Support Timeline

Version support timelines are stressful for anybody using the SDK, so we won't be defining one.
Instead, we will be applying bug fixes and features to older versions as long as there is demand for them.
We also hold ourselves to high standards security-wise, meaning that if any vulnerabilities are found, we will in almost all cases backport them.

Note, that we will decide on a case-per-case basis, what gets backported or not.
If you need a fix or feature in a previous version of the SDK, feel free to reach out via a GitHub issue.

# Deprecations in 8.x

The following outlines deprecations that were introduced in version 8 of the SDK.

## General

- **Returning `null` from `beforeSendSpan` span is deprecated.**
- **Passing `undefined` to `tracesSampleRate` / `tracesSampler` / `enableTracing` will be handled differently in v9**

  In v8, a setup like the following:

  ```ts
  Sentry.init({
    tracesSampleRate: undefined,
  });
  ```

  Will result in tracing being _enabled_, although no spans will be generated.
  In v9, we will streamline this behavior so that passing `undefined` will result in tracing being disabled, the same as not passing the option at all.
  If you are relying on `undefined` being passed in and having tracing enabled because of this, you should update your config to set e.g. `tracesSampleRate: 0` instead, which will also enable tracing in v9.

- **The `autoSessionTracking` option is deprecated.**

  To enable session tracking, it is recommended to unset `autoSessionTracking` and ensure that either, in browser environments the `browserSessionIntegration` is added, or in server environments the `httpIntegration` is added.
  To disable session tracking, it is recommended unset `autoSessionTracking` and to remove the `browserSessionIntegration` in browser environments, or in server environments configure the `httpIntegration` with the `trackIncomingRequestsAsSessions` option set to `false`.

## `@sentry/utils`

- **The `@sentry/utils` package has been deprecated. Import everything from `@sentry/core` instead.**

- Deprecated `AddRequestDataToEventOptions.transaction`. This option effectively doesn't do anything anymore, and will
  be removed in v9.
- Deprecated `TransactionNamingScheme` type.
- Deprecated `validSeverityLevels`. Will not be replaced.
- Deprecated `urlEncode`. No replacements.
- Deprecated `addRequestDataToEvent`. Use `addNormalizedRequestDataToEvent` instead.
- Deprecated `extractRequestData`. Instead manually extract relevant data off request.
- Deprecated `arrayify`. No replacements.
- Deprecated `memoBuilder`. No replacements.
- Deprecated `getNumberOfUrlSegments`. No replacements.
- Deprecated `BAGGAGE_HEADER_NAME`. No replacements.
- Deprecated `makeFifoCache`. No replacements.
- Deprecated `dynamicRequire`. No replacements.
- Deprecated `flatten`. No replacements.
- Deprecated `_browserPerformanceTimeOriginMode`. No replacements.

## `@sentry/core`

- Deprecated `transactionNamingScheme` option in `requestDataIntegration`.
- Deprecated `debugIntegration`. To log outgoing events, use [Hook Options](https://docs.sentry.io/platforms/javascript/configuration/options/#hooks) (`beforeSend`, `beforeSendTransaction`, ...).
- Deprecated `sessionTimingIntegration`. To capture session durations alongside events, use [Context](https://docs.sentry.io/platforms/javascript/enriching-events/context/) (`Sentry.setContext()`).
- Deprecated `addTracingHeadersToFetchRequest` method - this was only meant for internal use and is not needed anymore.
- Deprecated `generatePropagationContext()` in favor of using `generateTraceId()` directly.
- Deprecated `spanId` field on `propagationContext` - this field will be removed in v9, and should neither be read or set anymore.
- Deprecated `RequestSession` type. No replacements.
- Deprecated `RequestSessionStatus` type. No replacements.
- Deprecated `SessionFlusherLike` type. No replacements.
- Deprecated `SessionFlusher`. No replacements.

## `@sentry/nestjs`

- Deprecated `@WithSentry`. Use `@SentryExceptionCaptured` instead.
- Deprecated `SentryTracingInterceptor`.
  If you are using `@sentry/nestjs` you can safely remove any references to the `SentryTracingInterceptor`.
  If you are using another package migrate to `@sentry/nestjs` and remove the `SentryTracingInterceptor` afterwards.
- Deprecated `SentryService`.
  If you are using `@sentry/nestjs` you can safely remove any references to the `SentryService`.
  If you are using another package migrate to `@sentry/nestjs` and remove the `SentryService` afterwards.
- Deprecated `SentryGlobalGenericFilter`.
  Use the `SentryGlobalFilter` instead.
  The `SentryGlobalFilter` is a drop-in replacement.
- Deprecated `SentryGlobalGraphQLFilter`.
  Use the `SentryGlobalFilter` instead.
  The `SentryGlobalFilter` is a drop-in replacement.

## `@sentry/types`

- **The `@sentry/types` package has been deprecated. Import everything from `@sentry/core` instead.**

- Deprecated `Request` in favor of `RequestEventData`.
- Deprecated `RequestSession`. No replacements.
- Deprecated `RequestSessionStatus`. No replacements.
- Deprecated `SessionFlusherLike`. No replacements.

## `@sentry/nuxt`

- Deprecated `tracingOptions` in `Sentry.init()` in favor of passing the `vueIntegration()` to `Sentry.init({ integrations: [...] })` and setting `tracingOptions` there.

## `@sentry/vue`

- Deprecated `tracingOptions`, `trackComponents`, `timeout`, `hooks` options everywhere other than in the `tracingOptions` option of the `vueIntegration()`.
  These options should now be set as follows:

  ```ts
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

## `@sentry/nuxt` and `@sentry/vue`

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
            'update', // <--
            'unmount',
          ],
        },
      }),
    ],
  });
  ```

## `@sentry/astro`

- Deprecated passing `dsn`, `release`, `environment`, `sampleRate`, `tracesSampleRate`, `replaysSessionSampleRate` to the integration. Use the runtime-specific `Sentry.init()` calls for passing these options instead.

## `@sentry/remix`

- Deprecated `autoInstrumentRemix: false`. The next major version will default to behaving as if this option were `true` and the option itself will be removed.

## `@sentry/react`

- Deprecated `wrapUseRoutes`. Use `wrapUseRoutesV6` or `wrapUseRoutesV7` instead.
- Deprecated `wrapCreateBrowserRouter`. Use `wrapCreateBrowserRouterV6` or `wrapCreateBrowserRouterV7` instead.

## `@sentry/nextjs`

- Deprecated `hideSourceMaps`. No replacements. The SDK emits hidden sourcemaps by default.

## `@sentry/opentelemetry`

- Deprecated `generateSpanContextForPropagationContext` in favor of doing this manually - we do not need this export anymore.

## Server-side SDKs (`@sentry/node` and all dependents)

- Deprecated `processThreadBreadcrumbIntegration` in favor of `childProcessIntegration`. Functionally they are the same.
- Deprecated `nestIntegration`. Use the NestJS SDK (`@sentry/nestjs`) instead.
- Deprecated `setupNestErrorHandler`. Use the NestJS SDK (`@sentry/nestjs`) instead.
- Deprecated `addOpenTelemetryInstrumentation`. Use the `openTelemetryInstrumentations` option in `Sentry.init()` or your custom Sentry Client instead.
- Deprecated `registerEsmLoaderHooks.include` and `registerEsmLoaderHooks.exclude`. Set `onlyIncludeInstrumentedModules: true` instead.
- `registerEsmLoaderHooks` will only accept `true | false | undefined` in the future. The SDK will default to wrapping modules that are used as part of OpenTelemetry Instrumentation.
- `httpIntegration({ spans: false })` is configured by default if `skipOpenTelemetrySetup: true` is set. You can still overwrite this if desired.
