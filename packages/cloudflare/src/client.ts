import type { ClientOptions, Options, ServerRuntimeClientOptions } from '@sentry/core';
import { applySdkMetadata, ServerRuntimeClient } from '@sentry/core';
import type { makeFlushLock } from './flush';
import type { CloudflareTransportOptions } from './transport';

/**
 * The Sentry Cloudflare SDK Client.
 *
 * @see CloudflareClientOptions for documentation on configuration options.
 * @see ServerRuntimeClient for usage documentation.
 */
export class CloudflareClient extends ServerRuntimeClient {
  private readonly _flushLock: ReturnType<typeof makeFlushLock> | void;

  /**
   * Creates a new Cloudflare SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: CloudflareClientOptions) {
    applySdkMetadata(options, 'cloudflare');
    options._metadata = options._metadata || {};
    const { flushLock, ...serverOptions } = options;

    const clientOptions: ServerRuntimeClientOptions = {
      ...serverOptions,
      platform: 'javascript',
      // TODO: Grab version information
      runtime: { name: 'cloudflare' },
      // TODO: Add server name
    };

    super(clientOptions);
    this._flushLock = flushLock;
  }

  /**
   * Flushes pending operations and ensures all data is processed.
   * If a timeout is provided, the operation will be completed within the specified time limit.
   *
   * @param {number} [timeout] - Optional timeout in milliseconds to force the completion of the flush operation.
   * @return {Promise<boolean>} A promise that resolves to a boolean indicating whether the flush operation was successful.
   */
  public async flush(timeout?: number): Promise<boolean> {
    if (this._flushLock) {
      await this._flushLock.finalize();
    }
    return super.flush(timeout);
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

  /**
   * Enable instrumentation of prototype methods for DurableObjects.
   *
   * When `true`, the SDK will wrap all methods on the DurableObject prototype chain
   * to automatically create spans and capture errors for RPC method calls.
   *
   * When an array of strings is provided, only the specified method names will be instrumented.
   *
   * This feature adds runtime overhead as it wraps methods at the prototype level.
   * Only enable this if you need automatic instrumentation of prototype methods.
   *
   * @default false
   * @example
   * ```ts
   * // Instrument all prototype methods
   * instrumentPrototypeMethods: true
   *
   * // Instrument only specific methods
   * instrumentPrototypeMethods: ['myMethod', 'anotherMethod']
   * ```
   */
  instrumentPrototypeMethods?: boolean | string[];
}

/**
 * Configuration options for the Sentry Cloudflare SDK
 *
 * @see @sentry/core Options for more information.
 */
export interface CloudflareOptions extends Options<CloudflareTransportOptions>, BaseCloudflareOptions {
  ctx?: ExecutionContext;
}

/**
 * Configuration options for the Sentry Cloudflare SDK Client class
 *
 * @see CloudflareClient for more information.
 */
export interface CloudflareClientOptions extends ClientOptions<CloudflareTransportOptions>, BaseCloudflareOptions {
  flushLock?: ReturnType<typeof makeFlushLock>;
}
