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

**Angular:** TBD

**Ember:** TBD

**Next.js:** TBD

**Nuxt:** TBD

**React:** TBD

**Vue:** TBD

**Astro:** TBD

**Gatsby:** TBD

**NestJS:** TBD

**Svelte:** TBD

**SvelteKit:** TBD

**Bun:** TBD

**Cloudflare Workers:** TBD

**Deno:** TBD

**Solid:** TBD

**SolidStart:** TBD

**GCP Functions:** TBD

**AWS Lambda:** TBD

## 2. Behavior Changes

### `@sentry/node`

- When `skipOpenTelemetrySetup: true` is configured, `httpIntegration({ spans: false })` will be configured by default. This means that you no longer have to specify this yourself in this scenario. With this change, no spans are emitted once `skipOpenTelemetrySetup: true` is configured, without any further configuration being needed.

### `@sentry/remix`

- The Remix SDK now uses OpenTelemetry instrumentation by default. This is identical to have used the v7 SDK with `autoInstrumentRemix: true`.

### Uncategorized (TODO)

- Next.js withSentryConfig returning Promise
- `request` on sdk processing metadata will be ignored going forward
- respect sourcemap generation settings
- SDK init options undefined
- no more polyfills
- no more update spans in vue component tracking by default
- new propagation context
- Client & Scope renaming

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

## 4. Removal of Deprecated APIs

- [General](#general)
- [Server-side SDKs (Node, Deno, Bun, ...)](#server-side-sdks-node-deno-bun-)
- [Next.js SDK](#nextjs-sdk)
- [Remix SDK](#remix-sdk)
- [Vue/Nuxt SDK](#vuenuxt-sdk)

### General

- sessionTimingIntegration
- debugIntegration
- `Request` type
- spanid on propagation context
- makeFifoCache in utils

### Server-side SDKs (Node, Deno, Bun, ...)

- processThreadBreadcrumbIntegration
- NestJS stuff in Node sdk
- various NestJS APIs
- NestJS `@WithSentry`
- `AddRequestDataToEventOptions.transaction`

### Next.js SDK

- `experimental_captureRequestError`

### Remix SDK

- `options.autoInstrumentRemix`

The `autoInstrumentRemix` has been removed from the Remix SDK. The default behaviour of the Remix SDK is now as if `autoInstrumentRemix` was set to `true`.

### Vue/Nuxt SDK

- vueComponent tracking options

## 5. Build Changes

Previously the CJS versions of the SDK code (wrongfully) contained compatibility statements for default exports in ESM:

```js
Object.defineProperty(exports, '__esModule', { value: true });
```

The SDK no longer contains these statements.
Let us know if this is causing issues in your setup by opening an issue on GitHub.

# Deprecations in 8.x

TBD (Copy over from migrations list we collected)

# No Version Support Timeline

Version support timelines are stressful for anybody using the SDK, so we won't be defining one.
Instead, we will be applying bug fixes and features to older versions as long as there is demand for them.
We also hold ourselves to high standards security-wise, meaning that if any vulnerabilities are found, we will in almost all cases backport them.

Note, that we will decide on a case-per-case basis, what gets backported or not.
If you need a fix or feature in a previous version of the SDK, feel free to reach out via a GitHub issue.
