<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Sentry Server Runtime Injection

[![npm version](https://img.shields.io/npm/v/@sentry/server-runtime-injection.svg)](https://www.npmjs.com/package/@sentry/server-runtime-injection)

Runtime module hooks and a code transformer that instrument dependencies as they load in Sentry’s server SDKs.

> [!NOTE]
> This package is an internal library published for use by Sentry-owned JavaScript SDK packages. It is not part of the
> public API contract and may change in any release. Do not rely on SemVer compatibility if you depend on it directly.

> **Important:** this package must be kept **external** (not bundled) when bundling a server. Its
> runtime hook loads a transformer that self-references its own on-disk `node_modules` location;
> bundling it strips the transformer and breaks that self-reference. When you bundle your server,
> either keep `@sentry/server-runtime-injection` external, or rely on the build-time instrumentation
> from the Sentry bundler plugins instead.

## Documentation

- [JavaScript SDK documentation](https://docs.sentry.io/platforms/javascript/)

## Support

- [Report a bug](https://github.com/getsentry/sentry-javascript/issues/new/choose)
- [Contributing](https://github.com/getsentry/sentry-javascript/blob/develop/CONTRIBUTING.md)
