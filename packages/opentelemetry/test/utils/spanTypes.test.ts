import type { Span } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';
import { spanHasAttributes } from '../../src/utils/spanTypes';

describe('spanTypes', () => {
  describe('spanHasAttributes', () => {
    it.each([
      [{}, false],
      [{ attributes: null }, false],
      [{ attributes: {} }, true],
    ])('works with %j', (span, expected) => {
      const castSpan = span as unknown as Span;
      const actual = spanHasAttributes(castSpan);

      expect(actual).toBe(expected);

      if (actual) {
        expect(castSpan.attributes).toBeDefined();
      }
    });
  });
});
