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

/**
 * Set the `replay_id` field on the cached DSC.
 * This is needed after a session refresh because the cached DSC on the scope
 * (set by browserTracingIntegration when the idle span ended) persists across
 * session boundaries. Without updating it, the new session's replay_id would
 * never appear in DSC since `getDynamicSamplingContextFromClient` (and its
 * `createDsc` hook) is not called when a cached DSC already exists.
 */
export function setReplayIdOnDynamicSamplingContext(replayId: string): void {
  const dsc = getCurrentScope().getPropagationContext().dsc;
  if (dsc) {
    dsc.replay_id = replayId;
  }

  const activeSpan = getActiveSpan();
  if (activeSpan) {
    const dsc = getDynamicSamplingContextFromSpan(activeSpan);
    (dsc as Partial<DynamicSamplingContext>).replay_id = replayId;
  }
}
