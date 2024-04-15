import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

import type { Event, Span } from '@sentry/types';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON,
  SentryNonRecordingSpan,
  SentrySpan,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
  startInactiveSpan,
  startSpan,
  startSpanManual,
} from '../../../src';
import { TRACING_DEFAULTS, startIdleSpan } from '../../../src/tracing/idleSpan';

const dsn = 'https://123@sentry.io/42';

describe('startIdleSpan', () => {
  beforeEach(() => {
    jest.useFakeTimers();

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const options = getDefaultTestClientOptions({ dsn, tracesSampleRate: 1 });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sets & unsets the idle span on the scope', () => {
    const idleSpan = startIdleSpan({ name: 'foo' });
    expect(idleSpan).toBeDefined();
    expect(idleSpan).toBeInstanceOf(SentrySpan);

    expect(getActiveSpan()).toBe(idleSpan);

    idleSpan!.end();
    jest.runAllTimers();

    expect(getActiveSpan()).toBe(undefined);
  });

  it('returns non recording span if tracing is disabled', () => {
    const options = getDefaultTestClientOptions({ dsn });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    const idleSpan = startIdleSpan({ name: 'foo' });
    expect(idleSpan).toBeDefined();
    expect(idleSpan).toBeInstanceOf(SentryNonRecordingSpan);

    // not set as active span, though
    expect(getActiveSpan()).toBe(undefined);
  });

  it('does not finish idle span if there are still active activities', () => {
    const idleSpan = startIdleSpan({ name: 'foo' });
    expect(idleSpan).toBeDefined();

    startSpanManual({ name: 'inner1' }, span => {
      const childSpan = startInactiveSpan({ name: 'inner2' });

      span?.end();
      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout + 1);

      // Idle span is still recording
      expect(idleSpan.isRecording()).toBe(true);

      childSpan?.end();
      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout + 1);

      // Now it is finished!
      expect(idleSpan.isRecording()).toBe(false);
    });
  });

  it('calls beforeSpanEnd callback before finishing', () => {
    const beforeSpanEnd = jest.fn();
    const idleSpan = startIdleSpan({ name: 'foo' }, { beforeSpanEnd });
    expect(idleSpan).toBeDefined();

    expect(beforeSpanEnd).not.toHaveBeenCalled();

    startSpan({ name: 'inner' }, () => {});

    jest.runOnlyPendingTimers();
    expect(beforeSpanEnd).toHaveBeenCalledTimes(1);
    expect(beforeSpanEnd).toHaveBeenLastCalledWith(idleSpan);
  });

  it('allows to mutate idle span in beforeSpanEnd before it is sent', () => {
    const transactions: Event[] = [];
    const beforeSendTransaction = jest.fn(event => {
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

    // We want to accomodate a bit of drift there, so we ensure this starts earlier...
    const baseTimeInSeconds = Math.floor(Date.now() / 1000) - 9999;

    const beforeSpanEnd = jest.fn((span: Span) => {
      span.setAttribute('foo', 'bar');
      // Try adding a child here - we do this in browser tracing...
      const inner = startInactiveSpan({ name: 'from beforeSpanEnd', startTime: baseTimeInSeconds });
      inner?.end(baseTimeInSeconds);
    });
    const idleSpan = startIdleSpan({ name: 'idle span 2', startTime: baseTimeInSeconds }, { beforeSpanEnd });
    expect(idleSpan).toBeDefined();

    expect(beforeSpanEnd).not.toHaveBeenCalled();

    jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout + 1);
    jest.runOnlyPendingTimers();

    expect(spanToJSON(idleSpan!).data).toEqual(
      expect.objectContaining({
        foo: 'bar',
      }),
    );

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    const transaction = transactions[0];

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
    const beforeSendTransaction = jest.fn(event => {
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

    // We want to accomodate a bit of drift there, so we ensure this starts earlier...
    const baseTimeInSeconds = Math.floor(Date.now() / 1000) - 9999;

    const idleSpan = startIdleSpan({ name: 'idle span', startTime: baseTimeInSeconds });
    expect(idleSpan).toBeDefined();

    // regular child - should be kept
    const regularSpan = startInactiveSpan({
      name: 'regular span',
      startTime: baseTimeInSeconds + 2,
    });

    // discardedSpan - startTimestamp is too large
    const discardedSpan = startInactiveSpan({ name: 'discarded span', startTime: baseTimeInSeconds + 99 });
    // discardedSpan2 - endTime is too large
    const discardedSpan2 = startInactiveSpan({ name: 'discarded span', startTime: baseTimeInSeconds + 3 });
    discardedSpan2.end(baseTimeInSeconds + 99)!;

    // Should be cancelled - will not finish
    const cancelledSpan = startInactiveSpan({
      name: 'cancelled span',
      startTime: baseTimeInSeconds + 4,
    });

    regularSpan.end(baseTimeInSeconds + 4);
    idleSpan.end(baseTimeInSeconds + 10);

    jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout + 1);
    jest.runOnlyPendingTimers();

    expect(regularSpan.isRecording()).toBe(false);
    expect(idleSpan.isRecording()).toBe(false);
    expect(discardedSpan.isRecording()).toBe(false);
    expect(discardedSpan2.isRecording()).toBe(false);
    expect(cancelledSpan.isRecording()).toBe(false);

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    const transaction = transactions[0];

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

    jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
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

    const recordDroppedEventSpy = jest.spyOn(client, 'recordDroppedEvent');

    const idleSpan = startIdleSpan({ name: 'idle span' });
    expect(idleSpan).toBeDefined();

    idleSpan?.end();

    expect(recordDroppedEventSpy).toHaveBeenCalledWith('sample_rate', 'transaction');
  });

  it('sets finish reason when span ends', () => {
    let transaction: Event | undefined;
    const beforeSendTransaction = jest.fn(event => {
      transaction = event;
      return null;
    });
    const options = getDefaultTestClientOptions({ dsn, tracesSampleRate: 1, beforeSendTransaction });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    // This is only set when op === 'ui.action.click'
    startIdleSpan({ name: 'foo', op: 'ui.action.click' });
    startSpan({ name: 'inner' }, () => {});
    jest.runOnlyPendingTimers();

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    expect(transaction?.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]).toEqual(
      'idleTimeout',
    );
  });

  it('uses finish reason set outside when span ends', () => {
    let transaction: Event | undefined;
    const beforeSendTransaction = jest.fn(event => {
      transaction = event;
      return null;
    });
    const options = getDefaultTestClientOptions({ dsn, tracesSampleRate: 1, beforeSendTransaction });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    // This is only set when op === 'ui.action.click'
    const span = startIdleSpan({ name: 'foo', op: 'ui.action.click' });
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON, 'custom reason');
    startSpan({ name: 'inner' }, () => {});
    jest.runOnlyPendingTimers();

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    expect(transaction?.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]).toEqual(
      'custom reason',
    );
  });

  describe('idleTimeout', () => {
    it('finishes if no activities are added to the idle span', () => {
      const idleSpan = startIdleSpan({ name: 'idle span' });
      expect(idleSpan).toBeDefined();

      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });

    it('does not finish if a activity is started', () => {
      const idleSpan = startIdleSpan({ name: 'idle span' });
      expect(idleSpan).toBeDefined();

      startInactiveSpan({ name: 'span' });

      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();
    });

    it('does not finish when idleTimeout is not exceed after last activity finished', () => {
      const idleTimeout = 10;
      const idleSpan = startIdleSpan({ name: 'idle span' }, { idleTimeout });
      expect(idleSpan).toBeDefined();

      startSpan({ name: 'span1' }, () => {});

      jest.advanceTimersByTime(2);

      startSpan({ name: 'span2' }, () => {});

      jest.advanceTimersByTime(8);

      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();
    });

    it('finish when idleTimeout is exceeded after last activity finished', () => {
      const idleTimeout = 10;
      const idleSpan = startIdleSpan({ name: 'idle span', startTime: 1234 }, { idleTimeout });
      expect(idleSpan).toBeDefined();

      startSpan({ name: 'span1' }, () => {});

      jest.advanceTimersByTime(2);

      startSpan({ name: 'span2' }, () => {});

      jest.advanceTimersByTime(10);

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
      jest.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout - 1000);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // Wait for timeout to exceed
      jest.advanceTimersByTime(1000);
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
      jest.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout - 1000);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // New span resets the timeout
      startInactiveSpan({ name: 'span' });

      jest.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout - 1000);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // New span resets the timeout
      startInactiveSpan({ name: 'span' });

      jest.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout - 1000);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // Wait for timeout to exceed
      jest.advanceTimersByTime(1000);
      expect(spanToJSON(idleSpan).status).not.toEqual('deadline_exceeded');
      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });
  });

  describe('disableAutoFinish', () => {
    it('skips idle timeout if disableAutoFinish=true', () => {
      const idleSpan = startIdleSpan({ name: 'idle span' }, { disableAutoFinish: true });
      expect(idleSpan).toBeDefined();

      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // Now emit a signal
      getClient()!.emit('idleSpanEnableAutoFinish', idleSpan);

      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });

    it('skips span timeout if disableAutoFinish=true', () => {
      const idleSpan = startIdleSpan({ name: 'idle span' }, { disableAutoFinish: true, finalTimeout: 99_999 });
      expect(idleSpan).toBeDefined();

      startInactiveSpan({ name: 'inner' });

      jest.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      jest.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // Now emit a signal
      getClient()!.emit('idleSpanEnableAutoFinish', idleSpan);

      jest.advanceTimersByTime(TRACING_DEFAULTS.childSpanTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });

    it('times out at final timeout if disableAutoFinish=true', () => {
      const idleSpan = startIdleSpan({ name: 'idle span' }, { disableAutoFinish: true });
      expect(idleSpan).toBeDefined();

      jest.advanceTimersByTime(TRACING_DEFAULTS.finalTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeDefined();
    });

    it('ignores it if hook is emitted with other span', () => {
      const span = startInactiveSpan({ name: 'other span' });
      const idleSpan = startIdleSpan({ name: 'idle span' }, { disableAutoFinish: true });
      expect(idleSpan).toBeDefined();

      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();

      // Now emit a signal, but with a different span
      getClient()!.emit('idleSpanEnableAutoFinish', span);

      // This doesn't affect us!
      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(spanToJSON(idleSpan).timestamp).toBeUndefined();
    });
  });

  describe('trim end timestamp', () => {
    it('trims end to highest child span end', () => {
      const idleSpan = startIdleSpan({ name: 'foo', startTime: 1000 });
      expect(idleSpan).toBeDefined();

      const span1 = startInactiveSpan({ name: 'span1', startTime: 1001 });
      span1?.end(1005);

      const span2 = startInactiveSpan({ name: 'span2', startTime: 1002 });
      span2?.end(1100);

      const span3 = startInactiveSpan({ name: 'span1', startTime: 1050 });
      span3?.end(1060);

      expect(getActiveSpan()).toBe(idleSpan);

      jest.runAllTimers();

      expect(spanToJSON(idleSpan!).timestamp).toBe(1100);
    });

    it('keeps lower span endTime than highest child span end', () => {
      const idleSpan = startIdleSpan({ name: 'foo', startTime: 1000 });
      expect(idleSpan).toBeDefined();

      const span1 = startInactiveSpan({ name: 'span1', startTime: 999_999_999 });
      span1?.end(1005);

      const span2 = startInactiveSpan({ name: 'span2', startTime: 1002 });
      span2?.end(1100);

      const span3 = startInactiveSpan({ name: 'span1', startTime: 1050 });
      span3?.end(1060);

      expect(getActiveSpan()).toBe(idleSpan);

      jest.runAllTimers();

      expect(spanToJSON(idleSpan!).timestamp).toBeLessThan(999_999_999);
      expect(spanToJSON(idleSpan!).timestamp).toBeGreaterThan(1060);
    });
  });
});
