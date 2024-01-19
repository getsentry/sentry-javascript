import type { ServerRuntimeClientOptions } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { ServerRuntimeClient } from '@sentry/core';

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
    applySdkMetadata(options, 'vercel-edge');
    options._metadata = options._metadata || {};

    const clientOptions: ServerRuntimeClientOptions = {
      ...options,
      platform: 'javascript',
      // TODO: Grab version information
      runtime: { name: 'vercel-edge' },
      serverName: options.serverName || process.env.SENTRY_NAME,
    };

    super(clientOptions);
  }
}
