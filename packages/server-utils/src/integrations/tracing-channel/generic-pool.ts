import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';
import { genericPoolModuleNames } from '../../orchestrion/config/generic-pool';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// Same name as the OTel integration by design — when enabled, the OTel
// 'GenericPool' integration is omitted from the default set.
const INTEGRATION_NAME = 'GenericPool' as const;

interface GenericPoolAcquireContext {
  arguments: unknown[];
}

const _genericPoolIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, genericPoolModuleNames, instrumentGenericPool, []);
    },
  };
}) satisfies IntegrationFn;

/**
 * Orchestrion-driven generic-pool integration. Subscribes to
 * `orchestrion:generic-pool:acquire` (injected into `generic-pool/lib/Pool.js`'s
 * `Pool.prototype.acquire`). Creates a `generic-pool.acquire` span for each
 * acquisition. Requires the orchestrion runtime hook or bundler plugin.
 */
export const genericPoolIntegration = defineIntegration(_genericPoolIntegration);

function instrumentGenericPool(): void {
  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<GenericPoolAcquireContext>(CHANNELS.GENERIC_POOL_ACQUIRE),
    () =>
      startInactiveSpan({
        name: 'generic-pool.acquire',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.generic_pool',
        },
      }),
  );
}
