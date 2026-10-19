import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getAstroTunnelOptions, makeTunnelOptionsVitePlugin } from '../src/integration/tunnel';
import { applyAstroTunnelOptions, TUNNEL_OPTIONS_GLOBAL } from '../src/tunnel';

const globalWithOptions = GLOBAL_OBJ as { __sentry_astro_tunnel_options?: unknown };

describe('getAstroTunnelOptions', () => {
  it('maps `base` and `trailingSlash: always` onto tunnel options', () => {
    expect(getAstroTunnelOptions({ base: '/docs/', trailingSlash: 'always' })).toEqual({
      basePath: '/docs',
      trailingSlash: true,
    });
    expect(getAstroTunnelOptions({ base: '/docs', trailingSlash: 'ignore' })).toEqual({ basePath: '/docs' });
  });

  it('returns nothing for the defaults', () => {
    expect(getAstroTunnelOptions({ base: '/', trailingSlash: 'ignore' })).toBeUndefined();
  });
});

describe('makeTunnelOptionsVitePlugin', () => {
  it('serves a module that sets the tunnel options global', () => {
    const plugin = makeTunnelOptionsVitePlugin({ basePath: '/docs' });
    const resolved = (plugin.resolveId as unknown as (id: string) => string | null)(
      'virtual:@sentry/astro/tunnel-options',
    );

    expect((plugin.load as unknown as (id: string) => string | null)(resolved!)).toBe(
      `globalThis[${JSON.stringify(TUNNEL_OPTIONS_GLOBAL)}] = {"basePath":"/docs"};`,
    );
  });
});

describe('applyAstroTunnelOptions', () => {
  afterEach(() => {
    delete globalWithOptions.__sentry_astro_tunnel_options;
  });

  it('adds the Astro routing options to the managed tunnel, letting user options win', () => {
    globalWithOptions.__sentry_astro_tunnel_options = { basePath: '/docs', trailingSlash: true };
    const fromTrue: Parameters<typeof applyAstroTunnelOptions>[0] = { tunnel: true };
    const fromOptions: Parameters<typeof applyAstroTunnelOptions>[0] = { tunnel: { basePath: '/other' } };

    applyAstroTunnelOptions(fromTrue);
    applyAstroTunnelOptions(fromOptions);

    expect(fromTrue.tunnel).toEqual({ basePath: '/docs', trailingSlash: true });
    expect(fromOptions.tunnel).toEqual({ basePath: '/other', trailingSlash: true });
  });

  it('serves a relative tunnel path with the Astro routing options too', () => {
    globalWithOptions.__sentry_astro_tunnel_options = { basePath: '/docs', trailingSlash: true };
    const options: Parameters<typeof applyAstroTunnelOptions>[0] = { tunnel: '/monitor' };

    applyAstroTunnelOptions(options);

    expect(options.tunnel).toEqual({ basePath: '/docs', trailingSlash: true, path: '/monitor' });
  });

  it('leaves URL tunnels and a disabled tunnel alone', () => {
    globalWithOptions.__sentry_astro_tunnel_options = { basePath: '/docs' };
    const url: Parameters<typeof applyAstroTunnelOptions>[0] = { tunnel: 'https://example.com/tunnel' };
    const off: Parameters<typeof applyAstroTunnelOptions>[0] = {};

    applyAstroTunnelOptions(url);
    applyAstroTunnelOptions(off);

    expect(url.tunnel).toBe('https://example.com/tunnel');
    expect(off.tunnel).toBeUndefined();
  });
});
