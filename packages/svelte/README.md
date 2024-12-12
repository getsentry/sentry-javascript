<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Svelte

[![npm version](https://img.shields.io/npm/v/@sentry/svelte.svg)](https://www.npmjs.com/package/@sentry/svelte)
[![npm dm](https://img.shields.io/npm/dm/@sentry/svelte.svg)](https://www.npmjs.com/package/@sentry/svelte)
[![npm dt](https://img.shields.io/npm/dt/@sentry/svelte.svg)](https://www.npmjs.com/package/@sentry/svelte)

This SDK currently only supports [Svelte](https://svelte.dev/) apps in the browser. If you're using SvelteKit, we
recommend using our dedicated
[Sentry SvelteKit SDK](https://github.com/getsentry/sentry-javascript/tree/develop/packages/sveltekit).

## General

This package is a wrapper around `@sentry/browser`, providing error monitoring and basic performance monitoring features
for [Svelte](https://svelte.dev/).

To use the SDK, initialize Sentry in your Svelte entry point `main.js` before you bootstrap your Svelte app:

```ts
// main.js / main.ts

import App from './App.svelte';

import * as Sentry from '@sentry/svelte';

// Initialize the Sentry SDK here
Sentry.init({
  dsn: '__DSN__',
  release: 'my-project-name@2.3.12',
  integrations: [Sentry.browserTracingIntegration()],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
});

// Then bootstrap your Svelte app
const app = new App({
  target: document.getElementById('app'),
});

export default app;
```

The Sentry Svelte SDK supports all features from the `@sentry/browser` SDK. Until it becomes more stable, please refer
to the Sentry [Browser SDK documentation](https://docs.sentry.io/platforms/javascript/) for more information and usage
instructions.

## Sourcemaps and Releases

To generate source maps of your Svelte app bundle, check our guide
[how to configure your bundler](https://docs.sentry.io/platforms/javascript/guides/svelte/sourcemaps/generating/) to
emit source maps.

To [create releases and upload source maps](https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/cli/) to
Sentry, we recommend using [`sentry-cli`](https://github.com/getsentry/sentry-cli). You can for instance create a bash
script to take care of creating a release, uploading source maps and finalizing the release:

```bash
#!/bin/bash

VERSION=<your version>
ORG=<your org-slug>
PROJECT=<your project-slug>

SOURCEMAPS_PATH=./dist

sentry-cli releases new $VERSION --org $ORG --project $PROJECT
sentry-cli releases files $VERSION upload-sourcemaps $SOURCEMAPS_PATH --org $ORG --project $PROJECT
sentry-cli releases finalize $VERSION  --org $ORG --project $PROJECT
```

Please note that the paths provided in this example work for a typical Svelte project that adheres to the project
structure set by [create-vite](https://www.npmjs.com/package/create-vite) with the `svelte(-ts)` template. If your
project setup differs from this template, your configuration may need adjustments. Please refer to our documentation of
[Advanced `sentry-cli` Sourcemaps Options](https://docs.sentry.io/product/cli/releases/#sentry-cli-sourcemaps) and to
our [Sourcemaps Troubleshooting Guide](https://docs.sentry.io/platforms/javascript/sourcemaps/troubleshooting_js/).

Check out our
[Svelte source maps uploading](https://docs.sentry.io/platforms/javascript/guides/svelte/sourcemaps/uploading/) guide
for more information.
