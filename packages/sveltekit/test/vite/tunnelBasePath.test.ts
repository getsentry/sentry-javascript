import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import type { ResolvedKitConfig } from '../../src/vite/kitConfig';
import { makeTunnelBasePathPlugin } from '../../src/vite/tunnelBasePath';

type Hook = (...args: unknown[]) => unknown;

async function setup(kitConfig: ResolvedKitConfig): Promise<Plugin> {
  const plugin = makeTunnelBasePathPlugin(() => Promise.resolve(kitConfig));
  await (plugin.configResolved as Hook)({});

  return plugin;
}

describe('makeTunnelBasePathPlugin', () => {
  it('imports the base path first in the hooks and instrumentation files', async () => {
    const plugin = await setup({ paths: { base: '/app' } });
    const transform = plugin.transform as Hook;

    for (const id of ['/p/src/hooks.server.ts', '/p/src/hooks.client.js', '/p/src/instrumentation.server.ts']) {
      expect(transform('const a = 1;', id)).toEqual({
        code: `import ${JSON.stringify('\0sentry-sveltekit-tunnel-base-path')};\nconst a = 1;`,
        map: expect.objectContaining({ mappings: expect.any(String) }),
      });
    }
    expect(transform('const a = 1;', '/p/src/routes/+page.svelte')).toBeNull();
    expect((plugin.load as Hook)('\0sentry-sveltekit-tunnel-base-path')).toBe(
      'globalThis["__sentry_sveltekit_base_path"] = "/app";',
    );
  });

  it('follows custom hooks file locations', async () => {
    const plugin = await setup({ paths: { base: '/app' }, files: { hooks: { server: 'src/server/hooks' } } });

    expect((plugin.transform as Hook)('', '/p/src/server/hooks.ts')).not.toBeNull();
    expect((plugin.transform as Hook)('', '/p/src/hooks.server.ts')).toBeNull();
  });

  it('does nothing without a base path', async () => {
    const plugin = await setup({});

    expect((plugin.transform as Hook)('', '/p/src/hooks.server.ts')).toBeNull();
  });
});
