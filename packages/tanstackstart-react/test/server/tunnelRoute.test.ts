import { afterEach, describe, expect, it, vi } from 'vitest';

const handleTunnelRequestSpy = vi.fn();

vi.mock('@sentry/core', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    handleTunnelRequest: (...args: unknown[]) => handleTunnelRequestSpy(...args),
  };
});

const { createSentryTunnelRoute } = await import('../../src/server/tunnelRoute');

describe('createSentryTunnelRoute', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a server route config with only a POST handler', () => {
    const route = createSentryTunnelRoute({
      allowedDsns: ['https://public@o0.ingest.sentry.io/0'],
    });

    expect(Object.keys(route.handlers)).toEqual(['POST']);
    expect(route.handlers.POST).toBeTypeOf('function');
  });

  it('forwards the request and allowed DSNs to handleTunnelRequest', async () => {
    const request = new Request('http://localhost:3000/monitoring', { method: 'POST', body: 'envelope' });
    const allowedDsns = ['https://public@o0.ingest.sentry.io/0'];
    const response = new Response('ok', { status: 200 });

    handleTunnelRequestSpy.mockResolvedValueOnce(response);

    const route = createSentryTunnelRoute({ allowedDsns });
    const result = await route.handlers.POST({ request });

    expect(handleTunnelRequestSpy).toHaveBeenCalledTimes(1);
    const [options] = handleTunnelRequestSpy.mock.calls[0]!;
    expect(options).toEqual({
      request,
      allowedDsns,
    });
    expect(options.allowedDsns).toBe(allowedDsns);
    expect(result).toBe(response);
  });
});
