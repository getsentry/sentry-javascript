import { createTransport } from '@sentry/core';
import { resolvedSyncPromise } from '@sentry/core';

export function makeSimpleTransport() {
  return createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({}));
}
