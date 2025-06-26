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

interface BaseCloudflareOptions {
  /**
   * @ignore Used internally to disable the deDupeIntegration for workflows.
   * @hidden Used internally to disable the deDupeIntegration for workflows.
   * @default true
   */
  enableDedupe?: boolean;

  /**
   * The Cloudflare SDK is not OpenTelemetry native, however, we set up some OpenTelemetry compatibility
   * via a custom trace provider.
   * This ensures that any spans emitted via `@opentelemetry/api` will be captured by Sentry.
   * HOWEVER, big caveat: This does not handle custom context handling, it will always work off the current scope.
   * This should be good enough for many, but not all integrations.
   *
   * If you want to opt-out of setting up the OpenTelemetry compatibility tracer, set this to `true`.
   *
   * @default false
   */
  skipOpenTelemetrySetup?: boolean;
}

/**
 * Configuration options for the Sentry Cloudflare SDK
 *
 * @see @sentry/core Options for more information.
 */
export interface CloudflareOptions extends Options<CloudflareTransportOptions>, BaseCloudflareOptions {}

/**
 * Configuration options for the Sentry Cloudflare SDK Client class
 *
 * @see CloudflareClient for more information.
 */
export interface CloudflareClientOptions extends ClientOptions<CloudflareTransportOptions>, BaseCloudflareOptions {}
