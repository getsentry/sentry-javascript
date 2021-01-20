import { Mechanism } from './mechanism';
import { Stacktrace } from './stacktrace';

/**
 * The Exception Interface specifies an exception or error that occurred in a program.
 * @external https://develop.sentry.dev/sdk/event-payloads/exception/
 */
export interface Exception {
  /**
   * The type of exception, e.g. ValueError.
   */
  type: string;

  /**
   * The value of the exception.
   */
  value: string;

  /**
   * The module, or package which the exception type lives in.
   */
  module?: string;

  /**
   * An value which refers to a thread in the Threads Interface.
   */
  thread_id?: number;

  /**
   * An object describing the mechanism that created this exception.
   */
  mechanism?: Mechanism;

  /**
   * An stack trace object corresponding to the Stack Trace Interface.
   */
  stacktrace?: Stacktrace;
}
