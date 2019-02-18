import { Stacktrace } from './stacktrace';

/** JSDoc */
export interface Exception {
  type?: string;
  value?: string;
  module?: string;
  thread_id?: number;
  stacktrace?: Stacktrace;
}
