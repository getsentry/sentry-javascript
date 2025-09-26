<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for AWS Lambda

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/aws-lambda)

## General

This package is a wrapper around `@sentry/node`, with added functionality related to AWS Lambda. All
methods available in `@sentry/node` can be imported from `@sentry/aws-serverless`.

### Automatic Setup

To use this SDK with an automatic setup, set the following environment variables in your Lambda function configuration:

```bash
NODE_OPTIONS="--import @sentry/aws-serverless/awslambda-auto"
SENTRY_DSN="__DSN__"
# Add Tracing by setting tracesSampleRate and adding integration
# Set tracesSampleRate to 1.0 to capture 100% of transactions
# We recommend adjusting this value in production
# Learn more at
# https://docs.sentry.io/platforms/javascript/configuration/options/#traces-sample-rate
SENTRY_TRACES_SAMPLE_RATE="1.0"
```

### Manual Setup

Alternatively, to further customize the SDK setup, you can also manually initialize the SDK in your lambda function. The benefit of this installation method is that you can fully customize your Sentry SDK setup in a Sentry.init call.

Create a new file, for example `instrument.js` to initialize the SDK:

```js
import * as Sentry from '@sentry/aws-serverless';

Sentry.init({
  dsn: '__DSN__',
  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/aws-lambda/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
  // Add Tracing by setting tracesSampleRate and adding integration
  // Set tracesSampleRate to 1.0 to capture 100% of transactions
  // We recommend adjusting this value in production
  // Learn more at
  // https://docs.sentry.io/platforms/javascript/configuration/options/#traces-sample-rate
  tracesSampleRate: 1.0,
});
```

And then load the SDK before your function starts by importing the instrument.js file via a NODE_OPTIONS environment variable:

```bash
NODE_OPTIONS="--import ./instrument.js"
```

## Verify

```js
// async (recommended)
export const handler = async (event, context) => {
  throw new Error('oh, hello there!');
};

// sync
export const handler = (event, context, callback) => {
  throw new Error('oh, hello there!');
};
```

## Integrate Sentry using the Sentry Lambda layer

Another much simpler way to integrate Sentry to your AWS Lambda function is to add the official layer.

1. Choose Layers -> Add Layer.
2. Specify an ARN: `arn:aws:lambda:us-west-1:943013980633:layer:SentryNodeServerlessSDKv10:19`. Get the latest ARN from the [docs](https://docs.sentry.io/platforms/javascript/guides/aws-lambda/install/layer).
3. Go to Environment variables and add:
   - `NODE_OPTIONS`: `--import @sentry/aws-serverless/awslambda-auto`.
   - `SENTRY_DSN`: `your dsn`.
   - `SENTRY_TRACES_SAMPLE_RATE`: a number between 0 and 1 representing the chance a transaction is sent to Sentry. For
     more information, see
     [docs](https://docs.sentry.io/platforms/javascript/guides/aws-lambda/configuration/options/#tracesSampleRate).
