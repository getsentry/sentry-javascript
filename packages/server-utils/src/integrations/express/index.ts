import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { expressModuleNames } from '../../orchestrion/config/express';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import type { ExpressIntegration, ExpressIntegrationOptions } from './types';
import { instrumentExpress } from './instrumentation';
import { INTEGRATION_NAME } from './utils';

const _expressIntegration = ((options: ExpressIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, expressModuleNames, instrumentExpress, [
        options,
        diagnosticsChannel.tracingChannel,
      ]);
    },
    // Read by the deprecated `expressErrorHandler`, which captures only when this integration
    // could not (no orchestrion transform), so both paths use the same callback.
    getShouldHandleError() {
      return options.shouldHandleError;
    },
  } satisfies ExpressIntegration;
}) satisfies IntegrationFn;

/**
 * Diagnostics-channel-based Express integration.
 *
 * Subscribes to the `orchestrion:express:handle` (Express v4) and
 * `orchestrion:router:handle` (Express v5, via the `router` package)
 * diagnostics_channels that Sentry's code transform injects into the
 * routing layer's request handler (`Layer.prototype.handle_request` /
 * `handleRequest`). One span is opened per layer invocation — producing the
 * same spans as the OTel Express instrumentation.
 *
 * Requires the Sentry runtime hook or bundler plugin to be active.
 */
export const expressIntegration = defineIntegration(_expressIntegration);
