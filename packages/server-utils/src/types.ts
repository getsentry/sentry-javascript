import type { AsyncLocalStorage } from 'node:async_hooks';

/**
 * A handle onto the `AsyncLocalStorage` that backs Sentry's async context, plus the info needed to
 * recover the current `{ scope, isolationScope }` out of its store.
 *
 * Produced by whichever async context strategy is installed: `setOpenTelemetryContextAsyncContextStrategy`
 * (where the store is an OTel `Context` and the scopes live under `contextSymbol`) or the pure
 * AsyncLocalStorage strategy (where the store already is the scopes object, so `contextSymbol` is omitted).
 *
 * It is stashed on the client (`NodeClient.asyncLocalStorageLookup`) so consumers that need to read scope
 * from outside the normal async flow can get at it — notably `@sentry/node-native`, whose worker/native
 * thread reads the blocked thread's store directly to attach the active scope to event-loop-block events.
 */
export type AsyncLocalStorageLookup = {
  asyncLocalStorage: AsyncLocalStorage<unknown>;
  /**
   * The OpenTelemetry context key under which the `{ scope, isolationScope }` object is stored, for
   * native threads that read scope out of the AsyncLocalStorage (e.g. `@sentry/node-native`). Omitted
   * for the pure AsyncLocalStorage strategy, whose store already is that object.
   */
  contextSymbol?: symbol;
};
