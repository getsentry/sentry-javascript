import type { NodeOptions } from '@sentry/node';
import {
  SDK_VERSION,
  defaultIntegrations as defaultNodeIntegrations,
  getDefaultIntegrations as getDefaultNodeIntegrations,
  init as initNode,
} from '@sentry/node';
import type { Integration, Options, SdkMetadata } from '@sentry/types';

import { googleCloudGrpcIntegration } from '../google-cloud-grpc';
import { googleCloudHttpIntegration } from '../google-cloud-http';

export * from './http';
export * from './events';
export * from './cloud_events';

/** @deprecated Use `getDefaultIntegrations(options)` instead. */
export const defaultIntegrations: Integration[] = [
  // eslint-disable-next-line deprecation/deprecation
  ...defaultNodeIntegrations,
  googleCloudHttpIntegration({ optional: true }), // We mark this integration optional since '@google-cloud/common' module could be missing.
  googleCloudGrpcIntegration({ optional: true }), // We mark this integration optional since 'google-gax' module could be missing.
];

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
    name: 'sentry.javascript.serverless',
    integrations: ['GCPFunction'],
    packages: [
      {
        name: 'npm:@sentry/serverless',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  initNode(opts);
}
