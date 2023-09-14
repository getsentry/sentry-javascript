import type { ServerRuntimeClientOptions } from '@sentry/core';
import { SDK_VERSION, ServerRuntimeClient } from '@sentry/core';
import * as os from 'os';
import { TextEncoder } from 'util';

import type { BunClientOptions } from './types';

/**
 * The Sentry Node SDK Client.
 *
 * @see BunClientOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class BunClient extends ServerRuntimeClient<BunClientOptions> {
  /**
   * Creates a new Node SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: BunClientOptions) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.bun',
      packages: [
        {
          name: 'npm:@sentry/bun',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    // Until node supports global TextEncoder in all versions we support, we are forced to pass it from util
    options.transportOptions = {
      textEncoder: new TextEncoder(),
      ...options.transportOptions,
    };

    const clientOptions: ServerRuntimeClientOptions = {
      ...options,
      platform: 'bun',
      runtime: { name: 'bun', version: global.process.version },
      serverName: options.serverName || global.process.env.SENTRY_NAME || os.hostname(),
    };

    super(clientOptions);
  }
}
