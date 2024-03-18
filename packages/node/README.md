<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Legacy Sentry SDK for NodeJS

[![npm version](https://img.shields.io/npm/v/@sentry/node-experimental.svg)](https://www.npmjs.com/package/@sentry/node-experimental)
[![npm dm](https://img.shields.io/npm/dm/@sentry/node-experimental.svg)](https://www.npmjs.com/package/@sentry/node-experimental)
[![npm dt](https://img.shields.io/npm/dt/@sentry/node-experimental.svg)](https://www.npmjs.com/package/@sentry/node-experimental)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## Status

Since v8, this is the _legacy_ SDK, and it will most likely be completely removed before v8 is fully stable. It only
exists so that Meta-SDKs like `@sentry/nextjs` or `@sentry/sveltekit` can be migrated to the new `@sentry/node`
step-by-step.

You should instead use [@sentry/node](./../node-experimental/).

## Usage

To use this SDK, call `init(options)` as early as possible in the main entry module. This will initialize the SDK and
hook into the environment. Note that you can turn off almost all side effects using the respective options. Minimum
supported Node version is Node 14.

```javascript
// CJS syntax
const Sentry = require('@sentry/node-experimental');
// ESM syntax
import * as Sentry from '@sentry/node-experimental';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

To set context information or send manual events, use the exported functions of `@sentry/node-experimental`. Note that
these functions will not perform any action before you have called `init()`:

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
