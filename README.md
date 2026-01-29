<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

_Bad software is everywhere, and we're tired of it. Sentry is on a mission to help developers write better software
faster, so we can get back to enjoying technology. If you want to join us
[<kbd>**Check out our open positions**</kbd>](https://sentry.io/careers/)_

[![Build & Test](https://github.com/getsentry/sentry-javascript/workflows/CI:%20Build%20&%20Test/badge.svg)](https://github.com/getsentry/sentry-javascript/actions)
[![npm version](https://img.shields.io/npm/v/@sentry/core.svg)](https://www.npmjs.com/package/@sentry/core)
[![Discord](https://img.shields.io/discord/621778831602221064)](https://discord.gg/Ww9hbqr)

# Official Sentry SDKs for JavaScript

<a href="https://docs.sentry.io/platforms/javascript/" target="_blank">
  <img src="https://github.com/user-attachments/assets/aedc2b46-9959-4b9e-8a23-6240062cefc5" alt="Sentry for JavaScript">
</a>

This is the next line of Sentry JavaScript SDKs, comprised in the `@sentry/` namespace. It will provide a more
convenient interface and improved consistency between various JavaScript environments.

## Links

- [![Documentation](https://img.shields.io/badge/documentation-sentry.io-green.svg)](https://docs.sentry.io/quickstart/)
- [![Forum](https://img.shields.io/badge/forum-sentry-green.svg)](https://forum.sentry.io/c/sdks)
- [![Discord](https://img.shields.io/discord/621778831602221064)](https://discord.gg/Ww9hbqr)
- [![Stack Overflow](https://img.shields.io/badge/stack%20overflow-sentry-green.svg)](http://stackoverflow.com/questions/tagged/sentry)
- [![X Follow](https://img.shields.io/twitter/follow/sentry?label=sentry&style=social)](https://x.com/intent/follow?screen_name=sentry)

## Contents

- [Contributing](https://github.com/getsentry/sentry-javascript/blob/develop/CONTRIBUTING.md)
- [Supported Platforms](#supported-platforms)
- [Installation and Usage](#installation-and-usage)
- [Other Packages](#other-packages)
- [Bug Bounty Program](#bug-bounty-program)

## Supported Platforms

For each major JavaScript platform, there is a specific high-level SDK that provides all the tools you need in a single
package. Please refer to the README and instructions of those SDKs for more detailed information:

- [`@sentry/browser`](https://github.com/getsentry/sentry-javascript/tree/master/packages/browser): SDK for Browsers
- [`@sentry/node`](https://github.com/getsentry/sentry-javascript/tree/master/packages/node): SDK for Node including
  integrations for Express
- [`@sentry/angular`](https://github.com/getsentry/sentry-javascript/tree/master/packages/angular): Browser SDK for
  Angular
- [`@sentry/astro`](https://github.com/getsentry/sentry-javascript/tree/master/packages/astro): SDK for Astro
- [`@sentry/ember`](https://github.com/getsentry/sentry-javascript/tree/master/packages/ember): Browser SDK for Ember
- [`@sentry/react`](https://github.com/getsentry/sentry-javascript/tree/master/packages/react): Browser SDK for React
- [`@sentry/svelte`](https://github.com/getsentry/sentry-javascript/tree/master/packages/svelte): Browser SDK for Svelte
- [`@sentry/sveltekit`](https://github.com/getsentry/sentry-javascript/tree/master/packages/sveltekit): SDK for
  SvelteKit
- [`@sentry/vue`](https://github.com/getsentry/sentry-javascript/tree/master/packages/vue): Browser SDK for Vue
- [`@sentry/solid`](https://github.com/getsentry/sentry-javascript/tree/master/packages/solid): Browser SDK for Solid
- [`@sentry/gatsby`](https://github.com/getsentry/sentry-javascript/tree/master/packages/gatsby): SDK for Gatsby
- [`@sentry/nestjs`](https://github.com/getsentry/sentry-javascript/tree/master/packages/nestjs): SDK for NestJS
- [`@sentry/nextjs`](https://github.com/getsentry/sentry-javascript/tree/master/packages/nextjs): SDK for Next.js
- [`@sentry/remix`](https://github.com/getsentry/sentry-javascript/tree/master/packages/remix): SDK for Remix
- [`@sentry/tanstackstart-react`](https://github.com/getsentry/sentry-javascript/tree/master/packages/tanstackstart-react): SDK for TanStack Start React
- [`@sentry/aws-serverless`](https://github.com/getsentry/sentry-javascript/tree/master/packages/aws-serverless): SDK
  for AWS Lambda Functions
- [`@sentry/google-cloud-serverless`](https://github.com/getsentry/sentry-javascript/tree/master/packages/google-cloud-serverless):
  SDK for Google Cloud Functions
- [`@sentry/electron`](https://github.com/getsentry/sentry-electron): SDK for Electron with support for native crashes
- [`@sentry/react-native`](https://github.com/getsentry/sentry-react-native): SDK for React Native with support for
  native crashes
- [`@sentry/capacitor`](https://github.com/getsentry/sentry-capacitor): SDK for Capacitor Apps and Ionic with support
  for native crashes
- [`@sentry/bun`](https://github.com/getsentry/sentry-javascript/tree/master/packages/bun): SDK for Bun
- [`@sentry/deno`](https://github.com/getsentry/sentry-javascript/tree/master/packages/deno): SDK for Deno
- [`@sentry/cloudflare`](https://github.com/getsentry/sentry-javascript/tree/master/packages/cloudflare): SDK for
  Cloudflare

## Version Support Policy

We recognize the importance of continued support for our SDK across different versions.
Our commitment is to provide bug fixes and feature updates for older versions based on community demand and usage.

## Installation and Usage

To install a SDK, simply add the high-level package, for example:

```sh
npm install --save @sentry/browser
yarn add @sentry/browser
```

Setup and usage of these SDKs always follows the same principle.

```javascript
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: '__DSN__',
  // ...
});

Sentry.captureMessage('Hello, world!');
```

## Other Packages

Besides the high-level SDKs, this repository contains shared packages, helpers and configuration used for SDK
development. If you're thinking about contributing to or creating a JavaScript-based SDK, have a look at the resources
below:

- [`@sentry-internal/replay`](https://github.com/getsentry/sentry-javascript/tree/master/packages/replay-internal):
  Provides the integration for Session Replay.
- [`@sentry/core`](https://github.com/getsentry/sentry-javascript/tree/master/packages/core): The base for all
  JavaScript SDKs with interfaces, type definitions and base classes.

## Bug Bounty Program

Our bug bounty program aims to improve the security of our open source projects by encouraging the community to identify
and report potential security vulnerabilities. Your reward will depend on the severity of the identified vulnerability.

Our program is currently running on an invitation basis. If you're interested in participating, please send us an email
to security@sentry.io and tell us, that you are interested in auditing this repository.

For more details, please have a look at https://sentry.io/security/#vulnerability-disclosure.

## Contributors

Thanks to everyone who contributed to the Sentry JavaScript SDK!

<a href="https://github.com/getsentry/sentry-javascript/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=getsentry/sentry-javascript" />
</a>
