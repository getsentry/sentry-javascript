<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Bun (Beta)

[![npm version](https://img.shields.io/npm/v/@sentry/bun.svg)](https://www.npmjs.com/package/@sentry/bun)
[![npm dm](https://img.shields.io/npm/dm/@sentry/bun.svg)](https://www.npmjs.com/package/@sentry/bun)
[![npm dt](https://img.shields.io/npm/dt/@sentry/bun.svg)](https://www.npmjs.com/package/@sentry/bun)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

The Sentry Bun SDK is in beta. Please help us improve the SDK by
[reporting any issues or giving us feedback](https://github.com/getsentry/sentry-javascript/issues).

## Usage

To use this SDK, call `init(options)` as early as possible in the main entry module. This will initialize the SDK and
hook into the environment. Note that you can turn off almost all side effects using the respective options.

```javascript
// CJS Syntax
const Sentry = require('@sentry/bun');
// ESM Syntax
import * as Sentry from '@sentry/bun';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

To set context information or send manual events, use the exported functions of `@sentry/bun`. Note that these functions
will not perform any action before you have called `init()`:

```javascript
// Set user information, as well as tags and further extras
Sentry.setExtra('battery', 0.7);
Sentry.setTag('user_mode', 'admin');
Sentry.setUser({ id: '4711' });

// Add a breadcrumb for future events
Sentry.addBreadcrumb({
  message: 'My Breadcrumb',
  // ...
});

// Capture exceptions, messages or manual events
Sentry.captureMessage('Hello, world!');
Sentry.captureException(new Error('Good bye'));
Sentry.captureEvent({
  message: 'Manual',
  stacktrace: [
    // ...
  ],
});
```

It's not possible to capture unhandled exceptions, unhandled promise rejections now - Bun is working on adding support
for it. [Github Issue](https://github.com/oven-sh/bun/issues/5091) follow this issue. To report errors to Sentry, you
have to manually try-catch and call `Sentry.captureException` in the catch block.

```ts
import * as Sentry from '@sentry/bun';

try {
  throw new Error('test');
} catch (e) {
  Sentry.captureException(e);
}
```
