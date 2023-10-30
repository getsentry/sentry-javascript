<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Node & OpenTelemetry

[![npm version](https://img.shields.io/npm/v/@sentry/node-opentelemetry.svg)](https://www.npmjs.com/package/@sentry/node-opentelemetry)
[![npm dm](https://img.shields.io/npm/dm/@sentry/node-opentelemetry.svg)](https://www.npmjs.com/package/@sentry/node-opentelemetry)
[![npm dt](https://img.shields.io/npm/dt/@sentry/node-opentelemetry.svg)](https://www.npmjs.com/package/@sentry/node-opentelemetry)

This package is a variant of `@sentry/node` that uses OpenTelemetry for performance instrumentation under the hood.

This SDK is **in an alpha state**. It may experience breaking changes outside of the regular SemVer release cadence. Please reach out on
[GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback/concerns.

## Installation

```bash
npm install @sentry/node-opentelemetry

# Or yarn
yarn add @sentry/node-opentelemetry
```

## Usage

Note that it is necessary to initialize Sentry **before you import any package that may be instrumented by us**.

```js
const Sentry = require('@sentry/node-opentelemetry');

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

For ESM (`"type": "module"`) environments, you have to specify a Loader:

```js
// app.js
import * as Sentry from '@sentry/node-opentelemetry';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

When running your application, run it like this:

```bash
node --experimental-loader=@opentelemetry/instrumentation/hook.mjs ./app.js
```

See [OpenTelemetry Instrumentation Docs](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation#instrumentation-for-es-modules-in-nodejs-experimental) for details on this -
but note that this is a) experimental, and b) does not work with all integrations.

### Manual Instrumentation

You can manual instrument using the following APIs:

```js
const Sentry = require('@sentry/node-opentelemetry');

Sentry.startActiveSpan({ description: 'outer' }, function (span) {
  span.setData(customData);
  doSomethingSlow();
  Sentry.startActiveSpan({ description: 'inner' }, function() {
    // inner span is a child of outer span
    doSomethingVerySlow();
    // inner span is auto-ended when this callback ends
  });
  // outer span is auto-ended when this callback ends
});
```

You can also create spans without marking them as the active span.
Note that for most scenarios, we recommend the `startActiveSpan` syntax.

```js
const Sentry = require('@sentry/node-opentelemetry');

// This will _not_ be put on the scope/set as active, so no other spans will be attached to it
const span = Sentry.startSpan({ description: 'non-active span' });

doSomethingSlow();

span.finish();
```

Finally you can also get the currently active span, if you need to do more with it:

```js
const Sentry = require('@sentry/node-opentelemetry');
const span = Sentry.getActiveSpan();
```

### Async Context

We leverage the OpenTelemetry context forking in order to ensure isolation of parallel requests.
This means that as long as you are using an OpenTelemetry instrumentation for your framework of choice
(currently: Express or Fastify), you do not need to setup any `requestHandler` or similar.

## Available (Performance) Integrations

* Http
* Express
* Fastify
* Nest
* Mysql
* Mysql2
* GraphQL
* Mongo
* Mongoose
* Postgres
* Prisma

All of these are auto-discovered, you don't need to configure anything for performance.
You still need to register middlewares etc. for error capturing.
Other, non-performance integrations from `@sentry/node` are also available (except for Undici).

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
