<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Node

[![npm version](https://img.shields.io/npm/v/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)
[![npm dm](https://img.shields.io/npm/dm/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)
[![npm dt](https://img.shields.io/npm/dt/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)

## Installation

```bash
npm install @sentry/node

# Or yarn
yarn add @sentry/node
```

## Usage

Sentry should be initialized as early in your app as possible. It is essential that you call `Sentry.init` before you
require any other modules in your application, otherwise auto-instrumentation of these modules will **not** work.

You need to create a file named `instrument.js` that imports and initializes Sentry:

```js
// CJS Syntax
const Sentry = require('@sentry/node');
// ESM Syntax
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

You need to require or import the `instrument.js` file before importing any other modules in your application. This is
necessary to ensure that Sentry can automatically instrument all modules in your application:

```js
// Import this first!
import './instrument';

// Now import other modules
import http from 'http';

// Your application code goes here
```

### ESM Support

When running your application in ESM mode, you should use the Node.js
[`--import`](https://nodejs.org/api/cli.html#--importmodule) command line option to ensure that Sentry is loaded before
the application code is evaluated.

Adjust the Node.js call for your application to use the `--import` parameter and point it at `instrument.js`, which
contains your `Sentry.init`() code:

```bash
# Note: This is only available for Node v18.19.0 onwards.
node --import ./instrument.mjs app.mjs
```

If it is not possible for you to pass the `--import` flag to the Node.js binary, you can alternatively use the
`NODE_OPTIONS` environment variable as follows:

```bash
NODE_OPTIONS="--import ./instrument.mjs" npm run start
```

### Bundling your server

`@sentry/node` installs its automatic (diagnostics-channel) instrumentation through a runtime module
hook that ships in `@sentry/server-utils` and is designed to run from `node_modules`. If you bundle
your server (esbuild, webpack, rollup, or a framework that bundles the server output), keep
`@sentry/server-utils` **external** — do not inline it into the bundle. Bundling it strips its
internal code transformer, which silently disables auto-instrumentation (`@sentry/node` will warn at
startup when it detects this).

Most setups don't bundle the SDK. If you do, either mark `@sentry/server-utils` as external in your
bundler config, or use the build-time instrumentation from the Sentry bundler plugins instead
(`@sentry/node/esbuild`, `@sentry/node/webpack`, `@sentry/node/vite`, `@sentry/node/rollup`), which
inject the instrumentation into your bundled dependencies at build time.

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
