import * as Sentry from '@sentry/node';
import type { Integration, SdkMetadata } from '@sentry/types';

import { GoogleCloudGrpc } from '../google-cloud-grpc';
import { GoogleCloudHttp } from '../google-cloud-http';
import { serverlessEventProcessor } from '../utils';

export * from './http';
export * from './events';
export * from './cloud_events';

export const defaultIntegrations: Integration[] = [
  ...Sentry.defaultIntegrations,
  new GoogleCloudHttp({ optional: true }), // We mark this integration optional since '@google-cloud/common' module could be missing.
  new GoogleCloudGrpc({ optional: true }), // We mark this integration optional since 'google-gax' module could be missing.
];

/**
 * @see {@link Sentry.init}
 */
export function init(options: Sentry.NodeOptions = {}): void {
  const opts = {
    _metadata: {} as SdkMetadata,
    defaultIntegrations,
    ...options,
  };

  opts._metadata.sdk = opts._metadata.sdk || {
    name: 'sentry.javascript.serverless',
    integrations: ['GCPFunction'],
    packages: [
      {
        name: 'npm:@sentry/serverless',
        version: Sentry.SDK_VERSION,
      },
    ],
    version: Sentry.SDK_VERSION,
  };

  Sentry.init(opts);
  Sentry.addGlobalEventProcessor(serverlessEventProcessor);
}
