<!-- For now this is just a place where we can dump migration guide notes for v9 -->

# Deprecations

## `@sentry/utils`

- Deprecated `AddRequestDataToEventOptions.transaction`. This option effectively doesn't do anything anymore, and will
  be removed in v9.
- Deprecated `TransactionNamingScheme` type.

## `@sentry/core`

- Deprecated `transactionNamingScheme` option in `requestDataIntegration`.

## `@sentry/types`

- Deprecated `Request` in favor of `RequestEventData`.

## Server-side SDKs (`@sentry/node` and all dependents)

- Deprecated `processThreadBreadcrumbIntegration` in favor of `childProcessIntegration`. Functionally they are the same.
