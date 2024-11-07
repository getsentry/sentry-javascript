<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Cloudflare

[![npm version](https://img.shields.io/npm/v/@sentry/cloudflare.svg)](https://www.npmjs.com/package/@sentry/cloudflare)
[![npm dm](https://img.shields.io/npm/dm/@sentry/cloudflare.svg)](https://www.npmjs.com/package/@sentry/cloudflare)
[![npm dt](https://img.shields.io/npm/dt/@sentry/cloudflare.svg)](https://www.npmjs.com/package/@sentry/cloudflare)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## Install

To get started, first install the `@sentry/cloudflare` package:

```bash
npm install @sentry/cloudflare
```

Then set either the `nodejs_compat` or `nodejs_als` compatibility flags in your `wrangler.toml`. This is because the SDK
needs access to the `AsyncLocalStorage` API to work correctly.

```toml
compatibility_flags = ["nodejs_compat"]
# compatibility_flags = ["nodejs_als"]
```

Then you can either setup up the SDK for [Cloudflare Pages](#setup-cloudflare-pages) or
[Cloudflare Workers](#setup-cloudflare-workers).

## Setup (Cloudflare Pages)

To use this SDK, add the `sentryPagesPlugin` as
[middleware to your Cloudflare Pages application](https://developers.cloudflare.com/pages/functions/middleware/).

We recommend adding a `functions/_middleware.js` for the middleware setup so that Sentry is initialized for your entire
app.

```javascript
// functions/_middleware.js
import * as Sentry from '@sentry/cloudflare';

export const onRequest = Sentry.sentryPagesPlugin({
  dsn: process.env.SENTRY_DSN,
  // Set tracesSampleRate to 1.0 to capture 100% of spans for tracing.
  tracesSampleRate: 1.0,
});
```

If you need to to chain multiple middlewares, you can do so by exporting an array of middlewares. Make sure the Sentry
middleware is the first one in the array.

```javascript
import * as Sentry from '@sentry/cloudflare';

export const onRequest = [
  // Make sure Sentry is the first middleware
  Sentry.sentryPagesPlugin({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  // Add more middlewares here
];
```

If you need to access the `context` object (for example to grab environmental variables), you can pass a function to
`sentryPagesPlugin` that takes the `context` object as an argument and returns `init` options:

```javascript
export const onRequest = Sentry.sentryPagesPlugin(context => ({
  dsn: context.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
}));
```

If you do not have access to the `onRequest` middleware API, you can use the `wrapRequestHandler` API instead.

Here is an example with SvelteKit:

```javascript
// hooks.server.js
import * as Sentry from '@sentry/cloudflare';

export const handle = ({ event, resolve }) => {
  const requestHandlerOptions = {
    options: {
      dsn: event.platform.env.SENTRY_DSN,
      tracesSampleRate: 1.0,
    },
    request: event.request,
    context: event.platform.ctx,
  };
  return Sentry.wrapRequestHandler(requestHandlerOptions, () => resolve(event));
};
```

## Setup (Cloudflare Workers)

To use this SDK, wrap your handler with the `withSentry` function. This will initialize the SDK and hook into the
environment. Note that you can turn off almost all side effects using the respective options.

Currently only ESM handlers are supported.

```javascript
import * as Sentry from '@sentry/cloudflare';

export default withSentry(
  env => ({
    dsn: env.SENTRY_DSN,
    // Set tracesSampleRate to 1.0 to capture 100% of spans for tracing.
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request, env, ctx) {
      return new Response('Hello World!');
    },
  } satisfies ExportedHandler<Env>,
);
```

### Sourcemaps

Configure uploading sourcemaps via the Sentry Wizard:

```bash
npx @sentry/wizard@latest -i sourcemaps
```

See more details in our [docs](https://docs.sentry.io/platforms/javascript/sourcemaps/).

## Usage

To set context information or send manual events, use the exported functions of `@sentry/cloudflare`. Note that these
functions will require the usage of the Sentry helpers, either `withSentry` function for Cloudflare Workers or the
`sentryPagesPlugin` middleware for Cloudflare Pages.

```javascript
import * as Sentry from '@sentry/cloudflare';

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

## Cloudflare D1 Instrumentation

You can use the `instrumentD1WithSentry` method to instrument [Cloudflare D1](https://developers.cloudflare.com/d1/),
Cloudflare's serverless SQL database with Sentry.

```javascript
import * as Sentry from '@sentry/cloudflare';

// env.DB is the D1 DB binding configured in your `wrangler.toml`
const db = Sentry.instrumentD1WithSentry(env.DB);
// Now you can use the database as usual
await db.prepare('SELECT * FROM table WHERE id = ?').bind(1).run();
```

## Cron Monitoring (Cloudflare Workers)

[Sentry Crons](https://docs.sentry.io/product/crons/) allows you to monitor the uptime and performance of any scheduled,
recurring job in your application.

To instrument your cron triggers, use the `Sentry.withMonitor` API in your
[`Scheduled` handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/).

```js
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      Sentry.withMonitor('your-cron-name', () => {
        return doSomeTaskOnASchedule();
      }),
    );
  },
};
```

You can also use supply a monitor config to upsert cron monitors with additional metadata:

```js
const monitorConfig = {
  schedule: {
    type: 'crontab',
    value: '* * * * *',
  },
  checkinMargin: 2, // In minutes. Optional.
  maxRuntime: 10, // In minutes. Optional.
  timezone: 'America/Los_Angeles', // Optional.
};

export default {
  async scheduled(event, env, ctx) {
    Sentry.withMonitor('your-cron-name', () => doSomeTaskOnASchedule(), monitorConfig);
  },
};
```
