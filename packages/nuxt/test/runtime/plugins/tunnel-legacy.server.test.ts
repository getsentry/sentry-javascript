import { createApp, createRouter, defineWebSocketHandler } from 'h3';
import type { NitroApp, NitroAppPlugin } from 'nitropack';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import legacyTunnelPlugin from '../../../src/runtime/plugins/tunnel-legacy.server';

const { setTunnelDefaults, useRuntimeConfig } = vi.hoisted(() => ({
  setTunnelDefaults: vi.fn(),
  useRuntimeConfig: vi.fn(),
}));

vi.mock('@sentry/core/server', () => ({
  _INTERNAL_setTunnelDefaults: setTunnelDefaults,
}));

vi.mock('nitropack/runtime', () => ({ useRuntimeConfig }));

const tunnelPlugin: NitroAppPlugin = legacyTunnelPlugin;

describe('tunnel-legacy.server', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useRuntimeConfig.mockReturnValue({ app: { baseURL: '/base/' } });
  });

  it("serves the tunnel under the app's base URL", () => {
    tunnelPlugin({ h3App: createApp() } as unknown as NitroApp);

    expect(setTunnelDefaults).toHaveBeenCalledWith({ basePath: '/base/' });
  });

  it("keeps the app's WebSocket handlers resolvable", async () => {
    const app = createApp();
    const router = createRouter();
    const upgrade = vi.fn();
    router.use('/ws/:code', defineWebSocketHandler({ upgrade }));
    // Nitro mounts its router on the app base URL
    app.use('/', router.handler);

    tunnelPlugin({ h3App: app } as unknown as NitroApp);

    const hooks = await app.websocket.resolve!(new Request('http://localhost/ws/abc') as never);

    expect(hooks.upgrade).toBe(upgrade);
  });
});
