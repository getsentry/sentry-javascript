import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTunnelBasePath, getBasePath, TUNNEL_BASE_PATH_GLOBAL } from '../../src/common/tunnel';

describe('getBasePath', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    (GLOBAL_OBJ as { [TUNNEL_BASE_PATH_GLOBAL]?: string })[TUNNEL_BASE_PATH_GLOBAL] = undefined;
  });

  it('prefers the defined base path over the global', () => {
    vi.stubGlobal('__SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__', '/app');
    (GLOBAL_OBJ as { [TUNNEL_BASE_PATH_GLOBAL]?: string })[TUNNEL_BASE_PATH_GLOBAL] = '/other';

    expect(getBasePath()).toBe('/app');
  });

  it('falls back to the global, then to no base path', () => {
    expect(getBasePath()).toBe('');

    (GLOBAL_OBJ as { [TUNNEL_BASE_PATH_GLOBAL]?: string })[TUNNEL_BASE_PATH_GLOBAL] = '/app';

    expect(getBasePath()).toBe('/app');
  });
});

describe('applyTunnelBasePath', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves the managed tunnel under the defined base path', () => {
    vi.stubGlobal('__SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__', '/app');
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
