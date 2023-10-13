import { hasTracingEnabled } from '@sentry/core';
import { defaultIntegrations as defaultNodeIntegrations, init as initNode } from '@sentry/node';
import type { Integration } from '@sentry/types';
import { parseSemver } from '@sentry/utils';

import { getAutoPerformanceIntegrations } from '../integrations/getAutoPerformanceIntegrations';
import { Http } from '../integrations/http';
import { NodeFetch } from '../integrations/node-fetch';
import type { NodeExperimentalOptions } from '../types';
import { NodeExperimentalClient } from './client';
import { getCurrentHub } from './hub';
import { initOtel } from './initOtel';
import { setOtelContextAsyncContextStrategy } from './otelAsyncContextStrategy';

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
  // Ensure we register our own global hub before something else does
  // This will register the NodeExperimentalHub as the global hub
  getCurrentHub();

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
