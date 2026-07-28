import { describe, expect, it, vi } from 'vitest';
import { withStaticSpan, withStreamedSpan } from '../../../../src';
import {
  isStaticBeforeSendSpanCallback,
  isStreamedBeforeSendSpanCallback,
} from '../../../../src/tracing/spans/beforeSendSpan';

describe('beforeSendSpan callback formats', () => {
  describe('withStaticSpan', () => {
    it('marks the callback as static without making the marker enumerable', () => {
      const beforeSendSpan = vi.fn();
      const wrapped = withStaticSpan(beforeSendSpan);

      expect(wrapped._static).toBe(true);
      expect(Object.keys(wrapped)).not.toContain('_static');
    });
  });

  describe('withStreamedSpan', () => {
    it('returns the callback unchanged', () => {
      const beforeSendSpan = vi.fn();

      expect(withStreamedSpan(beforeSendSpan)).toBe(beforeSendSpan);
      expect(Object.keys(beforeSendSpan)).not.toContain('_streamed');
    });
  });

  describe('isStaticBeforeSendSpanCallback', () => {
    it('returns true if the callback is wrapped with withStaticSpan', () => {
      const wrapped = withStaticSpan(vi.fn());

      expect(isStaticBeforeSendSpanCallback(wrapped)).toBe(true);
    });

    it('returns false for an unwrapped callback', () => {
      expect(isStaticBeforeSendSpanCallback(vi.fn())).toBe(false);
    });
  });

  describe('isStreamedBeforeSendSpanCallback', () => {
    it('returns true for an unwrapped callback', () => {
      expect(isStreamedBeforeSendSpanCallback(vi.fn())).toBe(true);
    });

    it('returns true if the callback is wrapped with withStreamedSpan', () => {
      expect(isStreamedBeforeSendSpanCallback(withStreamedSpan(vi.fn()))).toBe(true);
    });

    it('returns false if the callback is wrapped with withStaticSpan', () => {
      expect(isStreamedBeforeSendSpanCallback(withStaticSpan(vi.fn()))).toBe(false);
    });
  });
});
