import { Scope } from '@sentry/hub';
import { Integration, SentryEvent, StackFrame } from '@sentry/types';
import { NodeOptions } from '../../backend';
import { getCurrentHub } from '../../hub';

/** Add node transaction to the event */
export class Transaction implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'Transaction';

  /**
   * @inheritDoc
   */
  public install(_: NodeOptions = {}): void {
    getCurrentHub().configureScope((scope: Scope) => {
      scope.addEventProcessor(async event => this.process(event));
    });
  }

  /**
   * @inheritDoc
   */
  public async process(event: SentryEvent): Promise<SentryEvent> {
    const frames = this.getFramesFromEvent(event);

    // use for loop so we don't have to reverse whole frames array
    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i];

      if (frame.in_app === true) {
        event.transaction = this.getTransaction(frame);
        break;
      }
    }

    return event;
  }

  /** JSDoc */
  private getFramesFromEvent(event: SentryEvent): StackFrame[] {
    const exception = event.exception && event.exception.values && event.exception.values[0];
    return (exception && exception.stacktrace && exception.stacktrace.frames) || [];
  }

  /** JSDoc */
  private getTransaction(frame: StackFrame): string {
    return frame.module || frame.function ? `${frame.module || '?'}/${frame.function || '?'}` : '<unknown>';
  }
}
