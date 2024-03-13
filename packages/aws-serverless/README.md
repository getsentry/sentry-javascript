<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Serverless environments

## Links

- [Official SDK Docs](https://docs.sentry.io/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This package is a wrapper around `@sentry/node`, with added functionality related to various Serverless solutions. All
methods available in `@sentry/node` can be imported from `@sentry/aws-serverless`.

Currently supported environment:

### AWS Lambda

To use this SDK, call `Sentry.init(options)` at the very beginning of your JavaScript file.

```javascript
import * as Sentry from '@sentry/aws-serverless';

Sentry.init({
  dsn: '__DSN__',
  // ...
});

// async (recommended)
exports.handler = Sentry.wrapHandler(async (event, context) => {
  throw new Error('oh, hello there!');
});

// sync
exports.handler = Sentry.wrapHandler((event, context, callback) => {
  throw new Error('oh, hello there!');
});
```

If you also want to trace performance of all the incoming requests and also outgoing AWS service requests, just set the
`tracesSampleRate` option.

```javascript
import * as Sentry from '@sentry/aws-serverless';

Sentry.AWSLambda.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
});
```

#### Integrate Sentry using internal extension

Another and much simpler way to integrate Sentry to your AWS Lambda function is to add an official layer.

1. Choose Layers -> Add Layer.
2. Specify an ARN: `arn:aws:lambda:us-west-1:TODO:layer:TODO:VERSION`.
3. Go to Environment variables and add:
   - `NODE_OPTIONS`: `-r @sentry/aws-serverless/build/npm/cjs/awslambda-auto`.
   - `SENTRY_DSN`: `your dsn`.
   - `SENTRY_TRACES_SAMPLE_RATE`: a number between 0 and 1 representing the chance a transaction is sent to Sentry. For
     more information, see
     [docs](https://docs.sentry.io/platforms/node/guides/aws-lambda/configuration/options/#tracesSampleRate).
