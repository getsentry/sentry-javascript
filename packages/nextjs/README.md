<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Next.js

[![npm version](https://img.shields.io/npm/v/@sentry/nextjs.svg)](https://www.npmjs.com/package/@sentry/nextjs)
[![npm dm](https://img.shields.io/npm/dm/@sentry/nextjs.svg)](https://www.npmjs.com/package/@sentry/nextjs)
[![npm dt](https://img.shields.io/npm/dt/@sentry/nextjs.svg)](https://www.npmjs.com/package/@sentry/nextjs)

> See the [Official Sentry Next.js SDK Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) to get started.

## Compatibility

Currently, the minimum supported version of Next.js is `13.2.0`.

## Installation

To get started installing the SDK, use the Sentry Next.js Wizard by running the following command in your terminal or
read the [Getting Started Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/):

```sh
npx @sentry/wizard@latest -i nextjs
```

The wizard will prompt you to log in to Sentry. After the wizard setup is completed, the SDK will automatically capture
unhandled errors, and monitor performance.

## Custom Usage

To set context information or to send manual events, you can use `@sentry/nextjs` as follows:

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

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry.io](https://sentry.io/?utm_source=github&utm_medium=npm_nextjs)
- [Sentry Discord Server](https://discord.gg/Ww9hbqr)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/sentry)

## Disabling Tracing

If you want to disable tracing in your Next.js application, there are two approaches:

### 1. Tree-shaking Tracing Code (Recommended)

You can use the `__SENTRY_TRACING__` build-time flag to tree-shake (remove) all tracing-related code from your bundles. This reduces the bundle size and ensures no tracing code is executed.

Configure your bundler to replace `__SENTRY_TRACING__` with `false`:

```js
// next.config.js with Sentry
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  // Your Next.js configuration
  webpack: (config, options) => {
    config.plugins.push(
      new options.webpack.DefinePlugin({
        __SENTRY_TRACING__: false,
      }),
    );
    return config;
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Your Sentry Webpack plugin options
});
```

### 2. Runtime Configuration

To disable tracing at runtime while keeping the tracing code in your bundles, simply **do not set** `tracesSampleRate` or `tracesSampler` in your Sentry configuration.

**Important:** Do NOT set `tracesSampleRate: 0` as this will still initialize tracing infrastructure. Instead, completely omit the option:

```js
// sentry.client.config.js
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: '__YOUR_DSN__',
  // Do NOT include tracesSampleRate or tracesSampler
  // ❌ tracesSampleRate: 0, // Don't do this
  // ✅ Simply omit the option
});
```

The same applies to your server and edge configurations.
