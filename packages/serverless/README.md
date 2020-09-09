<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK for Serverless environments

## Links

- [Official SDK Docs](https://docs.sentry.io/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This package is a wrapper around `@sentry/node`, with added functionality related to various Serverless solutions. All
methods available in `@sentry/node` can be imported from `@sentry/serverless`.

Currently supported environment:

*AWS Lambda*

To use this SDK, call `Sentry.init(options)` at the very beginning of your JavaScript file.

```javascript
import * as Sentry from '@sentry/serverless';

Sentry.init({
  dsn: '__DSN__',
  // ...
});

// async (recommended)
exports.handler = Sentry.AWSLambda.wrapHandler(async (event, context) => {
  throw new Error('oh, hello there!');
});

// sync
exports.handler = Sentry.AWSLambda.wrapHandler((event, context, callback) => {
  throw new Error('oh, hello there!');
});
```
