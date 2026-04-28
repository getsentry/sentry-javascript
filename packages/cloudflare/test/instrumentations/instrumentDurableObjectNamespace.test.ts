import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentDurableObjectNamespace } from '../../src/instrumentations/instrumentDurableObjectNamespace';

const { getTraceDataMock } = vi.hoisted(() => ({
  getTraceDataMock: vi.fn(),
}));

/**
 * `_INTERNAL_getTracingHeadersForFetchRequest` imports `getTraceData` from this module, not from the
 * `@sentry/core` barrel — spying on `SentryCore.getTraceData` does not affect it.
 */
vi.mock('../../../core/build/esm/utils/traceData.js', () => ({
  getTraceData: getTraceDataMock,
}));
vi.mock('../../../core/build/cjs/utils/traceData.js', () => ({
  getTraceData: getTraceDataMock,
}));

describe('instrumentDurableObjectNamespace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTraceDataMock.mockReturnValue({});
  });

  function createMockNamespace() {
    const mockStub = {
      id: { toString: () => 'mock-id', equals: () => false, name: 'test' },
      name: 'test-name',
      fetch: vi.fn().mockResolvedValue(new Response('ok')),
    };

    return {
      namespace: {
        idFromName: vi.fn().mockReturnValue({ toString: () => 'id-from-name', equals: () => false, name: 'test' }),
        idFromString: vi.fn().mockReturnValue({ toString: () => 'id-from-string', equals: () => false }),
        newUniqueId: vi.fn().mockReturnValue({ toString: () => 'unique-id', equals: () => false }),
        get: vi.fn().mockReturnValue(mockStub),
        getByName: vi.fn().mockReturnValue(mockStub),
        jurisdiction: vi.fn(),
      },
      mockStub,
    };
  }

  describe('idFromName', () => {
    it('delegates to original', () => {
      const { namespace } = createMockNamespace();
      const instrumented = instrumentDurableObjectNamespace(namespace);

      const result = instrumented.idFromName('global-counter');

      expect(namespace.idFromName).toHaveBeenCalledWith('global-counter');
      expect(result).toEqual({ toString: expect.any(Function), equals: expect.any(Function), name: 'test' });
    });
  });

  describe('idFromString', () => {
    it('delegates to original', () => {
      const { namespace } = createMockNamespace();
      const instrumented = instrumentDurableObjectNamespace(namespace);

      instrumented.idFromString('some-hex-id');

      expect(namespace.idFromString).toHaveBeenCalledWith('some-hex-id');
    });
  });

  describe('newUniqueId', () => {
    it('delegates to original', () => {
      const { namespace } = createMockNamespace();
      const instrumented = instrumentDurableObjectNamespace(namespace);

      instrumented.newUniqueId();

      expect(namespace.newUniqueId).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('delegates to original', () => {
      const { namespace } = createMockNamespace();
      const instrumented = instrumentDurableObjectNamespace(namespace);

      const mockId = { toString: () => 'test-id', equals: () => false };
      instrumented.get(mockId as any);

      expect(namespace.get).toHaveBeenCalledWith(mockId);
    });

    it('returns an instrumented stub', async () => {
      const { namespace, mockStub } = createMockNamespace();
      const instrumented = instrumentDurableObjectNamespace(namespace);

      const mockId = { toString: () => 'test-id', equals: () => false };
      const stub = instrumented.get(mockId as any);

      await (stub as any).fetch('https://example.com/path');

      expect(mockStub.fetch).toHaveBeenCalledWith('https://example.com/path', expect.any(Object));
    });
  });

  describe('getByName', () => {
    it('delegates to original', () => {
      const { namespace } = createMockNamespace();
      const instrumented = instrumentDurableObjectNamespace(namespace);

      instrumented.getByName('my-counter');

      expect(namespace.getByName).toHaveBeenCalledWith('my-counter');
    });
  });

  describe('stub instrumentation', () => {
    it('calls stub.fetch with URL object', async () => {
      const { namespace, mockStub } = createMockNamespace();
      const instrumented = instrumentDurableObjectNamespace(namespace);

      const mockId = { toString: () => 'test-id', equals: () => false };
      const stub = instrumented.get(mockId as any);

      const url = new URL('https://example.com/api/test');
      await (stub as any).fetch(url);

      expect(mockStub.fetch).toHaveBeenCalledWith(url, expect.any(Object));
    });

    it('calls stub.fetch with Request object', async () => {
      getTraceDataMock.mockReturnValue({});

      const { namespace, mockStub } = createMockNamespace();
      const instrumented = instrumentDurableObjectNamespace(namespace);

      const mockId = { toString: () => 'test-id', equals: () => false };
      const stub = instrumented.get(mockId as any);

      const request = new Request('https://example.com/api/data');
      await (stub as any).fetch(request);

      // When there are no trace headers and input is a Request, instrumentFetcher
      // passes the request through without an init object.
      expect(mockStub.fetch).toHaveBeenCalled();
      const [passedRequest, passedInit] = mockStub.fetch.mock.calls[0]!;
      expect(passedRequest).toBe(request);
      expect(passedInit).toBeUndefined();
    });

    it('propagates trace headers on stub.fetch', async () => {
      getTraceDataMock.mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });

      const { namespace, mockStub } = createMockNamespace();
      const instrumented = instrumentDurableObjectNamespace(namespace);

      const mockId = { toString: () => 'test-id', equals: () => false };
      const stub = instrumented.get(mockId as any);

      await (stub as any).fetch('https://example.com/api');

      const [, init] = mockStub.fetch.mock.calls[0]!;
      const headers = new Headers(init?.headers);
      expect(headers.get('sentry-trace')).toBe('12345678901234567890123456789012-1234567890123456-1');
      expect(headers.get('baggage')).toBe('sentry-environment=production');
    });

    it('passes non-fetch properties through', () => {
      const { namespace, mockStub } = createMockNamespace();
      const instrumented = instrumentDurableObjectNamespace(namespace);

      const mockId = { toString: () => 'test-id', equals: () => false };
      const stub = instrumented.get(mockId as any);

      expect((stub as any).id).toBe(mockStub.id);
      expect((stub as any).name).toBe(mockStub.name);
    });
  });

  describe('RPC method instrumentation', () => {
    it('injects Sentry RPC meta into RPC method calls', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });

      const rpcMethod = vi.fn().mockReturnValue('rpc-result');
      const { namespace: originalNamespace } = createMockNamespace();
      const namespace = {
        ...originalNamespace,
        get: vi.fn().mockReturnValue({
          id: { toString: () => 'mock-id', equals: () => false, name: 'test' },
          fetch: vi.fn(),
          myRpcMethod: rpcMethod,
        }),
      };
      const instrumented = instrumentDurableObjectNamespace(namespace);

      const stub = instrumented.get({ toString: () => 'id', equals: () => false } as any);
      (stub as any).myRpcMethod('arg1', 42);

      expect(rpcMethod).toHaveBeenCalledWith('arg1', 42, {
        __sentry_rpc_meta__: {
          'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
          baggage: 'sentry-environment=production',
        },
      });
    });

    it('does not inject meta when no active trace', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({});

      const rpcMethod = vi.fn().mockReturnValue('result');
      const { namespace: originalNamespace } = createMockNamespace();
      const namespace = {
        ...originalNamespace,
        get: vi.fn().mockReturnValue({
          id: { toString: () => 'mock-id', equals: () => false, name: 'test' },
          fetch: vi.fn(),
          myRpcMethod: rpcMethod,
        }),
      };
      const instrumented = instrumentDurableObjectNamespace(namespace);

      const stub = instrumented.get({ toString: () => 'id', equals: () => false } as any);
      (stub as any).myRpcMethod('arg1');

      expect(rpcMethod).toHaveBeenCalledWith('arg1');
    });

    it('does not wrap built-in stub methods (connect, dup)', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': 'abc-def-1',
      });

      const connectFn = vi.fn();
      const dupFn = vi.fn();
      const { namespace: originalNamespace } = createMockNamespace();
      const namespace = {
        ...originalNamespace,
        get: vi.fn().mockReturnValue({
          id: { toString: () => 'mock-id', equals: () => false, name: 'test' },
          fetch: vi.fn(),
          connect: connectFn,
          dup: dupFn,
        }),
      };
      const instrumented = instrumentDurableObjectNamespace(namespace);

      const stub = instrumented.get({ toString: () => 'id', equals: () => false } as any);

      // connect and dup should be the original functions, not wrapped
      expect((stub as any).connect).toBe(connectFn);
      expect((stub as any).dup).toBe(dupFn);
    });
  });

  describe('non-function properties', () => {
    it('returns non-function properties unchanged', () => {
      const { namespace: originalNamespace } = createMockNamespace();
      const namespace = {
        ...originalNamespace,
        someProperty: 'value',
      };
      const instrumented = instrumentDurableObjectNamespace(namespace);

      expect((instrumented as any).someProperty).toBe('value');
    });
  });
});
