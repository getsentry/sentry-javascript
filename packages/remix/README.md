<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Remix

[![npm version](https://img.shields.io/npm/v/@sentry/remix.svg)](https://www.npmjs.com/package/@sentry/remix)
[![npm dm](https://img.shields.io/npm/dm/@sentry/remix.svg)](https://www.npmjs.com/package/@sentry/remix)
[![npm dt](https://img.shields.io/npm/dt/@sentry/remix.svg)](https://www.npmjs.com/package/@sentry/remix)

This package is a wrapper around `@sentry/node` for the server and `@sentry/react` for the client, with added
functionality related to Remix.

## Compatibility

Currently, the minimum supported version of Remix is `1.0.0`.

## Installation

To get started installing the SDK, use the Sentry Remix Wizard by running the following command in your terminal or
read the [Getting Started Docs](https://docs.sentry.io/platforms/javascript/guides/remix/):

```sh
npx @sentry/wizard@latest -i remix
```

The wizard will prompt you to log in to Sentry. After the wizard setup is completed, the SDK will automatically capture
unhandled errors, and monitor performance.

## Custom Usage

To set context information or to send manual events, you can use `@sentry/remix` as follows:

```ts
import * as Sentry from '@sentry/nextjs';

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
