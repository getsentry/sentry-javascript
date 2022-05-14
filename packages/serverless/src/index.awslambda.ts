/** This file is used as the entrypoint for the lambda layer bundle, and is not included in the npm package. */

// https://medium.com/unsplash/named-namespace-imports-7345212bbffb
import * as AWSLambda from './awslambda';
export { AWSLambda };

export * from './awsservices';
export * from '@sentry/node';
