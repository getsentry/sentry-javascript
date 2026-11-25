import { setIsNitroDevServer } from '@sentry/core/server';
import { runsNitroInWorker } from '../../integrations/nitro/devServer';

/**
 * The parts of a Nitro instance that the bundler plugins read or change. Nitro is not a dependency of this package.
 */
export interface NitroLike {
  options: {
    dev?: boolean;
    devServer?: { runner?: string };
    tracingChannel?: unknown;
    plugins?: string[];
  };
}

/**
 * A Nitro module, in the shape that Nitro's Vite plugin installs from the `nitro` property of a Vite plugin.
 */
export interface NitroModuleLike {
  name: string;
  setup: (nitro: NitroLike) => void;
}

/**
 * Turns on Nitro's `tracingChannel` option, so h3, srvx, unstorage and db0 publish the tracing channels that
 * `nitroIntegration` subscribes to.
 *
 * Nitro resolves the option before it installs modules or runs the bundler, so this does what its resolver does
 * (`src/config/resolvers/tracing.ts` in nitrojs/nitro). Its virtual modules read the option only when they render,
 * during the build. An option that is already set stays as it is: a user's `false`, or the value `@sentry/nitro` sets.
 */
export function enableNitroTracingChannels(nitro: NitroLike): void {
  if (nitro.options.tracingChannel !== undefined) {
    return;
  }

  nitro.options.tracingChannel = { srvx: true, h3: true, unstorage: true, db0: true };
  (nitro.options.plugins ??= []).push('#nitro/virtual/tracing');
}

/**
 * Sets up a Nitro build for the Sentry SDK: turns on its tracing channels and, in dev, marks this process as the dev
 * server. The dev server runs in the build's process and passes each request on to a worker that runs Nitro and
 * traces the request, so `httpIntegration` creates no spans for the dev server's own requests.
 */
export function setupNitroForSentry(nitro: NitroLike): void {
  enableNitroTracingChannels(nitro);

  if (nitro.options.dev && runsNitroInWorker(nitro)) {
    setIsNitroDevServer();
  }
}

export const sentryNitroModule: NitroModuleLike = {
  name: 'sentry',
  setup: setupNitroForSentry,
};

/**
 * The Nitro instance that is building in this process, if any. Nitro installs no modules from `rollupConfig.plugins`,
 * so the Rollup plugin takes the instance from the global where Nitro registers it (`src/global.ts` in nitrojs/nitro),
 * newest first. That global is not public API.
 */
export function getBuildingNitro(): NitroLike | undefined {
  return (globalThis as { __nitro_instances__?: NitroLike[] }).__nitro_instances__?.[0];
}
