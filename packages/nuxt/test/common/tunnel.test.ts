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

  it('serves from the root for the default base URL', () => {
    globalWithBasePath[NUXT_TUNNEL_BASE_PATH_GLOBAL] = '/';
    const options: Parameters<typeof applyNuxtTunnelBasePath>[0] = { tunnel: true };

    applyNuxtTunnelBasePath(options);

    expect(options.tunnel).toBe(true);
  });
});
