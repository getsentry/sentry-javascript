import { EventEnvelope, EventItem } from '@sentry/types';
import { createEnvelope, PromiseBuffer, resolvedSyncPromise, serializeEnvelope } from '@sentry/utils';

import {
  createTransport,
  ERROR_TRANSPORT_CATEGORY,
  MakeTransportRequest,
  TRANSACTION_TRANSPORT_CATEGORY,
  TransportMakeRequestResponse,
  TransportResponse,
} from '../../../src/transports/base';

const SUCCESS_REQUEST: MakeTransportRequest = _ => resolvedSyncPromise({ statusCode: 200 });

const ERROR_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

const TRANSACTION_ENVELOPE = createEnvelope<EventEnvelope>(
  { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' },
  [[{ type: 'transaction' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem],
);

describe('createTransport', () => {
  it('has $ property', () => {
    const transport = createTransport({}, SUCCESS_REQUEST);
    expect(transport.$).toBeDefined();
  });

  it('flushes the buffer', async () => {
    const mockBuffer: PromiseBuffer<TransportResponse> = {
      $: [],
      add: jest.fn(),
      drain: jest.fn(),
    };
    const transport = createTransport({}, SUCCESS_REQUEST, mockBuffer);
    expect(mockBuffer.drain).toHaveBeenCalledTimes(0);
    await transport.flush(1000);
    expect(mockBuffer.drain).toHaveBeenCalledTimes(1);
    expect(mockBuffer.drain).toHaveBeenLastCalledWith(1000);
  });

  describe('send', () => {
    it('constructs a request to send to Sentry', () => {
      const transport = createTransport({}, req => {
        expect(req.category).toEqual(ERROR_TRANSPORT_CATEGORY);
        expect(req.body).toEqual(serializeEnvelope(ERROR_ENVELOPE));
        return resolvedSyncPromise({ statusCode: 200 });
      });
      transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
    });

    describe('Rate-limiting', () => {
      it('back-off using Retry-After header', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

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

        let transportResponse: TransportMakeRequestResponse = {
          headers: {
            'retry-after': `${retryAfterSeconds}`,
          },
          statusCode: 429,
        };
        const transport = createTransport({}, _ => {
          return resolvedSyncPromise(transportResponse);
        });

        try {
          await transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit)}`);
        }

        // clear rate-limit headers and statusCode
        transportResponse = {
          statusCode: 200,
        };
        try {
          await transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit)}`);
        }

        const res = await transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
        expect(res.status).toBe('success');
      });

      it('back-off using X-Sentry-Rate-Limits with single category', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

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
        let transportResponse: TransportMakeRequestResponse = {
          headers: {
            'x-sentry-rate-limits': `${retryAfterSeconds}:error:scope`,
          },
          statusCode: 429,
        };
        const transport = createTransport({}, _ => {
          return resolvedSyncPromise(transportResponse);
        });

        try {
          await transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit)}`);
        }

        transportResponse = {
          statusCode: 200,
        };

        try {
          await transport.send(TRANSACTION_ENVELOPE, TRANSACTION_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit)}`);
        }

        try {
          await transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit)}`);
        }

        const res = await transport.send(TRANSACTION_ENVELOPE, TRANSACTION_TRANSPORT_CATEGORY);
        expect(res.status).toBe('success');
      });

      it('back-off using X-Sentry-Rate-Limits with multiple categories', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

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

        let transportResponse: TransportMakeRequestResponse = {
          headers: {
            'x-sentry-rate-limits': `${retryAfterSeconds}:error;transaction:scope`,
          },
          statusCode: 429,
        };

        const transport = createTransport({}, _ => {
          return resolvedSyncPromise(transportResponse);
        });

        try {
          await transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit)}`);
        }

        try {
          await transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit)}`);
        }

        try {
          await transport.send(TRANSACTION_ENVELOPE, TRANSACTION_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many transaction requests, backing off until: ${new Date(afterLimit)}`);
        }

        transportResponse = {
          statusCode: 200,
        };

        const eventRes = await transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
        expect(eventRes.status).toBe('success');

        const transactionRes = await transport.send(TRANSACTION_ENVELOPE, TRANSACTION_TRANSPORT_CATEGORY);
        expect(transactionRes.status).toBe('success');
      });

      it('back-off using X-Sentry-Rate-Limits with missing categories should lock them all', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

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

        let transportResponse: TransportMakeRequestResponse = {
          headers: {
            'x-sentry-rate-limits': `${retryAfterSeconds}::scope`,
          },
          statusCode: 429,
        };

        const transport = createTransport({}, _ => {
          return resolvedSyncPromise(transportResponse);
        });

        try {
          await transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit)}`);
        }

        try {
          await transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit)}`);
        }

        try {
          await transport.send(TRANSACTION_ENVELOPE, TRANSACTION_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many transaction requests, backing off until: ${new Date(afterLimit)}`);
        }

        transportResponse = {
          statusCode: 200,
        };

        const eventRes = await transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
        expect(eventRes.status).toBe('success');

        const transactionRes = await transport.send(TRANSACTION_ENVELOPE, TRANSACTION_TRANSPORT_CATEGORY);
        expect(transactionRes.status).toBe('success');
      });

      it('back-off using X-Sentry-Rate-Limits should also trigger for 200 responses', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

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

        const transportResponse: TransportMakeRequestResponse = {
          headers: {
            'x-sentry-rate-limits': `${retryAfterSeconds}:error;transaction:scope`,
          },
          statusCode: 200,
        };

        const transport = createTransport({}, _ => {
          return resolvedSyncPromise(transportResponse);
        });

        try {
          await transport.send(ERROR_ENVELOPE, ERROR_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many error requests, backing off until: ${new Date(afterLimit)}`);
        }

        try {
          await transport.send(TRANSACTION_ENVELOPE, TRANSACTION_TRANSPORT_CATEGORY);
        } catch (res) {
          expect(res.status).toBe('rate_limit');
          expect(res.reason).toBe(`Too many transaction requests, backing off until: ${new Date(afterLimit)}`);
        }
      });
    });
  });
});
