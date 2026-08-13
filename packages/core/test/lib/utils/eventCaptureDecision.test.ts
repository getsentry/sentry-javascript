import { describe, expect, it, vi } from 'vitest';
import type { Event, EventHint, TransactionEvent } from '../../../src/types/event';
import {
  copyEventCaptureDecision,
  notifyEventCaptureDecision,
  setEventCaptureDecisionCallback,
} from '../../../src/utils/eventCaptureDecision';
import { rejectedSyncPromise } from '../../../src/utils/syncpromise';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('eventCaptureDecision', () => {
  it('resolves a capture decision only once across internal hint copies', () => {
    const hint: EventHint = {};
    const callback = vi.fn();
    setEventCaptureDecisionCallback(hint, callback);
    const copiedHint = { ...hint };
    copyEventCaptureDecision(hint, copiedHint);

    notifyEventCaptureDecision(copiedHint, 'accepted');
    notifyEventCaptureDecision(hint, 'rejected');

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith('accepted');
  });

  it('does not expose capture-decision state on event hints', () => {
    const hint: EventHint = {};
    setEventCaptureDecisionCallback(hint, vi.fn());

    expect(Reflect.ownKeys(hint)).toEqual([]);
    expect(Reflect.ownKeys({ ...hint })).toEqual([]);
  });

  it('does not expose capture-decision state to before-send hooks', async () => {
    const beforeSendTransaction = vi.fn((event: TransactionEvent) => event);
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://123@sentry.io/42',
        enableSend: true,
        beforeSendTransaction,
      }),
    );
    client.init();
    const hint: EventHint = {};
    const callback = vi.fn();
    setEventCaptureDecisionCallback(hint, callback);

    client.captureEvent({ type: 'transaction', transaction: 'root' }, hint);

    expect(await client.flush()).toBe(true);
    expect(beforeSendTransaction).toHaveBeenCalledWith(expect.any(Object), { event_id: expect.any(String) });
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith('accepted');
  });

  it('does not let a decision callback throw into event processing', () => {
    const hint: EventHint = {};
    setEventCaptureDecisionCallback(hint, () => {
      throw new Error('observer failed');
    });

    expect(() => notifyEventCaptureDecision(hint, 'accepted')).not.toThrow();
  });

  it('rejects the capture decision when the client promise buffer is full', () => {
    const client = new TestClient(getDefaultTestClientOptions({ transportOptions: { bufferSize: 1 } }));
    client.addEventProcessor(event => {
      return event.message === 'blocking' ? new Promise<never>(() => undefined) : event;
    });
    client.captureEvent({ message: 'blocking' });
    const hint: EventHint = {};
    const callback = vi.fn();
    setEventCaptureDecisionCallback(hint, callback);

    client.captureEvent({ type: 'transaction', transaction: 'overflow' }, hint);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith('rejected');
    expect(client._clearOutcomes()).toEqual([{ reason: 'queue_overflow', category: 'transaction', quantity: 1 }]);
  });

  it('rejects the capture decision when event capture throws before processing', () => {
    class FailingTestClient extends TestClient {
      public captureFailedEvent(hint: EventHint): void {
        this._process(() => rejectedSyncPromise(new Error('capture failed')), 'transaction', hint);
      }
    }
    const client = new FailingTestClient(getDefaultTestClientOptions());
    const hint: EventHint = {};
    const callback = vi.fn();
    setEventCaptureDecisionCallback(hint, callback);

    client.captureFailedEvent(hint);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith('rejected');
  });

  it('rejects the capture decision when an event is deduplicated before processing', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    const originalException = new Error('already captured');
    client.captureEvent({ message: 'first' }, { originalException });
    const hint: EventHint = { originalException };
    const callback = vi.fn();
    setEventCaptureDecisionCallback(hint, callback);

    client.captureEvent({ type: 'transaction', transaction: 'duplicate' }, hint);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith('rejected');
  });

  it('accepts a reentrant capture after releasing the current promise-buffer slot', async () => {
    const capturedEvents: Event[] = [];
    let resolveRoot!: (event: TransactionEvent) => void;
    let rootEvent!: TransactionEvent;
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://123@sentry.io/42',
        enableSend: true,
        transportOptions: { bufferSize: 1 },
        beforeSendTransaction: event => {
          if (event.transaction !== 'root') {
            return event;
          }

          rootEvent = event;
          return new Promise(resolve => {
            resolveRoot = resolve;
          });
        },
      }),
    );
    client.init();
    client.on('beforeSendEvent', event => capturedEvents.push(event));
    const childDecision = vi.fn();
    const rootHint: EventHint = {};
    setEventCaptureDecisionCallback(rootHint, decision => {
      expect(decision).toBe('accepted');
      const childHint: EventHint = {};
      setEventCaptureDecisionCallback(childHint, childDecision);
      client.captureEvent({ type: 'transaction', transaction: 'child' }, childHint);
    });

    client.captureEvent({ type: 'transaction', transaction: 'root' }, rootHint);
    resolveRoot(rootEvent);

    expect(await client.flush()).toBe(true);
    expect(capturedEvents.map(event => event.transaction)).toEqual(['root', 'child']);
    expect(childDecision).toHaveBeenCalledOnce();
    expect(childDecision).toHaveBeenCalledWith('accepted');
    expect(client._clearOutcomes()).toEqual([]);
  });
});
