import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';
import { hapiModuleNames } from '../../orchestrion/config/hapi';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { attachHapiErrorHandler } from './hapi-error-handler';
import type { HapiServer, HapiShouldHandleError } from './hapi-types';
import { wrapExtArguments, wrapRouteArguments } from './hapi-utils';

// NOTE: same name as the OTel integration by design — when enabled, the OTel
// 'Hapi' integration is omitted from the default set.
const INTEGRATION_NAME = 'Hapi' as const;

interface HapiIntegrationOptions {
  /**
   * Callback deciding whether an error should be captured and sent to Sentry.
   *
   * By default, 5xx errors (and errors without a resolvable status) are sent,
   * while 3xx and 4xx errors are not. The hapi request's `response` carries the
   * resolved HTTP status.
   *
   * @example
   *
   * ```javascript
   * Sentry.init({
   *   integrations: [
   *     Sentry.hapiIntegration({
   *       shouldHandleError(_error, request) {
   *         return (request.response?.output?.statusCode ?? request.response?.statusCode ?? 500) >= 500;
   *       },
   *     }),
   *   ],
   * });
   * ```
   */
  shouldHandleError: HapiShouldHandleError;
}

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

/**
 * The `start`/`initialize` channel `context` shape: `self` is the live server
 * we attach the auto-registered error listener to.
 */
interface HapiServerContext {
  self?: HapiServer;
}

const _hapiIntegration = (({ shouldHandleError }: Partial<HapiIntegrationOptions> = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, hapiModuleNames, instrumentHapi, [shouldHandleError], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

function instrumentHapi(shouldHandleError?: HapiShouldHandleError): void {
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

  // Auto-register the error handler when the server boots
  // `attachHapiErrorHandler` is idempotent, so hooking both `start` and `initialize` is safe.
  const attachOnStart = {
    start(rawCtx: unknown) {
      const server = (rawCtx as HapiServerContext).self;
      if (server) {
        attachHapiErrorHandler(server, shouldHandleError);
      }
    },
    end() {},
    asyncStart() {},
    asyncEnd() {},
    error() {},
  };

  diagnosticsChannel.tracingChannel(CHANNELS.HAPI_START).subscribe(attachOnStart);
  diagnosticsChannel.tracingChannel(CHANNELS.HAPI_INITIALIZE).subscribe(attachOnStart);
}

/**
 * Diagnostics-channel-based hapi integration. Subscribes to the
 * `orchestrion:@hapi/hapi:route` / `:ext` channels injected into `@hapi/hapi`'s
 * `lib/server.js`. Requires the Sentry runtime hook or bundler plugin.
 */
export const hapiIntegration = defineIntegration(_hapiIntegration);
