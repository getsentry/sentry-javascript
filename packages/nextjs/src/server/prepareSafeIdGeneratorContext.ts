import { type _INTERNAL_RandomSafeContextRunner as RandomSafeContextRunner, debug, GLOBAL_OBJ } from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';

// Inline AsyncLocalStorage interface from current types
// Avoids conflict with resolving it from getBuiltinModule
type OriginalAsyncLocalStorage = typeof AsyncLocalStorage;

/**
 * Prepares the global object to generate safe random IDs in cache components contexts
 * See: https://github.com/getsentry/sentry-javascript/blob/ceb003c15973c2d8f437dfb7025eedffbc8bc8b0/packages/core/src/utils/propagationContext.ts#L1
 */
export function prepareSafeIdGeneratorContext(): void {
  const sym = Symbol.for('__SENTRY_SAFE_RANDOM_ID_WRAPPER__');
  const globalWithSymbol: typeof GLOBAL_OBJ & { [sym]?: RandomSafeContextRunner } = GLOBAL_OBJ;
  const als = getAsyncLocalStorage();
  if (!als) {
    DEBUG_BUILD &&
      debug.warn(
        '[@sentry/nextjs] No AsyncLocalStorage found in the runtime, skipping safe random ID generator context preparation, you may see some errors with Cache components.',
      );
    return;
  }

  globalWithSymbol[sym] = als.snapshot();
  DEBUG_BUILD && debug.log('[@sentry/nextjs] Prepared safe random ID generator context');
}

function getAsyncLocalStorage(): OriginalAsyncLocalStorage | undefined {
  // May exist in the Next.js runtime globals
  // Doesn't exist in some of our tests
  if (typeof AsyncLocalStorage !== 'undefined') {
    return AsyncLocalStorage;
  }

  // Try to resolve it dynamically without synchronously importing the module
  // This is done to avoid importing the module synchronously at the top
  // which means this is safe across runtimes
  if ('getBuiltinModule' in process && typeof process.getBuiltinModule === 'function') {
    const { AsyncLocalStorage } = process.getBuiltinModule('async_hooks') ?? {};

    return AsyncLocalStorage as OriginalAsyncLocalStorage;
  }

  return undefined;
}
