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

### 1. Install Peer Dependency

Additionally to `@sentry/hono`, install the `@sentry/cloudflare` package:

```bash
npm install --save @sentry/cloudflare
```

Make sure the installed version always stays in sync. The `@sentry/cloudflare` package is a required peer dependency when using `@sentry/hono/cloudflare`.
You won't import `@sentry/cloudflare` directly in your code, but it needs to be installed in your project.

### 2. Enable Node.js compatibility

Set the `nodejs_compat` compatibility flag in your `wrangler.jsonc`/`wrangler.toml` config. This is because the SDK needs access to the `AsyncLocalStorage` API to work correctly.

```jsonc {tabTitle:JSON} {filename:wrangler.jsonc}
{
  "compatibility_flags": ["nodejs_compat"],
}
```

```toml {tabTitle:Toml} {filename:wrangler.toml}
compatibility_flags = ["nodejs_compat"]
```

### 3. Initialize Sentry in your Hono app

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

### 1. Install Peer Dependency

Additionally to `@sentry/hono`, install the `@sentry/node` package:

```bash
npm install --save @sentry/node
```

Make sure the installed version always stays in sync. The `@sentry/node` package is a required peer dependency when using `@sentry/hono/node`.
You won't import `@sentry/node` directly in your code, but it needs to be installed in your project.

### 2. Initialize Sentry in a separate file

Create an `instrument.mjs` (or `instrument.ts`) file that initializes Sentry before the rest of your application runs.
This ensures Sentry can wrap third-party libraries (e.g. database clients) as early as possible:

```ts
// instrument.mjs (or instrument.ts)
import * as Sentry from '@sentry/hono/node';

Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
});
```

### 3. Load the instrument file with `--import`

When starting your Hono Node application, use the `--import` CLI flag to load `instrument.mjs` before your app code:

```bash
node --import ./instrument.mjs app.js
```

This option can also be added to the `NODE_OPTIONS` environment variable:

```bash
NODE_OPTIONS="--import ./instrument.mjs"
```

### 4. Add the Sentry middleware to your Hono app

Add the `sentry` middleware to your Hono app. Since Sentry was already initialized in the instrument file, no options are passed here:

```ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { sentry } from '@sentry/hono/node';

const app = new Hono();

// Add Sentry middleware right after creating the app
app.use(sentry(app));

// ... your routes and other middleware

serve(app);
```

## Setup (Bun)

### 1. Install Peer Dependency

Additionally to `@sentry/hono`, install the `@sentry/bun` package:

```bash
npm install --save @sentry/bun
```

Make sure the installed version always stays in sync. The `@sentry/bun` package is a required peer dependency when using `@sentry/hono/bun`.
You won't import `@sentry/bun` directly in your code, but it needs to be installed in your project.

### 2. Initialize Sentry in your Hono app

Initialize the Sentry Hono middleware as early as possible in your app:

```ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { sentry } from '@sentry/hono/bun';

const app = new Hono();

// Initialize Sentry middleware right after creating the app
app.use(
  sentry(app, {
    dsn: '__DSN__', // or process.env.SENTRY_DSN or Bun.env.SENTRY_DSN
    tracesSampleRate: 1.0,
  }),
);

// ... your routes and other middleware

serve(app);
```
