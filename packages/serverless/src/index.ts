// https://medium.com/unsplash/named-namespace-imports-7345212bbffb
import * as AWSLambda from './awslambda';
import * as GCPFunction from './gcpfunction';
export { AWSLambda, GCPFunction };

export * from './awsservices';
export * from '@sentry/node';

import { SDK_VERSION } from '@sentry/node';
import { setSDKInfo } from '@sentry/utils';

setSDKInfo('sentry.javascript.serverless', 'npm:@sentry/serverless', SDK_VERSION);
