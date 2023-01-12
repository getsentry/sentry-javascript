import type { Event, EventProcessor, Hub, Integration, StackFrame } from '@sentry/types';

/** Add node transaction to the event */
export class Transaction implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Transaction';

  /**
   * @inheritDoc
   */
  public name: string = Transaction.id;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor(event => {
      const self = getCurrentHub().getIntegration(Transaction);
      if (self) {
        return self.process(event);
      }
      return event;
    });
  }

  /**
   * @inheritDoc
   */
  public process(event: Event): Event {
    const frames = this._getFramesFromEvent(event);

    // use for loop so we don't have to reverse whole frames array
    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i];

      if (frame.in_app === true) {
        event.transaction = this._getTransaction(frame);
        break;
      }
    }

    return event;
  }

  /** JSDoc */
  private _getFramesFromEvent(event: Event): StackFrame[] {
    const exception = event.exception && event.exception.values && event.exception.values[0];
    return (exception && exception.stacktrace && exception.stacktrace.frames) || [];
  }

  /** JSDoc */
  private _getTransaction(frame: StackFrame): string {
    return frame.module || frame.function ? `${frame.module || '?'}/${frame.function || '?'}` : '<unknown>';
  }
}
