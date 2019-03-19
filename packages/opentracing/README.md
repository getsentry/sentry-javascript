<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Sentry JavaScript OpenTracing API

[![npm version](https://img.shields.io/npm/v/@sentry/opentracing.svg)](https://www.npmjs.com/package/@sentry/opentracing)
[![npm dm](https://img.shields.io/npm/dm/@sentry/opentracing.svg)](https://www.npmjs.com/package/@sentry/opentracing)
[![npm dt](https://img.shields.io/npm/dt/@sentry/opentracing.svg)](https://www.npmjs.com/package/@sentry/opentracing)
[![typedoc](https://img.shields.io/badge/docs-typedoc-blue.svg)](http://getsentry.github.io/sentry-javascript/)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This package implements the OpenTracing API and provides an integration that can be used by our other SDKs.

```js
import * as Sentry from '@sentry/browser';
import * as OpenTracing from '@sentry/opentracing';

const ot = new OpenTracing.Integration(ENV.traceId);

Sentry.init({
  debug: true,
  dsn: ENV.sentry.dsn,
  integrations: [ot],
  beforeSend(event) {
    console.log(event);
    return event;
  },
});
```
