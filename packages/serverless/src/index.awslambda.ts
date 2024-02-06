/** This file is used as the entrypoint for the lambda layer bundle, and is not included in the npm package. */

import { init as awsLambdaInit, tryPatchHandler, wrapHandler } from './awslambda';

export const AWSLambda = {
  init: awsLambdaInit,
  wrapHandler,
  tryPatchHandler,
};

export * from './awsservices';
export * from '@sentry/node';
