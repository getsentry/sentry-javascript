<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for TanStack Start React (Alpha)

[![npm version](https://img.shields.io/npm/v/@sentry/tanstackstart-react.svg)](https://www.npmjs.com/package/@sentry/tanstackstart-react)
[![npm dm](https://img.shields.io/npm/dm/@sentry/tanstackstart-react.svg)](https://www.npmjs.com/package/@sentry/tanstackstart-react)
[![npm dt](https://img.shields.io/npm/dt/@sentry/tanstackstart-react.svg)](https://www.npmjs.com/package/@sentry/tanstackstart-react)

> NOTICE: This package is in alpha state and may be subject to breaking changes.

## Getting Started

This SDK does not have docs yet. Stay tuned.

## Compatibility

The minimum supported version of TanStack Start is `1.111.12`.

## Custom Usage

To set context information or to send manual events, you can use `@sentry/tanstackstart-react` as follows:

```ts
import * as Sentry from '@sentry/tanstackstart-react';

// Set user information, as well as tags and further extras
Sentry.setTag('user_mode', 'admin');
Sentry.setUser({ id: '4711' });
Sentry.setContext('application_area', { location: 'checkout' });

// Add a breadcrumb for future events
Sentry.addBreadcrumb({
  message: '"Add to cart" clicked',
  // ...
});

// Capture exceptions or messages
Sentry.captureException(new Error('Oh no.'));
Sentry.captureMessage('Hello, world!');
```

## Links

<!-- - [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/) -->

- [Sentry.io](https://sentry.io/?utm_source=github&utm_medium=npm_tanstackstartreact)
- [Sentry Discord Server](https://discord.gg/Ww9hbqr)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/sentry)
