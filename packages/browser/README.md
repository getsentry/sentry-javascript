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

First, create and initialize the SDK:

```javascript
import { SentryClient } from '@sentry/browser';

SentryClient.create({
  dsn: '__DSN__',
  // ...
});
```

After that you can call function on the global `SentryClient`:

```javascript
SentryClient.setContext({ tags: { cordova: true } });
SentryClient.addBreadcrumb({ message: 'My Breadcrumb' });
SentryClient.captureMessage('Hello, world!');
SentryClient.captureException(new Error('Good bye'));
```

If you don't want to use a global static instance of Sentry, you can create one
on your own:

```javascript
import { BrowserFrontend } from '@sentry/browser';

const client = new BrowserFrontend({
  dsn: '__DSN__',
  // ...
});

client.install();
client.setContext({ tags: { cordova: true } });
client.addBreadcrumb({ message: 'My Breadcrumb' });
client.captureMessage('Hello, world!');
client.captureException(new Error('Good bye'));
```

Note that `install()` returns a `Promise` that resolves when the installation
has finished. However, it is not necessary to wait for the installation before
adding breadcrumbs, defining context or sending events.
