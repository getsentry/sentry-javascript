import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { stringifyForCodeInjection } from '@sentry/core';
import type { PluginOptions } from './options';

/**
 * The parts of a Nitro instance that the bundler plugins read or change. Nitro is not a dependency of this package.
 */
export interface NitroLike {
  options: {
    tracingChannel?: unknown;
    plugins?: string[];
    rootDir?: string;
    scanDirs?: string[];
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

const SERVER_CONFIG_FILE_NAME = 'sentry.server.config';
const SERVER_CONFIG_FILE_EXTENSIONS = ['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'];
const SERVER_CONFIG_PLUGIN_PREFIX = 'virtual:sentry-nitro-server-config:';

function findServerConfigFile(rootDir: string, serverConfigFile: string | undefined): string | undefined {
  if (serverConfigFile === undefined) {
    return SERVER_CONFIG_FILE_EXTENSIONS.map(ext => resolve(rootDir, `${SERVER_CONFIG_FILE_NAME}.${ext}`)).find(
      existsSync,
    );
  }

  const file = resolve(rootDir, serverConfigFile);
  if (existsSync(file)) {
    return file;
  }

  // Build time, where the Sentry debug logger isn't enabled.
  // oxlint-disable-next-line no-console
  console.warn(
    `[Sentry] The \`serverConfigFile\` option points to \`${serverConfigFile}\`, but there is no file at \`${file}\`. ` +
      'Sentry will not be initialized on the server.',
  );
  return undefined;
}

/**
 * Registers the Sentry server config (`sentry.server.config.ts` in Nitro's root directory, or the `serverConfigFile`
 * option) as the first Nitro plugin, so `Sentry.init()` runs at server startup in Nitro's process, and in dev only
 * there, not in the dev server in front of it.
 *
 * The plugin is a virtual module that imports the file, so the file needs no `definePlugin` and Nitro needs no
 * `serverDir` to find it. A file in a directory Nitro scans for plugins, or one already in `plugins`, is left alone.
 */
export function registerSentryServerConfig(nitro: NitroLike, serverConfigFile?: string | false): void {
  const plugins = (nitro.options.plugins ??= []);
  if (serverConfigFile === false || plugins.some(plugin => plugin.startsWith(SERVER_CONFIG_PLUGIN_PREFIX))) {
    return;
  }

  const file = findServerConfigFile(nitro.options.rootDir ?? process.cwd(), serverConfigFile);
  if (!file) {
    return;
  }

  const isNitroPlugin =
    plugins.includes(file) || !!nitro.options.scanDirs?.some(dir => file.startsWith(join(dir, 'plugins') + sep));
  if (!isNitroPlugin) {
    plugins.unshift(`${SERVER_CONFIG_PLUGIN_PREFIX}${file}`);
  }
}

/**
 * Resolves the virtual Nitro plugin that `registerSentryServerConfig` adds.
 */
export function resolveSentryServerConfigPlugin(source: string): string | undefined {
  return source.startsWith(SERVER_CONFIG_PLUGIN_PREFIX) ? `\0${source}` : undefined;
}

/**
 * Loads the virtual Nitro plugin that `registerSentryServerConfig` adds. The file path is part of the id, so any
 * instance of the bundler plugins can load it.
 */
export function loadSentryServerConfigPlugin(id: string): string | undefined {
  if (!id.startsWith(`\0${SERVER_CONFIG_PLUGIN_PREFIX}`)) {
    return undefined;
  }

  const file = id.slice(SERVER_CONFIG_PLUGIN_PREFIX.length + 1);
  return `import ${stringifyForCodeInjection(file)};\nexport default function sentryServerConfig() {}\n`;
}

/**
 * Prepares a Nitro build for Sentry: turns on the tracing channels and registers the Sentry server config.
 */
export function setupNitroForSentry(nitro: NitroLike, options: PluginOptions = {}): void {
  enableNitroTracingChannels(nitro);
  registerSentryServerConfig(nitro, options.serverConfigFile);
}

/**
 * The Nitro module that the Vite plugin exposes on its `nitro` property.
 */
export function createSentryNitroModule(options: PluginOptions = {}): NitroModuleLike {
  return { name: 'sentry', setup: nitro => setupNitroForSentry(nitro, options) };
}

/**
 * The Nitro instance that is building in this process, if any. Nitro installs no modules from `rollupConfig.plugins`,
 * so the Rollup plugin takes the instance from the global where Nitro registers it (`src/global.ts` in nitrojs/nitro),
 * newest first. That global is not public API.
 */
export function getBuildingNitro(): NitroLike | undefined {
  return (globalThis as { __nitro_instances__?: NitroLike[] }).__nitro_instances__?.[0];
}
