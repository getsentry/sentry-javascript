// @vitest-environment node
// Build-time plugin code, no DOM. `vite`'s runtime exports pull in esbuild, which cannot run under
// jsdom's `TextEncoder`.
import type { Plugin, UserConfig } from 'vite';
import { mergeConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentrySolidStart } from '../../src/vite/sentrySolidStart';

vi.spyOn(console, 'log').mockImplementation(() => {
  /* noop */
});
vi.spyOn(console, 'warn').mockImplementation(() => {
  /* noop */
});

type ViteConfigWithNitro = UserConfig & { nitro?: Record<string, unknown> };

/** Invokes a plugin's `config` hook the way Vite does, returning the partial config it contributes. */
function callConfigHook(plugin: Plugin, config: ViteConfigWithNitro = {}): ViteConfigWithNitro | undefined {
  const hook = plugin.config;
  const handler = typeof hook === 'function' ? hook : hook?.handler;
  return handler?.call({} as never, config as UserConfig, {
    command: 'build',
    mode: 'production',
  }) as ViteConfigWithNitro | undefined;
}

function getNitroPlugin(plugins: Plugin[]): Plugin {
  const plugin = plugins.find(p => p.name === 'sentry-solidstart-nitro');
  if (!plugin) {
    throw new Error('Expected a `sentry-solidstart-nitro` plugin');
  }
  return plugin;
}

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = 'production';
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  vi.clearAllMocks();
});

describe('sentrySolidStart()', () => {
  it('returns the nitro, orchestrion and source maps plugins', () => {
    const names = sentrySolidStart({ org: 'org', project: 'project', authToken: 'token' }).map(plugin => plugin.name);

    expect(names).toEqual([
      'sentry-solidstart-nitro',
      // `sentryOrchestrionPlugin` spreads the upstream code-transformer plugin, which brings its name.
      'code-transformer',
      'sentry-solidstart-files-to-delete-after-upload',
      'sentry-vite-plugin',
      'sentry-solidstart-update-source-map-setting',
    ]);
  });

  it('returns an inert orchestrion plugin when build-time instrumentation is disabled', () => {
    const names = sentrySolidStart({ buildTimeInstrumentation: false }).map(plugin => plugin.name);

    expect(names).toContain('sentry-orchestrion-disabled');
    expect(names).not.toContain('code-transformer');
  });

  it('omits the source maps plugins when source maps are disabled', () => {
    const names = sentrySolidStart({ sourcemaps: { disable: true } }).map(plugin => plugin.name);

    expect(names).toEqual(['sentry-solidstart-nitro', 'code-transformer']);
  });

  // `'disable-upload'` still injects debug IDs, so the plugins have to run; the bundler plugin
  // suppresses just the upload.
  it('keeps the source maps plugins when only the upload is disabled', () => {
    const names = sentrySolidStart({ sourcemaps: { disable: 'disable-upload' } }).map(plugin => plugin.name);

    expect(names).toContain('sentry-vite-plugin');
    expect(names).toContain('sentry-solidstart-update-source-map-setting');
  });

  it('only returns the nitro plugin in development', () => {
    process.env.NODE_ENV = 'development';

    const names = sentrySolidStart({ org: 'org', project: 'project' }).map(plugin => plugin.name);

    expect(names).toEqual(['sentry-solidstart-nitro']);
  });

  describe('the nitro plugin', () => {
    // Without this, placing `sentrySolidStart()` after `nitro()` would contribute the config too
    // late and it would be silently ignored.
    it("is enforced as 'pre' so it runs before nitro's own config hook", () => {
      const plugin = getNitroPlugin(sentrySolidStart());

      expect(plugin.enforce).toBe('pre');
    });

    it('registers the Sentry nitro module and enables tracing channels', () => {
      const contributed = callConfigHook(getNitroPlugin(sentrySolidStart()));

      expect(contributed?.nitro).toMatchObject({
        tracingChannel: true,
        modules: [expect.objectContaining({ name: 'sentry' })],
      });
    });

    it('enables hidden source maps and opts out of nitro sourcemap minification', () => {
      const contributed = callConfigHook(getNitroPlugin(sentrySolidStart()));

      // `sourcemapMinify` clears `mappings` for chunks touching `node_modules`, making the uploaded
      // server source maps useless.
      expect(contributed?.nitro).toMatchObject({
        sourcemap: 'hidden',
        experimental: { sourcemapMinify: false },
      });
    });

    it("keeps the user's explicit nitro source map setting", () => {
      const contributed = callConfigHook(getNitroPlugin(sentrySolidStart()), { nitro: { sourcemap: false } });

      expect(contributed?.nitro).toMatchObject({ sourcemap: false });
    });

    // Vite concatenates arrays when merging a `config` return value, so echoing the user's own
    // entries back duplicates every one of them.
    it("does not duplicate the user's nitro arrays once Vite merges the result", () => {
      const userConfig: ViteConfigWithNitro = {
        nitro: { modules: [{ name: 'user-module' }], plugins: ['./server/plugins/user.ts'] },
      };

      const merged = mergeConfig(userConfig, callConfigHook(getNitroPlugin(sentrySolidStart()), userConfig) ?? {});

      expect((merged as ViteConfigWithNitro).nitro).toMatchObject({
        modules: [{ name: 'user-module' }, expect.objectContaining({ name: 'sentry' })],
        plugins: ['./server/plugins/user.ts'],
      });
    });

    it('preserves unrelated nitro options the user set', () => {
      const userConfig: ViteConfigWithNitro = { nitro: { preset: 'node-server' } };

      const merged = mergeConfig(userConfig, callConfigHook(getNitroPlugin(sentrySolidStart()), userConfig) ?? {});

      expect((merged as ViteConfigWithNitro).nitro).toMatchObject({ preset: 'node-server' });
    });

    it('does not mutate the config object it is handed', () => {
      const userConfig: ViteConfigWithNitro = { nitro: {} };

      callConfigHook(getNitroPlugin(sentrySolidStart()), userConfig);

      expect(userConfig.nitro).toEqual({});
    });

    // `setupSentryNitroModule` writes into `modules` and `experimental`, which a shallow copy leaves
    // aliased to the user's objects.
    it('does not mutate nested config the user already had', () => {
      const userModules = [{ name: 'user-module' }];
      const userExperimental = { openAPI: true };
      const userConfig: ViteConfigWithNitro = {
        nitro: { modules: userModules, experimental: userExperimental },
      };

      callConfigHook(getNitroPlugin(sentrySolidStart()), userConfig);

      expect(userModules).toEqual([{ name: 'user-module' }]);
      expect(userExperimental).toEqual({ openAPI: true });
    });

    // Vite can call `config` more than once, e.g. across environments in a build.
    it('registers the Sentry module once even if the config hook runs twice', () => {
      const userConfig: ViteConfigWithNitro = { nitro: { modules: [{ name: 'user-module' }] } };
      const plugin = getNitroPlugin(sentrySolidStart());

      callConfigHook(plugin, userConfig);
      const second = callConfigHook(plugin, userConfig);

      const modules = (second?.nitro as { modules?: unknown[] } | undefined)?.modules ?? [];
      expect(modules.filter(m => (m as { name?: string }).name === 'sentry')).toHaveLength(1);
    });
  });
});
