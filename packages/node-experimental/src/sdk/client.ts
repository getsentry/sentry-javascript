import { NodeClient, SDK_VERSION } from '@sentry/node';
import { wrapClientClass } from '@sentry/opentelemetry';

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
