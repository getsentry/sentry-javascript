import { describe, expect, it } from 'vitest';
import { createSpanV2Envelope } from '../../../../src/tracing/spans/envelope';
import type { DynamicSamplingContext } from '../../../../src/types-hoist/envelope';
import type { SerializedSpan } from '../../../../src/types-hoist/span';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

function createMockSerializedSpan(overrides: Partial<SerializedSpan> = {}): SerializedSpan {
  return {
    trace_id: 'abc123',
    span_id: 'def456',
    name: 'test-span',
    start_timestamp: 1713859200,
    end_timestamp: 1713859201,
    status: 'ok',
    is_segment: false,
    ...overrides,
  };
}

describe('createSpanV2Envelope', () => {
  describe('envelope headers', () => {
    it('creates an envelope with sent_at header', () => {
      const mockSpan = createMockSerializedSpan();
      const mockClient = new TestClient(getDefaultTestClientOptions());
      const dsc: Partial<DynamicSamplingContext> = {};

      const result = createSpanV2Envelope([mockSpan], dsc, mockClient);

      expect(result[0]).toHaveProperty('sent_at', expect.any(String));
    });

    it('includes trace header when DSC has required props (trace_id and public_key)', () => {
      const mockSpan = createMockSerializedSpan();
      const mockClient = new TestClient(getDefaultTestClientOptions());
      const dsc: DynamicSamplingContext = {
        trace_id: 'trace-123',
        public_key: 'public-key-abc',
        sample_rate: '1.0',
        release: 'v1.0.0',
      };

      const result = createSpanV2Envelope([mockSpan], dsc, mockClient);

      expect(result[0]).toHaveProperty('trace', dsc);
    });

    it("does't include trace header when DSC is missing trace_id", () => {
      const mockSpan = createMockSerializedSpan();
      const mockClient = new TestClient(getDefaultTestClientOptions());
      const dsc: Partial<DynamicSamplingContext> = {
        public_key: 'public-key-abc',
      };

      const result = createSpanV2Envelope([mockSpan], dsc, mockClient);

      expect(result[0]).not.toHaveProperty('trace');
    });

    it("does't include trace header when DSC is missing public_key", () => {
      const mockSpan = createMockSerializedSpan();
      const mockClient = new TestClient(getDefaultTestClientOptions());
      const dsc: Partial<DynamicSamplingContext> = {
        trace_id: 'trace-123',
      };

      const result = createSpanV2Envelope([mockSpan], dsc, mockClient);

      expect(result[0]).not.toHaveProperty('trace');
    });

    it('includes SDK info when available in client options', () => {
      const mockSpan = createMockSerializedSpan();
      const mockClient = new TestClient(
        getDefaultTestClientOptions({
          _metadata: {
            sdk: { name: 'sentry.javascript.browser', version: '8.0.0' },
          },
        }),
      );
      const dsc: Partial<DynamicSamplingContext> = {};

      const result = createSpanV2Envelope([mockSpan], dsc, mockClient);

      expect(result[0]).toHaveProperty('sdk', { name: 'sentry.javascript.browser', version: '8.0.0' });
    });

    it("does't include SDK info when not available", () => {
      const mockSpan = createMockSerializedSpan();
      const mockClient = new TestClient(getDefaultTestClientOptions());
      const dsc: Partial<DynamicSamplingContext> = {};

      const result = createSpanV2Envelope([mockSpan], dsc, mockClient);

      expect(result[0]).not.toHaveProperty('sdk');
    });

    it('includes DSN when tunnel and DSN are configured', () => {
      const mockSpan = createMockSerializedSpan();
      const mockClient = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://abc123@example.sentry.io/456',
          tunnel: 'https://tunnel.example.com',
        }),
      );
      const dsc: Partial<DynamicSamplingContext> = {};

      const result = createSpanV2Envelope([mockSpan], dsc, mockClient);

      expect(result[0]).toHaveProperty('dsn', 'https://abc123@example.sentry.io/456');
    });

    it("does't include DSN when tunnel is not configured", () => {
      const mockSpan = createMockSerializedSpan();
      const mockClient = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://abc123@example.sentry.io/456',
        }),
      );
      const dsc: Partial<DynamicSamplingContext> = {};

      const result = createSpanV2Envelope([mockSpan], dsc, mockClient);

      expect(result[0]).not.toHaveProperty('dsn');
    });

    it("does't include DSN when DSN is not available", () => {
      const mockSpan = createMockSerializedSpan();
      const mockClient = new TestClient(
        getDefaultTestClientOptions({
          tunnel: 'https://tunnel.example.com',
        }),
      );
      const dsc: Partial<DynamicSamplingContext> = {};

      const result = createSpanV2Envelope([mockSpan], dsc, mockClient);

      expect(result[0]).not.toHaveProperty('dsn');
    });

    it('includes all headers when all options are provided', () => {
      const mockSpan = createMockSerializedSpan();
      const mockClient = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://abc123@example.sentry.io/456',
          tunnel: 'https://tunnel.example.com',
          _metadata: {
            sdk: { name: 'sentry.javascript.node', version: '10.38.0' },
          },
        }),
      );
      const dsc: DynamicSamplingContext = {
        trace_id: 'trace-123',
        public_key: 'public-key-abc',
        environment: 'production',
      };

      const result = createSpanV2Envelope([mockSpan], dsc, mockClient);

      expect(result[0]).toEqual({
        sent_at: expect.any(String),
        trace: dsc,
        sdk: { name: 'sentry.javascript.node', version: '10.38.0' },
        dsn: 'https://abc123@example.sentry.io/456',
      });
    });
  });

  describe('envelope item', () => {
    it('creates a span container item with correct structure', () => {
      const mockSpan = createMockSerializedSpan({ name: 'span-1' });
      const mockClient = new TestClient(getDefaultTestClientOptions());
      const dsc: Partial<DynamicSamplingContext> = {};

      const envelopeItems = createSpanV2Envelope([mockSpan], dsc, mockClient)[1];

      expect(envelopeItems).toEqual([
        [
          {
            content_type: 'application/vnd.sentry.items.span.v2+json',
            item_count: 1,
            type: 'span',
          },
          {
            items: [mockSpan],
          },
        ],
      ]);
    });

    it('sets correct item_count for multiple spans', () => {
      const mockSpan1 = createMockSerializedSpan({ span_id: 'span-1' });
      const mockSpan2 = createMockSerializedSpan({ span_id: 'span-2' });
      const mockSpan3 = createMockSerializedSpan({ span_id: 'span-3' });
      const mockClient = new TestClient(getDefaultTestClientOptions());
      const dsc: Partial<DynamicSamplingContext> = {};

      const envelopeItems = createSpanV2Envelope([mockSpan1, mockSpan2, mockSpan3], dsc, mockClient)[1];

      expect(envelopeItems).toEqual([
        [
          { type: 'span', item_count: 3, content_type: 'application/vnd.sentry.items.span.v2+json' },
          { items: [mockSpan1, mockSpan2, mockSpan3] },
        ],
      ]);
    });

    it('handles empty spans array', () => {
      const mockClient = new TestClient(getDefaultTestClientOptions());
      const dsc: Partial<DynamicSamplingContext> = {};

      const result = createSpanV2Envelope([], dsc, mockClient);

      expect(result).toEqual([
        {
          sent_at: expect.any(String),
        },
        [
          [
            {
              content_type: 'application/vnd.sentry.items.span.v2+json',
              item_count: 0,
              type: 'span',
            },
            {
              items: [],
            },
          ],
        ],
      ]);
    });
  });
});
