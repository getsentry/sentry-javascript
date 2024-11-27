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
- Deprecated `flatten`. No replacements.

## `@sentry/core`

- Deprecated `transactionNamingScheme` option in `requestDataIntegration`.
- Deprecated `debugIntegration`. To log outgoing events, use [Hook Options](https://docs.sentry.io/platforms/javascript/configuration/options/#hooks) (`beforeSend`, `beforeSendTransaction`, ...).
- Deprecated `sessionTimingIntegration`. To capture session durations alongside events, use [Context](https://docs.sentry.io/platforms/javascript/enriching-events/context/) (`Sentry.setContext()`).
- Deprecated `addTracingHeadersToFetchRequest` method - this was only meant for internal use and is not needed anymore.

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

- Deprecated `Request` in favor of `RequestEventData`.

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

## Server-side SDKs (`@sentry/node` and all dependents)

- Deprecated `processThreadBreadcrumbIntegration` in favor of `childProcessIntegration`. Functionally they are the same.
- Deprecated `nestIntegration`. Use the NestJS SDK (`@sentry/nestjs`) instead.
- Deprecated `setupNestErrorHandler`. Use the NestJS SDK (`@sentry/nestjs`) instead.
- Deprecated `registerEsmLoaderHooks.include` and `registerEsmLoaderHooks.exclude`. Set `onlyIncludeInstrumentedModules: true` instead.
- `registerEsmLoaderHooks` will only accept `true | false | undefined` in the future. The SDK will default to wrapping modules that are used as part of OpenTelemetry Instrumentation.
