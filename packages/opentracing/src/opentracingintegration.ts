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
   * @param tracer Optional custom tracer that should be used.
   */
  public constructor(traceId?: string, private readonly tracer: Tracer = new Tracer()) {
    tracer.setTraceId(traceId);
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    const span = this.tracer.startSpan('sdk.init');
    span.finish();
    setTimeout(() => {
      this.tracer.flush();
    });
  }

  /**
   * Returns the Tracer which can be used as the parent.
   */
  public getTracer(): Tracer {
    return this.tracer;
  }
}
