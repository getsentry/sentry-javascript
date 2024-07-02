<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for NestJS (EXPERIMENTAL)

[![npm version](https://img.shields.io/npm/v/@sentry/nestjs.svg)](https://www.npmjs.com/package/@sentry/nestjs)
[![npm dm](https://img.shields.io/npm/dm/@sentry/nestjs.svg)](https://www.npmjs.com/package/@sentry/nestjs)
[![npm dt](https://img.shields.io/npm/dt/@sentry/nestjs.svg)](https://www.npmjs.com/package/@sentry/nestjs)

This SDK is considered **experimental and in an alpha state**. It may experience breaking changes. Please reach out on
[GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback or concerns.

## Installation

```bash
npm install @sentry/nestjs

# Or yarn
yarn add @sentry/nestjs
```

## Usage

```js
// CJS Syntax
const Sentry = require('@sentry/nestjs');
// ESM Syntax
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

Note that it is necessary to initialize Sentry **before you import any package that may be instrumented by us**.

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/nestjs/)
