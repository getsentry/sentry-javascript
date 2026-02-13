import { describe, expect, it, type Mocked, vi } from 'vitest';
import { instrumentContext } from '../src/utils/instrumentContext';

describe('instrumentContext', () => {
  describe.for([
    'waitUntil',
    'passThroughOnException',
    'acceptWebSocket',
    'blockConcurrencyWhile',
    'getWebSockets',
    'arbitraryMethod',
    'anythingElse',
  ])('%s', method => {
    it('Override without changing original', async () => {
      const context = {
        [method]: vi.fn(),
      } as any;
      const instrumented = instrumentContext(context);
      instrumented[method] = vi.fn();
      expect(context[method]).not.toBe(instrumented[method]);
    });

    it('Overridden method was called', async () => {
      const context = {
        [method]: vi.fn(),
      } as any;
      const instrumented = instrumentContext(context);
      const overridden = vi.fn();
      instrumented[method] = overridden;
      instrumented[method]();
      expect(overridden).toBeCalled();
      expect(context[method]).not.toBeCalled();
    });
  });

  it('No side effects', async () => {
    const context = makeExecutionContextMock();
    expect(() => instrumentContext(Object.freeze(context))).not.toThrow(
      /Cannot define property \w+, object is not extensible/,
    );
  });
  it('Respects symbols', async () => {
    const s = Symbol('test');
    const context = makeExecutionContextMock<ExecutionContext & { [s]: unknown }>();
    context[s] = {};
    const instrumented = instrumentContext(context);
    expect(instrumented[s]).toBe(context[s]);
  });

  describe('DurableObjectState storage instrumentation', () => {
    it('instruments storage property', () => {
      const mockStorage = createMockStorage();
      const context = makeDurableObjectStateMock(mockStorage);
      const instrumented = instrumentContext(context);

      // The storage property should be instrumented (wrapped)
      expect(instrumented.storage).toBeDefined();
      // The instrumented storage should not be the same reference
      expect(instrumented.storage).not.toBe(mockStorage);
    });

    it('exposes originalStorage as the uninstrumented storage', () => {
      const mockStorage = createMockStorage();
      const context = makeDurableObjectStateMock(mockStorage);
      const instrumented = instrumentContext(context) as any;

      // originalStorage should be the original uninstrumented storage
      expect(instrumented.originalStorage).toBe(mockStorage);
    });

    it('originalStorage is not enumerable', () => {
      const mockStorage = createMockStorage();
      const context = makeDurableObjectStateMock(mockStorage);
      const instrumented = instrumentContext(context);

      // originalStorage should not appear in Object.keys
      expect(Object.keys(instrumented)).not.toContain('originalStorage');
    });

    it('returns instrumented storage lazily', () => {
      const mockStorage = createMockStorage();
      const context = makeDurableObjectStateMock(mockStorage);
      const instrumented = instrumentContext(context);

      // Access storage twice to ensure memoization
      const storage1 = instrumented.storage;
      const storage2 = instrumented.storage;

      expect(storage1).toBe(storage2);
    });

    it('handles context without storage property', () => {
      const context = makeExecutionContextMock();
      const instrumented = instrumentContext(context) as any;

      // Should not have originalStorage if no storage property
      expect(instrumented.originalStorage).toBeUndefined();
    });
  });
});

function makeExecutionContextMock<T extends ExecutionContext>() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as Mocked<T>;
}

function makeDurableObjectStateMock(storage?: any) {
  return {
    waitUntil: vi.fn(),
    blockConcurrencyWhile: vi.fn(),
    id: { toString: () => 'test-id', equals: vi.fn(), name: 'test' },
    storage: storage || createMockStorage(),
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn().mockReturnValue([]),
    setWebSocketAutoResponse: vi.fn(),
    getWebSocketAutoResponse: vi.fn(),
    getWebSocketAutoResponseTimestamp: vi.fn(),
    setHibernatableWebSocketEventTimeout: vi.fn(),
    getHibernatableWebSocketEventTimeout: vi.fn(),
    getTags: vi.fn().mockReturnValue([]),
    abort: vi.fn(),
  } as any;
}

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
