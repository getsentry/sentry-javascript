/**
 * The parts of a Nitro instance that the bundler plugins change. Nitro is not a dependency of this package.
 */
export interface NitroLike {
  options: {
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

export const sentryNitroModule: NitroModuleLike = {
  name: 'sentry',
  setup: enableNitroTracingChannels,
};

/**
 * The Nitro instance that is building in this process, if any. Nitro installs no modules from `rollupConfig.plugins`,
 * so the Rollup plugin takes the instance from the global where Nitro registers it (`src/global.ts` in nitrojs/nitro),
 * newest first. That global is not public API.
 */
export function getBuildingNitro(): NitroLike | undefined {
  return (globalThis as { __nitro_instances__?: NitroLike[] }).__nitro_instances__?.[0];
}
