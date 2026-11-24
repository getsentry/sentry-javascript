import { setIsNitroDevServer } from '@sentry/core/server';
import { CHANNELS } from '../../orchestrion/channels';
import type { OrchestrionChannelContext } from '../../orchestrion/types';
import { safeChannelCallback } from '../../tracing-channel';
import * as diagnosticsChannel from '../../utils/diagnosticsChannel';

interface NitroLike {
  options?: { devServer?: { runner?: string } };
}

/**
 * Whether Nitro runs the app in a worker for this dev server. The `self` runner runs it in the dev server's
 * process instead, so its requests must still be traced there.
 */
export function runsNitroInWorker(nitro: NitroLike | undefined): boolean {
  const runner = nitro?.options?.devServer?.runner || process.env.NITRO_DEV_RUNNER || 'node-worker';
  return runner === 'node-worker' || runner === 'node-process';
}

/**
 * Marks the dev server from the `NitroDevApp` constructor, which both `nitro dev` and Nitro's Vite plugin
 * call on the dev server's main thread.
 */
export function captureNitroDevServer(): void {
  diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(CHANNELS.NITRO_DEV_APP).start.subscribe(message => {
    safeChannelCallback(() => {
      if (runsNitroInWorker((message as OrchestrionChannelContext).arguments[0] as NitroLike | undefined)) {
        setIsNitroDevServer();
      }
    });
  });
}
