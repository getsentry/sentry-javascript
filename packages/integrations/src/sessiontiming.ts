import type { Event, Integration } from '@sentry/types';

/** This function adds duration since Sentry was initialized till the time event was sent */
export class SessionTiming implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'SessionTiming';

  /**
   * @inheritDoc
   */
  public name: string;

  /** Exact time Client was initialized expressed in milliseconds since Unix Epoch. */
  protected readonly _startTime: number;

  public constructor() {
    this.name = SessionTiming.id;
    this._startTime = Date.now();
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobaleventProcessor: unknown, _getCurrentHub: unknown): void {
    // noop
  }

  /** @inheritDoc */
  public processEvent(event: Event): Event {
    return this.process(event);
  }

  /**
   * TODO (v8): make this private/internal
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
