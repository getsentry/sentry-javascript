import { StackFrame } from './stackframe';

/**
 * A stack trace contains a list of frames,
 * each with various bits (most optional) describing the context of that frame.
 * Frames should be sorted from oldest to newest.
 * @external https://develop.sentry.dev/sdk/event-payloads/stacktrace/
 */
export interface Stacktrace {
  /**
   * A non-empty list of stack frames.
   * The list is ordered from caller to callee, or oldest to youngest.
   * The last frame is the one creating the exception.
   */
  frames?: StackFrame[];

  /**
   * A map of register names and their values.
   * The values should contain the actual register values of the thread,
   * thus mapping to the last frame in the list.
   */
  registers?: Record<string, unknown>;

  frames_omitted?: [number, number];
}
