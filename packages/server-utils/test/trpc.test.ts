import * as sentryCore from '@sentry/core';
import { type Client, setCurrentClient, type Span } from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { trpcMiddleware } from '../src/trpc';
import { getDefaultTestClientOptions, TestClient } from './mocks/client';

describe('trpcMiddleware', () => {
  let client: Client;

  const mockClient = {
    getOptions: vi.fn().mockReturnValue({
      normalizeDepth: 3,
      sendDefaultPii: false,
    }),
    // trpc.ts only reads `httpBodies`; a minimal mock is enough here.
    getDataCollectionOptions: vi.fn().mockReturnValue({ httpBodies: [] }),
    captureException: vi.fn(),
  } as unknown as Client;

  const mockSpan = {
    end: vi.fn(),
  } as unknown as Span;

  const mockScope = {
    setContext: vi.fn(),
    setTag: vi.fn(),
    setExtra: vi.fn(),
  };

  const withIsolationScope = vi.fn(callback => {
    return callback(mockScope);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1 });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
    vi.spyOn(sentryCore, 'getClient').mockReturnValue(mockClient);
    vi.spyOn(sentryCore, 'startSpanManual').mockImplementation((_name, callback) => callback(mockSpan, () => {}));
    vi.spyOn(sentryCore, 'withIsolationScope').mockImplementation(withIsolationScope);
    vi.spyOn(sentryCore, 'captureException').mockImplementation(() => 'mock-event-id');
  });

  test('creates span with correct attributes', async () => {
    const middleware = trpcMiddleware();
    const next = vi.fn().mockResolvedValue({ ok: true });

    await middleware({
      path: 'test.procedure',
      type: 'query',
      next,
    });

    expect(sentryCore.startSpanManual).toHaveBeenCalledWith(
      {
        name: 'trpc/test.procedure',
        op: 'rpc.server',
        attributes: {
          'sentry.origin': 'auto.rpc.trpc',
          'sentry.source': 'route',
        },
        forceTransaction: false,
      },
      expect.any(Function),
    );
  });

  test('captures error when next() returns error result', async () => {
    const middleware = trpcMiddleware();
    const error = new Error('Test error');
    const next = vi.fn().mockResolvedValue({ ok: false, error });

    await middleware({
      path: 'test.procedure',
      type: 'query',
      next,
    });

    expect(sentryCore.captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.rpc.trpc.middleware' },
    });
  });

  test('sets correct context data with rpc input', async () => {
    const middleware = trpcMiddleware({ attachRpcInput: true });
    const next = vi.fn().mockResolvedValue({ ok: true });
    const input = { foo: 'bar' };

    await middleware({
      path: 'test.procedure',
      type: 'query',
      next,
      rawInput: input,
    });

    expect(mockScope.setContext).toHaveBeenCalledWith('trpc', {
      procedure_path: 'test.procedure',
      procedure_type: 'query',
      input: { foo: 'bar' },
    });
  });

  test('handles thrown errors', async () => {
    const middleware = trpcMiddleware();
    const error = new Error('Test error');
    const next = vi.fn().mockRejectedValue(error);

    await expect(
      middleware({
        path: 'test.procedure',
        type: 'query',
        next,
      }),
    ).rejects.toThrow(error);

    expect(sentryCore.captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.rpc.trpc.middleware' },
    });
  });

  test('respects forceTransaction option', async () => {
    const middleware = trpcMiddleware({ forceTransaction: true });
    const next = vi.fn().mockResolvedValue({ ok: true });

    await middleware({
      path: 'test.procedure',
      type: 'query',
      next,
    });

    expect(sentryCore.startSpanManual).toHaveBeenCalledWith(
      expect.objectContaining({
        forceTransaction: true,
      }),
      expect.any(Function),
    );
  });
});
