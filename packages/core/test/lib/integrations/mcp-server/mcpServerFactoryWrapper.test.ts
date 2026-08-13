import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../../../src/currentScopes';
import * as exports from '../../../../src/exports';
import { wrapMcpServerFactoryWithSentry } from '../../../../src/integrations/mcp-server';
import { createMockClient, createMockMcpServer } from './testUtils';

describe('wrapMcpServerFactoryWithSentry', () => {
  const getClientSpy = vi.spyOn(currentScopes, 'getClient');
  const captureExceptionSpy = vi.spyOn(exports, 'captureException');

  beforeEach(() => {
    vi.clearAllMocks();
    getClientSpy.mockReturnValue(createMockClient(true));
  });

  it('preserves arguments, this, and the server identity for synchronous factories', () => {
    const server = createMockMcpServer();
    const originalConnect = server.connect;
    const context = { prefix: 'tenant' };
    const factory = vi.fn(function (this: typeof context, tenant: string, era: 'legacy' | 'modern') {
      expect(this).toBe(context);
      expect(tenant).toBe('acme');
      expect(era).toBe('modern');
      return server;
    });
    const wrappedFactory = wrapMcpServerFactoryWithSentry(factory);

    const result = wrappedFactory.call(context, 'acme', 'modern');

    expect(result).toBe(server);
    expect(result.connect).not.toBe(originalConnect);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('instruments every server produced by a synchronous factory', () => {
    const firstServer = createMockMcpServer();
    const secondServer = createMockMcpServer();
    const firstConnect = firstServer.connect;
    const secondConnect = secondServer.connect;
    const factory = vi.fn().mockReturnValueOnce(firstServer).mockReturnValueOnce(secondServer);
    const wrappedFactory = wrapMcpServerFactoryWithSentry(factory);

    const firstResult = wrappedFactory();
    const secondResult = wrappedFactory();

    expect(firstResult).toBe(firstServer);
    expect(firstResult.connect).not.toBe(firstConnect);
    expect(secondResult).toBe(secondServer);
    expect(secondResult.connect).not.toBe(secondConnect);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('rethrows the exact error from synchronous factories', () => {
    const factoryError = new Error('factory failed');
    const factory = vi.fn(() => {
      throw factoryError;
    });
    const wrappedFactory = wrapMcpServerFactoryWithSentry(factory);

    expect(() => wrappedFactory()).toThrow(factoryError);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(factoryError, {
      mechanism: {
        type: 'auto.ai.mcp_server',
        handled: false,
        data: { error_type: 'protocol', method_name: 'server_factory' },
      },
    });
  });

  it('preserves arguments, this, and the server identity for asynchronous factories', async () => {
    const server = createMockMcpServer();
    const originalConnect = server.connect;
    const context = { prefix: 'tenant' };
    const factory = vi.fn(async function (this: typeof context, tenant: string, era: 'legacy' | 'modern') {
      expect(this).toBe(context);
      expect(tenant).toBe('acme');
      expect(era).toBe('modern');
      return server;
    });
    const wrappedFactory = wrapMcpServerFactoryWithSentry(factory);

    const result = await wrappedFactory.call(context, 'acme', 'modern');

    expect(result).toBe(server);
    expect(result.connect).not.toBe(originalConnect);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('rejects with the exact reason from asynchronous factories', async () => {
    const factoryError = new Error('async factory failed');
    const factory = vi.fn(() => Promise.reject(factoryError));
    const wrappedFactory = wrapMcpServerFactoryWithSentry(factory);

    await expect(wrappedFactory()).rejects.toBe(factoryError);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(factoryError, {
      mechanism: {
        type: 'auto.ai.mcp_server',
        handled: false,
        data: { error_type: 'protocol', method_name: 'server_factory' },
      },
    });
  });

  it('returns invalid factory products unchanged', async () => {
    const invalidServer = { connect: vi.fn() };
    const syncFactory = wrapMcpServerFactoryWithSentry(() => invalidServer);
    const asyncFactory = wrapMcpServerFactoryWithSentry(async () => invalidServer);

    const syncResult = syncFactory();
    const asyncResult = await asyncFactory();

    expect(syncResult).toBe(invalidServer);
    expect(asyncResult).toBe(invalidServer);
  });
});
