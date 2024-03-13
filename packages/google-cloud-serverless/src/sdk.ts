import type { NodeOptions } from '@sentry/node';
import { SDK_VERSION, getDefaultIntegrations as getDefaultNodeIntegrations, init as initNode } from '@sentry/node';
import type { Integration, Options, SdkMetadata } from '@sentry/types';

import { googleCloudGrpcIntegration } from './integrations/google-cloud-grpc';
import { googleCloudHttpIntegration } from './integrations/google-cloud-http';

/** Get the default integrations for the GCP SDK. */
export function getDefaultIntegrations(options: Options): Integration[] {
  return [
    ...getDefaultNodeIntegrations(options),
    googleCloudHttpIntegration({ optional: true }), // We mark this integration optional since '@google-cloud/common' module could be missing.
    googleCloudGrpcIntegration({ optional: true }), // We mark this integration optional since 'google-gax' module could be missing.
  ];
}

/**
 * @see {@link Sentry.init}
 */
export function init(options: NodeOptions = {}): void {
  const opts = {
    _metadata: {} as SdkMetadata,
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  opts._metadata.sdk = opts._metadata.sdk || {
    name: 'sentry.javascript.google-cloud-serverless',
    packages: [
      {
        name: 'npm:@sentry/google-cloud-serverless',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  initNode(opts);
}
