<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Nitro

[![npm version](https://img.shields.io/npm/v/@sentry/nitro.svg)](https://www.npmjs.com/package/@sentry/nitro)
[![npm dm](https://img.shields.io/npm/dm/@sentry/nitro.svg)](https://www.npmjs.com/package/@sentry/nitro)
[![npm dt](https://img.shields.io/npm/dt/@sentry/nitro.svg)](https://www.npmjs.com/package/@sentry/nitro)

## Links

- [Official Nitro SDK Docs](https://docs.sentry.io/platforms/javascript/guides/nitro/)

## Compatibility

The minimum supported version of Nitro is `3.0.0-alpha.1`.

## General

This package is a wrapper around `@sentry/node` with added instrumentation for Nitro's features like:

- HTTP handlers and error capturing.
- [Middleware instrumentation](https://nitro.build/guide/routing#middleware).
  <!-- - [Database instrumentation](https://nitro.build/guide/database). -->
  <!-- - [KV Storage](https://nitro.build/guide/storage) and [Cache](https://nitro.build/guide/cache) instrumentation. -->

## Manual Setup

### 1. Prerequisites & Installation

1. Install the Sentry Nitro SDK:

   ```bash
   # Using npm
   npm install @sentry/nitro

   # Using yarn
   yarn add @sentry/nitro

   # Using pnpm
   pnpm add @sentry/nitro
   ```

### 2. Nitro Config Setup

1. Import `withSentryConfig` from `@sentry/nitro` and call it with your Nitro config.

#### In `nitro.config.ts`

If you are using a dedicated `nitro.config.ts` file, you can import `withSentryConfig` from `@sentry/nitro` and call it with your Nitro config.

```javascript
import { defineNitroConfig } from 'nitro/config';
import { withSentryConfig } from '@sentry/nitro';

const config = defineNitroConfig({
  // ...
});

export default withSentryConfig(config, {
  // Sentry Build Options
});
```

#### In `vite.config.ts`

If you are using nitro as a Vite plugin, you can import `withSentryConfig` from `@sentry/nitro` and call it with your Nitro config.

```ts
import { defineConfig } from 'vite';
import { nitro } from 'nitro/vite';
import { withSentryConfig } from '@sentry/nitro';

export default defineConfig({
  plugins: [nitro()],
  nitro: withSentryConfig(
    {
      // Nitro options
    },
    {
      // Sentry Build Options
    },
  ),
});
```

### 3. Sentry Config Setup

Create an `instrument.mjs` file in your project root to initialize the Sentry SDK:

```javascript
import * as Sentry from '@sentry/nitro';

Sentry.init({
  dsn: '__YOUR_DSN__',
  tracesSampleRate: 1.0,
});
```

Then use `NODE_OPTIONS` to load the instrumentation before your app code:

```bash
NODE_OPTIONS='--import ./instrument.mjs' npx nitro dev
```

This works with any Nitro command (`nitro dev`, `nitro preview`, or a production start script).

## Uploading Source Maps

The `withSentryConfig` function automatically configures source map uploading when the `authToken`, `org`, and `project`
options are provided:

```javascript
export default withSentryConfig(config, {
  org: 'your-sentry-org',
  project: 'your-sentry-project',
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
```

## Troubleshoot

If you encounter any issues with error tracking or integrations, refer to the official [Sentry Nitro SDK documentation](https://docs.sentry.io/platforms/javascript/guides/nitro/). If the documentation does not provide the necessary information, consider opening an issue on GitHub.
