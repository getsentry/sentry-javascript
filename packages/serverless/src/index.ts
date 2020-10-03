// https://medium.com/unsplash/named-namespace-imports-7345212bbffb
import * as AWSLambda from './awslambda';
import * as GCPFunction from './gcpfunction';
export { AWSLambda, GCPFunction };

export * from './awsservices';
export * from '@sentry/node';
