import { createTransport, resolvedSyncPromise } from '@sentry/core';

export function makeSimpleTransport() {
  return createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({}));
}
