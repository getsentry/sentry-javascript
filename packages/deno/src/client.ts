import type { ServerRuntimeClientOptions } from '@sentry/core';
import { SDK_VERSION, ServerRuntimeClient } from '@sentry/core';
import type { DenoClientOptions } from './types';

function getHostName(): string | undefined {
  // Deno.permissions.querySync is not available on Deno Deploy
  if (!Deno.permissions.querySync) {
    return undefined;
  }

  const result = Deno.permissions.querySync({ name: 'sys', kind: 'hostname' });
  return result.state === 'granted' ? Deno.hostname() : undefined;
}

/**
 * The Sentry Deno SDK Client.
 *
 * @see DenoClientOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class DenoClient extends ServerRuntimeClient<DenoClientOptions> {
  /**
   * Creates a new Deno SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: DenoClientOptions) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.deno',
      packages: [
        {
          name: 'denoland:sentry',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    const clientOptions: ServerRuntimeClientOptions = {
      ...options,
      platform: 'javascript',
      runtime: { name: 'deno', version: Deno.version.deno },
      serverName: options.serverName || getHostName(),
    };

    super(clientOptions);
  }
}
