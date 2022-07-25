# sentry-replay

This integration is a WIP.

## Pre-Requisites

For the sentry-replay integration to work, you must have the [Sentry browser SDK package](https://www.npmjs.com/package/@sentry/browser) and the [rrweb package](https://www.npmjs.com/package/rrweb) installed.

## Installation

To install the stable version:

with npm:

```shell
npm install --save @sentry/browser @sentry/replay
```

with yarn:

```shell
yarn add @sentry/replay @sentry/browser @sentry/replay
```

## Setup

To set up the integration add the following to your Sentry initialization. Several options are supported and passable via the integration constructor. 
See the rrweb documentation for advice on configuring these values. 


```javascript
import * as Sentry from '@sentry/browser';
import { SentryReplay } from '@sentry/replay';

Sentry.init({
  dsn: '__DSN__',
  integrations: [
    new SentryReplay({
      stickySession: true, // Default is false
      recordingConfig: {
        maskAllInputs: false, // Default is true
      },
    }),
  ],
  // ...
});
```

