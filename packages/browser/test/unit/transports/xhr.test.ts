import { SentryError } from '@sentry/utils';
import { fakeServer, SinonFakeServer } from 'sinon';

import { Event, Response, Transports } from '../../../src';

const testDsn = 'https://123@sentry.io/42';
const storeUrl = 'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7';
const envelopeUrl = 'https://sentry.io/api/42/envelope/?sentry_key=123&sentry_version=7';
const tunnel = 'https://hello.com/world';
const eventPayload: Event = {
  event_id: '1337',
};
const transactionPayload: Event = {
  event_id: '42',
  type: 'transaction',
};

let server: SinonFakeServer;
let transport: Transports.BaseTransport;

describe('XHRTransport', () => {
  beforeEach(() => {
    server = fakeServer.create();
    server.respondImmediately = true;
    transport = new Transports.XHRTransport({ dsn: testDsn });
  });

  afterEach(() => {
    server.restore();
  });

  it('inherits composeEndpointUrl() implementation', () => {
    // eslint-disable-next-line deprecation/deprecation
    expect(transport.url).toBe(storeUrl);
  });

  describe('sendEvent()', () => {
    it('sends a request to Sentry servers', async () => {
      server.respondWith('POST', storeUrl, [200, {}, '']);

      const res = await transport.sendEvent(eventPayload);

      expect((res as Response).status).toBe('success');
      const request = server.requests[0];
      expect(server.requests.length).toBe(1);
      expect(request.method).toBe('POST');
      expect(JSON.parse(request.requestBody)).toEqual(eventPayload);
    });

    it('sends a request to tunnel if configured', async () => {
      transport = new Transports.XHRTransport({ dsn: testDsn, tunnel });
      server.respondWith('POST', tunnel, [200, {}, '']);

      await transport.sendEvent(eventPayload);

      expect(server.requests[0].url).toBe(tunnel);
    });

    it('rejects with non-200 status code', async () => {
      server.respondWith('POST', storeUrl, [403, {}, '']);

      try {
        await transport.sendEvent(eventPayload);
      } catch (res) {
        expect((res as Response).status).toBe(403);
        const request = server.requests[0];
        expect(server.requests.length).toBe(1);
        expect(request.method).toBe('POST');
        expect(JSON.parse(request.requestBody)).toEqual(eventPayload);
      }
    });

    it('should record dropped event when request fails', async () => {
      server.respondWith('POST', storeUrl, [403, {}, '']);

      const spy = jest.spyOn(transport, 'recordLostEvent');

      try {
        await transport.sendEvent(eventPayload);
      } catch (_) {
        expect(spy).toHaveBeenCalledWith('network_error', 'event');
      }
    });

    it('should record dropped event when queue buffer overflows', async () => {
      // @ts-ignore private method
      jest.spyOn(transport._buffer, 'add').mockRejectedValue(new SentryError('Buffer Full'));
      const spy = jest.spyOn(transport, 'recordLostEvent');

      try {
        await transport.sendEvent(transactionPayload);
      } catch (_) {
        expect(spy).toHaveBeenCalledWith('queue_overflow', 'transaction');
      }
    });

    it('passes in headers', async () => {
      transport = new Transports.XHRTransport({
        dsn: testDsn,
        headers: {
          Accept: 'application/json',
        },
      });

      server.respondWith('POST', storeUrl, [200, {}, '']);
      const res = await transport.sendEvent(eventPayload);
      const request = server.requests[0];

      expect((res as Response).status).toBe('success');
      const requestHeaders: { [key: string]: string } = request.requestHeaders as { [key: string]: string };
      expect(requestHeaders['Accept']).toBe('application/json');
    });

    describe('Rate-limiting', () => {
      it('back-off using Retry-After header', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        server.respondWith('POST', storeUrl, [429, { 'Retry-After': `${retryAfterSeconds}` }, '']);

        jest
          .spyOn(Date, 'now')
          // 1st event - _isRateLimited - false
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - _handleRateLimit
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - _isRateLimited - true
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - _isRateLimited - false
          .mockImplementationOnce(() => afterLimit)
          // 3rd event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBeUndefined();
          expect(server.requests.length).toBe(1);
        }

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for event requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(server.requests.length).toBe(1);
        }

        server.respondWith('POST', storeUrl, [200, {}, '']);

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).toBe('success');
        expect(server.requests.length).toBe(2);
      });

      it('back-off using X-Sentry-Rate-Limits with single category', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        server.respondWith('POST', storeUrl, [429, { 'X-Sentry-Rate-Limits': `${retryAfterSeconds}:error:scope` }, '']);
        server.respondWith('POST', envelopeUrl, [200, {}, '']);

        jest
          .spyOn(Date, 'now')
          // 1st event - _isRateLimited - false
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - _handleRateLimit
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - _isRateLimited - false (different category)
          .mockImplementationOnce(() => withinLimit)
          // 2nd event - _handleRateLimit
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - _isRateLimited - true
          .mockImplementationOnce(() => withinLimit)
          // 4th event - _isRateLimited - false
          .mockImplementationOnce(() => afterLimit)
          // 4th event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBeUndefined();
          expect(server.requests.length).toBe(1);
        }

        const transactionRes = await transport.sendEvent(transactionPayload);
        expect(transactionRes.status).toBe('success');
        expect(server.requests.length).toBe(2);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for event requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(server.requests.length).toBe(2);
        }

        server.respondWith('POST', storeUrl, [200, {}, '']);

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).toBe('success');
        expect(server.requests.length).toBe(3);
      });

      it('back-off using X-Sentry-Rate-Limits with multiple categories', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        server.respondWith('POST', storeUrl, [
          429,
          { 'X-Sentry-Rate-Limits': `${retryAfterSeconds}:error;transaction:scope` },
          '',
        ]);
        server.respondWith('POST', envelopeUrl, [200, {}, '']);

        jest
          .spyOn(Date, 'now')
          // 1st event - _isRateLimited - false
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - _handleRateLimit
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - _isRateLimited - true (event category)
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - _isRateLimited - true (transaction category)
          .mockImplementationOnce(() => withinLimit)
          // 4th event - _isRateLimited - false (event category)
          .mockImplementationOnce(() => afterLimit)
          // 4th event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit)
          // 5th event - _isRateLimited - false (transaction category)
          .mockImplementationOnce(() => afterLimit)
          // 5th event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBeUndefined();
          expect(server.requests.length).toBe(1);
        }

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for event requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(server.requests.length).toBe(1);
        }

        try {
          await transport.sendEvent(transactionPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for transaction requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(server.requests.length).toBe(1);
        }

        server.respondWith('POST', storeUrl, [200, {}, '']);
        server.respondWith('POST', envelopeUrl, [200, {}, '']);

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).toBe('success');
        expect(server.requests.length).toBe(2);

        const transactionRes = await transport.sendEvent(transactionPayload);
        expect(transactionRes.status).toBe('success');
        expect(server.requests.length).toBe(3);
      });

      it('back-off using X-Sentry-Rate-Limits with missing categories should lock them all', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        server.respondWith('POST', storeUrl, [429, { 'X-Sentry-Rate-Limits': `${retryAfterSeconds}::scope` }, '']);
        server.respondWith('POST', envelopeUrl, [200, {}, '']);

        jest
          .spyOn(Date, 'now')
          // 1st event - _isRateLimited - false
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - _handleRateLimit
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - _isRateLimited - true (event category)
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - _isRateLimited - true (transaction category)
          .mockImplementationOnce(() => withinLimit)
          // 4th event - _isRateLimited - false (event category)
          .mockImplementationOnce(() => afterLimit)
          // 4th event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit)
          // 5th event - _isRateLimited - false (transaction category)
          .mockImplementationOnce(() => afterLimit)
          // 5th event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBeUndefined();
          expect(server.requests.length).toBe(1);
        }

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for event requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(server.requests.length).toBe(1);
        }

        try {
          await transport.sendEvent(transactionPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for transaction requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(server.requests.length).toBe(1);
        }

        server.respondWith('POST', storeUrl, [200, {}, '']);
        server.respondWith('POST', envelopeUrl, [200, {}, '']);

        const eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).toBe('success');
        expect(server.requests.length).toBe(2);

        const transactionRes = await transport.sendEvent(transactionPayload);
        expect(transactionRes.status).toBe('success');
        expect(server.requests.length).toBe(3);
      });

      it('back-off using X-Sentry-Rate-Limits should also trigger for 200 responses', async () => {
        const retryAfterSeconds = 10;
        const beforeLimit = Date.now();
        const withinLimit = beforeLimit + (retryAfterSeconds / 2) * 1000;
        const afterLimit = beforeLimit + retryAfterSeconds * 1000;

        server.respondWith('POST', storeUrl, [200, { 'X-Sentry-Rate-Limits': `${retryAfterSeconds}:error:scope` }, '']);

        jest
          .spyOn(Date, 'now')
          // 1st event - _isRateLimited - false
          .mockImplementationOnce(() => beforeLimit)
          // 1st event - _handleRateLimit
          .mockImplementationOnce(() => beforeLimit)
          // 2nd event - _isRateLimited - true
          .mockImplementationOnce(() => withinLimit)
          // 3rd event - _isRateLimited - false
          .mockImplementationOnce(() => afterLimit)
          // 3rd event - _handleRateLimit
          .mockImplementationOnce(() => afterLimit);

        let eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).toBe('success');
        expect(server.requests.length).toBe(1);

        try {
          await transport.sendEvent(eventPayload);
          throw new Error('unreachable!');
        } catch (res) {
          expect((res as Response).status).toBe(429);
          expect((res as Response).reason).toBe(
            `Transport for event requests locked till ${new Date(afterLimit)} due to too many requests.`,
          );
          expect(server.requests.length).toBe(1);
        }

        server.respondWith('POST', storeUrl, [200, {}, '']);

        eventRes = await transport.sendEvent(eventPayload);
        expect(eventRes.status).toBe('success');
        expect(server.requests.length).toBe(2);
      });

      it('should record dropped event', async () => {
        // @ts-ignore private method
        jest.spyOn(transport, '_isRateLimited').mockReturnValue(true);

        const spy = jest.spyOn(transport, 'recordLostEvent');

        try {
          await transport.sendEvent(eventPayload);
        } catch (_) {
          expect(spy).toHaveBeenCalledWith('ratelimit_backoff', 'event');
        }

        try {
          await transport.sendEvent(transactionPayload);
        } catch (_) {
          expect(spy).toHaveBeenCalledWith('ratelimit_backoff', 'transaction');
        }
      });
    });
  });
});
