import { addGlobalEventProcessor, getHubAndIntegration } from '@sentry/hub';
import { Event, Integration } from '@sentry/types';

/** This function adds duration since Sentry was initialized till the time event was sent */
export class SessionTiming implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'SessionTiming';

  /**
   * @inheritDoc
   */
  public name: string = SessionTiming.id;

  /** Exact time Client was initialized expressed in milliseconds since Unix Epoch. */
  protected readonly _startTime: number = Date.now();

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor(event => {
      const [hub, integration] = getHubAndIntegration(SessionTiming);
      if (hub && integration) {
        return integration.process(event);
      }
      return event;
    });
  }

  /**
   * @inheritDoc
   */
  public process(event: Event): Event {
    const now = Date.now();

    return {
      ...event,
      extra: {
        ...event.extra,
        ['session:start']: this._startTime,
        ['session:duration']: now - this._startTime,
        ['session:end']: now,
      },
    };
  }
}
