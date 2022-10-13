# sentry-replay

Note: Session Replay is currently in alpha.

## Pre-requisites

For the sentry-replay integration to work, you must have the [Sentry browser SDK package](https://www.npmjs.com/package/@sentry/browser) (minimum version `7.x`), or an equivalent framework SDK (e.g. [@sentry/react](https://www.npmjs.com/package/@sentry/react)) installed.

## Installation

with npm:

```shell
npm install --save @sentry/browser @sentry/replay
```

with yarn:

```shell
yarn add @sentry/browser @sentry/replay
```

## Setup

To set up the integration, add the following to your Sentry initialization. Several options are supported and passable via the integration constructor.
See the [configuration section](#configuration) below for more details.

```javascript
import * as Sentry from '@sentry/browser';
import { Replay } from '@sentry/replay';

Sentry.init({
  dsn: '__DSN__',
  integrations: [
    new Replay({
      // This sets the sample rate to be 10%. You may want this to be 100% while
      // in development and sample at a lower rate in production
      replaysSamplingRate: 0.1,
    })
  ],
  // ...
});
```

### Start and Stop Recording

Replay recording only starts automatically when it is included in the `integrations` key when calling `Sentry.init`. Otherwise you can initialize the plugin and manually call the `start()` method on the integration instance. To stop recording you can call the `stop()`.

```javascript
const replay = new Replay(); // This will *NOT* begin recording replays

replay.start(); // Start recording

replay.stop(); // Stop recording
```

## Configuration

### General Configuration

| key                 | type    | default | description                                                                                                                                                                                                                   |
| ------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| captureOnlyOnError  | boolean | `false` | Only capture the recording when an error happens. The recording is currently limited to up to the last 60 seconds before the error occurs and only records up to the error. |
| initialFlushDelay   | number  | `5000`  | The amount of time to wait (in ms) before sending the initial recording payload. This helps drop recordings where users visit and close the page quickly.                                                                     |
| replaysSamplingRate | number  | `1.0`   | The rate at which to sample replays. (1.0 will collect all replays, 0 will collect no replays).                                                                                                                               |
| stickySession       | boolean | `true`  | Keep track of the user across page loads. Note a single user using multiple tabs will result in multiple sessions. Closing a tab will result in the session being closed as well.                                             |

### Privacy Configuration

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

### Optimization Configuration

| key              | type                    | default | description                                                                                                                                                                                                                  |
| ---------------- | ----------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| collectFonts     | boolean                 | `false` | Should collect fonts used on the website                                                                                                                                                                                     |
| inlineImages     | boolean                 | `false` | Should inline `<image>` content                                                                                                                                                                                              |
| inlineStylesheet | boolean                 | `true`  | Should inline stylesheets used in the recording                                                                                                                                                                              |
| recordCanvas     | boolean                 | `false` | Should record `<canvas>` elements                                                                                                                                                                                            |
| slimDOMOptions   | Record<string, boolean> | `{}`    | Remove unnecessary parts of the DOM <br /> Available keys: `script, comment, headFavicon, headWhitespace, headMetaDescKeywords, headMetaSocial, headMetaRobots, headMetaHttpEquiv, headMetaAuthorship, headMetaVerification` |

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

