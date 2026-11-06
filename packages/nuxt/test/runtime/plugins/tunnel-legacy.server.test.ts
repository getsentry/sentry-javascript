import { createApp, createRouter, defineWebSocketHandler, eventHandler, toWebHandler } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import tunnelPlugin from '../../../src/runtime/plugins/tunnel-legacy.server';

const { handleServedTunnelRequest, isServedTunnelRequest } = vi.hoisted(() => ({
  handleServedTunnelRequest: vi.fn(),
  isServedTunnelRequest: vi.fn(),
}));

vi.mock('@sentry/core/server', () => ({
  _INTERNAL_handleServedTunnelRequest: handleServedTunnelRequest,
  _INTERNAL_isServedTunnelRequest: isServedTunnelRequest,
  _INTERNAL_setManagedTunnelDefaults: vi.fn(),
}));

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: () => ({ app: { baseURL: '/' } }),
}));

function setupApp() {
  const app = createApp();
  const router = createRouter();
  const upgrade = vi.fn();
  router.use('/ws/:code', defineWebSocketHandler({ upgrade }));
  router.get(
    '/hello',
    eventHandler(() => 'hello'),
  );
  // Nitro mounts its router on the app base URL
  app.use('/', router.handler);

  tunnelPlugin({ h3App: app } as unknown as Parameters<typeof tunnelPlugin>[0]);

  return { app, upgrade };
}

describe('tunnel-legacy.server', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    isServedTunnelRequest.mockImplementation(({ url }: { url: string }) => url === '/tunnel');
    handleServedTunnelRequest.mockResolvedValue(new Response('tunneled'));
  });

  it("keeps the app's WebSocket handlers resolvable", async () => {
    const { app, upgrade } = setupApp();

    const hooks = await app.websocket.resolve!(new Request('http://localhost/ws/abc') as never);

    expect(hooks.upgrade).toBe(upgrade);
  });

  it('answers tunnel requests', async () => {
    const { app } = setupApp();

    const response = await toWebHandler(app)(new Request('http://localhost/tunnel', { method: 'POST', body: '{}' }));

    expect(await response.text()).toBe('tunneled');
    expect(handleServedTunnelRequest).toHaveBeenCalledTimes(1);
  });

  it('hands other requests to the next layer', async () => {
    const { app } = setupApp();

    const response = await toWebHandler(app)(new Request('http://localhost/hello'));

    expect(await response.text()).toBe('hello');
    expect(handleServedTunnelRequest).not.toHaveBeenCalled();
  });
});
