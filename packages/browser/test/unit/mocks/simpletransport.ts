import { resolvedSyncPromise } from '@sentry/utils';
import { createTransport } from '@sentry/core';

export function makeSimpleTransport() {
  return createTransport({}, () => resolvedSyncPromise({ statusCode: 200 }));
}
