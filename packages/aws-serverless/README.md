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

## Container Image-based Lambda Functions

When using container image-based Lambda functions (e.g., with [Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) for frameworks like SvelteKit, Next.js, or Remix), Lambda layers cannot be attached. Instead, you can install the Sentry Lambda extension directly into your Docker image. The extension tunnels Sentry events through a local proxy, improving event delivery reliability during Lambda freezes.

### Setup

1. Install `@sentry/aws-serverless` as a dependency — even if you use a different Sentry SDK in your application (e.g., `@sentry/sveltekit`), this package contains the extension files needed for the Docker image.

2. Copy the extension files from the npm package into your Docker image:

```dockerfile
FROM public.ecr.aws/lambda/nodejs:22

# Copy the Sentry Lambda extension
RUN mkdir -p /opt/sentry-extension
COPY node_modules/@sentry/aws-serverless/build/lambda-extension/sentry-extension /opt/extensions/sentry-extension
COPY node_modules/@sentry/aws-serverless/build/lambda-extension/index.mjs /opt/sentry-extension/index.mjs
RUN chmod +x /opt/extensions/sentry-extension /opt/sentry-extension/index.mjs

# ... rest of your Dockerfile
```

3. Point your Sentry SDK at the extension using the `tunnel` option. The extension always listens on `http://localhost:9000/envelope` — this URL is fixed and must be used exactly as shown:

```js
import * as Sentry from '@sentry/aws-serverless';

Sentry.init({
  dsn: '__DSN__',
  tunnel: 'http://localhost:9000/envelope',
});
```

This works with any Sentry SDK:

```js
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: '__DSN__',
  tunnel: 'http://localhost:9000/envelope',
});
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
