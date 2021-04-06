<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK for Next.js

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/react` for the client, with added functionality related to Next.js.

To use this SDK, init it in the Sentry config files and import it in your code.

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

```javascript
// pages/index.js

import * as Sentry from '@sentry/nextjs';
```

To set context information or send manual events, use the exported functions of `@sentry/nextjs`.
Note that these functions will not perform any action before you have imported the SDK:

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
