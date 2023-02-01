# Upgrading Replay from 7.34.0 to 7.35.0
This release will remove the ability to change the default rrweb recording options (outside of privacy options). The following are the new configuration values all replays will use:
`slimDOMOptions: 'all'` - Removes `script`, comments, `favicon`, whitespace in `head`, and a few `meta` tags in `head`
`recordCanvas: false` - This option did not do anything as playback of recorded canvas means we would have to remove the playback sandbox (which is a security concern).
`inlineStylesheet: true` - Inlines styles into the recording itself instead of attempting to fetch it remotely. This means that styles in the replay will reflect the styles at the time of recording and not the current styles of the remote stylesheet.
`collectFonts: true` - Attempts to load custom fonts.
`inlineImages: false` - Does not inline images to recording and instead loads the asset remotely. During playback, images may not load due to CORS (add sentry.io as an origin).

Additionally, we have streamlined the privacy options. The following table lists the deprecated value, and what it is replaced by:

| deprecated key   | replaced by | description                                                                                                                                      |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| maskInputOptions | mask        | Use CSS selectors in `mask` in order to mask all inputs of a certain type. For example, `input[type="address"]`                                  |
| blockSelector    | block       | The selector(s) can be moved directly in the `block` array.                                                                                      |
| blockClass       | block       | Convert the class name to a CSS selector and add to `block` array. For example, `first-name` becomes `.first-name`. Regexes can be moved as-is.  |
| maskClass        | mask        | Convert the class name to a CSS selector and add to `mask` array. For example, `first-name` becomes `.first-name`. Regexes can be moved as-is.   |
| maskSelector     | mask        | The selector(s) can be moved directly in the `mask` array.                                                                                       |
| ignoreClass      | ignore      | Convert the class name to a CSS selector and add to `ignore` array. For example, `first-name` becomes `.first-name`. Regexes can be moved as-is. |

# Upgrading Replay from 7.31.0 to 7.32.0

In 7.32.0, we have removed the default values for the replay sample rates.
Previously, they were:

* `replaysSessionSampleRate: 0.1`
* `replaysOnErrorSampleRate: 1.0`

Now, you have to explicitly set the sample rates, otherwise they default to 0.

# Upgrading Replay from 0.6.x to 7.24.0

The Sentry Replay integration was moved to the Sentry JavaScript SDK monorepo. Hence we're jumping from version 0.x to the monorepo's 7.x version which is shared across all JS SDK packages.

## Replay sample rates are defined on top level (https://github.com/getsentry/sentry-javascript/issues/6351)

Instead of defining the sample rates on the integration like this:

```js
Sentry.init({
  dsn: '__DSN__',
  integrations: [
    new Replay({
      sessionSampleRate: 0.1,
      errorSampleRate: 1.0,
    })
  ],
  // ...
});
```

They are now defined on the top level of the SDK:

```js
Sentry.init({
  dsn: '__DSN__',
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    new Replay({
      // other replay config still goes in here
    })
  ],
});
```

Note that the sample rate options inside of `new Replay({})` have been deprecated and will be removed in a future update.

## Removed deprecated options (https://github.com/getsentry/sentry-javascript/pull/6370)

Two options, which have been deprecated for some time, have been removed:

* `replaysSamplingRate` - instead use `sessionSampleRate`
* `captureOnlyOnError` - instead use `errorSampleRate`

## New NPM package structure (https://github.com/getsentry/sentry-javascript/issues/6280)

The internal structure of the npm package has changed. This is unlikely to affect you, unless you have imported something from e.g.:

```js
import something from '@sentry/replay/submodule';
```

If you only imported from `@sentry/replay`, this will not affect you.

## Changed type name from `IEventBuffer` to `EventBuffer` (https://github.com/getsentry/sentry-javascript/pull/6416)

It is highly unlikely to affect anybody, but the type `IEventBuffer` was renamed to `EventBuffer` for consistency.
Unless you manually imported this and used it somewhere in your codebase, this will not affect you.

## Session object is now a plain object (https://github.com/getsentry/sentry-javascript/pull/6417)

The `Session` object exported from Replay is now a plain object, instead of a class.
This should not affect you unless you specifically accessed this class & did custom things with it.

## Reduce public API of Replay integration (https://github.com/getsentry/sentry-javascript/pull/6407)

The result of `new Replay()` now has a much more limited public API. Only the following methods are exposed:

```js
const replay = new Replay();

replay.start();
replay.stop();
```
