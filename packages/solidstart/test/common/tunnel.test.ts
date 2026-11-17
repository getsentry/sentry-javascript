import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTunnelBasePath } from '../../src/common/tunnel';

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
