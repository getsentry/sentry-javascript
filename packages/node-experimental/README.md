<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Node (EXPERIMENTAL)

[![npm version](https://img.shields.io/npm/v/@sentry/node-experimental.svg)](https://www.npmjs.com/package/@sentry/node-experimental)
[![npm dm](https://img.shields.io/npm/dm/@sentry/node-experimental.svg)](https://www.npmjs.com/package/@sentry/node-experimental)
[![npm dt](https://img.shields.io/npm/dt/@sentry/node-experimental.svg)](https://www.npmjs.com/package/@sentry/node-experimental)

This is a WIP, proof of concept implementation of a Node SDK that uses OpenTelemetry for performance instrumentation under the hood.

THIS MAY/WILL BREAK IN MANY UNEXPECTED WAYS. We may remove, add, change any of the integrations, add/remove any exports, etc.
This package is **NOT READY TO USE IN ANY FORM OF PRODUCTION ENVIRONMENT**!

This SDK is **considered experimental and in an alpha state**. It may experience breaking changes, and may be discontinued at any time. Please reach out on
[GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback/concerns.

## Installation

```bash
npm install @sentry/node-experimental

# Or yarn
yarn add @sentry/node-experimental
```

## Usage

```js
// CJS Syntax
const Sentry = require('@sentry/node-experimental');
// ESM Syntax
import * as Sentry from '@sentry/node-experimental';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

Note that it is necessary to initialize Sentry **before you import any package that may be instrumented by us**.

## Status of this Experiment

Currently, this SDK:

* Will capture errors (same as @sentry/node)
* Auto-instrument for performance - see below for which performance integrations are available.
* Provide _some_ manual instrumentation APIs
* Sync OpenTelemetry Context with our Sentry Scope

### Hub, Scope & Context

node-experimental has no public concept of a Hub anymore.
Instead, you always interact with a Scope, which maps to an OpenTelemetry Context.
This means that the following common API is _not_ available:

```js
const hub = Sentry.getCurrentHub();
```

Instead, you can directly get the current scope:

```js
const scope = Sentry.getCurrentScope();
```

Additionally, there are some more utilities to work with:

```js
// Get the currently active scope
const scope = Sentry.getCurrentScope();
// Get the currently active root scope
// A root scope is either the global scope, OR the first forked scope, OR the scope of the root span
const rootScope = Sentry.getCurrentRootScope();
// Create a new execution context - basically a wrapper for `context.with()` in OpenTelemetry
Sentry.withScope(scope => {});
// Create a new execution context, which should be a root scope. This overwrites any previously set root scope
Sentry.withRootScope(rootScope => {});
// Get the client of the SDK
const client = Sentry.getClient();
```

### Manual Instrumentation

You can manual instrument using the following APIs:

```js
const Sentry = require('@sentry/node-experimental');

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
const Sentry = require('@sentry/node-experimental');

// This will _not_ be put on the scope/set as active, so no other spans will be attached to it
const span = Sentry.startSpan({ description: 'non-active span' });

doSomethingSlow();

span.finish();
```

Finally you can also get the currently active span, if you need to do more with it:

```js
const Sentry = require('@sentry/node-experimental');
const span = Sentry.getActiveSpan();
```

### Async Context

We leverage the OpenTelemetry context forking in order to ensure isolation of parallel requests.
This means that as long as you are using an OpenTelemetry instrumentation for your framework of choice
(currently: Express or Fastify), you do not need to setup any `requestHandler` or similar.

### ESM Support

Due to the way OpenTelemetry handles instrumentation, this only works out of the box for CommonJS (`require`) applications.


There is experimental support for running OpenTelemetry with ESM (`"type": "module"`):

```bash
node --experimental-loader=@opentelemetry/instrumentation/hook.mjs ./app.js
```

See [OpenTelemetry Instrumentation Docs](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation#instrumentation-for-es-modules-in-nodejs-experimental) for details on this -
but note that this is a) experimental, and b) does not work with all integrations.

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
