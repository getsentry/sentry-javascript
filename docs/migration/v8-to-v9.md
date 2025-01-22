# Upgrading from 8.x to 9.x

**DISCLAIMER: THIS MIGRATION GUIDE IS WORK IN PROGRESS**

Version 9 of the Sentry SDK concerns API cleanup and compatibility updates.
This update contains behavioral changes that will not be caught by TypeScript or linters, so we recommend carefully reading the section on [Behavioral Changes](#2-behavior-changes).

Before updating to version `9.x` of the SDK, we recommend upgrading to the latest version of `8.x`.
You can then go through the [Deprecations in 8.x](#deprecations-in-8x) and remove and migrate usages of deprecated APIs in your code before upgrading to `9.x`.

Version 9 of the JavaScript SDK is compatible with Sentry self-hosted versions 24.4.2 or higher (unchanged from last major).
Lower versions may continue to work, but may not support all features.

## 1. Version Support Changes:

Version 9 of the Sentry SDK has new compatibility ranges for runtimes and frameworks.
We periodically update the compatibility ranges in major versions to increase the reliability and quality of APIs and instrumentation data.

### General Runtime Support Changes

**ECMAScript Version:** All the JavaScript code in the Sentry SDK packages may now contain ECMAScript 2020 features.
This includes features like Nullish Coalescing (`??`), Optional Chaining (`?.`), `String.matchAll()`, Logical Assignment Operators (`&&=`, `||=`, `??=`), and `Promise.allSettled()`.

If you observe failures due to syntax or features listed above, it may indicate that your current runtime does not support ES2020.
If your runtime does not support ES2020, we recommend transpiling the SDK using Babel or similar tooling.

**Node.js:** The minimum supported Node.js version is **18.0.0**, except for ESM-only SDKs (nuxt, solidstart, astro) which require Node **18.19.1** or up.
We no longer test against Node 14 and Node 16 and cannot guarantee that the SDK will work as expected on these versions.

**Browsers:** Due to SDK code now including ES2020 features, the minimum supported browser list now looks as follows:

- Chrome 80
- Edge 80
- Safari 14, iOS Safari 14.4
- Firefox 74
- Opera 67
- Samsung Internet 13.0

If you need to support older browsers, we recommend transpiling your code using Babel or similar tooling.

**Deno:** The minimum supported Deno version is now **2.0.0**.

### Framework Support Changes

Support for the following Framework versions is dropped:

- **Remix**: Version `1.x`
- **TanStack Router**: Version `1.63.0` and lower (relevant when using `tanstackRouterBrowserTracingIntegration`)
- **SvelteKit**: SvelteKit version `1.x`
- **Ember.js**: Ember.js version `3.x` and lower (minimum supported version is `4.x`)

### TypeScript Version Policy

In preparation for the OpenTelemetry SDK v2, which will raise the minimum required TypeScript version, the minimum required TypeScript version is increased to version `5.0.4` (TBD https://github.com/open-telemetry/opentelemetry-js/pull/5145).

Additionally, like the OpenTelemetry SDK, the Sentry JavaScript SDK will follow [DefinitelyType's version support policy](https://github.com/DefinitelyTyped/DefinitelyTyped#support-window) which has a support time frame of 2 years for any released version of TypeScript.

Older Typescript versions _may_ still work, but we will not test them anymore and no more guarantees apply.

## 2. Behavior Changes

### `@sentry/core` / All SDKs

- If you use the optional `captureConsoleIntegration` and set `attachStackTrace: true` in your `Sentry.init` call, console messages will no longer be marked as unhandled (i.e. `handled: false`) but as handled (i.e. `handled: true`). If you want to keep sending them as unhandled, configure the `handled` option when adding the integration:

  ```js
  Sentry.init({
    integrations: [Sentry.captureConsoleIntegration({ handled: false })],
    attachStackTrace: true,
  });
  ```

- Dropping spans in the `beforeSendSpan` hook is no longer possible.
- The `beforeSendSpan` hook now receives the root span as well as the child spans.
- In previous versions, we determined if tracing is enabled (for Tracing Without Performance) by checking if either `tracesSampleRate` or `traceSampler` are _defined_ at all, in `Sentry.init()`. This means that e.g. the following config would lead to tracing without performance (=tracing being enabled, even if no spans would be started):

  ```js
  Sentry.init({
    tracesSampleRate: undefined,
  });
  ```

  In v9, an `undefined` value will be treated the same as if the value is not defined at all. You'll need to set `tracesSampleRate: 0` if you want to enable tracing without performance.

- The `getCurrentHub().getIntegration(IntegrationClass)` method will always return `null` in v9. This has already stopped working mostly in v8, because we stopped exposing integration classes. In v9, the fallback behavior has been removed. Note that this does not change the type signature and is thus not technically breaking, but still worth pointing out.

- The `startSpan` behavior was slightly changed if you pass a custom `scope` to the span start options: While in v8, the passed scope was set active directly on the passed scope, in v9, the scope is cloned. This behavior change does not apply to `@sentry/node` where the scope was already cloned. This change was made to ensure that the span only remains active within the callback and to align behavior between `@sentry/node` and all other SDKs. As a result of the change, your span hierarchy should be more accurate. However, be aware that modifying the scope (e.g. set tags) within the `startSpan` callback behaves a bit differently now.

  ```js
  startSpan({ name: 'example', scope: customScope }, () => {
    getCurrentScope().setTag('tag-a', 'a'); // this tag will only remain within the callback
    // set the tag directly on customScope in addition, if you want to to persist the tag outside of the callback
    customScope.setTag('tag-a', 'a');
  });
  ```

### `@sentry/node`

- When `skipOpenTelemetrySetup: true` is configured, `httpIntegration({ spans: false })` will be configured by default.

  This means that you no longer have to specify this yourself in this scenario. With this change, no spans are emitted once `skipOpenTelemetrySetup: true` is configured, without any further configuration being needed.

- The `requestDataIntegration` will no longer automatically set the user from `request.user`. This is an express-specific, undocumented behavior, and also conflicts with our privacy-by-default strategy. Starting in v9, you'll need to manually call `Sentry.setUser()` e.g. in a middleware to set the user on Sentry events.

- The `tracesSampler` hook will no longer be called for _every_ span. Instead, it will only be called for "root spans". Root spans are spans that have no local parent span. Root spans may however have incoming trace data from a different service, for example when using distributed tracing.

- The `childProcessIntegration`'s (previously `processThreadBreadcrumbIntegration`) `name` value has been changed from `"ProcessAndThreadBreadcrumbs"` to `"ChildProcess"`. This is relevant if you were filtering integrations by name.

### `@sentry/browser`

- The SDK no longer instructs the Sentry backend to automatically infer IP addresses by default. This means that places where you previously saw IP addresses in Sentry may now be grouped to anonymous users. Set the `sendDefaultPii` option in `Sentry.init()` to true to instruct the Sentry backend to infer IP addresses.
- The `captureUserFeedback` method has been removed. Use the `captureFeedback` method instead and update the `comments` field to `message`.

### `@sentry/nextjs`

- The Sentry Next.js SDK will no longer use the Next.js Build ID as fallback identifier for releases. The SDK will continue to attempt to read CI-provider-specific environment variables and the current git SHA to automatically determine a release name. If you examine that you no longer see releases created in Sentry, it is recommended to manually provide a release name to `withSentryConfig` via the `release.name` option.

  This behavior was changed because the Next.js Build ID is non-deterministic and the release name is injected into client bundles, causing build artifacts to be non-deterministic. This caused issues for some users. Additionally, because it is uncertain whether it will be possible to rely on a Build ID when Turbopack becomes stable, we decided to pull the plug now instead of introducing confusing behavior in the future.

- Source maps are now automatically enabled for both client and server builds unless explicitly disabled via `sourcemaps.disable`. Client builds use `hidden-source-map` while server builds use `source-map` as their webpack `devtool` setting unless any other value than `false` or `undefined` has been assigned already.

- By default, source maps will now be automatically deleted after being uploaded to Sentry for client-side builds. You can opt out of this behavior by explicitly setting `sourcemaps.deleteSourcemapsAfterUpload` to `false` in your Sentry config.

- The `sentry` property on the Next.js config object has officially been discontinued. Pass options to `withSentryConfig` directly.

### All Meta-Framework SDKs (`@sentry/astro`, `@sentry/nuxt`, `@sentry/solidstart`)

- Updated source map generation to respect the user-provided value of your build config, such as `vite.build.sourcemap`:

  - Explicitly disabled (false): Emit warning, no source map upload.
  - Explicitly enabled (true, 'hidden', 'inline'): No changes, source maps are uploaded and not automatically deleted.
  - Unset: Enable 'hidden', delete `.map` files after uploading them to Sentry.

  To customize which files are deleted after upload, define the `filesToDeleteAfterUpload` array with globs.

### `@sentry/react`

The `componentStack` field in the `ErrorBoundary` component is now typed as `string` instead of `string | null | undefined` for the `onError` and `onReset` lifecycle methods. This more closely matches the actual behavior of React, which always returns a `string` whenever a component stack is available.

In the `onUnmount` lifecycle method, the `componentStack` field is now typed as `string | null`. The `componentStack` is `null` when no error has been thrown at time of unmount.

### Uncategorized (TODO)

TODO

## 3. Package Removals

As part of an architectural cleanup, we deprecated the following packages:

- `@sentry/utils`
- `@sentry/types`

All of these packages exports and APIs have been moved into the `@sentry/core` package.

The `@sentry/utils` package will no longer be published.

The `@sentry/types` package will continue to be published but it is deprecated and we don't plan on extending its API.
You may experience slight compatibility issues in the future by using it.
We decided to keep this package around to temporarily lessen the upgrade burden.
It will be removed in a future major version.

## 4. Removal of Deprecated APIs (TODO)

### `@sentry/core` / All SDKs

- The `debugIntegration` has been removed. To log outgoing events, use [Hook Options](https://docs.sentry.io/platforms/javascript/configuration/options/#hooks) (`beforeSend`, `beforeSendTransaction`, ...).
- The `sessionTimingIntegration` has been removed. To capture session durations alongside events, use [Context](https://docs.sentry.io/platforms/javascript/enriching-events/context/) (`Sentry.setContext()`).
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

- The `DEFAULT_USER_INCLUDES` constant has been removed.
- The `getCurrentHub()`, `Hub` and `getCurrentHubShim()` APIs have been removed. They were on compatibility life support since the release of v9 and have now been fully removed from the SDK.

### `@sentry/browser`

- The `captureUserFeedback` method has been removed. Use the `captureFeedback` method instead and update the `comments` field to `message`.

### `@sentry/core`

- The `getNumberOfUrlSegments` method has been removed. There is no replacement.
- The `validSeverityLevels` export has been removed. There is no replacement.
- The `makeFifoCache` method has been removed. There is no replacement.
- The `arrayify` export has been removed. There is no replacement.
- The `BAGGAGE_HEADER_NAME` export has been removed. Use the `"baggage"` string constant directly instead.
- The `flatten` export has been removed. There is no replacement.
- The `urlEncode` method has been removed. There is no replacement.
- The `getDomElement` method has been removed. There is no replacement.
- The `memoBuilder` method has been removed. There is no replacement.
- The `extractRequestData` method has been removed. Manually extract relevant data off request instead.
- The `addRequestDataToEvent` method has been removed. Use `httpRequestToRequestData` instead and put the resulting object directly on `event.request`.
- The `extractPathForTransaction` method has been removed. There is no replacement.
- The `addNormalizedRequestDataToEvent` method has been removed. Use `httpRequestToRequestData` instead and put the resulting object directly on `event.request`.
- A `sampleRand` field on `PropagationContext` is now required. This is relevant if you used `scope.setPropagationContext(...)`

#### Other/Internal Changes

The following changes are unlikely to affect users of the SDK. They are listed here only for completion sake, and to alert users that may be relying on internal behavior.

- `client._prepareEvent()` now requires a currentScope & isolationScope to be passed as last arugments
- `client.recordDroppedEvent()` no longer accepts an `event` as third argument. The event was no longer used for some time, instead you can (optionally) pass a count of dropped events as third argument.

### `@sentry/nestjs`

- Removed `WithSentry` decorator. Use the `SentryExceptionCaptured` decorator instead.
- Removed `SentryService`.
  - If you are using `@sentry/nestjs` you can safely remove any references to the `SentryService`.
  - If you are using another package migrate to `@sentry/nestjs` and remove the `SentryService` afterward.
- Removed `SentryTracingInterceptor`.
  - If you are using `@sentry/nestjs` you can safely remove any references to the `SentryTracingInterceptor`.
  - If you are using another package migrate to `@sentry/nestjs` and remove the `SentryTracingInterceptor` afterward.
- Removed `SentryGlobalGenericFilter`.
  - Use the `SentryGlobalFilter` instead.
  - The `SentryGlobalFilter` is a drop-in replacement.
- Removed `SentryGlobalGraphQLFilter`.
  - Use the `SentryGlobalFilter` instead.
  - The `SentryGlobalFilter` is a drop-in replacement.

### `@sentry/react`

- The `wrapUseRoutes` method has been removed. Use the `wrapUseRoutesV6` or `wrapUseRoutesV7` methods instead depending on what version of react router you are using.
- The `wrapCreateBrowserRouter` method has been removed. Use the `wrapCreateBrowserRouterV6` or `wrapCreateBrowserRouterV7` methods depending on what version of react router you are using.

## `@sentry/vue`

- The options `tracingOptions`, `trackComponents`, `timeout`, `hooks` have been removed everywhere except in the `tracingOptions` option of `vueIntegration()`.

  These options should now be set as follows:

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

- The option `logErrors` in the `vueIntegration` has been removed. The Sentry Vue error handler will propagate the error to a user-defined error handler
  or just re-throw the error (which will log the error without modifying).

### `@sentry/opentelemetry`

- Removed `getPropagationContextFromSpan`.
  This function was primarily internally used.
  It's functionality was misleading and should not be used.

## 5. Build Changes

Previously the CJS versions of the SDK code (wrongfully) contained compatibility statements for default exports in ESM:

```js
Object.defineProperty(exports, '__esModule', { value: true });
```

The SDK no longer contains these statements.
Let us know if this is causing issues in your setup by opening an issue on GitHub.

### `@sentry/deno`

The minimum supported Deno version is now **2.0.0**.

- `@sentry/deno` is no longer published on `deno.land` so you'll need to import
  from npm:

```javascript
import * as Sentry from 'npm:@sentry/deno';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

## 6. Type Changes

In v8, types have been exported from `@sentry/types`, while implementations have been exported from other classes.

This led to some duplication, where we had to keep an interface in `@sentry/types`, while the implementation mirroring that interface was kept e.g. in `@sentry/core`.

Since v9, the types have been merged into `@sentry/core`, which removed some of this duplication. This means that certain things that used to be a separate interface, will not expect an actual instance of the class/concrete implementation.

This should not affect most users unless you relied on passing things with a similar shape to internal methods. The following types are affected:

- `Scope` now always expects the `Scope` class
- The `TransactionNamingScheme` type has been removed. There is no replacement.
- The `Request` type has been removed. Use `RequestEventData` type instead.
- The `IntegrationClass` type is no longer exported - it was not used anymore. Instead, use `Integration` or `IntegrationFn`.
- The `samplingContext.request` attribute in the `tracesSampler` has been removed. Use `samplingContext.normalizedRequest` instead. Note that the type of `normalizedRequest` differs from `request`.
- The `samplingContext.transactionContext` object in the `tracesSampler` has been removed. All object attributes are available in the top-level of `samplingContext`.
- `Client` now always expects the `BaseClient` class - there is no more abstract `Client` that can be implemented! Any `Client` class has to extend from `BaseClient`.
- `ReportDialogOptions` now extends `Record<string, unknown>` instead of `Record<string, any>` - this should not affect most users.
- The `RequestDataIntegrationOptions` type has been removed. There is no replacement.

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

  Returning `null` from `beforeSendSpan` will now result in a warning being logged.
  In v9, dropping spans is not possible anymore within this hook.

- **Passing `undefined` to `tracesSampleRate` / `tracesSampler` / `enableTracing` will be handled differently in v9**

In v8, explicitly setting `tracesSampleRate` (even if it is set to `undefined`) resulted in tracing being _enabled_, although no spans were generated.

```ts
Sentry.init({
  tracesSampleRate: undefined,
});
```

In v9, we will streamline this behavior so that passing `undefined` will result in tracing being disabled, the same as not passing the option at all.

If you are relying on `undefined` being passed in and having tracing enabled because of this, you should update your config to set e.g. `tracesSampleRate: 0` instead, which will also enable tracing in v9.

The `enableTracing` option was removed. In v9, to emulate `enableTracing: true`, set `tracesSampleRate: 1`. To emulate `enableTracing: false`, remove the `tracesSampleRate` and `tracesSampler` options (if configured).

- **The `autoSessionTracking` option is deprecated.**

To enable session tracking, it is recommended to unset `autoSessionTracking` and ensure that either, in browser environments the `browserSessionIntegration` is added, or in server environments the `httpIntegration` is added.

To disable session tracking, it is recommended unset `autoSessionTracking` and to remove the `browserSessionIntegration` in browser environments, or in server environments configure the `httpIntegration` with the `trackIncomingRequestsAsSessions` option set to `false`.
Additionally, in Node.js environments, a session was automatically created for every node process when `autoSessionTracking` was set to `true`. This behavior has been replaced by the `processSessionIntegration` which is configured by default.

- **The metrics API has been removed from the SDK.**

The Sentry metrics beta has ended and the metrics API has been removed from the SDK. Learn more in [help center docs](https://sentry.zendesk.com/hc/en-us/articles/26369339769883-Metrics-Beta-Ended-on-October-7th).

## `@sentry/utils`

- **The `@sentry/utils` package has been deprecated. Import everything from `@sentry/core` instead.**

- Deprecated `AddRequestDataToEventOptions.transaction`. This option effectively doesn't do anything anymore, and will be removed in v9.
- Deprecated `TransactionNamingScheme` type.
- Deprecated `validSeverityLevels`. Will not be replaced.
- Deprecated `urlEncode`. No replacements.
- Deprecated `addRequestDataToEvent`. Use `httpRequestToRequestData` instead and put the resulting object directly on `event.request`.
- Deprecated `extractRequestData`. Instead manually extract relevant data off request.
- Deprecated `arrayify`. No replacements.
- Deprecated `memoBuilder`. No replacements.
- Deprecated `getNumberOfUrlSegments`. No replacements.
- Deprecated `BAGGAGE_HEADER_NAME`. Use the `"baggage"` string constant directly instead.
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
- Deprecated `initSessionFlusher` on `ServerRuntimeClient`. No replacements. The `httpIntegration` will flush sessions by itself.

## `@sentry/nestjs`

- Deprecated the `@WithSentry` decorator. Use the `@SentryExceptionCaptured` decorator instead.
- Deprecated the `SentryTracingInterceptor` method.
  If you are using `@sentry/nestjs` you can safely remove any references to the `SentryTracingInterceptor`.
  If you are using another package migrate to `@sentry/nestjs` and remove the `SentryTracingInterceptor` afterward.
- Deprecated `SentryService`.
  If you are using `@sentry/nestjs` you can safely remove any references to the `SentryService`.
  If you are using another package migrate to `@sentry/nestjs` and remove the `SentryService` afterward.
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

- Deprecated `logErrors` in the `vueIntegration`. The Sentry Vue error handler will propagate the error to a user-defined error handler
  or just re-throw the error (which will log the error without modifying).

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

- Deprecated `wrapUseRoutes`. Use the `wrapUseRoutesV6` or `wrapUseRoutesV7` methods instead.
- Deprecated `wrapCreateBrowserRouter`. Use the `wrapCreateBrowserRouterV6` or `wrapCreateBrowserRouterV7` methods instead.

## `@sentry/nextjs`

- Deprecated the `hideSourceMaps` option. There are no replacements for this option. The SDK emits hidden sourcemaps by default.

## `@sentry/opentelemetry`

- Deprecated the `generateSpanContextForPropagationContext` method. There are no replacements for this method.

## Server-side SDKs (`@sentry/node` and all dependents)

- Deprecated `processThreadBreadcrumbIntegration` in favor of `childProcessIntegration`. Functionally they are the same.
- Deprecated `nestIntegration`. Use the NestJS SDK (`@sentry/nestjs`) instead.
- Deprecated `setupNestErrorHandler`. Use the NestJS SDK (`@sentry/nestjs`) instead.
- Deprecated `addOpenTelemetryInstrumentation`. Use the `openTelemetryInstrumentations` option in `Sentry.init()` or your custom Sentry Client instead.
- Deprecated `registerEsmLoaderHooks.include` and `registerEsmLoaderHooks.exclude`. Set `onlyIncludeInstrumentedModules: true` instead.
- `registerEsmLoaderHooks` will only accept `true | false | undefined` in the future. The SDK will default to wrapping modules that are used as part of OpenTelemetry Instrumentation.
- `httpIntegration({ spans: false })` is configured by default if `skipOpenTelemetrySetup: true` is set. You can still overwrite this if desired.
