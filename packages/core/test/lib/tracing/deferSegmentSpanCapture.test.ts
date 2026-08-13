import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentScope,
  setCurrentClient,
  spanStreamingIntegration,
  startInactiveSpan,
  withActiveSpan,
  withScope,
} from '../../../src';
import { _INTERNAL_setDeferSegmentSpanCapture } from '../../../src/tracing/deferSegmentSpanCapture';
import {
  getSegmentSpanCaptureStrategy,
  setSegmentSpanCaptureStrategy,
} from '../../../src/tracing/segmentSpanCaptureStrategy';
import type { Event, TransactionEvent } from '../../../src/types/event';
import { getDefaultTestClientOptions, TestClient, type TestClientOptions } from '../../mocks/client';
import { resetGlobals } from '../../testutils';

const dsn = 'https://123@sentry.io/42';

function createDeferredClient(capturedTransactions: Event[], options: Partial<TestClientOptions> = {}): TestClient {
  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn,
      tracesSampleRate: 1,
      enableSend: true,
      ...options,
    }),
  );
  client.init();
  _INTERNAL_setDeferSegmentSpanCapture(client);
  client.on('beforeSendEvent', event => {
    capturedTransactions.push(event);
  });
  return client;
}

describe('_INTERNAL_setDeferSegmentSpanCapture', () => {
  afterEach(() => {
    setSegmentSpanCaptureStrategy(undefined);
  });

  it('registers the global capture strategy', () => {
    expect(getSegmentSpanCaptureStrategy()).toBeUndefined();

    _INTERNAL_setDeferSegmentSpanCapture(new TestClient(getDefaultTestClientOptions()));

    expect(getSegmentSpanCaptureStrategy()).toBeDefined();
  });

  it('registers the client flush listener once and is idempotent on repeated enable', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    const onSpy = vi.spyOn(client, 'on');

    _INTERNAL_setDeferSegmentSpanCapture(client);
    _INTERNAL_setDeferSegmentSpanCapture(client);

    expect(onSpy.mock.calls.filter(([hook]) => hook === 'flush')).toHaveLength(1);
    expect(onSpy.mock.calls.filter(([hook]) => hook === 'beforeSendEvent')).toHaveLength(0);
  });
});

describe('deferred segment-span capture', () => {
  let transactions: Event[];
  let client: TestClient;

  beforeEach(() => {
    vi.useFakeTimers();

    resetGlobals();

    transactions = [];
    client = createDeferredClient(transactions);
    setCurrentClient(client);
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

  it('captures once a child created and ended after its segment but before the queued snapshot', () => {
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));
    child.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root', 'child']);
    expect(transactions[0]?.spans).toEqual([]);
    expect(transactions[1]?.contexts?.trace?.data?.['sentry.parent_span_already_sent']).toBe(true);
  });

  it('suppresses a child created after a queued segment which is rejected', () => {
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => (event.transaction === 'root' ? null : event),
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));
    child.end();
    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(0);
  });

  it('passes the exact segment span through the capture strategy seam', () => {
    const onSegmentSpanEnded = vi.fn();
    setSegmentSpanCaptureStrategy({
      onSegmentSpanEnded,
      onChildSpanEnded: vi.fn(),
    });
    const root = startInactiveSpan({ name: 'root' });

    root.end();

    expect(onSegmentSpanEnded).toHaveBeenCalledWith(root, expect.any(Function), expect.any(Object));
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

  it('does not emit a grandchild already captured by its late parent', () => {
    const root = startInactiveSpan({ name: 'root' });
    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    const grandchild = withActiveSpan(parent, () => startInactiveSpan({ name: 'grandchild' }));

    root.end();
    vi.advanceTimersByTime(100);
    parent.end();
    grandchild.end();
    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(2);
    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root', 'parent']);
    expect(transactions[1]?.spans).toEqual([expect.objectContaining({ description: 'grandchild' })]);
  });

  it('coalesces a grandchild that ends before its queued late parent', () => {
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    vi.advanceTimersByTime(100);

    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    const grandchild = withActiveSpan(parent, () => startInactiveSpan({ name: 'grandchild' }));
    grandchild.end();
    parent.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root', 'parent']);
    expect(transactions[1]?.spans).toEqual([expect.objectContaining({ description: 'grandchild' })]);
  });

  it('suppresses a grandchild that ends after its late parent orphan is rejected', () => {
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => (event.transaction === 'parent' ? null : event),
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });
    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    const grandchild = withActiveSpan(parent, () => startInactiveSpan({ name: 'grandchild' }));

    root.end();
    vi.advanceTimersByTime(100);
    parent.end();
    vi.advanceTimersByTime(100);
    grandchild.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root']);
  });

  it('does not retroactively discard a grandchild accepted before its open parent is rejected', () => {
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => (event.transaction === 'parent' ? null : event),
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    vi.advanceTimersByTime(100);

    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    const grandchild = withActiveSpan(parent, () => startInactiveSpan({ name: 'grandchild' }));
    grandchild.end();
    vi.advanceTimersByTime(100);
    parent.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root', 'grandchild']);
  });

  it('does not include an unfinished descendant of a rejected orphan in a later ancestor event', () => {
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => (event.transaction === 'child' ? null : event),
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    vi.advanceTimersByTime(100);

    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    const child = withActiveSpan(parent, () => startInactiveSpan({ name: 'child' }));
    const grandchild = withActiveSpan(child, () => startInactiveSpan({ name: 'grandchild' }));
    child.end();
    vi.advanceTimersByTime(100);
    grandchild.end();
    parent.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root', 'parent']);
    expect(transactions[1]?.spans).toEqual([]);
  });

  it('suppresses a grandchild queued before its late parent orphan is rejected', () => {
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => (event.transaction === 'parent' ? null : event),
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });
    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    const grandchild = withActiveSpan(parent, () => startInactiveSpan({ name: 'grandchild' }));

    root.end();
    vi.advanceTimersByTime(100);
    parent.end();
    grandchild.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root']);
  });

  it('suppresses a grandchild that ends before its queued late parent orphan is rejected', () => {
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => (event.transaction === 'parent' ? null : event),
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    vi.advanceTimersByTime(100);

    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    const grandchild = withActiveSpan(parent, () => startInactiveSpan({ name: 'grandchild' }));
    grandchild.end();
    parent.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root']);
  });

  it('waits to suppress a grandchild that ends while its late parent orphan decision is pending', async () => {
    let rejectParent!: () => void;
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => {
        if (event.transaction !== 'parent') {
          return event;
        }

        return new Promise<null>(resolve => {
          rejectParent = () => resolve(null);
        });
      },
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });
    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    const grandchild = withActiveSpan(parent, () => startInactiveSpan({ name: 'grandchild' }));

    root.end();
    vi.advanceTimersByTime(100);
    parent.end();
    vi.advanceTimersByTime(100);
    grandchild.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root']);

    rejectParent();
    await vi.runAllTimersAsync();

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root']);
  });

  it('reparents a queued grandchild when its late parent decision becomes pending first', async () => {
    let rejectParent!: () => void;
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => {
        if (event.transaction !== 'parent') {
          return event;
        }

        return new Promise<null>(resolve => {
          rejectParent = () => resolve(null);
        });
      },
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    vi.advanceTimersByTime(100);

    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    parent.end();
    const grandchild = withActiveSpan(parent, () => startInactiveSpan({ name: 'grandchild' }));
    grandchild.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root']);

    rejectParent();
    await vi.runAllTimersAsync();

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root']);
  });

  it('captures an untracked descendant exactly once after its queued ancestor is accepted', () => {
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    vi.advanceTimersByTime(100);

    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    parent.end();
    const child = withActiveSpan(parent, () => startInactiveSpan({ name: 'child' }));
    child.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root', 'parent', 'child']);
  });

  it('drains an untracked descendant of a queued span subsumed by an accepted ancestor', () => {
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    vi.advanceTimersByTime(100);

    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    const child = withActiveSpan(parent, () => startInactiveSpan({ name: 'child' }));
    child.end();
    const descendant = withActiveSpan(child, () => startInactiveSpan({ name: 'descendant' }));
    descendant.end();
    parent.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root', 'parent', 'descendant']);
    expect(transactions[1]?.spans).toEqual([expect.objectContaining({ description: 'child' })]);
  });

  it('discards an untracked descendant of a queued span subsumed by a rejected ancestor', () => {
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => (event.transaction === 'parent' ? null : event),
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    vi.advanceTimersByTime(100);

    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    const child = withActiveSpan(parent, () => startInactiveSpan({ name: 'child' }));
    child.end();
    const descendant = withActiveSpan(child, () => startInactiveSpan({ name: 'descendant' }));
    descendant.end();
    parent.end();
    vi.advanceTimersByTime(100);

    const futureDescendant = withActiveSpan(child, () => startInactiveSpan({ name: 'future descendant' }));
    futureDescendant.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root']);
  });

  it('lets a child client close without waiting for a queued parent owned by another client', async () => {
    const childTransactions: Event[] = [];
    const childClient = createDeferredClient(childTransactions);
    const childSendEnvelope = vi.spyOn(childClient, 'sendEnvelope');
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    vi.advanceTimersByTime(100);

    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    parent.end();
    const child = withScope(scope => {
      scope.setClient(childClient);
      return withActiveSpan(parent, () => startInactiveSpan({ name: 'child' }));
    });
    child.end();

    const childClose = childClient.close();
    await vi.runAllTimersAsync();
    expect(await childClose).toBe(true);
    expect(childTransactions.map(transaction => transaction.transaction)).toEqual(['child']);
    expect(childSendEnvelope).toHaveBeenCalledOnce();

    const parentFlush = client.flush();
    await vi.runAllTimersAsync();
    expect(await parentFlush).toBe(true);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root', 'parent']);
    expect(childTransactions.map(transaction => transaction.transaction)).toEqual(['child']);
    expect(childSendEnvelope).toHaveBeenCalledOnce();
  });

  it('does not leave a no-client child pending under another client', () => {
    const descendantTransactions: Event[] = [];
    const descendantClient = createDeferredClient(descendantTransactions);
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    vi.advanceTimersByTime(100);

    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    parent.end();
    let childScope!: ReturnType<typeof getCurrentScope>;
    const child = withScope(scope => {
      childScope = scope;
      return withActiveSpan(parent, () => startInactiveSpan({ name: 'child' }));
    });
    childScope.setClient(undefined);
    child.end();
    vi.advanceTimersByTime(100);

    const descendant = withScope(scope => {
      scope.setClient(descendantClient);
      return withActiveSpan(child, () => startInactiveSpan({ name: 'descendant' }));
    });
    descendant.end();
    descendantClient.emit('flush');

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root', 'parent', 'child']);
    expect(descendantTransactions.map(transaction => transaction.transaction)).toEqual(['descendant']);
  });

  it('still captures a late sibling after another orphan subtree is rejected', () => {
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => (event.transaction === 'parent' ? null : event),
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });
    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    const grandchild = withActiveSpan(parent, () => startInactiveSpan({ name: 'grandchild' }));
    const sibling = withActiveSpan(root, () => startInactiveSpan({ name: 'sibling' }));

    root.end();
    vi.advanceTimersByTime(100);
    parent.end();
    vi.advanceTimersByTime(100);
    grandchild.end();
    sibling.end();
    vi.advanceTimersByTime(100);

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root', 'sibling']);
  });

  it('leaves a late child on a stream client to the streaming lifecycle', () => {
    const streamTransactions: Event[] = [];
    const streamClient = createDeferredClient(streamTransactions, {
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'stream',
    });
    const sendEnvelopeSpy = vi.spyOn(streamClient, 'sendEnvelope');
    const root = startInactiveSpan({ name: 'root' });
    const child = withScope(scope => {
      scope.setClient(streamClient);
      return withActiveSpan(root, () => startInactiveSpan({ name: 'streamed child' }));
    });

    root.end();
    vi.advanceTimersByTime(100);
    withScope(scope => {
      scope.setClient(streamClient);
      child.end();
    });
    streamClient.emit('flush');

    expect(transactions).toHaveLength(1);
    expect(streamTransactions).toHaveLength(0);
    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
    expect(sendEnvelopeSpy).toHaveBeenCalledWith([
      expect.any(Object),
      [
        [
          {
            type: 'span',
            item_count: 1,
            content_type: 'application/vnd.sentry.items.span.v2+json',
          },
          {
            version: 2,
            items: [expect.objectContaining({ name: 'streamed child' })],
          },
        ],
      ],
    ]);
  });

  it('does not emit a late child when beforeSendTransaction drops its segment', () => {
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => (event.transaction === 'root' ? null : event),
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));

    root.end();
    vi.advanceTimersByTime(100);
    child.end();
    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(0);
  });

  it('rejects the segment when a later beforeSendEvent listener throws', () => {
    const observedTransactions: Event[] = [];
    client = new TestClient(getDefaultTestClientOptions({ dsn, tracesSampleRate: 1, enableSend: true }));
    client.init();
    _INTERNAL_setDeferSegmentSpanCapture(client);
    const failingBeforeSendEvent = vi.fn((event: Event) => {
      if (event.type === 'transaction') {
        throw new Error('later listener failed');
      }
    });
    client.on('beforeSendEvent', failingBeforeSendEvent);
    client.on('beforeSendEvent', event => {
      if (event.type === 'transaction') {
        observedTransactions.push(event);
      }
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));

    root.end();
    vi.advanceTimersByTime(100);
    child.end();
    vi.advanceTimersByTime(100);

    expect(failingBeforeSendEvent.mock.calls.filter(([event]) => event.type === 'transaction')).toHaveLength(1);
    expect(observedTransactions).toHaveLength(0);
  });

  it('does not emit a late child when an event processor drops its segment', () => {
    client.addEventProcessor(event => (event.transaction === 'root' ? null : event));
    const root = startInactiveSpan({ name: 'root' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));

    root.end();
    vi.advanceTimersByTime(100);
    child.end();
    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(0);
  });

  it('waits for an asynchronous beforeSendTransaction decision before emitting a late child', async () => {
    let resolveSegment!: (event: TransactionEvent) => void;
    let segmentEvent!: TransactionEvent;
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => {
        if (event.transaction !== 'root') {
          return event;
        }

        segmentEvent = event;
        return new Promise(resolve => {
          resolveSegment = resolve;
        });
      },
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));

    root.end();
    vi.advanceTimersByTime(100);
    child.end();
    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(0);

    resolveSegment(segmentEvent);
    await vi.runAllTimersAsync();

    expect(transactions).toHaveLength(2);
    expect(transactions.map(transaction => transaction.transaction).sort()).toEqual(['child', 'root']);
  });

  it('captures a queued late child after an asynchronous segment decision frees a full promise buffer', async () => {
    let resolveSegment!: (event: TransactionEvent) => void;
    let segmentEvent!: TransactionEvent;
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => {
        if (event.transaction !== 'root') {
          return event;
        }

        segmentEvent = event;
        return new Promise(resolve => {
          resolveSegment = resolve;
        });
      },
      transportOptions: { bufferSize: 1 },
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));

    root.end();
    vi.advanceTimersByTime(100);
    child.end();
    vi.advanceTimersByTime(100);

    const flushPromise = client.flush();
    resolveSegment(segmentEvent);
    await vi.runAllTimersAsync();

    expect(await flushPromise).toBe(true);
    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root', 'child']);
    expect(client._clearOutcomes()).toEqual([]);
  });

  it('coalesces reverse-ended descendants waiting on an asynchronous segment decision', async () => {
    let resolveSegment!: (event: TransactionEvent) => void;
    let segmentEvent!: TransactionEvent;
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => {
        if (event.transaction !== 'root') {
          return event;
        }

        segmentEvent = event;
        return new Promise(resolve => {
          resolveSegment = resolve;
        });
      },
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });

    root.end();
    vi.advanceTimersByTime(100);

    const parent = withActiveSpan(root, () => startInactiveSpan({ name: 'parent' }));
    const grandchild = withActiveSpan(parent, () => startInactiveSpan({ name: 'grandchild' }));
    grandchild.end();
    parent.end();
    vi.advanceTimersByTime(100);

    resolveSegment(segmentEvent);
    await vi.runAllTimersAsync();

    expect(transactions.map(transaction => transaction.transaction)).toEqual(['root', 'parent']);
    expect(transactions[1]?.spans).toEqual([expect.objectContaining({ description: 'grandchild' })]);
  });

  it('suppresses a late child when an asynchronous beforeSendTransaction drops its segment', async () => {
    let resolveSegment!: () => void;
    client = createDeferredClient(transactions, {
      beforeSendTransaction: event => {
        if (event.transaction !== 'root') {
          return event;
        }

        return new Promise<null>(resolve => {
          resolveSegment = () => resolve(null);
        });
      },
    });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));

    root.end();
    vi.advanceTimersByTime(100);
    child.end();
    vi.advanceTimersByTime(100);

    resolveSegment();
    await vi.runAllTimersAsync();

    const futureChild = withActiveSpan(root, () => startInactiveSpan({ name: 'future child' }));
    futureChild.end();
    await vi.runAllTimersAsync();

    expect(transactions).toHaveLength(0);
  });

  it('does not emit transactions for a negatively sampled segment', () => {
    client = createDeferredClient(transactions, { tracesSampleRate: 0 });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));

    root.end();
    child.end();
    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(0);
  });

  it('does not emit transactions when spans use the streaming lifecycle', () => {
    client = createDeferredClient(transactions, { traceLifecycle: 'stream' });
    setCurrentClient(client);
    const root = startInactiveSpan({ name: 'root' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'child' }));

    child.end();
    root.end();
    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(0);
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
    const otherClient = createDeferredClient(otherTransactions);

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
    const noQueueClient = new TestClient(getDefaultTestClientOptions({ dsn, tracesSampleRate: 1, enableSend: true }));
    noQueueClient.init();
    noQueueClient.on('beforeSendEvent', event => {
      orphanTransactions.push(event);
    });
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
    const laterClient = createDeferredClient(laterTransactions);

    const root = startInactiveSpan({ name: 'root' });
    root.end(); // enqueued and bound to `client` (the captured scope's client at span end)

    // The captured scope's own client is reassigned before the debounce fires.
    getCurrentScope().setClient(laterClient);

    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(1);
    expect(laterTransactions).toHaveLength(0);
  });
});
