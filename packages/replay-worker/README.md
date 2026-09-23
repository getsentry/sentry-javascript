<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Sentry Session Replay Worker

Generates a web worker and converts it to a string for use by Sentry Session Replay.

By extracting this into a dedicated (private, internal) package, we can streamline the build of replay.

> [!NOTE]
> This is a private package used internally by Sentry’s JavaScript SDKs. It is not part of the public API contract
> and may change at any time.

## Example Worker

You can find an example worker for if you want to self-host the compression worker in [/examples](./examples/).

This is generated from the actual source via `yarn build:examples`, which should be run manually whenever replay-worker
is updated.

## Documentation

- [Session Replay documentation](https://docs.sentry.io/platforms/javascript/session-replay/)

## Support

- [Report a bug](https://github.com/getsentry/sentry-javascript/issues/new/choose)
- [Contributing](https://github.com/getsentry/sentry-javascript/blob/develop/CONTRIBUTING.md)
