import { createTransport, resolvedSyncPromise } from '@sentry/core/browser';

export function makeSimpleTransport() {
  return createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({}));
}
