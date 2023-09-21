<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Vercel Edge Runtime [ALPHA]

[![npm version](https://img.shields.io/npm/v/@sentry/vercel-edge.svg)](https://www.npmjs.com/package/@sentry/vercel-edge)
[![npm dm](https://img.shields.io/npm/dm/@sentry/vercel-edge.svg)](https://www.npmjs.com/package/@sentry/vercel-edge)
[![npm dt](https://img.shields.io/npm/dt/@sentry/vercel-edge.svg)](https://www.npmjs.com/package/@sentry/vercel-edge)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

**Note: This SDK is still in an alpha state. Breaking changes can occur at any time.**

## Usage

To use this SDK, call `init(options)` as early as possible in the main entry module. This will initialize the SDK and
hook into the environment. Note that you can turn off almost all side effects using the respective options.

```javascript
// CJS Syntax
const Sentry = require('@sentry/vercel-edge');
// ESM Syntax
import * as Sentry from '@sentry/vercel-edge';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

To set context information or send manual events, use the exported functions of `@sentry/vercel-edge`. Note that these
functions will not perform any action before you have called `init()`:

```javascript
// Set user information, as well as tags and further extras
Sentry.configureScope(scope => {
  scope.setExtra('battery', 0.7);
  scope.setTag('user_mode', 'admin');
  scope.setUser({ id: '4711' });
  // scope.clear();
});

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
