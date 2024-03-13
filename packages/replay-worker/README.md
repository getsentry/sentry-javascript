<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Sentry Session Replay Worker

This is an internal package that is used by @sentry/replay. It generates a web worker and converts it to a string, so
that we can process it easier in replay.

By extracting this into a dedicated (private, internal) package, we can streamline the build of replay.

## Example Worker

You can find an example worker for if you want to self-host the compression worker in [/examples](./examples/).

This is generated from the actual soure via `yarn build:examples`, which should be run manually whenever replay-worker
is updated.
