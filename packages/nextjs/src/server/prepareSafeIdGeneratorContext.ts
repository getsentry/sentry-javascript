import { type _INTERNAL_RandomSafeContextRunner as RandomSafeContextRunner, debug, GLOBAL_OBJ } from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';

// Inline AsyncLocalStorage interface from current types
// Avoids conflict with resolving it from getBuiltinModule
type OriginalAsyncLocalStorage = typeof AsyncLocalStorage;

interface WorkUnitAsyncStorage {
  exit<T>(callback: () => T): T;
}

// Next.js >= 16.4 anchors its async storages to `globalThis` under `Symbol.for('@next/<name>@<version>')`
// (`next/src/server/app-render/async-local-storage.ts`).
const NEXT_WORK_UNIT_ASYNC_STORAGE_KEY_PREFIX = '@next/work-unit-async-storage@';

/**
 * Prepares the global object to generate safe random IDs in cache components contexts
 * See: https://github.com/getsentry/sentry-javascript/blob/ceb003c15973c2d8f437dfb7025eedffbc8bc8b0/packages/core/src/utils/propagationContext.ts#L1
 */
export function prepareSafeIdGeneratorContext(): void {
  const sym = Symbol.for('__SENTRY_SAFE_RANDOM_ID_WRAPPER__');
  const globalWithSymbol: typeof GLOBAL_OBJ & { [sym]?: RandomSafeContextRunner } = GLOBAL_OBJ;

  let workUnitAsyncStorage = getNextWorkUnitAsyncStorage();

  // Without a snapshot or the Next.js storage there is nothing to run the callback in, so don't set up the wrapper
  const initialSnapshot = getAsyncLocalStorageSnapshot();
  if (!initialSnapshot && !workUnitAsyncStorage) {
    return;
  }

  // We store a wrapper function instead of the raw snapshot because in serverless
  // environments (e.g., Cloudflare Workers), the snapshot is bound to the request
  // context it was created in. Once that request ends, the snapshot becomes invalid.
  // The wrapper catches this and creates a fresh snapshot for the current request context.
  let cachedSnapshot = initialSnapshot;

  globalWithSymbol[sym] = <T>(callback: () => T): T => {
    // Next.js only flags sync IO while its work unit store is active, so exiting that store is enough and works in
    // any request. A snapshot is only safe when taken outside of a render and, on Cloudflare Workers, only in the
    // request that took it (`bind_asynclocalstorage_snapshot_to_request`).
    if (workUnitAsyncStorage) {
      return workUnitAsyncStorage.exit(callback);
    }
    if (!cachedSnapshot) {
      return callback();
    }

    try {
      return cachedSnapshot(callback);
    } catch (error) {
      // Only handle AsyncLocalStorage-related errors, rethrow others
      if (!isAsyncLocalStorageError(error)) {
        throw error;
      }

      workUnitAsyncStorage = getNextWorkUnitAsyncStorage();
      if (workUnitAsyncStorage) {
        return workUnitAsyncStorage.exit(callback);
      }

      // Snapshot likely stale, try to get a fresh one and retry
      const freshSnapshot = getAsyncLocalStorageSnapshot();
      // No snapshot available, fall back to direct execution
      if (!freshSnapshot) {
        return callback();
      }

      // Update the cached snapshot
      cachedSnapshot = freshSnapshot;

      // Retry the callback with the fresh snapshot
      try {
        return cachedSnapshot(callback);
      } catch (retryError) {
        // Only fall back for AsyncLocalStorage errors, rethrow others
        if (!isAsyncLocalStorageError(retryError)) {
          throw retryError;
        }
        // If fresh snapshot also fails with ALS error, fall back to direct execution
        return callback();
      }
    }
  };

  DEBUG_BUILD && debug.log('[@sentry/nextjs] Prepared safe random ID generator context');
}

function getNextWorkUnitAsyncStorage(): WorkUnitAsyncStorage | undefined {
  const globalWithStorages = GLOBAL_OBJ as typeof GLOBAL_OBJ & Record<symbol, unknown>;

  for (const key of Object.getOwnPropertySymbols(globalWithStorages)) {
    if (!key.description?.startsWith(NEXT_WORK_UNIT_ASYNC_STORAGE_KEY_PREFIX)) {
      continue;
    }
    const storage = globalWithStorages[key] as WorkUnitAsyncStorage | undefined;
    if (typeof storage?.exit !== 'function') {
      continue;
    }
    try {
      // Where no AsyncLocalStorage exists, Next.js registers a `FakeAsyncLocalStorage` whose `exit` always throws
      storage.exit(() => undefined);
      return storage;
    } catch {
      // not usable
    }
  }

  return undefined;
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

    return AsyncLocalStorage;
  }

  return undefined;
}

function getAsyncLocalStorageSnapshot(): RandomSafeContextRunner | undefined {
  const als = getAsyncLocalStorage();

  if (!als || typeof als.snapshot !== 'function') {
    DEBUG_BUILD &&
      debug.warn(
        '[@sentry/nextjs] No AsyncLocalStorage found in the runtime or AsyncLocalStorage.snapshot() is not available, skipping safe random ID generator context preparation, you may see some errors with cache components.',
      );
    return undefined;
  }

  return als.snapshot();
}

function isAsyncLocalStorageError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('AsyncLocalStorage');
}
