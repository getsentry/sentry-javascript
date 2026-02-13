import * as sentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentDurableObjectStorage } from '../src/instrumentations/instrumentDurableObjectStorage';

vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    startSpan: vi.fn((opts, callback) => callback()),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
  };
});

describe('instrumentDurableObjectStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('instruments get with single key', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.get('myKey');

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.get myKey',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'get',
            'db.cloudflare.durable_object.storage.key': 'myKey',
          }),
        },
        expect.any(Function),
      );

      expect(sentryCore.addBreadcrumb).toHaveBeenCalledWith({
        category: 'durable_object.storage',
        message: 'storage.get("myKey")',
        data: { method: 'get' },
      });
    });

    it('instruments get with array of keys', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.get(['key1', 'key2', 'key3']);

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.get (3 keys)',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'get',
            'db.cloudflare.durable_object.storage.key_count': 3,
          }),
        },
        expect.any(Function),
      );

      expect(sentryCore.addBreadcrumb).toHaveBeenCalledWith({
        category: 'durable_object.storage',
        message: 'storage.get([3 keys])',
        data: { method: 'get' },
      });
    });
  });

  describe('put', () => {
    it('instruments put with single key', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.put('myKey', 'myValue');

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.put myKey',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'put',
            'db.cloudflare.durable_object.storage.key': 'myKey',
          }),
        },
        expect.any(Function),
      );

      expect(sentryCore.addBreadcrumb).toHaveBeenCalledWith({
        category: 'durable_object.storage',
        message: 'storage.put("myKey", ...)',
        data: { method: 'put' },
      });
    });

    it('instruments put with object entries', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.put({ key1: 'val1', key2: 'val2' });

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.put (2 keys)',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'put',
            'db.cloudflare.durable_object.storage.key_count': 2,
          }),
        },
        expect.any(Function),
      );

      expect(sentryCore.addBreadcrumb).toHaveBeenCalledWith({
        category: 'durable_object.storage',
        message: 'storage.put({2 keys})',
        data: { method: 'put' },
      });
    });
  });

  describe('delete', () => {
    it('instruments delete with single key', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.delete('myKey');

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.delete myKey',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'delete',
            'db.cloudflare.durable_object.storage.key': 'myKey',
          }),
        },
        expect.any(Function),
      );
    });

    it('instruments delete with array of keys', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.delete(['key1', 'key2']);

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.delete (2 keys)',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'delete',
            'db.cloudflare.durable_object.storage.key_count': 2,
          }),
        },
        expect.any(Function),
      );
    });
  });

  describe('list', () => {
    it('instruments list', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.list();

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.list',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'list',
          }),
        },
        expect.any(Function),
      );
    });
  });

  describe('alarm methods', () => {
    it('instruments getAlarm', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.getAlarm();

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.getAlarm',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'getAlarm',
          }),
        },
        expect.any(Function),
      );
    });

    it('instruments setAlarm', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.setAlarm(Date.now() + 1000);

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.setAlarm',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'setAlarm',
          }),
        },
        expect.any(Function),
      );
    });

    it('stores span context on setAlarm for trace linking', async () => {
      const mockSpanContext = {
        traceId: 'abc123def456789012345678901234ab',
        spanId: '1234567890abcdef',
      };
      const mockSpan = {
        spanContext: vi.fn().mockReturnValue(mockSpanContext),
      };
      vi.mocked(sentryCore.getActiveSpan).mockReturnValue(mockSpan as any);

      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.setAlarm(Date.now() + 1000);

      // Verify that the span context was stored for future alarm trace linking
      expect(mockStorage.put).toHaveBeenCalledWith('__SENTRY_TRACE_LINK__alarm', {
        traceId: 'abc123def456789012345678901234ab',
        spanId: '1234567890abcdef',
      });
    });

    it('does not store span context on setAlarm when no active span', async () => {
      vi.mocked(sentryCore.getActiveSpan).mockReturnValue(undefined);

      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.setAlarm(Date.now() + 1000);

      // put should not have been called for trace link storage
      // (only setAlarm itself calls the original method)
      expect(mockStorage.put).not.toHaveBeenCalledWith(
        expect.stringContaining('__SENTRY_TRACE_LINK__'),
        expect.anything(),
      );
    });

    it('instruments deleteAlarm', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.deleteAlarm();

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.deleteAlarm',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'deleteAlarm',
          }),
        },
        expect.any(Function),
      );
    });
  });

  describe('other methods', () => {
    it('instruments deleteAll', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.deleteAll();

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.deleteAll',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'deleteAll',
          }),
        },
        expect.any(Function),
      );
    });

    it('instruments sync', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.sync();

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.sync',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'sync',
          }),
        },
        expect.any(Function),
      );
    });

    it('instruments transaction', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.transaction(async txn => {
        return txn;
      });

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object.storage.transaction',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'transaction',
          }),
        },
        expect.any(Function),
      );
    });
  });

  describe('non-instrumented methods', () => {
    it('does not instrument sql property', () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      // sql is a property, not a method we instrument
      expect(instrumented.sql).toBe(mockStorage.sql);
    });
  });

  describe('error handling', () => {
    it('adds breadcrumb even when operation throws', async () => {
      const mockStorage = createMockStorage();
      mockStorage.get = vi.fn().mockRejectedValue(new Error('Storage error'));
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await expect(instrumented.get('myKey')).rejects.toThrow('Storage error');

      expect(sentryCore.addBreadcrumb).toHaveBeenCalledWith({
        category: 'durable_object.storage',
        message: 'storage.get("myKey")',
        data: { method: 'get' },
      });
    });
  });
});

function createMockStorage(): any {
  return {
    get: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(false),
    list: vi.fn().mockResolvedValue(new Map()),
    getAlarm: vi.fn().mockResolvedValue(null),
    setAlarm: vi.fn().mockResolvedValue(undefined),
    deleteAlarm: vi.fn().mockResolvedValue(undefined),
    deleteAll: vi.fn().mockResolvedValue(undefined),
    sync: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn().mockImplementation(async (cb: () => unknown) => cb()),
    getCurrentBookmark: vi.fn().mockResolvedValue('bookmark'),
    getBookmarkForTime: vi.fn().mockResolvedValue('bookmark'),
    onNextSessionRestoreBookmark: vi.fn().mockResolvedValue('bookmark'),
    sql: {
      exec: vi.fn(),
    },
  };
}
