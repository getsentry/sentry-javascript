import type { ServerRuntimeClientOptions } from '@sentry/core';
import { SDK_VERSION, ServerRuntimeClient } from '@sentry/core';

import type { VercelEdgeClientOptions } from './types';

declare const process: {
  env: Record<string, string>;
};

/**
 * The Sentry Vercel Edge Runtime SDK Client.
 *
 * @see VercelEdgeClientOptions for documentation on configuration options.
 * @see ServerRuntimeClient for usage documentation.
 */
export class VercelEdgeClient extends ServerRuntimeClient<VercelEdgeClientOptions> {
  /**
   * Creates a new Vercel Edge Runtime SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: VercelEdgeClientOptions) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.vercel-edge',
      packages: [
        {
          name: 'npm:@sentry/vercel-edge',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    const clientOptions: ServerRuntimeClientOptions = {
      ...options,
      platform: 'vercel-edge',
      // TODO: Grab version information
      runtime: { name: 'vercel-edge' },
      serverName: options.serverName || process.env.SENTRY_NAME,
    };

    super(clientOptions);
  }
}
