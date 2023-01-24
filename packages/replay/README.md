<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Sentry Session Replay

[![npm version](https://img.shields.io/npm/v/@sentry/replay.svg)](https://www.npmjs.com/package/@sentry/replay)
[![npm dm](https://img.shields.io/npm/dm/@sentry/replay.svg)](https://www.npmjs.com/package/@sentry/replay)
[![npm dt](https://img.shields.io/npm/dt/@sentry/replay.svg)](https://www.npmjs.com/package/@sentry/replay)

**Note: Session Replay is currently in beta.** Functionality may change outside of major version bumps - while we try our best to avoid any breaking changes, semver cannot be guaranteed before Replay is out of beta. You can find more information about upgrading in [MIGRATION.md](./MIGRATION.md).

## Pre-requisites

`@sentry/replay` requires Node 12+, and browsers newer than IE11.

## Installation

Replay can be imported from `@sentry/browser`, or a respective SDK package like `@sentry/react` or `@sentry/vue`.
You don't need to install anything in order to use Session Replay. The minimum version that includes Replay is 7.27.0.

For details on using Replay when using Sentry via the CDN bundles, see [CDN bundle](#loading-replay-as-a-cdn-bundle).

## Setup

To set up the integration, add the following to your Sentry initialization. Several options are supported and passable via the integration constructor.
See the [configuration section](#configuration) below for more details.

```javascript
import * as Sentry from '@sentry/browser';
// or e.g. import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: '__DSN__',

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // If the entire session is not sampled, use the below sample rate to sample
  // sessions when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    new Sentry.Replay({
      // Additional SDK configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true
      // See below for all available options
    })
  ],
  // ...
});
```

### Lazy loading Replay

Replay will start automatically when you add the integration.
If you do not want to start Replay immediately (e.g. if you want to lazy-load it),
you can also use `addIntegration` to load it later:

```js
Sentry.init({
  // Do not load it initially
  integrations: []
});

// Sometime later
const { Replay } = await import('@sentry/browser');
getCurrentHub().getClient().addIntegration(new Replay());
```

### Identifying Users

If you have only followed the above instructions to setup session replays, you will only see IP addresses in Sentry's UI. In order to associate a user identity to a session replay, use [`setUser`](https://docs.sentry.io/platforms/javascript/enriching-events/identify-user/).

```javascript
import * as Sentry from "@sentry/browser";
Sentry.setUser({ email: "jane.doe@example.com" });
```

### Stopping & re-starting replays

You can manually stop/re-start Replay capture via `.stop()` & `.start()`:

```js
const replay = new Replay();
Sentry.init({
  integrations: [replay]
});

// sometime later
replay.stop();
replay.start();
```

## Loading Replay as a CDN Bundle

As an alternative to the NPM package, you can load the Replay integration bundle from our CDN.

```js
// Browser SDK bundle
<script
  src="https://browser.sentry-cdn.com/7.31.1/bundle.tracing.replay.min.js"
  crossorigin="anonymous"
></script>

// Add Sentry.Integrations.Replay to your Sentry.init call
Sentry.init({
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // If the entire session is not sampled, use the below sample rate to sample
  // sessions when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  dsn: '__DSN__',
  integrations: [new Sentry.Integrations.Replay()],
});
```

The Replay initilialization [configuration](#configuration) options are identical to the options of the NPM package.

Alternatively, you can also load the Replay integration separately from other bundles:

```html
<script
  src="https://browser.sentry-cdn.com/7.31.1/bundle.min.js"
  crossorigin="anonymous"
></script>
<script
  src="https://browser.sentry-cdn.com/7.31.1/replay.min.js"
  crossorigin="anonymous"
></script>
```

Please visit our [CDN bundle docs](https://docs.sentry.io/platforms/javascript/install/cdn/#available-bundles) to get the correct `integrity` checksums for your version.
Note that the two bundle versions always have to match.

## Sessions

A session starts when the Session Replay SDK is first loaded and initialized. The session will continue until 5 minutes passes without any user interactions[^1] with the application *OR* until a maximum of 30 minutes have elapsed. Closing the browser tab will end the session immediately according to the rules for [SessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).

[^1]: An 'interaction' refers to either a mouse click or a browser navigation event.

### Replay Captures Only on Errors

Alternatively, rather than recording an entire session, you can capture a replay only when an error occurs. In this case, the integration will buffer up to one minute worth of events prior to the error being thrown. It will continue to record the session following the rules above regarding session life and activity. Read the [sampling](#Sampling) section for configuration options.

## Sampling

Sampling allows you to control how much of your website's traffic will result in a Session Replay. There are two sample rates you can adjust to get the replays more relevant to your interests:

- `replaysSessionSampleRate` - The sample rate for replays that begin recording immediately and last the entirety of the user's session.
- `replaysOnErrorSampleRate` - The sample rate for replays that are recorded when an error happens. This type of replay will record up to a minute of events prior to the error and continue recording until the session ends.

Sampling occurs when the session is first started. `replaysSessionSampleRate` is evaluated first. If it is sampled, then the replay recording begins. Otherwise, `replaysOnErrorSampleRate` is evaluated and if it is sampled, the integration will begin buffering the replay and will only upload a replay to Sentry when an error occurs. The remainder of the replay will behave similarly to a whole-session replay.


## Configuration

### SDK Configuration

The following options can be configured on the root level of your browser-based Sentry SDK, in `init({})`:


| key                 | type    | default | description                                                                                                                                                                                                                     |
| ------------------- | ------- | ------- | -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------   |
| replaysSessionSampleRate   | number  | `0.1`   | The sample rate for replays that begin recording immediately and last the entirety of the user's session. 1.0 will collect all replays, 0 will collect no replays.                                           |
| replaysOnErrorSampleRate     | number  | `1.0`   |The sample rate for replays that are recorded when an error happens. This type of replay will record up to a minute of events prior to the error and continue recording until the session ends. 1.0 capturing all sessions with an error, and 0 capturing none.

### General Integration Configuration

The following options can be configured as options to the integration, in `new Replay({})`:

| key                 | type    | default | description                                                                                                                                                                                                                     |
| ------------------- | ------- | ------- | -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------   |
| stickySession       | boolean | `true`  | Keep track of the user across page loads. Note a single user using multiple tabs will result in multiple sessions. Closing a tab will result in the session being closed as well.                                               |


### Privacy Configuration

The following options can be configured as options to the integration, in `new Replay({})`:

| key              | type                     | default                             | description                                                                                                                                                                                         |
| ---------------- | ------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| maskAllText      | boolean                  | `true`                              | Mask _all_ text content. Will pass text content through `maskTextFn` before sending to server.                                                                                                       |
| blockAllMedia    | boolean                  | `true`                              | Block _all_ media elements (`img, svg, video, object, picture, embed, map, audio`)
| maskTextFn       | (text: string) => string | `(text) => '*'.repeat(text.length)` | Function to customize how text content is masked before sending to server. By default, masks text with `*`.                                                                                         |
| maskAllInputs    | boolean                  | `true`                              | Mask values of `<input>` elements. Passes input values through `maskInputFn` before sending to server.                                                                                               |
| maskInputOptions | Record<string, boolean>  | `{ password: true }`                | Customize which inputs `type` to mask. <br /> Available `<input>` types: `color, date, datetime-local, email, month, number, range, search, tel, text, time, url, week, textarea, select, password`. |
| maskInputFn      | (text: string) => string | `(text) => '*'.repeat(text.length)` | Function to customize how form input values are masked before sending to server. By default, masks values with `*`.                                                                                 |
| blockClass       | string \| RegExp         | `'sentry-block'`                    | Redact all elements that match the class name. See [privacy](#blocking) section for an example.                                                                                                                                                      |
| blockSelector    | string                   | `'[data-sentry-block]'`               | Redact all elements that match the DOM selector. See [privacy](#blocking) section for an example.                                                                                                                                                     |
| ignoreClass      | string \| RegExp         | `'sentry-ignore'`                   | Ignores all events on the matching input field. See [privacy](#ignoring) section for an example.                                                                                                                                                     |
| maskTextClass    | string \| RegExp         | `'sentry-mask'`                     | Mask all elements that match the class name. See [privacy](#masking) section for an example.                                                                                                                                                        |
| maskTextSelector    | string         | `undefined`                     | Mask all elements that match the given DOM selector. See [privacy](#masking) section for an example.                                                                                                                                                        |

## Privacy
There are several ways to deal with PII. By default, the integration will mask all text content with `*` and block all media elements (`img, svg, video, object, picture, embed, map, audio`). This can be disabled by setting `maskAllText` to `false`. It is also possible to add the following CSS classes to specific DOM elements to prevent recording its contents: `sentry-block`, `sentry-ignore`, and `sentry-mask`. The following sections will show examples of how content is handled by the differing methods.

### Masking
Masking replaces the text content with something else. The default masking behavior is to replace each character with a `*`. In this example the relevant html code is: `<table class="sentry-mask">...</table>`.
![Masking example](https://user-images.githubusercontent.com/79684/193118192-dee1d3d8-5813-47e8-b532-f9ee1c8714b3.png)

### Blocking
Blocking replaces the element with a placeholder that has the same dimensions. The recording will show an empty space where the content was. In this example the relevant html code is: `<table data-sentry-block>...</table>`.
![Blocking example](https://user-images.githubusercontent.com/79684/193118084-51a589fc-2160-476a-a8dc-b681eddb136c.png)

### Ignoring
Ignoring only applies to form inputs. Events will be ignored on the input element so that the replay does not show what occurs inside of the input. In the below example, notice how the results in the table below the input changes, but no text is visible in the input.

https://user-images.githubusercontent.com/79684/192815134-a6451c3f-d3cb-455f-a699-7c3fe04d0a2e.mov

## Error Linking

Currently, errors that happen on the page while a replay is running are linked to the Replay,
making it as easy as possible to jump between related issues/replays.
However, please note that it is _possible_ that the error count reported on the Replay Detail page
does not match the actual errors that have been captured.
The reason for that is that errors _can_ be lost, e.g. a network request fails, or similar.
This should not happen to often, but be aware that it is theoretically possible.

## Manually sending replay data

You can use `replay.flush()` to immediately send all currently captured replay data.
This can be combined with `replaysOnErrorSampleRate: 1`
in order to be able to send the last 60 seconds of replay data on-demand.
