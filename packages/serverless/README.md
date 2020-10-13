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

### AWS Lambda

To use this SDK, call `Sentry.AWSLambda.init(options)` at the very beginning of your JavaScript file.

```javascript
import * as Sentry from '@sentry/serverless';

Sentry.AWSLambda.init({
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

If you also want to trace performance of all the incoming requests and also outgoing AWS service requests, just set the `tracesSampleRate` option. 

```javascript
import * as Sentry from '@sentry/serverless';

Sentry.AWSLambda.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
});
```

### Google Cloud Functions

To use this SDK, call `Sentry.GCPFunction.init(options)` at the very beginning of your JavaScript file.

```javascript
import * as Sentry from '@sentry/serverless';

Sentry.GCPFunction.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
  // ...
});

// For HTTP Functions:

exports.helloHttp = Sentry.GCPFunction.wrapHttpFunction((req, res) => {
  throw new Error('oh, hello there!');
});

// For Background Functions:

exports.helloEvents = Sentry.GCPFunction.wrapEventFunction((data, context, callback) => {
  throw new Error('oh, hello there!');
});

// For CloudEvents:

exports.helloEvents = Sentry.GCPFunction.wrapCloudEventFunction((context, callback) => {
  throw new Error('oh, hello there!');
});
```
