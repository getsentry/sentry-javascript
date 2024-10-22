<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Nuxt (BETA)

[![npm version](https://img.shields.io/npm/v/@sentry/nuxt.svg)](https://www.npmjs.com/package/@sentry/nuxt)
[![npm dm](https://img.shields.io/npm/dm/@sentry/nuxt.svg)](https://www.npmjs.com/package/@sentry/nuxt)
[![npm dt](https://img.shields.io/npm/dt/@sentry/nuxt.svg)](https://www.npmjs.com/package/@sentry/nuxt)

This SDK is in **Beta**. The API is stable but updates may include minor changes in behavior. Please reach out on
[GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback or concerns. This
SDK is for [Nuxt](https://nuxt.com/). If you're using [Vue](https://vuejs.org/) see our
[Vue SDK here](https://github.com/getsentry/sentry-javascript/tree/develop/packages/vue).

## Links

- [Official Nuxt SDK Docs](https://docs.sentry.io/platforms/javascript/guides/nuxt/)

## Compatibility

The minimum supported version of Nuxt is `3.0.0`.

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/vue` for the client side, with added
functionality related to Nuxt.

**Limitations:**

- Server monitoring is not available during development mode (`nuxt dev`)

## Manual Setup

### 1. Prerequisites & Installation

1. Install the Sentry Nuxt SDK:

   ```bash
   # Using npm
   npm install @sentry/nuxt

   # Using yarn
   yarn add @sentry/nuxt
   ```

### 2. Nuxt Module Setup

The Sentry Nuxt SDK is based on [Nuxt Modules](https://nuxt.com/docs/api/kit/modules).

1. Add `@sentry/nuxt/module` to the modules section of `nuxt.config.ts`:

```javascript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@sentry/nuxt/module'],
});
```

### 3. Client-side setup

Add a `sentry.client.config.ts` file to the root of your project:

```javascript
import { useRuntimeConfig } from '#imports';
import * as Sentry from '@sentry/nuxt';

Sentry.init({
  // If set up, you can use your runtime config here
  dsn: useRuntimeConfig().public.sentry.dsn,
});
```

### 4. Server-side setup

Add a `sentry.server.config.ts` file to the root of your project:

```javascript
import * as Sentry from '@sentry/nuxt';

// Only run `init` when process.env.SENTRY_DSN is available.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: 'your-dsn',
  });
}
```

Using `useRuntimeConfig` does not work in the Sentry server config file due to technical reasons (the file has to be
loaded before Nuxt is loaded). To be able to use `process.env` you either have to add `--env-file=.env` to your node
command

```bash
node --env-file=.env .output/server/index.mjs
```

or use the `dotenv` package:

```javascript
import dotenv from 'dotenv';
import * as Sentry from '@sentry/nuxt';

dotenv.config();

Sentry.init({
  dsn: process.env.SENTRY_DSN,
});
```

## Uploading Source Maps

To upload source maps, you have to enable client source maps in your `nuxt.config.ts`. Then, you add your project
settings to the `sentry.sourceMapsUploadOptions` of your `nuxt.config.ts`:

```javascript
// nuxt.config.ts
export default defineNuxtConfig({
  sourcemap: { client: true },

  modules: ['@sentry/nuxt/module'],
  sentry: {
    sourceMapsUploadOptions: {
      org: 'your-org-slug',
      project: 'your-project-slug',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    },
  },
});
```

## Troubleshooting

When adding `sentry.server.config.ts`, you might get an error like this:
"`Failed to register ESM hook import-in-the-middle/hook.mjs`". You can add an override (npm/pnpm) or a resolution (yarn)
for `@vercel/nft` to fix this. This will add the `hook.mjs` file to your build output
([Nitro issue here](https://github.com/unjs/nitro/issues/2703)).

For `npm`:

```json
"overrides": {
  "@vercel/nft": "^0.27.4"
}
```

for `yarn`:

```json
"resolutions": {
  "@vercel/nft": "^0.27.4"
}
```

or for `pnpm`:

```json
"pnpm": {
  "overrides": {
    "@vercel/nft": "^0.27.4"
  }
}
```
