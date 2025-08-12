// Important: This file cannot import anything other than the index file below.
// This is the entry point to the lambda layer, which only contains the entire SDK bundled into the index file
import * as Sentry from './index';

const lambdaTaskRoot = process.env.LAMBDA_TASK_ROOT;
if (lambdaTaskRoot) {
  const handlerString = process.env._HANDLER;
  if (!handlerString) {
    throw Error(`LAMBDA_TASK_ROOT is non-empty(${lambdaTaskRoot}) but _HANDLER is not set`);
  }

  Sentry.init({
    // We want to load the performance integrations here, if the tracesSampleRate is set for the layer in env vars
    // Sentry node's `getDefaultIntegrations` will load them if tracing is enabled,
    // which is the case if `tracesSampleRate` is set.
    // We can safely add all the node default integrations
    integrations: Sentry.getDefaultIntegrations(
      process.env.SENTRY_TRACES_SAMPLE_RATE
        ? {
            tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE),
          }
        : {},
    ),
  });
} else {
  throw Error('LAMBDA_TASK_ROOT environment variable is not set');
}
