<!-- For now this is just a place where we can dump migration guide notes for v9 -->

# Deprecations

## `@sentry/utils`

- Deprecated `AddRequestDataToEventOptions.transaction`. This option effectively doesn't do anything anymore, and will
  be removed in v9.
- Deprecated `TransactionNamingScheme` type.

## `@sentry/core`

- Deprecated `transactionNamingScheme` option in `requestDataIntegration`.

## `@sentry/nestjs`

- Deprecated `@WithSentry`. Use `@SentryExceptionCaptured` instead.
