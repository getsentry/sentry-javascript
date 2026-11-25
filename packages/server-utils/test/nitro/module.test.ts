import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NitroLike, SentryNitroOptions } from '../../src/nitro/module';
import { createSentryNitroModule } from '../../src/nitro/module';

const USER_PLUGIN = '/app/server/plugins/user.ts';
const RUNTIME_PLUGIN_ID = '#sentry/nitro-plugin';
const RUNTIME_MODULE = '@sentry/node/nitro-runtime';

type BuildConfig = Parameters<Parameters<NitroLike['hooks']['hook']>[1]>[1];

let rootDir: string;

function createNitro(options: Partial<NitroLike['options']> = {}) {
  const buildConfigHooks: Array<(nitro: unknown, config: BuildConfig) => void> = [];
  const nitro = {
    options: { rootDir, modules: [], plugins: [USER_PLUGIN], scanDirs: [], virtual: {}, ...options },
    logger: { warn: vi.fn() },
    hooks: {
      hook: vi.fn((_name: 'build:config', callback: (nitro: unknown, config: BuildConfig) => void) => {
        buildConfigHooks.push(callback);
      }),
    },
  } satisfies NitroLike;

  return {
    nitro,
    callBuildConfig: (config: BuildConfig) => buildConfigHooks.forEach(callback => callback(nitro, config)),
    renderRuntimePlugin: () => (nitro.options.virtual as Record<string, () => string>)[RUNTIME_PLUGIN_ID]!(),
  };
}

function setup(nitro: NitroLike, options: SentryNitroOptions = {}): void {
  createSentryNitroModule(options, { runtimeModule: RUNTIME_MODULE }).setup(nitro);
}

function writeFile(relativePath: string): string {
  const file = join(rootDir, relativePath);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, "Sentry.init({ dsn: 'https://public@dsn.ingest.sentry.io/1' });\n");
  return file;
}

// Nitro deep-clones its config, and with it the modules in `modules`.
function cloneModule(mod: object): object {
  return Object.fromEntries(
    Reflect.ownKeys(mod).map(key => {
      const value = (mod as Record<PropertyKey, unknown>)[key];
      return [key, value && typeof value === 'object' ? { ...value } : value];
    }),
  );
}

function pluginNames(plugins: unknown): unknown[] {
  return (plugins as Array<{ name?: string }>).map(plugin => plugin.name);
}

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'sentry-nitro-module-'));
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe('createSentryNitroModule', () => {
  describe('tracing channels', () => {
    it('turns them on the way Nitro resolves `tracingChannel: true`', () => {
      const { nitro } = createNitro();

      setup(nitro);

      expect(nitro.options.tracingChannel).toEqual({ srvx: true, h3: true, unstorage: true, db0: true });
      expect(nitro.options.plugins).toEqual([RUNTIME_PLUGIN_ID, USER_PLUGIN, '#nitro/virtual/tracing']);
    });

    it('keeps an option the user set', () => {
      const { nitro } = createNitro({ tracingChannel: false });

      setup(nitro);

      expect(nitro.options.tracingChannel).toBe(false);
      expect(nitro.options.plugins).toEqual([RUNTIME_PLUGIN_ID, USER_PLUGIN]);
    });
  });

  describe('runtime plugin', () => {
    it('imports `sentry.server.config` from the root directory, then sets up error capture', () => {
      const file = writeFile('sentry.server.config.mts');
      const { nitro, renderRuntimePlugin } = createNitro();

      setup(nitro);

      expect(nitro.options.plugins[0]).toBe(RUNTIME_PLUGIN_ID);
      expect(renderRuntimePlugin()).toBe(
        [
          `import ${JSON.stringify(file)};`,
          'import { tasks } from "#nitro/virtual/tasks";',
          `import { setupSentryNitroApp } from "${RUNTIME_MODULE}";`,
          'export default function sentryNitroPlugin(nitroApp) {',
          '  setupSentryNitroApp(nitroApp, tasks);',
          '}',
          '',
        ].join('\n'),
      );
    });

    it('imports no server config when there is none', () => {
      const { nitro, renderRuntimePlugin } = createNitro();

      setup(nitro);

      expect(renderRuntimePlugin()).not.toContain(rootDir);
      expect(renderRuntimePlugin()).toContain('setupSentryNitroApp(nitroApp, tasks);');
    });

    it('imports the file from the `serverConfigFile` option, relative to the root directory', () => {
      writeFile('sentry.server.config.ts');
      const file = writeFile('config/instrument.server.ts');
      const { nitro, renderRuntimePlugin } = createNitro();

      setup(nitro, { serverConfigFile: './config/instrument.server.ts' });

      expect(renderRuntimePlugin()).toContain(`import ${JSON.stringify(file)};`);
      expect(renderRuntimePlugin()).not.toContain('sentry.server.config');
    });

    it('warns and imports no server config when the `serverConfigFile` option points to a missing file', () => {
      const { nitro, renderRuntimePlugin } = createNitro();

      setup(nitro, { serverConfigFile: './missing.ts' });

      expect(renderRuntimePlugin()).not.toContain('missing.ts');
      expect(nitro.logger.warn).toHaveBeenCalledWith(expect.stringContaining('`./missing.ts`'));
    });

    it('imports no server config when the `serverConfigFile` option is `false`', () => {
      writeFile('sentry.server.config.ts');
      const { nitro, renderRuntimePlugin } = createNitro();

      setup(nitro, { serverConfigFile: false });

      expect(nitro.options.plugins[0]).toBe(RUNTIME_PLUGIN_ID);
      expect(renderRuntimePlugin()).not.toContain('sentry.server.config');
    });

    it('does not import a server config that Nitro loads as a plugin from a directory it scans', () => {
      writeFile('server/plugins/sentry.ts');
      const { nitro, renderRuntimePlugin } = createNitro({ scanDirs: [`${join(rootDir, 'server')}/`] });

      setup(nitro, { serverConfigFile: './server/plugins/sentry.ts' });

      expect(renderRuntimePlugin()).not.toContain('server/plugins/sentry.ts');
    });

    it('does not import a server config that is already a Nitro plugin', () => {
      const file = writeFile('sentry.server.config.ts');
      const { nitro, renderRuntimePlugin } = createNitro({ plugins: [file] });

      setup(nitro);

      expect(nitro.options.plugins).toEqual([RUNTIME_PLUGIN_ID, file, '#nitro/virtual/tracing']);
      expect(renderRuntimePlugin()).not.toContain(file);
    });
  });

  describe('orchestrion transform', () => {
    it('adds the transform to the Rolldown config', () => {
      const { nitro, callBuildConfig } = createNitro();
      const rolldown = { plugins: [{ name: 'user-plugin' }] };

      setup(nitro);
      callBuildConfig({ rolldown });

      expect(pluginNames(rolldown.plugins)).toEqual(['user-plugin', 'code-transformer']);
    });

    it('adds the transform to the Rollup config, next to nested plugins', () => {
      const { nitro, callBuildConfig } = createNitro();
      const rollup = { plugins: [[{ name: 'nitro:a' }], { name: 'nitro:b' }] };

      setup(nitro);
      callBuildConfig({ rollup });

      expect(pluginNames(rollup.plugins)).toEqual(['nitro:a', 'nitro:b', 'code-transformer']);
    });

    it('does not add the transform again when the config already has one, and warns', () => {
      const { nitro, callBuildConfig } = createNitro();
      const plugins = [[{ name: 'sentry-rollup-plugin' }, { name: 'code-transformer' }]];
      const rollup = { plugins };

      setup(nitro);
      callBuildConfig({ rollup });

      expect(rollup.plugins).toBe(plugins);
      expect(nitro.logger.warn).toHaveBeenCalledWith(expect.stringContaining('`sentryRollupPlugin`'));
    });

    it('adds no transform when `buildTimeInstrumentation` is `false`', () => {
      const { nitro } = createNitro();

      setup(nitro, { buildTimeInstrumentation: false });

      expect(nitro.hooks.hook).not.toHaveBeenCalled();
    });

    it('adds no transform when a Vite plugin installed the module', () => {
      const { nitro } = createNitro();

      createSentryNitroModule({}, { runtimeModule: RUNTIME_MODULE, installedBy: 'vite' }).setup(nitro);

      expect(nitro.hooks.hook).not.toHaveBeenCalled();
      expect(nitro.options.plugins[0]).toBe(RUNTIME_PLUGIN_ID);
    });
  });

  describe('more than one instance', () => {
    it('sets Sentry up only from the first instance in `modules`, and the others warn', () => {
      const first = createSentryNitroModule({}, { runtimeModule: RUNTIME_MODULE });
      const second = createSentryNitroModule({}, { runtimeModule: RUNTIME_MODULE });
      const { nitro } = createNitro({ modules: ['some-module', cloneModule(first), cloneModule(second)] });

      first.setup(nitro);
      second.setup(nitro);

      expect(nitro.options.plugins).toEqual([RUNTIME_PLUGIN_ID, USER_PLUGIN, '#nitro/virtual/tracing']);
      expect(nitro.hooks.hook).toHaveBeenCalledTimes(1);
      expect(nitro.logger.warn).toHaveBeenCalledTimes(1);
      expect(nitro.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Only the first `sentryNitro()` in `modules` sets it up'),
      );
    });

    it('prefers the instance a Vite plugin installed, and tells to remove the module', () => {
      const module = createSentryNitroModule({}, { runtimeModule: RUNTIME_MODULE });
      const vitePluginModule = createSentryNitroModule({}, { runtimeModule: RUNTIME_MODULE, installedBy: 'vite' });
      const { nitro } = createNitro({
        // Nitro's Vite plugin appends the `nitro` module of each Vite plugin to `modules`.
        modules: [cloneModule(module), cloneModule(vitePluginModule)],
      });

      module.setup(nitro);
      vitePluginModule.setup(nitro);

      expect(nitro.options.plugins).toEqual([RUNTIME_PLUGIN_ID, USER_PLUGIN, '#nitro/virtual/tracing']);
      expect(nitro.hooks.hook).not.toHaveBeenCalled();
      expect(nitro.logger.warn).toHaveBeenCalledTimes(1);
      expect(nitro.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Only `sentryVitePlugin` sets it up, with its own options'),
      );
      expect(nitro.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Remove `sentryNitro()` from `modules` in your Nitro config.'),
      );
    });

    it('sets Sentry up from an instance that is not in `modules`', () => {
      const { nitro } = createNitro({ modules: ['some-module'] });

      setup(nitro);

      expect(nitro.options.plugins[0]).toBe(RUNTIME_PLUGIN_ID);
      expect(nitro.logger.warn).not.toHaveBeenCalled();
    });
  });
});
