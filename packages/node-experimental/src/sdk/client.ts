import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { EventHint, Scope } from '@sentry/node';
import { NodeClient, SDK_VERSION } from '@sentry/node';
import type { Event } from '@sentry/types';

import type {
  NodeExperimentalClient as NodeExperimentalClientInterface,
  NodeExperimentalClientOptions,
} from '../types';
import { NodeExperimentalScope } from './scope';

/**
 * A client built on top of the NodeClient, which provides some otel-specific things on top.
 */
export class NodeExperimentalClient extends NodeClient implements NodeExperimentalClientInterface {
  public traceProvider: BasicTracerProvider | undefined;
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

  /**
   * @inheritDoc
   */
  public async flush(timeout?: number): Promise<boolean> {
    const provider = this.traceProvider;
    const spanProcessor = provider?.activeSpanProcessor;

    if (spanProcessor) {
      await spanProcessor.forceFlush();
    }

    return super.flush(timeout);
  }

  /**
   * Extends the base `_prepareEvent` so that we can properly handle `captureContext`.
   * This uses `Scope.clone()`, which we need to replace with `NodeExperimentalScope.clone()` for this client.
   */
  protected _prepareEvent(event: Event, hint: EventHint, scope?: Scope): PromiseLike<Event | null> {
    let actualScope = scope;

    // Remove `captureContext` hint and instead clone already here
    if (hint && hint.captureContext) {
      actualScope = NodeExperimentalScope.clone(scope);
      delete hint.captureContext;
    }

    return super._prepareEvent(event, hint, actualScope);
  }
}
