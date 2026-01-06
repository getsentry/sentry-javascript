import { GLOBAL_OBJ } from './worldwide';

export type RandomSafeContextRunner = <T>(callback: () => T) => T;

let RESOLVED_RUNNER: RandomSafeContextRunner | undefined;

/**
 * Simple wrapper that allows SDKs to *secretly* set context wrapper to generate safe random IDs in cache components contexts
 */
export function runInRandomSafeContext<T>(cb: () => T): T {
  // Skips future symbol lookups if we've already resolved the runner once
  if (RESOLVED_RUNNER) {
    return RESOLVED_RUNNER(cb);
  }

  const sym = Symbol.for('__SENTRY_SAFE_RANDOM_ID_WRAPPER__');
  const globalWithSymbol: typeof GLOBAL_OBJ & { [sym]?: RandomSafeContextRunner } = GLOBAL_OBJ;
  if (!(sym in globalWithSymbol) || typeof globalWithSymbol[sym] !== 'function') {
    return cb();
  }

  RESOLVED_RUNNER = globalWithSymbol[sym];

  return globalWithSymbol[sym](cb);
}

/**
 * Returns the current date and time wrapped in a safe context runner.
 * @returns number The current date and time.
 */
export function safeDateNow(): number {
  return runInRandomSafeContext(() => Date.now());
}

/**
 * Returns a random number between 0 and 1 wrapped in a safe context runner.
 * @returns number A random number between 0 and 1.
 */
export function safeMathRandom(): number {
  return runInRandomSafeContext(() => Math.random());
}
