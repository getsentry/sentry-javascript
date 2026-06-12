import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import * as sentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentDurableObjectSyncKvStorage } from '../src/instrumentations/instrumentDurableObjectSyncKvStorage';

vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal<typeof sentryCore>();
  return {
    ...actual,
    startSpan: vi.fn((opts, callback) => callback()),
  };
});

describe('instrumentDurableObjectSyncKvStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('instruments get with single key', () => {
      const mockKv = createMockSyncKv();
      const instrumented = instrumentDurableObjectSyncKvStorage(mockKv);

      instrumented.get('myKey');

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object_storage_kv_get',
          op: 'db',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object',
            'db.system.name': 'cloudflare-durable-object-sql',
            'db.operation.name': 'get',
          },
        },
        expect.any(Function),
      );
    });

    it('returns the value from the underlying storage', () => {
      const mockKv = createMockSyncKv();
      mockKv.get = vi.fn().mockReturnValue('storedValue');
      const instrumented = instrumentDurableObjectSyncKvStorage(mockKv);

      const result = instrumented.get('myKey');

      expect(result).toBe('storedValue');
    });

    it('returns undefined for missing keys', () => {
      const mockKv = createMockSyncKv();
      mockKv.get = vi.fn().mockReturnValue(undefined);
      const instrumented = instrumentDurableObjectSyncKvStorage(mockKv);

      const result = instrumented.get('missing');

      expect(result).toBeUndefined();
    });
  });

  describe('put', () => {
    it('instruments put', () => {
      const mockKv = createMockSyncKv();
      const instrumented = instrumentDurableObjectSyncKvStorage(mockKv);

      instrumented.put('myKey', 'myValue');

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object_storage_kv_put',
          op: 'db',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object',
            'db.system.name': 'cloudflare-durable-object-sql',
            'db.operation.name': 'put',
          },
        },
        expect.any(Function),
      );
    });

    it('calls the underlying put with correct args', () => {
      const mockKv = createMockSyncKv();
      const instrumented = instrumentDurableObjectSyncKvStorage(mockKv);

      instrumented.put('myKey', { nested: true });

      expect(mockKv.put).toHaveBeenCalledWith('myKey', { nested: true });
    });
  });

  describe('delete', () => {
    it('instruments delete', () => {
      const mockKv = createMockSyncKv();
      const instrumented = instrumentDurableObjectSyncKvStorage(mockKv);

      instrumented.delete('myKey');

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object_storage_kv_delete',
          op: 'db',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object',
            'db.system.name': 'cloudflare-durable-object-sql',
            'db.operation.name': 'delete',
          },
        },
        expect.any(Function),
      );
    });

    it('returns boolean from underlying delete', () => {
      const mockKv = createMockSyncKv();
      mockKv.delete = vi.fn().mockReturnValue(true);
      const instrumented = instrumentDurableObjectSyncKvStorage(mockKv);

      const result = instrumented.delete('myKey');

      expect(result).toBe(true);
    });
  });

  describe('list', () => {
    it('instruments list', () => {
      const mockKv = createMockSyncKv();
      const instrumented = instrumentDurableObjectSyncKvStorage(mockKv);

      instrumented.list();

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object_storage_kv_list',
          op: 'db',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object',
            'db.system.name': 'cloudflare-durable-object-sql',
            'db.operation.name': 'list',
          },
        },
        expect.any(Function),
      );
    });

    it('passes options through to underlying list', () => {
      const mockKv = createMockSyncKv();
      const instrumented = instrumentDurableObjectSyncKvStorage(mockKv);

      instrumented.list({ prefix: 'user:', limit: 10 });

      expect(mockKv.list).toHaveBeenCalledWith({ prefix: 'user:', limit: 10 });
    });

    it('returns the iterable from underlying list', () => {
      const entries: [string, string][] = [
        ['key1', 'val1'],
        ['key2', 'val2'],
      ];
      const mockKv = createMockSyncKv();
      mockKv.list = vi.fn().mockReturnValue(entries);
      const instrumented = instrumentDurableObjectSyncKvStorage(mockKv);

      const result = instrumented.list();

      expect(result).toBe(entries);
    });
  });

  describe('non-instrumented properties', () => {
    it('passes through unknown properties without instrumentation', () => {
      const mockKv = createMockSyncKv();
      (mockKv as any).customProp = 'custom-value';
      const instrumented = instrumentDurableObjectSyncKvStorage(mockKv);

      expect((instrumented as any).customProp).toBe('custom-value');
      expect(sentryCore.startSpan).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('propagates errors from sync KV operations', () => {
      const mockKv = createMockSyncKv();
      mockKv.get = vi.fn().mockImplementation(() => {
        throw new Error('Storage error');
      });
      const instrumented = instrumentDurableObjectSyncKvStorage(mockKv);

      expect(() => instrumented.get('myKey')).toThrow('Storage error');
    });
  });
});

function createMockSyncKv(): any {
  return {
    get: vi.fn().mockReturnValue(undefined),
    put: vi.fn().mockReturnValue(undefined),
    delete: vi.fn().mockReturnValue(false),
    list: vi.fn().mockReturnValue([]),
  };
}
