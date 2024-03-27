# End of Replay Beta

Sentry Replay is now out of Beta. This means that the usual stability guarantees apply.

Because of experimentation and rapid iteration, during the Beta period some bugs and problems came up which have since
been fixed/improved. We **strongly** recommend anyone using Replay in a version before 7.39.0 to update to 7.39.0 or
newer, in order to prevent running Replay with known problems that have since been fixed.

Below you can find a list of relevant replay issues that have been resolved until 7.39.0:

## New features / improvements

- Remove `autoplay` attribute from audio/video tags ([#59](https://github.com/getsentry/rrweb/pull/59))
- Exclude fetching scripts that use `<link rel="modulepreload">` ([#52](https://github.com/getsentry/rrweb/pull/52))
- With maskAllText, mask the attributes: placeholder, title, `aria-label`
- Lower the flush max delay from 15 seconds to 5 seconds (#6761)
- Stop recording when retry fails (#6765)
- Stop without retry when receiving bad API response (#6773)
- Send client_report when replay sending fails (#7093)
- Stop recording when hitting a rate limit (#7018)
- Allow Replay to be used in Electron renderers with nodeIntegration enabled (#6644)
- Do not renew session in error mode (#6948)
- Remove default sample rates for replay (#6878)
- Add `flush` method to integration (#6776)
- Improve compression worker & fallback behavior (#6988, #6936, #6827)
- Improve error handling (#7087, #7094, #7010, getsentry/rrweb#16, #6856)
- Add more default block filters (#7233)

## Fixes

- Fix masking inputs on change when `maskAllInputs:false` ([#61](https://github.com/getsentry/rrweb/pull/61))
- More robust `rootShadowHost` check ([#50](https://github.com/getsentry/rrweb/pull/50))
- Fix duplicated textarea value ([#62](https://github.com/getsentry/rrweb/pull/62))
- Handle removed attributes ([#65](https://github.com/getsentry/rrweb/pull/65))
- Change LCP calculation (#7187, #7225)
- Fix debounced flushes not respecting `maxWait` (#7207, #7208)
- Fix svgs not getting unblocked (#7132)
- Fix missing fetch/xhr requests (#7134)
- Fix feature detection of PerformanceObserver (#7029)
- Fix `checkoutEveryNms` (#6722)
- Fix incorrect uncompressed recording size due to encoding (#6740)
- Ensure dropping replays works (#6522)
- Envelope send should be awaited in try/catch (#6625)
- Improve handling of `maskAllText` selector (#6637)

# Upgrading Replay from 7.34.0 to 7.35.0 - #6645

This release will remove the ability to change the default rrweb recording options (outside of privacy options). The
following are the new configuration values all replays will use: `slimDOMOptions: 'all'` - Removes `script`, comments,
`favicon`, whitespace in `head`, and a few `meta` tags in `head` `recordCanvas: false` - This option did not do anything
as playback of recorded canvas means we would have to remove the playback sandbox (which is a security concern).
`inlineStylesheet: true` - Inlines styles into the recording itself instead of attempting to fetch it remotely. This
means that styles in the replay will reflect the styles at the time of recording and not the current styles of the
remote stylesheet. `collectFonts: true` - Attempts to load custom fonts. `inlineImages: false` - Does not inline images
to recording and instead loads the asset remotely. During playback, images may not load due to CORS (add sentry.io as an
origin).

Additionally, we have streamlined the privacy options. The following table lists the deprecated value, and what it is
replaced by:

| deprecated key   | replaced by | description                                                                                                                                      |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| maskInputOptions | mask        | Use CSS selectors in `mask` in order to mask all inputs of a certain type. For example, `input[type="address"]`                                  |
| blockSelector    | block       | The selector(s) can be moved directly in the `block` array.                                                                                      |
| blockClass       | block       | Convert the class name to a CSS selector and add to `block` array. For example, `first-name` becomes `.first-name`. Regexes can be moved as-is.  |
| maskClass        | mask        | Convert the class name to a CSS selector and add to `mask` array. For example, `first-name` becomes `.first-name`. Regexes can be moved as-is.   |
| maskSelector     | mask        | The selector(s) can be moved directly in the `mask` array.                                                                                       |
| ignoreClass      | ignore      | Convert the class name to a CSS selector and add to `ignore` array. For example, `first-name` becomes `.first-name`. Regexes can be moved as-is. |

# Upgrading Replay from 7.31.0 to 7.32.0

In 7.32.0, we have removed the default values for the replay sample rates. Previously, they were:

- `replaysSessionSampleRate: 0.1`
- `replaysOnErrorSampleRate: 1.0`

Now, you have to explicitly set the sample rates, otherwise they default to 0.

# Upgrading Replay from 0.6.x to 7.24.0

The Sentry Replay integration was moved to the Sentry JavaScript SDK monorepo. Hence we're jumping from version 0.x to
the monorepo's 7.x version which is shared across all JS SDK packages.

## Replay sample rates are defined on top level (https://github.com/getsentry/sentry-javascript/issues/6351)

Instead of defining the sample rates on the integration like this:

```js
Sentry.init({
  dsn: '__DSN__',
  integrations: [
    new Replay({
      sessionSampleRate: 0.1,
      errorSampleRate: 1.0,
    }),
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
    }),
  ],
});
```

Note that the sample rate options inside of `new Replay({})` have been deprecated and will be removed in a future
update.

## Removed deprecated options (https://github.com/getsentry/sentry-javascript/pull/6370)

Two options, which have been deprecated for some time, have been removed:

- `replaysSamplingRate` - instead use `sessionSampleRate`
- `captureOnlyOnError` - instead use `errorSampleRate`

## New NPM package structure (https://github.com/getsentry/sentry-javascript/issues/6280)

The internal structure of the npm package has changed. This is unlikely to affect you, unless you have imported
something from e.g.:

```js
import something from '@sentry/replay/submodule';
```

If you only imported from `@sentry/replay`, this will not affect you.

## Changed type name from `IEventBuffer` to `EventBuffer` (https://github.com/getsentry/sentry-javascript/pull/6416)

It is highly unlikely to affect anybody, but the type `IEventBuffer` was renamed to `EventBuffer` for consistency.
Unless you manually imported this and used it somewhere in your codebase, this will not affect you.

## Session object is now a plain object (https://github.com/getsentry/sentry-javascript/pull/6417)

The `Session` object exported from Replay is now a plain object, instead of a class. This should not affect you unless
you specifically accessed this class & did custom things with it.

## Reduce public API of Replay integration (https://github.com/getsentry/sentry-javascript/pull/6407)

The result of `new Replay()` now has a much more limited public API. Only the following methods are exposed:

```js
const replay = new Replay();

replay.start();
replay.stop();
```
