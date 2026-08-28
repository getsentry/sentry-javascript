import type { Integration } from '@sentry/core';
import { getTracingIntegrations } from '@sentry/server-utils';

export function getAutoPerformanceIntegrations(): Integration[] {
  return getTracingIntegrations();
}
