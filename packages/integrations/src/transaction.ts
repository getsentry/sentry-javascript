import type { Event, Integration, StackFrame } from '@sentry/types';

/** Add node transaction to the event */
export class Transaction implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Transaction';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    this.name = Transaction.id;
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
   * TODO (v8): Make this private/internal
   */
  public process(event: Event): Event {
    const frames = _getFramesFromEvent(event);

    // use for loop so we don't have to reverse whole frames array
    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i];

      if (frame.in_app === true) {
        event.transaction = _getTransaction(frame);
        break;
      }
    }

    return event;
  }
}

function _getFramesFromEvent(event: Event): StackFrame[] {
  const exception = event.exception && event.exception.values && event.exception.values[0];
  return (exception && exception.stacktrace && exception.stacktrace.frames) || [];
}

function _getTransaction(frame: StackFrame): string {
  return frame.module || frame.function ? `${frame.module || '?'}/${frame.function || '?'}` : '<unknown>';
}
