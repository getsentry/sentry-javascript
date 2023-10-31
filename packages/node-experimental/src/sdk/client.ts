import { NodeClient, SDK_VERSION } from '@sentry/node';
import { getCurrentHub, wrapClientClass } from '@sentry/opentelemetry';

import type { NodeExperimentalClient as NodeExperimentalClientInterface } from '../types';

class NodeExperimentalBaseClient extends NodeClient {
  public constructor(options: ConstructorParameters<typeof NodeClient>[0]) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.node-experimental',
      packages: [
        {
          name: 'npm:@sentry/node-experimental',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    super(options);
  }
}

export const NodeExperimentalClient = wrapClientClass(NodeExperimentalBaseClient);

/**
 * Get the currently active client (or undefined, if the SDK is not initialized).
 */
export function getClient(): NodeExperimentalClientInterface | undefined {
  return getCurrentHub().getClient<NodeExperimentalClientInterface>();
}
