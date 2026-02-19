import { describe, expect, it, vi } from 'vitest';
import { withStreamedSpan } from '../../../../src';
import { isStreamedBeforeSendSpanCallback } from '../../../../src/tracing/spans/beforeSendSpan';

describe('beforeSendSpan for span streaming', () => {
  describe('withStreamedSpan', () => {
    it('should be able to modify the span', () => {
      const beforeSendSpan = vi.fn();
      const wrapped = withStreamedSpan(beforeSendSpan);
      expect(wrapped._streamed).toBe(true);
    });
  });

  describe('isStreamedBeforeSendSpanCallback', () => {
    it('returns true if the callback is wrapped with withStreamedSpan', () => {
      const beforeSendSpan = vi.fn();
      const wrapped = withStreamedSpan(beforeSendSpan);
      expect(isStreamedBeforeSendSpanCallback(wrapped)).toBe(true);
    });

    it('returns false if the callback is not wrapped with withStreamedSpan', () => {
      const beforeSendSpan = vi.fn();
      expect(isStreamedBeforeSendSpanCallback(beforeSendSpan)).toBe(false);
    });
  });
});
