import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { NodeClient, SDK_VERSION } from '@sentry/node';
import { OtelHooks } from '@sentry/opentelemetry-node';

import type { NodeExperimentalClientOptions } from '../types';

/**
 * A client built on top of the NodeClient, which provides some otel-specific things on top.
 */
export class NodeExperimentalClient extends NodeClient {
  public otelHooks: OtelHooks;

  private _tracer: Tracer | undefined;

  public constructor(options: ConstructorParameters<typeof NodeClient>[0]) {
    super(options);

    this.otelHooks = new OtelHooks();
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
