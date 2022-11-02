<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for OpenTelemetry Node

[![npm version](https://img.shields.io/npm/v/@sentry/opentelemetry-node.svg)](https://www.npmjs.com/package/@sentry/opentelemetry-node)
[![npm dm](https://img.shields.io/npm/dm/@sentry/opentelemetry-node.svg)](https://www.npmjs.com/package/@sentry/opentelemetry-node)
[![npm dt](https://img.shields.io/npm/dt/@sentry/opentelemetry-node.svg)](https://www.npmjs.com/package/@sentry/opentelemetry-node)

## Installation

```bash
npm install @sentry/node @sentry/opentelemetry-node

# Or yarn
yarn add @sentry/node @sentry/opentelemetry-node
```

Note that `@sentry/opentelemetry-node` depends on the following peer dependencies:

* `@opentelemetry/api` version 1 or greater
* `@opentelemetry/sdk-trace-base` version 1 or greater, or a package that implements that, like `@opentelemetry/sdk-node`.

## Usage

You need to register the SentrySpanProcessor with your OpenTelemetry installation:

```js
import * as Sentry from '@sentry/node';
import { SentrySpanProcessor } from '@sentry/opentelemetry-node';

// Make sure to call this BEFORE setting up OpenTelemetry
Sentry.init({
  dsn: '__DSN__',
  // ...
});

const sdk = new opentelemetry.NodeSDK({
  // Existing config
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [ getNodeAutoInstrumentations() ],

  // Sentry config
  spanProcessor: new SentrySpanProcessor()
})
```

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)

## Usage

TODO
