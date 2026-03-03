import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { ServerRuntimeClientOptions } from '@sentry/core';
import { applySdkMetadata, ServerRuntimeClient } from '@sentry/core';
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
  public traceProvider: BasicTracerProvider | undefined;

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
      // Use provided runtime or default to 'vercel-edge'
      runtime: options.runtime || { name: 'vercel-edge' },
      serverName: options.serverName || process.env.SENTRY_NAME,
    };

    super(clientOptions);
  }

  // Eslint ignore explanation: This is already documented in super.
  // eslint-disable-next-line jsdoc/require-jsdoc
  public async flush(timeout?: number): Promise<boolean> {
    const provider = this.traceProvider;

    await provider?.forceFlush();

    if (this.getOptions().sendClientReports) {
      this._flushOutcomes();
    }

    return super.flush(timeout);
  }
}
