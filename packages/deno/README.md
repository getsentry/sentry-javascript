<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Deno (Beta)

[![npm version](https://img.shields.io/npm/v/@sentry/deno.svg)](https://www.npmjs.com/package/@sentry/deno)
[![npm dm](https://img.shields.io/npm/dm/@sentry/deno.svg)](https://www.npmjs.com/package/@sentry/deno)
[![npm dt](https://img.shields.io/npm/dt/@sentry/deno.svg)](https://www.npmjs.com/package/@sentry/deno)

## Links

- [SDK on Deno registry](https://deno.land/x/sentry)
- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

The Sentry Deno SDK is in beta. Please help us improve the SDK by
[reporting any issues or giving us feedback](https://github.com/getsentry/sentry-javascript/issues).

## Usage

To use this SDK, call `Sentry.init(options)` as early as possible in the main entry module. This will initialize the SDK
and hook into the environment. Note that you can turn off almost all side effects using the respective options.

```javascript
// Import from the Deno registry
import * as Sentry from 'https://deno.land/x/sentry/index.mjs';

// or import from npm registry
import * as Sentry from 'npm:@sentry/deno';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

To set context information or send manual events, use the exported functions of the Deno SDK. Note that these functions
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
