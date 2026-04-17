import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { derefWeakRef, makeWeakRef, type MaybeWeakRef } from '../../../src/utils/weakRef';

describe('Unit | util | weakRef', () => {
  describe('makeWeakRef', () => {
    it('creates a WeakRef when available', () => {
      const obj = { foo: 'bar' };
      const ref = makeWeakRef(obj);

      // Should be a WeakRef, not the direct object
      expect(ref).toBeInstanceOf(WeakRef);
      expect((ref as WeakRef<typeof obj>).deref()).toBe(obj);
    });

    it('returns the object directly when WeakRef is not available', () => {
      const originalWeakRef = globalThis.WeakRef;
      (globalThis as any).WeakRef = undefined;

      try {
        const obj = { foo: 'bar' };
        const ref = makeWeakRef(obj);

        // Should be the direct object
        expect(ref).toBe(obj);
      } finally {
        (globalThis as any).WeakRef = originalWeakRef;
      }
    });

    it('returns the object directly when WeakRef constructor throws', () => {
      const originalWeakRef = globalThis.WeakRef;
      (globalThis as any).WeakRef = function () {
        throw new Error('WeakRef not supported');
      };

      try {
        const obj = { foo: 'bar' };
        const ref = makeWeakRef(obj);

        // Should fall back to the direct object
        expect(ref).toBe(obj);
      } finally {
        (globalThis as any).WeakRef = originalWeakRef;
      }
    });

    it('works with different object types', () => {
      const plainObject = { key: 'value' };
      const array = [1, 2, 3];
      const func = () => 'test';
      const date = new Date();

      expect(derefWeakRef(makeWeakRef(plainObject))).toBe(plainObject);
      expect(derefWeakRef(makeWeakRef(array))).toBe(array);
      expect(derefWeakRef(makeWeakRef(func))).toBe(func);
      expect(derefWeakRef(makeWeakRef(date))).toBe(date);
    });
  });

  describe('derefWeakRef', () => {
    it('returns undefined for undefined input', () => {
      expect(derefWeakRef(undefined)).toBeUndefined();
    });

    it('correctly dereferences a WeakRef', () => {
      const obj = { foo: 'bar' };
      const weakRef = new WeakRef(obj);

      expect(derefWeakRef(weakRef)).toBe(obj);
    });

    it('returns the direct object when not a WeakRef', () => {
      const obj = { foo: 'bar' };

      // Passing a direct object (fallback case)
      expect(derefWeakRef(obj as MaybeWeakRef<typeof obj>)).toBe(obj);
    });

    it('returns undefined when WeakRef.deref() returns undefined (simulating GC)', () => {
      const mockWeakRef = {
        deref: vi.fn().mockReturnValue(undefined),
      };

      expect(derefWeakRef(mockWeakRef as MaybeWeakRef<object>)).toBeUndefined();
      expect(mockWeakRef.deref).toHaveBeenCalled();
    });

    it('returns undefined when WeakRef.deref() throws an error', () => {
      const mockWeakRef = {
        deref: vi.fn().mockImplementation(() => {
          throw new Error('deref failed');
        }),
      };

      expect(derefWeakRef(mockWeakRef as MaybeWeakRef<object>)).toBeUndefined();
      expect(mockWeakRef.deref).toHaveBeenCalled();
    });

    it('handles objects with a non-function deref property', () => {
      const objWithDerefProperty = {
        deref: 'not a function',
        actualData: 'test',
      };

      // Should treat it as a direct object since deref is not a function
      expect(derefWeakRef(objWithDerefProperty as unknown as MaybeWeakRef<object>)).toBe(objWithDerefProperty);
    });
  });

  describe('roundtrip (makeWeakRef + derefWeakRef)', () => {
    it('preserves object identity with WeakRef available', () => {
      const obj = { nested: { data: [1, 2, 3] } };
      const ref = makeWeakRef(obj);
      const retrieved = derefWeakRef(ref);

      expect(retrieved).toBe(obj);
      expect(retrieved?.nested.data).toEqual([1, 2, 3]);
    });

    it('preserves object identity with WeakRef unavailable', () => {
      const originalWeakRef = globalThis.WeakRef;
      (globalThis as any).WeakRef = undefined;

      try {
        const obj = { nested: { data: [1, 2, 3] } };
        const ref = makeWeakRef(obj);
        const retrieved = derefWeakRef(ref);

        expect(retrieved).toBe(obj);
        expect(retrieved?.nested.data).toEqual([1, 2, 3]);
      } finally {
        (globalThis as any).WeakRef = originalWeakRef;
      }
    });

    it('allows multiple refs to the same object', () => {
      const obj = { id: 'shared' };
      const ref1 = makeWeakRef(obj);
      const ref2 = makeWeakRef(obj);

      expect(derefWeakRef(ref1)).toBe(obj);
      expect(derefWeakRef(ref2)).toBe(obj);
      expect(derefWeakRef(ref1)).toBe(derefWeakRef(ref2));
    });
  });

  describe('type safety', () => {
    it('preserves generic type information', () => {
      interface TestInterface {
        id: number;
        name: string;
      }

      const obj: TestInterface = { id: 1, name: 'test' };
      const ref: MaybeWeakRef<TestInterface> = makeWeakRef(obj);
      const retrieved: TestInterface | undefined = derefWeakRef(ref);

      expect(retrieved?.id).toBe(1);
      expect(retrieved?.name).toBe('test');
    });

    it('works with class instances', () => {
      class TestClass {
        constructor(public value: string) {}
        getValue(): string {
          return this.value;
        }
      }

      const instance = new TestClass('hello');
      const ref = makeWeakRef(instance);
      const retrieved = derefWeakRef(ref);

      expect(retrieved).toBeInstanceOf(TestClass);
      expect(retrieved?.getValue()).toBe('hello');
    });
  });
});
