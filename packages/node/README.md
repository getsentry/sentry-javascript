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

First you have to create the core and `use` a corresponding SDK.

```javascript
import { SentryClient } from '@sentry/node';

SentryClient.create({
  dsn: '__DSN__',
  // ...
});
```

After that you can call function on the global `sharedClient`:

```javascript
SentryClient.setContext({ tags: { cordova: true } });
SentryClient.addBreadcrumb({ message: 'My Breadcrumb' });
SentryClient.captureMessage('Hello, world!');
SentryClient.captureException(new Error('Good bye'));
```

If you don't want to use a global static instance of Sentry, you can create one
on your own:

```javascript
import { NodeFrontend } from '@sentry/node';

const client = new NodeFrontend({
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
