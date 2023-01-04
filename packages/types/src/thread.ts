import type { Stacktrace } from './stacktrace';

/** JSDoc */
export interface Thread {
  id?: number;
  name?: string;
  stacktrace?: Stacktrace;
  crashed?: boolean;
  current?: boolean;
}
