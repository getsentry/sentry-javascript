<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Solid

[![npm version](https://img.shields.io/npm/v/@sentry/solid.svg)](https://www.npmjs.com/package/@sentry/solid)
[![npm dm](https://img.shields.io/npm/dm/@sentry/solid.svg)](https://www.npmjs.com/package/@sentry/solid)
[![npm dt](https://img.shields.io/npm/dt/@sentry/solid.svg)](https://www.npmjs.com/package/@sentry/solid)

This SDK is in **Beta**. The API is stable but updates may include minor changes in behavior. Please reach out on
[GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback or concerns. This
SDK is for [Solid](https://www.solidjs.com/). If you're using [SolidStart](https://start.solidjs.com/) see our
[SolidStart SDK here](https://github.com/getsentry/sentry-javascript/tree/develop/packages/solidstart).

# Solid Router

The Solid Router instrumentation uses the Solid Router library to create navigation spans to ensure you collect
meaningful performance data about the health of your page loads and associated requests.

Add `solidRouterBrowserTracingIntegration` instead of the regular `Sentry.browserTracingIntegration`.

Make sure `solidRouterBrowserTracingIntegration` is initialized by your `Sentry.init` call. Otherwise, the routing
instrumentation will not work properly.

Wrap `Router`, `MemoryRouter` or `HashRouter` from `@solidjs/router` using `withSentryRouterRouting`. This creates a
higher order component, which will enable Sentry to reach your router context.

```js
import * as Sentry from '@sentry/solid';
import { solidRouterBrowserTracingIntegration, withSentryRouterRouting } from '@sentry/solid/solidrouter';
import { Route, Router } from '@solidjs/router';

Sentry.init({
  dsn: '__PUBLIC_DSN__',
  integrations: [solidRouterBrowserTracingIntegration()],
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
});

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

### Tanstack Router

The Tanstack Router instrumentation uses the Tanstack Router library to create navigation spans to ensure you collect
meaningful performance data about the health of your page loads and associated requests.

Add `tanstackRouterBrowserTracingIntegration` instead of the regular `Sentry.browserTracingIntegration`.

Make sure `tanstackRouterBrowserTracingIntegration` is initialized by your `Sentry.init` call. Otherwise, the routing
instrumentation will not work properly.

Pass your router instance from `createRouter` to the integration.

```js
import * as Sentry from '@sentry/solid';
import { tanstackRouterBrowserTracingIntegration } from '@sentry/solid/tanstackrouter';

const router = createRouter({
  // your router config
  // ...
});

declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router;
  }
}

Sentry.init({
  dsn: '__PUBLIC_DSN__',
  integrations: [tanstackRouterBrowserTracingIntegration(router)],
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
});

render(() => <App />, document.getElementById('root'));
```

# Solid ErrorBoundary

To automatically capture exceptions from inside a component tree and render a fallback component, wrap the native Solid
JS `ErrorBoundary` component with `Sentry.withSentryErrorBoundary`.

```js
import * as Sentry from '@sentry/solid';
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

# Sourcemaps and Releases

To generate and upload source maps of your Solid JS app bundle, check our guide
[how to configure your bundler](https://docs.sentry.io/platforms/javascript/guides/solid/sourcemaps/#uploading-source-maps)
to emit source maps.
