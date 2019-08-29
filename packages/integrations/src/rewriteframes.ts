import { Event, EventProcessor, Hub, Integration, StackFrame } from '@sentry/types';
import { basename, relative } from '@sentry/utils';

import { getFramesFromEvent } from './helpers';

type StackFrameIteratee = (frame: StackFrame) => StackFrame;

/** Rewrite event frames paths */
export class RewriteFrames implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = RewriteFrames.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'RewriteFrames';

  /**
   * @inheritDoc
   */
  private readonly _root?: string;

  /**
   * @inheritDoc
   */
  private readonly _iteratee: StackFrameIteratee = (frame: StackFrame) => {
    if (frame.filename && frame.filename.startsWith('/')) {
      const base = this._root ? relative(this._root, frame.filename) : basename(frame.filename);
      frame.filename = `app:///${base}`;
    }
    return frame;
  };

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
    const frames = getFramesFromEvent(event) || [];
    for (const i in frames) {
      // tslint:disable-next-line
      frames[i] = this._iteratee(frames[i]);
    }
    return event;
  }
}
