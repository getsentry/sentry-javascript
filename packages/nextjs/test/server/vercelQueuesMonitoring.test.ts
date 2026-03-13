import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockHeaders: Record<string, string | string[] | undefined> | undefined;

vi.mock('@sentry/core', () => ({
  getIsolationScope: () => ({
    getScopeData: () => ({
      sdkProcessingMetadata: {
        normalizedRequest: mockHeaders !== undefined ? { headers: mockHeaders } : undefined,
      },
    }),
  }),
  spanToJSON: (span: { _data: Record<string, unknown> }) => ({
    data: span._data,
  }),
}));

import {
  maybeCleanupQueueSpan,
  maybeEnrichQueueConsumerSpan,
  maybeEnrichQueueProducerSpan,
} from '../../src/server/vercelQueuesMonitoring';

function createMockSpan(data: Record<string, unknown> = {}): {
  _data: Record<string, unknown>;
  setAttribute: (key: string, value: unknown) => void;
} {
  const _data = { ...data };
  return {
    _data,
    setAttribute: (key: string, value: unknown) => {
      if (value === undefined) {
        delete _data[key];
      } else {
        _data[key] = value;
      }
    },
  };
}

describe('vercelQueuesMonitoring', () => {
  beforeEach(() => {
    mockHeaders = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('maybeEnrichQueueConsumerSpan', () => {
    it('does nothing when there are no headers', () => {
      mockHeaders = undefined;
      const span = createMockSpan();
      maybeEnrichQueueConsumerSpan(span as any);
      expect(span._data).toEqual({});
    });

    it('does nothing when ce-type header is missing', () => {
      mockHeaders = { 'content-type': 'application/json' };
      const span = createMockSpan();
      maybeEnrichQueueConsumerSpan(span as any);
      expect(span._data).toEqual({});
    });

    it('does nothing when ce-type is not com.vercel.queue.v2beta', () => {
      mockHeaders = { 'ce-type': 'com.other.event' };
      const span = createMockSpan();
      maybeEnrichQueueConsumerSpan(span as any);
      expect(span._data).toEqual({});
    });

    it('enriches span with messaging attributes when ce-type matches', () => {
      mockHeaders = {
        'ce-type': 'com.vercel.queue.v2beta',
        'ce-vqsqueuename': 'orders',
        'ce-vqsmessageid': 'msg-123',
        'ce-vqsconsumergroup': 'default',
        'ce-vqsdeliverycount': '3',
      };
      const span = createMockSpan();
      maybeEnrichQueueConsumerSpan(span as any);

      expect(span._data['messaging.system']).toBe('vercel.queue');
      expect(span._data['messaging.operation.name']).toBe('process');
      expect(span._data['messaging.destination.name']).toBe('orders');
      expect(span._data['messaging.message.id']).toBe('msg-123');
      expect(span._data['messaging.consumer.group.name']).toBe('default');
      expect(span._data['messaging.message.delivery_count']).toBe(3);
      expect(span._data['sentry.queue.enriched']).toBe(true);
    });

    it('handles missing optional headers gracefully', () => {
      mockHeaders = { 'ce-type': 'com.vercel.queue.v2beta' };
      const span = createMockSpan();
      maybeEnrichQueueConsumerSpan(span as any);

      expect(span._data['messaging.system']).toBe('vercel.queue');
      expect(span._data['messaging.operation.name']).toBe('process');
      expect(span._data['messaging.destination.name']).toBeUndefined();
      expect(span._data['messaging.message.id']).toBeUndefined();
    });

    it('ignores non-numeric delivery count', () => {
      mockHeaders = {
        'ce-type': 'com.vercel.queue.v2beta',
        'ce-vqsdeliverycount': 'not-a-number',
      };
      const span = createMockSpan();
      maybeEnrichQueueConsumerSpan(span as any);

      expect(span._data['messaging.message.delivery_count']).toBeUndefined();
    });
  });

  describe('maybeEnrichQueueProducerSpan', () => {
    it('does nothing when url.full is missing', () => {
      const span = createMockSpan();
      maybeEnrichQueueProducerSpan(span as any);
      expect(span._data).toEqual({});
    });

    it('does nothing for non-vercel-queue URLs', () => {
      const span = createMockSpan({ 'url.full': 'https://example.com/api/v3/topic/orders' });
      maybeEnrichQueueProducerSpan(span as any);
      expect(span._data['messaging.system']).toBeUndefined();
    });

    it('does nothing for hostname that is a suffix match but not a subdomain', () => {
      const span = createMockSpan({ 'url.full': 'https://evil-vercel-queue.com/api/v3/topic/orders' });
      maybeEnrichQueueProducerSpan(span as any);
      expect(span._data['messaging.system']).toBeUndefined();
    });

    it('does nothing for vercel-queue.com URLs without topic path', () => {
      const span = createMockSpan({ 'url.full': 'https://queue.vercel-queue.com/api/v3/other' });
      maybeEnrichQueueProducerSpan(span as any);
      expect(span._data['messaging.system']).toBeUndefined();
    });

    it('enriches span for vercel-queue.com topic URLs', () => {
      const span = createMockSpan({ 'url.full': 'https://queue.vercel-queue.com/api/v3/topic/orders' });
      maybeEnrichQueueProducerSpan(span as any);

      expect(span._data['messaging.system']).toBe('vercel.queue');
      expect(span._data['messaging.destination.name']).toBe('orders');
      expect(span._data['messaging.operation.name']).toBe('send');
      expect(span._data['sentry.queue.enriched']).toBe(true);
    });

    it('handles URL-encoded topic names', () => {
      const span = createMockSpan({
        'url.full': 'https://queue.vercel-queue.com/api/v3/topic/my%20topic',
      });
      maybeEnrichQueueProducerSpan(span as any);

      expect(span._data['messaging.destination.name']).toBe('my topic');
    });

    it('extracts topic when URL has additional path segments', () => {
      const span = createMockSpan({
        'url.full': 'https://queue.vercel-queue.com/api/v3/topic/orders/msg-123',
      });
      maybeEnrichQueueProducerSpan(span as any);

      expect(span._data['messaging.destination.name']).toBe('orders');
    });

    it('handles invalid URLs gracefully', () => {
      const span = createMockSpan({ 'url.full': 'not-a-url' });
      maybeEnrichQueueProducerSpan(span as any);
      expect(span._data['messaging.system']).toBeUndefined();
    });
  });

  describe('maybeCleanupQueueSpan', () => {
    it('removes the enriched marker attribute', () => {
      const span = createMockSpan({
        'messaging.system': 'vercel.queue',
        'sentry.queue.enriched': true,
      });
      maybeCleanupQueueSpan(span as any);

      expect(span._data['sentry.queue.enriched']).toBeUndefined();
      expect(span._data['messaging.system']).toBe('vercel.queue');
    });

    it('does nothing for non-enriched spans', () => {
      const span = createMockSpan({ 'some.attribute': 'value' });
      maybeCleanupQueueSpan(span as any);
      expect(span._data).toEqual({ 'some.attribute': 'value' });
    });
  });
});
