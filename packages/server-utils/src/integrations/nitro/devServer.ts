import { GLOBAL_OBJ } from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';
import type { OrchestrionChannelContext } from '../../orchestrion/types';
import { safeChannelCallback } from '../../tracing-channel';
import * as diagnosticsChannel from '../../utils/diagnosticsChannel';

// On the global object, because `@sentry/nitro`'s build-time module and the SDK that `--import` loads can
// each have their own copy of this package.
type GlobalWithNitroDevServer = typeof GLOBAL_OBJ & {
  __SENTRY_NITRO_DEV_SERVER__?: boolean;
};

interface NitroLike {
  options?: { devServer?: { runner?: string } };
}

/**
 * Marks this process as Nitro's dev server, which passes each request on to a worker that runs Nitro and
 * traces the request.
 */
export function setIsNitroDevServer(): void {
  (GLOBAL_OBJ as GlobalWithNitroDevServer).__SENTRY_NITRO_DEV_SERVER__ = true;
}

/**
 * Whether this process is Nitro's dev server, see {@link setIsNitroDevServer}. Its incoming requests get no
 * spans, because the worker creates them.
 */
export function isNitroDevServer(): boolean {
  return !!(GLOBAL_OBJ as GlobalWithNitroDevServer).__SENTRY_NITRO_DEV_SERVER__;
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
