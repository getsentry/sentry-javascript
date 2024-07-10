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
import * as Sentry from '@sentry/nuxt';

Sentry.init({
  dsn: env.DSN,
});
```

### 4. Server-side setup

Add a `sentry.server.config.(js|ts)` file to the root of your project:

```javascript
import * as Sentry from '@sentry/nuxt';

Sentry.init({
  dsn: env.DSN,
});
```

### 5. Vite Setup

todo: add vite setup

---

## Uploading Source Maps

todo: add source maps instructions
