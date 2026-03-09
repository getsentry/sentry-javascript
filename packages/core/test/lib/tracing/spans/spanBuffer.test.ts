import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client, StreamedSpanEnvelope } from '../../../../src';
import { SentrySpan, setCurrentClient, SpanBuffer } from '../../../../src';
import type { SerializedStreamedSpanWithSegmentSpan } from '../../../../src/tracing/spans/captureSpan';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('SpanBuffer', () => {
  let client: TestClient;
  let sendEnvelopeSpy: ReturnType<typeof vi.fn>;

  let sentEnvelopes: Array<StreamedSpanEnvelope> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    sentEnvelopes = [];
    sendEnvelopeSpy = vi.fn().mockImplementation(e => {
      sentEnvelopes.push(e);
      return Promise.resolve();
    });

    client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        tracesSampleRate: 1.0,
      }),
    );
    client.sendEnvelope = sendEnvelopeSpy;
    client.init();
    setCurrentClient(client as Client);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('flushes all traces on drain()', () => {
    const buffer = new SpanBuffer(client);

    const segmentSpan1 = new SentrySpan({ name: 'segment', sampled: true, traceId: 'trace123' });
    const segmentSpan2 = new SentrySpan({ name: 'segment', sampled: true, traceId: 'trace456' });

    buffer.add({
      trace_id: 'trace123',
      span_id: 'span1',
      name: 'test span',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan1,
    });

    buffer.add({
      trace_id: 'trace456',
      span_id: 'span2',
      name: 'test span',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan2,
    });

    buffer.drain();

    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(2);
    expect(sentEnvelopes).toHaveLength(2);
    expect(sentEnvelopes[0]?.[1]?.[0]?.[1]?.items[0]?.trace_id).toBe('trace123');
    expect(sentEnvelopes[1]?.[1]?.[0]?.[1]?.items[0]?.trace_id).toBe('trace456');
  });

  it('flushes trace after per-trace timeout', () => {
    const buffer = new SpanBuffer(client, { flushInterval: 1000 });

    const segmentSpan1 = new SentrySpan({ name: 'segment', sampled: true });
    const span1 = {
      trace_id: 'trace123',
      span_id: 'span1',
      name: 'test span',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan1,
    };

    const segmentSpan2 = new SentrySpan({ name: 'segment2', sampled: true });
    const span2 = {
      trace_id: 'trace123',
      span_id: 'span2',
      name: 'test span',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan2,
    };

    buffer.add(span1 as SerializedStreamedSpanWithSegmentSpan);
    buffer.add(span2 as SerializedStreamedSpanWithSegmentSpan);

    expect(sendEnvelopeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);

    // the trace bucket was removed after flushing, so no timeout remains and no further sends occur
    vi.advanceTimersByTime(1000);
    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
  });

  it('flushes when maxSpanLimit is reached', () => {
    const buffer = new SpanBuffer(client, { maxSpanLimit: 2 });

    const segmentSpan = new SentrySpan({ name: 'segment', sampled: true });

    buffer.add({
      trace_id: 'trace123',
      span_id: 'span1',
      name: 'test span 1',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan,
    });

    expect(sendEnvelopeSpy).not.toHaveBeenCalled();

    buffer.add({
      trace_id: 'trace123',
      span_id: 'span2',
      name: 'test span 2',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan,
    });

    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);

    buffer.add({
      trace_id: 'trace123',
      span_id: 'span3',
      name: 'test span 3',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan,
    });

    // we added another span after flushing but neither limit nor time interval should have been reached
    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);

    // draining will flush out the remaining span
    buffer.drain();
    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(2);
  });

  it('flushes on client flush event', () => {
    const buffer = new SpanBuffer(client);

    const segmentSpan = new SentrySpan({ name: 'segment', sampled: true });

    buffer.add({
      trace_id: 'trace123',
      span_id: 'span1',
      name: 'test span',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan,
    });

    expect(sendEnvelopeSpy).not.toHaveBeenCalled();

    client.emit('flush');

    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
  });

  it('groups spans by traceId', () => {
    const buffer = new SpanBuffer(client);

    const segmentSpan1 = new SentrySpan({ name: 'segment1', sampled: true });
    const segmentSpan2 = new SentrySpan({ name: 'segment2', sampled: true });

    buffer.add({
      trace_id: 'trace1',
      span_id: 'span1',
      name: 'test span 1',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan1,
    });

    buffer.add({
      trace_id: 'trace2',
      span_id: 'span2',
      name: 'test span 2',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan2,
    });

    buffer.drain();

    // Should send 2 envelopes, one for each trace
    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(2);
  });

  it('flushes a specific trace on flush(traceId)', () => {
    const buffer = new SpanBuffer(client);

    const segmentSpan1 = new SentrySpan({ name: 'segment1', sampled: true });
    const segmentSpan2 = new SentrySpan({ name: 'segment2', sampled: true });

    buffer.add({
      trace_id: 'trace1',
      span_id: 'span1',
      name: 'test span 1',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan1,
    });

    buffer.add({
      trace_id: 'trace2',
      span_id: 'span2',
      name: 'test span 2',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan2,
    });

    buffer.flush('trace1');

    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    expect(sentEnvelopes[0]?.[1]?.[0]?.[1]?.items[0]?.trace_id).toBe('trace1');
  });

  it('handles flushing a non-existing trace', () => {
    const buffer = new SpanBuffer(client);

    buffer.flush('trace1');

    expect(sendEnvelopeSpy).not.toHaveBeenCalled();
  });

  describe('weight-based flushing', () => {
    function makeSpan(
      traceId: string,
      spanId: string,
      segmentSpan: InstanceType<typeof SentrySpan>,
      overrides: Partial<SerializedStreamedSpanWithSegmentSpan> = {},
    ): SerializedStreamedSpanWithSegmentSpan {
      return {
        trace_id: traceId,
        span_id: spanId,
        name: 'test span',
        start_timestamp: Date.now() / 1000,
        end_timestamp: Date.now() / 1000,
        status: 'ok',
        is_segment: false,
        _segmentSpan: segmentSpan,
        ...overrides,
      };
    }

    it('flushes a trace when its weight limit is exceeded', () => {
      // Use a very small weight threshold so a single span with attributes tips it over
      const buffer = new SpanBuffer(client, { maxTraceWeightInBytes: 200 });
      const segmentSpan = new SentrySpan({ name: 'segment', sampled: true });

      // First span: small, under threshold
      buffer.add(makeSpan('trace1', 'span1', segmentSpan, { name: 'a' }));
      expect(sendEnvelopeSpy).not.toHaveBeenCalled();

      // Second span: has a large name that pushes it over 200 bytes
      buffer.add(makeSpan('trace1', 'span2', segmentSpan, { name: 'a'.repeat(80) }));
      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    });

    it('does not flush when weight stays below the threshold', () => {
      const buffer = new SpanBuffer(client, { maxTraceWeightInBytes: 10_000 });
      const segmentSpan = new SentrySpan({ name: 'segment', sampled: true });

      buffer.add(makeSpan('trace1', 'span1', segmentSpan));
      buffer.add(makeSpan('trace1', 'span2', segmentSpan));

      expect(sendEnvelopeSpy).not.toHaveBeenCalled();
    });

    it('resets weight tracking after a weight-triggered flush so new spans accumulate fresh weight', () => {
      // Base estimate per span is 152 bytes. With threshold 400:
      // - big span  ('a' * 200): 152 + 200*2 = 552 bytes → exceeds 400, triggers flush
      // - small span (name 'b'):  152 + 1*2  = 154 bytes
      // - two small spans combined: 308 bytes < 400 → no second flush
      const buffer = new SpanBuffer(client, { maxTraceWeightInBytes: 400 });
      const segmentSpan = new SentrySpan({ name: 'segment', sampled: true });

      buffer.add(makeSpan('trace1', 'span1', segmentSpan, { name: 'a'.repeat(200) }));
      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);

      buffer.add(makeSpan('trace1', 'span2', segmentSpan, { name: 'b' }));
      buffer.add(makeSpan('trace1', 'span3', segmentSpan, { name: 'c' }));
      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    });

    it('tracks weight independently per trace', () => {
      const buffer = new SpanBuffer(client, { maxTraceWeightInBytes: 200 });
      const segmentSpan1 = new SentrySpan({ name: 'segment1', sampled: true });
      const segmentSpan2 = new SentrySpan({ name: 'segment2', sampled: true });

      // trace1 gets a heavy span that exceeds the limit
      buffer.add(makeSpan('trace1', 'span1', segmentSpan1, { name: 'a'.repeat(80) }));
      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
      expect((sentEnvelopes[0]?.[1]?.[0]?.[1] as { items: Array<{ trace_id: string }> })?.items[0]?.trace_id).toBe(
        'trace1',
      );

      // trace2 only has a small span and should not be flushed
      buffer.add(makeSpan('trace2', 'span2', segmentSpan2, { name: 'b' }));
      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    });

    it('estimates spans with attributes as heavier than bare spans', () => {
      // Use a threshold that a bare span cannot reach but an attributed span can
      const buffer = new SpanBuffer(client, { maxTraceWeightInBytes: 300 });
      const segmentSpan = new SentrySpan({ name: 'segment', sampled: true });

      // A span with many string attributes should tip it over
      buffer.add(
        makeSpan('trace1', 'span1', segmentSpan, {
          attributes: {
            'http.method': { type: 'string', value: 'GET' },
            'http.url': { type: 'string', value: 'https://example.com/api/v1/users?page=1&limit=100' },
            'db.statement': { type: 'string', value: 'SELECT * FROM users WHERE id = 1' },
          },
        }),
      );

      expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
