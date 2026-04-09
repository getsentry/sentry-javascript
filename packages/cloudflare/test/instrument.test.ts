import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getInstrumented, markAsInstrumented } from '../src/instrument';

// Clean up the global WeakMap between tests to avoid cross-test pollution
const GLOBAL_KEY = '__SENTRY_INSTRUMENTED_MAP__' as const;

describe('instrument', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
  });

  describe('markAsInstrumented', () => {
    it('marks an object with itself when no instrumented version is provided', () => {
      const obj = { name: 'test' };
      markAsInstrumented(obj);

      expect(getInstrumented(obj)).toBe(obj);
    });

    it('stores original -> instrumented mapping', () => {
      const original = { name: 'original' };
      const instrumented = { name: 'instrumented' };
      markAsInstrumented(original, instrumented);

      expect(getInstrumented(original)).toBe(instrumented);
    });

    it('also marks the instrumented version as instrumented', () => {
      const original = { name: 'original' };
      const instrumented = { name: 'instrumented' };
      markAsInstrumented(original, instrumented);

      expect(getInstrumented(instrumented)).toBe(instrumented);
    });

    it('works with functions', () => {
      const original = function () {};
      const instrumented = function () {};
      markAsInstrumented(original, instrumented);

      expect(getInstrumented(original)).toBe(instrumented);
      expect(getInstrumented(instrumented)).toBe(instrumented);
    });

    it('works with arrow functions', () => {
      const original = () => {};
      const instrumented = () => {};
      markAsInstrumented(original, instrumented);

      expect(getInstrumented(original)).toBe(instrumented);
    });

    it('works with Proxy objects wrapping functions', () => {
      const original = () => 'original';
      const proxy = new Proxy(original, {
        apply(target, thisArg, args) {
          return Reflect.apply(target, thisArg, args);
        },
      });
      markAsInstrumented(original, proxy);

      expect(getInstrumented(original)).toBe(proxy);
    });

    it('ignores primitive values', () => {
      // These should not throw
      markAsInstrumented(null as unknown);
      markAsInstrumented(undefined as unknown);
      markAsInstrumented(42 as unknown);
      markAsInstrumented('string' as unknown);
      markAsInstrumented(true as unknown);
    });
  });

  describe('getInstrumented', () => {
    it('returns undefined for unknown objects', () => {
      expect(getInstrumented({ name: 'unknown' })).toBeUndefined();
    });

    it('returns undefined for unknown functions', () => {
      expect(getInstrumented(() => {})).toBeUndefined();
    });

    it('returns the instrumented version for a marked original', () => {
      const original = () => {};
      const instrumented = () => {};
      markAsInstrumented(original, instrumented);

      expect(getInstrumented(original)).toBe(instrumented);
    });

    it('returns itself for the instrumented version', () => {
      const original = () => {};
      const instrumented = () => {};
      markAsInstrumented(original, instrumented);

      expect(getInstrumented(instrumented)).toBe(instrumented);
    });

    it('returns the object itself when marked without instrumented version', () => {
      const obj = { name: 'test' };
      markAsInstrumented(obj);
      expect(getInstrumented(obj)).toBe(obj);
    });

    it('returns undefined for null', () => {
      expect(getInstrumented(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(getInstrumented(undefined)).toBeUndefined();
    });

    it('returns undefined for primitives', () => {
      expect(getInstrumented(42)).toBeUndefined();
      expect(getInstrumented('string')).toBeUndefined();
    });
  });

  describe('WeakMap global isolation', () => {
    it('uses a global WeakMap stored on globalThis', () => {
      const obj = { name: 'test' };
      markAsInstrumented(obj);

      // The global key should exist
      expect((globalThis as Record<string, unknown>)[GLOBAL_KEY]).toBeDefined();
      expect((globalThis as Record<string, unknown>)[GLOBAL_KEY]).toBeInstanceOf(WeakMap);
    });

    it('reuses the same WeakMap across calls', () => {
      const obj1 = { name: 'test1' };
      const obj2 = { name: 'test2' };
      markAsInstrumented(obj1);
      markAsInstrumented(obj2);

      expect(getInstrumented(obj1)).toBeDefined();
      expect(getInstrumented(obj2)).toBeDefined();
    });

    it('uses existing WeakMap if already on globalThis', () => {
      const existingMap = new WeakMap();
      const obj = { name: 'pre-existing' };
      existingMap.set(obj, obj);
      (globalThis as Record<string, unknown>)[GLOBAL_KEY] = existingMap;

      // Should find the pre-existing entry
      expect(getInstrumented(obj)).toBeDefined();

      // Adding new entries should use the same map
      const newObj = { name: 'new' };
      markAsInstrumented(newObj);
      expect(existingMap.has(newObj)).toBe(true);
    });
  });

  describe('double instrumentation prevention', () => {
    it('getInstrumented returns cached proxy when original is re-encountered', () => {
      const original = () => 'original';
      const proxy = new Proxy(original, {
        apply(target, thisArg, args) {
          return Reflect.apply(target, thisArg, args);
        },
      });
      markAsInstrumented(original, proxy);

      // Simulates a second request encountering the same original
      const cached = getInstrumented(original);
      expect(cached).toBe(proxy);

      // The proxy should also be recognized
      const cachedProxy = getInstrumented(proxy);
      expect(cachedProxy).toBe(proxy);
    });

    it('prevents double-wrapping by recognizing instrumented functions', () => {
      const original = () => 'original';
      const proxy = new Proxy(original, {
        apply(target, thisArg, args) {
          return Reflect.apply(target, thisArg, args);
        },
      });
      markAsInstrumented(original, proxy);

      // Simulating the simplified handler pattern:
      // if getInstrumented returns something, use it; otherwise create new proxy
      const existing = getInstrumented(proxy);
      expect(existing).toBe(proxy);
    });
  });
});
