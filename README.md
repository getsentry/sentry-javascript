<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

[![Build Status](https://travis-ci.com/getsentry/sentry-javascript.svg?branch=master)](https://travis-ci.com/getsentry/sentry-javascript)
[![codecov](https://codecov.io/gh/getsentry/sentry-javascript/branch/master/graph/badge.svg)](https://codecov.io/gh/getsentry/sentry-javascript)
[![npm version](https://img.shields.io/npm/v/@sentry/core.svg)](https://www.npmjs.com/package/@sentry/core)
[![typedoc](https://img.shields.io/badge/docs-typedoc-blue.svg)](http://getsentry.github.io/sentry-javascript/)

# Official Sentry SDKs for JavaScript

This is the next line of Sentry JavaScript SDKs, comprised in the `@sentry/` namespace. It will provide a more
convenient interface and improved consistency between various JavaScript environments.

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## Contents

- [Contributing](https://github.com/getsentry/sentry-javascript/blob/master/CONTRIBUTING.md)
- [Supported Platforms](#supported-platforms)
- [Installation and Usage](#installation-and-usage)
- [Other Packages](#other-packages)

## Supported Platforms

For each major JavaScript platform, there is a specific high-level SDK that provides all the tools you need in a single
package. Please refer to the README and instructions of those SDKs for more detailed information:

- [`@sentry/hub`](https://github.com/getsentry/sentry-javascript/tree/master/packages/hub): Global state management of
  SDKs
- [`@sentry/minimal`](https://github.com/getsentry/sentry-javascript/tree/master/packages/minimal): Minimal SDK for
  library authors to add Sentry support
- [`@sentry/browser`](https://github.com/getsentry/sentry-javascript/tree/master/packages/browser): SDK for Browsers,
  including integrations for React, Angular, Ember, Vue and Backbone
- [`@sentry/node`](https://github.com/getsentry/sentry-javascript/tree/master/packages/node): SDK for Node, including
  integrations for Express, Koa, Loopback, Sails and Connect
- [`@sentry/integrations`](https://github.com/getsentry/sentry-javascript/tree/master/packages/integrations): Pluggable
  integrations that can be used to enchance JS SDKs
- [`@sentry/electron`](https://github.com/getsentry/sentry-electron): SDK for Electron with support for native crashes
- [`sentry-cordova`](https://github.com/getsentry/sentry-cordova): SDK for Cordova Apps and Ionic with support for
  native crashes
- [`raven-js`](https://github.com/getsentry/sentry-javascript/tree/master/packages/raven-js): Our old stable Javascript
  SDK, we still support and release bug fixes for the SDK but all new features will be implemented in `@sentry/browser`
  which is the successor.
- [`raven`](https://github.com/getsentry/sentry-javascript/tree/master/packages/raven-node): Our old stable Node SDK,
  same as for `raven-js` we still support and release bug fixes for the SDK but all new features will be implemented in
  `@sentry/node` which is the successor.

## Installation and Usage

To install a SDK, simply add the high-level package, for example:

```sh
npm install --save @sentry/browser
yarn add @sentry/browser
```

Setup and usage of these SDKs always follows the same principle.

```javascript
import { init, captureMessage } from '@sentry/browser';

init({
  dsn: '__DSN__',
  // ...
});

captureMessage('Hello, world!');
```

If you want sentry to be customized for the browsers you want to support use the `esm` build:

```javascript
import { init, captureMessage } from '@sentry/browser/esm';
```

and add it to your babel/... build, if you want to support older browsers

> TIP: You can use
> [`<script type="module" str="newbrowser.js">` + `<script nomodule src="oldbrowser.js">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#Module_Fallback)
> to provide builds for newer and older browsers

## Other Packages

Besides the high-level SDKs, this repository contains shared packages, helpers and configuration used for SDK
development. If you're thinking about contributing to or creating a JavaScript-based SDK, have a look at the resources
below:

- [`@sentry/core`](https://github.com/getsentry/sentry-javascript/tree/master/packages/core): The base for all
  JavaScript SDKs with interfaces, type definitions and base classes.
- [`@sentry/utils`](https://github.com/getsentry/sentry-javascript/tree/master/packages/utils): A set of helpers and
  utility functions useful for various SDKs.
- [`@sentry/typescript`](https://github.com/getsentry/sentry-javascript/tree/master/packages/typescript): Shared
  Typescript compiler and linter options.
- [`@sentry/types`](https://github.com/getsentry/sentry-javascript/tree/master/packages/types): Types used in all
  packages.
