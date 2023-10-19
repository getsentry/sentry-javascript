<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for OpenTelemetry

[![npm version](https://img.shields.io/npm/v/@sentry/opentelemetry.svg)](https://www.npmjs.com/package/@sentry/opentelemetry)
[![npm dm](https://img.shields.io/npm/dm/@sentry/opentelemetry.svg)](https://www.npmjs.com/package/@sentry/opentelemetry)
[![npm dt](https://img.shields.io/npm/dt/@sentry/opentelemetry.svg)](https://www.npmjs.com/package/@sentry/opentelemetry)

This package allows you to send your OpenTelemetry trace data to Sentry via OpenTelemetry SpanProcessors.

This SDK is **considered experimental and in an alpha state**. It may experience breaking changes. Please reach out on
[GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback/concerns.

## Installation

```bash
npm install @sentry/opentelemetry

# Or yarn
yarn add @sentry/opentelemetry
```

Note that `@sentry/opentelemetry` depends on the following peer dependencies:

- `@opentelemetry/api` version `1.0.0` or greater
- `@opentelemetry/core` version `1.0.0` or greater
- `@opentelemetry/semantic-conventions` version `1.0.0` or greater
- `@opentelemetry/sdk-trace-base` version `1.0.0` or greater, or a package that implements that, like
  `@opentelemetry/sdk-node`.

## Usage

This package exposes a few building blocks you can add to your OpenTelemetry setup in order to capture OpenTelemetry traces to Sentry.

This is how you can use this in your app:

1. Setup the global hub for OpenTelemetry compatibility - ensure `setupGlobalHub()` is called before anything else!
1. Initialize Sentry, e.g. `@sentry/node` - make sure to set `instrumenter: 'otel'` in the SDK `init({})`!
1. Call `setupEventContextTrace(client)`
1. Add `SentrySampler` as sampler
1. Add `SentrySpanProcessor` as span processor
1. Add a context manager wrapped via `wrapContextManagerClass`
1. Add `SentryPropagator` as propagator
1. Setup OTEL-powered async context strategy for Sentry via `setOpenTelemetryContextAsyncContextStrategy()`

For example, you could set this up as follows:

```js
import * as Sentry from '@sentry/node';
import {
  getCurrentHub,
  setupGlobalHub,
  SentryPropagator,
  SentrySampler,
  SentrySpanProcessor,
  setupEventContextTrace,
  wrapContextManagerClass,
  setOpenTelemetryContextAsyncContextStrategy,
} from '@sentry/opentelemetry';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

function setupSentry() {
  setupGlobalHub();

  Sentry.init({
    dsn: 'xxx',
    instrumenter: 'otel'
  });

  const client = getCurrentHub().getClient();
  setupEventContextTrace(client);

  const provider = new BasicTracerProvider({
    sampler: new SentrySampler(client),
  });
  provider.addSpanProcessor(new SentrySpanProcessor());

  const SentryContextManager = wrapContextManagerClass(AsyncLocalStorageContextManager);

  // Initialize the provider
  provider.register({
    propagator: new SentryPropagator(),
    contextManager: new SentryContextManager(),
  });

  setOpenTelemetryContextAsyncContextStrategy();
}
```

A full setup example can be found in (node-experimental)[./../node-experimental].

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
