<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK for Browsers (JavaScript)

[![npm version](https://img.shields.io/npm/v/@sentry/browser.svg)](https://www.npmjs.com/package/@sentry/browser)
[![npm dm](https://img.shields.io/npm/dm/@sentry/browser.svg)](https://www.npmjs.com/package/@sentry/browser)
[![npm dt](https://img.shields.io/npm/dt/@sentry/browser.svg)](https://www.npmjs.com/package/@sentry/browser)

## Usage

To use this SDK, call `SentryClient.create(options)` as early as possible after
loading the page. This will initialize the SDK and hook into the environment.
Note that you can turn off almost all side effects using the respective options.

```javascript
import { SentryClient } from '@sentry/browser';

SentryClient.create({
  dsn: '__DSN__',
  // ...
});
```

To set context information or send manual events, use the provided methods on
`SentryClient`. Note that these functions will not perform any action before you
have called `SentryClient.install()`:

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
import { BrowserFrontend } from '@sentry/browser';

const client = new BrowserFrontend({
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
import { BrowserFrontend } from '@sentry/browser';

const client = new BrowserFrontend({
  dsn: '__DSN__',
  // ...
});

const success = await client.install();
if (success) {
  // Will catch global exceptions, record breadcrumbs for DOM events, etc...
} else {
  // Limited instrumentation, but sending events will still work
}
```
