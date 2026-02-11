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
- The `_experiments.enableLogs` and `_experiments.beforeSendLog` options were removed, use the top-level `enableLogs` and `beforeSendLog` options instead.

```js
// before
Sentry.init({
  _experiments: {
    enableLogs: true,
    beforeSendLog: log => {
      return log;
    },
  },
});

// after
Sentry.init({
  enableLogs: true,
  beforeSendLog: log => {
    return log;
  },
});
```

- (Session Replay) The `_experiments.autoFlushOnFeedback` option was removed and is now default behavior.

## 3. Behaviour Changes

### Removal of First Input Delay (FID) Web Vital Reporting

Affected SDKs: All SDKs running in browser applications (`@sentry/browser`, `@sentry/react`, `@sentry/nextjs`, etc.)

In v10, the SDK stopped reporting the First Input Delay (FID) web vital.
This was done because FID has been replaced by Interaction to Next Paint (INP) and is therefore no longer relevant for assessing and tracking a website's performance.
For reference, FID has long been deprecated by Google's official `web-vitals` library and was eventually removed in version `5.0.0`.
Sentry now follows Google's lead by also removing it.

The removal entails **no breaking API changes**. However, in rare cases, you might need to adjust some of your Sentry SDK and product setup:

- Remove any logic in `beforeSend` or other filtering/event processing logic that depends on FID or replace it with INP logic.
- If you set up Sentry Alerts that depend on FID, be aware that these could trigger once you upgrade the SDK, due to a lack of new values.
  To replace them, adjust your alerts (or dashbaords) to use INP.

### Update: User IP Address collection gated by `sendDefaultPii`

Version `10.4.0` introduced a change that should have ideally been introduced with `10.0.0` of the SDK.
Originally destined for [version `9.0.0`](https://docs.sentry.io/platforms/javascript/migration/v8-to-v9/#behavior-changes), but having not the desired effect until v10,
SDKs will now control IP address inference of user IP addresses depending on the value of the top level `sendDefaultPii` init option.

- If `sendDefaultPii` is `true`, Sentry will infer the IP address of users' devices to events (errors, traces, replays, etc) in all browser-based SDKs.
- If `sendDefaultPii` is `false` or not set, Sentry will not infer or collect IP address data.

Given that this was already the advertised behaviour since v9, we classify the change [as a fix](https://github.com/getsentry/sentry-javascript/pull/17364),
though we recognize the potential impact of it. We apologize for any inconvenience caused.

## No Version Support Timeline

Version support timelines are stressful for everybody using the SDK, so we won't be defining one.
Instead, we will be applying bug fixes and features to older versions as long as there is demand.

Additionally, we hold ourselves accountable to any security issues, meaning that if any vulnerabilities are found, we will in almost all cases backport them.

Note, that it is decided on a case-per-case basis, what gets backported or not.
If you need a fix or feature in a previous version of the SDK, please reach out via a GitHub Issue.
