import { getDefaultIntegrations as getNodeDefaultIntegrations } from '@sentry/node';
import { init, tryPatchHandler } from './sdk';

const lambdaTaskRoot = process.env.LAMBDA_TASK_ROOT;
if (lambdaTaskRoot) {
  const handlerString = process.env._HANDLER;
  if (!handlerString) {
    throw Error(`LAMBDA_TASK_ROOT is non-empty(${lambdaTaskRoot}) but _HANDLER is not set`);
  }

  init({
    // We want to load the performance integrations here, if the tracesSampleRate is set for the layer in env vars
    // Sentry node's `getDefaultIntegrations` will load them if tracing is enabled,
    // which is the case if `tracesSampleRate` is set.
    // We can safely add all the node default integrations
    integrations: getNodeDefaultIntegrations(
      process.env.SENTRY_TRACES_SAMPLE_RATE
        ? {
            tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE),
          }
        : {},
    ),
  });

  tryPatchHandler(lambdaTaskRoot, handlerString);
} else {
  throw Error('LAMBDA_TASK_ROOT environment variable is not set');
}
