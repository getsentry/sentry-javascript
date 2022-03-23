import { EventEnvelope, EventItem } from '@sentry/types';
import { createEnvelope, PromiseBuffer, resolvedSyncPromise, serializeEnvelope } from '@sentry/utils';

import {
  createTransport,
  ERROR_TRANSPORT_CATEGORY,
  NewTransport,
  TRANSACTION_TRANSPORT_CATEGORY,
  TransportMakeRequestResponse,
  TransportResponse,
} from '../../../src/transports/base';

const ERROR_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

const TRANSACTION_ENVELOPE = createEnvelope<EventEnvelope>(
  { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' },
  [[{ type: 'transaction' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem],
);

describe('createTransport', () => {
  it('flushes the buffer', async () => {
    const mockBuffer: PromiseBuffer<TransportResponse> = {
      $: [],
      add: jest.fn(),
      drain: jest.fn(),
    };
    const transport = createTransport({}, _ => resolvedSyncPromise({ statusCode: 200 }), mockBuffer);
    /* eslint-disable @typescript-eslint/unbound-method */
    expect(mockBuffer.drain).toHaveBeenCalledTimes(0);
    await transport.flush(1000);
    expect(mockBuffer.drain).toHaveBeenCalledTimes(1);
    expect(mockBuffer.drain).toHaveBeenLastCalledWith(1000);
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  describe('send', () => {
    it('constructs a request to send to Sentry', async () => {
      const transport = createTransport({}, req => {
        expect(req.category).toEqual(ERROR_TRANSPORT_CATEGORY);
        expect(req.body).toEqual(serializeEnvelope(ERROR_ENVELOPE));
        return resolvedSyncPromise({ statusCode: 200, reason: 'OK' });
      });
      const res = await transport.send(ERROR_ENVELOPE);
      expect(res.status).toBe('success');
      expect(res.reason).toBe('OK');
    });

    it('returns an error if request failed', async () => {
      const transport = createTransport({}, req => {
        expect(req.category).toEqual(ERROR_TRANSPORT_CATEGORY);
        expect(req.body).toEqual(serializeEnvelope(ERROR_ENVELOPE));
        return resolvedSyncPromise({ statusCode: 400, reason: 'Bad Request' });
      });
      try {
        await transport.send(ERROR_ENVELOPE);
      } catch (res) {
        expect(res.status).toBe('invalid');
        expect(res.reason).toBe('Bad Request');
      }
    });

    it('returns a default reason if reason not provided and request failed', async () => {
      const transport = createTransport({}, req => {
        expect(req.category).toEqual(TRANSACTION_TRANSPORT_CATEGORY);
        expect(req.body).toEqual(serializeEnvelope(TRANSACTION_ENVELOPE));
        return resolvedSyncPromise({ statusCode: 500 });
      });
      try {
        await transport.send(TRANSACTION_ENVELOPE);
      } catch (res) {
        expect(res.status).toBe('failed');
        expect(res.reason).toBe('Unknown transport error');
      }
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

      function createTestTransport(
        initialTransportResponse: TransportMakeRequestResponse,
      ): [NewTransport, (res: TransportMakeRequestResponse) => void] {
        let transportResponse: TransportMakeRequestResponse = initialTransportResponse;

        function setTransportResponse(res: TransportMakeRequestResponse) {
          transportResponse = res;
        }

        const transport = createTransport({}, _ => {
          return resolvedSyncPromise(transportResponse);
        });

        return [transport, setTransportResponse];
      }

      it('back-off using Retry-After header', async () => {
        const { retryAfterSeconds, beforeLimit, withinLimit, afterLimit } = setRateLimitTimes();

        jest
          .spyOn(Date, 'now')
          // 1st event - isRateLimited - FALSE
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - updateRateLimits
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - isRateLimited - TRUE
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - isRateLimited - FALSE
          .mockImplementationOnce(() => afterLimit)
          // 3rd event - updateRateLimits
          .mockImplementationOnce(() => afterLimit);

        const [transport, setTransportResponse] = createTestTransport({
          headers: {
            'x-sentry-rate-limits': null,
            'retry-after': `${retryAfterSeconds}`,
          },
          statusCode: 429,
        });

        try {
          await transport.send(ERROR_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit).toISOString()}`);
        }

        setTransportResponse({ statusCode: 200 });

        try {
          await transport.send(ERROR_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit).toISOString()}`);
        }

        const res = await transport.send(ERROR_ENVELOPE);
        expect(res.status).toBe('success');
      });

      it('back-off using X-Sentry-Rate-Limits with single category', async () => {
        const { retryAfterSeconds, beforeLimit, withinLimit, afterLimit } = setRateLimitTimes();

        jest
          .spyOn(Date, 'now')
          // 1st event - isRateLimited - FALSE
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - updateRateLimits
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - isRateLimited - FALSE (different category)
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - isRateLimited - TRUE
          .mockImplementationOnce(() => withinLimit)
          // 4th event - isRateLimited - FALSE
          .mockImplementationOnce(() => afterLimit)
          // 4th event - updateRateLimits
          .mockImplementationOnce(() => afterLimit);

        const [transport, setTransportResponse] = createTestTransport({
          headers: {
            'x-sentry-rate-limits': `${retryAfterSeconds}:error:scope`,
            'retry-after': null,
          },
          statusCode: 429,
        });

        try {
          await transport.send(ERROR_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit).toISOString()}`);
        }

        setTransportResponse({ statusCode: 200 });

        try {
          await transport.send(TRANSACTION_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit).toISOString()}`);
        }

        try {
          await transport.send(ERROR_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit).toISOString()}`);
        }

        const res = await transport.send(TRANSACTION_ENVELOPE);
        expect(res.status).toBe('success');
      });

      it('back-off using X-Sentry-Rate-Limits with multiple categories', async () => {
        const { retryAfterSeconds, beforeLimit, withinLimit, afterLimit } = setRateLimitTimes();

        jest
          .spyOn(Date, 'now')
          // 1st event - isRateLimited - FALSE
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - updateRateLimits
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - isRateLimited - TRUE (different category)
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - isRateLimited - TRUE
          .mockImplementationOnce(() => withinLimit)
          // 4th event - isRateLimited - FALSE
          .mockImplementationOnce(() => afterLimit)
          // 4th event - updateRateLimits
          .mockImplementationOnce(() => afterLimit);

        const [transport, setTransportResponse] = createTestTransport({
          headers: {
            'x-sentry-rate-limits': `${retryAfterSeconds}:error;transaction:scope`,
            'retry-after': null,
          },
          statusCode: 429,
        });

        try {
          await transport.send(ERROR_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit).toISOString()}`);
        }

        try {
          await transport.send(ERROR_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit).toISOString()}`);
        }

        try {
          await transport.send(TRANSACTION_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(
            `Too many transaction requests, backing off until: ${new Date(afterLimit).toISOString()}`,
          );
        }

        setTransportResponse({ statusCode: 200 });

        const eventRes = await transport.send(ERROR_ENVELOPE);
        expect(eventRes.status).toBe('success');

        const transactionRes = await transport.send(TRANSACTION_ENVELOPE);
        expect(transactionRes.status).toBe('success');
      });

      it('back-off using X-Sentry-Rate-Limits with missing categories should lock them all', async () => {
        const { retryAfterSeconds, beforeLimit, withinLimit, afterLimit } = setRateLimitTimes();

        jest
          .spyOn(Date, 'now')
          // 1st event - isRateLimited - false
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - updateRateLimits
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - isRateLimited - true (event category)
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - isRateLimited - true (transaction category)
          .mockImplementationOnce(() => withinLimit)
          // 4th event - isRateLimited - false (event category)
          .mockImplementationOnce(() => afterLimit)
          // 4th event - updateRateLimits
          .mockImplementationOnce(() => afterLimit)
          // 5th event - isRateLimited - false (transaction category)
          .mockImplementationOnce(() => afterLimit)
          // 5th event - updateRateLimits
          .mockImplementationOnce(() => afterLimit);

        const [transport, setTransportResponse] = createTestTransport({
          headers: {
            'x-sentry-rate-limits': `${retryAfterSeconds}::scope`,
            'retry-after': null,
          },
          statusCode: 429,
        });

        try {
          await transport.send(ERROR_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit).toISOString()}`);
        }

        try {
          await transport.send(ERROR_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit).toISOString()}`);
        }

        try {
          await transport.send(TRANSACTION_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(
            `Too many transaction requests, backing off until: ${new Date(afterLimit).toISOString()}`,
          );
        }

        setTransportResponse({ statusCode: 200 });

        const eventRes = await transport.send(ERROR_ENVELOPE);
        expect(eventRes.status).toBe('success');

        const transactionRes = await transport.send(TRANSACTION_ENVELOPE);
        expect(transactionRes.status).toBe('success');
      });

      it('back-off using X-Sentry-Rate-Limits should also trigger for 200 responses', async () => {
        const { retryAfterSeconds, beforeLimit, withinLimit, afterLimit } = setRateLimitTimes();

        jest
          .spyOn(Date, 'now')
          // 1st event - isRateLimited - FALSE
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - updateRateLimits
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - isRateLimited - TRUE
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - isRateLimited - FALSE
          .mockImplementationOnce(() => afterLimit)
          // 3rd event - updateRateLimits
          .mockImplementationOnce(() => afterLimit);

        const [transport] = createTestTransport({
          headers: {
            'x-sentry-rate-limits': `${retryAfterSeconds}:error;transaction:scope`,
            'retry-after': null,
          },
          statusCode: 200,
        });

        try {
          await transport.send(ERROR_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit).toISOString()}`);
        }

        try {
          await transport.send(TRANSACTION_ENVELOPE);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(
            `Too many transaction requests, backing off until: ${new Date(afterLimit).toISOString()}`,
          );
        }
      });
    });
  });
});
