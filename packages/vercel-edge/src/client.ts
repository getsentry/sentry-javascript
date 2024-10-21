import type { ServerRuntimeClientOptions } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { ServerRuntimeClient } from '@sentry/core';

import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
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
      // TODO: Grab version information
      runtime: { name: 'vercel-edge' },
      serverName: options.serverName || process.env.SENTRY_NAME,
    };

    super(clientOptions);
  }

  // Eslint ignore explanation: This is already documented in super.
  // eslint-disable-next-line jsdoc/require-jsdoc
  public async flush(timeout?: number): Promise<boolean> {
    const provider = this.traceProvider;
    const spanProcessor = provider?.activeSpanProcessor;

    if (spanProcessor) {
      await spanProcessor.forceFlush();
    }

    if (this.getOptions().sendClientReports) {
      this._flushOutcomes();
    }

    return super.flush(timeout);
  }
}
