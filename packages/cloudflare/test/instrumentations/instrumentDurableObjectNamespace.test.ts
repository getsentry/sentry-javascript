import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentDurableObjectNamespace } from '../../src/instrumentations/instrumentDurableObjectNamespace';

describe('instrumentDurableObjectNamespace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const { namespace, mockStub } = createMockNamespace();
      const instrumented = instrumentDurableObjectNamespace(namespace);

      const mockId = { toString: () => 'test-id', equals: () => false };
      const stub = instrumented.get(mockId as any);

      const request = new Request('https://example.com/api/data');
      await (stub as any).fetch(request);

      expect(mockStub.fetch).toHaveBeenCalledWith(request, expect.any(Object));
    });

    it('propagates trace headers on stub.fetch', async () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
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
