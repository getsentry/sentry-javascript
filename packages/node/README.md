<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK for NodeJS

[![npm version](https://img.shields.io/npm/v/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)
[![npm dm](https://img.shields.io/npm/dm/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)
[![npm dt](https://img.shields.io/npm/dt/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)

## Usage

To use this SDK, call `SentryClient.create(options)` as early as possible in the
main entry module. This will initialize the SDK and hook into the environment.
Note that you can turn off almost all side effects using the respective options.

```javascript
import { SentryClient } from '@sentry/node';

SentryClient.create({
  dsn: '__DSN__',
  // ...
});
```

To set context information or send manual events, use the provided methods on
`SentryClient`. Note that these functions will not perform any action before you
have called `SentryClient.create()`:

```javascript
// Set user information, as well as tags and further extras
SentryClient.setContext({
  extra: { battery: 0.7 },
  tags: { user_mode: 'admin' },
  user: { id: '4711' },
});

// Add a breadcrumb for future events
SentryClient.addBreadcrumb({
  message: 'My Breadcrumb',
  // ...
});

// Capture exceptions, messages or manual events
SentryClient.captureMessage('Hello, world!');
SentryClient.captureException(new Error('Good bye'));
SentryClient.captureEvent({
  message: 'Manual',
  stacktrace: [
    // ...
  ],
});
```

## Advanced Usage

If you don't want to use a global static instance of Sentry, you can create one
yourself:

```javascript
import { NodeFrontend } from '@sentry/node';

const client = new NodeFrontend({
  dsn: '__DSN__',
  // ...
});

client.install();
// ...
```

Note that `install()` returns a `Promise` that resolves when the installation
has finished. It is not necessary to wait for the installation before adding
breadcrumbs, defining context or sending events. However, the return value
indicates whether the installation was successful and the environment could be
instrumented:

```javascript
import { NodeFrontend } from '@sentry/node';

const client = new NodeFrontend({
  dsn: '__DSN__',
  // ...
});

const success = await client.install();
if (success) {
  // Will capture unhandled promise rejections, etc...
} else {
  // Limited instrumentation, but sending events will still work
}
```
