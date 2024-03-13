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

### Using Custom OpenTelemetry Instrumentation

While we include some vetted OpenTelemetry instrumentation out of the box, you can also add your own instrumentation on
top of that. You can do that by installing an instrumentation package (as well as `@opentelemetry/instrumentation`) and
setting it up like this:

```js
const Sentry = require('@sentry/node');
const { GenericPoolInstrumentation } = require('@opentelemetry/instrumentation-generic-pool');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

Sentry.init({
  dsn: '__DSN__',
});

// Afterwards, you can add additional instrumentation:
registerInsturmentations({
  instrumentations: [new GenericPoolInstrumentation()],
});
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
provier.register({
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
