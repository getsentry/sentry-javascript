import * as os from 'os';
import type { ServerRuntimeClientOptions } from '@sentry/core';
import { ServerRuntimeClient, applySdkMetadata } from '@sentry/core';

import type { BunClientOptions } from './types';

/**
 * @deprecated This client is no longer used in v9
 * It was likely mistakenly left after a refactor.
 */
export class BunClient extends ServerRuntimeClient<BunClientOptions> {
  /**
   * Creates a new Bun SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: BunClientOptions) {
    applySdkMetadata(options, 'bun');

    const clientOptions: ServerRuntimeClientOptions = {
      ...options,
      platform: 'javascript',
      runtime: { name: 'bun', version: Bun.version },
      serverName: options.serverName || global.process.env.SENTRY_NAME || os.hostname(),
    };

    super(clientOptions);
  }
}
