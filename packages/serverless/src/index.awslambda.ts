// https://medium.com/unsplash/named-namespace-imports-7345212bbffb
import * as AWSLambda from './awslambda';
export { AWSLambda };

export * from './awsservices';
export * from '@sentry/node';
