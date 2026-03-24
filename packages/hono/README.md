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
import { Hono } from 'hono';
import { sentry } from '@sentry/hono/cloudflare';

const app = new Hono();

// Initialize Sentry middleware right after creating the app
app.use(
  sentry(app, {
    dsn: '__DSN__',
    // ...other Sentry options
  }),
);

// ... your routes and other middleware

export default app;
```

#### Access `env` from Cloudflare Worker bindings

Pass the options as a callback instead of a plain options object. The function receives the Cloudflare Worker `env` as defined in the Worker's `Bindings`:

```typescript
import { Hono } from 'hono';
import { sentry } from '@sentry/hono/cloudflare';

type Bindings = { SENTRY_DSN: string };

const app = new Hono<{ Bindings: Bindings }>();

app.use(sentry(app, env => ({ dsn: env.SENTRY_DSN })));

export default app;
```

## Setup (Node)

### 1. Initialize Sentry in your Hono app

Initialize the Sentry Hono middleware as early as possible in your app:

```ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { sentry } from '@sentry/hono/node';

const app = new Hono();

// Initialize Sentry middleware right after creating the app
app.use(
  sentry(app, {
    dsn: '__DSN__', // or process.env.SENTRY_DSN
    tracesSampleRate: 1.0,
  }),
);

// ... your routes and other middleware

serve(app);
```

### 2. Add `preload` script to start command

To ensure that Sentry can capture spans from third-party libraries (e.g. database clients) used in your Hono app, Sentry needs to wrap these libraries as early as possible.

When starting the Hono Node application, use the `@sentry/node/preload` hook with the `--import` CLI option to ensure modules are wrapped before the application code runs:

```bash
node --import @sentry/node/preload index.js
```

This option can also be added to the `NODE_OPTIONS` environment variable:

```bash
NODE_OPTIONS="--import @sentry/node/preload"
```

Read more about this preload script in the docs: https://docs.sentry.io/platforms/javascript/guides/hono/install/late-initialization/#late-initialization-with-esm
