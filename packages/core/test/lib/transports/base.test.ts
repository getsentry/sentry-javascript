import type { AttachmentItem, EventEnvelope, EventItem, TransportMakeRequestResponse } from '@sentry/types';
import type { PromiseBuffer } from '@sentry/utils';
import { createEnvelope, resolvedSyncPromise, serializeEnvelope } from '@sentry/utils';
import { TextEncoder } from 'util';

import { createTransport } from '../../../src/transports/base';

const ERROR_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

const TRANSACTION_ENVELOPE = createEnvelope<EventEnvelope>(
  { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' },
  [[{ type: 'transaction' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem],
);

const ATTACHMENT_ENVELOPE = createEnvelope<EventEnvelope>(
  { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' },
  [
    [
      {
        type: 'attachment',
        length: 20,
        filename: 'test-file.txt',
        content_type: 'text/plain',
        attachment_type: 'text',
      },
      'attachment content',
    ] as AttachmentItem,
  ],
);

const transportOptions = {
  recordDroppedEvent: () => undefined, // noop
  textEncoder: new TextEncoder(),
};

describe('createTransport', () => {
  it('flushes the buffer', async () => {
    const mockBuffer: PromiseBuffer<void> = {
      $: [],
      add: jest.fn(),
      drain: jest.fn(),
    };
    const transport = createTransport(transportOptions, _ => resolvedSyncPromise({}), mockBuffer);
    /* eslint-disable @typescript-eslint/unbound-method */
    expect(mockBuffer.drain).toHaveBeenCalledTimes(0);
    await transport.flush(1000);
    expect(mockBuffer.drain).toHaveBeenCalledTimes(1);
    expect(mockBuffer.drain).toHaveBeenLastCalledWith(1000);
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  describe('send', () => {
    it('constructs a request to send to Sentry', async () => {
      expect.assertions(1);
      const transport = createTransport(transportOptions, req => {
        expect(req.body).toEqual(serializeEnvelope(ERROR_ENVELOPE, new TextEncoder()));
        return resolvedSyncPromise({});
      });
      await transport.send(ERROR_ENVELOPE);
    });

    it('does throw if request fails', async () => {
      expect.assertions(2);

      const transport = createTransport(transportOptions, req => {
        expect(req.body).toEqual(serializeEnvelope(ERROR_ENVELOPE, new TextEncoder()));
        throw new Error();
      });

      expect(() => {
        void transport.send(ERROR_ENVELOPE);
      }).toThrow();
    });

    describe('Rate-limiting', () => {
      function setRateLimitTimes(): {
        retryAfterSeconds: number;
        beforeLimit: number;
        withinLimit: number;
        afterLimit: number;
      } {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;
        return { retryAfterSeconds, beforeLimit, withinLimit, afterLimit };
      }

      function createTestTransport(initialTransportResponse: TransportMakeRequestResponse) {
        let transportResponse: TransportMakeRequestResponse = initialTransportResponse;

        function setTransportResponse(res: TransportMakeRequestResponse) {
          transportResponse = res;
        }

        const mockRequestExecutor = jest.fn(_ => {
          return resolvedSyncPromise(transportResponse);
        });

        const mockRecordDroppedEventCallback = jest.fn();

        const transport = createTransport(
          { recordDroppedEvent: mockRecordDroppedEventCallback, textEncoder: new TextEncoder() },
          mockRequestExecutor,
        );

        return [transport, setTransportResponse, mockRequestExecutor, mockRecordDroppedEventCallback] as const;
      }

      it('back-off _after_ Retry-After header was received', async () => {
        const { retryAfterSeconds, beforeLimit, withinLimit, afterLimit } = setRateLimitTimes();
        const [transport, setTransportResponse, requestExecutor, recordDroppedEventCallback] = createTestTransport({});

        const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => beforeLimit);

        await transport.send(ERROR_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        setTransportResponse({
          headers: {
            'x-sentry-rate-limits': null,
            'retry-after': `${retryAfterSeconds}`,
          },
        });

        await transport.send(ERROR_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        // act like were in the rate limited period
        dateNowSpy.mockImplementation(() => withinLimit);

        await transport.send(ERROR_ENVELOPE);
        expect(requestExecutor).not.toHaveBeenCalled();
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'error', {
          event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
        });
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        // act like it's after the rate limited period
        dateNowSpy.mockImplementation(() => afterLimit);

        await transport.send(ERROR_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
      });

      it('back-off using X-Sentry-Rate-Limits with single category', async () => {
        const { retryAfterSeconds, beforeLimit, withinLimit, afterLimit } = setRateLimitTimes();
        const [transport, setTransportResponse, requestExecutor, recordDroppedEventCallback] = createTestTransport({
          headers: {
            'x-sentry-rate-limits': `${retryAfterSeconds}:error:scope`,
            'retry-after': null,
          },
        });

        const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => beforeLimit);

        await transport.send(ERROR_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        setTransportResponse({});

        // act like were in the rate limited period
        dateNowSpy.mockImplementation(() => withinLimit);

        await transport.send(TRANSACTION_ENVELOPE); // Transaction envelope should be sent
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        await transport.send(ERROR_ENVELOPE); // Error envelope should not be sent because of pending rate limit
        expect(requestExecutor).not.toHaveBeenCalled();
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'error', {
          event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
        });
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        // act like it's after the rate limited period
        dateNowSpy.mockImplementation(() => afterLimit);

        await transport.send(TRANSACTION_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        await transport.send(ERROR_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
      });

      it('back-off using X-Sentry-Rate-Limits with multiple categories', async () => {
        const { retryAfterSeconds, beforeLimit, withinLimit, afterLimit } = setRateLimitTimes();
        const [transport, setTransportResponse, requestExecutor, recordDroppedEventCallback] = createTestTransport({
          headers: {
            'x-sentry-rate-limits': `${retryAfterSeconds}:error;transaction;attachment:scope`,
            'retry-after': null,
          },
        });

        const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => beforeLimit);

        await transport.send(ERROR_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        setTransportResponse({});

        // act like were in the rate limited period
        dateNowSpy.mockImplementation(() => withinLimit);

        await transport.send(TRANSACTION_ENVELOPE); // Transaction envelope should not be sent because of pending rate limit
        expect(requestExecutor).not.toHaveBeenCalled();
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'transaction', {
          event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
        });
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        await transport.send(ERROR_ENVELOPE); // Error envelope should not be sent because of pending rate limit
        expect(requestExecutor).not.toHaveBeenCalled();
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'error', {
          event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
        });
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        await transport.send(ATTACHMENT_ENVELOPE); // Attachment envelope should not be sent because of pending rate limit
        expect(requestExecutor).not.toHaveBeenCalled();
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'attachment', undefined);
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        // act like it's after the rate limited period
        dateNowSpy.mockImplementation(() => afterLimit);

        await transport.send(TRANSACTION_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        await transport.send(ERROR_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        await transport.send(ATTACHMENT_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
      });

      it('back-off using X-Sentry-Rate-Limits with missing categories should lock them all', async () => {
        const { retryAfterSeconds, beforeLimit, withinLimit, afterLimit } = setRateLimitTimes();
        const [transport, setTransportResponse, requestExecutor, recordDroppedEventCallback] = createTestTransport({
          headers: {
            'x-sentry-rate-limits': `${retryAfterSeconds}::scope`,
            'retry-after': null,
          },
        });

        const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => beforeLimit);

        await transport.send(ERROR_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        setTransportResponse({});

        // act like were in the rate limited period
        dateNowSpy.mockImplementation(() => withinLimit);

        await transport.send(TRANSACTION_ENVELOPE); // Transaction envelope should not be sent because of pending rate limit
        expect(requestExecutor).not.toHaveBeenCalled();
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'transaction', {
          event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
        });
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        await transport.send(ERROR_ENVELOPE); // Error envelope should not be sent because of pending rate limit
        expect(requestExecutor).not.toHaveBeenCalled();
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'error', {
          event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
        });
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        // act like it's after the rate limited period
        dateNowSpy.mockImplementation(() => afterLimit);

        await transport.send(TRANSACTION_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        await transport.send(ERROR_ENVELOPE);
        expect(requestExecutor).toHaveBeenCalledTimes(1);
        expect(recordDroppedEventCallback).not.toHaveBeenCalled();
      });
    });
  });
});
