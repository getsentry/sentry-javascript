import type { DynamicSamplingContext } from '@sentry/core';
import { getActiveSpan, getCurrentScope, getDynamicSamplingContextFromSpan } from '@sentry/core';

/**
 * Reset the `replay_id` field on the DSC.
 */
export function resetReplayIdOnDynamicSamplingContext(): void {
  // Reset DSC on the current scope, if there is one
  const dsc = getCurrentScope().getPropagationContext().dsc;
  if (dsc) {
    delete dsc.replay_id;
  }

  // Clear it from frozen DSC on the active span
  const activeSpan = getActiveSpan();
  if (activeSpan) {
    const dsc = getDynamicSamplingContextFromSpan(activeSpan);
    delete (dsc as Partial<DynamicSamplingContext>).replay_id;
  }
}
