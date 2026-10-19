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
    const options: Parameters<typeof applyTunnelBasePath>[0] = { tunnel: true };

    applyTunnelBasePath(options);

    expect(options.tunnel).toEqual({ basePath: '/app' });
  });

  it('leaves the tunnel alone without a base path', () => {
    const options: Parameters<typeof applyTunnelBasePath>[0] = { tunnel: true };

    applyTunnelBasePath(options);

    expect(options.tunnel).toBe(true);
  });
});
