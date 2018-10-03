import { Scope } from '@sentry/hub';
import { Integration, SentryEvent, StackFrame } from '@sentry/types';
import { basename } from 'path';
import { getCurrentHub } from '../../hub';

type StackFrameIteratee = (frame: StackFrame) => Promise<StackFrame>;

/** Rewrite event frames paths */
export class RewriteFrames implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'RewriteFrames';

  /**
   * @inheritDoc
   */
  public iteratee: StackFrameIteratee = async (frame: StackFrame) => {
    if (frame.filename && frame.filename.startsWith('/')) {
      frame.filename = `app:///${basename(frame.filename)}`;
    }
    return frame;
  };

  /**
   * @inheritDoc
   */
  public constructor(options: { iteratee?: StackFrameIteratee } = {}) {
    if (options.iteratee) {
      this.iteratee = options.iteratee;
    }
  }

  /**
   * @inheritDoc
   */
  public install(): void {
    getCurrentHub().configureScope((scope: Scope) => {
      scope.addEventProcessor(async event => this.process(event));
    });
  }

  /** JSDoc */
  public async process(event: SentryEvent): Promise<SentryEvent> {
    const frames = this.getFramesFromEvent(event);
    if (frames) {
      for (const i in frames) {
        // tslint:disable-next-line
        frames[i] = await this.iteratee(frames[i]);
      }
    }
    return event;
  }

  /** JSDoc */
  private getFramesFromEvent(event: SentryEvent): StackFrame[] | undefined {
    const exception = event.exception;

    if (exception) {
      try {
        return (exception as any).values[0].stacktrace.frames;
      } catch (_oO) {
        return undefined;
      }
    } else if (event.stacktrace) {
      return event.stacktrace.frames;
    } else {
      return undefined;
    }
  }
}
