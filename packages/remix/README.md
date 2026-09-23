<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Remix

[![npm version](https://img.shields.io/npm/v/@sentry/remix.svg)](https://www.npmjs.com/package/@sentry/remix)
[![npm dm](https://img.shields.io/npm/dm/@sentry/remix.svg)](https://www.npmjs.com/package/@sentry/remix)
[![npm dt](https://img.shields.io/npm/dt/@sentry/remix.svg)](https://www.npmjs.com/package/@sentry/remix)

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/react` for the client, with added
functionality related to Remix.

The following setup is for Remix on Node.js. For Cloudflare, follow the
[Remix configuration guide](https://docs.sentry.io/platforms/javascript/guides/remix/).

## Vite Configuration

Add `sentryRemixVitePlugin` after the Remix plugin. It provides the route manifest used to parameterize client-side
transaction names, instruments supported server-side dependencies at build time, and uploads source maps.

```ts
// vite.config.ts
import { vitePlugin as remix } from '@remix-run/dev';
import { sentryRemixVitePlugin } from '@sentry/remix/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    remix(),
    sentryRemixVitePlugin({
      org: 'your-org',
      project: 'your-project',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
});
```

Set `SENTRY_AUTH_TOKEN` in your build environment for source-map uploads. Do not expose it in client-side code.

## Client Initialization

Initialize Sentry in your client entry point:

```ts
// entry.client.tsx

import { useLocation, useMatches } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { useEffect } from 'react';

Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1,
  integrations: [
    Sentry.browserTracingIntegration({
      useEffect,
      useLocation,
      useMatches,
    }),
  ],
  // ...
});
```

## Server Initialization

Initialize Sentry in a separate file and preload it before the server starts so instrumentation is registered before
application dependencies load:

```js
// instrument.server.mjs
import * as Sentry from '@sentry/remix';

Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1,
  // ...
});
```

For example, start a Vite-built app with:

```bash
NODE_OPTIONS="--import=./instrument.server.mjs" remix-serve ./build/server/index.js
```

In your server entry point, export Sentry's error handler alongside your existing request handler:

```ts
// entry.server.tsx
import * as Sentry from '@sentry/remix';

export const handleError = Sentry.sentryHandleError;
```

If you already have a custom `handleError`, wrap it with `Sentry.wrapHandleErrorWithSentry` instead.

## React Error Capture

Wrap your Remix root with `withSentry` to capture React component errors. Parameterized client-side transaction names
also require the route manifest provided by the Vite plugin above.

```ts
// root.tsx

import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

import { withSentry } from "@sentry/remix";

function App() {
  return (
    <html>
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}

export default withSentry(App);
```

To set context information or send manual events, use the exported functions of `@sentry/remix`.

```ts
import * as Sentry from '@sentry/remix';

// Set user information, as well as tags and further extras
Sentry.setExtra('battery', 0.7);
Sentry.setTag('user_mode', 'admin');
Sentry.setUser({ id: '4711' });

// Add a breadcrumb for future events
Sentry.addBreadcrumb({
  message: 'My Breadcrumb',
  // ...
});

// Capture exceptions, messages or manual events
Sentry.captureMessage('Hello, world!');
Sentry.captureException(new Error('Good bye'));
Sentry.captureEvent({
  message: 'Manual',
  stacktrace: [
    // ...
  ],
});
```

## Sourcemaps and Releases

For Vite projects, use `sentryRemixVitePlugin` as shown above to generate and upload source maps during the build.

### Classic Remix Compiler

For projects using the classic Remix compiler, the SDK provides a script that automatically creates a release and
uploads sourcemaps. Generate sourcemaps by calling `remix build` with the `--sourcemap` option.

On release, call the upload sourcemaps command to upload source maps and create a release:

```bash
npx @sentry/remix --upload-sourcemaps
```

To see more details on how to use the command, run `npx @sentry/remix --upload-sourcemaps --help`.

For more advanced configuration,
[directly use `sentry-cli` to upload source maps.](https://github.com/getsentry/sentry-cli).
