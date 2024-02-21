import type { Span } from '@opentelemetry/api';

import { spanHasAttributes, spanHasEvents, spanHasKind, spanHasParentId } from '../../src/utils/spanTypes';

describe('spanTypes', () => {
  describe('spanHasAttributes', () => {
    it.each([
      [{}, false],
      [{ attributes: null }, false],
      [{ attributes: {} }, true],
    ])('works with %p', (span, expected) => {
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
      [{ kind: 'TEST_KIND' }, true],
    ])('works with %p', (span, expected) => {
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
    ])('works with %p', (span, expected) => {
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
    ])('works with %p', (span, expected) => {
      const castSpan = span as unknown as Span;
      const actual = spanHasEvents(castSpan);

      expect(actual).toBe(expected);

      if (actual) {
        expect(castSpan.events).toBeDefined();
      }
    });
  });
});
