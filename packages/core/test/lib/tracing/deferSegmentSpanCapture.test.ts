import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  startInactiveSpan,
  withActiveSpan,
  withScope,
} from '../../../src';
import { _INTERNAL_setDeferSegmentSpanCapture } from '../../../src/tracing/deferSegmentSpanCapture';
import {
  getSegmentSpanCaptureStrategy,
  setSegmentSpanCaptureStrategy,
} from '../../../src/tracing/segmentSpanCaptureStrategy';
import type { Event } from '../../../src/types/event';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const dsn = 'https://123@sentry.io/42';

describe('_INTERNAL_setDeferSegmentSpanCapture', () => {
  afterEach(() => {
    setSegmentSpanCaptureStrategy(undefined);
  });

  it('registers the global capture strategy', () => {
    expect(getSegmentSpanCaptureStrategy()).toBeUndefined();

    _INTERNAL_setDeferSegmentSpanCapture(new TestClient(getDefaultTestClientOptions()));

    expect(getSegmentSpanCaptureStrategy()).toBeDefined();
  });

  it('registers the flush listener once and is idempotent on repeated enable', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    const onSpy = vi.spyOn(client, 'on');

    _INTERNAL_setDeferSegmentSpanCapture(client);
    _INTERNAL_setDeferSegmentSpanCapture(client);

    expect(onSpy.mock.calls.filter(([hook]) => hook === 'flush')).toHaveLength(1);
  });
});

describe('deferred segment-span capture', () => {
  let transactions: Event[];
  let client: TestClient;

  beforeEach(() => {
    vi.useFakeTimers();

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    transactions = [];
    const options = getDefaultTestClientOptions({
      dsn,
      tracesSampleRate: 1,
      beforeSendTransaction: event => {
        transactions.push(event);
        return null;
      },
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
    _INTERNAL_setDeferSegmentSpanCapture(client);
  });

  afterEach(() => {
    setSegmentSpanCaptureStrategy(undefined);
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('includes a child that ends after the segment but before the debounce fires', () => {
    const root = startInactiveSpan({ name: 'root' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));

    root.end();
    child.end();

    // The snapshot is deferred, so nothing is captured until the debounce fires.
    expect(transactions).toHaveLength(0);

    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.spans).toEqual([expect.objectContaining({ description: 'child' })]);
  });

  it('emits a child that ends after the snapshot as its own orphan transaction', () => {
    const root = startInactiveSpan({ name: 'root' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));

    root.end();
    vi.advanceTimersByTime(100);

    // Segment transaction assembled without the still-open child.
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.spans).toEqual([]);

    child.end();
    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(2);
    expect(transactions[1]!.transaction).toBe('child');
    expect(transactions[1]!.contexts?.trace?.data?.['sentry.parent_span_already_sent']).toBe(true);
  });

  it('drains pending captures synchronously on flush', () => {
    const root = startInactiveSpan({ name: 'root' });
    root.end();

    // Still queued behind the debounce timer.
    expect(transactions).toHaveLength(0);

    client.emit('flush');

    expect(transactions).toHaveLength(1);
  });

  it("routes a deferred segment to the span's own client, not whichever client is current at end", () => {
    const otherTransactions: Event[] = [];
    const otherClient = new TestClient(
      getDefaultTestClientOptions({
        dsn,
        tracesSampleRate: 1,
        beforeSendTransaction: event => {
          otherTransactions.push(event);
          return null;
        },
      }),
    );
    otherClient.init();
    _INTERNAL_setDeferSegmentSpanCapture(otherClient);

    // Created while `client` is current, so its captured scope belongs to `client`.
    const root = startInactiveSpan({ name: 'root' });

    // A different client becomes current before the span ends.
    withScope(scope => {
      scope.setClient(otherClient);
      root.end();
    });

    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(1);
    expect(otherTransactions).toHaveLength(0);
  });

  it('emits a late orphan synchronously when its client has no defer queue', () => {
    const orphanTransactions: Event[] = [];
    const noQueueClient = new TestClient(
      getDefaultTestClientOptions({
        dsn,
        tracesSampleRate: 1,
        beforeSendTransaction: event => {
          orphanTransactions.push(event);
          return null;
        },
      }),
    );
    noQueueClient.init();
    // Deliberately not enabling deferral on `noQueueClient`, so it has no queue.

    // Root is captured via `client` (which defers), so it lands in `CAPTURED_SPANS`.
    const root = startInactiveSpan({ name: 'root' });
    // The child's captured scope belongs to the queue-less client.
    const child = withScope(scope => {
      scope.setClient(noQueueClient);
      return withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));
    });

    root.end();
    vi.advanceTimersByTime(100);
    expect(transactions).toHaveLength(1);
    expect(orphanTransactions).toHaveLength(0);

    // Late child on a queue-less client: emitted right away instead of dropped.
    child.end();

    expect(orphanTransactions).toHaveLength(1);
    expect(orphanTransactions[0]!.transaction).toBe('child');
    expect(orphanTransactions[0]!.contexts?.trace?.data?.['sentry.parent_span_already_sent']).toBe(true);
  });

  it('binds the capturing client at span end, ignoring later reassignment of the scope client', () => {
    const laterTransactions: Event[] = [];
    const laterClient = new TestClient(
      getDefaultTestClientOptions({
        dsn,
        tracesSampleRate: 1,
        beforeSendTransaction: event => {
          laterTransactions.push(event);
          return null;
        },
      }),
    );
    laterClient.init();
    _INTERNAL_setDeferSegmentSpanCapture(laterClient);

    const root = startInactiveSpan({ name: 'root' });
    root.end(); // enqueued and bound to `client` (the captured scope's client at span end)

    // The captured scope's own client is reassigned before the debounce fires.
    getCurrentScope().setClient(laterClient);

    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(1);
    expect(laterTransactions).toHaveLength(0);
  });
});
