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
