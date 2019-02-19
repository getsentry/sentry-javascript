import { getCurrentHub } from '@sentry/hub';
import { Integration } from '@sentry/types';
import { globalTracer, initGlobalTracer } from './index';
import { Tracer } from './tracer';

/**
 * Session Tracking Integration
 */
export class SessionTracking implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = SessionTracking.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'SessionTracking';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    const tracer = new Tracer();
    initGlobalTracer(tracer);
    const span = globalTracer().startSpan('sdk.init');
    console.log(JSON.stringify(span));
    setTimeout(() => {
      getCurrentHub().captureEvent({ spans: [span] });
    }, 10);
  }
}
