import { afterEach, describe, expect, it, vi } from 'vitest';

const handleTunnelRequestSpy = vi.fn();
const getClientSpy = vi.fn();

vi.mock('@sentry/core', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    handleTunnelRequest: (...args: unknown[]) => handleTunnelRequestSpy(...args),
    getClient: (...args: unknown[]) => getClientSpy(...args),
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

  it('derives the allowed DSN from the active server Sentry client when allowedDsns is omitted', async () => {
    const request = new Request('http://localhost:3000/monitoring', { method: 'POST', body: 'envelope' });
    const response = new Response('ok', { status: 200 });

    getClientSpy.mockReturnValueOnce({
      getDsn: () => ({
        protocol: 'http',
        publicKey: 'public',
        pass: '',
        host: 'localhost',
        port: '3031',
        path: '',
        projectId: '1337',
      }),
    });
    handleTunnelRequestSpy.mockResolvedValueOnce(response);

    const route = createSentryTunnelRoute({});
    const result = await route.handlers.POST({ request });

    expect(handleTunnelRequestSpy).toHaveBeenCalledTimes(1);
    const [options] = handleTunnelRequestSpy.mock.calls[0]!;
    expect(options).toEqual({
      request,
      allowedDsns: ['http://public@localhost:3031/1337'],
    });
    expect(result).toBe(response);
  });

  it('returns 500 when allowedDsns is omitted and no active server Sentry client DSN exists', async () => {
    const request = new Request('http://localhost:3000/monitoring', { method: 'POST', body: 'envelope' });

    getClientSpy.mockReturnValueOnce(undefined);

    const route = createSentryTunnelRoute({});
    const result = await route.handlers.POST({ request });

    expect(handleTunnelRequestSpy).not.toHaveBeenCalled();
    expect(result.status).toBe(500);
    await expect(result.text()).resolves.toContain('Tunnel route requires Sentry server SDK initialized with a DSN');
  });
});
