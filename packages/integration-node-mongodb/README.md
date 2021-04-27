<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK Integration for MongoDB

[![npm version](https://img.shields.io/npm/v/@sentry/integration-node-mongodb.svg)](https://www.npmjs.com/package/@sentry/integration-node-mongodb)
[![npm dm](https://img.shields.io/npm/dm/@sentry/integration-node-mongodb.svg)](https://www.npmjs.com/package/@sentry/integration-node-mongodb)
[![npm dt](https://img.shields.io/npm/dt/@sentry/integration-node-mongodb.svg)](https://www.npmjs.com/package/@sentry/integration-node-mongodb)
[![typedoc](https://img.shields.io/badge/docs-typedoc-blue.svg)](http://getsentry.github.io/sentry-javascript/)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## Usage

```js
const Sentry = require("@sentry/node");
const Tracing = require("@sentry/tracing");
const Mongo = require("@sentry/integration-node-mongodb");

Sentry.init({
  dsn: '__PUBLIC_DSN__',
  integrations: [
    new Mongo(),
  ],
  tracesSampleRate: 1.0,
});
```
