import { Integrations } from '@sentry/core';
import { StackFrame } from '@sentry/types';

type StackFrameIteratee = (frame: StackFrame) => Promise<StackFrame>;

/** Rewrite event frames paths */
export class RewriteFrames extends Integrations.CoreRewriteFrames {
  /**
   * @inheritDoc
   */
  protected iteratee: StackFrameIteratee = async (frame: StackFrame) => frame;
}
