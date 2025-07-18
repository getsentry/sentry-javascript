# Sentry JavaScript SDK Migration Docs

These docs walk through how to migrate our JavaScript SDKs through different major versions.

- Upgrading from [SDK 4.x to 5.x/6.x](./docs/migration/v4-to-v5_v6.md)
- Upgrading from [SDK 6.x to 7.x](./docs/migration/v6-to-v7.md)
- Upgrading from [SDK 7.x to 8.x](./docs/migration/v7-to-v8.md)
- Upgrading from [SDK 8.x to 9.x](./docs/migration/v8-to-v9.md)
- Upgrading from [SDK 9.x to 10.x](#upgrading-from-9x-to-10x)

# Upgrading from 9.x to 10.x

Version 10 of the Sentry JavaScript SDK primarily focuses on upgrading underlying OpenTelemetry dependencies to v2 with minimal breaking changes.

Version 10 of the SDK is compatible with Sentry self-hosted versions 24.4.2 or higher (unchanged from v9).
Lower versions may continue to work, but may not support all features.

## 1. Version Support Changes:

Version 10 of the Sentry SDK has new compatibility ranges for runtimes and frameworks.

### `@sentry/node` / All SDKs running in Node.js

All OpenTelemetry dependencies have been bumped to 2.x.x / 0.20x.x respectively and all OpenTelemetry instrumentations have been upgraded to their latest version.

If you cannot run with OpenTelmetry v2 versions, consider either staying on Version 9 of our SDKs or using `@sentry/node-core` instead which ships with widened OpenTelemetry peer dependencies.

### AWS Lambda Layer Changes

A new AWS Lambda Layer for version 10 will be published as `SentryNodeServerlessSDKv10`.
The ARN will be published in the [Sentry docs](https://docs.sentry.io/platforms/javascript/guides/aws-lambda/install/cjs-layer/) once available.

Updates and fixes for version 9 will be published as `SentryNodeServerlessSDKv9`.

## 2. Removed APIs

### `@sentry/core` / All SDKs

- `BaseClient` was removed, use `Client` as a direct replacement.
- `hasTracingEnabled` was removed, use `hasSpansEnabled` as a direct replacement.
- `logger` and type `Logger` were removed, use `debug` and type `SentryDebugLogger` instead.

## No Version Support Timeline

Version support timelines are stressful for everybody using the SDK, so we won't be defining one.
Instead, we will be applying bug fixes and features to older versions as long as there is demand.

Additionally, we hold ourselves accountable to any security issues, meaning that if any vulnerabilities are found, we will in almost all cases backport them.

Note, that it is decided on a case-per-case basis, what gets backported or not.
If you need a fix or feature in a previous version of the SDK, please reach out via a GitHub Issue.
