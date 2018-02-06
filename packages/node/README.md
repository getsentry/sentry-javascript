<p align="center">
    <a href="https://sentry.io" target="_blank" align="center">
        <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
    </a>
<br/>
    <h1>Sentry Node.js SDK Package</h1>
</p>

[![npm version](https://img.shields.io/npm/v/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)
[![npm dm](https://img.shields.io/npm/dm/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)
[![npm dt](https://img.shields.io/npm/dt/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)

## General

This package is meant to be used with the Core SDK package.

## Usage

First you have to create the core and `use` a corresponding SDK.

```javascript
import * as Sentry from '@sentry/core';
import {SentryNode} from '@sentry/node';

Sentry.create('__DSN__')
  .use(SentryNode)
  .install();
```

After that you can call function on the global `sharedClient`:

```javascript
Sentry.getSharedClient().setTagsContext({cordova: true});
Sentry.getSharedClient().captureMessage('test message');
Sentry.getSharedClient().captureBreadcrumb({message: 'HOHOHOHO'});
Sentry.getSharedClient().captureException(new Error('error'));
```

If you don't want to use a global static instance of Sentry, you can create one on your own:

```javascript
const client = await new Sentry.Client(dsn).use(MockAdapter).install()
client.setTagsContext({ cordova: true });
client.captureMessage('test message');
client.captureBreadcrumb({ message: 'HOHOHOHO' });

// OR

new Sentry.Client('__DSN__')
  .use(MockAdapter)
  .install()
  .then(client => {
    client.setTagsContext({ cordova: true });
    client.captureMessage('test message');
    client.captureBreadcrumb({ message: 'HOHOHOHO' });
  });
```

Notice, `install()` is a `Promise` but we internally wait until it is resolved, so it is save to call other function
without waiting for it.
