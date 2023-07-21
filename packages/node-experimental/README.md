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
// ES5 Syntax
const Sentry = require('@sentry/node-experimental');
// ES6 Syntax
import * as Sentry from '@sentry/node-experimental';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

Note that it is necessary to initialize Sentry **before you import any package that may be instrumented by us**.

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
