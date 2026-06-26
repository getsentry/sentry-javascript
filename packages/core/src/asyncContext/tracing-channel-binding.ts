import { getMainCarrier } from '../carrier';
import type { Scope } from '../scope';
import { _setSpanForScope } from '../utils/spanOnScope';
import { getAsyncContextStrategy } from './index';
import type { TracingChannelBinding } from './types';

/**
 * Execute a callback whenever the tracing channel binding is available.
 * If it is not available after retry, the callback is not executed.
 */
export function waitForTracingChannelBinding(callback: () => void, retries = 1): void {
  const binding = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.();

  if (binding) {
    callback();
    return;
  }

  if (!retries) {
    return;
  }

  // It is possible that the binding is not available yet when this is initially called
  // This happens when users use a custom OTEL setup
  // In this case, we wait for a tick and try again afterwards
  // If it still fails, we bail and do nothing
  setTimeout(() => {
    waitForTracingChannelBinding(callback, retries - 1);
  }, 1);
}

/**
 * Build the default {@link TracingChannelBinding} shared by AsyncLocalStorage-based strategies.
 *
 * The ALS instance is supplied by the caller (kept as `unknown`).
 * The binding clones the current scope, plants the span on it, and reuses the existing isolation scope.
 *
 * The OpenTelemetry strategy does not use this: its store value is an OTel context, not a
 * `{ scope, isolationScope }` pair.
 */
export function _INTERNAL_createTracingChannelBinding(
  asyncLocalStorage: unknown,
  getScopes: () => { scope: Scope; isolationScope: Scope },
): TracingChannelBinding {
  return {
    asyncLocalStorage,
    getStoreWithActiveSpan: span => {
      const { scope, isolationScope } = getScopes();
      const activeScope = scope.clone();
      _setSpanForScope(activeScope, span);

      return { scope: activeScope, isolationScope };
    },
  };
}
