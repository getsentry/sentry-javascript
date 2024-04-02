<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Node

[![npm version](https://img.shields.io/npm/v/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)
[![npm dm](https://img.shields.io/npm/dm/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)
[![npm dt](https://img.shields.io/npm/dt/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)

## Installation

```bash
npm install @sentry/node

# Or yarn
yarn add @sentry/node
```

## Usage

```js
// CJS Syntax
const Sentry = require('@sentry/node');
// ESM Syntax
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

Note that it is necessary to initialize Sentry **before you import any package that may be instrumented by us**.

[More information on how to set up Sentry for Node in v8.](https://github.com/getsentry/sentry-javascript/blob/develop/docs/v8-node.md)

### ESM Support

Due to the way OpenTelemetry handles instrumentation, this only works out of the box for CommonJS (`require`)
applications.

There is experimental support for running OpenTelemetry with ESM (`"type": "module"`):

```bash
node --experimental-loader=@opentelemetry/instrumentation/hook.mjs ./app.js
```

You'll need to install `@opentelemetry/instrumentation` in your app to ensure this works.

See
[OpenTelemetry Instrumentation Docs](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation#instrumentation-for-es-modules-in-nodejs-experimental)
for details on this - but note that this is a) experimental, and b) does not work with all integrations.

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
