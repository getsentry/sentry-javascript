<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Google Cloud Functions

## Links

- [Official SDK Docs](https://docs.sentry.io/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This package is a wrapper around `@sentry/node`, with added functionality related to various Serverless solutions. All
methods available in `@sentry/node` can be imported from `@sentry/google-cloud-serverless`.

To use this SDK, call `Sentry.init(options)` at the very beginning of your JavaScript file.

```javascript
const Sentry = require('@sentry/google-cloud-serverless');

Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
  // ...
});

// For HTTP Functions:

exports.helloHttp = Sentry.wrapHttpFunction((req, res) => {
  throw new Error('oh, hello there!');
});

// For Background Functions:

exports.helloEvents = Sentry.wrapEventFunction((data, context, callback) => {
  throw new Error('oh, hello there!');
});

// For CloudEvents:

exports.helloEvents = Sentry.wrapCloudEventFunction((context, callback) => {
  throw new Error('oh, hello there!');
});
```
