# sentry-replay

This integration is a WIP.

## Pre-Requisites

For the sentry-replay integration to work, you must have the [Sentry browser SDK package](https://www.npmjs.com/package/@sentry/browser) installed.

## Installation

To install the stable version:

with npm:

```shell
npm install --save @sentry/browser @sentry/replay
```

with yarn:

```shell
yarn add @sentry/browser @sentry/replay
```

## Setup

To set up the integration add the following to your Sentry initialization. Several options are supported and passable via the integration constructor.
See the rrweb documentation for advice on configuring these values.

```javascript
import * as Sentry from '@sentry/browser';
import { Replay } from '@sentry/replay';

Sentry.init({
  dsn: '__DSN__',
  integrations: [
    new Replay({
      maskAllText: true, // Will mask all text strings
      recordingConfig: {
        maskAllInputs: true, // Mask 
      },
    }),
  ],
  // ...
});
```

### Stop Recording

Replay recording only starts automatically when it is included in the `integrations` key when calling `Sentry.init`. Otherwise you can initialize the plugin and manually call the `start()` method on the integration instance. To stop recording you can call the `stop()`.

```javascript
const replay = new Replay(); // This will *NOT* begin recording replays

replay.start(); // Start recording

replay.stop(); // Stop recording
```

## Configuration

| key                             | type      | default           | description                                                                                                                                                                                                                   |
| ------------------------------- | --------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flushMinDelay`                 | `number`  | `5000`            | The minimum time to wait (in ms) before sending the recording payload. The payload is sent if `flushMinDelay` ms have elapsed between two events.                                                                             |
| `flushMaxDelay`                 | `number`  | `15000`           | The maximum time to wait (in ms) when sending the recording payload. The payload is sent if events occur at an interval less than `flushMinDelay` and `flushMaxDelay` ms have elapsed since the last time a payload was sent. |
| `initialFlushDelay`             | `number`  | `5000`            | The amount of time to wait (in ms) before sending the initial recording payload. This helps drop recordings where users visit and close the page quickly.                                                                     |
| `maskAllText`                   | `boolean` | `true`            | Mask _all_ text strings with `*`.                                                                                                                                                                                             |
| `replaysSamplingRate`           | `number`  | `1.0`             | The rate at which to sample replays. (1.0 will collect all replays, 0 will collect no replays).                                                                                                                               |
| `stickySession`                 | `boolean` | `true`            | Keep track of the user across page loads. Note a single user using multiple tabs will result in multiple sessions. Closing a tab will result in the session being closed as well.                                             |
| `useCompression`                | `boolean` | `true`            | Uses `WebWorkers` (if available) to compress the recording payload before uploading to Sentry.                                                                                                                                |
| `captureOnlyOnError`            | `boolean` | `false`           | Only capture the recording when an error happens.                                                                                                                                                                             |
| `recordingConfig.maskAllInputs` | `boolean` | `true`            | Mask all `<input>` elements                                                                                                                                                                                                   |
| `recordingConfig.blockClass`    | `string`  | `'sentry-block'`  | Redact all elements with the class name `sentry-block`                                                                                                                                                                        |
| `recordingConfig.ignoreClass`   | `string`  | `'sentry-ignore'` | Ignores all elements with the class name `sentry-ignore`                                                                                                                                                                      |
| `recordingConfig.maskTextClass` | `string`  | `'sentry-mask'`   | Mask all elements with the class name `sentry-ignore`                                                                                                                                                                         |
