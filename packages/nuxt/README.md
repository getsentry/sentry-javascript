<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Nuxt

[![npm version](https://img.shields.io/npm/v/@sentry/nuxt.svg)](https://www.npmjs.com/package/@sentry/nuxt)
[![npm dm](https://img.shields.io/npm/dm/@sentry/nuxt.svg)](https://www.npmjs.com/package/@sentry/nuxt)
[![npm dt](https://img.shields.io/npm/dt/@sentry/nuxt.svg)](https://www.npmjs.com/package/@sentry/nuxt)

This SDK is for [Nuxt](https://nuxt.com/). If you're using [Vue](https://vuejs.org/) see our
[Vue SDK here](https://github.com/getsentry/sentry-javascript/tree/develop/packages/vue).

## Setup Instructions and Documentation

Check out the [Official Nuxt SDK Docs](https://docs.sentry.io/platforms/javascript/guides/nuxt/) for further information on configuration and usage.

## Compatibility

The minimum supported version of Nuxt is `3.7.0` (`3.14.0+` recommended).

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/vue` for the client side, with added
functionality related to Nuxt.

## Troubleshoot

If your server-side auto-instrumentation stops recording spans after bundling (e.g. certain Nitro
presets), make sure `@sentry/server-utils` is kept **external** in the Nitro/server build rather than
inlined, as its runtime module hook must resolve from `node_modules`. `@sentry/node` logs a warning
the first time an instrumented dependency loads uninstrumented.

If you encounter any issues with error tracking or integrations, refer to the official [Sentry Nuxt SDK documentation](https://docs.sentry.io/platforms/javascript/guides/nuxt/). If the documentation does not provide the necessary information, consider opening an issue on GitHub.
