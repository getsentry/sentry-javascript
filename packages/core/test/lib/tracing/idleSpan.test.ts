import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveSpan,
  getCapturedScopesOnSpan,
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  getGlobalScope,
  getIsolationScope,
  getTraceData,
  SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SentryNonRecordingSpan,
  SentrySpan,
  setCurrentClient,
  spanToBaggageHeader,
  spanToJSON,
  startInactiveSpan,
  startSpan,
  startSpanManual,
} from '../../../src';
import { startIdleSpan, TRACING_DEFAULTS } from '../../../src/tracing/idleSpan';
import type { Event } from '../../../src/types/event';
import type { Span } from '../../../src/types/span';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const dsn = 'https://123@sentry.io/42';

describe('startIdleSpan', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const options = getDefaultTestClientOptions({ dsn, tracesSampleRate: 1 });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets & unsets the idle span on the scope', () => {
    const idleSpan = startIdleSpan({ name: 'foo' });
    expect(idleSpan).toBeDefined();
    expect(idleSpan).toBeInstanceOf(SentrySpan);

    expect(getActiveSpan()).toBe(idleSpan);

    idleSpan.end();
    vi.runAllTimers();

    expect(getActiveSpan()).toBe(undefined);
  });

  it('returns non recording span if tracing is disabled', () => {
    const options = getDefaultTestClientOptions({ dsn });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    getCurrentScope().setPropagationContext({
      traceId: '12345678901234567890123456789012',
      propagationSpanId: '1234567890abcdef',
      sampleRand: 0.42,
    });

    const idleSpan = startIdleSpan({ name: 'foo' });
    expect(idleSpan).toBeDefined();
    expect(idleSpan).toBeInstanceOf(SentryNonRecordingSpan);

    // Continues the trace from the scope, with the sampling decision deferred (no `sampled`/`sample_rate`).
    expect(idleSpan.spanContext().traceId).toBe('12345678901234567890123456789012');
    expect(getDynamicSamplingContextFromSpan(idleSpan)).toEqual({
      environment: 'production',
      public_key: '123',
      trace_id: '12345678901234567890123456789012',
    });

    // The deferred decision surfaces via `getTraceData` (read from the scope): the `sentry-trace`
    // header uses the scope's propagation span id, omits the flag, and the baggage asserts no decision.
    const data = getTraceData({ span: idleSpan });
    expect(data['sentry-trace']).toBe('12345678901234567890123456789012-1234567890abcdef');
    expect(data.baggage).not.toContain('sentry-sampled');
    expect(data.baggage).not.toContain('sentry-sample_rate');

    // Scopes are captured on the placeholder so consumers (e.g. SentryTraceProvider) can read them.
    expect(getCapturedScopesOnSpan(idleSpan).scope).toBe(getCurrentScope());
    expect(getCapturedScopesOnSpan(idleSpan).isolationScope).toBe(getIsolationScope());

    expect(getActiveSpan()).toBe(undefined);
  });

  it('preserves a continued trace DSC transaction when tracing is disabled', () => {
    const options = getDefaultTestClientOptions({ dsn });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    getCurrentScope().setPropagationContext({
      traceId: '12345678901234567890123456789012',
      sampleRand: 0.42,
      dsc: {
        environment: 'production',
        public_key: '123',
        trace_id: '12345678901234567890123456789012',
        transaction: 'upstream-root',
        sampled: 'true',
        sample_rate: '0.5',
      },
    });

    const idleSpan = startIdleSpan({ name: 'foo' });

    // The continued trace's frozen DSC wins over the local idle span name.
    expect(getDynamicSamplingContextFromSpan(idleSpan)).toEqual({
      environment: 'production',
      public_key: '123',
      trace_id: '12345678901234567890123456789012',
      transaction: 'upstream-root',
      sampled: 'true',
      sample_rate: '0.5',
    });
  });

  it('keeps a continued trace sampling decision when tracing is disabled', () => {
    const options = getDefaultTestClientOptions({ dsn });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    getCurrentScope().setPropagationContext({
      traceId: '12345678901234567890123456789012',
      parentSpanId: '1234567890123456',
      propagationSpanId: '1234567890abcdef',
      sampleRand: 0.42,
      sampled: true,
      dsc: { sampled: 'true' },
    });

    const idleSpan = startIdleSpan({ name: 'foo' });

    // The placeholder carries no decision of its own; the upstream sampling decision and DSC are
    // read from the scope. `getTraceData` reflects the positive decision in both headers.
    expect(getDynamicSamplingContextFromSpan(idleSpan).sampled).toBe('true');
    const data = getTraceData({ span: idleSpan });
    expect(data['sentry-trace']).toBe('12345678901234567890123456789012-1234567890abcdef-1');
    expect(data.baggage).toContain('sentry-sampled=true');
  });

  it('freezes a continued trace empty DSC as-is when tracing is disabled', () => {
    const options = getDefaultTestClientOptions({ dsn });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    // A continued `sentry-trace` without baggage yields an empty frozen DSC marker.
    getCurrentScope().setPropagationContext({
      traceId: '12345678901234567890123456789012',
      sampleRand: 0.42,
      dsc: {},
    });

    const idleSpan = startIdleSpan({ name: 'foo' });

    // We are not head of trace: don't fabricate client fields or inject the local transaction.
    expect(getDynamicSamplingContextFromSpan(idleSpan)).toEqual({});
  });

  it('does not add a url-source span name to the DSC when tracing is disabled', () => {
    const options = getDefaultTestClientOptions({ dsn });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    // Mirrors a browser pageload/navigation span, whose name is the URL path.
    const idleSpan = startIdleSpan({
      name: '/users/123e4567-e89b-12d3-a456-426614174000',
      attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url' },
    });

    expect(idleSpan).toBeInstanceOf(SentryNonRecordingSpan);
    // URLs might contain PII, so the span name must not end up in the DSC.
    expect(getDynamicSamplingContextFromSpan(idleSpan)).toEqual({
      environment: 'production',
      public_key: '123',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    });
    expect(spanToBaggageHeader(idleSpan)).not.toContain('sentry-transaction');
  });

  it('does not finish idle span if there are still active activities', () => {
    const idleSpan = startIdleSpan({ name: 'foo' });
    expect(idleSpan).toBeDefined();

    startSpanManual({ name: 'inner1' }, span => {
      const childSpan = startInactiveSpan({ name: 'inner2' });

      span.end();
      vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout + 1);

      // Idle span is still recording
      expect(idleSpan.isRecording()).toBe(true);

      childSpan.end();
      vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout + 1);

      // Now it is finished!
      expect(idleSpan.isRecording()).toBe(false);
    });
  });

  it('calls beforeSpanEnd callback before finishing', () => {
    const beforeSpanEnd = vi.fn();
    const idleSpan = startIdleSpan({ name: 'foo' }, { beforeSpanEnd });
    expect(idleSpan).toBeDefined();

    expect(beforeSpanEnd).not.toHaveBeenCalled();

    startSpan({ name: 'inner' }, () => {});

    vi.runOnlyPendingTimers();
    expect(beforeSpanEnd).toHaveBeenCalledTimes(1);
    expect(beforeSpanEnd).toHaveBeenLastCalledWith(idleSpan);
  });

  it('allows to mutate idle span in beforeSpanEnd before it is sent', () => {
    const transactions: Event[] = [];
    const beforeSendTransaction = vi.fn(event => {
      transactions.push(event);
      return null;
    });
    const options = getDefaultTestClientOptions({
      dsn,
      tracesSampleRate: 1,
      beforeSendTransaction,
    });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    // We want to accommodate a bit of drift there, so we ensure this starts earlier...
    const baseTimeInSeconds = Math.floor(Date.now() / 1000) - 9999;

    const beforeSpanEnd = vi.fn((span: Span) => {
      span.setAttribute('foo', 'bar');
      // Try adding a child here - we do this in browser tracing...
      const inner = startInactiveSpan({ name: 'from beforeSpanEnd', startTime: baseTimeInSeconds });
      inner.end(baseTimeInSeconds + 1);
    });
    const idleSpan = startIdleSpan({ name: 'idle span', startTime: baseTimeInSeconds }, { beforeSpanEnd });
    expect(idleSpan).toBeDefined();

    expect(beforeSpanEnd).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout + 1);
    vi.runOnlyPendingTimers();

    expect(spanToJSON(idleSpan).data).toEqual(
      expect.objectContaining({
        foo: 'bar',
      }),
    );

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    const transaction = transactions[0]!;

    expect(transaction.start_timestamp).toBe(baseTimeInSeconds);
    // It considers the end time of the span we added in beforeSpanEnd
    expect(transaction.timestamp).toBe(baseTimeInSeconds + 1);

    expect(transaction.contexts?.trace?.data).toEqual(
      expect.objectContaining({
        foo: 'bar',
      }),
    );
    expect(transaction.spans).toHaveLength(1);
    expect(transaction.spans).toEqual([expect.objectContaining({ description: 'from beforeSpanEnd' })]);
  });

  it('filters spans on end', () => {
    const transactions: Event[] = [];
    const beforeSendTransaction = vi.fn(event => {
      transactions.push(event);
      return null;
    });
    const options = getDefaultTestClientOptions({
      dsn,
      tracesSampleRate: 1,
      beforeSendTransaction,
    });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    // We want to accommodate a bit of drift there, so we ensure this starts earlier...
    const baseTimeInSeconds = Math.floor(Date.now() / 1000) - 9999;

    const idleSpan = startIdleSpan({ name: 'idle span', startTime: baseTimeInSeconds });
    expect(idleSpan).toBeDefined();

    // regular child - should be kept
    const regularSpan = startInactiveSpan({
      name: 'regular span',
      startTime: baseTimeInSeconds + 2,
    });

    // discardedSpan - startTimestamp is too large
    const discardedSpan = startInactiveSpan({ name: 'discarded span 1', startTime: baseTimeInSeconds + 99 });
    // discardedSpan2 - endTime is too large
    const discardedSpan2 = startInactiveSpan({ name: 'discarded span 2', startTime: baseTimeInSeconds + 3 });
    discardedSpan2.end(baseTimeInSeconds + 99)!;

    // Should be cancelled - will not finish
    const cancelledSpan = startInactiveSpan({
      name: 'cancelled span',
      startTime: baseTimeInSeconds + 4,
    });

    regularSpan.end(baseTimeInSeconds + 4);
    idleSpan.end(baseTimeInSeconds + 10);

    vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout + 1);
    vi.runOnlyPendingTimers();

    expect(regularSpan.isRecording()).toBe(false);
    expect(idleSpan.isRecording()).toBe(false);
    expect(discardedSpan.isRecording()).toBe(false);
    expect(discardedSpan2.isRecording()).toBe(false);
    expect(cancelledSpan.isRecording()).toBe(false);

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    const transaction = transactions[0]!;

    // End time is based on idle time etc.
    const idleSpanEndTime = transaction.timestamp!;
    expect(idleSpanEndTime).toEqual(expect.any(Number));

    expect(transaction.spans).toHaveLength(2);
    expect(transaction.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'regular span',
          timestamp: baseTimeInSeconds + 4,
          start_timestamp: baseTimeInSeconds + 2,
        }),
      ]),
    );
    expect(transaction.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'cancelled span',
          timestamp: idleSpanEndTime,
          start_timestamp: baseTimeInSeconds + 4,
          status: 'cancelled',
        }),
      ]),
    );
  });

  it('Ensures idle span cannot exceed finalTimeout', () => {
    const transactions: Event[] = [];
    const beforeSendTransaction = vi.fn(event => {
      transactions.push(event);
      return null;
    });
    const options = getDefaultTestClientOptions({
      dsn,
      tracesSampleRate: 1,
      beforeSendTransaction,
    });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    // We want to accommodate a bit of drift there, so we ensure this starts earlier...
    const finalTimeout = 99_999;
    const baseTimeInSeconds = Math.floor(Date.now() / 1000) - 9999;

    const idleSpan = startIdleSpan({ name: 'idle span', startTime: baseTimeInSeconds }, { finalTimeout: finalTimeout });
    expect(idleSpan).toBeDefined();

    // regular child - should be kept
    const regularSpan = startInactiveSpan({
      name: 'regular span',
      startTime: baseTimeInSeconds + 2,
    });
    regularSpan.end(baseTimeInSeconds + 4);

    // very late ending span
    const discardedSpan = startInactiveSpan({ name: 'discarded span', startTime: baseTimeInSeconds + 99 });
    discardedSpan.end(baseTimeInSeconds + finalTimeout + 100);

    // Should be cancelled - will not finish
    const cancelledSpan = startInactiveSpan({
      name: 'cancelled span',
      startTime: baseTimeInSeconds + 4,
    });

    vi.runOnlyPendingTimers();

    expect(regularSpan.isRecording()).toBe(false);
    expect(idleSpan.isRecording()).toBe(false);
    expect(discardedSpan.isRecording()).toBe(false);
    expect(cancelledSpan.isRecording()).toBe(false);

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    const transaction = transactions[0]!;

    // End time is based on idle time etc.
    const idleSpanEndTime = transaction.timestamp!;
    expect(idleSpanEndTime).toEqual(baseTimeInSeconds + finalTimeout / 1000);

    expect(transaction.spans).toHaveLength(2);
    expect(transaction.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'regular span',
          timestamp: baseTimeInSeconds + 4,
          start_timestamp: baseTimeInSeconds + 2,
        }),
      ]),
    );
    expect(transaction.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'cancelled span',
          timestamp: idleSpanEndTime,
          start_timestamp: baseTimeInSeconds + 4,
          status: 'cancelled',
        }),
      ]),
    );
  });

  it('emits span hooks', () => {
    const client = getClient()!;

    const hookSpans: { span: Span; hook: string }[] = [];
    client.on('spanStart', span => {
      hookSpans.push({ span, hook: 'spanStart' });
    });
    client.on('spanEnd', span => {
      hookSpans.push({ span, hook: 'spanEnd' });
    });

    const idleSpan = startIdleSpan({ name: 'idle span' });
    expect(idleSpan).toBeDefined();

    expect(hookSpans).toEqual([{ span: idleSpan, hook: 'spanStart' }]);

    vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
    expect(spanToJSON(idleSpan).timestamp).toBeDefined();

    expect(hookSpans).toEqual([
      { span: idleSpan, hook: 'spanStart' },
      { span: idleSpan, hook: 'spanEnd' },
    ]);
  });

  it('should record dropped idle span', () => {
    const options = getDefaultTestClientOptions({
      dsn,
      tracesSampleRate: 0,
    });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    const recordDroppedEventSpy = vi.spyOn(client, 'recordDroppedEvent');

    const idleSpan = startIdleSpan({ name: 'idle span' });
    expect(idleSpan).toBeDefined();

    idleSpan.end();

    expect(recordDroppedEventSpy).toHaveBeenCalledWith('sample_rate', 'transaction');
  });

  it('sets finish reason when span is ended manually', () => {
    let transaction: Event | undefined;
    const beforeSendTransaction = vi.fn(event => {
      transaction = event;
      return null;
    });
    const options = getDefaultTestClientOptions({ dsn, tracesSampleRate: 1, beforeSendTransaction });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    const span = startIdleSpan({ name: 'foo' });
    span.end();
    vi.runOnlyPendingTimers();

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    expect(transaction?.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]).toEqual(
      'externalFinish',
    );
  });

  it('sets finish reason when span ends', () => {
    let transaction: Event | undefined;
    const beforeSendTransaction = vi.fn(event => {
      transaction = event;
      return null;
    });
    const options = getDefaultTestClientOptions({ dsn, tracesSampleRate: 1, beforeSendTransaction });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    startIdleSpan({ name: 'foo' });
    startSpan({ name: 'inner' }, () => {});
    vi.runOnlyPendingTimers();

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    expect(transaction?.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]).toEqual(
      'idleTimeout',
    );
  });

  it('sets finish reason when span ends via expired heartbeat timeout', () => {
    let transaction: Event | undefined;
    const beforeSendTransaction = vi.fn(event => {
      transaction = event;
      return null;
    });
    const options = getDefaultTestClientOptions({ dsn, tracesSampleRate: 1, beforeSendTransaction });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    startIdleSpan({ name: 'foo' });
    startSpanManual({ name: 'inner' }, () => {});
    vi.runOnlyPendingTimers();

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    expect(transaction?.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]).toEqual(
      'heartbeatFailed',
    );
  });

  it('sets finish reason when span ends via final timeout', () => {
    let transaction: Event | undefined;
    const beforeSendTransaction = vi.fn(event => {
      transaction = event;
      return null;
    });
    const options = getDefaultTestClientOptions({ dsn, tracesSampleRate: 1, beforeSendTransaction });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    startIdleSpan({ name: 'foo' }, { finalTimeout: TRACING_DEFAULTS.childSpanTimeout * 2 });

    const span1 = startInactiveSpan({ name: 'inner' });
    vi.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout - 1);
    span1.end();

    const span2 = startInactiveSpan({ name: 'inner2' });
    vi.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout - 1);
    span2.end();

    startInactiveSpan({ name: 'inner3' });
    vi.runOnlyPendingTimers();

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    expect(transaction?.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]).toEqual(
      'finalTimeout',
    );
  });

  it('uses finish reason set outside when span ends', () => {
    let transaction: Event | undefined;
    const beforeSendTransaction = vi.fn(event => {
      transaction = event;
      return null;
    });
    const options = getDefaultTestClientOptions({ dsn, tracesSampleRate: 1, beforeSendTransaction });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    const span = startIdleSpan({ name: 'foo' });
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON, 'custom reason');
    startSpan({ name: 'inner' }, () => {});
    vi.runOnlyPendingTimers();

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    expect(transaction?.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]).toEqual(
      'custom reason',
    );
  });

  describe('idleTimeout', () => {
    it('finishes if no activities are added to the idle span', () => {
      const idleSpan = startIdleSpan({ name: 'idle span' });
      expect(idleSpan).toBeDefined();

      vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });

    it('does not finish if a activity is started', () => {
      const idleSpan = startIdleSpan({ name: 'idle span' });
      expect(idleSpan).toBeDefined();

      startInactiveSpan({ name: 'span' });

      vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();
    });

    it('does not finish when idleTimeout is not exceed after last activity finished', () => {
      const idleTimeout = 10;
      const idleSpan = startIdleSpan({ name: 'idle span' }, { idleTimeout });
      expect(idleSpan).toBeDefined();

      startSpan({ name: 'span1' }, () => {});

      vi.advanceTimersByTime(2);

      startSpan({ name: 'span2' }, () => {});

      vi.advanceTimersByTime(8);

      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();
    });

    it('finish when idleTimeout is exceeded after last activity finished', () => {
      const idleTimeout = 10;
      const idleSpan = startIdleSpan({ name: 'idle span', startTime: 1234 }, { idleTimeout });
      expect(idleSpan).toBeDefined();

      startSpan({ name: 'span1' }, () => {});

      vi.advanceTimersByTime(2);

      startSpan({ name: 'span2' }, () => {});

      vi.advanceTimersByTime(10);

      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });
  });

  describe('child span timeout', () => {
    it('finishes when a child span exceed timeout', () => {
      const idleSpan = startIdleSpan({ name: 'idle span' });
      expect(idleSpan).toBeDefined();

      // Start any span to cancel idle timeout
      startInactiveSpan({ name: 'span' });

      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // Wait some time
      vi.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout - 1000);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // Wait for timeout to exceed
      vi.advanceTimersByTime(1000);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });

    it('resets after new activities are added', () => {
      const idleSpan = startIdleSpan({ name: 'idle span' }, { finalTimeout: 99_999 });
      expect(idleSpan).toBeDefined();

      // Start any span to cancel idle timeout
      startInactiveSpan({ name: 'span' });

      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // Wait some time
      vi.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout - 1000);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // New span resets the timeout
      startInactiveSpan({ name: 'span' });

      vi.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout - 1000);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // New span resets the timeout
      startInactiveSpan({ name: 'span' });

      vi.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout - 1000);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // Wait for timeout to exceed
      vi.advanceTimersByTime(1000);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });

    it("doesn't reset the timeout for standalone spans", () => {
      const idleSpan = startIdleSpan({ name: 'idle span' }, { finalTimeout: 99_999 });
      expect(idleSpan).toBeDefined();

      // Start any span to cancel idle timeout
      startInactiveSpan({ name: 'span' });

      // Wait some time
      vi.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout - 1000);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // new standalone span should not reset the timeout
      const standaloneSpan = startInactiveSpan({ name: 'standalone span', experimental: { standalone: true } });
      expect(standaloneSpan).toBeDefined();

      // Wait for timeout to exceed
      vi.advanceTimersByTime(1001);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });
  });

  describe('disableAutoFinish', () => {
    it('skips idle timeout if disableAutoFinish=true', () => {
      const idleSpan = startIdleSpan({ name: 'idle span' }, { disableAutoFinish: true });
      expect(idleSpan).toBeDefined();

      vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // Now emit a signal
      getClient()!.emit('idleSpanEnableAutoFinish', idleSpan);

      vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });

    it('skips span timeout if disableAutoFinish=true', () => {
      const idleSpan = startIdleSpan({ name: 'idle span' }, { disableAutoFinish: true, finalTimeout: 99_999 });
      expect(idleSpan).toBeDefined();

      startInactiveSpan({ name: 'inner' });

      vi.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      vi.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // Now emit a signal
      getClient()!.emit('idleSpanEnableAutoFinish', idleSpan);

      vi.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });

    it('times out at final timeout if disableAutoFinish=true', () => {
      const idleSpan = startIdleSpan({ name: 'idle span' }, { disableAutoFinish: true });
      expect(idleSpan).toBeDefined();

      vi.advanceTimersByTime(TRACING_DEFAULTS.finalTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });

    it('ignores it if hook is emitted with other span', () => {
      const span = startInactiveSpan({ name: 'other span' });
      const idleSpan = startIdleSpan({ name: 'idle span' }, { disableAutoFinish: true });
      expect(idleSpan).toBeDefined();

      vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // Now emit a signal, but with a different span
      getClient()!.emit('idleSpanEnableAutoFinish', span);

      // This doesn't affect us!
      vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();
    });
  });

  describe('trim end timestamp', () => {
    it('trims end to highest child span end', () => {
      const idleSpan = startIdleSpan({ name: 'foo', startTime: 1000 }, { finalTimeout: 99_999_999 });
      expect(idleSpan).toBeDefined();

      const span1 = startInactiveSpan({ name: 'span1', startTime: 1001 });
      span1.end(1005);

      const span2 = startInactiveSpan({ name: 'span2', startTime: 1002 });
      span2.end(1100);

      const span3 = startInactiveSpan({ name: 'span1', startTime: 1050 });
      span3.end(1060);

      expect(getActiveSpan()).toBe(idleSpan);

      vi.runAllTimers();

      expect(spanToJSON(idleSpan).timestamp).toBe(1100);
    });

    it('trims end to final timeout', () => {
      const idleSpan = startIdleSpan({ name: 'foo', startTime: 1000 }, { finalTimeout: 30_000 });
      expect(idleSpan).toBeDefined();

      const span1 = startInactiveSpan({ name: 'span1', startTime: 1001 });
      span1.end(1005);

      const span2 = startInactiveSpan({ name: 'span2', startTime: 1002 });
      span2.end(1100);

      const span3 = startInactiveSpan({ name: 'span1', startTime: 1050 });
      span3.end(1060);

      expect(getActiveSpan()).toBe(idleSpan);

      vi.runAllTimers();

      expect(spanToJSON(idleSpan).timestamp).toBe(1030);
    });

    it('keeps lower span endTime than highest child span end', () => {
      const idleSpan = startIdleSpan({ name: 'foo', startTime: 1000 }, { finalTimeout: 99_999_999 });
      expect(idleSpan).toBeDefined();

      const span1 = startInactiveSpan({ name: 'span1', startTime: 999_999_999 });
      span1.end(1005);

      const span2 = startInactiveSpan({ name: 'span2', startTime: 1002 });
      span2.end(1100);

      const span3 = startInactiveSpan({ name: 'span1', startTime: 1050 });
      span3.end(1060);

      expect(getActiveSpan()).toBe(idleSpan);

      vi.runAllTimers();

      expect(spanToJSON(idleSpan).timestamp).toBeLessThan(999_999_999);
      expect(spanToJSON(idleSpan).timestamp).toBeGreaterThan(1060);
    });
  });
});
