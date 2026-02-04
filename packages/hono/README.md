<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Hono (ALPHA)

[![npm version](https://img.shields.io/npm/v/@sentry/hono.svg)](https://www.npmjs.com/package/@sentry/hono)
[![npm dm](https://img.shields.io/npm/dm/@sentry/hono.svg)](https://www.npmjs.com/package/@sentry/hono)
[![npm dt](https://img.shields.io/npm/dt/@sentry/hono.svg)](https://www.npmjs.com/package/@sentry/hono)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)

## Install

To get started, first install the `@sentry/hono` package:

```bash
npm install @sentry/hono
```

## Setup (Cloudflare Workers)

### Enable Node.js compatibility

Either set the `nodejs_als` or `nodejs_compat` compatibility flags in your `wrangler.jsonc`/`wrangler.toml` config. This is because the SDK needs access to the `AsyncLocalStorage` API to work correctly.

```jsonc {tabTitle:JSON} {filename:wrangler.jsonc}
{
  "compatibility_flags": [
    "nodejs_als",
    // "nodejs_compat"
  ],
}
```

```toml {tabTitle:Toml} {filename:wrangler.toml}
compatibility_flags = ["nodejs_als"]
# compatibility_flags = ["nodejs_compat"]
```

### Initialize Sentry in your Hono app

Initialize the Sentry Hono middleware as early as possible in your app:

```typescript
import { sentry } from '@sentry/hono/cloudflare';

const app = new Hono();

app.use(
  '*',
  sentry(app, {
    dsn: 'your-sentry-dsn',
  }),
);

export default app;
```
