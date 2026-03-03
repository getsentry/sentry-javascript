<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Hono (ALPHA)

[![npm version](https://img.shields.io/npm/v/@sentry/hono.svg)](https://www.npmjs.com/package/@sentry/hono)
[![npm dm](https://img.shields.io/npm/dm/@sentry/hono.svg)](https://www.npmjs.com/package/@sentry/hono)
[![npm dt](https://img.shields.io/npm/dt/@sentry/hono.svg)](https://www.npmjs.com/package/@sentry/hono)

This SDK is compatible with Hono 4+ and is currently in ALPHA. Alpha features are still in progress, may have bugs and might include breaking changes.
Please reach out on [GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback or concerns.

## Links

- [General SDK Docs](https://docs.sentry.io/quickstart/) - Official Docs for this Hono SDK are coming soon!

The current [Hono SDK Docs](https://docs.sentry.io/platforms/javascript/guides/hono/) explain using Sentry in Hono by using other Sentry SDKs (e.g. `@sentry/node` or `@sentry/cloudflare`)

## Install

To get started, first install the `@sentry/hono` package:

```bash
npm install @sentry/hono
```

## Setup (Cloudflare Workers)

### 1. Enable Node.js compatibility

Set the `nodejs_compat` compatibility flag in your `wrangler.jsonc`/`wrangler.toml` config. This is because the SDK needs access to the `AsyncLocalStorage` API to work correctly.

```jsonc {tabTitle:JSON} {filename:wrangler.jsonc}
{
  "compatibility_flags": ["nodejs_compat"],
}
```

```toml {tabTitle:Toml} {filename:wrangler.toml}
compatibility_flags = ["nodejs_compat"]
```

### 2. Initialize Sentry in your Hono app

Initialize the Sentry Hono middleware as early as possible in your app:

```typescript
import { sentry } from '@sentry/hono/cloudflare';

const app = new Hono();

// Initialize Sentry middleware right after creating the app
app.use(
  '*',
  sentry(app, {
    dsn: 'your-sentry-dsn',
    // ...other Sentry options
  }),
);

// ... your routes and other middleware

export default app;
```
