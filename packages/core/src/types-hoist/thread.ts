import type { Stacktrace } from './stacktrace';

/** JSDoc */
export interface Thread {
  id?: number | string;
  name?: string;
  main?: boolean;
  stacktrace?: Stacktrace;
  crashed?: boolean;
  current?: boolean;
}
