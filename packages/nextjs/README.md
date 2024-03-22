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

Currently, the minimum Next.js supported version is `11.2.0`.

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/react` for the client, with added
functionality related to Next.js.

To use this SDK, initialize it in the Next.js configuration, in the `sentry.client.config.ts|js` file, and in the
[Next.js Instrumentation Hook](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
(`instrumentation.ts|js`).

```javascript
// next.config.js

const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  experimental: {
    // The instrumentation hook is required for Sentry to work on the serverside
    instrumentationHook: true,
  },
};

// Wrap the Next.js configuration with Sentry
module.exports = withSentryConfig(nextConfig);
```

```javascript
// sentry.client.config.js or .ts

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: '__DSN__',
  // Your Sentry configuration for the Browser...
});
```

```javascript
// instrumentation.ts

import * as Sentry from '@sentry/nextjs';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: '__DSN__',
      // Your Node.js Sentry configuration...
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: '__DSN__',
      // Your Edge Runtime Sentry configuration...
    });
  }
}
```

To set context information or send manual events, use the exported functions of `@sentry/nextjs`.

```javascript
import * as Sentry from '@sentry/nextjs';

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
