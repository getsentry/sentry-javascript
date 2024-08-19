import { getMainCarrier } from '@sentry/core';

export function clearGlobalScope() {
  const carrier = getMainCarrier();
  // @ts-expect-error - just messing around
  carrier.globalScope = undefined;
}
