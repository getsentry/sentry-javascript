import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { applyNuxtTunnelBasePath, NUXT_TUNNEL_BASE_PATH_GLOBAL } from '../../src/common/tunnel';

const globalWithBasePath = GLOBAL_OBJ as { [NUXT_TUNNEL_BASE_PATH_GLOBAL]?: string };

describe('applyNuxtTunnelBasePath', () => {
  afterEach(() => {
    delete globalWithBasePath.__sentry_nuxt_base_path;
  });

  it('serves the managed tunnel under `app.baseURL`', () => {
    globalWithBasePath[NUXT_TUNNEL_BASE_PATH_GLOBAL] = '/app/';
    const options: Parameters<typeof applyNuxtTunnelBasePath>[0] = { tunnel: true };

    applyNuxtTunnelBasePath(options);

    expect(options.tunnel).toEqual({ basePath: '/app' });
  });

  it('keeps a base path the user set', () => {
    globalWithBasePath[NUXT_TUNNEL_BASE_PATH_GLOBAL] = '/app/';
    const options: Parameters<typeof applyNuxtTunnelBasePath>[0] = { tunnel: { basePath: '/custom' } };

    applyNuxtTunnelBasePath(options);

    expect(options.tunnel).toEqual({ basePath: '/custom' });
  });

  it('serves from the root for the default and relative base URLs', () => {
    for (const baseURL of ['/', './']) {
      globalWithBasePath[NUXT_TUNNEL_BASE_PATH_GLOBAL] = baseURL;
      const options: Parameters<typeof applyNuxtTunnelBasePath>[0] = { tunnel: true };

      applyNuxtTunnelBasePath(options);

      expect(options.tunnel).toBe(true);
    }
  });
});
