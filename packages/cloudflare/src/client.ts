import type { ClientOptions, Options, ServerRuntimeClientOptions } from '@sentry/core';
import { applySdkMetadata, ServerRuntimeClient } from '@sentry/core';
import type { CloudflareTransportOptions } from './transport';

/**
 * The Sentry Cloudflare SDK Client.
 *
 * @see CloudflareClientOptions for documentation on configuration options.
 * @see ServerRuntimeClient for usage documentation.
 */
export class CloudflareClient extends ServerRuntimeClient<CloudflareClientOptions> {
  /**
   * Creates a new Cloudflare SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: CloudflareClientOptions) {
    applySdkMetadata(options, 'cloudflare');
    options._metadata = options._metadata || {};

    const clientOptions: ServerRuntimeClientOptions = {
      ...options,
      platform: 'javascript',
      // TODO: Grab version information
      runtime: { name: 'cloudflare' },
      // TODO: Add server name
    };

    super(clientOptions);
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface BaseCloudflareOptions {}

/**
 * Configuration options for the Sentry Cloudflare SDK
 *
 * @see @sentry/core Options for more information.
 */
export interface CloudflareOptions extends Options<CloudflareTransportOptions>, BaseCloudflareOptions {
  /**
   * Enable or disable the automatic continuation of traces from the propagation context.
   *
   * When enabled, the SDK will continue a trace from the propagation context if it is present.
   *
   * When disabled, the SDK will fall back to the default case of continuing a trace from the request headers if they are present.
   *
   * @default false
   */
  continueTraceFromPropagationContext?: boolean;
}

/**
 * Configuration options for the Sentry Cloudflare SDK Client class
 *
 * @see CloudflareClient for more information.
 */
export interface CloudflareClientOptions extends ClientOptions<CloudflareTransportOptions>, BaseCloudflareOptions {}
