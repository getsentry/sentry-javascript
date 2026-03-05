import * as sentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentDurableObjectStorage } from '../src/instrumentations/instrumentDurableObjectStorage';

vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    startSpan: vi.fn((opts, callback) => callback()),
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

  describe('non-instrumented methods', () => {
    it('does not instrument alarm methods', async () => {
      const mockStorage = createMockStorage();
      const instrumented = instrumentDurableObjectStorage(mockStorage);

      await instrumented.getAlarm();
      await instrumented.setAlarm(Date.now() + 1000);
      await instrumented.deleteAlarm();

      expect(sentryCore.startSpan).not.toHaveBeenCalled();
    });

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

  describe('native getter preservation (sql)', () => {
    it('preserves native getter `this` binding for sql accessor', () => {
      // Simulates workerd's native DurableObjectStorage where `sql` is a
      // getter that validates `this` via internal slots (brand check).
      // Using a private field as the closest JS equivalent of a native
      // internal slot check — accessing `#sqlInstance` on the wrong `this`
      // throws a TypeError, just like workerd's "Illegal invocation".
      const storage = createBrandCheckedStorage();
      const instrumented = instrumentDurableObjectStorage(storage as any);

      // Before fix: this threw "Cannot read private member #sqlInstance
      // from an object whose class did not declare it" (equivalent of
      // workerd's "Illegal invocation: function called with incorrect
      // `this` reference")
      expect(() => (instrumented as any).sql).not.toThrow();
      expect((instrumented as any).sql).toBeDefined();
      expect((instrumented as any).sql.exec).toBeDefined();
    });

    it('sql.exec works through the instrumented proxy', () => {
      const storage = createBrandCheckedStorage();
      const instrumented = instrumentDurableObjectStorage(storage as any);

      const result = (instrumented as any).sql.exec('SELECT 1');
      expect(result).toEqual({ query: 'SELECT 1' });
    });

    it('non-instrumented methods preserve native `this` binding', () => {
      const storage = createBrandCheckedStorage();
      const instrumented = instrumentDurableObjectStorage(storage as any);

      expect(() => (instrumented as any).getAlarm()).not.toThrow();
    });

    it('instrumented methods preserve native `this` binding and create spans', async () => {
      const storage = createBrandCheckedStorage();
      const instrumented = instrumentDurableObjectStorage(storage as any);

      // put/get are in STORAGE_METHODS_TO_INSTRUMENT — they go through
      // the startSpan + .apply(target, args) path, not the .bind(target) path.
      // BrandCheckedStorage uses #data private field, so wrong `this` would throw.
      await instrumented.put('key', 'value');
      await expect(instrumented.get('key')).resolves.toBe('value');

      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'durable_object_storage_put' }),
        expect.any(Function),
      );
      expect(sentryCore.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'durable_object_storage_get' }),
        expect.any(Function),
      );
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

/**
 * Creates a storage mock that uses a class with private fields to simulate
 * workerd's native brand-checked getters. Private field access throws a
 * TypeError when `this` is not the original instance, mimicking the
 * "Illegal invocation" error from workerd native accessors.
 */
class BrandCheckedStorage {
  #sqlInstance = { exec: (query: string) => ({ query }) };
  #data = new Map<string, unknown>();

  get sql() {
    // Accessing #sqlInstance implicitly checks that `this` is a real
    // BrandCheckedStorage instance. If `this` is a Proxy with wrong
    // receiver, this throws TypeError.
    return this.#sqlInstance;
  }

  async get(key: string) {
    return this.#data.get(key);
  }
  async put(key: string, value: unknown) {
    this.#data.set(key, value);
  }
  async delete(key: string) {
    return this.#data.delete(key);
  }
  async list() {
    return new Map(this.#data);
  }
  async getAlarm() {
    return null;
  }
  async setAlarm(_scheduledTime: number) {}
  async deleteAlarm() {}
  async deleteAll() {
    this.#data.clear();
  }
  async sync() {}
  async transaction(cb: (txn: unknown) => unknown) {
    return cb(this);
  }
}

function createBrandCheckedStorage() {
  return new BrandCheckedStorage();
}
