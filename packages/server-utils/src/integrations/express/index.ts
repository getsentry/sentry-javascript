import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { expressModuleNames } from '../../orchestrion/config/express';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import type { ExpressIntegrationOptions } from './types';
import { instrumentExpress } from './instrumentation';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, the OTel 'Express' integration is omitted from the default set.
const INTEGRATION_NAME = 'Express' as const;

const _expressIntegration = ((options: ExpressIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, expressModuleNames, instrumentExpress, [
        options,
        diagnosticsChannel.tracingChannel,
      ]);
    },
  };
}) satisfies IntegrationFn;

/**
 * Orchestrion-driven Express integration.
 *
 * Subscribes to the `orchestrion:express:handle` (Express v4) and
 * `orchestrion:router:handle` (Express v5, via the `router` package)
 * diagnostics_channels that the orchestrion code transform injects into the
 * routing layer's request handler (`Layer.prototype.handle_request` /
 * `handleRequest`). One span is opened per layer invocation — producing the
 * same spans as the OTel Express instrumentation.
 *
 * Requires the orchestrion runtime hook or bundler plugin to be active.
 */
export const expressIntegration = defineIntegration(_expressIntegration);
