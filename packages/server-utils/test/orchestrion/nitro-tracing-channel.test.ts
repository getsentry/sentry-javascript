import { GLOBAL_OBJ } from '@sentry/core';
import { isNitroDevServer } from '@sentry/core/server';
import type { NormalizedInputOptions, PluginContext } from 'rollup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NitroLike } from '../../src/orchestrion/bundler/nitro';
import { enableNitroTracingChannels, setupNitroForSentry } from '../../src/orchestrion/bundler/nitro';
import { sentryOrchestrionPlugin as sentryOrchestrionRollupPlugin } from '../../src/orchestrion/bundler/rollup';
import { sentryOrchestrionPlugin as sentryOrchestrionVitePlugin } from '../../src/orchestrion/bundler/vite';

type BuildStartHook = (this: Pick<PluginContext, 'warn'>, rollupOptions: NormalizedInputOptions) => void;

const RESOLVED_TRACING_CHANNEL = { srvx: true, h3: true, unstorage: true, db0: true };

function createNitro(options: NitroLike['options'] = {}): NitroLike {
  return { options: { plugins: ['./server/plugins/user.ts'], ...options } };
}

describe('enableNitroTracingChannels', () => {
  it('sets the option the way Nitro resolves `tracingChannel: true`', () => {
    const nitro = createNitro();

    enableNitroTracingChannels(nitro);

    expect(nitro.options.tracingChannel).toEqual(RESOLVED_TRACING_CHANNEL);
    expect(nitro.options.plugins).toEqual(['./server/plugins/user.ts', '#nitro/virtual/tracing']);
  });

  it('adds the tracing plugin when Nitro has no plugins list', () => {
    const nitro: NitroLike = { options: {} };

    enableNitroTracingChannels(nitro);

    expect(nitro.options.plugins).toEqual(['#nitro/virtual/tracing']);
  });

  it('keeps an option the user turned off', () => {
    const nitro = createNitro({ tracingChannel: false });

    enableNitroTracingChannels(nitro);

    expect(nitro.options.tracingChannel).toBe(false);
    expect(nitro.options.plugins).toEqual(['./server/plugins/user.ts']);
  });

  it('keeps an option that is already resolved, without adding the tracing plugin again', () => {
    const tracingChannel = { srvx: true, h3: true, unstorage: false, db0: true };
    const nitro = createNitro({ tracingChannel, plugins: ['#nitro/virtual/tracing'] });

    enableNitroTracingChannels(nitro);
    enableNitroTracingChannels(nitro);

    expect(nitro.options.tracingChannel).toBe(tracingChannel);
    expect(nitro.options.plugins).toEqual(['#nitro/virtual/tracing']);
  });
});

describe('setupNitroForSentry', () => {
  afterEach(() => {
    delete (GLOBAL_OBJ as { __SENTRY_NITRO_DEV_SERVER__?: boolean }).__SENTRY_NITRO_DEV_SERVER__;
    vi.unstubAllEnvs();
  });

  it.each([undefined, 'node-worker', 'node-process'])(
    'marks the dev server, which runs Nitro in a worker with the %s runner',
    runner => {
      setupNitroForSentry(createNitro({ dev: true, devServer: { runner } }));

      expect(isNitroDevServer()).toBe(true);
    },
  );

  it('marks the dev server for a worker runner from `NITRO_DEV_RUNNER`', () => {
    vi.stubEnv('NITRO_DEV_RUNNER', 'node-process');

    setupNitroForSentry(createNitro({ dev: true }));

    expect(isNitroDevServer()).toBe(true);
  });

  it('does not mark the dev server when Nitro runs in it with the `self` runner', () => {
    setupNitroForSentry(createNitro({ dev: true, devServer: { runner: 'self' } }));

    expect(isNitroDevServer()).toBe(false);
  });

  it('does not mark a production build', () => {
    setupNitroForSentry(createNitro({ dev: false }));

    expect(isNitroDevServer()).toBe(false);
  });
});

describe('sentryOrchestrionPlugin (vite) Nitro module', () => {
  it('turns on the tracing channels when Nitro installs it', () => {
    const plugin = sentryOrchestrionVitePlugin() as ReturnType<typeof sentryOrchestrionVitePlugin> & {
      nitro?: { setup: (nitro: NitroLike) => void };
    };
    const nitro = createNitro();

    plugin.nitro?.setup(nitro);

    expect(nitro.options.tracingChannel).toEqual(RESOLVED_TRACING_CHANNEL);
  });
});

describe('sentryOrchestrionPlugin (rollup) in a Nitro build', () => {
  const globalWithNitro = globalThis as { __nitro_instances__?: NitroLike[] };

  afterEach(() => {
    delete globalWithNitro.__nitro_instances__;
  });

  function runBuildStart(): void {
    const plugin = sentryOrchestrionRollupPlugin();
    (plugin.buildStart as BuildStartHook).call({ warn: vi.fn() }, {} as NormalizedInputOptions);
  }

  it('turns on the tracing channels of the newest Nitro instance', () => {
    const building = createNitro();
    const older = createNitro();
    globalWithNitro.__nitro_instances__ = [building, older];

    runBuildStart();

    expect(building.options.tracingChannel).toEqual(RESOLVED_TRACING_CHANNEL);
    expect(older.options.tracingChannel).toBeUndefined();
  });

  it('does nothing outside a Nitro build', () => {
    expect(() => runBuildStart()).not.toThrow();
  });
});
