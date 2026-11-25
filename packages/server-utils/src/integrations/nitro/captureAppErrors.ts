import { CHANNELS } from '../../orchestrion/channels';
import type { OrchestrionChannelContext } from '../../orchestrion/types';
import { safeChannelCallback } from '../../tracing-channel';
import * as diagnosticsChannel from '../../utils/diagnosticsChannel';
import { setupNitroErrorCapture } from './captureErrors';

/**
 * Registers error capture on the Nitro app that `useNitroApp` returns, so errors are captured without
 * `@sentry/nitro`. The channel fires on every call, and `setupNitroErrorCapture` skips apps it has
 * already set up, including apps that `@sentry/nitro`'s plugin set up.
 */
export function captureNitroAppErrors(): void {
  diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(CHANNELS.NITRO_USE_NITRO_APP).end.subscribe(message => {
    safeChannelCallback(() => setupNitroErrorCapture((message as OrchestrionChannelContext).result));
  });
}
