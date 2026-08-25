import type { Integration } from '@sentry/core';
import { getTracingIntegrations } from '@sentry/server-utils';

/**
 * @deprecated Use getTracingIntegrations instead.
 */
export function getAutoPerformanceIntegrations(): Integration[] {
  return getTracingIntegrations();
}
