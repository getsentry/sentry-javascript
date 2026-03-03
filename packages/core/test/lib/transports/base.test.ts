import { describe, expect, it, vi } from 'vitest';
import { createTransport } from '../../../src/transports/base';
import type { ClientReport } from '../../../src/types-hoist/clientreport';
import type { AttachmentItem, EventEnvelope, EventItem } from '../../../src/types-hoist/envelope';
import type { TransportMakeRequestResponse } from '../../../src/types-hoist/transport';
import { createClientReportEnvelope } from '../../../src/utils/clientreport';
import { createEnvelope, serializeEnvelope } from '../../../src/utils/envelope';
import { type PromiseBuffer, SENTRY_BUFFER_FULL_ERROR } from '../../../src/utils/promisebuffer';
import { resolvedSyncPromise } from '../../../src/utils/syncpromise';

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
        attachment_type: 'event.attachment',
      },
      'attachment content',
    ] as AttachmentItem,
  ],
);

const defaultDiscardedEvents: ClientReport['discarded_events'] = [
  {
    reason: 'before_send',
    category: 'error',
    quantity: 30,
  },
  {
    reason: 'network_error',
    category: 'transaction',
    quantity: 23,
  },
];

const CLIENT_REPORT_ENVELOPE = createClientReportEnvelope(
  defaultDiscardedEvents,
  'https://public@dsn.ingest.sentry.io/1337',
  123456,
);

const transportOptions = {
  recordDroppedEvent: () => undefined, // noop
};

describe('createTransport', () => {
  it('flushes the buffer', async () => {
    const mockBuffer: PromiseBuffer<TransportMakeRequestResponse> = {
      $: [],
      add: vi.fn(),
      drain: vi.fn(),
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
        expect(req.body).toEqual(serializeEnvelope(ERROR_ENVELOPE));
        return resolvedSyncPromise({});
      });
      await transport.send(ERROR_ENVELOPE);
    });

    it('does throw if request fails', async () => {
      expect.assertions(2);

      const transport = createTransport(transportOptions, req => {
        expect(req.body).toEqual(serializeEnvelope(ERROR_ENVELOPE));
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

        const mockRequestExecutor = vi.fn(_ => {
          return resolvedSyncPromise(transportResponse);
        });

        const mockRecordDroppedEventCallback = vi.fn();

        const transport = createTransport({ recordDroppedEvent: mockRecordDroppedEventCallback }, mockRequestExecutor);

        return [transport, setTransportResponse, mockRequestExecutor, mockRecordDroppedEventCallback] as const;
      }

      it('back-off _after_ Retry-After header was received', async () => {
        const { retryAfterSeconds, beforeLimit, withinLimit, afterLimit } = setRateLimitTimes();
        const [transport, setTransportResponse, requestExecutor, recordDroppedEventCallback] = createTestTransport({});

        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => beforeLimit);

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
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'error');
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

        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => beforeLimit);

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
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'error');
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

        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => beforeLimit);

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
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'transaction');
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        await transport.send(ERROR_ENVELOPE); // Error envelope should not be sent because of pending rate limit
        expect(requestExecutor).not.toHaveBeenCalled();
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'error');
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        await transport.send(ATTACHMENT_ENVELOPE); // Attachment envelope should not be sent because of pending rate limit
        expect(requestExecutor).not.toHaveBeenCalled();
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'attachment');
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

        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => beforeLimit);

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
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'transaction');
        requestExecutor.mockClear();
        recordDroppedEventCallback.mockClear();

        await transport.send(ERROR_ENVELOPE); // Error envelope should not be sent because of pending rate limit
        expect(requestExecutor).not.toHaveBeenCalled();
        expect(recordDroppedEventCallback).toHaveBeenCalledWith('ratelimit_backoff', 'error');
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

    describe('Client Reports', () => {
      it('should not record outcomes when client reports fail to send', async () => {
        expect.assertions(2);

        const mockRecordDroppedEventCallback = vi.fn();

        const transport = createTransport({ recordDroppedEvent: mockRecordDroppedEventCallback }, req => {
          expect(req.body).toEqual(serializeEnvelope(CLIENT_REPORT_ENVELOPE));
          return Promise.reject(new Error('Network error'));
        });

        try {
          await transport.send(CLIENT_REPORT_ENVELOPE);
        } catch (e) {
          // Expected to throw
        }

        // recordDroppedEvent should NOT be called when a client report fails
        expect(mockRecordDroppedEventCallback).not.toHaveBeenCalled();
      });

      it('should not record outcomes when client reports fail due to buffer overflow', async () => {
        expect.assertions(2);

        const mockRecordDroppedEventCallback = vi.fn();
        const mockBuffer: PromiseBuffer<TransportMakeRequestResponse> = {
          $: [],
          add: vi.fn(() => Promise.reject(SENTRY_BUFFER_FULL_ERROR)),
          drain: vi.fn(),
        };

        const transport = createTransport(
          { recordDroppedEvent: mockRecordDroppedEventCallback },
          _ => resolvedSyncPromise({}),
          mockBuffer,
        );

        const result = await transport.send(CLIENT_REPORT_ENVELOPE);

        // Should resolve without throwing
        expect(result).toEqual({});
        // recordDroppedEvent should NOT be called when a client report fails
        expect(mockRecordDroppedEventCallback).not.toHaveBeenCalled();
      });

      it('should record outcomes when regular events fail to send', async () => {
        expect.assertions(2);

        const mockRecordDroppedEventCallback = vi.fn();

        const transport = createTransport({ recordDroppedEvent: mockRecordDroppedEventCallback }, req => {
          expect(req.body).toEqual(serializeEnvelope(ERROR_ENVELOPE));
          return Promise.reject(new Error('Network error'));
        });

        try {
          await transport.send(ERROR_ENVELOPE);
        } catch (e) {
          // Expected to throw
        }

        // recordDroppedEvent SHOULD be called for regular events
        expect(mockRecordDroppedEventCallback).toHaveBeenCalledWith('network_error', 'error');
      });
    });

    describe('HTTP 413 Content Too Large', () => {
      it('should record send_error outcome when receiving 413 response', async () => {
        const mockRecordDroppedEventCallback = vi.fn();

        const transport = createTransport({ recordDroppedEvent: mockRecordDroppedEventCallback }, () =>
          resolvedSyncPromise({ statusCode: 413 }),
        );

        const result = await transport.send(ERROR_ENVELOPE);

        // Should resolve without throwing
        expect(result).toEqual({ statusCode: 413 });
        // recordDroppedEvent SHOULD be called with send_error reason
        expect(mockRecordDroppedEventCallback).toHaveBeenCalledWith('send_error', 'error');
      });

      it('should record send_error for each item in envelope when receiving 413', async () => {
        const mockRecordDroppedEventCallback = vi.fn();

        const multiItemEnvelope = createEnvelope<EventEnvelope>(
          { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' },
          [
            [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
            [{ type: 'transaction' }, { event_id: 'bb3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
          ],
        );

        const transport = createTransport({ recordDroppedEvent: mockRecordDroppedEventCallback }, () =>
          resolvedSyncPromise({ statusCode: 413 }),
        );

        await transport.send(multiItemEnvelope);

        // recordDroppedEvent SHOULD be called for each item
        expect(mockRecordDroppedEventCallback).toHaveBeenCalledTimes(2);
        expect(mockRecordDroppedEventCallback).toHaveBeenCalledWith('send_error', 'error');
        expect(mockRecordDroppedEventCallback).toHaveBeenCalledWith('send_error', 'transaction');
      });

      it('should not record outcomes for client reports when receiving 413', async () => {
        const mockRecordDroppedEventCallback = vi.fn();

        const transport = createTransport({ recordDroppedEvent: mockRecordDroppedEventCallback }, () =>
          resolvedSyncPromise({ statusCode: 413 }),
        );

        const result = await transport.send(CLIENT_REPORT_ENVELOPE);

        // Should resolve without throwing
        expect(result).toEqual({ statusCode: 413 });
        // recordDroppedEvent should NOT be called for client reports to avoid feedback loop
        expect(mockRecordDroppedEventCallback).not.toHaveBeenCalled();
      });

      it('should not apply rate limits after receiving 413', async () => {
        const mockRecordDroppedEventCallback = vi.fn();
        const mockRequestExecutor = vi.fn(() => resolvedSyncPromise({ statusCode: 413 }));

        const transport = createTransport({ recordDroppedEvent: mockRecordDroppedEventCallback }, mockRequestExecutor);

        // First request gets 413
        await transport.send(ERROR_ENVELOPE);
        expect(mockRequestExecutor).toHaveBeenCalledTimes(1);
        expect(mockRecordDroppedEventCallback).toHaveBeenCalledWith('send_error', 'error');
        mockRequestExecutor.mockClear();
        mockRecordDroppedEventCallback.mockClear();

        // Second request should still be sent (no rate limiting applied from 413)
        mockRequestExecutor.mockImplementation(() => resolvedSyncPromise({}));
        await transport.send(ERROR_ENVELOPE);
        expect(mockRequestExecutor).toHaveBeenCalledTimes(1);
        // No send_error recorded for successful request
        expect(mockRecordDroppedEventCallback).not.toHaveBeenCalled();
      });
    });
  });
});
