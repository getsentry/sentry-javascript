<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Solid Start (EXPERIMENTAL)

[![npm version](https://img.shields.io/npm/v/@sentry/solidstart.svg)](https://www.npmjs.com/package/@sentry/solidstart)
[![npm dm](https://img.shields.io/npm/dm/@sentry/solidstart.svg)](https://www.npmjs.com/package/@sentry/solidstart)
[![npm dt](https://img.shields.io/npm/dt/@sentry/solidstart.svg)](https://www.npmjs.com/package/@sentry/solidstart)

This SDK is considered ⚠️ **experimental and in an alpha state**. It may experience breaking changes. Please reach out
on [GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback or concerns. This
SDK is for [Solid Start](https://start.solidjs.com/). If you're using [Solid](https://www.solidjs.com/) see our Solid
SDK here.

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/solidstart/)

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/solid` for the client side, with added
functionality related to Solid Start.

## Manual Setup

If the setup through the wizard doesn't work for you, you can also set up the SDK manually.

### 1. Prerequesits & Installation

Install the Sentry Solid Start SDK:

```bash
# Using npm
npm install @sentry/solidstart

# Using yarn
yarn add @sentry/solidstart
```

### 2. Client-side Setup

Initialize the SDK in `entry-client.jsx`

```jsx
import * as Sentry from '@sentry/solidstart';
import { mount, StartClient } from '@solidjs/start/client';

Sentry.init({
  dsn: '__PUBLIC_DSN__',
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
});

mount(() => <StartClient />, document.getElementById('app'));
```

### 3. Server-side Setup

Create an instrumentation file named `instrument.server.mjs` and add your initialization code for the server-side SDK.

```javascript
import * as Sentry from '@sentry/solidstart';

Sentry.init({
  dsn: 'https://0e67f7dd5326d51506e92d7f1eff887a@o447951.ingest.us.sentry.io/4507459091824640',
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
});
```

### 4. Run your application

Then run your app

```bash
NODE_OPTIONS='--import=./instrument.server.mjs' yarn start
# or
NODE_OPTIONS='--require=./instrument.server.cjs' yarn start
```

# Solid Router

The Solid Router instrumentation uses the Solid Router library to create navigation spans to ensure you collect
meaningful performance data about the health of your page loads and associated requests.

Wrap `Router`, `MemoryRouter` or `HashRouter` from `@solidjs/router` using `withSentryRouterRouting`. This creates a
higher order component, which will enable Sentry to reach your router context.

```js
import { withSentryRouterRouting } from '@sentry/solid/solidrouter';
import { Route, Router } from '@solidjs/router';

const SentryRouter = Sentry.withSentryRouterRouting(Router);

render(
  () => (
    <SentryRouter>
      <Route path="/" component={App} />
      ...
    </SentryRouter>
  ),
  document.getElementById('root'),
);
```

# Solid ErrorBoundary

To automatically capture exceptions from inside a component tree and render a fallback component, wrap the native Solid
JS `ErrorBoundary` component with `Sentry.withSentryErrorBoundary`.

```js
import * as Sentry from '@sentry/solidstart';
import { ErrorBoundary } from 'solid-js';

Sentry.init({
  dsn: '__PUBLIC_DSN__',
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
});

const SentryErrorBoundary = Sentry.withSentryErrorBoundary(ErrorBoundary);

render(
  () => (
    <SentryErrorBoundary fallback={err => <div>Error: {err.message}</div>}>
      <ProblematicComponent />
    </SentryErrorBoundary>
  ),
  document.getElementById('root'),
);
```
