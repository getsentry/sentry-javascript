<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Next.js

[![npm version](https://img.shields.io/npm/v/@sentry/nextjs.svg)](https://www.npmjs.com/package/@sentry/nextjs)
[![npm dm](https://img.shields.io/npm/dm/@sentry/nextjs.svg)](https://www.npmjs.com/package/@sentry/nextjs)
[![npm dt](https://img.shields.io/npm/dt/@sentry/nextjs.svg)](https://www.npmjs.com/package/@sentry/nextjs)

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## Compatibility

Currently, the minimum Next.js supported version is `10.0.8`.

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/react` for the client, with added functionality related to Next.js.

To use this SDK, init it in the Sentry config files.

```javascript
// sentry.client.config.js

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: "__DSN__",
  // ...
});
```

```javascript
// sentry.server.config.js

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: "__DSN__",
  // ...
});
```

To set context information or send manual events, use the exported functions of `@sentry/nextjs`.

```javascript
import * as Sentry from '@sentry/nextjs';

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
