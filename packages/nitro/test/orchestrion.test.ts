import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/rollup';
import { createNitro } from 'nitro/builder';
import type { Nitro, NitroModule, RollupConfig } from 'nitro/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withSentryConfig } from '../src/config';
import { createOrchestrionModule } from '../src/orchestrion';

function userModule(plugin: { name: string }): NitroModule {
  return {
    setup: nitro => {
      nitro.hooks.hook('rollup:before', (_nitro, config) => {
        config.plugins = [config.plugins, plugin];
      });
    },
  };
}

function pluginNames(config: RollupConfig): string[] {
  return [config.plugins].flat(Infinity).map(plugin => (plugin as { name: string }).name);
}

describe('createOrchestrionModule', () => {
  let rootDir: string;
  let nitro: Nitro | undefined;

  async function buildConfig(options: {
    modules: NitroModule[];
    builder?: 'rollup' | 'rolldown' | 'vite';
    plugins?: unknown[];
  }) {
    nitro = await createNitro({
      rootDir,
      dev: false,
      builder: options.builder ?? 'rolldown',
      modules: options.modules,
    });
    const config = { plugins: [{ name: 'nitro:app' }, ...(options.plugins ?? [])] } as RollupConfig;
    await nitro.hooks.callHook('build:before', nitro);
    await nitro.hooks.callHook('rollup:before', nitro, config);
    return config;
  }

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'sentry-nitro-orchestrion-'));
  });

  afterEach(async () => {
    await nitro?.close();
    nitro = undefined;
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('adds the orchestrion plugin to the server build', async () => {
    const config = await buildConfig({ modules: [createOrchestrionModule()] });

    expect(pluginNames(config)).toEqual(['nitro:app', 'code-transformer']);
  });

  it.each([
    ['before', (own: NitroModule) => [own, createOrchestrionModule()]],
    ['after', (own: NitroModule) => [createOrchestrionModule(), own]],
  ])('keeps an orchestrion plugin that a module listed %s it adds', async (_order, modules) => {
    const config = await buildConfig({ modules: modules(userModule(sentryOrchestrionPlugin())) });

    expect(pluginNames(config)).toEqual(['nitro:app', 'code-transformer']);
  });

  it('keeps an orchestrion plugin from `rollupConfig.plugins`, nested as `@sentry/node/rollup` returns it', async () => {
    const config = await buildConfig({
      modules: [createOrchestrionModule()],
      plugins: [[{ name: 'sentry-rollup' }, sentryOrchestrionPlugin()]],
    });

    expect(pluginNames(config)).toEqual(['nitro:app', 'sentry-rollup', 'code-transformer']);
  });

  it('respects a disabled orchestrion plugin that the app adds', async () => {
    const config = await buildConfig({
      modules: [userModule(sentryOrchestrionPlugin({ buildTimeInstrumentation: false })), createOrchestrionModule()],
    });

    expect(pluginNames(config)).toEqual(['nitro:app', 'sentry-orchestrion-disabled']);
  });

  it('does not add the plugin to Vite builds', async () => {
    const config = await buildConfig({ builder: 'vite', modules: [createOrchestrionModule()] });

    expect(pluginNames(config)).toEqual(['nitro:app']);
  });
});

describe('withSentryConfig', () => {
  function moduleNames(config: ReturnType<typeof withSentryConfig>): unknown[] {
    return (config.modules ?? []).map(module => (module as NitroModule).name);
  }

  it('adds the orchestrion module', () => {
    expect(moduleNames(withSentryConfig({}))).toEqual(['sentry', 'sentry-orchestrion']);
  });

  it('does not add the orchestrion module with `buildTimeInstrumentation: false`', () => {
    expect(moduleNames(withSentryConfig({}, { buildTimeInstrumentation: false }))).toEqual(['sentry']);
  });
});
