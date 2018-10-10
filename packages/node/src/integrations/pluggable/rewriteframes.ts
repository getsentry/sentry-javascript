import { Integrations } from '@sentry/core';
import { StackFrame } from '@sentry/types';
import { basename, relative } from 'path';

type StackFrameIteratee = (frame: StackFrame) => Promise<StackFrame>;

/** Rewrite event frames paths */
export class RewriteFrames extends Integrations.CoreRewriteFrames {
  /**
   * @inheritDoc
   */
  protected iteratee: StackFrameIteratee = async (frame: StackFrame) => {
    if (frame.filename && frame.filename.startsWith('/')) {
      const base = this.root ? relative(this.root, frame.filename) : basename(frame.filename);
      frame.filename = `app:///${base}`;
    }
    return frame;
  };
}
