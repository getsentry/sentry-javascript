import { Event, EventProcessor, Hub, Integration, StackFrame, Stacktrace } from '@sentry/types';
import { basename, relative } from '@sentry/utils';

type StackFrameIteratee = (frame: StackFrame) => StackFrame;

/** Rewrite event frames paths */
export class RewriteFrames implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'RewriteFrames';

  /**
   * @inheritDoc
   */
  public name: string = RewriteFrames.id;

  /**
   * @inheritDoc
   */
  private readonly _root?: string;

  /**
   * @inheritDoc
   */
  public constructor(options: { root?: string; iteratee?: StackFrameIteratee } = {}) {
    if (options.root) {
      this._root = options.root;
    }
    if (options.iteratee) {
      this._iteratee = options.iteratee;
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor(event => {
      const self = getCurrentHub().getIntegration(RewriteFrames);
      if (self) {
        return self.process(event);
      }
      return event;
    });
  }

  /** JSDoc */
  public process(event: Event): Event {
    if (event.exception && Array.isArray(event.exception.values)) {
      return this._processExceptionsEvent(event);
    }

    if (event.stacktrace) {
      return this._processStacktraceEvent(event);
    }

    return event;
  }

  /**
   * @inheritDoc
   */
  private readonly _iteratee: StackFrameIteratee = (frame: StackFrame) => {
    if (!frame.filename) {
      return frame;
    }
    // Check if the frame filename begins with `/` or a Windows-style prefix such as `C:\`
    const isWindowsFrame = /^[A-Z]:\\/.test(frame.filename);
    const startsWithSlash = /^\//.test(frame.filename);
    if (isWindowsFrame || startsWithSlash) {
      const filename = isWindowsFrame
        ? frame.filename
            .replace(/^[A-Z]:/, '') // remove Windows-style prefix
            .replace(/\\/g, '/') // replace all `\\` instances with `/`
        : frame.filename;
      const base = this._root ? relative(this._root, filename) : basename(filename);
      frame.filename = `app:///${base}`;
    }
    return frame;
  };

  /** JSDoc */
  private _processExceptionsEvent(event: Event): Event {
    try {
      return {
        ...event,
        exception: {
          ...event.exception,
          // The check for this is performed inside `process` call itself, safe to skip here
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          values: event.exception!.values!.map(value => ({
            ...value,
            stacktrace: this._processStacktrace(value.stacktrace),
          })),
        },
      };
    } catch (_oO) {
      return event;
    }
  }

  /** JSDoc */
  private _processStacktraceEvent(event: Event): Event {
    try {
      return {
        ...event,
        stacktrace: this._processStacktrace(event.stacktrace),
      };
    } catch (_oO) {
      return event;
    }
  }

  /** JSDoc */
  private _processStacktrace(stacktrace?: Stacktrace): Stacktrace {
    return {
      ...stacktrace,
      frames: stacktrace && stacktrace.frames && stacktrace.frames.map(f => this._iteratee(f)),
    };
  }
}
