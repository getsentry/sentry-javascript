<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

> NOTICE: This package is in alpha state and may be subject to breaking changes.

# Official Sentry SDK for Elysia

[![npm version](https://img.shields.io/npm/v/@sentry/elysia.svg)](https://www.npmjs.com/package/@sentry/elysia)
[![npm dm](https://img.shields.io/npm/dm/@sentry/elysia.svg)](https://www.npmjs.com/package/@sentry/elysia)
[![npm dt](https://img.shields.io/npm/dt/@sentry/elysia.svg)](https://www.npmjs.com/package/@sentry/elysia)

> **Alpha**: This SDK is in alpha stage and may have breaking changes in future releases.

## Usage

```javascript
import * as Sentry from '@sentry/elysia';
import { Elysia } from 'elysia';

Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
});

const app = Sentry.withElysia(new Elysia())
  .get('/', () => 'Hello World')
  .listen(3000);
```

## Links

<!-- - [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/elysia/) -->

- [Sentry.io](https://sentry.io/?utm_source=github&utm_medium=npm_elysia)
- [Sentry Discord Server](https://discord.gg/Ww9hbqr)
