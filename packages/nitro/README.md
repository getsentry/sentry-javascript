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

The minimum supported version of Nitro is `2.10.0` (`2.12.0+` recommended).

## General

This package is a wrapper around `@sentry/node` with added instrumentation for Nitro's features like:

- HTTP handlers and error capturing.
- [Middleware instrumentation](https://nitro.build/guide/routing#middleware).
- [Database instrumentation](https://nitro.build/guide/database).
- [KV Storage](https://nitro.build/guide/storage) and [Cache](https://nitro.build/guide/cache) instrumentation.

## Manual Setup

### 1. Prerequisites & Installation

1. Install the Sentry Nitro SDK:

   ```bash
   # Using npm
   npm install @sentry/nitro

   # Using yarn
   yarn add @sentry/nitro
   ```

### 2. Nitro Config Setup

1. Import `withSentryConfig` from `@sentry/nitro` and call it with your Nitro config:

```javascript
// nitro.config.ts
import { withSentryConfig } from '@sentry/nitro';

const config = defineNitroConfig({
  // ...
});

export default withSentryConfig(config, {
  // settings
});
```

### 3. Sentry Config Setup

Add a `sentry.server.config.ts` file to the root of your project:

```javascript
import * as Sentry from '@sentry/nitro';

// Only run `init` when process.env.SENTRY_DSN is available.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: 'your-dsn',
  });
}
```

You can reference the `SENTRY_DSN` from `process.env` by either adding `--env-file=.env` to your node
command

```bash
node --env-file=.env .output/server/index.mjs
```

or use the `dotenv` package:

```javascript
// sentry.server.config.ts
import dotenv from 'dotenv';
import * as Sentry from '@sentry/nitro';

dotenv.config();

Sentry.init({
  dsn: process.env.SENTRY_DSN,
});
```

## Uploading Source Maps

To upload source maps...

<!-- TODO -->

## Troubleshoot

If you encounter any issues with error tracking or integrations, refer to the official [Sentry Nitro SDK documentation](https://docs.sentry.io/platforms/javascript/guides/nitro/). If the documentation does not provide the necessary information, consider opening an issue on GitHub.
