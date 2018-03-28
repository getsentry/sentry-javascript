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

**WARNING:** All of these SDKs are still undergoing active development, so we
might change the public interface and introduce breaking changes from time to
time. We still recommend you to use
[raven-js](https://github.com/getsentry/raven-js) and
[raven](https://github.com/getsentry/raven-node) for production use.

## Usage

We offer a specific high-level SDK for each JavaScript platform, which you can
import and use directly. Each of these packages offers instructions and
information on its specifics:

* [`@sentry/shim`](https://github.com/getsentry/raven-js/tree/next/packages/shim):
  SDK targeted for library authors if the library is used next to a Sentry SDK.
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

The integration always looks the same. In Node, for example:

```javascript
import { create, captureMessage } from '@sentry/node';

create({
  dsn: '__DSN__',
  // ...
});

captureMessage('Hello, world!');
```

**NOTE:** Are you missing an SDK here? We've probably not updated it for the
`next` line just yet.

## Packages

Besides the high-level SDKs, this repository contains shared packages, helpers
and configuration useful for development of SDKs. If you're thinking about
creating a new JavaScript-based SDK for Sentry, have a look at the resources
below:

* [`@sentry/core`](https://github.com/getsentry/raven-js/tree/next/packages/core):
  The base for all JavaScript SDKs with interfaces, type definitions and base
  classes.
* [`@sentry/utils`](https://github.com/getsentry/raven-js/tree/next/packages/utils):
  A set of helpers and utility functions useful for various SDKs.
* [`@sentry/typescript`](https://github.com/getsentry/raven-js/tree/next/packages/typescript):
  Shared Typescript compiler and linter options.

## Implementing a new SDK

TODO:

* Overview over interfaces and classes
* Implement `Backend`
* Derive `Frontend`
* Scopes and the Shim
* A word on overloading functions
* Differences for native backends

## Join the Discussion

TODO:

* Create a tracking issue and point there
* Encourage people to give feedback
