import { GLOBAL_OBJ } from './worldwide';

export type RandomSafeContextRunner = <T>(callback: () => T) => T;

// undefined = not yet resolved, null = no runner found, function = runner found
let RESOLVED_RUNNER: RandomSafeContextRunner | null | undefined;

/**
 * Simple wrapper that allows SDKs to *secretly* set context wrapper to generate safe random IDs in cache components contexts
 */
export function withRandomSafeContext<T>(cb: () => T): T {
  // Skips future symbol lookups if we've already resolved (or attempted to resolve) the runner once
  if (RESOLVED_RUNNER !== undefined) {
    return RESOLVED_RUNNER ? RESOLVED_RUNNER(cb) : cb();
  }

  const sym = Symbol.for('__SENTRY_SAFE_RANDOM_ID_WRAPPER__');
  const globalWithSymbol: typeof GLOBAL_OBJ & { [sym]?: RandomSafeContextRunner } = GLOBAL_OBJ;

  if (sym in globalWithSymbol && typeof globalWithSymbol[sym] === 'function') {
    RESOLVED_RUNNER = globalWithSymbol[sym];
    return RESOLVED_RUNNER(cb);
  }

  RESOLVED_RUNNER = null;
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
