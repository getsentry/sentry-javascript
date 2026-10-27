import { getAsyncContextStrategy, getMainCarrier } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils/no-diagnostic-channels';

/**
 * Installs the AsyncLocalStorage strategy unless an OpenTelemetry strategy is installed. Both use the same storage,
 * so a switch during a request breaks it (#24603).
 */
export function setAsyncLocalStorageAsyncContextStrategyForWorker(): void {
  if (!getAsyncContextStrategy(getMainCarrier()).withActiveSpan) {
    setAsyncLocalStorageAsyncContextStrategy();
  }
}
