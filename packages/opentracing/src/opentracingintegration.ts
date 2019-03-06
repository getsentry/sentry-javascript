import { Integration } from '@sentry/types';
import { Tracer } from './tracer';

/**
 * Session Tracking Integration
 */
export class OpenTracingIntegration implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = OpenTracingIntegration.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'OpenTracingIntegration';

  /**
   * Constructor for OpenTracingIntegration
   *
   * @param traceId Optional TraceId that should be set into the integration.
   * @param _tracer Optional custom tracer that should be used.
   */
  public constructor(traceId?: string, private readonly _tracer: Tracer = new Tracer()) {
    _tracer.setTraceId(traceId);
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    const span = this._tracer.startSpan('sdk.init');
    span.finish();
    setTimeout(() => {
      this._tracer.flush();
    });
  }

  /**
   * Returns the Tracer which can be used as the parent.
   */
  public getTracer(): Tracer {
    return this._tracer;
  }
}
