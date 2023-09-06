import { hasTracingEnabled } from '@sentry/core';
import { defaultIntegrations as defaultNodeIntegrations, init as initNode } from '@sentry/node';

import { getAutoPerformanceIntegrations } from '../integrations/getAutoPerformanceIntegrations';
import { Http } from '../integrations/http';
import type { NodeExperimentalOptions } from '../types';
import { NodeExperimentalClient } from './client';
import { initOtel } from './initOtel';
import { setOtelContextAsyncContextStrategy } from './otelAsyncContextStrategy';

const ignoredDefaultIntegrations = ['Http', 'Undici'];

export const defaultIntegrations = [
  ...defaultNodeIntegrations.filter(i => !ignoredDefaultIntegrations.includes(i.name)),
  new Http(),
];

/**
 * Initialize Sentry for Node.
 */
export function init(options: NodeExperimentalOptions | undefined = {}): void {
  const isTracingEnabled = hasTracingEnabled(options);

  options.defaultIntegrations =
    options.defaultIntegrations === false
      ? []
      : [
          ...(Array.isArray(options.defaultIntegrations) ? options.defaultIntegrations : defaultIntegrations),
          ...(isTracingEnabled ? getAutoPerformanceIntegrations() : []),
        ];

  options.instrumenter = 'otel';
  options.clientClass = NodeExperimentalClient;

  initNode(options);

  // Always init Otel, even if tracing is disabled, because we need it for trace propagation & the HTTP integration
  initOtel();
  setOtelContextAsyncContextStrategy();
}
