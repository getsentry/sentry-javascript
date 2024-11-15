**DISCLAIMER: CURRENTLY THIS IS JUST A MOCK MIGRATION GUIDE TO VISUALIZE THE CHANGES - WE NEED TO GO THROUGH IT AND VERIFY THAT IT ACTUALLY REPRESENTS REALITY THANKS BYE**

# Sentry JavaScript SDK Migration Docs

These docs walk through how to migrate our JavaScript SDKs through different major versions.

- Upgrading from [SDK 4.x to 5.x/6.x](./docs/migration/v4-to-v5_v6.md)
- Upgrading from [SDK 6.x to 7.x](./docs/migration/v6-to-v7.md)
- Upgrading from [SDK 7.x to 8.x](./docs/migration/v7-to-v8.md)
- Upgrading from [SDK 8.x to 9.x](#upgrading-from-8x-to-9x)

# Upgrading from 8.x to 9.x

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

If you observe failures due to syntax or features listed above, it may be an indicator that your current Runtime does not support ES2020.
If your runtime does not support ES2020, we recommend transpiling the SDK using Babel or similar tooling.

**Node.js:** The minimum supported Node.js versions are TBD, TBD, and TBD.
We no longer test against Node TBD, TBD, or TBD and cannot guarantee that the SDK will work as expected on these versions.

**Browser:** Due to SDK code now including ES2020 features, the minimum supported browser list will be updated.

New minimum supported browsers:

- Chrome 80
- Edge 80
- Safari 14, iOS Safari 14.4
- Firefox 74
- Opera 67
- Samsung Internet 13.0

If you need to support older browsers, we recommend transpiling your code using Babel or similar tooling.

### Framework Support Changes

**Angular:** TODO

**Ember:** TODO

**Next.js:** TODO

**Nuxt:** TODO

**React:** TODO

**Vue:** TODO

**Astro:** TODO

**Gatsby:** TODO

**NestJS:** TODO

**Svelte:** TODO

**SvelteKit:** TODO

**Bun:** TODO

**Cloudflare Workers:** TODO

**Deno:** TODO

**Solid:** TODO

**SolidStart:** TODO

**GCP Functions:** TODO

**AWS Lambda:** TODO

## 2. Behavior Changes

## 3. Package Removals

## 4. Removal of Deprecated APIs

## 5. Build Changes

TODO add Typescript import change

# Deprecations in 8.x

TODO (Copy over from migrations list we collected)

# Support Timeline for Version 9.x

TODO
