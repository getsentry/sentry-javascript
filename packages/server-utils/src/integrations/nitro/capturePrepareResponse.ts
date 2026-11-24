import { getActiveSpan } from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';
import type { OrchestrionChannelContext } from '../../orchestrion/types';
import { safeChannelCallback } from '../../tracing-channel';
import * as diagnosticsChannel from '../../utils/diagnosticsChannel';
import { setParameterizedRouteAttributes } from './captureTracingEvents';
import type { NitroH3Event } from './nitroTypes';
import { setServerTimingHeaders } from './setServerTimingHeaders';

/**
 * Sets the route name and the `Server-Timing` headers from h3's `prepareResponse`, which orchestrion
 * instruments. h3 publishes its native `h3.request` channel only when Nitro's `tracingChannel` option is
 * on, so this is what covers the apps without it.
 *
 * With `tracingChannel`, the native path runs first for the same event. It sets the same route, and the
 * `Server-Timing` headers are set once per event, so neither is duplicated. `prepareResponse` also calls
 * itself again on the error path, which the same checks cover.
 */
export function capturePrepareResponse(serverTiming: boolean): void {
  diagnosticsChannel
    .tracingChannel<OrchestrionChannelContext>(CHANNELS.H3_PREPARE_RESPONSE)
    .start.subscribe(message => {
      safeChannelCallback(() => {
        const event = (message as OrchestrionChannelContext).arguments[1] as NitroH3Event | undefined;
        if (!event?.context) {
          return;
        }

        const activeSpan = getActiveSpan();
        if (activeSpan) {
          setParameterizedRouteAttributes(activeSpan, event);
        }

        if (serverTiming) {
          setServerTimingHeaders(event);
        }
      });
    });
}
