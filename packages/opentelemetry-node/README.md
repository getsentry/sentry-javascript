<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for OpenTelemetry Node (legacy)

[![npm version](https://img.shields.io/npm/v/@sentry/opentelemetry-node.svg)](https://www.npmjs.com/package/@sentry/opentelemetry-node)
[![npm dm](https://img.shields.io/npm/dm/@sentry/opentelemetry-node.svg)](https://www.npmjs.com/package/@sentry/opentelemetry-node)
[![npm dt](https://img.shields.io/npm/dt/@sentry/opentelemetry-node.svg)](https://www.npmjs.com/package/@sentry/opentelemetry-node)

This package allows you to send your NodeJS OpenTelemetry trace data to Sentry via OpenTelemetry SpanProcessors.

**Note**
While this package is not deprecated as of now, it is recommended to use either [@sentry/opentelemetry](../opentelemetry/) or [@sentry/node-opentelemetry](../node-opentelemetry/) instead. These provide a more holistical integration of Sentry & OpenTelemetry than this package does.

This SDK is **considered experimental and in an alpha state**. It may experience breaking changes. Please reach out on
[GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback/concerns.



## Installation

```bash
npm install @sentry/node @sentry/opentelemetry-node

# Or yarn
yarn add @sentry/node @sentry/opentelemetry-node
```

Note that `@sentry/opentelemetry-node` depends on the following peer dependencies:

- `@opentelemetry/api` version `1.0.0` or greater
- `@opentelemetry/sdk-trace-base` version `1.0.0` or greater, or a package that implements that, like
  `@opentelemetry/sdk-node`.

## Usage

You need to register the `SentrySpanProcessor` and `SentryPropagator` with your OpenTelemetry installation:

```js
const Sentry = require("@sentry/node");
const {
  SentrySpanProcessor,
  SentryPropagator,
} = require("@sentry/opentelemetry-node");

const opentelemetry = require("@opentelemetry/sdk-node");
const otelApi = require("@opentelemetry/api");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-grpc");

// Make sure to call `Sentry.init` BEFORE initializing the OpenTelemetry SDK
Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
  // set the instrumenter to use OpenTelemetry instead of Sentry
  instrumenter: 'otel',
  // ...
});

const sdk = new opentelemetry.NodeSDK({
  // Existing config
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [getNodeAutoInstrumentations()],

  // Sentry config
  spanProcessor: new SentrySpanProcessor(),
  textMapPropagator: new SentryPropagator(),
});

sdk.start();
```

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
