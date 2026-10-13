import { getMainCarrier } from '../carrier';
import { safeUnref } from '../utils/timer';
import { getAsyncContextStrategy } from './index';

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
  // `safeUnref` so this retry timer never keeps the process alive on its own (Node server runtimes).
  safeUnref(
    setTimeout(() => {
      waitForTracingChannelBinding(callback, retries - 1);
    }, 1),
  );
}
