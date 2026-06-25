import { describe, expect, it } from 'vitest';
import { isMiddleware } from '../../src/utils/isMiddleware';

describe('isMiddleware', () => {
  it.each([
    { label: 'single-argument route handler (context)', handler: (_c: unknown) => undefined, expected: false },
    {
      label: 'two-argument middleware (context, next)',
      handler: (_c: unknown, _next: unknown) => undefined,
      expected: true,
    },
  ])('returns $expected for a $label', ({ handler, expected }) => {
    expect(isMiddleware(handler)).toBe(expected);
  });

  it.each([
    { label: 'undefined', value: undefined },
    { label: 'null', value: null },
    { label: 'plain object with a length property', value: { length: 2 } },
  ])('returns false for a non-function $label value', ({ value }) => {
    expect(isMiddleware(value)).toBe(false);
  });

  describe('__COMPOSED_HANDLER unwrapping', () => {
    it('reports the original arity-1 handler when an arity-2 wrapper composes it', () => {
      const wrapped = (_c: unknown, _next: unknown) => undefined;
      (wrapped as unknown as Record<string, unknown>).__COMPOSED_HANDLER = (_c: unknown) => undefined;

      expect(isMiddleware(wrapped)).toBe(false);
    });

    it('reports middleware when the unwrapped original is itself arity 2', () => {
      const wrapped = (_c: unknown, _next: unknown) => undefined;
      (wrapped as unknown as Record<string, unknown>).__COMPOSED_HANDLER = (_c: unknown, _next: unknown) => undefined;

      expect(isMiddleware(wrapped)).toBe(true);
    });

    it('falls back to the wrapper arity when __COMPOSED_HANDLER is not a function', () => {
      const handler = (_c: unknown, _next: unknown) => undefined;
      (handler as unknown as Record<string, unknown>).__COMPOSED_HANDLER = 'not-a-function';

      expect(isMiddleware(handler)).toBe(true);
    });
  });
});
