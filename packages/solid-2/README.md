<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Solid 2

[![npm version](https://img.shields.io/npm/v/@sentry/solid-2.svg)](https://www.npmjs.com/package/@sentry/solid-2)
[![npm dm](https://img.shields.io/npm/dm/@sentry/solid-2.svg)](https://www.npmjs.com/package/@sentry/solid-2)
[![npm dt](https://img.shields.io/npm/dt/@sentry/solid-2.svg)](https://www.npmjs.com/package/@sentry/solid-2)

This SDK is for Solid 2 (`solid-js` ^2). For Solid 1.x use [`@sentry/solid`](https://www.npmjs.com/package/@sentry/solid).
What the runtime exposes and what this package relies on: [docs/solid-2-observe.md](../../docs/solid-2-observe.md).

One package, both halves: the browser SDK (`@sentry/browser`) for the client and the Node SDK (`@sentry/node`) for
the server, resolved by the `browser`/`node` export conditions, or explicitly as `@sentry/solid-2/client` and
`@sentry/solid-2/server`. Use the explicit entries in any module both graphs can reach — a client `Sentry.init` behind
an `isServer` guard is still resolved by the server build, to the server half.

## Setup with `@solidjs/vite-plugin`

```js
// vite.config.js
solid({
  ssr: true,
  observe: true, // tracing reads the observe build; errors report in every tier
  start: { instrument: './src/instrument.js' }, // awaited before the server graph loads
});
```

```js
// src/instrument.js — the server's Sentry.init(); nothing else
import * as Sentry from '@sentry/solid-2/server';
Sentry.init({ dsn: '__DSN__', tracesSampleRate: 1, integrations: [Sentry.solidServerTracingIntegration()] });
```

Add `@sentry/node` to the app's own dependencies. The plugin bundles this package into the server build (it consumes
the Solid runtime, and must see the same copy the app does); with a package manager that isolates dependencies, a
transitive `@sentry/node` is bundled along with it, where `import-in-the-middle` cannot find itself. Declared by the
app, it stays external.

## Errors

Solid 2's runtime has an error hook on each platform, in every build tier. `init()` installs it: a rendered
`<Errored>` fallback in the browser, and on the server an `<Errored>` fallback, a rejected `<Loading>` fragment, a
server-function throw (HTTP or an in-process call during SSR), a hydration value that would not serialize, and the
failure that fails a request — each once, with where it was met. Nothing to wrap.

```js
// client
import * as Sentry from '@sentry/solid-2';
Sentry.init({ dsn: '__DSN__' });

// server (before the app loads)
import * as Sentry from '@sentry/solid-2';
Sentry.init({
  dsn: '__DSN__',
  integrations: [
    // Optional: decide what the client receives in an error's place.
    Sentry.solidServerErrorsIntegration({ mapError: (error, context) => new Error(`ref ${context.boundary}`) }),
  ],
});
```

## Tracing

Tracing reads Solid's observe tier — the build the `observe` export condition selects — and is opt-in:

```js
// client
Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1,
  integrations: [Sentry.browserTracingIntegration(), Sentry.solidTracingIntegration()],
});

// server
Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1,
  integrations: [Sentry.solidServerTracingIntegration()],
});
```

- **Client** — one root span per user interaction (`ui.interaction.click`), with the navigations, holds and
  server-function calls it caused as children; a navigation or hold no interaction claims as its own root span; the
  runtime's diagnostics (`SILENT_HOLD`, `HOT_SCOPE_RERUNS`, …) as issues fingerprinted by code and component path.
- **Server** — the runtime carries Sentry's trace to the browser on its own two carriers (`Server-Timing` on every
  response, the `<meta>` pair in an HTML shell), so a `pageload` parents under the server request with no middleware
  and no body rewriting; plus one span per server-function execution, per `<Loading>` boundary that waited, and per
  frame stream produced.

Element text Solid attaches to an interaction's target (`button#next "Next →"`) is user data and left out of span
names and attributes unless `solidTracingIntegration({ targetText: true })`; the element itself is kept. A finding's
`data.error` — the error as thrown, on the server error findings — is not forwarded as an issue extra (the error hook
already captured it as an exception).

Without the observe build the tracing integrations are inert and log once in debug mode; errors still report.
