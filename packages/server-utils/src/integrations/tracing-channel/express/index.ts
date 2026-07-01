import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, waitForTracingChannelBinding } from '@sentry/core';
import type { ExpressIntegrationOptions } from './types';
import { instrumentExpress } from './instrumentation';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, the OTel 'Express' integration is omitted from the default set.
const INTEGRATION_NAME = 'Express' as const;

const _expressChannelIntegration = ((options: ExpressIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      waitForTracingChannelBinding(() => {
        instrumentExpress(options, diagnosticsChannel.tracingChannel);
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * EXPERIMENTAL — orchestrion-driven Express integration.
 *
 * Subscribes to the `orchestrion:express:handle` (Express v4) and
 * `orchestrion:router:handle` (Express v5, via the `router` package)
 * diagnostics_channels that the orchestrion code transform injects into the
 * routing layer's request handler (`Layer.prototype.handle_request` /
 * `handleRequest`). One span is opened per layer invocation — producing the
 * same spans as the OTel Express instrumentation.
 *
 * Requires the orchestrion runtime hook or bundler plugin to be active — wire
 * that up via `experimentalUseDiagnosticsChannelInjection()`.
 */
export const expressChannelIntegration = defineIntegration(_expressChannelIntegration);
