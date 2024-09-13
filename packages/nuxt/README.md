<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Nuxt (EXPERIMENTAL)

[![npm version](https://img.shields.io/npm/v/@sentry/nuxt.svg)](https://www.npmjs.com/package/@sentry/nuxt)
[![npm dm](https://img.shields.io/npm/dm/@sentry/nuxt.svg)](https://www.npmjs.com/package/@sentry/nuxt)
[![npm dt](https://img.shields.io/npm/dt/@sentry/nuxt.svg)](https://www.npmjs.com/package/@sentry/nuxt)

**This SDK is under active development! Feel free to already try it but expect breaking changes**

## Links

todo: link official SDK docs

- [Official Browser SDK Docs](https://docs.sentry.io/platforms/javascript/)
- [Official Node SDK Docs](https://docs.sentry.io/platforms/node/)

## Compatibility

The minimum supported version of Nuxt is `3.0.0`.

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/vue` for the client side, with added
functionality related to Nuxt.

**What is working:**

- Error Reporting
  - Vue
  - Node
  - Nitro

**What is partly working:**

- Source Maps
- Connected Tracing (Frontend & Backend)
- Tracing by setting `tracesSampleRate`
  - UI (Vue) traces
  - HTTP (Node) traces

**Known Issues:**

- When adding `sentry.server.config.(ts/js)`, you get an error like this:
  "`Failed to register ESM hook (import-in-the-middle/hook.mjs)`". You can add a resolution for `@vercel/nft` to fix
  this. This will add the `hook.mjs` file to your build output
  ([issue here](https://github.com/unjs/nitro/issues/2703)).
  ```json
    "resolutions": {
      "@vercel/nft": "^0.27.4"
    }
  ```

## Automatic Setup

todo: add wizard instructions

Take a look at the sections below if you want to customize your SDK configuration.

## Manual Setup

If the setup through the wizard doesn't work for you, you can also set up the SDK manually.

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

Add a `sentry.client.config.(js|ts)` file to the root of your project:

```javascript
import { useRuntimeConfig } from '#imports';
import * as Sentry from '@sentry/nuxt';

Sentry.init({
  // If set up, you can use your runtime config here
  dsn: useRuntimeConfig().public.sentry.dsn,
});
```

### 4. Server-side setup

Add an `sentry.client.config.(js|ts)` file to the root of your project:

```javascript
import * as Sentry from '@sentry/nuxt';

// Only run `init` when process.env.SENTRY_DSN is available.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: 'your-dsn',
  });
}
```

The Nuxt runtime config does not work in the Sentry server to technical reasons (it has to be loaded before Nuxt is
loaded). To be able to use `process.env` you either have to add `--env-file=.env` to your node command

```bash
node --env-file=.env --import ./.output/server/sentry.server.config.mjs .output/server/index.mjs
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

Add an import flag to the Node options of your `node` command (not `nuxt preview`), so the file loads before any other
imports (keep in mind the `.mjs` file ending):

```json
{
  "scripts": {
    "start": "node --import ./.output/server/sentry.server.config.mjs .output/server/index.mjs"
  }
}
```

## Uploading Source Maps

To upload source maps, you can use the `sourceMapsUploadOptions` option inside the `sentry` options of your
`nuxt.config.ts`:

```javascript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@sentry/nuxt/module'],
  sentry: {
    debug: true,
    sourceMapsUploadOptions: {
      org: 'your-org-slug',
      project: 'your-project-slug',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    },
  },
});
```
