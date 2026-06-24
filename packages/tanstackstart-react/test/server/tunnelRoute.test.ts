import { afterEach, describe, expect, it, vi } from 'vitest';

const handleTunnelRequestSpy = vi.fn();
const getClientSpy = vi.fn();
const getActiveSpanSpy = vi.fn();
const getRootSpanSpy = vi.fn();

vi.mock('@sentry/core', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    handleTunnelRequest: (...args: unknown[]) => handleTunnelRequestSpy(...args),
    getClient: (...args: unknown[]) => getClientSpy(...args),
    getActiveSpan: (...args: unknown[]) => getActiveSpanSpy(...args),
    getRootSpan: (...args: unknown[]) => getRootSpanSpy(...args),
  };
});

const { createSentryTunnelRoute, registerSentryServerTunnelRoute, TUNNEL_ROUTE_DROP_TRANSACTION_ATTRIBUTE } =
  await import('../../src/server/tunnelRoute');

describe('createSentryTunnelRoute', () => {
  afterEach(() => {
    vi.resetAllMocks();
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
    const request = new Request('http://localhost:3000/derive-dsn', { method: 'POST', body: 'envelope' });
    const response = new Response('ok', { status: 200 });

    // `getClient` is called both by the path self-registration and the DSN derivation.
    getClientSpy.mockReturnValue({
      getOptions: () => ({}),
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

  it('marks the active root span to be dropped so the tunnel request is not captured as a transaction', async () => {
    const request = new Request('http://localhost:3000/monitoring', { method: 'POST', body: 'envelope' });
    const response = new Response('ok', { status: 200 });

    const setAttribute = vi.fn();
    const activeSpan = {};
    const rootSpan = { setAttribute };
    getActiveSpanSpy.mockReturnValueOnce(activeSpan);
    getRootSpanSpy.mockReturnValueOnce(rootSpan);
    handleTunnelRequestSpy.mockResolvedValueOnce(response);

    const route = createSentryTunnelRoute({ allowedDsns: ['https://public@o0.ingest.sentry.io/0'] });
    await route.handlers.POST({ request });

    expect(getRootSpanSpy).toHaveBeenCalledWith(activeSpan);
    expect(setAttribute).toHaveBeenCalledWith(TUNNEL_ROUTE_DROP_TRANSACTION_ATTRIBUTE, true);
  });

  it('self-registers the request path so the streamed-span sampler can drop it', async () => {
    const request = new Request('http://localhost:3000/handler-selfreg', { method: 'POST', body: 'envelope' });
    const options: { ignoreSpans?: unknown[] } = {};
    getClientSpy.mockReturnValue({ getOptions: () => options, getDsn: () => undefined });
    handleTunnelRequestSpy.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    await createSentryTunnelRoute({ allowedDsns: ['https://public@o0.ingest.sentry.io/0'] }).handlers.POST({ request });

    const matcher = options.ignoreSpans?.find(
      (entry): entry is { attributes: { 'http.target': RegExp } } =>
        !!(entry as { attributes?: { 'http.target'?: unknown } })?.attributes?.['http.target'],
    );
    expect(matcher?.attributes['http.target'].test('/handler-selfreg')).toBe(true);
  });

  it('does not throw when there is no active span', async () => {
    const request = new Request('http://localhost:3000/monitoring', { method: 'POST', body: 'envelope' });
    const response = new Response('ok', { status: 200 });

    getActiveSpanSpy.mockReturnValueOnce(undefined);
    handleTunnelRequestSpy.mockResolvedValueOnce(response);

    const route = createSentryTunnelRoute({ allowedDsns: ['https://public@o0.ingest.sentry.io/0'] });
    const result = await route.handlers.POST({ request });

    expect(getRootSpanSpy).not.toHaveBeenCalled();
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

describe('registerSentryServerTunnelRoute', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('adds an http.target ignoreSpans matcher for the tunnel route path so the transaction is dropped at span start', () => {
    const options: { ignoreSpans?: unknown[] } = { ignoreSpans: [/existing/] };
    getClientSpy.mockReturnValue({ getOptions: () => options });

    // Unique path per test to avoid the module-level dedupe Set across tests.
    registerSentryServerTunnelRoute('/abcd1234');

    expect(options.ignoreSpans).toHaveLength(2);
    const matcher = options.ignoreSpans?.[1] as { attributes: { 'http.target': RegExp } };
    const pattern = matcher.attributes['http.target'];

    expect(pattern.test('/abcd1234')).toBe(true);
    expect(pattern.test('/abcd1234?o=1&p=2')).toBe(true);
    expect(pattern.test('/abcd1234/')).toBe(true);
    // Must not match an unrelated route that merely shares the prefix.
    expect(pattern.test('/abcd1234extra')).toBe(false);
  });

  it('does not register the same tunnel route path twice', () => {
    const options: { ignoreSpans?: unknown[] } = {};
    getClientSpy.mockReturnValue({ getOptions: () => options });

    registerSentryServerTunnelRoute('/dedupe-me');
    registerSentryServerTunnelRoute('/dedupe-me');

    expect(options.ignoreSpans).toHaveLength(1);
  });

  it('is a no-op when there is no active client', () => {
    getClientSpy.mockReturnValue(undefined);

    expect(() => registerSentryServerTunnelRoute('/no-client')).not.toThrow();
  });
});
