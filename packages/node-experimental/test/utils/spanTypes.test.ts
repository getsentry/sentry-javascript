import type { Span } from '@opentelemetry/api';

import {
  spanHasAttributes,
  spanHasEvents,
  spanHasKind,
  spanHasParentId,
  spanIsSdkTraceBaseSpan,
} from '../../src/utils/spanTypes';
import { createSpan } from '../helpers/createSpan';

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
      [{ kind: 'xxx' }, true],
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
      [{ parentSpanId: 'xxx' }, true],
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

  describe('spanIsSdkTraceBaseSpan', () => {
    it.each([
      [{}, false],
      [createSpan(), true],
    ])('works with %p', (span, expected) => {
      const castSpan = span as unknown as Span;
      const actual = spanIsSdkTraceBaseSpan(castSpan);

      expect(actual).toBe(expected);

      if (actual) {
        expect(castSpan.events).toBeDefined();
        expect(castSpan.attributes).toBeDefined();
        expect(castSpan.kind).toBeDefined();
      }
    });
  });
});
