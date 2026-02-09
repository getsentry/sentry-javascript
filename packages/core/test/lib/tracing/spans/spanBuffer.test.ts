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

  it('drains on interval', () => {
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

    // since the buffer is now empty, it should not send anything anymore
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
});
