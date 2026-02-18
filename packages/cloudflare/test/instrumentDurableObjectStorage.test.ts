import * as sentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentDurableObjectStorage } from '../src/instrumentations/instrumentDurableObjectStorage';
import * as traceLinks from '../src/utils/traceLinks';

vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal<typeof sentryCore>();
  return {
    ...actual,
    startSpan: vi.fn((opts, callback) => callback()),
    getActiveSpan: vi.fn(),
  };
});

vi.mock('../src/utils/traceLinks', async importOriginal => {
  const actual = await importOriginal<typeof traceLinks>();
  return {
    ...actual,
    storeSpanContext: vi.fn().mockResolvedValue(undefined),
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
          name: 'durable_object_storage_get',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'get',
          }),
        },
        expect.any(Function),
      );
    });

    it('instruments get with array of keys', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.get(['key1', 'key2', 'key3']);

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object_storage_get',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'get',
          }),
        },
        expect.any(Function),
      );
    });
  });

  describe('put', () => {
    it('instruments put with single key', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.put('myKey', 'myValue');

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object_storage_put',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'put',
          }),
        },
        expect.any(Function),
      );
    });

    it('instruments put with object entries', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.put({ key1: 'val1', key2: 'val2' });

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object_storage_put',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'put',
          }),
        },
        expect.any(Function),
      );
    });
  });

  describe('delete', () => {
    it('instruments delete with single key', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.delete('myKey');

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object_storage_delete',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'delete',
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
          name: 'durable_object_storage_delete',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'delete',
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
          name: 'durable_object_storage_list',
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
    it('instruments setAlarm', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.setAlarm(Date.now() + 1000);

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object_storage_setAlarm',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'setAlarm',
          }),
        },
        expect.any(Function),
      );
    });

    it('stores span context when setAlarm is called', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.setAlarm(Date.now() + 1000);

      expect(traceLinks.storeSpanContext).toHaveBeenCalledWith(mockStorage, 'alarm');
    });

    it('instruments getAlarm', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.getAlarm();

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object_storage_getAlarm',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'getAlarm',
          }),
        },
        expect.any(Function),
      );
    });

    it('instruments deleteAlarm', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.deleteAlarm();

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        {
          name: 'durable_object_storage_deleteAlarm',
          op: 'db',
          attributes: expect.objectContaining({
            'db.operation.name': 'deleteAlarm',
          }),
        },
        expect.any(Function),
      );
    });
  });

  describe('non-instrumented methods', () => {
    it('does not instrument deleteAll, sync, transaction', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.deleteAll();
      await instrumented.sync();
      await instrumented.transaction(async txn => txn);

      expect(sentryCore.startSpan).not.toHaveBeenCalled();
    });

    it('does not instrument sql property', () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      // sql is a property, not a method we instrument
      expect(instrumented.sql).toBe(mockStorage.sql);
    });
  });

  describe('error handling', () => {
    it('propagates errors from storage operations', async () => {
      const mockStorage = createMockStorage();
      mockStorage.get = vi.fn().mockRejectedValue(new Error('Storage error'));
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await expect(instrumented.get('myKey')).rejects.toThrow('Storage error');
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
    sql: {
      exec: vi.fn(),
    },
  };
}
