<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Sentry Feedback

[![npm version](https://img.shields.io/npm/v/@sentry/feedback.svg)](https://www.npmjs.com/package/@sentry/feedback)
[![npm dm](https://img.shields.io/npm/dm/@sentry/feedback.svg)](https://www.npmjs.com/package/@sentry/feedback)
[![npm dt](https://img.shields.io/npm/dt/@sentry/feedback.svg)](https://www.npmjs.com/package/@sentry/feedback)

## Pre-requisites

`@sentry/feedback` requires Node 12+, and browsers newer than IE11.

## Installation

Feedback can be imported from `@sentry/browser`, or a respective SDK package like `@sentry/react` or `@sentry/vue`.
You don't need to install anything in order to use Feedback. The minimum version that includes Feedback is <<CHANGEME>>.

For details on using Feedback when using Sentry via the CDN bundles, see [CDN bundle](#loading-feedback-as-a-cdn-bundle).

## Setup

To set up the integration, add the following to your Sentry initialization. Several options are supported and passable via the integration constructor.
See the [configuration section](#configuration) below for more details.

```javascript
import * as Sentry from '@sentry/browser';
// or e.g. import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: '__DSN__',
  integrations: [
    new Sentry.Feedback({
      // Additional SDK configuration goes in here, for example:
      // See below for all available options
    })
  ],
  // ...
});
```

### Lazy loading Feedback

Feedback will start automatically when you add the integration.
If you do not want to start Feedback immediately (e.g. if you want to lazy-load it),
you can also use `addIntegration` to load it later:

```js
import * as Sentry from "@sentry/react";
import { BrowserClient } from "@sentry/browser";

Sentry.init({
  // Do not load it initially
  integrations: []
});

// Sometime later
const { Feedback } = await import('@sentry/browser');
const client = Sentry.getCurrentHub().getClient<BrowserClient>();

// Client can be undefined
client?.addIntegration(new Feedback());
```

### Identifying Users

If you have only followed the above instructions to setup session feedbacks, you will only see IP addresses in Sentry's UI. In order to associate a user identity to a session feedback, use [`setUser`](https://docs.sentry.io/platforms/javascript/enriching-events/identify-user/).

```javascript
import * as Sentry from "@sentry/browser";

Sentry.setUser({ email: "jane.doe@example.com" });
```

## Loading Feedback as a CDN Bundle

As an alternative to the NPM package, you can use Feedback as a CDN bundle.
Please refer to the [Feedback installation guide](https://docs.sentry.io/platforms/javascript/session-feedback/#install) for CDN bundle instructions.


## Configuration

### General Integration Configuration

The following options can be configured as options to the integration, in `new Feedback({})`:

| key       | type    | default | description |
| --------- | ------- | ------- | ----------- |
| tbd       | boolean | `true`  | tbd         |



## Manually Sending Feedback Data

Connect your own feedback UI to Sentry's You can use `feedback.flush()` to immediately send all currently captured feedback data.
When Feedback is currently in buffering mode, this will send up to the last 60 seconds of feedback data,
and also continue sending afterwards, similar to when an error happens & is recorded.
