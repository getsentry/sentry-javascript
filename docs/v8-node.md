# Using `@sentry/node` in v8

With v8, `@sentry/node` has been completely overhauled. It is now powered by [OpenTelemetry](https://opentelemetry.io/)
under the hood.

## What is OpenTelemetry

You do not need to know or understand what OpenTelemetry is in order to use Sentry. We set up OpenTelemetry under the
hood, no knowledge of it is required in order to get started.

If you want, you can use OpenTelemetry-native APIs to start spans, and Sentry will pick up everything automatically.

## Supported Frameworks & Libraries

We support the following Node Frameworks out of the box:

- [Express](#express)
- [Fastify](#fastify)
- Koa
- Nest.js
- Hapi

We also support auto instrumentation for the following libraries:

- mysql
- mysql2
- pg
- GraphQL (including Apollo Server)
- mongo
- mongoose
- Prisma

## General Changes to v7

There are some general changes that have been made that apply to any usage of `@sentry/node`.

### `Sentry.init()` has to be called before any other require/import

Due to the way that OpenTelemetry auto instrumentation works, it is required that you initialize Sentry _before_ you
require or import any other package. Any package that is required/imported before Sentry is initialized may not be
correctly auto-instrumented.

```js
// In v7, this was fine:
const Sentry = require('@sentry/node');
const express = require('express');

Sentry.init({
  // ...
});

const app = express();
```

```js
// In v8, in order to ensure express is instrumented,
// you have to initialize before you import:
const Sentry = require('@sentry/node');
Sentry.init({
  // ...
});

const express = require('express');
const app = express();
```

### Performance Instrumentation is enabled by default

All performance auto-instrumentation will be automatically enabled if the package is found. You do not need to add any
integration yourself, and `autoDiscoverNodePerformanceMonitoringIntegrations()` has also been removed.

### Old Performance APIs are removed

See [New Performance APIs](./v8-new-performance-apis.md) for details.

### ESM Support

For now, ESM support is only experimental. For the time being we only fully support CJS-based Node application - we are
working on this during the v8 alpha/beta cycle.

## Express

The following shows how you can setup Express instrumentation in v8. This will capture performance data & errors for
your Express app.

```js
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1,
});

const express = require('express');
const app = express();

// add routes etc. here

Sentry.setupExpressErrorHandler(app);
// add other error middleware below this, if needed

app.listen(3000);
```

## Fastify

The following shows how you can setup Fastify instrumentation in v8. This will capture performance data & errors for
your Fastify app.

```js
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1,
});

const { fastify } = require('fastify');
const app = fastify();
Sentry.setupFastifyErrorHandler(app);

// add routes etc. here

app.listen();
```
