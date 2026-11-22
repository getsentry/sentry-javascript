import { isObjectLike } from '@sentry/core';
import * as Context from 'effect/Context';
import * as Exit from 'effect/Exit';

// Check if we're running Effect v4 by checking the Exit/Cause structure
// In v4, causes have a 'reasons' array
// In v3, causes have '_tag' directly on the cause object
export const isEffectV4 = (() => {
  try {
    const testExit = Exit.fail('test') as unknown as { cause?: unknown };
    const cause = testExit.cause;
    // v4 causes have 'reasons' array, v3 causes have '_tag' directly
    if (isObjectLike(cause) && 'reasons' in cause) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
})();

interface ContextExports {
  Reference: typeof Context.Reference;
  /** Only Effect v3 exports it. */
  GenericTag<Identifier, Service>(key: string): Context.Key<Identifier, Service>;
}

// Effect v4 has no `Context.GenericTag` and Effect v3 before 3.11 has no `Context.Reference`. Both are read
// through a separate binding because bundlers fail the build on a namespace member the installed version lacks.
// It is exported so our own build cannot fold a single use back into `Context.<member>`.
export const contextExports = Context as unknown as ContextExports;
