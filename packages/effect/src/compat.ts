import { isObjectLike } from '@sentry/core';
import * as Context from 'effect/Context';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Logger from 'effect/Logger';
import type * as Tracer from 'effect/Tracer';

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
  /** Effect v3 before 3.11 does not export it. */
  Reference: typeof Context.Reference;
  /** Only Effect v3 exports it. */
  GenericTag<Identifier, Service>(key: string): Context.Key<Identifier, Service>;
}

interface LayerExports {
  /** Only Effect v3 exports it. */
  setTracer(tracer: Tracer.Tracer): Layer.Layer<never>;
}

interface LoggerExports {
  /** Only Effect v4 exports it. */
  layer: typeof Logger.layer;
  /** Only Effect v3 exports it. */
  add(logger: Logger.Logger<unknown, unknown>): Layer.Layer<never>;
}

// Members that only one Effect version exports are read through these bindings, because bundlers fail the
// build on a namespace member the installed version lacks. They are exported so our own build cannot fold a
// single use back into `<Namespace>.<member>`.
export const contextExports = Context as unknown as ContextExports;
export const layerExports = Layer as unknown as LayerExports;
export const loggerExports = Logger as unknown as LoggerExports;
