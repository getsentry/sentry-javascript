import * as diagnosticsChannel from 'node:diagnostics_channel';
import { CHANNELS } from '../../../orchestrion/channels';
import { wrapExtArguments, wrapRouteArguments } from './utils';

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

export function instrumentHapi() {
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
