<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Sentry esbuild Plugin

A esbuild plugin that uploads source maps to Sentry and injects release and Debug ID information into your bundles.

This package re-exports `@sentry/bundler-plugins/esbuild`.

## Installation

```bash
npm install @sentry/esbuild-plugin --save-dev
```

## Usage

```js
// build.js
import * as esbuild from 'esbuild';
import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin';

await esbuild.build({
  sourcemap: true,
  plugins: [
    sentryEsbuildPlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
});
```

## Documentation

- [Uploading source maps](https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/)

## Support

- [Report a bug](https://github.com/getsentry/sentry-javascript/issues/new/choose)
- [Contributing](https://github.com/getsentry/sentry-javascript/blob/develop/CONTRIBUTING.md)
