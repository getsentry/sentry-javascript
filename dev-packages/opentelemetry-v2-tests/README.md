# OpenTelemetry v2 Tests

This package contains tests for `@sentry/opentelemetry` when using OpenTelemetry v2. It is used to ensure compatibility with OpenTelemetry v2 APIs.

## Running Tests

To run the tests:

```bash
yarn test
```

## Structure

The tests are copied from `packages/opentelemetry/test` with adjusted imports to work with OpenTelemetry v2 dependencies. The main differences are:

1. Uses OpenTelemetry v2 as devDependencies
2. Imports from `@sentry/opentelemetry` instead of relative paths
3. Tests the same functionality but with v2 APIs
