import { createTransport } from '@sentry/core';

export function makeSimpleTransport() {
  return createTransport({ recordDroppedEvent: () => undefined }, () => Promise.resolve({}));
}
