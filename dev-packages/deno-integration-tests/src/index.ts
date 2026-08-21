import type { Event, TransactionEvent } from '@sentry/core';
import { getAsyncContextStrategy, getMainCarrier, setAsyncContextStrategy } from '@sentry/core';

/**
 * Wipe the Sentry carrier so the current, isolation, and global scopes (and the
 * client) are recreated fresh, letting each test start from a clean slate.
 *
 * The async-context strategy is preserved across the wipe: channel integrations
 * subscribe once per process and capture the strategy's `AsyncLocalStorage` at
 * that point. Dropping it here would strand that ALS, so scope propagation into
 * channel callbacks would silently break for every test after the first.
 */
export function resetGlobals(): void {
  const acs = getAsyncContextStrategy(getMainCarrier());
  getMainCarrier().__SENTRY__ = undefined;
  setAsyncContextStrategy(acs);
}

export interface TransactionSink {
  beforeSendTransaction: (event: TransactionEvent) => null;
  waitFor: (predicate: (event: TransactionEvent) => boolean) => Promise<TransactionEvent>;
}

/**
 * A `beforeSendTransaction` hook that records every transaction and lets a test
 * `await` the first one matching a predicate. `waitFor` resolves immediately if
 * a match already arrived, so there is no ordering race with the hook.
 */
export function transactionSink(): TransactionSink {
  const transactions: TransactionEvent[] = [];
  const waiters: { predicate: (e: TransactionEvent) => boolean; resolve: (e: TransactionEvent) => void }[] = [];
  return {
    beforeSendTransaction(event) {
      transactions.push(event);
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i]!;
        if (w.predicate(event)) {
          waiters.splice(i, 1);
          w.resolve(event);
        }
      }
      return null;
    },
    waitFor(predicate) {
      const already = transactions.find(predicate);
      if (already) return Promise.resolve(already);
      return new Promise<TransactionEvent>(resolve => {
        waiters.push({ predicate, resolve });
      });
    },
  };
}

export interface ErrorSink {
  beforeSend: (event: Event) => null;
  waitFor: (predicate: (event: Event) => boolean) => Promise<Event>;
}

/**
 * A `beforeSend` hook that records every error event and lets a test `await` the
 * first one matching a predicate. Mirrors {@link transactionSink} for error events.
 */
export function errorSink(): ErrorSink {
  const events: Event[] = [];
  const waiters: { predicate: (e: Event) => boolean; resolve: (e: Event) => void }[] = [];
  return {
    beforeSend(event) {
      events.push(event);
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i]!;
        if (w.predicate(event)) {
          waiters.splice(i, 1);
          w.resolve(event);
        }
      }
      return null;
    },
    waitFor(predicate) {
      const already = events.find(predicate);
      if (already) return Promise.resolve(already);
      return new Promise<Event>(resolve => {
        waiters.push({ predicate, resolve });
      });
    },
  };
}

/** Reject with a descriptive message if `p` does not settle within `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${what} after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
