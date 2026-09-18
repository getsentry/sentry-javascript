<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Sentry Server Runtime Injection

[![npm version](https://img.shields.io/npm/v/@sentry/server-runtime-injection.svg)](https://www.npmjs.com/package/@sentry/server-runtime-injection)

This is an internal package for the Sentry JavaScript SDKs. It is not part of the public API contract
and may change at any time.

It contains the **runtime** diagnostics-channel injection used by the server SDKs — the module hooks
that transform instrumented dependencies as they load at runtime (`register`, `hook`, `import-hook`),
together with the vendored code transformer they rely on.

> **Important:** this package must be kept **external** (not bundled) when bundling a server. Its
> runtime hook loads a transformer that self-references its own on-disk `node_modules` location;
> bundling it strips the transformer and breaks that self-reference. When you bundle your server,
> either keep `@sentry/server-runtime-injection` external, or rely on the build-time instrumentation
> from the Sentry bundler plugins instead.
