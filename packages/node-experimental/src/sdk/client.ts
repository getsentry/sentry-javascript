import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { NodeClient, SDK_VERSION } from '@sentry/node';

import type { NodeExperimentalClientOptions } from '../types';

/**
 * A client built on top of the NodeClient, which provides some otel-specific things on top.
 */
export class NodeExperimentalClient extends NodeClient {
  private _tracer: Tracer | undefined;

  public constructor(options: ConstructorParameters<typeof NodeClient>[0]) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.node-experimental',
      packages: [
        {
          name: 'npm:@sentry/node-experimental',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    super(options);
  }

  /** Get the OTEL tracer. */
  public get tracer(): Tracer {
    if (this._tracer) {
      return this._tracer;
    }

    const name = '@sentry/node-experimental';
    const version = SDK_VERSION;
    const tracer = trace.getTracer(name, version);
    this._tracer = tracer;

    return tracer;
  }

  /**
   * Get the options for the node preview client.
   */
  public getOptions(): NodeExperimentalClientOptions {
    // Just a type-cast, basically
    return super.getOptions();
  }
}
