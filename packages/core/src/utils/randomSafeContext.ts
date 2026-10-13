import { GLOBAL_OBJ } from './worldwide';

export type RandomSafeContextRunner = <T>(callback: () => T) => T;

let RESOLVED_RUNNER: RandomSafeContextRunner | undefined;

/**
 * Simple wrapper that allows SDKs to *secretly* set context wrapper to generate safe random IDs in cache components contexts
 */
export function withRandomSafeContext<T>(cb: () => T): T {
  // Skips future symbol lookups once the runner is resolved. A missing runner is looked up again on every call, because
  // an SDK can register it after the first random value was generated, e.g. when a Worker loads Next.js inside a request.
  if (RESOLVED_RUNNER) {
    return RESOLVED_RUNNER(cb);
  }

  const sym = Symbol.for('__SENTRY_SAFE_RANDOM_ID_WRAPPER__');
  const globalWithSymbol: typeof GLOBAL_OBJ & { [sym]?: RandomSafeContextRunner } = GLOBAL_OBJ;
  const runner = globalWithSymbol[sym];

  if (typeof runner === 'function') {
    RESOLVED_RUNNER = runner;
    return runner(cb);
  }

  return cb();
}

/**
 * Identical to Math.random() but wrapped in withRandomSafeContext
 * to ensure safe random number generation in certain contexts (e.g., Next.js Cache Components).
 */
export function safeMathRandom(): number {
  return withRandomSafeContext(() => Math.random());
}

/**
 * Identical to Date.now() but wrapped in withRandomSafeContext
 * to ensure safe time value generation in certain contexts (e.g., Next.js Cache Components).
 */
export function safeDateNow(): number {
  return withRandomSafeContext(() => Date.now());
}
