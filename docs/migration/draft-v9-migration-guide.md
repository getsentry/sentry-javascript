<!-- For now this is just a place where we can dump migration guide notes for v9 -->

# Deprecations

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
