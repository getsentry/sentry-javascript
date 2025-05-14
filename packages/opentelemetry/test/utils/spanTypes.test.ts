import type { Span } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';
import { spanHasAttributes, spanHasEvents, spanHasKind, spanHasParentId } from '../../src/utils/spanTypes';

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

  describe('spanHasKind', () => {
    it.each([
      [{}, false],
      [{ kind: null }, false],
      [{ kind: 0 }, true],
      [{ kind: 5 }, true],
      [{ kind: 'TEST_KIND' }, false],
    ])('works with %j', (span, expected) => {
      const castSpan = span as unknown as Span;
      const actual = spanHasKind(castSpan);

      expect(actual).toBe(expected);

      if (actual) {
        expect(castSpan.kind).toBeDefined();
      }
    });
  });

  describe('spanHasParentId', () => {
    it.each([
      [{}, false],
      [{ parentSpanId: null }, false],
      [{ parentSpanId: 'TEST_PARENT_ID' }, true],
    ])('works with %j', (span, expected) => {
      const castSpan = span as unknown as Span;
      const actual = spanHasParentId(castSpan);

      expect(actual).toBe(expected);

      if (actual) {
        expect(castSpan.parentSpanId).toBeDefined();
      }
    });
  });

  describe('spanHasEvents', () => {
    it.each([
      [{}, false],
      [{ events: null }, false],
      [{ events: [] }, true],
    ])('works with %j', (span, expected) => {
      const castSpan = span as unknown as Span;
      const actual = spanHasEvents(castSpan);

      expect(actual).toBe(expected);

      if (actual) {
        expect(castSpan.events).toBeDefined();
      }
    });
  });
});
