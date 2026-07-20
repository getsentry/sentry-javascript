import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { invokeOrchestrionInstrumentation } from '../../../orchestrion/instrumentation';
import { hapiModuleNames } from '../../../orchestrion/config/hapi';
import { instrumentHapi } from './instrumentation';

const INTEGRATION_NAME = 'Hapi' as const;

const _hapiChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, hapiModuleNames, instrumentHapi, []);
    },
  };
}) satisfies IntegrationFn;

/**
 * EXPERIMENTAL — orchestrion-driven hapi integration. Subscribes to the
 * `orchestrion:@hapi/hapi:route` / `:ext` channels injected into `@hapi/hapi`'s
 * `lib/server.js`. Requires the orchestrion runtime hook or bundler plugin.
 */
export const hapiChannelIntegration = defineIntegration(_hapiChannelIntegration);
