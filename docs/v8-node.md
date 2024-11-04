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
- [Connect](#connect)
- [Koa](#koa)
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

We recommend creating a file named `instrument.js` that imports and initializes Sentry.

```js
// In v8, create a separate file that initializes sentry.
// Then pass the file to Node via --require or --import.
const Sentry = require('@sentry/node');
Sentry.init({
  // ...
});
```

Adjust the Node.js call for your application to use the [--require](https://nodejs.org/api/cli.html#-r---require-module)
or [--import](https://nodejs.org/api/cli.html#--importmodule) parameter and point it at `instrument.js`. Using
`--require` or `--import` is the easiest way to guarantee that Sentry is imported and initialized before any other
modules in your application

```bash
# If you are using CommonJS (CJS)
node --require ./instrument.js app.js

# If you are using ECMAScript Modules (ESM)
# Note: This is only available for Node v18.19.0 onwards.
node --import ./instrument.mjs app.mjs
```

**Alternatively**, if you cannot run node with `--require` or `--import`, add a top level import of `instrument.js` in
your application.

```js
require('./instrument.js');

const express = require('express');
const app = express();
```

### Performance Instrumentation is enabled by default

All performance auto-instrumentation will be automatically enabled if the package is found. You do not need to add any
integration yourself, and `autoDiscoverNodePerformanceMonitoringIntegrations()` has also been removed.

### Old Performance APIs are removed

See [New Performance APIs](./v8-new-performance-apis.md) for details.

### ESM Support

Instrumentation works out of the box for CommonJS (CJS) applications based on require() calls. This means that as long
as your application is either natively in CJS, or compiled at build time to CJS, everything will work without any
further setup.

ECMAScript Modules (ESM) are only supported for Node v18.19.0 onwards.

### Using Custom OpenTelemetry Instrumentation

While we include some vetted OpenTelemetry instrumentation out of the box, you can also add your own instrumentation on
top of that. You can do that by installing an instrumentation package and setting it up like this:

```js
const Sentry = require('@sentry/node');
const { GenericPoolInstrumentation } = require('@opentelemetry/instrumentation-generic-pool');

Sentry.init({
  dsn: '__DSN__',
});

// Afterwards, you can add additional instrumentation:
Sentry.addOpenTelemetryInstrumentation(new GenericPoolInstrumentation());
```

### Using a Custom OpenTelemetry Setup

If you already have OpenTelemetry set up yourself, you can also use your existing setup.

In this case, you need to set `skipOpenTelemetrySetup: true` in your `init({})` config, and ensure you setup all the
components that Sentry needs yourself. In this case, you need to install `@sentry/opentelemetry`, and add the following:

```js
const Sentry = require('@sentry/node');
const { SentrySpanProcessor, SentryPropagator, SentryContextManager, SentrySampler } = require('@sentry/opentelemetry');

// We need a custom span processor
provider.addSpanProcessor(new SentrySpanProcessor());
// We need a custom propagator and context manager
provider.register({
  propagator: new SentryPropagator(),
  contextManager: new SentryContextManager(),
});

// And optionally, if you want to use the `tracesSamplingRate` or related options from Sentry,
// you also need to use a custom sampler when you set up your provider
const provider = new BasicTracerProvider({
  sampler: new SentrySampler(Sentry.getClient()),
});
```

## Plain Node / Unsupported Frameworks

When using `@sentry/node` in an app without any supported framework, you will still get some auto instrumentation out of
the box!

Any framework that works on top of `http`, which means any framework that handles incoming HTTP requests, will
automatically be instrumented - so you'll get request isolation & basic transactions without any further action.

For any non-HTTP scenarios (e.g. websockets or a scheduled job), you'll have to manually ensure request isolation by
wrapping the function with `Sentry.withIsolationScope()`:

```js
const Sentry = require('@sentry/node');

function myScheduledJob() {
  return Sentry.withIsolationScope(async () => {
    await doSomething();
    await doSomethingElse();
    return { status: 'DONE' };
  });
}
```

This way, anything happening inside of this function will be isolated, even if they run concurrently.

## Express

The following shows how you can setup Express instrumentation in v8. This will capture performance data & errors for
your Express app.

```js
const Sentry = require('@sentry/node');
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
const { fastify } = require('fastify');
const app = fastify();
Sentry.setupFastifyErrorHandler(app);

// add routes etc. here

app.listen();
```

## Connect

The following shows how you can setup Connect instrumentation in v8. This will capture performance data & errors for
your Fastify app.

```js
const connect = require('connect');
const Sentry = require('@sentry/node');
const app = connect();

Sentry.setupConnectErrorHandler(app);

// Add your routes, etc.

app.listen(3030);
```

## Koa

The following shows how you can setup Koa instrumentation in v8. This will capture performance data & errors for your
Fastify app.

```js
const Koa = require('koa');
const Router = require('@koa/router');
const Sentry = require('@sentry/node');

const router = new Router();
const app = new Koa();

Sentry.setupKoaErrorHandler(app);

// Add your routes, etc.

app.listen(3030);
```
