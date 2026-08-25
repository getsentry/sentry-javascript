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

interface EventSink<T> {
  beforeSend: (event: T) => null;
  waitFor: (predicate: (event: T) => boolean) => Promise<T>;
}

function eventSink<T>(): EventSink<T> {
  const events: T[] = [];
  const waiters: { predicate: (e: T) => boolean; resolve: (e: T) => void }[] = [];
  return {
    beforeSend(event) {
      events.push(event);
      return null;
    },
    waitFor(predicate) {
      const already = events.find(predicate);
      if (already) return Promise.resolve(already);
      return new Promise<T>(resolve => {
        waiters.push({ predicate, resolve });
      });
    },
  };
}

/**
 * A `beforeSend` hook that records every transaction event and lets a test
 * `await` the first one matching a predicate. `waitFor` resolves immediately if
 * a match already arrived, so there is no ordering race with the hook.
 */
export function transactionSink(): {
  waitFor: (predicate: (event: TransactionEvent) => boolean) => Promise<TransactionEvent>;
  beforeSendTransaction: (event: TransactionEvent) => null;
} {
  const sink = eventSink<TransactionEvent>();

  return {
    waitFor: sink.waitFor,
    beforeSendTransaction: sink.beforeSend,
  };
}

/**
 * A `beforeSend` hook that records every error and lets a test
 * `await` the first one matching a predicate. `waitFor` resolves immediately if
 * a match already arrived, so there is no ordering race with the hook.
 */
export function errorSink(): EventSink<Event> {
  return eventSink<Event>();
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
