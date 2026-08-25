<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Astro

[![npm version](https://img.shields.io/npm/v/@sentry/astro.svg)](https://www.npmjs.com/package/@sentry/astro)
[![npm dm](https://img.shields.io/npm/dm/@sentry/astro.svg)](https://www.npmjs.com/package/@sentry/astro)
[![npm dt](https://img.shields.io/npm/dt/@sentry/astro.svg)](https://www.npmjs.com/package/@sentry/astro)

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/astro/)

## SDK Status

This SDK is in Beta and not yet fully stable. If you have feedback or encounter any bugs, feel free to
[open an issue](https://github.com/getsentry/sentry-javascript/issues/new/choose).

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/browser` for the client side.

## Installation and Setup

Install the Sentry Astro SDK with the `astro` CLI:

```bash
npx astro add @sentry/astro
```

### Build-time Configuration

Register the Sentry integration in your `astro.config.mjs`. This is where you configure build-time options such as
source maps upload (`org`, `project`, `authToken`). Runtime SDK options (`dsn`, `environment`, `tracesSampleRate`, Replay
sample rates, and so on) belong in dedicated init files, not on `sentry()`.

```javascript
import { defineConfig } from 'astro/config';
import sentry from '@sentry/astro';

export default defineConfig({
  integrations: [
    sentry({
      org: 'your-org-slug',
      project: 'your-sentry-project-slug',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
});
```

Follow [this guide](https://docs.sentry.io/product/accounts/auth-tokens/#organization-auth-tokens) to create an auth
token and add it to your environment variables:

```bash
SENTRY_AUTH_TOKEN="your-token"
```

### Runtime SDK Configuration

If you do not add `sentry.client.config.ts` or `sentry.server.config.ts`, Sentry still initializes with default options
and reads the DSN from `PUBLIC_SENTRY_DSN`. Add those files at the project root when you want to customize client or
server options, and pass them to `Sentry.init()`.

Set `PUBLIC_SENTRY_DSN` in your environment (for example in `.env`):

```bash
PUBLIC_SENTRY_DSN="__DSN__"
```

```javascript
// sentry.client.config.ts
import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

```javascript
// sentry.server.config.ts
import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
});
```

### Server Instrumentation

For Astro apps configured for (hybrid) Server Side Rendering (SSR), the Sentry integration will automatically add
middleware to your server to instrument incoming requests.

The Sentry middleware enhances the data collected by Sentry on the server side by:

- Enabling distributed tracing between client and server
- Collecting performance spans for incoming requests
- Enhancing captured errors with additional information

#### Disable Automatic Server Instrumentation

You can opt out of using the automatic sentry server instrumentation in your `astro.config.mjs` file:

```javascript
import { defineConfig } from 'astro/config';
import sentry from '@sentry/astro';

export default defineConfig({
  integrations: [
    sentry({
      autoInstrumentation: {
        requestHandler: false,
      },
    }),
  ],
});
```

If you opt out but still want the middleware, add it manually to your `src/middleware.js` file:

```javascript
// src/middleware.js
import { sequence } from 'astro:middleware';
import * as Sentry from '@sentry/astro';

export const onRequest = sequence(
  Sentry.handleRequest(),
  // Add your other handlers after Sentry.handleRequest()
);
```

## Configuration

Check out our docs for configuring your SDK setup:

- [Getting Started](https://docs.sentry.io/platforms/javascript/guides/astro/)
- [Manual Setup and Configuration](https://docs.sentry.io/platforms/javascript/guides/astro/manual-setup/)
- [Source Maps Upload](https://docs.sentry.io/platforms/javascript/guides/astro/sourcemaps/)
