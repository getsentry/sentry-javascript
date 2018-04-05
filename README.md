<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDKs for JavaScript (Preview)

This is a preview of the next line of Sentry JavaScript SDKs, comprised in the
`@sentry/` namespace. It will provide a more convenient interface and improved
consistency between various JavaScript environments.

**WARNING:** All of these SDKs are still undergoing active development, so the
public interface might change and break backwards compatibility from time to
time. We absolutely recommend [raven-js](https://github.com/getsentry/raven-js)
and [raven](https://github.com/getsentry/raven-node) for production use.

## Contents

* [Supported Platforms](#supported-platforms)
* [Installation and Usage](#installation-and-usage)
* [Other Packages](#other-packages)
* [SDK Development](#sdk-development)
* [Join the Discussion](#join-the-discussion)

## Supported Platforms

For each major JavaScript platform, there is a specific high-level SDK that
provides all the tools you need in a single package. Please refer to the README
and instructions of those SDKs for more detailed information:

* [`@sentry/shim`](https://github.com/getsentry/raven-js/tree/next/packages/shim):
  Minimal SDK for library authors to add Sentry support
* [`@sentry/browser`](https://github.com/getsentry/raven-js/tree/next/packages/browser):
  SDK for Browsers, including integrations for React, Angular, Ember, Vue and
  Backbone
* [`@sentry/node`](https://github.com/getsentry/raven-js/tree/next/packages/node):
  SDK for Node, including integrations for Express, Koa, Loopback, Sails and
  Connect
* [`@sentry/electron`](https://github.com/getsentry/sentry-electron): SDK for
  Electron with support for native crashes
* [`sentry-cordova`](https://github.com/getsentry/sentry-cordova): SDK for
  Cordova Apps and Ionic with support for native crashes

**NOTE:** Are you missing an SDK here? It has probably not been integrated into
the `next` line yet.

## Installation and Usage

To install an SDK, simply add the high-level package, for example:

```sh
npm install --save @sentry/node
yarn add @sentry/node
```

Setup and usage of these SDKs always follows the same principle. In Node, for
example (on another platform simply substitute the import):

```javascript
const { init, captureMessage } = require('@sentry/node');

init({
  dsn: '__DSN__',
  // ...
});

captureMessage('Hello, world!');
```

## Other Packages

Besides the high-level SDKs, this repository contains shared packages, helpers
and configuration used for SDK development. If you're thinking about
contributing to or creating a JavaScript-based SDK, have a look at the resources
below:

* [`@sentry/core`](https://github.com/getsentry/raven-js/tree/next/packages/core):
  The base for all JavaScript SDKs with interfaces, type definitions and base
  classes.
* [`@sentry/utils`](https://github.com/getsentry/raven-js/tree/next/packages/utils):
  A set of helpers and utility functions useful for various SDKs.
* [`@sentry/typescript`](https://github.com/getsentry/raven-js/tree/next/packages/typescript):
  Shared Typescript compiler and linter options.

## Join the Discussion

Join the discussion in our
[tracking issue](https://github.com/getsentry/raven-js/issues/1281) and let us
know what you think of the updated interface and new possibilities.
