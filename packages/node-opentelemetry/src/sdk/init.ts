import { hasTracingEnabled } from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import { defaultIntegrations as defaultNodeIntegrations, init as initNode } from '@sentry/node';
import { setOpenTelemetryContextAsyncContextStrategy, setupGlobalHub } from '@sentry/opentelemetry';
import type { Integration } from '@sentry/types';
import { parseSemver } from '@sentry/utils';

import { getAutoPerformanceIntegrations } from '../integrations/getAutoPerformanceIntegrations';
import { Http } from '../integrations/http';
import { NodeFetch } from '../integrations/node-fetch';
import type { NodeExperimentalOptions } from '../types';
import { NodeExperimentalClient } from './client';
import { initOtel } from './initOtel';

const NODE_VERSION: ReturnType<typeof parseSemver> = parseSemver(process.versions.node);
const ignoredDefaultIntegrations = ['Http', 'Undici'];

export const defaultIntegrations: Integration[] = [
  ...defaultNodeIntegrations.filter(i => !ignoredDefaultIntegrations.includes(i.name)),
  new Http(),
];

// Only add NodeFetch if Node >= 16, as previous versions do not support it
if (NODE_VERSION.major && NODE_VERSION.major >= 16) {
  defaultIntegrations.push(new NodeFetch());
}

/**
 * Initialize Sentry for Node.
 */
export function init(options: NodeExperimentalOptions | undefined = {}): void {
  setupGlobalHub();

  const isTracingEnabled = hasTracingEnabled(options);

  options.defaultIntegrations =
    options.defaultIntegrations === false
      ? []
      : [
          ...(Array.isArray(options.defaultIntegrations) ? options.defaultIntegrations : defaultIntegrations),
          ...(isTracingEnabled ? getAutoPerformanceIntegrations() : []),
        ];

  options.instrumenter = 'otel';
  options.clientClass = NodeExperimentalClient as unknown as typeof NodeClient;

  initNode(options);

  // Always init Otel, even if tracing is disabled, because we need it for trace propagation & the HTTP integration
  initOtel();
  setOpenTelemetryContextAsyncContextStrategy();
}
