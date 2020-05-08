# sentry-rrweb

This integration is a WIP.

## Pre-Requisites

For the sentry-rrweb integration to work, you must have the [Sentry browser SDK package](https://www.npmjs.com/package/@sentry/browser) and the [rrweb package](https://www.npmjs.com/package/rrweb) installed.

## Installation

To install the stable version:

with npm:

```shell
npm install --save @sentry/rrweb
```

with yarn:

```shell
yarn add @sentry/rrweb
```

## Setup

To set up the integration add the following to your Sentry initialization:

```javascript
import * as Sentry from '@sentry/browser';
import SentryRRWeb from '@sentry/rrweb';

Sentry.init({
  dsn: '__DSN__',
  integrations: [
    new SentryRRWeb({
      // ...options
    }),
  ],
  // ...
});
```

Several options are supported and passable via the integration constructor:

```javascript
import * as Sentry from '@sentry/browser';
import SentryRRWeb from '@sentry/rrweb';

Sentry.init({
  dsn: '__DSN__',
  integrations: [
    new SentryRRWeb({
      // default is empty
      checkoutEveryNth: 100,
      // default is 5 minutes
      checkoutEveryNms: 15 * 60 * 1000,
      // on by default
      maskAllInputs: false,
    }),
  ],
  // ...
});
```

See the rrweb documentation for advice on configuring these values.
