import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { applyTunnelBasePath, TUNNEL_BASE_PATH_GLOBAL } from '../../src/common/tunnel';

const globalWithBasePath = GLOBAL_OBJ as { [TUNNEL_BASE_PATH_GLOBAL]?: string };

describe('applyTunnelBasePath', () => {
  afterEach(() => {
    delete globalWithBasePath.__sentry_sveltekit_base_path;
  });

  it('adds the injected base path to the managed tunnel', () => {
    globalWithBasePath[TUNNEL_BASE_PATH_GLOBAL] = '/app';
    const fromTrue: Parameters<typeof applyTunnelBasePath>[0] = { tunnel: true };
    const fromOptions: Parameters<typeof applyTunnelBasePath>[0] = { tunnel: { allowedDsns: ['dsn'] } };

    applyTunnelBasePath(fromTrue);
    applyTunnelBasePath(fromOptions);

    expect(fromTrue.tunnel).toEqual({ basePath: '/app' });
    expect(fromOptions.tunnel).toEqual({ basePath: '/app', allowedDsns: ['dsn'] });
  });

  it('keeps a base path the user set', () => {
    globalWithBasePath[TUNNEL_BASE_PATH_GLOBAL] = '/app';
    const options: Parameters<typeof applyTunnelBasePath>[0] = { tunnel: { basePath: '/other' } };

    applyTunnelBasePath(options);

    expect(options.tunnel).toEqual({ basePath: '/other' });
  });

  it('serves a relative tunnel path under the base path too', () => {
    globalWithBasePath[TUNNEL_BASE_PATH_GLOBAL] = '/app';
    const options: Parameters<typeof applyTunnelBasePath>[0] = { tunnel: '/monitor' };

    applyTunnelBasePath(options);

    expect(options.tunnel).toEqual({ basePath: '/app', path: '/monitor' });
  });

  it('leaves URL tunnels, a disabled tunnel, and apps without a base path alone', () => {
    globalWithBasePath[TUNNEL_BASE_PATH_GLOBAL] = '/app';
    const url: Parameters<typeof applyTunnelBasePath>[0] = { tunnel: 'https://example.com/tunnel' };
    const off: Parameters<typeof applyTunnelBasePath>[0] = {};
    applyTunnelBasePath(url);
    applyTunnelBasePath(off);

    delete globalWithBasePath.__sentry_sveltekit_base_path;
    const noBase: Parameters<typeof applyTunnelBasePath>[0] = { tunnel: true };
    applyTunnelBasePath(noBase);

    expect(url.tunnel).toBe('https://example.com/tunnel');
    expect(off.tunnel).toBeUndefined();
    expect(noBase.tunnel).toBe(true);
  });
});
