<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for SvelteKit

[![npm version](https://img.shields.io/npm/v/@sentry/sveltekit.svg)](https://www.npmjs.com/package/@sentry/sveltekit)
[![npm dm](https://img.shields.io/npm/dm/@sentry/sveltekit.svg)](https://www.npmjs.com/package/@sentry/sveltekit)
[![npm dt](https://img.shields.io/npm/dt/@sentry/sveltekit.svg)](https://www.npmjs.com/package/@sentry/sveltekit)

## Compatibility

The minimum supported version of SvelteKit is `2.0.0`. The SDK works best with Vite 4.2 and newer. Older Vite versions
might not generate source maps correctly.

Check our docs for [SvelteKit adapter](https://docs.sentry.io/platforms/javascript/guides/sveltekit/#prerequisites) compatibility.

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/svelte` for the client side, with added
functionality related to SvelteKit.

## Installation

To get started installing the SDK, use the Sentry Next.js Wizard by running the following command in your terminal or
read the [Getting Started Docs](https://docs.sentry.io/platforms/javascript/guides/sveltekit/):

```sh
npx @sentry/wizard@latest -i sveltekit
```

The wizard will guide you throuhg logging in to Sentry and setting up the SDK. After the wizard setup is completed, the SDK will automatically capture
unhandled errors, and optionally, traces and replays.

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/sveltekit/)
- [Sentry.io](https://sentry.io/?utm_source=github&utm_medium=npm_sveltekit)
- [Sentry Discord Server](https://discord.gg/Ww9hbqr)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/sentry)
