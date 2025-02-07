<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for React Router (Framework) (EXPERIMENTAL)

[![npm version](https://img.shields.io/npm/v/@sentry/react-router.svg)](https://www.npmjs.com/package/@sentry/react-router)
[![npm dm](https://img.shields.io/npm/dm/@sentry/react-router.svg)](https://www.npmjs.com/package/@sentry/react-router)
[![npm dt](https://img.shields.io/npm/dt/@sentry/react-router.svg)](https://www.npmjs.com/package/@sentry/react-router)

> [!WARNING]
> This SDK is considered ⚠️ **experimental and in an alpha state**. It may experience breaking changes. Please reach out
> on [GitHub](https://github.com/getsentry/sentry-javascript/issues/) if you have any feedback or concerns. This
> SDK is for [React Router (framework)](https://reactrouter.com/start/framework/installation). If you're using [React Router (library)](https://reactrouter.com/start/library/installation) see our
> [React SDK here](https://docs.sentry.io/platforms/javascript/guides/react/features/react-router/v7/).

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/react-router/)

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/browser` for the client side.

## Manual Setup

### Expose Hooks

React Router exposes two hooks in your `app` folder (`entry.client.tsx` and `entry.server.tsx`).
If you do not see these two files, expose them with the following command:

```bash
npx react-router reveal
```

### Client-Side Setup

Initialize the SDK in your `entry.client.tsx` file:

```tsx
import * as Sentry from '@sentry/react-router';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

Sentry.init({
  dsn: '___PUBLIC_DSN___',
  integrations: [Sentry.browserTracingIntegration()],

  tracesSampleRate: 1.0, //  Capture 100% of the transactions

  // Set `tracePropagationTargets` to declare which URL(s) should have trace propagation enabled
  tracePropagationTargets: [/^\//, /^https:\/\/yourserver\.io\/api/],
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
```

Now, update your `app/root.tsx` file to report any unhandled errors from your global error boundary:

```tsx
import * as Sentry from '@sentry/react-router';

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details = error.status === 404 ? 'The requested page could not be found.' : error.statusText || details;
  } else if (error && error instanceof Error) {
    // you only want to capture non 404-errors that reach the boundary
    Sentry.captureException(error);
    if (import.meta.env.DEV) {
      details = error.message;
      stack = error.stack;
    }
  }

  return (
    <main>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
// ...
```

### Server-Side Setup

Create an `instrument.server.mjs` file in the root of your app:

```js
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: '___PUBLIC_DSN___',
  tracesSampleRate: 1.0, // Capture 100% of the transactions
});
```

In your `entry.server.tsx` file, export the `handleError` function:

```tsx
import * as Sentry from '@sentry/node';
import { type HandleErrorFunction } from 'react-router';

export const handleError: HandleErrorFunction = (error, { request }) => {
  // React Router may abort some interrupted requests, report those
  if (!request.signal.aborted) {
    Sentry.captureException(error);

    // make sure to still log the error so you can see it
    console.error(error);
  }
};
// ... rest of your server entry
```

### Update Scripts

Since React Router is running in ESM mode, you need to use the `--import` command line options to load our server-side instrumentation module before the application starts.
Update the `start` and `dev` script to include the instrumentation file:

```json
"scripts": {
  "dev": "NODE_OPTIONS='--import ./instrument.server.mjs' react-router dev",
  "start": "NODE_OPTIONS='--import ./instrument.server.mjs' react-router-serve ./build/server/index.js",
}
```
