<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Nuxt (EXPERIMENTAL)

[![npm version](https://img.shields.io/npm/v/@sentry/nuxt.svg)](https://www.npmjs.com/package/@sentry/nuxt)
[![npm dm](https://img.shields.io/npm/dm/@sentry/nuxt.svg)](https://www.npmjs.com/package/@sentry/nuxt)
[![npm dt](https://img.shields.io/npm/dt/@sentry/nuxt.svg)](https://www.npmjs.com/package/@sentry/nuxt)

**This SDK is under active development and not yet published!**

## Links

todo: link official SDK docs

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/)

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

### 1. Prerequesits & Installation

1. Install the Sentry Nuxt SDK:

   ```bash
   # Using npm
   npm install @sentry/nuxt

   # Using yarn
   yarn add @sentry/nuxt
   ```

### 2. Client-side Setup

The Sentry Nuxt SDK is based on [Nuxt Modules](https://nuxt.com/docs/api/kit/modules).

1. Add `@sentry/nuxt` to the modules section of `nuxt.config.ts`:

```javascript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@sentry/nuxt'],
  runtimeConfig: {
    public: {
      sentry: {
        dsn: env.DSN,
        // Additional config
      },
    },
  },
});
```

### 3. Server-side Setup

todo: add server-side setup

### 4. Vite Setup

todo: add vite setup

---

## Uploading Source Maps

todo: add source maps instructions
