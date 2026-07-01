import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  startInactiveSpan,
  withActiveSpan,
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

  it('routes an orphan to the client that sent the segment, not the current client after re-init', () => {
    const root = startInactiveSpan({ name: 'root' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));

    root.end();
    vi.advanceTimersByTime(100);
    expect(transactions).toHaveLength(1); // segment sent on the first client

    // A second `Sentry.init()` swaps in a new client mid-trace, before the late child ends.
    const reinitTransactions: Event[] = [];
    const reinitClient = new TestClient(
      getDefaultTestClientOptions({
        dsn,
        tracesSampleRate: 1,
        beforeSendTransaction: event => {
          reinitTransactions.push(event);
          return null;
        },
      }),
    );
    setCurrentClient(reinitClient);
    reinitClient.init();
    _INTERNAL_setDeferSegmentSpanCapture(reinitClient);

    child.end();
    vi.advanceTimersByTime(100);

    // The orphan lands on the segment's client, not the now-current one.
    expect(reinitTransactions).toHaveLength(0);
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
});
