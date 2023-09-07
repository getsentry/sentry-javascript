import { BrowserClient } from '@sentry/browser';
import { TRACING_DEFAULTS, Transaction } from '@sentry/core';

import { Hub, IdleTransaction, Span } from '../../core/src';
import { IdleTransactionSpanRecorder } from '../../core/src/tracing/idletransaction';
import { getDefaultBrowserClientOptions } from './testutils';

const dsn = 'https://123@sentry.io/42';
let hub: Hub;
beforeEach(() => {
  const options = getDefaultBrowserClientOptions({ dsn, tracesSampleRate: 1 });
  hub = new Hub(new BrowserClient(options));
});

describe('IdleTransaction', () => {
  describe('onScope', () => {
    it('sets the transaction on the scope on creation if onScope is true', () => {
      const transaction = new IdleTransaction(
        { name: 'foo' },
        hub,
        TRACING_DEFAULTS.idleTimeout,
        TRACING_DEFAULTS.finalTimeout,
        TRACING_DEFAULTS.heartbeatInterval,
        true,
      );
      transaction.initSpanRecorder(10);

      hub.configureScope(s => {
        expect(s.getTransaction()).toBe(transaction);
      });
    });

    it('does not set the transaction on the scope on creation if onScope is falsey', () => {
      const transaction = new IdleTransaction({ name: 'foo' }, hub);
      transaction.initSpanRecorder(10);

      hub.configureScope(s => {
        expect(s.getTransaction()).toBe(undefined);
      });
    });

    it('removes sampled transaction from scope on finish if onScope is true', () => {
      const transaction = new IdleTransaction(
        { name: 'foo' },
        hub,
        TRACING_DEFAULTS.idleTimeout,
        TRACING_DEFAULTS.finalTimeout,
        TRACING_DEFAULTS.heartbeatInterval,
        true,
      );
      transaction.initSpanRecorder(10);

      transaction.finish();
      jest.runAllTimers();

      hub.configureScope(s => {
        expect(s.getTransaction()).toBe(undefined);
      });
    });

    it('removes unsampled transaction from scope on finish if onScope is true', () => {
      const transaction = new IdleTransaction(
        { name: 'foo', sampled: false },
        hub,
        TRACING_DEFAULTS.idleTimeout,
        TRACING_DEFAULTS.finalTimeout,
        TRACING_DEFAULTS.heartbeatInterval,
        true,
      );

      transaction.finish();
      jest.runAllTimers();

      hub.configureScope(s => {
        expect(s.getTransaction()).toBe(undefined);
      });
    });

    it('does not remove transaction from scope on finish if another transaction was set there', () => {
      const transaction = new IdleTransaction(
        { name: 'foo' },
        hub,
        TRACING_DEFAULTS.idleTimeout,
        TRACING_DEFAULTS.finalTimeout,
        TRACING_DEFAULTS.heartbeatInterval,
        true,
      );
      transaction.initSpanRecorder(10);

      // @ts-expect-error need to pass in hub
      const otherTransaction = new Transaction({ name: 'bar' }, hub);
      hub.getScope().setSpan(otherTransaction);

      transaction.finish();
      jest.runAllTimers();

      hub.configureScope(s => {
        expect(s.getTransaction()).toBe(otherTransaction);
      });
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  it('push and pops activities', () => {
    const transaction = new IdleTransaction({ name: 'foo' }, hub);
    const mockFinish = jest.spyOn(transaction, 'finish');
    transaction.initSpanRecorder(10);
    expect(transaction.activities).toMatchObject({});

    const span = transaction.startChild();
    expect(transaction.activities).toMatchObject({ [span.spanId]: true });

    expect(mockFinish).toHaveBeenCalledTimes(0);

    span.finish();
    expect(transaction.activities).toMatchObject({});

    jest.runOnlyPendingTimers();
    expect(mockFinish).toHaveBeenCalledTimes(1);
  });

  it('does not push activities if a span already has an end timestamp', () => {
    const transaction = new IdleTransaction({ name: 'foo' }, hub);
    transaction.initSpanRecorder(10);
    expect(transaction.activities).toMatchObject({});

    transaction.startChild({ startTimestamp: 1234, endTimestamp: 5678 });
    expect(transaction.activities).toMatchObject({});
  });

  it('does not finish if there are still active activities', () => {
    const transaction = new IdleTransaction({ name: 'foo' }, hub);
    const mockFinish = jest.spyOn(transaction, 'finish');
    transaction.initSpanRecorder(10);
    expect(transaction.activities).toMatchObject({});

    const span = transaction.startChild();
    const childSpan = span.startChild();

    expect(transaction.activities).toMatchObject({ [span.spanId]: true, [childSpan.spanId]: true });
    span.finish();
    jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout + 1);

    expect(mockFinish).toHaveBeenCalledTimes(0);
    expect(transaction.activities).toMatchObject({ [childSpan.spanId]: true });
  });

  it('calls beforeFinish callback before finishing', () => {
    const mockCallback1 = jest.fn();
    const mockCallback2 = jest.fn();
    const transaction = new IdleTransaction({ name: 'foo' }, hub);
    transaction.initSpanRecorder(10);
    transaction.registerBeforeFinishCallback(mockCallback1);
    transaction.registerBeforeFinishCallback(mockCallback2);

    expect(mockCallback1).toHaveBeenCalledTimes(0);
    expect(mockCallback2).toHaveBeenCalledTimes(0);

    const span = transaction.startChild();
    span.finish();

    jest.runOnlyPendingTimers();
    expect(mockCallback1).toHaveBeenCalledTimes(1);
    expect(mockCallback1).toHaveBeenLastCalledWith(transaction, expect.any(Number));
    expect(mockCallback2).toHaveBeenCalledTimes(1);
    expect(mockCallback2).toHaveBeenLastCalledWith(transaction, expect.any(Number));
  });

  it('filters spans on finish', () => {
    const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub);
    transaction.initSpanRecorder(10);

    // regular child - should be kept
    const regularSpan = transaction.startChild({ startTimestamp: transaction.startTimestamp + 2 });

    // discardedSpan - startTimestamp is too large
    transaction.startChild({ startTimestamp: 645345234 });

    // Should be cancelled - will not finish
    const cancelledSpan = transaction.startChild({ startTimestamp: transaction.startTimestamp + 4 });

    regularSpan.finish(regularSpan.startTimestamp + 4);
    transaction.finish(transaction.startTimestamp + 10);

    expect(transaction.spanRecorder).toBeDefined();
    if (transaction.spanRecorder) {
      const spans = transaction.spanRecorder.spans;
      expect(spans).toHaveLength(3);
      expect(spans[0].spanId).toBe(transaction.spanId);

      // Regular Span - should not modified
      expect(spans[1].spanId).toBe(regularSpan.spanId);
      expect(spans[1].endTimestamp).not.toBe(transaction.endTimestamp);

      // Cancelled Span - has endtimestamp of transaction
      expect(spans[2].spanId).toBe(cancelledSpan.spanId);
      expect(spans[2].status).toBe('cancelled');
      expect(spans[2].endTimestamp).toBe(transaction.endTimestamp);
    }
  });

  it('filters out spans that exceed final timeout', () => {
    const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, 1000, 3000);
    transaction.initSpanRecorder(10);

    const span = transaction.startChild({ startTimestamp: transaction.startTimestamp + 2 });
    span.finish(span.startTimestamp + 10 + 30 + 1);

    transaction.finish(transaction.startTimestamp + 50);

    expect(transaction.spanRecorder).toBeDefined();
    expect(transaction.spanRecorder!.spans).toHaveLength(1);
  });

  it('should record dropped transactions', async () => {
    const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234, sampled: false }, hub, 1000);

    const client = hub.getClient()!;

    const recordDroppedEventSpy = jest.spyOn(client, 'recordDroppedEvent');

    transaction.initSpanRecorder(10);
    transaction.finish(transaction.startTimestamp + 10);

    expect(recordDroppedEventSpy).toHaveBeenCalledWith('sample_rate', 'transaction');
  });

  describe('_idleTimeout', () => {
    it('finishes if no activities are added to the transaction', () => {
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub);
      transaction.initSpanRecorder(10);

      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(transaction.endTimestamp).toBeDefined();
    });

    it('does not finish if a activity is started', () => {
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub);
      transaction.initSpanRecorder(10);
      transaction.startChild({});

      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(transaction.endTimestamp).toBeUndefined();
    });

    it('does not finish when idleTimeout is not exceed after last activity finished', () => {
      const idleTimeout = 10;
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, idleTimeout);
      transaction.initSpanRecorder(10);

      const span = transaction.startChild({});
      span.finish();

      jest.advanceTimersByTime(2);

      const span2 = transaction.startChild({});
      span2.finish();

      jest.advanceTimersByTime(8);

      expect(transaction.endTimestamp).toBeUndefined();
    });

    it('finish when idleTimeout is exceeded after last activity finished', () => {
      const idleTimeout = 10;
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, idleTimeout);
      transaction.initSpanRecorder(10);

      const span = transaction.startChild({});
      span.finish();

      jest.advanceTimersByTime(2);

      const span2 = transaction.startChild({});
      span2.finish();

      jest.advanceTimersByTime(10);

      expect(transaction.endTimestamp).toBeDefined();
    });
  });

  describe('cancelIdleTimeout', () => {
    it('permanent idle timeout cancel is not restarted by child span start', () => {
      const idleTimeout = 10;
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, idleTimeout);
      transaction.initSpanRecorder(10);

      const firstSpan = transaction.startChild({});
      transaction.cancelIdleTimeout(undefined, { restartOnChildSpanChange: false });
      const secondSpan = transaction.startChild({});
      firstSpan.finish();
      secondSpan.finish();

      expect(transaction.endTimestamp).toBeDefined();
    });

    it('permanent idle timeout cancel finished the transaction with the last child', () => {
      const idleTimeout = 10;
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, idleTimeout);
      transaction.initSpanRecorder(10);

      const firstSpan = transaction.startChild({});
      transaction.cancelIdleTimeout(undefined, { restartOnChildSpanChange: false });
      const secondSpan = transaction.startChild({});
      const thirdSpan = transaction.startChild({});

      firstSpan.finish();
      expect(transaction.endTimestamp).toBeUndefined();

      secondSpan.finish();
      expect(transaction.endTimestamp).toBeUndefined();

      thirdSpan.finish();
      expect(transaction.endTimestamp).toBeDefined();
    });

    it('permanent idle timeout cancel finishes transaction if there are no activities', () => {
      const idleTimeout = 10;
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, idleTimeout);
      transaction.initSpanRecorder(10);

      const span = transaction.startChild({});
      span.finish();

      jest.advanceTimersByTime(2);

      transaction.cancelIdleTimeout(undefined, { restartOnChildSpanChange: false });

      expect(transaction.endTimestamp).toBeDefined();
    });

    it('default idle cancel timeout is restarted by child span change', () => {
      const idleTimeout = 10;
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, idleTimeout);
      transaction.initSpanRecorder(10);

      const span = transaction.startChild({});
      span.finish();

      jest.advanceTimersByTime(2);

      transaction.cancelIdleTimeout();

      const span2 = transaction.startChild({});
      span2.finish();

      jest.advanceTimersByTime(8);
      expect(transaction.endTimestamp).toBeUndefined();

      jest.advanceTimersByTime(2);
      expect(transaction.endTimestamp).toBeDefined();
    });
  });

  describe('heartbeat', () => {
    it('does not mark transaction as `DeadlineExceeded` if idle timeout has not been reached', () => {
      // 20s to exceed 3 heartbeats
      const transaction = new IdleTransaction({ name: 'foo' }, hub, 20000);
      const mockFinish = jest.spyOn(transaction, 'finish');

      expect(transaction.status).not.toEqual('deadline_exceeded');
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 1
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(transaction.status).not.toEqual('deadline_exceeded');
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 2
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(transaction.status).not.toEqual('deadline_exceeded');
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 3
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(transaction.status).not.toEqual('deadline_exceeded');
      expect(mockFinish).toHaveBeenCalledTimes(0);
    });

    it('finishes a transaction after 3 beats', () => {
      const transaction = new IdleTransaction({ name: 'foo' }, hub, TRACING_DEFAULTS.idleTimeout);
      const mockFinish = jest.spyOn(transaction, 'finish');
      transaction.initSpanRecorder(10);

      expect(mockFinish).toHaveBeenCalledTimes(0);
      transaction.startChild({});

      // Beat 1
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 2
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 3
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(1);
    });

    it('resets after new activities are added', () => {
      const transaction = new IdleTransaction({ name: 'foo' }, hub, TRACING_DEFAULTS.idleTimeout, 50000);
      const mockFinish = jest.spyOn(transaction, 'finish');
      transaction.initSpanRecorder(10);

      expect(mockFinish).toHaveBeenCalledTimes(0);
      transaction.startChild({});

      // Beat 1
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      const span = transaction.startChild(); // push activity

      // Beat 1
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 2
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      transaction.startChild(); // push activity
      transaction.startChild(); // push activity

      // Beat 1
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 2
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      span.finish(); // pop activity

      // Beat 1
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 2
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 3
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(1);

      // Heartbeat does not keep going after finish has been called
      jest.runAllTimers();
      expect(mockFinish).toHaveBeenCalledTimes(1);
    });
  });
});

describe('IdleTransactionSpanRecorder', () => {
  it('pushes and pops activities', () => {
    const mockPushActivity = jest.fn();
    const mockPopActivity = jest.fn();
    const spanRecorder = new IdleTransactionSpanRecorder(mockPushActivity, mockPopActivity, '', 10);
    expect(mockPushActivity).toHaveBeenCalledTimes(0);
    expect(mockPopActivity).toHaveBeenCalledTimes(0);

    const span = new Span({ sampled: true });

    expect(spanRecorder.spans).toHaveLength(0);
    spanRecorder.add(span);
    expect(spanRecorder.spans).toHaveLength(1);

    expect(mockPushActivity).toHaveBeenCalledTimes(1);
    expect(mockPushActivity).toHaveBeenLastCalledWith(span.spanId);
    expect(mockPopActivity).toHaveBeenCalledTimes(0);

    span.finish();
    expect(mockPushActivity).toHaveBeenCalledTimes(1);
    expect(mockPopActivity).toHaveBeenCalledTimes(1);
    expect(mockPushActivity).toHaveBeenLastCalledWith(span.spanId);
  });

  it('does not push activities if a span has a timestamp', () => {
    const mockPushActivity = jest.fn();
    const mockPopActivity = jest.fn();
    const spanRecorder = new IdleTransactionSpanRecorder(mockPushActivity, mockPopActivity, '', 10);

    const span = new Span({ sampled: true, startTimestamp: 765, endTimestamp: 345 });
    spanRecorder.add(span);

    expect(mockPushActivity).toHaveBeenCalledTimes(0);
  });

  it('does not push or pop transaction spans', () => {
    const mockPushActivity = jest.fn();
    const mockPopActivity = jest.fn();

    const transaction = new IdleTransaction({ name: 'foo' }, hub);
    const spanRecorder = new IdleTransactionSpanRecorder(mockPushActivity, mockPopActivity, transaction.spanId, 10);

    spanRecorder.add(transaction);
    expect(mockPushActivity).toHaveBeenCalledTimes(0);
    expect(mockPopActivity).toHaveBeenCalledTimes(0);
  });
});
