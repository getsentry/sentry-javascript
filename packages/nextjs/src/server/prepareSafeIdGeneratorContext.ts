import { debug, GLOBAL_OBJ } from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';

type SafeRandomContextRunner = <T>(callback: () => T) => T;

/**
 * Prepares the global object to generate safe random IDs in cache components contexts
 * See: https://github.com/getsentry/sentry-javascript/blob/ceb003c15973c2d8f437dfb7025eedffbc8bc8b0/packages/core/src/utils/propagationContext.ts#L1
 */
export function prepareSafeIdGeneratorContext(): void {
  const sym = Symbol.for('__SENTRY_SAFE_RANDOM_ID_WRAPPER__');
  const globalWithSymbol: typeof GLOBAL_OBJ & { [sym]?: SafeRandomContextRunner } = GLOBAL_OBJ;
  globalWithSymbol[sym] = AsyncLocalStorage.snapshot();

  DEBUG_BUILD && debug.log('[@sentry/nextjs] Prepared safe random ID generator context');
}
