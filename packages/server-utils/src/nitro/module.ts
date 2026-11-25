import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { BuildTimeOptionsBase } from '@sentry/core';
import { stringifyForCodeInjection } from '@sentry/core';
import { sentryOrchestrionPlugin } from '../orchestrion/bundler/rollup';

/**
 * Options of the Sentry Nitro module. `Sentry.init()` options go in `sentry.server.config.ts`.
 */
export type SentryNitroOptions = Pick<
  BuildTimeOptionsBase,
  'org' | 'project' | 'authToken' | 'release' | 'sourcemaps' | 'buildTimeInstrumentation'
> & {
  /**
   * The file that calls `Sentry.init()` on the server, relative to Nitro's root directory. The module imports it
   * from a Nitro plugin that runs before every other plugin. Set to `false` to import nothing, for example when
   * `Sentry.init()` runs elsewhere.
   *
   * @default `sentry.server.config.{ts,js,mjs,cjs,mts,cts}` in Nitro's root directory, when it exists
   */
  serverConfigFile?: string | false;
};

type NitroBundlerConfig = { plugins?: unknown };

/**
 * The parts of a Nitro instance that the module reads or changes. Nitro is not a dependency of this package, so
 * this stands in for `nitro/types`' `Nitro`, which must stay assignable to it.
 */
export interface NitroLike {
  options: {
    rootDir: string;
    modules?: unknown[];
    plugins: string[];
    scanDirs: string[];
    tracingChannel?: unknown;
    virtual: Record<string, string | (() => string | Promise<string>)>;
  };
  logger: { warn: (message: string) => void };
  hooks: {
    hook: (
      name: 'build:config',
      callback: (nitro: unknown, config: { rollup?: NitroBundlerConfig; rolldown?: NitroBundlerConfig }) => void,
    ) => unknown;
  };
}

/** A Nitro module, in the shape Nitro installs from `modules` or from the `nitro` property of a Vite plugin. */
export interface SentryNitroModule {
  name: string;
  setup: (nitro: NitroLike) => void;
}

interface CreateSentryNitroModuleOptions {
  /**
   * The module the runtime plugin imports `setupSentryNitroApp` from. It must resolve from the app's root directory,
   * so it is a subpath of the SDK package the app depends on, such as `@sentry/node/nitro/runtime`.
   */
  runtimeModule: string;
  /**
   * Set by `sentryVitePlugin`, whose instance wins over the ones in `modules`, and which adds the transform itself.
   */
  installedBy?: 'module' | 'vite';
}

interface SentryNitroInstance {
  // Nitro deep-clones its config, and with it the instances in `modules`, so they are told apart by this id.
  id: symbol;
  installedBy: 'module' | 'vite';
}

// `Symbol.for`, so that instances from different copies of the SDK recognize each other.
const SENTRY_NITRO_INSTANCE = Symbol.for('sentry.nitro.instance');

const RUNTIME_PLUGIN_ID = '#sentry/nitro-plugin';
const SERVER_CONFIG_FILE_NAME = 'sentry.server.config';
const SERVER_CONFIG_FILE_EXTENSIONS = ['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'];
// The names `sentryOrchestrionPlugin` returns, with and without `buildTimeInstrumentation`.
const ORCHESTRION_PLUGIN_NAMES = ['code-transformer', 'sentry-orchestrion-disabled'];

/**
 * Creates the Sentry Nitro module. In one Nitro app, only one instance does anything; see {@link getActiveInstance}.
 */
export function createSentryNitroModule(
  options: SentryNitroOptions,
  { runtimeModule, installedBy = 'module' }: CreateSentryNitroModuleOptions,
): SentryNitroModule {
  const instance: SentryNitroInstance = { id: Symbol('sentry.nitro.instance'), installedBy };

  return {
    name: 'sentry',
    [SENTRY_NITRO_INSTANCE]: instance,
    setup(nitro) {
      const activeInstance = getActiveInstance(nitro, instance);
      if (activeInstance.id !== instance.id) {
        nitro.logger.warn(duplicateInstanceWarning(activeInstance, instance));
        return;
      }

      enableNitroTracingChannels(nitro);
      registerRuntimePlugin(nitro, runtimeModule, options.serverConfigFile);

      if (installedBy === 'module' && options.buildTimeInstrumentation !== false) {
        addOrchestrionTransform(nitro);
      }
    },
  } as SentryNitroModule;
}

function getInstance(mod: unknown): SentryNitroInstance | undefined {
  if (!mod || (typeof mod !== 'object' && typeof mod !== 'function')) {
    return undefined;
  }
  return (mod as { [SENTRY_NITRO_INSTANCE]?: SentryNitroInstance })[SENTRY_NITRO_INSTANCE];
}

/**
 * The instance that sets Sentry up for this Nitro app: the one a Vite plugin installed, otherwise the first one in
 * `modules`. Nitro's Vite plugin appends the `nitro` module of each Vite plugin to `modules` before Nitro installs
 * any, so every instance sees all of them. Options are never merged.
 */
function getActiveInstance(nitro: NitroLike, self: SentryNitroInstance): SentryNitroInstance {
  const instances = (nitro.options.modules ?? []).map(getInstance).filter(instance => instance !== undefined);
  if (!instances.some(instance => instance.id === self.id)) {
    instances.push(self);
  }
  return instances.find(instance => instance.installedBy === 'vite') ?? instances[0] ?? self;
}

function duplicateInstanceWarning(active: SentryNitroInstance, self: SentryNitroInstance): string {
  const activeName = active.installedBy === 'vite' ? '`sentryVitePlugin`' : 'the first `sentryNitro()` in `modules`';
  const removeHint =
    active.installedBy === 'vite' && self.installedBy === 'module'
      ? ' Remove `sentryNitro()` from `modules` in your Nitro config.'
      : '';
  return `[Sentry] Sentry is set up more than once in this Nitro app. Only ${activeName} sets it up, with its own options; this instance does nothing.${removeHint}`;
}

/**
 * Turns on Nitro's `tracingChannel` option, so h3, srvx, unstorage and db0 publish the tracing channels that
 * `nitroIntegration` subscribes to.
 *
 * Nitro resolves the option before it installs modules, so this does what its resolver does
 * (`src/config/resolvers/tracing.ts` in nitrojs/nitro). Its virtual modules read the option only when they render,
 * during the build. An option that is already set stays as it is, such as a user's `false`.
 */
function enableNitroTracingChannels(nitro: NitroLike): void {
  if (nitro.options.tracingChannel !== undefined) {
    return;
  }

  nitro.options.tracingChannel = { srvx: true, h3: true, unstorage: true, db0: true };
  nitro.options.plugins.push('#nitro/virtual/tracing');
}

/**
 * Registers the Sentry runtime plugin as the first Nitro plugin. It imports the server config, so `Sentry.init()`
 * runs before the other plugins load, and then captures the errors of the app and its tasks.
 *
 * The plugin is a virtual module, so it is always bundled and can import Nitro's virtual modules. The server config
 * needs no `definePlugin` and Nitro needs no `serverDir` to find it.
 */
function registerRuntimePlugin(
  nitro: NitroLike,
  runtimeModule: string,
  serverConfigFile: string | false | undefined,
): void {
  const configFile = serverConfigFile === false ? undefined : findServerConfigFile(nitro, serverConfigFile);
  const importedConfigFile = configFile && !isNitroPlugin(nitro, configFile) ? configFile : undefined;

  nitro.options.virtual[RUNTIME_PLUGIN_ID] = () =>
    [
      importedConfigFile ? `import ${stringifyForCodeInjection(importedConfigFile)};` : '',
      'import { tasks } from "#nitro/virtual/tasks";',
      // The SDK's entry, not `@sentry/server-utils`, which pnpm apps can't resolve from their root.
      // See `@sentry/node/nitro/runtime`.
      `import { setupSentryNitroApp } from ${stringifyForCodeInjection(runtimeModule)};`,
      'export default function sentryNitroPlugin(nitroApp) {',
      '  setupSentryNitroApp(nitroApp, tasks);',
      '}',
      '',
    ].join('\n');
  nitro.options.plugins.unshift(RUNTIME_PLUGIN_ID);
}

function findServerConfigFile(nitro: NitroLike, serverConfigFile: string | undefined): string | undefined {
  const { rootDir } = nitro.options;
  if (serverConfigFile === undefined) {
    return SERVER_CONFIG_FILE_EXTENSIONS.map(ext => resolve(rootDir, `${SERVER_CONFIG_FILE_NAME}.${ext}`)).find(
      existsSync,
    );
  }

  const file = resolve(rootDir, serverConfigFile);
  if (existsSync(file)) {
    return file;
  }

  nitro.logger.warn(
    `[Sentry] The \`serverConfigFile\` option points to \`${serverConfigFile}\`, but there is no file at \`${file}\`. Sentry will not be initialized on the server.`,
  );
  return undefined;
}

// Nitro loads a file in one of these places as a plugin already. Importing it again would run it as a module too.
function isNitroPlugin(nitro: NitroLike, file: string): boolean {
  return (
    nitro.options.plugins.includes(file) ||
    nitro.options.scanDirs.some(dir => file.startsWith(join(dir, 'plugins') + sep))
  );
}

/**
 * Adds the orchestrion code transform to Nitro's Rollup or Rolldown build, so instrumented dependencies publish
 * `diagnostics_channel` events from the bundle.
 */
function addOrchestrionTransform(nitro: NitroLike): void {
  nitro.hooks.hook('build:config', (_nitro, buildConfig) => {
    const bundlerConfig = buildConfig.rolldown ?? buildConfig.rollup;
    if (!bundlerConfig) {
      return;
    }

    const plugins = flattenPlugins(bundlerConfig.plugins);
    if (plugins.some(isOrchestrionPlugin)) {
      // A file transformed twice fails the build.
      nitro.logger.warn(
        "[Sentry] Nitro's bundler config already has Sentry's code transform, for example from `sentryRollupPlugin` in `rollupConfig.plugins`. The `sentryNitro()` module does not add it again. Using `sentryNitro()` together with `sentryRollupPlugin` is not supported.",
      );
      return;
    }

    bundlerConfig.plugins = [...plugins, sentryOrchestrionPlugin()];
  });
}

function flattenPlugins(plugins: unknown): unknown[] {
  if (Array.isArray(plugins)) {
    return plugins.flatMap(flattenPlugins);
  }
  return plugins ? [plugins] : [];
}

function isOrchestrionPlugin(plugin: unknown): boolean {
  const name = (plugin as { name?: unknown } | null | undefined)?.name;
  return typeof name === 'string' && ORCHESTRION_PLUGIN_NAMES.includes(name);
}
