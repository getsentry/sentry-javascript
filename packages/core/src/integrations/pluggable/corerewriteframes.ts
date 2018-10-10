import { getCurrentHub, Scope } from '@sentry/hub';
import { Integration, SentryEvent, StackFrame } from '@sentry/types';

type StackFrameIteratee = (frame: StackFrame) => Promise<StackFrame>;

/** Rewrite event frames paths */
export abstract class CoreRewriteFrames implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'RewriteFrames';

  /**
   * @inheritDoc
   */
  protected root?: string;

  /**
   * @inheritDoc
   */
  protected abstract iteratee: StackFrameIteratee;

  /**
   * @inheritDoc
   */
  public constructor(protected readonly options: { root?: string; iteratee?: StackFrameIteratee } = {}) {}

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
    if (this.options.root) {
      this.root = this.options.root;
    }
    if (this.options.iteratee) {
      this.iteratee = this.options.iteratee;
    }
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
        // tslint:disable-next-line:no-unsafe-any
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
