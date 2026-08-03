import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';
import { hapiModuleNames } from '../../orchestrion/config/hapi';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { wrapExtArguments, wrapRouteArguments } from './hapi-utils';

// NOTE: same name as the OTel integration by design — when enabled, the OTel
// 'Hapi' integration is omitted from the default set.
const INTEGRATION_NAME = 'Hapi' as const;

/**
 * The shape orchestrion's transform attaches to the `@hapi/hapi` route/ext
 * tracing-channel `context` objects.
 *
 * `arguments` is the *live* args array passed to `server.route` / `server.ext`;
 * we mutate it in place to swap handlers for span-creating proxies. `self` is
 * the hapi server instance: the root server has `self.realm.plugin === undefined`,
 * while a plugin's clone server exposes the registering plugin's name there.
 */
interface HapiChannelContext {
  arguments: unknown[];
  self?: { realm?: { plugin?: string } };
}

const _hapiIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, hapiModuleNames, instrumentHapi, [], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

function instrumentHapi(): void {
  // `subscribe` requires all five lifecycle hooks. We only act on `start`,
  // which orchestrion fires synchronously with the live args array — that's
  // the moment we mutate the handlers in place.
  diagnosticsChannel.tracingChannel(CHANNELS.HAPI_ROUTE).subscribe({
    start(rawCtx) {
      const ctx = rawCtx as HapiChannelContext;
      wrapRouteArguments(ctx.arguments, ctx.self?.realm?.plugin);
    },
    end() {},
    asyncStart() {},
    asyncEnd() {},
    error() {},
  });

  diagnosticsChannel.tracingChannel(CHANNELS.HAPI_EXT).subscribe({
    start(rawCtx) {
      const ctx = rawCtx as HapiChannelContext;
      wrapExtArguments(ctx.arguments, ctx.self?.realm?.plugin);
    },
    end() {},
    asyncStart() {},
    asyncEnd() {},
    error() {},
  });
}

/**
 * Orchestrion-driven hapi integration. Subscribes to the
 * `orchestrion:@hapi/hapi:route` / `:ext` channels injected into `@hapi/hapi`'s
 * `lib/server.js`. Requires the orchestrion runtime hook or bundler plugin.
 */
export const hapiIntegration = defineIntegration(_hapiIntegration);
