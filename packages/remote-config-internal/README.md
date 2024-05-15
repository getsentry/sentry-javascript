<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Sentry Remote Configuration

[![npm version](https://img.shields.io/npm/v/@sentry-internal/remote-config.svg)](https://www.npmjs.com/package/@sentry-internal/remote-config)
[![npm dm](https://img.shields.io/npm/dm/@sentry-internal/remote-config.svg)](https://www.npmjs.com/package/@sentry-internal/remote-config)
[![npm dt](https://img.shields.io/npm/dt/@sentry-internal/remote-config.svg)](https://www.npmjs.com/package/@sentry-internal/remote-config)

This is an internal package that is being re-exported in `@sentry/browser` and other browser-related SDKs like
`@sentry/react` or `@sentry/vue`.

## Pre-requisites

`@sentry-internal/remote-config` requires Node 14+, and browsers newer than IE11.

## Installation

TODO

## Setup

TODO 
```javascript
import * as Sentry from '@sentry/browser';
// or e.g. import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: '__DSN__',
});
```

