import { Stacktrace } from './stacktrace';

/**
 * The Threads Interface specifies threads that were running at the time an event happened.
 * These threads can also contain stack traces.
 * @external https://develop.sentry.dev/sdk/event-payloads/threads/
 */
export interface Thread {
  /**
   * The ID of the thread.
   * Typically a number or numeric string.
   * Needs to be unique among the threads.
   * An exception can set the thread_id attribute to cross-reference this thread.
   */
  id?: number;

  /**
   * A flag indicating whether the thread crashed. Defaults to false.
   */
  crashed?: boolean;

  /**
   * A flag indicating whether the thread was in the foreground.
   */
  current?: boolean;

  /**
   * The thread name.
   */
  name?: string;

  /**
   * A stack trace object corresponding to the Stack Trace Interface.
   */
  stacktrace?: Stacktrace;
}
